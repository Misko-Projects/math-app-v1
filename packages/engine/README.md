# @number-island/engine

The pure TypeScript engine (02 §2): no DOM, React, Dexie or Node built-ins, no `Math.random` and no `Date.now`. Randomness comes from the seeded RNG, and time is passed in as a parameter. `pnpm lint` (`scripts/check-boundaries.mjs`) enforces this. It runs in the web app, the API and tests.

E01 (#7) delivers the item core: the RNG, the generator registry, item generation and difficulty targeting, response checking, misconception matching, hint ladders, the state models and widget schemas of the 11 fixture formats, and the hooks `tools/content-check` uses. E02 (#10) adds the learner model and its fold in `src/learner`, the projections in `src/folds` and the dashboard signals in `src/signals`; the session planner (E03) lands in `src/planner`.

Source of truth: `docs/spec/02-architecture.md` §5.2 and §7, and `docs/spec/03-curriculum.md` §5–§7 and §9.

## API

```ts
import {
  initContent, generateItem, checkResponse, detectProcessMisconceptions,
  itemKey, itemSolution, itemExampleCorrect, replaySteps, formatModel, render,
} from '@number-island/engine';

// 1. Bind the compiled content once at startup (web app, API, tests).
initContent({ templates, narration, misconceptions, templateStats }); // packages/content/dist/*.json

// 2. Generate. Same (template, seed, target) → deep-equal item on every device.
const item = generateItem(template, seed);                   // untargeted
const near = generateItem(template, seed, { difficulty: d }); // 24 candidates, closest to d* (04 §2.4)

// 3. Check. Pure; partialCredit is 1 or 0 (the TaskRunner applies hint credit).
const result = checkResponse(item, response);  // { correct, partialCredit, misconceptionIds, feedback, closeness? }
const process = detectProcessMisconceptions(item, response, { latencyMs, trace }); // may tag correct answers

// Repeats, lessons and demo mode
itemKey(item);                        // templateId + ':' + canonical params
const steps = itemSolution(item);     // LessonStep[]: hint level 5 and auto lessons
replaySteps(item, steps);             // the response the widget would submit after the steps
formatModel(item.widget.format);      // { configSchema, initialState, apply, toResponse, features }
```

| Export | What it does |
|---|---|
| `createRng(seed)`, `Rng` | `xoshiro128**` seeded through `splitmix32`, 32-bit integer operations only: `int`, `float`, `bool`, `pick`, `weighted`, `shuffle` (a copy) and `fork(label)` (an independent stream that does not advance the parent). |
| `initContent`, `resetContent` | Bind or unbind the compiled templates, narration, misconceptions and `template-stats.json`. |
| `generateItem(t, seed, target?)` | 03 §5.3, implemented once for every generator. It merges the generator's param defaults with the template's params, draws by rejection sampling (constraints plus the generator's `accepts`), builds, and computes `difficulty`. With a target it builds 24 candidates (odd ones use `sampleToward` when the generator has it) and returns the closest. A target outside the template's `[p10, p90]` emits a dev-only `difficulty.miss` through `setDevLogger`. Throws `GenerationError` when nothing satisfies the constraints. |
| `generateItemFromParams(t, params, opts?)` | Builds from fixed params (authored lesson examples, misconception examples). |
| `checkResponse(item, r)` | 03 §5.7. Answer and state misconception rules run on incorrect responses only, sorted by priority (descending) then id. When two rules predict the same response, only the higher-priority one is tagged. Feedback is `fb.correct.<1 + seed mod 6>`, the first misconception's `feedback`, or `fb.<format>.retry`. |
| `detectProcessMisconceptions(item, r, meta)` | Process rules (trace and latency). The runner merges these ids with `checkResponse`'s. |
| `difficulty`, `featureWeight`, `resolvedWeights` | 03 §5.4: `d = base + Σ w·x`, with the weight resolved template → generator → format. |
| `buildHints` | 03 §5.8 ladder: 1 replay, 2 nudge, 3 representation (an overlay off the concrete tier, a highlight on it), 4 worked step (the first half of the solution, never its last step), 5 show me. Missing template hint keys skip their levels; each rung keeps its level number. |
| `formatModel`, `formatModels`, `formatFeatures` | Format state models (03 §6.3) and format features (03 §5.5). |
| `stateChecker(id)` | State checkers (03 §5.7). |
| `misconceptionRule`, `applicableMisconceptions`, `itemGenerator` | Misconception rules (03 §7.1). An item's generator is resolved through its bound template (02 §5.9 E3). |
| `render(key, vars)` | 03 §8.4 display text (thousands commas, `25¢`, `$1.25`, `0.47`, nouns, units, names). |
| `generatorRegistered`, `generatorParams`, `generatorFeatures`, `generatorIdentifiers` | 03 §9.3 hooks for `tools/content-check`. |
| `createEloFireModel(graph, { childId, isK })` | The 02 §5.3 `LearnerModel` `elo-fire-v1` (04 §2–§5): `init`, `apply`, `predict`, `status`, `dueReviews`, `frontier`, plus `applyPlacement`, `applyPlacementProbe`, `applyOverride`, `startSession`, `skillOffset`, `pRef`, `retrievability`, `expectedLatency`. Readings the spec left open are in 04 §7a. |
| `foldSkillStates`, `foldLearnerState`, `applyLearnerEvent` | The learner projection (02 §4.3): order-independent (sorted by `ts`, then `id`, duplicate ids once), and incremental. |
| `buildSkillGraph(input)` | The 02 §5.8 `SkillGraph` from `skills.json`, `templates.json`, `graph.json` and `template-stats.json`. |
| `compressReviews`, `reviewContext` | 04 §4 review compression and transfer probes, for the planner. |
| `PARAMS`, `DAY_MS` | Every 04 parameter, in `src/params.ts`. |
| `sortEvents`, `compareEvents`, `isEvent`, `sameId` | Event ordering (each id once) and case-insensitive ids, shared by every fold. |
| `foldIsland`, `foldInventory`, `foldCollection`, `foldGoals` (+ `initX`, `applyXEvent`) | The 02 §4.3 projections, with the readings recorded there (tombstones purge, buildings never un-built, inventory clamped at 0). |
| `evaluateUnlock(rule, facts)`, `islandFacts(state)` | 02 §5.8 `UnlockRule` evaluation; learner facts are optional. |
| `skillMap`, `misconceptionAlerts`, `timeSignals`, `accuracyBand`, `mathDensity` | 04 §7 dashboard signals. |
| `@number-island/engine/testing`: `runTemplateProperties`, `difficultyStats`, `propertyN` | The 03 §9.4 property test and the 03 §9.2 statistics, for Vitest and `tools/content-check`. Node and tests only: this entry uses fast-check and is never imported by the app. |

## Layout

```
src/rng.ts                       seeded RNG
src/content/                     initContent binding, constraint grammar (shared with the compiler), render
src/generators/index.ts          the registry: one line per generator
src/generators/<family>/<name>.ts  GeneratorDef implementations
src/generators/common.ts         ParamSpec sampling, numeric pick options, vars, output assembly
src/items/                       generateItem, checkResponse, difficulty, hints, solutions
src/formats/<format>.ts          state model + widget schema + format features, one per format
src/check/state/<id>.ts          state checkers
src/misconceptions/rules/<id>.ts misconception rules; index.ts is the registry
src/params.ts                    every 04 parameter
src/learner/                     elo-fire-v1 model, the learner fold, SkillGraph builder, review helpers
src/folds/                       island, inventory, collection, goals folds; event ordering; unlock rules
src/signals/                     04 §7 dashboard signals
src/testing/                     the property test and statistics (the /testing entry)
test/                            Node tests over the fixture content, compiled in memory (no dist needed)
test/golden/                     the recorded 2,000+ event replay log and its snapshot (UPDATE_GOLDEN=1 re-records)
```

## Adding a generator (03 §10.2)

1. Create `src/generators/<family>/<name>.ts` that exports a `GeneratorDef` (`src/generators/types.ts`). It needs:
   - `params`: every param it accepts, with a type, a default `ParamSpec` and a doc line. Use the canonical names of 03 §5.6 (`a`, `b`, `op`, `unknown`, `result`, …), because misconception rules read them.
   - `derived`: the names constraints may use besides the params (e.g. `result`).
   - `features`: the math features with default weights and docs. Every feature is 0 for the easiest item.
   - `narration`: every `gen.<id>.<step>` key its solutions say. Add each line to `packages/content/narration/common.yaml`.
   - `sample(spec, rng)`: use `sampleAll` from `common.ts`, and enforce families by drawing *within* the template's domains, never by overriding them.
   - `derive(p)` and optionally `accepts(p, t)` for validity the template's constraints don't express (rejected draws are drawn again).
   - `build(ctx)`: one branch per format. Return through `finish()`, which adds the format features and builds the hint ladder from your `solution`. Draw layout randomness only from `rng.fork(...)`, so it never changes the math. Fill `vars` with `pickVars(template, pool)`, so only the slots the lines use reach the UI.
   - `exampleCorrect(out)`: a correct response built directly, not by replaying the solution.
   - `solution(out)`: `LessonStep[]` whose actions, replayed through the format's state model, produce a correct response. The final step enters the answer.
   - `sampleToward` when the parameter space is large or lumpy (03 §5.4).
2. Register it with one line in `src/generators/index.ts`.
3. Add its row to 03 §5.6 in the same PR.
4. Add unit tests (fixed params → answer, widget and solution per format; feature values at the extremes). `test/fixture.property.test.ts` and `pnpm content:validate` (V15) run the 03 §9.4 property test on every template that uses it.
5. Add any misconception rules it needs in `src/misconceptions/rules/`, registered in `src/misconceptions/index.ts`, with tests that include non-discriminating items (`predict` returns `null` when the buggy answer equals the correct one).

## Adding a format model (U03–U05)

Create `src/formats/<format>.ts` exporting a `FormatModel`: `configSchema` (the shared `WidgetConfig` schema plus the semantic rules the widget relies on), `features` and `featureValues` (03 §5.5), and the pure `initialState`, `apply` and `toResponse`. Support every demo op the format lists in `FORMAT_SUPPORT[format].ops`, plus the generic `answer` op (`{ value }`, `{ values }` or `{ id }`), which enters the final answer the way the widget's answer control does. Register it with one line in `src/formats/index.ts`. Add each state checker the format needs in `src/check/state/<id>.ts`, with table tests that include at least one alternative valid end state and the checker's near-miss `exempt` rule.

## Conventions the fixture formats fix (E01)

- **Trace targets.** Countable objects are `obj-<i>` (reading order). Addend counters are `counter-<i>`: `0 … a − 1` for the first addend, then the second.
- **Numeric pick options** use ids `opt-<n>`, so a pick reads back as a number.
- **make-set** responds with `{ count, removed, parts?, bundles? }`. Removed objects wait in a pile beside the container, and dragging takes from that pile first, so a child can put objects back. `removed` is the pile's current size. `parts` is `[left hand, right hand]` for the `hands` container and `[in the container, in the pile]` for `take-away`, which is how a two-part split is shown.
- **tenframe-fill** responds with `{ cells, value? }`, where each cell is 0 (empty), 1 (colour a) or 2 (colour b). A split is shown on two frames, one part per frame (as the authored CPS.02 lesson does); on a single frame the two colours are the parts. `fill` answers on the hundred chart follow reading order.
- **number-bond** split and new-way respond with `{ parts }`. `rekenrek` responds with `{ rows, value? }`, and `number-line-jump` with `{ jumps, value? }`.
- `bond.split` and `bond.newWay` read the two parts from any of these shapes.

## Conventions the geo generators fix (K01)

The shape-sort, shape-compose, compare and puzzle-grid format models belong to U03–U05; until they land, the property test checks these widgets against the shared schema and skips the solution replay. The response shapes the K01 checkers read:

- **shape-sort** cards have ids `c0`, `c1`, … in display order. `sort` responds `{ bins: Record<binId, cardId[]> }` (a card in no bin is in the tray; `sort.byRule`). `find-all` responds `{ ids }` (`select.exactSet`, which also still takes numeric `{ values }`). `odd-one-out` answers `choice` with a card id. Demo ops: `drag-card {id, bin}` (no `bin` in find-all: select the card), `highlight-attribute {id, prop}`, generic `answer {id}`.
- **compare** answers `left`, `right` or `same`; demo ops `highlight {side}`, then `answer {id}`.
- **shape-compose fill-outline** (`compose.fill`): pieces and outlines use `src/check/state/pieces.ts` (x right, y up, one unit = one block side). A placed piece is `{ kind, at: [x, y], rot }`: its canonical corners, corner 0 at the origin, turned `rot` degrees counterclockwise, then moved so corner 0 is at `at`. Response `{ pieces: placed[] }`; widget piece ids are `p-<kind>`; demo op `drag-piece {id, to, rot}`. Outlines are `src/generators/geo/outlines.ts` (mirrored in `packages/content/outlines.yaml`).
- **shape-compose place-relative** (`compose.relative`): scene units 100 × 60, x right, y down; anchor sizes are `ANCHOR_SIZE` in `src/generators/geo/position.ts`. Response `{ at: [x, y], layer?: 'front' | 'back' }`; demo ops `highlight-region {relation}`, `drag-piece {id: item, to, rot, layer}`.
- **shape-compose draw-on-grid / build-sticks** (`grid.polygon`): response `{ points: [x, y][] }`, the corners in drawing order on integer dots (in build-sticks, where the sticks meet). Demo op `draw-edge {from, to}` (in build-sticks it lays a stick).
- **puzzle-grid shape-fill** (`puzzle.satisfies`): response `{ fill: string[][] }`; demo op `fill {r, c, value}`.

## Conventions K01 fixes for the formats without models yet (U03–U05 build the models)

- **measure-length** `iterate` responds with `{ units, value }`: `units` lists where each laid unit starts, in unit lengths from the object's start (any order); `value` is the typed count. `units.iterate` accepts drift up to `gapTolerance` (0.1 unit) per unit. Solutions use `lay-unit {index}` (plus `unit` in `two-units`), `count-units`, `align-zero`, `read-end` and end with `answer`. Non-standard units are drawn to scale: cube 1, shell 2, stick 4 (`NONSTANDARD_UNIT_SIZE` in `generators/mea/length.ts`).
- **compare-length** objects have ids `obj-<i>` in display order; `longer`, `shorter` and `indirect` answer with that id.
- **compare** and **balance** `which-heavier` answer `left`, `right` or `same`. `mea.length` draws a length compare (the `ruler` representation) as two number-line strips from 0 on one scale, with the object's end marked.
- Solution steps before the last never highlight the answer: the worked-step hint (level 4) plays them.

## Tests

- `pnpm exec vitest run --project engine`: unit tests under `src/` and the fixture property test under `test/`. Seeds come from `CONTENT_PROPERTY_N`: 50 locally, 100 on PR CI, 500 nightly.
- `pnpm content:validate` also runs the property test on every template, through `tools/content-check`.
