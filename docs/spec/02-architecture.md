# 02: Architecture and shared contracts

## 1. Stack (pinned majors; use the latest minor at scaffold time)

| Concern | Choice |
|---|---|
| Runtime / package manager | Node 24 LTS, **pnpm 10** workspaces |
| Language | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true` |
| Web app | React 19, Vite (current major), React Router 7 (library mode), **Tailwind CSS v4** plus CSS variables for design tokens |
| State | Zustand for ephemeral UI state; **Dexie 4** (`useLiveQuery`) for persisted state |
| Animation | **Motion** (`motion/react`) for DOM/SVG; **PixiJS v8**, lazy-loaded, only for particle-heavy mini-games and celebrations |
| Drag/tap interactions | A shared pointer-events primitive in `packages/ui` (`useDragToTarget`, `useTapToPlace`); no DnD library |
| PWA | `vite-plugin-pwa` (Workbox `injectManifest`); app shell, content and audio precached |
| API | **Hono** on **Cloudflare Workers**, **D1** with **Drizzle ORM**; local via `wrangler dev` (Miniflare, local D1) |
| Validation | **Zod 4** for content schemas, API DTOs and stored settings |
| Unit tests | **Vitest** (+ `@cloudflare/vitest-pool-workers` for the API), **fast-check** for property tests |
| Component dev | **Storybook** (React + Vite) for widgets, avatar and art kit |
| E2E | **Playwright**: Chromium desktop plus an Android-tablet emulation (`Galaxy Tab S9` / custom 1280×800 @2x, touch) |
| Lint/format | **Biome** (lint + format) |
| CI | GitHub Actions: required jobs `verify`, `e2e`, `bundle-size`; non-required `visual` and `nightly` (09 §2) |
| Fonts | Self-hosted via `@fontsource`: **Andika** (body; designed for early readers) and **Baloo 2** (display). Both SIL OFL. |

Nothing loads from a CDN at runtime. No third-party analytics, ads or tracking SDKs, ever.

## 2. Repository layout

```
apps/
  web/                  React PWA: child game + parent area
    src/app/            routes, providers, layout, session lifecycle
    src/island/         island hub, map, building, residents, festivals
    src/workshops/<id>/ one folder per workshop (module contract §5.6)
    src/parent/         parent gate, dashboard, settings, setup wizard
    src/data/           Dexie db, repositories, sync client, event folding
    src/audio/          AudioManager wiring, narration lookup
    src/sw.ts           service worker
  api/                  Hono Worker: auth, pairing, sync, AI proxy, static assets in prod
    src/routes/  src/db/ (drizzle schema + migrations)  src/ai/ (providers)  wrangler.jsonc
