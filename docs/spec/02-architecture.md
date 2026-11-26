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
                        (two entries: /shell for the app's initial JS, the full entry lazily; §6a)
  ui/                   design tokens, primitives, math widgets, avatar renderer, art kit (SVG), sfx
tools/
  narration/            extract narration lines → render (07 §3) → apps/web/public/audio/ + manifest.json
  content-check/        `pnpm content:build` (compile + template-stats.json, 03 §9.1) and the engine-dependent content validators V13–V15, V22, V25 (03 §9.2)
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
- `StrategyId`: `strategy.kebab-case` (`^strategy\.[a-z0-9]+(-[a-z0-9]+)*$`, e.g. `strategy.made-ten`): a desirable strategy that `detectStrategies` praises (§5.2, 03 §5.7). It is never a `MisconceptionId`. v1 has three, `STRATEGY_IDS`: `strategy.counted-on`, `strategy.made-ten`, `strategy.used-doubles`.
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
- `foldInventory(events) → InventoryState`: family-wide Storehouse. **Buildings are never un-built**: in fold order (`ts`, then `id`) a `building.placed` applies unless its plots are already built on (see "Island" below), a standing building is never removed, and `building.upgraded` only raises a level. The inventory projection clamps each material at 0, so a concurrent sibling spend can at worst make a build "free", never negative or reverted.
- `foldCollection(events, gameData) → CollectionState`; `foldGoals(events, settings) → WeeklyGoalState`

All projection types are defined in §5.8.

Folds must be **deterministic, order-independent given the same set** (sort by `ts`, then `id`) and incrementally updatable (`applyEvent(state, e)`). The client caches projections in Dexie and rebuilds from scratch when `contentVersion` or the engine fold version changes.

**Learner fold as implemented (E02, 2026-11-18).** No `packages/shared` type changes. `foldSkillStates(events, graph, now, opts?)` takes an optional `opts: { childId?, isK?, params? }`: the family log holds every child's events, so `childId` names the child (it may be omitted only when the events hold one child), and `isK` selects the K columns of 04 (expected latency and fluency × 1.5). Transitions are event-driven, so `now` does not change the fold; statuses at `now` come from `LearnerModel.status`. The engine also exports `foldLearnerState(events, graph, opts) → LearnerState` (what the planner reads), `applyLearnerEvent(model, state, e)` (the incremental step), `buildSkillGraph(...)` (builds the §5.8 `SkillGraph` from `skills.json`, `templates.json`, `graph.json` and `template-stats.json`), and `createEloFireModel(graph, { childId, isK })` (the `LearnerModel`, bound to one graph and child, because `apply` receives neither). Events the learner fold reads: `attempt`, `placement.probe`, `placement.completed`, `skill.override`, `session.started`, and a `child.deleted` for the child. A tombstone is permanent: the child's projection stays empty whatever the timestamps of its other events. Child ids are compared case-insensitively (08 §4). **Event time:** folds order and time events by `ts`, which the server bounds (08 §4). `clientTs` is never used for ordering, because a device can set it. Every fold keeps each event id once, preferring the server's clamped copy (the one with `clientTs`). The incremental step applies each id once, as the client store keyed by id guarantees. When the client replaces a stored event with a copy whose `ts` differs, it rebuilds the projections. ~~Known gap: the sync response never returned a clamped copy to its originating device.~~ Resolved by D01 (§5.9 S3): the pull never returns a device its own events, so the push response echoes the stored time of every event the server stored with another `ts` or `clientTs` than pushed (`SyncResponse.clamped`, §5.9 S3). The origin device replaces its local copy's `ts` and `clientTs` with it, and then folds the same copy every other device pulls.

**Grade-prior placement (Refs #26, 2026-11-25).** No payload changes; one fold rule: a `placement.completed` with `items: 0` (a prior) assumes only skills the child's events never touched (no skill state yet), so a copy another device wrote offline never undoes an attempt, a failed week-one verification or a reset. Until the placement adventure exists, the app writes one zero-probe initial `placement.completed` per child and grade: the engine's `gradePriorPlacement({ graph, child, state, placementId })`, which is `startPlacement` (strand null) stopped before any probe, so its posterior is the 04 §5 grade prior (`items: 0`, reason `'budget'`: a budget of no items). Skills the child has attempts on are left out of its posterior and assumed list. Its `placementId` is `grade-prior:<grade>` with a `+` when the child works above grade (`grade-prior:2+`). The app (`apps/web/src/data/gradePlacement.ts`) writes it when profiles are saved and before each island plan, whenever the child's latest `grade-prior:` placement (fold order) is not for the profile's current grade: a new child, an existing child on their next visit, and a child whose grade or "working above grade" changed on any device. After a changed grade, untried skills get the new prior and newly assumed skills are seeded; skills already practiced or assumed keep their state (04 §5 week-one verification demotes a wrong assumption), and skills with attempts keep theirs. Two devices may both write the same placement while offline: the fold applies the same posterior twice, and the second copy assumes nothing (each of its skills already has a state), so the devices converge, also when the child practised or failed a verification in between. A measured initial placement written later supersedes the prior's posterior in the fold.

**Projections as implemented (E02, 2026-11-18).** No `packages/shared` type changes. Each projection exports `initX`, the incremental `applyXEvent` and the full `foldX`: `foldIsland(events, gameData)`, `foldInventory(events)`, `foldCollection(events, gameData)` and `foldGoals(events, settings)`. `settings` is `Record<ChildId, { weeklyGoal }>`, and a child without settings gets a target of 6. Ids are opaque, so records are read by own key only (an id such as `constructor` is an ordinary id). Readings the spec left open:
- **Tombstones (08 §4):** every fold handles a tombstone in order, so the full fold equals the incremental one. Events before the tombstone apply as usual. At the tombstone, the child's personal data is dropped: `producedByChild`, its `projects.byChild` counts, `badges` and its weekly goal. Its `placedBy` attributions become `null`. The shared island it helped build stays (buildings are never un-built), and from then on the child's events are ignored. Per-child maps (`producedByChild`, `projects.byChild`, `badges`, the goals' `byChild`) are keyed by the lower-case child id, and goal settings match child ids case-insensitively (when several spellings of one child are present, the lower-case key wins, then the smallest key). Known gap (08 §4 and the sync API, not folds): the server purge deletes every event of the child, including its shared-island events, so a device that rebuilds from the purged log loses those buildings. Keeping shared-island events with their attribution removed is a purge-rule decision, recorded as a follow-up.
- **Island:**
  - A building instance is placed once (a later `building.placed` for the same instance is ignored). Upgrades only raise its level, and an upgrade whose clock ran ahead of the placement applies when the placement arrives.
  - **Two buildings never share a plot (I01 part 3, 2026-11-23).** A `building.placed` whose footprint (from `GameData`; a building the data lacks covers one plot) overlaps a standing building does not apply. The app only offers free plots, so this happens when two devices placed on the same plots while offline: the first placement by `ts`, then `id`, stands on every device once they have synced, and a device that showed the later one stops showing it when the earlier event arrives. The later placement is kept as *displaced* in the fold's private `_displaced` (instance id → building id, plot, `placedBy`, `ts`), read with the engine's `displacedPlacements(state)`, until a later `building.placed` of the same instance on free plots applies (the app's instance id is the building id, so this is the child building it again); a pending upgrade of it then applies as for any placement. Nobody lives in a displaced home: a `resident.arrived` whose `homeInstanceId` is displaced at that point does not apply, and a resident already in the projection with that home (an arrival that sorted before the placement, written by a device with an earlier clock) is removed when the placement is displaced. The resident arrives when the home is built again (the app settles residents after every build). Its `material.spent` stands: the inventory fold does not read the island, materials are clamped at 0 and never refunded, so the child pays again to build elsewhere. `foldCollection` is unchanged and still grants a displaced placement's level unlocks. A tombstone drops the deleted child's displaced placements. The island screen tells the child whose placement was displaced once per device, in one spoken line (`ui.island.displaced`), on their next visit.
  - `decor.moved` updates `pos` and `ts` (LWW by ts then id), and a move after removal is ignored.
  - A resident keeps its first arrival.
  - `projects` sums `material.spent` with `purpose.kind: 'project'` (ref = building id).
  - `roadLength` starts at 0 and keeps its maximum.
  - `ringsUnlocked` counts the leading rings whose `unlock` holds over island facts (built building levels, road length, resident count). Rules that need learner facts (`skill`, `skillKind`, `minGrade`, `masteredCount`) are false there, so v1 rings use island facts. Rings never re-lock.
  - `festival.daysOfPlaySinceLast` counts distinct UTC days with a `session.started` (any child) since the last `festival.completed`. A session later on the completion's own day counts as the first.
  - A gift is pending from `gift.left` until `gift.opened`, in either order.
  - A milestone takes its label and trigger from the latest `milestone.defined`, and keeps its first `milestone.reached`.
  - `evaluateUnlock(rule, facts)` is exported for callers that hold learner facts (planner, app shell).
- **Collection:**
  - `residents` holds arrivals and `collection.unlocked` residents, in arrival order.
  - `decorOwned` starts with every `source: 'starter'` decor at 1, then adds building-level unlocks (`decor:<id>`, once per level reached), `festival.completed.rewardDecor`, the decor of an opened gift (once per gift), and `collection.unlocked` decor. `collection.unlocked` therefore records only grants that no other event already implies. A grant enters the projection only when its id matches the kind's grammar (skill id for `badge`, kebab-case for `resident` and `decor`, non-empty for `outfit`), both from `collection.unlocked` and from building-level `decor:`/`outfit:` unlocks. With validated `GameData` (`gameDataSchema`, as the content compiler emits it), the collection state therefore always satisfies `collectionStateSchema`.
  - `outfitsUnlocked` holds `outfit:<option>` level unlocks, `collection.unlocked` outfits, and `GameData.outfits` whose rule holds over buildings, road, residents and badges (`masteredCount` = the most badges of one child).
  - `badges` holds a child's `collection.unlocked` badges (`id` = skill id), the first per skill. The app emits one when it sees a skill reach `mastered`.
- **Goals:** `goal.progress` carries the week. A child's current week is the latest week it has progress for. `progress` is that week's count, and `weeksCompleted` counts the weeks whose count reached the target. The attempt event does not carry the item's difficulty, so the learner rebuilds it from `templateId`, `params` and `seed` through the generator registry (04 §2.2).

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
  meta: { latencyMs: number; trace?: InteractionEvent[] }): MisconceptionId[]; // process misconceptions only (03 §5.7, §7.1)
export function detectStrategies(item: GeneratedItem, r: ResponseValue,
  meta: { latencyMs: number; trace?: InteractionEvent[] }): StrategyId[];      // strategy praise, correct responses only (03 §5.7)
```

The `TaskRunner` (§5.6) calls both process detectors after `checkResponse`. It merges `detectProcessMisconceptions`' ids into `AttemptPayload.misconceptionIds`. When the response is correct and `detectStrategies` returns ids, it may replace the `fb.correct.*` key with `fb.praise.<name>` for the first id (`strategy.made-ten` → `fb.praise.made-ten`). Strategy ids are never logged as misconceptions.

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

**The TaskRunner as implemented (R01 part 1, #20).** No `packages/shared` type changes.

- **Where.** `apps/web/src/runner/TaskRunner.ts`: `createTaskRunner({ engine, store, graph, child, session, request, hosts })` returns the §5.6 `TaskRunner` plus `endReason()` and `finish()`. It is framework-free. The engine is passed in: the caller gets it with `await import('@number-island/engine')` (already loaded at boot, §6a), so a workshop chunk never carries the item core.
- **Content binding.** Boot binds the loaded content to the item core once (`boot/itemCore.ts` `bindItemCore` → `initContent`: templates, narration, misconceptions and template stats), right after both are loaded. `misconceptions.json` is therefore one of the files the app needs to start.
- **Per item.** `targetDifficulty(state, skill, context, child, graph)` → `generateItem(template, task.seed, { difficulty })` → the `RunnerTask` carries the item without `answer`. `submit` reports the item and its latency to the session before it awaits anything (`recordItem` on a first try, `recordMath` on every try: math density, 04 §7; a session that ends while the answer is being written still counts it), runs `checkResponse` and `detectProcessMisconceptions`, appends the `attempt` event (`partialCredit` 1 or 0 until hints exist; `representation` = the template's or the format default), reads the child's learner projection back from the store, then calls `adaptNext` as 04 §7b describes. `next()` returns the same item with `attemptNo + 1` after a `retry`, else the next item, else null.
- **Latency** is measured by the screen: the prompt is spoken first, the widget takes no input until that has finished (item ready), and the clock runs from there to the submit. A hint the child asks for mid-try stops the clock while it plays and the clock runs on afterwards (`runner/answerTime.ts`); a new try after a wrong answer starts from zero once its hint has played. The clock counts only time the page is visible (`runner/visibleClock.ts`), as the session's active time does, so a tablet asleep mid-item adds nothing to `latencyMs` or `mathMs`.
- **One hit per item.** The widget stays mounted for the second try, with the first try's trace and often its answer. A misconception is written to the first attempt of the item that shows it and never again on a later try of that item, so one slip is one entry in the learner's misconception window. `detectProcessMisconceptions` judges the first try only: on a later try the item's trace holds both tries, and counting again after "let's count again" would read as a recount.
- **A placeholder is not an answer.** Only `PlaceholderWidget` (a missing widget, or one that failed to load or render) responds with `skip` here. The pier logs nothing for it and ends the request (`request.completed`, `endedEarly`).
- **Request events.** The runner appends `request.accepted` when it starts and `request.completed` in `finish()` (once): `items` = first tries made, `endedEarly` = any end other than `complete`, a child leaving included. `finish()` waits for a submit that is still being written, and the pier calls it however the child leaves (Home, the browser's back button, or before the request finished loading).
- **Wind-down.** `session.windingDown()` (the SessionController's signal: budget, daily cap or quiet hours) is passed to `adaptNext` as `elapsedMs ≥ budgetMs`, so the request ends after the current item is resolved, never inside it. `next()` checks the signal and the budget again, so no item starts after a wind-down that came while the feedback was showing. The play pages share one layout route (`/play/:childId`, `PlayLayout`), so the session survives moving between the child home and a workshop and ends when the child leaves the play area. The child home ends a session that was already winding down when it comes back from a workshop, and plays the sunset.
- **The shared workshop screen (W1, #27; `apps/web/src/workshops/play`).** No `packages/shared` type changes. `RequestPlay` plays one request task by task on `PlayScreen` (the runner loop, the feedback flow and the lesson player described below): every workshop uses it, so a lesson plays in-world wherever its request is (05 §4 rule 5). The Practice Pier passes nothing more; a themed workshop passes a `PlayScene`: its id on the frame (`data-workshop`), the line said at the end, the bottom row (the request's beads and what it has made, in the pier's row height, so the workshop area is the pier's) and the request-complete parade in the summary. The app's `AppWorkshopProps` adds `childId` and `onRoadStone(laying)`: a workshop that lays a road stone itself hands the host that write. However the child leaves (the workshop's exit, Home, the browser's Back), the host waits for it before the request's result goes to the hub (`workshops/requestResult.ts`): `RequestResult.road` is the stone's number, which the island counts on to as it does for its own button (until the result is in, the island's Build and "Lay the next stone" are off, so nothing is bought with stones a write in flight is spending), and `RequestResult.materials` is what reached the Storehouse (what the request made, less the stone it laid), which is what the island shows arriving.
- **Road Crew** (`apps/web/src/workshops/road-crew`): registered with the formats, strands and product of 05 §4 W1. Every right answer makes a stone up to the request's reward (the runner's `materialEarned`), shown in the row at the bottom. At the parade of a request that made at least one stone, the workshop lays the road's next stone through the island's own action (`layNextStone`: `road.extended { to }`, then `material.spent` of one stone, ref `road`), once per request. `layNextStone` lays one stone at a time per store, so the parade and the island's button can never pay twice for one stone; the request's other stones stay in the Storehouse. When no stone can be laid (the road is complete, or its next stone lies on land that is not open) all of them stay there. A child who leaves before the parade keeps the stones made and lays none; the island's "Lay the next stone" is unchanged.
- **Practice Pier** (`apps/web/src/workshops/practice-pier`): plays the request the child picked on the island (see "The island hub and workshop registration" below); until I01 part 1 it planned its own. Tasks that `adaptNext` inserts are kept only when the pier can show their template (`hosts`). Tasks of formats without a registered widget are left out (a placeholder's "next" would log a skip against the child), and so is a lesson task whose worked examples the pier cannot show. With the dev flag (`localStorage['ni.dev'] = '1'`), `?browse` opens the content browser: any skill, one template of it, or its lesson followed by one practice item.
- **The feedback flow (R01 part 2, #20).** No `packages/shared` type changes; the additions are on the app's own `PierTaskRunner` (`submit` resolves a `PierFeedback` = `RunnerFeedback` + `hint` + `solution`; `idle()`, `breakOffered()`, `answerBreak()`).
  - **Hint ladder (03 §5.8).** `hint()` (the lightbulb) returns the item's lowest rung of levels 2–4 not shown yet, and the top one again once all are shown. A `retry` shows the rung `adaptNext` names, or the next one up when the child has already seen it; level 1 (replay) only when `adaptNext` asks for it, because the prompt bubble is the replay control. Each rung shown is one `hint.used` event and one `hintsUsed` (`AdaptInput.last.hintsUsed` and the attempt payload); a rung shown again is neither. A rung that comes with the feedback of a wrong answer (and the worked solution) is used when the screen starts to show it (`PierFeedback.shown()`), after the feedback line: a child who leaves during that line, or while the answer is still being written, was given no hint, and none is logged (`shown()` does nothing once the request is finished). `partialCredit` is 1, 0.5 when right with a hint, 0 when wrong. Level 5 is not offered on request: it is the worked solution after the second wrong answer.
  - **Worked solution.** On `show-solution` the feedback carries `itemSolution(item)` and `say` is `fb.reveal`; the runner makes the protocol's second `adaptNext` call (04 §7b) and writes `hint.used` level 5 when the screen starts the solution. The screen plays each step's line with its action in the widget's demo mode, on a fresh widget, with input off. A demo op the widget does not animate is skipped and noted in the diagnostics; the step's line is still spoken.
  - **On screen (06 §6).** A wrong answer: the soft knock, the cue at the widget (the workshop area sways once and takes a sunshine edge with a look-again badge), the feedback line, then the rung. A rung's line stays in the bubble until the next answer; while it does, a speaker button beside it brings the item's instruction back, said again and back in the bubble (06 §5: every instruction has a replay). A rung with widget actions plays them on a fresh widget; one without keeps the child's work. A rung's `overlay` picture is a card over the workshop area with a close button, so it takes no room from the widget.
  - **Frustration (04 §6.4 rule 4).** `longIdles` counts idle periods of 45 s of visible time without a touch while an item waits for an answer (`runner/idleWatch.ts`, with an injected clock and timer). After the confidence item is resolved the runner holds a break offer; the screen asks before the next item. A break ends the request as `frustration`, with the summary. Playing on is a fresh start: the idle and rapid-tap counts restart and `wrongInLast4` counts only first tries made since, because `adaptNext` ends the request on any frustration signal after the confidence item. When the request is over after the confidence item anyway, or the pier cannot show that item, there is nothing to wait for: the request ends, or the offer comes at once.
  - **Remediation queue (rule 5).** `queueRemediation` goes to `runner/remediationQueue.ts`: one entry per (skill, misconception) and child, kept while the app is open. The next pier plan takes the oldest and passes it as `PlanOptions.remediation`.
  - **`material.produced`.** Written once in `finish()`, before `request.completed`: one unit per item answered right (on any try), dealt from `reward.materials` in its own order and never more than the reward. Nothing is written when nothing was earned. `progress().materialEarned` is the same count.
- **The lesson player (R01 part 3, #20; 03 §6).** No `packages/shared` type changes. A `mode: 'lesson'` task plays the skill's lesson (`runner/lesson.ts` builds the script: each example's item from its fixed params, or from its seed at the template-stats p10 / median, which every build has: `template-stats.json` is a `pnpm content:build` output and a file the app needs to start (03 §9.1); steps authored or from `itemSolution`). `current()` / `next()` hand out `lesson-step` tasks (§5.8) with the app's private fields (`_widgetKey`, `_turn`, `_turnLines`, `_prior`, `_canSkip`, `_tier`), and an item of the lesson may carry `_nudge`.
  - **Order and events.** Intro (on the first example's widget), each worked example's steps, each faded example's demo steps and then the child's turn, the scaffolded items, the outro, then the request's next task. `next()` on a demo step writes its `lesson.step` (`done`). Intro, outro and scaffolded steps use `example` = their number in the phase (0-based) and `step: 0`; a scaffolded item's `lesson.step` is `actor: 'child'`, written by `submit` when the item is resolved, right after its attempt (leaving from the feedback loses neither); a write that fails is owed and `finish` writes it after `material.produced` and before `request.completed`, so the committed answer keeps its reward even when the step fails again.
  - **The child's turn (faded).** One turn covers every child step of the example (`childSteps`, capped so the demo does at least one): widgets report no ops, so a single child step cannot be observed, and the turn is complete when `checkResponse` accepts the widget's answer (each child step is then `done`). `lessonAnswer` judges it; no `attempt` is written and its time counts as math time. After a second unsuccessful try the screen rebuilds the example on a fresh widget, the demo performs the child's steps with their lines, and `next()` writes `demo-corrected` for each. Steps authored for the child (`actor: 'child'`) hand over with their own lines. Steps from a generator's solution have only the demo's lines, which say the answer, so the example's own instruction (the item's prompt) is spoken instead.
  - **Scaffolded items.** `count` items of the lesson's template, context `lesson`, through `submit` like any item (hint ladder, worked solution, misconceptions, frustration signals; `adaptNext`'s `complete` is ignored while the lesson has more to play). The ladder is opened at `hintStart`: that rung plays before the child starts and is skipped by the ladder afterwards, but it is not a hint used (no `hint.used`, `hintsUsed` 0, full credit), so "right with no hint" can still shorten the lesson. They count as items of the session and the request (`request.completed.items`, one bead each as they appear), and earn material like any item.
  - **Shortening and skipping (03 §6.2).** Faded example 1 right on the first try within the template's expected latency (× 1.5 for K) skips the later faded examples; scaffolded item 1 right on the first try with no hint skips the rest; "I can try" (`skipWorked`, grade 1 up, after the first worked step) skips the remaining worked steps. Each skipped example, item or step is one `lesson.step` with `skipped`.
  - **On screen.** A demo step: the line is spoken and shown while the widget animates the action in demo mode, then the next step follows by itself. A speaker repeats the current step's line (the bubble does too): pressed while the lesson plays by itself (a demo step, the hand-over of a turn, the demo taking a turn over), the line that was on screen at the press is said once more at the next pause, before the lesson moves on (`runner/sayAgain.ts`). On the child's turn the widget takes input with no invitation hand or ring (a widget's `demo.invite` points at the exact target, which for the last step is the answer; the hand is the demo's), there is no lightbulb, and nothing says "wrong": a first unsuccessful try gets the invitation again. A right answer gets the chime, the star and "next". An op the widget does not animate is skipped and noted in the diagnostics; its line is still spoken (the fit check holds the shipped lessons to `LESSON_OPS_NOT_SHOWN`, empty today).
  - **After a test-out (03 §6.5, 04 §3).** Items of the skill planned before its lesson in the same request are its test-out draw. When the lesson's turn comes and the learner has put the skill on the practiced track (`practicedAt` set), the lesson task is passed over with no event; otherwise the full lesson plays, opened by `fb.testout.to-lesson`.
  - **Frustration in a scaffolded item (04 §6.4 rule 4).** On `confidence-then-offer-break` the lesson ends with that item: the remaining scaffolded items are `skipped`, the outro is not played, and the easy item and the break offer come next.
  - **Leaving and wind-down.** Home (or back) finishes the request as before (`request.completed`, `endedEarly`); steps not completed are not logged, and nothing is logged after. No new example, scaffolded item, or item after the lesson starts after the wind-down signal.
  - **Not here:** "show me" during practice and the `fact-fluency` "show me" (03 §6.2, §6.4), the buddy on screen (05 §4), and remediation's "own lesson in the concrete tier" (03 §7.1: the lesson's own template is used).
- **The island hub and workshop registration (I01 part 1, #22).** No `packages/shared` type changes.
  - **Registration.** `apps/web/src/workshops/registry.ts` lists every workshop's definition (`WORKSHOPS`, from `workshops/<id>/index.ts`); a new workshop adds its definition there and nothing else names it. The app's side of the contract is `workshops/types.ts`: `AppWorkshopProps` is `WorkshopProps` whose `runner` is the app's own runner (the feedback flow and the lesson player on top of the shared `TaskRunner`). `workshopFor(id)` returns the registered module, or the Practice Pier for a workshop that has none (05 §4: the generic host of every format).
  - **What the planner may use.** `workshopCapabilities(gameData, island)` builds `workshopsAvailable`: one entry per `GameData` workshop building that is registered or listed in `UNREGISTERED_PRODUCTS`. It is `available` when it is built on the island, or when it works from the start: its rule is `start: true` and its level 1 costs nothing (Road Crew, Lantern Grove and the pier). Those do not fit the 3-plot sandbar, and without them a new family could make no material; every other workshop has to be unlocked and built (I01 part 2). A Pebbling on the island (the starter buddies included) is the resident of one workshop: the first of its affinities that is available and makes something, else every one it lists; so once a workshop is built, the residents who prefer it ask for its product. A registered workshop brings its own formats, strands and products. One that is not registered yet has no formats, so every request falls back to the Practice Pier, voiced by one of those residents and producing that resident's workshop's product (04 §6.3: "Practice Pier produces the material the resident asked for"). `UNREGISTERED_PRODUCTS` holds the product of every workshop of 05 §4 ("Produces") until the workshop registers; one with two products (glass and beams, rope and flags) lists first the one the Storehouse has less of (`workshopCapabilities`' `inventory`), because the pier makes a workshop's first product.
  - **The island** (`apps/web/src/island`, `/play/:childId`): the kit's `IslandScene` drawn from `foldIsland` (rings, the stones already laid, the buildings that stand); it is still (no camera, day lighting). `planIslandRequests` calls `planSession` with those capabilities when the island opens and again after every request (§5.4 re-planning), drops the tasks the pier cannot show and the requests left empty, and the first request is the recommended one. A queued remediation (04 §6.4 rule 5) is passed to every plan and leaves the queue when the child picks its request, or when a plan could not offer it. The warmup of `SessionPlan` goes before the first request picked (part 4, below).
  - **A request.** A bubble shows the request's material once per unit; its speaker says `request.narration` and then the material's name, as one `sayPhrases` line, so the next thing said replaces all of it. A tap picks it: the hub state (`island/hub.tsx`, held by `PlayLayout`, so it survives island ↔ workshop) keeps the picked request, and the route `/play/:childId/workshop/:workshopId` (`WorkshopHost`) creates the runner (`runner/useRequestRunner.ts`), loads the module's screen (`load`) and renders it with `request`, `runner`, `avatar`, `audio` and `onExit`. `/play/:childId/pier` is only the dev content browser now. One screen plays a picked request (`hub.claim`): the browser's Forward into a request the child has left, while it is still being written, goes back to the island and starts nothing.
  - **First problem within 10 s (05 §2).** The workshop screens and the runner's code are fetched ahead: when the app is idle (`warmLazyRoutes`) and again when the island shows its requests. `island/firstProblem.ts` measures tap → the mount of the request's first widget (an item's or a lesson step's; `WidgetHost`'s `onWidgetMount`, called once the widget's code has loaded and it is on screen) on an injectable clock; a test runs the real path on a clock that only moves when a timer on the way has to fire, and holds it to 10 s.
  - **Coming back.** However the child leaves (the workshop's exit, Home, the browser's back button), the runner is finished first (`material.produced`, then `request.completed`), and the request's summary goes to the hub. The island then shows what was made beside the Storehouse button and plans again. The Storehouse (05 §3) shows `foldInventory` per material: ten-frames for K (one per ten and one for the rest, no numeral), base-ten piles from grade 1 (a bundle per ten, the ones loose, and the numeral).
  - **Building (I01 part 2, `apps/web/src/island/building`).** No `packages/shared` type changes. One building per `BuildingDef`: its `instanceId` is the building's id, so two devices that place the same building while apart end with one (`foldIsland` keeps the first). `buildCards` lists a new building (level 1) or the next level of one that stands (to 3) as `ready`, `short` (the Storehouse lacks part of the recipe), `no-room` or `locked`. A new building needs its `UnlockRule` to hold, its recipe, and a plot where its footprint fits: open land, off every plot the road uses (laid or not), clear of every building. A building that stands never locks again. Each action reads the island and the Storehouse as they are and refuses what the family cannot pay, so the inventory never goes below 0 on a device; across devices `foldInventory` clamps at 0.
    - A new building writes `building.placed`, then `material.spent` with `purpose: { kind: 'build', ref: instanceId }` (none for an empty recipe), then the arrivals. A resident arrives (`resident.arrived`, `via` = its `arrival.via`, `homeInstanceId` = the instance of its `arrival.home`, else null) when its own `arrival.unlock` rule holds over the family's facts; the starter buddies never arrive. A building level names the residents it brings (`resident:<id>`) and their rules say the same, so one rule serves homes, the road and the ferry (no ticket mechanic yet). Arrivals are settled from the island as it is (`settleResidents`), after each build and each road stone and when the island opens, so an interruption between a placement and its arrival is made good on the next visit. One pass runs at a time per store, so an arrival is written once; when a pass brings someone (a road stone, the island opening) the island plans again, as after a build. An upgrade writes `building.upgraded`, `material.spent` with `kind: 'upgrade'`, and the level's residents. A shared project (`kind: 'project'`) spends with `purpose: { kind: 'project', ref: buildingId }` for both, which is what `IslandState.projects` sums. The thing built is written before its cost.
    - **The Numbered Road.** The next stone is the first road entry past `roadLength`, and it can be laid only on open land. Laying it writes `road.extended { to: n }`, then `material.spent` of one `stone` with `purpose: { kind: 'build', ref: 'road' }`. The island then counts on aloud along the last stones up to the new one (at most five), one at a time (`IslandScene`'s `counting`): a stone stays the counted one until its step of the clock has passed and its number has been said in full.
    - **Unlock rules are family-wide** (05 §4 rule 7): `familyFacts` joins the island's facts with every live child's learner state. `skill` and `skillKind` hold when any child reaches the level (`ready` = any status but `locked`; `practiced` = `practiced`, `fluent`, `mastered` or `needs-review`; `mastered` = `masteredAt` is set), `minGrade` reads the highest profile grade, `masteredCount` the most skills one child has mastered. A locked card shows what it waits for: the building, the road length, or a star for a learner rule (`all` lists every unmet part, `any` its alternative with the fewest).
    - **The screen.** The build sheet (loaded when first opened) shows two recipe cards a page and never scrolls. A recipe line draws every unit it needs: the ones in the Storehouse in full, the missing ones as faint outlines; ten-frames for K, bundles of ten with the numeral from grade 1. Buying a new building closes the sheet and offers the plots as buttons over the scene's plot markers (at least 64 px, 12 px apart; where the map is small only plots whose targets keep that gap are offered). The construction step (4 s on an injectable clock, skippable) starts after the events are written. While a plot is chosen, a building goes up or the road is counted, the requests step aside; after a build the island plans again.
  - **The island's layout (I01 part 4, `island/layout.ts`).** The controls stand around the map: a top row (Home, who is playing with the island's name, the guide's line and its speaker), a left column (Decorate; the island's sign while it has no name), a right column (Storehouse, Build, the next stone) and the request row at the very bottom between the family's avatars and the parent gate (above them where it does not fit there: portrait, a large family). The land's box (the open plots, with head room for a building on the back row) is scaled to fit the measured room between them, whole and centred, and the sea fills the screen behind every control. The request row's place is kept while the requests step aside, so the map does not move. At 960 × 600 and 1280 × 800 no request and no line of the guide covers a building, a badge, a road stone or an offered plot (e2e `island-layout.spec.ts`).
  - **The warmup and `reward.decor` (I01 part 4).** No planner change. `planIslandRequests` returns the plan's requests and its `warmup` task (null when the pier cannot show it). The island puts the warmup before the first request the child picks in a session, whichever it is: the planner counts the warmup in every request's first run. While the warmup is a lesson (04 §6.1 (e): nothing attempted yet, and the plan's requests leave that lesson out), it goes before every request until it has been played. `planIslandRequests` also passes the game's `source: 'puzzle'` decor as `puzzleDecor`, and a request that ends `complete` writes one `collection.unlocked { kind: 'decor', id }` per `reward.decor` entry (`WorkshopHost`), after `request.completed`.
  - **Decorate mode (I01 part 4, `island/decorate`).** No `packages/shared` type changes, and `foldIsland` is as it was.
    - **The decor cap.** The family has on the island at most what it owns of each decor (`CollectionState.decorOwned`). An owned piece has a fixed instance id, `<decorId>-<n>` with n from 1 to the count owned, so two devices that place the same piece while apart write the same instance and the fold keeps one (the later `decor.placed` or `decor.moved` gives its plot). `decorItems(gameData, island, collection)` is the view: an owned instance stands when its footprint lies on open land, off every plot the road uses and clear of every building and of the decor that stood before it (by `ts`, then instance id). Anything else in `IslandState.decor` (an instance the family does not own, a piece under a building that came from another device) is not drawn and is back in the tray, from where it can be placed again.
    - **Events.** Placing writes `decor.placed` when the island has no such instance, else `decor.moved`; putting a piece away writes `decor.removed`. Each action reads the island and the collection as they are and refuses a plot that is not free. No material is spent.
    - **The non-math time cap (05 §8).** The time outside workshops (the island: building, decorating, choosing) may be at most 25% of the session's active time so far: `nonMathLeft(activeMs, islandMs) = max(0, (0.25 · activeMs − islandMs) / 0.75)`. The hub state counts island time on the session's clock (`SessionController.activeMs()`). With nothing left, Decorate does not open and the guide says that decorating is open after the next request ("Decorating is open after you help a friend!", the island's words for a request, all on the K–1 word list); while it is open, a timer on the island's clock (`buildClock`, injected in tests) ends it when the cap is reached. So decorating opens after the first request, and each request earns more. The cap is per session; the parent's free-build period (05 §8) is not built.
    - **The screen.** The tray stands in the request row's place: every owned piece as a picture button (72 px, 12 px apart, paged, never scrolled), ringed when it is on the island. A tap takes a piece in hand and the island offers the plots where it fits (the plot buttons of building); a piece on the map can also be pressed and dragged, and snaps to the nearest offered plot. The tray, the decor layer of the map and the naming sheet are separate chunks, loaded when first needed.
  - **The island's name (I01 part 4, `island/naming`).** `GameData.island` gains an optional `names: { name; say; welcome }[]` (§5.8; `game/island.yaml`): the names a child may give the island, plain names made from things on it ("Shell Island", "Lantern Island", "Stone Island", "Garden Island", "Lighthouse Island", "Boat Island"), each with its spoken lines (`game.island.name.<name>`, `game.island.welcome.<name>`), because free text is never read aloud (03 §8.4). The compiler checks that each name is listed once and that its lines exist (V02, V16). While `IslandState.name` is null the island's sign offers the names; choosing one writes `island.named { name }` unless a name arrived meanwhile. The name shows beside the child's, and each child is welcomed by name once per device. A name the game data no longer lists stays the island's name, without a line. The step does not block the requests; onboarding (OB1) can call it.
  - **Wind-down (I01 part 4, `island/recap.ts`).** The sunset shows and says what the child made in the session (`material.produced` of its `sessionId`, as the Storehouse's piles) and built since it began (the child's `building.placed`, `building.upgraded` and `road.extended`), then the goodbye, as one `sayPhrases` line; with nothing made or built, the goodbye alone. The picker returns `SUNSET_MS` after the recap has been said (or on "Okay").
  - **Not here:** parallax and the day/sunset cycle on the island, every road stone showing its numeral, a "learned things" line in the recap (06 §2), decor badges (`placedBy`), the parent's free-build period.
- **Not yet (#21):** AI feedback: the screen registers `onAiFeedback` right after the deterministic line, and it never calls back.

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
            road: { n: number; plot: Plot }[];                     // stone n → plot (n up to 1000)
            names?: { name: string; say: NarrationKey; welcome: NarrationKey }[] }; // names a child may give the island (05 §10 step 3)
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

Contract adjustment made by D01 (#15, clamp convergence, 2026-11-18):

| # | Change | Why |
|---|---|---|
| S3 | **Clamp echo.** `SyncResponse` gains a required `clamped: SyncClampedEvent[]` (`{ id: EventId; ts; clientTs? }`, schema `syncClampedEventSchema`, at most 500). For every pushed event in `accepted` that the server stores, tombstone relays included, it holds the stored `ts` and `clientTs` when they differ from the pushed copy's, in `accepted` order. Only a stored copy of the same event counts, judged by the rules that accepted the push: the same type and child, or, for a tombstone relay, the same deleted child. A row holding the id for another event is never echoed. Usually that is this push's 08 §4 clamp. It can also be the copy an earlier push stored under that id, for example when a device re-pushes after losing a response, or pushes an id again with another `ts`. A deleted child's events are acknowledged but not stored (S2), so they are never listed. The server reads the values back after its insert, so they are exactly what other devices pull. The client replaces its local copy's `ts` and `clientTs` with them (dropping `clientTs` when absent) and rebuilds its projections. Folds keep ordering by the server-bounded `ts` and never by `clientTs` (§4.3). | The pull never returns a device its own events and the push acknowledged ids only, so a device that pushed an event dated more than 24 h ahead kept folding the unclamped `ts` and never converged with the family's other devices. |

Contract adjustment made by #50 (per-voice clip sets, 2026-11-18):

| # | Change | Why |
|---|---|---|
| V1 | **Voice-qualified clip ids.** *New* `voiceClipId(clip: ClipId, voice: NarrationVoice): ClipId` in `packages/shared/src/audio.ts`: the clip id unchanged for `narrator`, `<voice>:<clip>` otherwise. The manifest shape and `ClipId` stay as they were, and every existing id is the narrator's. The AudioManager tries a clip-set word in the line's voice before the narrator's (§5.5). | 03 §8.3 renders clip sets once per voice, but the clip ids carried no voice, so Pip's and Glim's lines stitched numbers in the narrator's voice (07 §3). |

Contract adjustment made by K01 (#11, constructed practice for position words, 2026-11-19):

| # | Change | Why |
|---|---|---|
| K1 | **`shape-compose` at the pictorial tier.** `FORMAT_SUPPORT['shape-compose'].tiers` is `[C, P]` (was `[C]`; 03 §5.5). Nothing else changes: the config, ops and answers are the same at both tiers. GEO.05.t3 is place-relative at the pictorial tier: the scene is a flat drawing of the anchor and item instead of objects on a table, and the child still drags the item to the named position. **#14 (U05) must render `shape-compose` place-relative at the pictorial tier** (a drawn scene, drag to the named position); `packages/engine/test/fixtures/geo05-t3-pictorial.json` is a generated GEO.05.t3 item to build against. | Only constructed-answer attempts are practiced evidence (04 §3, §7a), and a standard skill needs two formats or tiers among them, one pictorial or abstract (content-check V27). GEO.05's only constructed format is place-relative, so with a concrete-only `shape-compose` it could become practiced only through its test-out. |

Contract adjustment made by K01 (#11, strategy praise, 2026-11-18):

| # | Change | Why |
|---|---|---|
| K2 | **Strategy ids and `detectStrategies`.** *New* `StrategyId` (`strategy.kebab-case`, §4.1) with `strategyIdSchema`, `STRATEGY_ID_PATTERN` and `STRATEGY_IDS` (`strategy.counted-on`, `strategy.made-ten`, `strategy.used-doubles`) in `packages/shared/src/ids.ts`. *New* engine export `detectStrategies(item, r, meta): StrategyId[]` (§5.2), pure and deterministic. It reports strategies only for correct responses, and never when the trace shows `MC.count-all-instead`. Each strategy has a `fb.praise.<name>` line in `narration/common.yaml`. `detectProcessMisconceptions` and `MisconceptionId` are unchanged and stay misconception-only. The detector definitions are in `packages/engine/src/strategies/index.ts` and 03 §5.7. | 03 §5.7 had "a process detector" report strategies, but the only process detector returns `MisconceptionId[]`. A strategy is not a misconception: it must not reach `AttemptPayload.misconceptionIds`, the 04 §6.4 remediation, or the misconception alerts. |

Contract adjustment made by K02 (#17 slice 4d, grade 2 story problems, 2026-11-26):

| # | Change | Why |
|---|---|---|
| K3 | **Two-step bar models.** The `bar-model` `StimulusSpec` (03 §5.1) gains an optional `lower: { parts; whole }`, a second bar drawn under the first, and its amounts may be `null` (only with `lower`): the first step's result, a blank piece both bars share, never told. `stimulusSpecSchema` accepts `null` in `parts` and `whole` and the `lower` object; the story-problem format accepts a `bar-model` scene (1–3 parts a bar, numbers 1–999, at least one `"?"`, a comparison or a second bar but not both, and `null` in both bars or neither). Existing specs are unchanged. | MDA.19's two-step stories show the order of their steps: what is found first feeds the second bar (story.twostep). |

## 6. Performance budgets (enforced in CI where possible)

- Initial JS (app shell + island) ≤ 350 KB gzip; each workshop chunk ≤ 120 KB gzip; Pixi chunk loads only when needed. **Content JSON (`dist/*.json`) is never bundled into JS**: it is fetched as a precached static asset at startup.
- Time to interactive on a mid-range Android tablet (emulated 4× CPU slowdown) ≤ 3 s from warm cache. CI **reports** this number but does not fail on it (too noisy); Q01 verifies it.
- 60 fps target and 30 fps floor for island pan and widget drags. At most one WebGL canvas alive at a time.
- Precache size (shell + content + K–3 narration audio, Opus) ≤ 60 MB.

### 6a. The engine's loading boundary (#95, 2026-11-20)

The engine has two entries, so the initial JS budget does not grow with the curriculum:

| Entry | Holds | Who imports it |
|---|---|---|
| `@number-island/engine/shell` | The skill graph builder, the event folds, the learner model, the signals, the seeded RNG and the engine parameters. No generator, state checker, misconception rule or format model. | The app shell, statically: `apps/web` code that runs at startup, and any `packages/ui` module the shell imports statically. |
| `@number-island/engine` (the full entry) | Everything, including the **item core**: the generator registry, item generation and checking, the state checkers, the misconception rules, the format models, the planner and the placement runner. | Node code (tools, tests, the simulator), lazily loaded widget and workshop modules, and the shell through a dynamic import only. |

- **The port.** The learner model needs two things from the item core: an attempt's item difficulty, rebuilt through its template's generator (04 §2.2), and whether a template's items take a constructed answer (04 §7a). It reads them through `ItemCore` (`packages/engine/src/item-core.ts`). Loading the full entry installs it. There is no fallback: `createEloFireModel`, `learnerModelFor` and `foldLearnerState` throw `ItemCoreNotLoadedError` until the full entry is loaded, because a fold without the item core would store a different learner state.
- **When it loads.** `apps/web` loads the full entry during boot (`boot/itemCore.ts`), next to the content fetch and before it opens the data store. Boot then binds the content to it (`initContent`, §5.6). So the first task of a session never waits for it, and no screen has a loading state of its own for it. A chunk that cannot be fetched is reported like content that cannot (`content_unreachable`).
- **Offline.** The item core is an ordinary build asset (`dist/assets/*.js`). Starting offline needs it precached, like the rest of the shell, and that arrives with W00's precache (PR #68), whose glob `**/*.{html,js,css,woff2,svg,png}` covers the chunk with no change. Until #68 is merged the service worker precaches nothing (`globPatterns: []`), so no asset, this chunk included, is guaranteed offline: boot fetching it on every launch only leaves it in the HTTP cache. #68 should assert that the generated precache lists the item-core chunk (`dist/bundle-size-report.json` names its file).
- **Enforcement.** Three checks, each for one way in:
  - `pnpm bundle-size` fails when one of the three registry markers (`ITEM_CORE_MARKS`) is in an initial JS file, and reports the size of the chunk that holds them. The full entry always runs `items/install.ts`, which names all three markers, so any static import of the full entry from the shell fails this check.
  - `packages/engine/test/shell-boundary.test.ts` checks that the shell entry reaches no item-core module through static imports.
  - `pnpm lint` (`scripts/check-boundaries.mjs`) refuses a relative import into another workspace package, so no module can pull a single generator or checker into its own chunk past the markers.
  - The item core has no budget of its own; the 350 KB and 120 KB budgets above are unchanged.
- **Open for the first workshop (W01).** `pnpm bundle-size` charges a workshop chunk for every static import beyond the initial JS. A workshop that imports the full entry statically would be charged the whole item core, although boot has already loaded it. How the item core counts against the workshop budget is decided with the first workshop chunk.

## 7. Conventions

- All randomness flows through the seeded RNG in `engine/rng.ts` (no `Math.random` in engine or content code).
- Time comes in as a parameter to pure functions (no `Date.now()` inside the engine).
- User-facing strings for children live in narration YAML (one key per line), never inline in components. Parent-area strings may be inline (English only in v1).
- Feature flags live in `settings` (family level): `ai.feedback`, `ai.feedbackMode` (`phrases`|`text`), `ai.avatarPhoto`, `ai.parentSummary`, `timedChallenges`, `music`.
- Commits and PRs reference issues as `Refs #N`.
