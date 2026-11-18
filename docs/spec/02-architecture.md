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
| CI | GitHub Actions: install, typecheck, lint, unit, content validate, build, e2e (Chromium) |
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
  shared/               types and Zod schemas shared by web and api (events, DTOs, ids)
  content/              YAML sources + schemas + compiler → dist/*.json (+ narration manifest)
    src/schema/  skills/<strand>.yaml  templates/<strand>.yaml  misconceptions/*.yaml  narration/*.yaml
  engine/               pure TS, no DOM, no React: rng, generators, checking, learner model,
                        scheduler, placement, session planner, island economy rules
  ui/                   design tokens, primitives, math widgets, avatar renderer, art kit (SVG), sfx
tools/
  narration/            extract narration lines → render via Gemini TTS → audio/ + manifest
  content-draft/        (optional) LLM-assisted drafting helpers with human review
e2e/                    Playwright specs + fixtures
docs/                   research/, spec/, build/
```

Dependency direction (enforced with Biome `noRestrictedImports` or a lint script): `shared` ← `engine` ← `content`(types only) ← `ui` ← `web`; `shared` ← `api`. `engine` must never import React, Dexie or browser globals. The engine also runs in the API (for server-side validation) and in tests.

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
  ts: number;             // ms epoch, device clock
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
  | 'skill.override'             // parent marks mastered / reset (audited)
  | 'request.accepted' | 'request.completed'
  | 'material.produced' | 'material.spent'
  | 'building.placed' | 'building.upgraded' | 'decor.placed' | 'decor.moved' | 'decor.removed'
  | 'resident.arrived' | 'collection.unlocked'
  | 'festival.started' | 'festival.completed'
  | 'gift.left' | 'gift.opened'
  | 'goal.progress'
  | 'avatar.updated'
  | 'ai.feedback.shown';         // { attemptEventId, mode, textHash, aiMisconceptionId|null, confidence }: the AI line text itself stays in the local aiLog

export interface AttemptPayload {
  sessionId: string;
  skillId: SkillId;
  templateId: TemplateId;
  seed: number;
  params: Record<string, number | string | boolean>;
  format: ItemFormat;
  tier: 'concrete' | 'pictorial' | 'abstract';
  response: ResponseValue;        // see §5.2
  correct: boolean;
  partialCredit: number;          // 0..1 (hint-assisted = 0.5)
  latencyMs: number;              // first interaction to submit
  hintsUsed: number;
  attemptNo: number;              // 1 = first try on this item
  misconceptionIds: MisconceptionId[];
  context: 'lesson' | 'practice' | 'review' | 'placement' | 'challenge' | 'transfer-probe';
  workshopId: WorkshopId | null;
}
```

`lesson.step` payload: `{ sessionId, skillId, templateId, phase, example, step, actor, outcome }` (03 §6.2).

Payload schemas live next to the types as Zod schemas (`eventSchemas[type]`). Readers must ignore unknown event types and unknown fields (forward compatibility).

### 4.3 Projections (folds), all in `packages/engine`

- `foldSkillStates(events, graph, now) → Map<SkillId, SkillState>` (04 §2)
- `foldIsland(events, gameData) → IslandState` (buildings, decor positions (LWW by ts then id), residents, festival state)
- `foldInventory(events) → Record<MaterialId, number>`; never negative (spend events that would go negative are ignored deterministically)
- `foldCollection(events) → CollectionState`; `foldGoals(events, now) → WeeklyGoalState`

Folds must be **deterministic, order-independent given the same set** (sort by `ts`, then `id`) and incrementally updatable (`applyEvent(state, e)`). The client caches projections in Dexie and rebuilds from scratch when `contentVersion` or the engine fold version changes.

### 4.4 Dexie schema (`apps/web/src/data/db.ts`)

```
events:      id, [familyId+ts], [childId+ts], type, synced(0|1)
projections: key (e.g. "skills:<childId>", "island", "inventory") → { version, upToEventId, data }
profiles:    childId → ChildProfile (name, avatar, grade, birthYear, picturePasswordHash, settings)
settings:    key → { value, updatedAt }   // family + per-child settings (LWW)
device:      singleton → { deviceId, familyId, deviceToken?, pairedAt }
aiLog:       id → { ts, childId, skillId, text }   // every AI line shown (parent audit, 90-day retention)
syncState:   singleton → { cursor, lastSyncAt, lastError }
```

Call `navigator.storage.persist()` on first run. Export/import produces one JSON file (events + settings + profiles) for backup.

## 5. Shared contracts

These are the interfaces parallel work streams code against. Changing one requires updating this doc in the same PR.

### 5.1 Content types (`packages/content/src/schema`, re-exported from `packages/shared`)

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

### 5.2 Items and responses (`packages/engine/src/items.ts`)

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

The supporting types `Tier`, `Representation`, `ParamSpec`, `GeneratorId`, `WidgetConfig`, `AnswerSpec`, `HintStep`, `LessonSpec`, `NarrationKey`, `FeedbackKey`, `StrandId` and `InteractionEvent` are defined in **03-curriculum §1, §5.1, §5.2 and §6.1**, and implemented in `packages/content` / `packages/engine` exactly as written there.

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
  reward: { material: MaterialId; amount: number; unlocks?: string[] };
  narration: NarrationKey; vars: Record<string, string | number>;
}
export interface PlannedTask { skillId: SkillId; templateId: TemplateId; seed: number; context: AttemptPayload['context']; mode: 'lesson'|'item'; }
```

The planner is pure. The web app also asks `adaptNext(state, request, lastResult)` between items, which lets the remaining tasks in a request adapt (step down a CPA tier, insert a prerequisite probe, or stop early on frustration). See 04 §6.

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

Narration keys resolve through `packages/content/dist/narration.json`: `{ key: { text, say?, voice?, clips: string[] } }`, where `clips` may contain slot tokens `$var[|type[:countVar]]` (03 §8.4). Number words are composed from pre-rendered clips ("twenty" + "three"). If a clip is missing, fall back to Web Speech for that line and log a dev warning.

### 5.6 Workshop module contract (`apps/web/src/workshops/<id>/index.ts`)

```ts
export interface WorkshopDefinition {
  id: WorkshopId; name: string;
  formats: ItemFormat[];                 // which item formats this workshop can host
  strands: StrandId[];                   // for planner affinity and island layout
  building: { art: BuildingArtId; footprint: [w: number, h: number]; unlock: UnlockRule };
  produces: MaterialId;
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
  onAiFeedback(cb: (text: string) => void): void;
  retry: boolean;                              // allow another attempt on the same item
}
```

The app owns the `TaskRunner`, so every workshop gets logging, mastery updates, hints, misconception handling, AI feedback and wind-down the same way. A workshop only renders the world, the widget and the celebration.

### 5.7 API DTOs (`packages/shared/src/api.ts`)

See 08 §2 for routes. Every request and response body has a Zod schema in `shared`. The API validates with `@hono/zod-validator`; the client parses responses with the same schemas.

## 6. Performance budgets (enforced in CI where possible)

- Initial JS (app shell + island) ≤ 350 KB gzip; each workshop chunk ≤ 120 KB gzip; Pixi chunk loads only when needed.
- Time to interactive on a mid-range Android tablet (emulated 4× CPU slowdown) ≤ 3 s from warm cache.
- 60 fps target and 30 fps floor for island pan and widget drags. At most one WebGL canvas alive at a time.
- Precache size (shell + content + K–3 narration audio, Opus) ≤ 60 MB.

## 7. Conventions

- All randomness flows through the seeded RNG in `engine/rng.ts` (no `Math.random` in engine or content code).
- Time comes in as a parameter to pure functions (no `Date.now()` inside the engine).
- User-facing strings for children live in narration YAML (one key per line), never inline in components. Parent-area strings may be inline (English only in v1).
- Feature flags live in `settings` (family level): `ai.feedback`, `ai.feedbackMode` (`phrases`|`text`), `ai.avatarPhoto`, `ai.parentSummary`, `timedChallenges`, `music`.
- Commits and PRs reference issues as `Refs #N`.