packages/
  shared/               ALL cross-package types + Zod schemas: ids, events, content types (Skill, ItemTemplate,
                        ItemFormat, WidgetConfig, AnswerSpec, ResponseValue…), GameData, settings, API DTOs,
                        numberClips (narration number composition)
  content/              YAML sources + compiler → dist/*.json (skills, templates, narration, graph, game…)
    src/compile/  skills/<strand>.yaml  templates/<strand>.yaml  misconceptions/*.yaml  narration/*.yaml  game/*.yaml
  engine/               pure TS, no DOM, no React: rng, generators, checking, learner model,
                        scheduler, placement, session planner, island economy rules
  ui/                   design tokens, primitives, math widgets, avatar renderer, art kit (SVG), sfx
tools/
  narration/            extract narration lines → render (07 §3) → apps/web/public/audio/ + manifest.json
  content-check/        engine-dependent content validators V13–V15, V22, V25 + template-stats.json (03 §9.2)
  content-draft/        (optional) LLM-assisted drafting helpers with human review
e2e/                    Playwright specs + fixtures
docs/                   research/, spec/, build/
```

Dependency direction (enforced with Biome `noRestrictedImports` or a lint script): `shared` ← `content` ← `engine` ← `ui` ← `web`; `shared`, `engine` ← `api`; `shared`, `content`, `engine` ← `tools/*`. (`content` imports only `shared`; `engine` reads compiled content data through `shared` types and never imports content's compiler.) `shared`, `content` and `engine` must never import React, Dexie or browser globals. The engine also runs in the API (for server-side validation) and in tests.

## 3. Runtime topology

**Local (v1 target):**
- `pnpm dev` starts Vite (`:5173`) and `wrangler dev` (`:8787`). Vite proxies `/api/*` → `:8787`, so the browser sees one origin.
- `pnpm dev:lan` binds to `0.0.0.0` so a tablet on the home Wi-Fi can open `http://<laptop-ip>:5173`. Service workers need a secure context: document both `chrome://flags/#unsafely-treat-insecure-origin-as-secure` for LAN testing and the `pnpm dev:https` option (self-signed via `@vitejs/plugin-basic-ssl`).
- `pnpm preview:full` builds the web app and serves it **from the Worker** (`wrangler dev` with static assets) to rehearse the production topology.

**Later (deploy):** one Worker serves static assets plus `/api`, D1 is bound, secrets come from `wrangler secret`. Same origin, so there are no third-party cookie issues.

**Offline:** the app is fully playable with no API: content, audio and engine are local, and progress goes into Dexie. Sync, AI feedback, photo-to-avatar and parent summaries need the API. Each degrades gracefully (§08, §07).

## 4. Data model: one family event log

All durable state that kids create is an **append-only event log**. Projections (skill states, island, inventory, collection) are pure folds over it. Sync is a set union of events, so it never conflicts. Mutable *settings* are the only exception: small documents resolved last-writer-wins by `updatedAt`.

### 4.1 Ids

- `EventId`: UUIDv7 (time-ordered; `uuidv7` package).
- `ChildId`, `DeviceId`, `FamilyId`: UUIDv7.
- `SkillId`: `^[A-Z]{2,4}\.\d{2}$` (e.g. `CPS.03`); never reused.
- `TemplateId`: `${SkillId}.t${n}` (e.g. `CPS.03.t2`).
- `MisconceptionId`: `MC.kebab-case`.
- `WorkshopId`, `MaterialId`, `BuildingId`, `ResidentId`, `DecorId`: kebab-case strings defined in content/game data.

### 4.2 Event envelope (`packages/shared/src/events.ts`)

```ts
export interface EventEnvelope<T extends EventType = EventType> {
  id: EventId;            // uuidv7
  familyId: FamilyId;
  childId: ChildId | null; // null for family-level events (island shared actions by parent, settings)
  deviceId: DeviceId;
  ts: number;             // ms epoch, device clock (server may clamp, 08 §4)
  clientTs?: number;      // set by the server only when it clamped ts; original device time
  type: T;
  v: 1;                   // payload schema version
  payload: EventPayloads[T];
  contentVersion: string; // packages/content build hash
}

export type EventType =
  | 'session.started' | 'session.ended'
  | 'attempt'                    // one response to one item (see AttemptPayload)
  | 'hint.used'
  | 'lesson.step'                // worked/faded example progress
  | 'placement.probe'            // placement answers (also emit 'attempt')
  | 'placement.completed'        // initial or per-strand placement finished (posterior persisted)
  | 'skill.override'             // parent marks mastered / reset (audited)
  | 'request.accepted' | 'request.completed'
  | 'material.produced' | 'material.spent'
  | 'building.placed' | 'building.upgraded' | 'decor.placed' | 'decor.moved' | 'decor.removed'
  | 'island.named' | 'road.extended'
  | 'resident.arrived' | 'collection.unlocked'
  | 'festival.started' | 'festival.completed'
  | 'gift.left' | 'gift.opened'
  | 'milestone.defined' | 'milestone.reached'
  | 'goal.progress'
  | 'avatar.updated'
  | 'ai.feedback.shown'          // the AI line text itself stays in the local aiLog
  | 'child.deleted';             // tombstone (08 §4)

// Payload shapes for every type are in §5.8 (EventPayloads).

export interface AttemptPayload {
  sessionId: string;
  skillId: SkillId;
  templateId: TemplateId;
  seed: number;
  params: Record<string, number | string | boolean>;
  format: ItemFormat;
  tier: 'concrete' | 'pictorial' | 'abstract';
  representation: Representation; // template's representation (explicit or the format default); 04 §3 counts these
  response: ResponseValue;        // see §5.2
  correct: boolean;
  partialCredit: number;          // 0..1, written by the TaskRunner: 1 correct, 0.5 correct with hints, 0 wrong
  latencyMs: number;              // from item ready (prompt narration finished) to submit (same definition as 03 §3.1)
  hintsUsed: number;
  attemptNo: number;              // 1 = first try on this item
  misconceptionIds: MisconceptionId[]; // checkResponse matches ∪ detectProcessMisconceptions
  context: 'lesson' | 'practice' | 'review' | 'warmup' | 'placement' | 'challenge' | 'transfer-probe';
  workshopId: WorkshopId | null;
}
```

Payload schemas live next to the types as Zod schemas (`eventSchemas[type]`, §5.8). **Forward compatibility:** readers (client folds and the server) must ignore unknown event types and unknown payload fields. The server validates the **envelope** strictly and the **payloads of known types** strictly (unknown fields are stripped); events of unknown types are stored opaquely (payload ≤ 8 KB) and relayed to other devices unchanged (08 §4).

### 4.3 Projections (folds), all in `packages/engine`

- `foldSkillStates(events, graph, now) → Map<SkillId, SkillState>` (04 §2)
- `foldIsland(events, gameData) → IslandState` (buildings, decor positions (LWW by ts then id), residents, road, projects, festival state)
- `foldInventory(events) → InventoryState`: family-wide Storehouse. **Buildings are never un-built**: `building.placed`/`upgraded` always apply. The inventory projection clamps each material at 0, so a concurrent sibling spend can at worst make a build "free", never negative or reverted.
- `foldCollection(events, gameData) → CollectionState`; `foldGoals(events, settings) → WeeklyGoalState`

All projection types are defined in §5.8.

Folds must be **deterministic, order-independent given the same set** (sort by `ts`, then `id`; E02 reads `ts` as the event time `clientTs ?? ts`, see below) and incrementally updatable (`applyEvent(state, e)`). The client caches projections in Dexie and rebuilds from scratch when `contentVersion` or the engine fold version changes.

**Learner fold as implemented (E02, 2026-11-18).** No `packages/shared` type changes. `foldSkillStates(events, graph, now, opts?)` takes an optional `opts: { childId?, isK?, params? }`: the family log holds every child's events, so `childId` names the child (it may be omitted only when the events hold one child), and `isK` selects the K columns of 04 (expected latency and fluency × 1.5). Transitions are event-driven, so `now` does not change the fold; statuses at `now` come from `LearnerModel.status`. The engine also exports `foldLearnerState(events, graph, opts) → LearnerState` (what the planner reads), `applyLearnerEvent(model, state, e)` (the incremental step), `buildSkillGraph(...)` (builds the §5.8 `SkillGraph` from `skills.json`, `templates.json`, `graph.json` and `template-stats.json`), and `createEloFireModel(graph, { childId, isK })` (the `LearnerModel`, bound to one graph and child, because `apply` receives neither). Events the learner fold reads: `attempt`, `placement.probe`, `placement.completed`, `skill.override`, `session.started`, and a `child.deleted` for the child. A tombstone is permanent: the child's projection stays empty whatever the timestamps of its other events. Child ids are compared case-insensitively (08 §4). **Event time:** every fold orders and times an event by its device time, `clientTs ?? ts`. A server-clamped copy (08 §4) keeps the device time in `clientTs`, while the originating device keeps its own copy, whose `ts` is that same time (the sync response never returns the clamped copy to its origin). Folding by device time makes both copies fold identically, so every device converges on the same projection without replaying anything. The server's clamp still bounds `ts` for storage and paging. Every fold keeps each event id once, preferring the copy with `clientTs`. The incremental step applies each id once, and the client store, which is keyed by id, guarantees that.

### 4.4 Dexie schema (`apps/web/src/data/db.ts`)

```
events:      id, [familyId+ts], [childId+ts], type, synced(0|1)
projections: key (e.g. "skills:<childId>", "island", "inventory") → { version, upToEventId, data }
profiles:    childId → ChildProfile (§5.8)
settings:    key ("family" | "child:<childId>") → { value: FamilySettings | ChildSettings, updatedAt }   // LWW per document (§5.8)
device:      singleton → { deviceId, familyId, deviceToken?, pairedAt }
aiLog:       id → { ts, childId, skillId, text }   // every AI line shown (parent audit, 90-day retention)
syncState:   singleton → { cursor, lastSyncAt, lastError }
```

Call `navigator.storage.persist()` on first run. Export/import produces one JSON file (events + settings + profiles) for backup.

## 5. Shared contracts

These are the interfaces parallel work streams code against. Changing one requires updating this doc in the same PR.

All types in §5 are declared, with their Zod schemas, in **`packages/shared`** (behaviour such as `generateItem` is implemented in `packages/engine`). F01 lands every type in §5.1–§5.8 before wave 1 starts.

### 5.1 Content types (`packages/shared/src/content.ts`; compiled by `packages/content`)

```ts
export interface Skill {
  id: SkillId; name: string; strand: StrandId;
  kind: 'concept' | 'procedure' | 'strategy' | 'fact-fluency' | 'problem-solving';
  grade: 'K' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | 'HS'; // label only
  standards: { ccss: string[]; wi?: string[]; supports?: string[] }; // supports: trajectory tags, not counted for coverage
  prerequisites: SkillId[];                 // hard edges (DAG)
  encompasses: Record<SkillId, number>;     // 0..1 implicit-review weights
  related: SkillId[];                       // soft, for interleaving
  gateway: boolean;                         // stricter mastery (04 §3)
  representations: Representation[];        // ordered concrete → abstract
  templates: TemplateId[];
  lesson: LessonSpec;                        // worked example + faded steps (03 §6)
  fluency?: { medianLatencyMs: number };    // fact-fluency skills only
  misconceptions: MisconceptionId[];
  narration: { intro: NarrationKey };
}

export interface ItemTemplate {
  id: TemplateId; skillId: SkillId; format: ItemFormat;
  tier: 'concrete' | 'pictorial' | 'abstract';
  representation?: Representation;          // default: the format's default representation (03 §5.5)
  expectedLatencyMs?: number;               // default 8,000 abstract / 12,000 manipulative (04 §2.3)
  generator: GeneratorId;                    // registered TS generator (03 §5)
  params: Record<string, ParamSpec>;         // ranges / choices, consumed by the generator
  constraints?: string[];                    // documented; enforced inside the generator
  difficulty: { base: number; features: Record<string, number> }; // LLTM-style, 04 §2.2
  narration: { prompt: NarrationKey; hints: NarrationKey[] };
  distractors?: { rule: MisconceptionId; }[];
}
```

### 5.2 Items and responses (types in `packages/shared/src/items.ts`; functions implemented in `packages/engine/src/items/`)

```ts
export type ItemFormat =
  | 'tap-count' | 'make-set' | 'dot-flash' | 'numeral-pick' | 'number-pad'
  | 'compare' | 'order' | 'tenframe-fill' | 'number-bond' | 'rekenrek'
  | 'number-line-place' | 'number-line-jump' | 'hundred-chart'
  | 'base-ten-build' | 'base-ten-trade' | 'expanded-form'
  | 'array-build' | 'equal-groups' | 'equal-share'
  | 'fraction-cut' | 'fraction-pick' | 'fraction-line'
  | 'clock-set' | 'clock-read' | 'coin-pay' | 'coin-count' | 'make-change'
  | 'measure-length' | 'compare-length' | 'area-tiles' | 'perimeter-walk'
  | 'shape-compose' | 'shape-sort' | 'pattern-extend' | 'balance'
  | 'bar-graph-read' | 'bar-graph-build' | 'story-problem' | 'puzzle-grid';

export interface GeneratedItem {
  templateId: TemplateId; skillId: SkillId; seed: number;
  format: ItemFormat; tier: Tier;
  params: Record<string, number | string | boolean>;
  prompt: { narration: NarrationKey; vars: Record<string, string | number>; text: string };
  widget: WidgetConfig;          // discriminated union by format; everything the widget needs to render
  answer: AnswerSpec;            // never sent to the UI layer as text (the UI calls engine.check)
  hints: HintStep[];             // graded ladder: nudge → representation → worked step
  difficulty: number;            // computed logit, 04 §2.2
}

export type ResponseValue =
  | { kind: 'number'; value: number }
  | { kind: 'numbers'; values: number[] }
  | { kind: 'choice'; id: string }
  | { kind: 'placement'; value: number }              // number-line position
  | { kind: 'state'; value: Record<string, unknown> } // manipulative end state (e.g. blocks, clock hands)
  | { kind: 'skip' };                                 // "I haven't learned this yet"

export interface CheckResult {
  correct: boolean; partialCredit: number;
  misconceptionIds: MisconceptionId[]; // buggy-rule matches
  feedback: FeedbackKey;               // deterministic feedback narration key
  closeness?: number;                  // 0..1 for estimation formats
}

export function generateItem(t: ItemTemplate, seed: number, target?: { difficulty: number }): GeneratedItem;
export function checkResponse(item: GeneratedItem, r: ResponseValue): CheckResult;
export function detectProcessMisconceptions(item: GeneratedItem, r: ResponseValue,
  meta: { latencyMs: number; trace?: InteractionEvent[] }): MisconceptionId[]; // process errors and strategy praise (03 §5.7, §7.1)
```

The supporting types `Tier`, `Representation`, `ParamSpec`, `GeneratorId`, `WidgetConfig`, `AnswerSpec`, `HintStep`, `LessonSpec`, `NarrationKey`, `FeedbackKey`, `StrandId` and `InteractionEvent` are defined in **03-curriculum §1, §5.1, §5.2 and §6.1**, and declared in `packages/shared` exactly as written there.

`WidgetConfig` and the per-format answer semantics are specified in 03 §5. **Each `ItemFormat` has exactly one widget** in `packages/ui/widgets`. Workshops may theme widgets but must not reimplement their interaction logic.

### 5.3 Learner model (`packages/engine/src/learner`)

```ts
export interface LearnerModel {
  readonly id: 'elo-fire-v1' | string;
  init(graph: SkillGraph, prior: PlacementPrior | null): LearnerState;
  apply(state: LearnerState, attempt: AttemptPayload, ts: number): LearnerState; // pure
  predict(state: LearnerState, skill: SkillId, itemDifficulty: number): number;  // P(correct)
  status(state: LearnerState, skill: SkillId, now: number): SkillStatus;
  dueReviews(state: LearnerState, now: number): DueReview[];
  frontier(state: LearnerState): SkillId[];
}
export type SkillStatus = 'locked'|'ready'|'learning'|'practiced'|'fluent'|'mastered'|'needs-review';
```

### 5.4 Session planner (`packages/engine/src/planner`)

```ts
export function planSession(input: {
  child: ChildContext; state: LearnerState; graph: SkillGraph; now: number;
  minutes: number; workshopsAvailable: WorkshopCapability[]; island: IslandState;
}): SessionPlan;

export interface SessionPlan {
  requests: PlannedRequest[];   // 2–3 offered at a time; the child picks (autonomy)
  warmup: PlannedTask;          // easy win first
  windDownAtMs: number;
}
export interface PlannedRequest {
  id: string; residentId: ResidentId; workshopId: WorkshopId;
  tasks: PlannedTask[];         // the item sequence (new skill + interleaved review), 2–4 min
  reward: { materials: Recipe; decor?: DecorId[]; unlocks?: string[] }; // materials = direct product, ≈ 1 per item
  narration: NarrationKey; vars: Record<string, string | number>;
}
export interface PlannedTask { skillId: SkillId; templateId: TemplateId; seed: number; context: AttemptPayload['context']; mode: 'lesson'|'item'; }

// Difficulty is chosen at presentation time, not planning time:
export function targetDifficulty(state: LearnerState, skill: SkillId,
  context: AttemptPayload['context'], child: ChildContext): number; // d* incl. the rolling offset (04 §2.4)

export function adaptNext(input: AdaptInput): AdaptDecision;          // types in §5.8
```

The planner is pure. **Re-planning:** the app calls `planSession` at session start and again after each request completes (with the updated state), so later requests reflect what just happened. Between items, the `TaskRunner` calls `adaptNext`, which can make the remaining tasks in a request adapt: step down a CPA tier, insert a prerequisite probe, or stop early on frustration (04 §6.4).

### 5.5 Audio (`packages/ui/src/audio`)

```ts
export interface AudioManager {
  unlock(): Promise<void>;                               // call on first user gesture
  say(key: NarrationKey, vars?: Record<string, string|number>): Promise<void>; // stitches clips
  sayPhrases(parts: ({ id: string } | { number: number })[]): Promise<void>; // AI phrase-bank lines (pre-rendered clips)
  sayText(text: string, opts?: { voice?: 'glim' | 'narrator' }): Promise<void>; // on-device Web Speech only (no cloud TTS)
  sfx(id: SfxId): void;
  music(track: MusicId | null): void;
  stop(): void;
  setVolumes(v: { voice: number; sfx: number; music: number }): void;
}
```

Narration keys resolve through `packages/content/dist/narration.json`: `{ key: { text, say?, voice?, clips: string[] } }`, where `clips` may contain slot tokens `$var[|type[:countVar]]` (03 §8.4). The suffix grammar is defined in 03 §8.4: after `noun`, `unit` and `shape` the suffix is the count variable, and after `dec` it is the number of decimal places (`$v|dec:1`, `$v|dec:2`), not a count variable. Number words are composed from pre-rendered clips ("twenty" + "three") by `numberClips(n)` in `packages/shared/src/narration/numberClips.ts` (|n| ≤ 1,000,000, 03 §8.3). Clip ids resolve to files through **`apps/web/public/audio/manifest.json`** (`{ version, clips: Record<ClipId, { file: string; durationMs: number }> }`, file names content-hashed), produced by `tools/narration` (A02). **Voice-qualified clip ids** (#50): a line's own static clips (`<key>#<i>`) are rendered in its voice, but clip-set words (03 §8.3) are shared by every line. Their ids carry no voice for the narrator (`num.23#0`, as before) and a `<voice>:` prefix for Pip and Glim (`pip:num.23#0`, `glim:num.23.end#0`), built by `voiceClipId(clip, voice)` in `packages/shared/src/audio.ts`. When the AudioManager stitches a clip-set word into a Pip or Glim line (`say` of a key whose `voice` is `pip` or `glim`, and every `sayPhrases` line, which is Glim's), it tries the voice's clip first and then the narrator's: `pip:num.23.end#0`, `pip:num.23#0`, `num.23.end#0`, `num.23#0`. Keeping one voice for the word beats the `.end` intonation. A missing voice clip therefore falls back to the narrator's clip, not to Web Speech. Which clip sets get per-voice copies is set in `narration/voices.yaml` (`voiceClipSets`, 07 §3). Rendered Opus audio is **committed** to the repo, so a fresh clone has narration without any key (expected ≈ 15–40 MB for K–3). The AudioManager tolerates a missing manifest or clip: it falls back to Web Speech for that line and logs a dev warning.

### 5.6 Workshop module contract (`apps/web/src/workshops/<id>/index.ts`)

```ts
export interface WorkshopDefinition {
  id: WorkshopId; name: string;
  formats: ItemFormat[];                 // which item formats this workshop can host
  strands: StrandId[];                   // for planner affinity and island layout
  building: BuildingId;                  // art, footprint, levels and unlock rule come from GameData (§5.8)
  produces: MaterialId[];                // [] for Puzzle Tower (decor rewards); Practice Pier produces whatever the request asks for
  load: () => Promise<{ default: React.ComponentType<WorkshopProps> }>; // lazy
}
export interface WorkshopProps {
  request: PlannedRequest;
  runner: TaskRunner;                     // provided by the app; wraps engine + logging + AI feedback
  avatar: AvatarSpec; audio: AudioManager;
  onExit(reason: 'completed' | 'child-exit' | 'wind-down'): void;
}
export interface TaskRunner {
  current(): RunnerTask | null;            // lesson step or GeneratedItem (+ widget config)
  submit(r: ResponseValue, meta: { latencyMs: number; trace?: InteractionEvent[] }): Promise<RunnerFeedback>;
  hint(): HintStep | null;
  next(): RunnerTask | null;               // after feedback; may adapt (04 §6)
  progress(): { done: number; total: number; materialEarned: number };
}
export interface RunnerFeedback extends CheckResult {
  say: { key?: NarrationKey; text?: string }; // deterministic key now; AI text may arrive later via onAiFeedback
  onAiFeedback(cb: (line: AiFeedbackLine) => void): void;   // §5.8; delivered only within the 5 s window (07 §2)
  retry: boolean;                              // allow another attempt on the same item
}
```

The app owns the `TaskRunner`, so every workshop gets logging, mastery updates, hints, misconception handling, AI feedback and wind-down the same way. A workshop only renders the world, the widget and the celebration.

### 5.7 API DTOs (`packages/shared/src/api.ts`)

See 08 §2 for routes. Every request and response body has a Zod schema in `shared`. The API validates with `@hono/zod-validator`; the client parses responses with the same schemas.

### 5.8 Supporting types (`packages/shared/src/*`)

Every type referenced elsewhere in §4–§5 is defined here or in 03 (§5.2 note). Field names are binding. Implementations may add **private** fields (prefixed `_`) but must not change these.

```ts
// ---------- basics ----------
export type Grade = 'K' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | 'HS';
export type AgeBand = '5-6' | '7-8' | '9-10' | '11-12' | '13-14';
export type Recipe = Partial<Record<MaterialId, number>>;            // material → count
export type Plot = [x: number, y: number];                            // island grid cell (12 × 8 in v1)
export type LessonPhase = 'intro' | 'worked' | 'faded' | 'scaffolded' | 'outro';   // 03 §6.2

// ---------- children, profiles, settings ----------
export interface ChildProfile {
  id: ChildId; familyId: FamilyId;
  name: string;                     // first name or nickname; never sent to AI providers
  birthYear: number; grade: Grade;
  advanced: boolean;                // "working above grade": shifts placement priors (04 §5)
  avatar: AvatarSpec;
  picturePasswordHash: string | null; // salted local hash (08 §3)
  createdAt: number; updatedAt: number; deletedAt?: number;
}
export interface ChildContext {     // what pure engine functions need about a child
  childId: ChildId; grade: Grade; ageBand: AgeBand; advanced: boolean;
  isK: boolean;                     // grade === 'K' → K columns of 04 tables
  settings: ChildSettings;
}
export interface FamilySettings {
  'ai.feedback': boolean;  'ai.feedbackMode': 'phrases' | 'text';
  'ai.avatarPhoto': boolean;  'ai.parentSummary': boolean;   // all AI flags default false (07 §8.6)
  music: boolean;
  volumes: { voice: number; sfx: number; music: number };      // 0..1
  voiceRate: number;                                           // 0.8..1.2, applies to Web Speech + playbackRate
  freeBuildAfterSession: boolean;                              // 05 §8
  timezone: string;                                            // IANA, for weekly goals and quiet hours
}
export interface ChildSettings {
  sessionMinutes: number;           // 5..30; default K 10, G1–2 15, G3 20 (04 §6.1)
  dailyCapMinutes: number | null;
  quietHours: { start: string; end: string } | null;           // "HH:MM" local
  timedChallenges: boolean;         // ignored (always off) when isK
  captions: boolean;                // default: K false, G1+ true
  tapOnly: boolean; snapRadiusPx: number;                      // 06 §7 motor settings (default false, 48)
  speakOnTap: boolean;              // tapping numbers/coins speaks names (default true)
  weeklyGoal: number;               // requests per week (default K 5, G1+ 6)
}
// Dexie/D1 settings documents: key "family" → FamilySettings; key "child:<childId>" → ChildSettings.
// LWW per whole document by updatedAt (08 §4). Defaults are filled by `withSettingDefaults()`.

// ---------- avatar (05 §9, 07 §4) ----------
export interface AvatarSpec {
  skinTone: `s${string}`;           // 's01'..'s12'
  faceShape: string;  hairStyle: string;  hairColor: string;     // option ids from shared/avatar/options.ts
  eyeShape: string;  eyeColor: string;  eyebrows: string;
  glasses: string | null;  freckles: boolean;  beautyMark: boolean;
  top: string; topColor: string; bottom: string; bottomColor: string; shoes: string; shoesColor: string;
  hat: string | null; accessory: string | null;                  // unlockable
  buddy: ResidentId;                                             // starter Pebbling
}
export type AvatarSuggestion = Pick<AvatarSpec,
  'skinTone' | 'hairStyle' | 'hairColor' | 'eyeColor' | 'eyebrows' | 'glasses' | 'freckles'>; // 07 §4 output

// ---------- game data (authored in packages/content/game/*.yaml → dist/game.json) ----------
export type UnlockRule =
  | { start: true }
  | { all: UnlockRule[] } | { any: UnlockRule[] }
  | { skill: SkillId; atLeast: 'ready' | 'practiced' | 'mastered' }      // satisfied when ANY child reaches it
  | { skillKind: Skill['kind']; atLeast: 'practiced' | 'mastered' }       // any skill of that kind, any child
  | { minGrade: Grade }                                                    // any child's profile grade ≥
  | { masteredCount: number }                                             // any single child
  | { building: BuildingId; level?: 1 | 2 | 3 }
  | { roadLength: number } | { residentCount: number };
// Unlocks are FAMILY-WIDE: once satisfied, the building/workshop is available to every child.

export interface GameData {
  materials: { id: MaterialId; name: NarrationKey; art: string }[];
  buildings: BuildingDef[];
  residents: ResidentDef[];
  decor: { id: DecorId; art: string; footprint: [number, number]; source: 'starter' | 'project' | 'festival' | 'gift' | 'puzzle' }[];
  outfits: { option: string; unlock: UnlockRule }[];             // avatar options that start locked
  island: { grid: [12, 8]; rings: { plots: Plot[]; unlock: UnlockRule }[];
            road: { n: number; plot: Plot }[] };                   // stone n → plot (n up to 1000)
  festivals: { id: string; kind: 'festival' | 'storm-watch'; everyDaysOfPlay: number; rewardDecor: DecorId[] }[];
}
export interface BuildingDef {
  id: BuildingId; kind: 'workshop' | 'home' | 'storehouse' | 'landmark' | 'project';
  workshopId?: WorkshopId;          // kind 'workshop'
  art: string; footprint: [number, number];
  unlock: UnlockRule;
  levels: { level: 1 | 2 | 3; recipe: Recipe; unlocks: string[] }[];  // level 1 recipe = build cost
  shared?: boolean;                 // co-op project needing both children's materials (05 §6)
}
export interface ResidentDef {
  id: ResidentId; name: string; species: string; number: number | null; // quantity shown in the shell (05 §5)
  family?: 'tens' | 'hundreds' | 'fraction' | 'clock' | 'coin';
  palette: string; lines: NarrationKey[];  affinity: WorkshopId[];
  arrival: { via: 'start' | 'home' | 'ferry'; home?: BuildingId; unlock: UnlockRule };
  starterBuddy: boolean;
}

// ---------- projections ----------
export interface IslandState {
  name: string | null;
  ringsUnlocked: number;  roadLength: number;
  buildings: Record<string /*instanceId*/, { buildingId: BuildingId; plot: Plot; level: 1 | 2 | 3; placedBy: ChildId | null; ts: number }>;
  decor: Record<string /*instanceId*/, { decorId: DecorId; pos: Plot; placedBy: ChildId | null; ts: number }>;
  residents: Record<ResidentId, { arrivedTs: number; homeInstanceId: string | null }>;
  projects: Record<BuildingId, { contributed: Recipe; byChild: Record<ChildId, number> }>; // badges only, never shown as scores
  festival: { active: { festivalId: string; startedTs: number } | null; completed: number; daysOfPlaySinceLast: number };
  giftsPending: string[];           // gift ids not yet opened (per child filtering in UI)
  milestones: Record<string, { label: string; trigger: UnlockRule; reachedTs: number | null }>;
}
export interface InventoryState { materials: Record<MaterialId, number>; producedByChild: Record<ChildId, Recipe> }
export interface CollectionState {
  residents: ResidentId[];                                   // collected = arrived
  decorOwned: Record<DecorId, number>;
  outfitsUnlocked: string[];                                 // family-wide avatar options
  badges: Record<ChildId, { skillId: SkillId; ts: number }[]>; // mastery moments
}
export interface WeeklyGoalState {
  byChild: Record<ChildId, { weekStart: string /*ISO date, Monday, family tz*/; target: number; progress: number; weeksCompleted: number }>;
} // accumulate-only within a week: progress never decreases

// ---------- learner model (04) ----------
export interface SkillGraph {
  contentVersion: string;
  skills: Record<SkillId, Skill>;  templates: Record<TemplateId, ItemTemplate>;
  nodes: SkillId[];                                        // topological order
  prereqs: Record<SkillId, SkillId[]>;  dependents: Record<SkillId, SkillId[]>;
  encompasses: Record<SkillId, Record<SkillId, number>>;
  depth: Record<SkillId, number>;  descendants2: Record<SkillId, number>;
  roots: SkillId[];  gateways: SkillId[];
  templateStats: Record<TemplateId, { min: number; p10: number; median: number; p90: number; max: number; distinct: number }>;
}
export interface RatedAttempt {
  ts: number; sessionId: string; correct: boolean; hinted: boolean;
  format: ItemFormat; tier: Tier; representation: Representation;
  latencyMs: number; context: AttemptPayload['context'];
}
export interface SkillState {
  theta: number; n: number;                                  // 04 §2.1
  recent: RatedAttempt[];                                    // last 10 first attempts counted as evidence
  assumed: boolean;  override: 'mastered' | 'reset' | null;
  practicedAt: number | null;  fluentAt: number | null;  masteredAt: number | null;
  memory: { intervalDays: number; lastReviewTs: number; dueTs: number; reps: number;
            reviewsPassed: number[] /*ts*/; consecutiveFails: number } | null; // null until practiced
  atRiskDueTs: number | null;                                // failure propagation (04 §4)
  misconceptionHits: { id: MisconceptionId; ts: number }[];  // within the last 10 attempts
}
export interface LearnerState {
  modelId: string; childId: ChildId;
  thetaG: number; nTotal: number;
  skills: Record<SkillId, SkillState>;                       // absent = never touched (status from graph)
  successOffset: number;  recentFirstTry: boolean[];         // rolling controller, last 20 (04 §2.4)
  placement: { prior: PlacementPrior | null; strandsPlaced: StrandId[]; inProgress: string | null };
  sessionsSeen: number;
}
export interface PlacementPrior { p: Record<SkillId, number>; assumed: SkillId[] }
export interface DueReview { skillId: SkillId; dueTs: number; retrievability: number; depth: number; atRisk: boolean }
export interface WorkshopCapability {
  workshopId: WorkshopId; formats: ItemFormat[]; strands: StrandId[];
  available: boolean;                                        // built (family-wide)
  residents: ResidentId[]; produces: MaterialId[];
}

// ---------- in-session adaptation (04 §6.4) ----------
export interface AdaptInput {
  state: LearnerState; graph: SkillGraph; child: ChildContext; now: number;
  request: PlannedRequest; doneTaskIds: number[];            // indexes into request.tasks already presented
  last: { task: PlannedTask; result: CheckResult; attemptNo: number; hintsUsed: number; latencyMs: number };
  signals: { wrongInLast4: number; rapidWrongTaps: number; longIdles: number };
  tierOverrides: Partial<Record<SkillId, Tier>>;
  elapsedMs: number; budgetMs: number;
}
export type AdaptDecision =
  | { action: 'retry'; hintLevel: 1 | 2 | 3 | 4 }
  | { action: 'show-solution' }                             // second wrong: narrate worked solution, move on
  | { action: 'continue'; tierOverrides?: Partial<Record<SkillId, Tier>>; insert?: PlannedTask[] }
  | { action: 'confidence-then-offer-break'; insert: PlannedTask[] }
  | { action: 'end-request'; reason: 'frustration' | 'wind-down' | 'complete' };
// plus side effects returned on any decision:
//   queueRemediation?: { skillId: SkillId; misconceptionId: MisconceptionId }  (next request becomes the remediation lesson)

// ---------- runner ----------
export type PresentedItem = Omit<GeneratedItem, 'answer'>;   // the UI never sees the answer
export type RunnerTask =
  | { kind: 'lesson-step'; skillId: SkillId; templateId: TemplateId; phase: LessonPhase; example: number; step: number;
      narration: NarrationKey; vars: Record<string, string | number>; widget: WidgetConfig; demo: WidgetAction | null; childStep: boolean }
  | { kind: 'item'; task: PlannedTask; item: PresentedItem; attemptNo: number; hintLevel: number; tier: Tier };
export type AiFeedbackLine =
  | { mode: 'phrases'; parts: ({ id: string } | { number: number })[] }   // phrase ids are `ph.*` narration keys
  | { mode: 'text'; text: string };

// ---------- event payloads (EventPayloads[T]) ----------
export interface EventPayloads {
  'session.started':   { sessionId: string; budgetMinutes: number; trigger: 'child' | 'parent' };
  'session.ended':     { sessionId: string; reason: 'wind-down' | 'child-exit' | 'abandoned' | 'daily-cap' | 'quiet-hours';
                         activeMs: number; mathMs: number; items: number };
  'attempt':           AttemptPayload;
  'hint.used':         { sessionId: string; skillId: SkillId; templateId: TemplateId; seed: number; level: 1 | 2 | 3 | 4 | 5 }; // HintStep.level (03 §5.8)
  'lesson.step':       { sessionId: string; skillId: SkillId; templateId: TemplateId; phase: LessonPhase;
                         example: number; step: number; actor: 'demo' | 'child'; outcome: 'done' | 'demo-corrected' | 'skipped' };
  'placement.probe':   { placementId: string; strand: StrandId | null; skillId: SkillId; templateId: TemplateId; seed: number;
                         correct: boolean; skipped: boolean; latencyMs: number; posterior: number };
  'placement.completed': { placementId: string; strand: StrandId | null /* null = initial */; posterior: Record<SkillId, number>;
                         assumed: SkillId[]; items: number; reason: 'converged' | 'budget' | 'frustration' };
  'skill.override':    { skillId: SkillId; to: 'mastered' | 'reset' };
  'request.accepted':  { sessionId: string; requestId: string; residentId: ResidentId; workshopId: WorkshopId; taskCount: number };
  'request.completed': { sessionId: string; requestId: string; workshopId: WorkshopId; items: number; firstTryCorrect: number;
                         endedEarly: boolean };
  'material.produced': { sessionId: string | null; requestId: string | null; workshopId: WorkshopId | null; materials: Recipe };
  'material.spent':    { materials: Recipe; purpose: { kind: 'build' | 'upgrade' | 'project' | 'decor'; ref: string } };
  'building.placed':   { instanceId: string; buildingId: BuildingId; plot: Plot };
  'building.upgraded': { instanceId: string; level: 2 | 3 };
  'decor.placed':      { instanceId: string; decorId: DecorId; pos: Plot };
  'decor.moved':       { instanceId: string; pos: Plot };
  'decor.removed':     { instanceId: string };
  'island.named':      { name: string };                       // first child names it (05 §10); later events win (LWW)
  'road.extended':     { to: number };                         // Road Crew; projection keeps the max
  'resident.arrived':  { residentId: ResidentId; homeInstanceId: string | null; via: 'start' | 'home' | 'ferry' };
  'collection.unlocked': { kind: 'resident' | 'decor' | 'outfit' | 'badge'; id: string };
  'festival.started':  { festivalId: string; kind: 'festival' | 'storm-watch' };
  'festival.completed': { festivalId: string; rewardDecor: DecorId[] };
  'gift.left':         { giftId: string; toChildId: ChildId | null; decorId: DecorId | null; message: string | null /* ≤ 140 chars, spoken via sayText */ };
  'gift.opened':       { giftId: string };
  'milestone.defined': { milestoneId: string; label: string; trigger: UnlockRule };
  'milestone.reached': { milestoneId: string };
  'goal.progress':     { weekStart: string; delta: 1; requestId: string };
  'avatar.updated':    { avatar: AvatarSpec; source: 'creator' | 'photo-suggestion' };
  'ai.feedback.shown': { attemptEventId: EventId; mode: 'phrases' | 'text'; textHash: string;
                         aiMisconceptionId: MisconceptionId | null; confidence: number };
  'child.deleted':     { childId: ChildId };                   // envelope childId = null
}
```

`WidgetAction` and `InteractionEvent` are defined in 03 §5.1. **F01 acceptance:** every type above, plus 03's referenced types, exists in `packages/shared` with a Zod schema (`eventSchemas`, `settingsSchemas`, `gameDataSchema`, `avatarSpecSchema`, …) before any wave-1 issue starts.

### 5.9 How the contracts are declared in `packages/shared` (F01, 2026-11-18)

The rules F01 followed. Later PRs keep them.

- **Every data type has a schema** named `<camelCaseType>Schema` (`skillSchema`, `widgetConfigSchema`, `eventEnvelopeSchema`, …) and a compile-time `assertType<Equals<z.infer<typeof schema>, Type>>` next to it. A schema that drifts from its interface fails `pnpm typecheck`. Interfaces whose members are functions (`LearnerModel`, `TaskRunner`, `RunnerFeedback`, `AudioManager`, `WorkshopProps`) are types only.
- **Ids are plain `string` aliases**, not brands, so fixtures and YAML stay ergonomic. `NarrationKey` is not branded either. The schemas enforce each grammar (§4.1, 03 §8.1) at every trust boundary. `newId()` returns a UUIDv7.
- **Module map:** `ids`, `strands`, `items` (03 §5.1–§5.2, all 39 `WidgetConfig`s, `ParamSpec`, `GeneratedItem`, `FORMAT_DEFAULT_REPRESENTATION`, and the 03 §5.5 summary table `FORMAT_SUPPORT`, E1), `content` (`Skill`, `ItemTemplate`, lesson and misconception specs, narration entries and `NarrationJson`), `basics`, `profiles`, `settings`, `avatar`, `gamedata`, `projections`, `learner`, `planner`, `runner`, `audio`, `workshop`, `events`, `api`. 03 names `packages/content/src/schema/*` for some of these. Per §2 they live in `shared`.

Contract adjustments made while declaring §4–§5 (none renames or removes a field):

| # | Change | Why |
|---|---|---|
| F1 | `WorkshopDefinition<TComponent = unknown>`, with `load: () => Promise<{ default: TComponent }>`. `apps/web` uses `WorkshopDefinition<React.ComponentType<WorkshopProps>>`. | `shared` must not import React (§2). |
| F2 | `AdaptDecision = AdaptAction & AdaptSideEffects`. `AdaptAction` is the five-variant union as written; `AdaptSideEffects = { queueRemediation?: { skillId; misconceptionId } }`. | Encodes "side effects returned on any decision". |
| F3 | The envelope schema is strict: unknown envelope keys are rejected, the optional `clientTs` is allowed, and `v` is the literal `1`. Payloads of known types are validated with unknown fields stripped. Events of unknown types (`type` matching `^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$`, payload a JSON object) parse opaquely through `anyEventEnvelopeSchema` / `parseEventEnvelope`, and are stored and relayed unchanged. Inbound events (the sync push and backup import) use `inboundEventEnvelopeSchema`, which also enforces the 8 KB payload cap (08 §4) on the raw payload's UTF-8 size before unknown fields are stripped. The sync response uses `anyEventEnvelopeSchema`. | Makes §4.2's forward-compatibility rule executable. There are 31 event types (`EVENT_TYPES`). |
| F4 | `settingsKey()` / `parseSettingsKey()`, `SettingsDocument` (`{ key: 'family'; value: FamilySettings; updatedAt } \| { key: \`child:${ChildId}\`; value: ChildSettings; updatedAt }`), and `withSettingDefaults({ kind: 'family', value?, timezone? })` / `withSettingDefaults({ kind: 'child', value?, grade })`. Family defaults where the spec is silent: `music: true`, volumes voice 1 / sfx 0.8 / music 0.5, `voiceRate: 1`, `freeBuildAfterSession: false`, `ai.feedbackMode: 'phrases'`, timezone from the caller (default `'UTC'`). Grades above G3 reuse the G3 child defaults. | §5.8 names `withSettingDefaults()` without a signature. |
| F5 | API DTOs (§5.7, 08 §2) are concrete in `api.ts`, with an `apiRoutes` table (method, `/api` path, auth `none \| setup \| pair-code \| parent \| device`, request and response schemas) for contract tests. Choices the spec left open: the avatar photo travels as JSON base64 (`{ photo: { mediaType, data } }`), because mutating routes require `application/json` (08 §3). AI routes answer `200` with `{ feedback \| suggestion \| summary: … \| null }`, where `null` means "use the deterministic fallback". The device token is 32 bytes base64url (43 characters). The backup file is `{ format: 'number-island-backup', formatVersion: 1, exportedAt, familyId, events, settings, profiles }`. The stable error codes are `ApiErrorCode`. | 08 §2 lists the routes but not every body. S01, AI1, AI2 and P01 implement against these and may refine them under this section's rule. |
| F6 | `/api/health` keeps 08 §2's boolean `ai` flags. Reporting the effective model (07 §1) is left to AI1, which adds it to `healthResponseSchema`. | Keeps the F01 shape minimal. |

Known gaps for later issues (deliberately not changed by F01):

- ~~03 §5.7 filters misconception rules by the item's generator, but `GeneratedItem` has no `generator` field.~~ Resolved by E01 (E3).
- ~~`HintStep.level` is 1–5 (03 §5.8), while `hint.used.level` and `AdaptDecision.retry.hintLevel` are 1–4.~~ Resolved by E01 (E2).
- 07 §2's feedback cache key includes the template, but the feedback request carries no `templateId` (AI1).

Contract adjustments made by E01 (2026-11-18):

| # | Change | Why |
|---|---|---|
| E1 | **`FORMAT_SUPPORT` moves to `shared`.** The 03 §5.5 summary table (`FormatSupport`: representations or `'any'`, tiers, demo-mode ops, answer kinds), `AnswerKind` (= `AnswerSpec['kind']`), `DISTRACTOR_FORMATS` and `formatRendersRepresentation` move from `packages/content/src/formats.ts` to `packages/shared/src/items/formats.ts`, with `formatSupportSchema` and `answerKindSchema`. `packages/content` imports them from `shared` and no longer re-exports them. No field changes. | The content compiler (V11, V21) and the engine (the 03 §9.4 property test's tier and answer-kind checks, and the test-out answer-kind recheck in `tools/content-check`) both read it. Cross-package types live in `shared` (§2). |
| E2 | **`hint.used.level` is `1 \| 2 \| 3 \| 4 \| 5`**: the `HintStep.level` of the rung used (03 §5.8), so level 5 (show-me) is logged too. `AdaptDecision.retry.hintLevel` stays `1–4`: level 5 is the separate `show-solution` action (04 §6.4), which the runner logs as a `hint.used` with level 5 when it plays the worked solution. A ladder with fewer than three template hints skips levels but keeps each rung's number. | Additive: every event valid before stays valid. One scale for the ladder, the event and the runner. |
| E3 | **`GeneratedItem` gets no `generator` field.** The engine resolves an item's generator by its own `templateId` (`templateId` → `ItemTemplate.generator`), only in the templates passed to `initContent` (03 §5.3). Nothing else (no earlier `generateItem` call) feeds the lookup, so `checkResponse` depends only on the item, the response and the content binding. When the id is not bound, no misconception rule applies (03 §5.7), and correctness and feedback are still decided from the item. | Items stay as specified, and templates are already bound everywhere items are checked. No type change. |

Contract adjustments made by S01 (2026-11-18), closing the last two gaps F01 left to it:

| # | Change | Why |
|---|---|---|
| S1 | **Per-event sync rejection.** `SyncResponse` gains a required `rejected: SyncRejection[]` (`{ id: EventId \| null; index; code: ApiErrorCode; message }`, schema `syncRejectionSchema`). The server parses the body with `syncRequestIngressSchema`: `syncRequestSchema` with each `events` entry left raw, and the array still capped at 500. It then validates each entry on its own with `inboundEventEnvelopeSchema`. An event that fails validation (`validation_failed`), exceeds 8 KB (`payload_too_large`), names another family (`unknown_family`), is a device-pushed `child.deleted` that does not replay a tombstone the server already holds (`forbidden`, see S2), or reuses an id another family holds (`conflict`) is listed in `rejected` (ordered by `index`), and the rest of the call succeeds. `index` is its position in the request's `events`, and `id` is set when the pushed id is a valid `EventId`. `syncRequestSchema` is unchanged: it stays what a correct client sends. Clients treat a rejection as permanent and stop re-pushing that event. | With whole-call failure, one malformed event would wedge a device's sync forever, because the client keeps re-pushing it. |
| S2 | **Tombstone emitter.** *New* `child.deleted` events are created only by the server, from `DELETE /children/:id` (parent-gated). Their envelope is `{ childId: null, deviceId: familyId, payload: { childId } }`: the family id serves as the server's pseudo-device id, which never equals a real device's id, so every device pulls it. `ts` is the server time and `contentVersion` is the API's. Existing tombstones may be replayed. (a) The parent-authorized `POST /import` restores the tombstones in a backup and applies them (it purges those children). A backup from another family id is re-homed, and its tombstones take the current family id as `deviceId`. (b) `/sync` acknowledges, in `accepted`, a pushed `child.deleted` only as an idempotent relay: the server must already hold a `child.deleted` event with the same id in the authenticated family. Any other device-pushed `child.deleted` is rejected as `forbidden` (S1), including one whose id matches a stored event of another type, so a device cannot bypass the parent gate. (c) After the purge, events, settings documents and profiles that devices push for a deleted child are acknowledged (the events appear in `accepted`) but not stored, so stale devices stop re-pushing them and cannot resurrect the child. No type changes. | 08 §2/§4 named the event but not its author or `deviceId`. |

Contract adjustment made by #50 (per-voice clip sets, 2026-11-18):

| # | Change | Why |
|---|---|---|
| V1 | **Voice-qualified clip ids.** *New* `voiceClipId(clip: ClipId, voice: NarrationVoice): ClipId` in `packages/shared/src/audio.ts`: the clip id unchanged for `narrator`, `<voice>:<clip>` otherwise. The manifest shape and `ClipId` stay as they were, and every existing id is the narrator's. The AudioManager tries a clip-set word in the line's voice before the narrator's (§5.5). | 03 §8.3 renders clip sets once per voice, but the clip ids carried no voice, so Pip's and Glim's lines stitched numbers in the narrator's voice (07 §3). |

## 6. Performance budgets (enforced in CI where possible)

- Initial JS (app shell + island) ≤ 350 KB gzip; each workshop chunk ≤ 120 KB gzip; Pixi chunk loads only when needed. **Content JSON (`dist/*.json`) is never bundled into JS**: it is fetched as a precached static asset at startup.
- Time to interactive on a mid-range Android tablet (emulated 4× CPU slowdown) ≤ 3 s from warm cache. CI **reports** this number but does not fail on it (too noisy); Q01 verifies it.
- 60 fps target and 30 fps floor for island pan and widget drags. At most one WebGL canvas alive at a time.
- Precache size (shell + content + K–3 narration audio, Opus) ≤ 60 MB.

## 7. Conventions

- All randomness flows through the seeded RNG in `engine/rng.ts` (no `Math.random` in engine or content code).
- Time comes in as a parameter to pure functions (no `Date.now()` inside the engine).
- User-facing strings for children live in narration YAML (one key per line), never inline in components. Parent-area strings may be inline (English only in v1).
- Feature flags live in `settings` (family level): `ai.feedback`, `ai.feedbackMode` (`phrases`|`text`), `ai.avatarPhoto`, `ai.parentSummary`, `timedChallenges`, `music`.
- Commits and PRs reference issues as `Refs #N`.
