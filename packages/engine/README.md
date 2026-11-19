# @number-island/engine

The pure TypeScript engine (02 §2): no DOM, React, Dexie or Node built-ins, no `Math.random` and no `Date.now`. Randomness comes from the seeded RNG, and time is passed in as a parameter. `pnpm lint` (`scripts/check-boundaries.mjs`) enforces this. It runs in the web app, the API and tests.

E01 (#7) delivers the item core: the RNG, the generator registry, item generation and difficulty targeting, response checking, misconception matching, hint ladders, the state models and widget schemas of the 11 fixture formats, and the hooks `tools/content-check` uses. E02 (#10) adds the learner model and its fold in `src/learner`, the projections in `src/folds` and the dashboard signals in `src/signals`; E03 (#16) adds the session planner and `targetDifficulty` in `src/planner`.

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
const praise = detectStrategies(item, response, { latencyMs, trace }); // StrategyId[]; correct answers only

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
| `detectProcessMisconceptions(item, r, meta)` | Process rules (trace and latency). The runner merges these ids with `checkResponse`'s. It returns misconception ids only. |
| `detectStrategies(item, r, meta)` | 03 §5.7 strategy praise (02 §5.9 K2): the `StrategyId`s a correct response shows (`strategy.counted-on`, `strategy.made-ten`, `strategy.used-doubles`), in `STRATEGY_IDS` order. The runner may play `fb.praise.<name>` for the first one instead of `fb.correct.*`. The detectors are defined in `src/strategies/index.ts`. |
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
| `startPlacement`, `nextProbe`, `recordProbe`, `beginPlacementSession`, `completePlacement`, `resumePlacement`, `placementBudget` | The 04 §5 placement runner over a plain, serialisable `PlacementRun`: grade priors, probe selection, BKT update and graph propagation, stop rules, item budgets per mini-session, per-strand mini-placements, the `placement.probe` / `placement.completed` payloads, and resume from the child's event log (its probes and session starts, in fold order). Readings are in 04 §7b. |
| `planSession(input, opts?)` | The 02 §5.4 session planner (04 §6.1–§6.3, §6.5): a warmup, then 2–3 alternative requests. Each request is bound to a workshop that hosts every task's format (Practice Pier fallback), voiced by a resident, and rewarded with materials, plus decor for challenge items. Its tasks hold the focus skill's lesson or test-out, interleaved new items, compressed reviews and challenge items, never more than 3 items of one skill in a row. `opts`: `puzzleDecor` (GameData decor with `source: 'puzzle'`) and `remediation` (from `adaptNext`). Pure and seeded; readings in 04 §7b. |
| `targetDifficulty(state, skill, context, child, graph?)`, `targetSuccess` | 04 §2.4 d\* = θg + θs − logit(p\*) + the rolling success offset, at presentation time. |
| `adaptNext(input)`, `probeSeed`, `confidenceSeed`, `stepDownTier` | The 02 §5.4 / §5.8 in-session adaptation (04 §6.4): retry with the hint ladder, show-solution, wind-down, frustration (a confidence item, then a break offer or a gentle end), prerequisite probe, tier step-down and the misconception remediation side effect. The `TaskRunner` calling protocol is in 04 §7b. |
| `rankNewSkills`, `neededTemplates`, `PRACTICE_PIER`, `RHYTHM_ORCHARD`, `PUZZLE_TOWER` | §6.2 new-skill ranking, the evidence templates a skill still needs, and the workshop ids the planner treats specially. |
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
src/placement/                   04 §5 placement runner
src/planner/                     04 §2.4, §6 session planner and difficulty targets
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
- **shape-compose fill-outline** (`compose.fill`): pieces and outlines use `src/check/state/pieces.ts` (x right, y up, one unit = one block side). A placed piece is `{ kind, at: [x, y], rot }`: its canonical corners, corner 0 at the origin, turned `rot` degrees counterclockwise, then moved so corner 0 is at `at`. Response `{ pieces: placed[] }`; widget piece ids are `p-<kind>`; demo op `drag-piece {id, to, rot}`. Outlines are `src/generators/geo/outlines.ts` (mirrored in `packages/content/outlines.yaml`). Coverage is the exact area of the union of the pieces inside the outline (`unionInside`: inclusion–exclusion over every subset of overlapping pieces, so three-way overlaps count correctly), not the sum of piece areas. Numeral-pick only draws outlines that its target card (the named kind at `resultScale`) is exactly (`drawsAsCard` in `generators/geo/compose.ts`). Fill-outline is the same config at the concrete and pictorial tiers (GEO.10–11.t4 are pictorial, 02 §5.9 K1).
- **shape-compose place-relative** (`compose.relative`): scene units 100 × 60, x right, y down; anchor sizes are `ANCHOR_SIZE` in `src/generators/geo/position.ts`. Response `{ at: [x, y], layer?: 'front' | 'back' }`; demo ops `highlight-region {relation}`, `drag-piece {id: item, to, rot, layer}`.
- **shape-compose draw-on-grid / build-sticks** (`grid.polygon`): response `{ points: [x, y][] }`, the corners in drawing order on integer dots (in build-sticks, where the sticks meet). Demo op `draw-edge {from, to}` (in build-sticks it lays a stick).
- **puzzle-grid shape-fill** (`puzzle.satisfies`): response `{ fill: string[][] }`; demo op `fill {r, c, value}`.

## Conventions K01 fixes for its generators' formats (U03–U05 own the models)

- **measure-length** `iterate` responds with `{ units, value }`: `units` lists where each laid unit starts, in unit lengths from the object's start (any order); `value` is the typed count. `units.iterate` accepts drift up to `gapTolerance` (0.1 unit) per unit, and the last unit must end within `gapTolerance` of the object's end. Solutions use `lay-unit {index}` (plus `unit` in `two-units`), `count-units`, `align-zero`, `read-end` and end with `answer`. Non-standard units are drawn to scale: cube 1, shell 2, stick 4 (`NONSTANDARD_UNIT_SIZE` in `generators/mea/length.ts`).
- **compare-length** objects have ids `obj-<i>` in display order; `longer`, `shorter` and `indirect` answer with that id.
- **compare** and **balance** `which-heavier` answer `left`, `right` or `same`. `mea.length` draws a length compare (the `ruler` representation) as two number-line strips from 0 on one scale, with the object's end marked.
- **order** picture items (`mea.length` with the `ruler` representation, `mea.massvolume`) carry a `stimulus` and no `label`: ruler strips on one scale, or one object picture each. Item ids are `obj-<i>` in display order and `value` is the length or weight step, so the response is still the values in slot order. Their solutions start with a line that places nothing (the worked-step hint plays it), then `drag {id, slot}` per slot.
- **shape-sort** `sort` with object cards (`mea.massvolume`): each card's props are `{ weight }` (the step), bins `b0` (`word.heavier`, `weight >= value + 1`) and `b1` (`word.lighter`, `weight <= value - 1`); `sort.byRule` as for the geo sorts.
- **Weight pictures** (`mea.massvolume` order and shape-sort) carry no numeral, so they only ask comparisons in `CLEARLY_LIGHTER` (`generators/mea/massvolume.ts`): every pair in an order row, and every sort card against the object it is sorted by. Neighbouring steps such as a rock and a melon are never asked.
- **number-pad** (`count.ordinal` `ask: after`): the ordinal `after` pad shows no stimulus. It has blank `n` and ends with `type {blank: n, value}`.
- Solution steps before the last never highlight the answer: the worked-step hint (level 4) plays them.
- **compare** groups (`compare.sets`): left is `a`, right is `b`. On a conflict item one side is an `objects` set with `sizeVaries: true` and `layout: line` (bigger objects spread along the whole side) and the other `layout: array` with two rows (bunched); MC.perceptual-size reads `sizeVaries`. The dots representation is an `objects` set with the `dot` sprite, so the same cue works (the art kit needs a plain `dot` sprite). The concrete tier allows match lines; solutions use `match {left, right}` for the first pair, then `answer {id}`. Symbol items end with `place-symbol {symbol}`.
- **number-line pictures** (a `number-line` stimulus: numberline.place numeral-pick, number-pad and order, estimate.quantity option lines, compare.numbers cards) label both ends: a line with no labels between gets `labelsEvery` max − min (`linePicture` / `pictureLabelsEvery` in `generators/numberline/line.ts`), because NumberLineView labels only multiples of `labelsEvery` and nothing for null. numberline.place rejects bare picture lines whose `min` is not a multiple of the range.
- **number-line-place**: `labelsEvery: null` labels only the two ends; `ticksEvery: null` draws no ticks. `read` shows the target as a marked tick. In `place` mode `benchmarks` (compare.numbers) are labelled reference marks to place the target among; in `closer` mode they are the two choices `b0`, `b1`. Solutions use `zoom {from, to}`, `show-tick {at}` and end with `drop {at}` (or `answer`).
- **numeral-pick** options may carry a `number-line` stimulus with an arrow and no label (numberline.place with the `symbols` representation, estimate.quantity with `number-line`): the child picks the line, and the id is still `opt-<value>`.
- **order** cards that picture a quantity (frames, base-ten, objects, dots: `compare.numbers`, and the `compare.sets` groups) have no `label`, since a numeral would give the order away; path and line cards keep it. On a `compare.sets` conflict order item the fewest group is the `sizeVaries` line, the most the two-row array and the middle one a plain line; MC.perceptual-size predicts the order by those looks. Solutions drag each card into its slot (`drag {id, slot}`).
- **Typed estimates** answer `number` with a `tolerance`: estimate.quantity number-pad within 25% of n (as dot-flash), numberline.place number-pad on a line with no ticks within 10% of the line (`READ_ESTIMATE_PCT`, `readTolerance`), with the target at least that far from both ends so no accepted answer is off the line. The estimate pad is three digits wide for every n.
- **numeral-pick** estimate options (estimate.quantity) are always the rungs of `ESTIMATE_LADDER` (20, 50, 100), shuffled, so the options alone never name the answer. A numeral-pick n lies within 20% of one rung (`estimateRung`), which is the answer; every other option is at least 25% away from n, so the closest option is never in doubt.
- **make-set** (`compare.sets`) makes two groups the same: the boat starts with `a` (`add-more` or `take-away`) and the target `b` is named in the prompt, because MakeSetConfig has no second group to show.
- **base-ten-build** (`pv.number`) follows the U04 model and conventions below: `build` answers `baseten.value { value }` and `build-exact` `baseten.exact { value, exact }` (the canonical counts, or the regrouped ones with `nonCanonical`), with the mat `{ thousands, hundreds, tens, ones }` as the response. A `nonCanonical` `build` sets the tray `limits` one piece short at the lowest non-zero place and to none below it (34: 3 ones; 340: 3 tens, no ones), so no tray-only mat is worth the value and the child must split a piece (`forcedTrade`); the checker takes any mat worth the value. Solutions use `add-piece {kind, count}` per kind (largest first) and end with `count-by {kind}`; a forced trade takes one more piece of the next place up, then `split {kind}` and `add-piece {kind, count: −k}` (puts k back); `read` counts by each kind and ends with `answer {value}`.
- **expanded-form** (`pv.number`): `build` answers the chosen cards (unordered numbers, the non-zero place values; `cards` adds the digits in the wrong places, 1 and 40 for 14), `to-standard`, `fill`, `words` (the widget speaks the target's name; the child types the numeral) and `digit-value` answer a number. `digitIndex` and `highlight-digit {index}` count from the left (U04), while pv.number's `place` counts from the ones. Solutions use `place-card {value}`, `stack-cards`, `highlight-digit {index}` and end with `stack-cards` or `answer {value}`.
- **numeral-pick** words options (`pv.number`) carry `speak: num.<n>` and no label: the widget shows and speaks the number name, and the id is still `opt-<n>`.
- **MC.teen-reversal** reads these as asking for the number itself: the typed total after filling frames or sliding beads (`thenAsk`, `target.value`), the value of a base-ten build, and the number place-value cards make. Its prediction is the right build with the reversed total typed, the pieces of the reversed number, or its cards.
- **addsub.facts** (K01): a make-ten tenframe-fill starts with `a` colour-a counters in frame 0 and `b` colour-b counters in frame 1 and asks for the total (`tenframe.makeTen`); a make-ten rekenrek starts with `a` on the top row and `b` below, and a plus9 rekenrek puts the other addend (at most 10) on the bottom row; a fact whose preset would not fit two rows of ten is not a rekenrek item. Counting up to subtract is a `number-line-jump` with `goal: difference` from `b` to `a`, answering `{ jumps, value }` with the total jump; MC.count-start-number tags it only when the path lands on `a` and the typed total is one too many. The open number line (and `jumps: free`) allows hops of 1–10 in the item's direction; its near-double solution (`b = a + 1`) jumps `a` again to the double and then 1, the jumps `strategy.used-doubles` praises. **MC.forgot-the-ten** and **MC.wrong-operation** read the asked number the same way as MC.teen-reversal (`rules/asked.ts`): a built item predicts the right build with the wrong number typed.

### Equality and story problems (K01: equality.eq, story.addsub, addsub.three)

The balance, compare and story-problem formats have no engine model yet (U04, #13; U03, #12), so the property test checks these widgets against the shared schema and skips the solution replay. The response shapes and checkers K01 fixes:

- **balance** terms are numerals `{ n }` at the pictorial tier and objects `{ object, count }` (one unit each, `objectWeights`) at the concrete tier; operations are `{ op }` and the blank is `{ blank: 'x' }`.
  - `fill-blank` answers `number` (the blank). `judge` answers `true` | `false`: the blank shows the right number, or one off by `off` when `truth` is false. `which-heavier` answers `left` | `right` | `same`.
  - `make-equal` responds `{ left, right }`: the unit blocks (or objects) the child added to each pan. The checker `balance.equal` `{ left, right }` holds what each pan already weighs, and accepts any blocks that make the pans level (adding to both pans is an alternative). equality.eq leaves the blank off the right pan (`a + b = c + _`: the right pan holds `c`); compare.sets puts `a` and `b` objects on the pans (`ask: make`). The tilt shows at the concrete tier (compare.sets) or always (equality.eq). Pan values and added counts are whole, non-negative and at most `MAX_BLOCKS` (1000), so a float sum past 2^53 can never round two unequal pans level. The property test's near misses add or remove one block on a pan; the hint check treats the blocks the light pan needs as the answer.
  - Demo ops: `highlight-side {side}`, `place {side, term, count?}` (puts `count` copies of the term on the pan; on a `fill-blank` pan it fills the blank), `level`, `tilt`, and the generic `answer {value}` or `{id}`. Solutions end with `place` (make-equal) or `answer`.
- **compare** `true-false` (equality.eq) puts the whole statement on the left as an `expression` (`3 + 4 = 5 + 2`) with the right side `none`; it answers `true` | `false`. `same-or-not` (compare.sets `ask: same`, ALG.05) answers `same` | `not-same`. Both are answer sets the format fixes at two (03 §9.4 step 9).
- **story-problem** (`story.addsub`): `lines` are the story in telling order, `p.story.*` keys with their own vars; the last line asks the question. `{who|name}` is `@resident` (03 §4.6), `{item}` and `{other}` are contexts.yaml nouns, and `{many}` is 2, so a noun slot counted by `many` is plural. Each context speaks its own verbs (`p.story.<context>.*`); `generators/story/contexts.ts` mirrors the contexts it uses, and `test/story-contexts.test.ts` keeps it in step with contexts.yaml. The scene shows only the told quantities. One blank `x` answers `number`; `put-together/both` has blanks `x` and `y` and responds `{ parts: [x, y] }`, checked by `bond.split { whole, nonZero: true }` (any split); it tells only the whole `a`, so `b` is ignored (read as 0, sampled at its least value) and its hint picture is the bar of the whole with two unknown parts. Solutions use `highlight-line {index}`, `act-out {sprite, count}` or `show-scene`, and end with `answer {value}` (or `{ values }`).
- **number-pad** stories (`story.addsub`) carry the story in the template's prompt, so such a template fixes its situation and context. `ask: equation` shows `a op _ = _` with blanks `y` and `z`, answered `numbers [b, result]` (ordered).
- **numeral-pick** equations (`story.addsub`, ADD.23): option ids `eq-<x>-plus-<y>` / `eq-<x>-minus-<y>`, a `label` such as `5 + 2 = 7`, and `speak` `p.story.eq-plus` / `p.story.eq-minus` with vars `x`, `y`, `z`. The four options are the 2 × 2 grid x0 or x0 + 1 with y0 or y0 + 1, all true equations of one operation; the param `corner` (0–3, which the template draws) is the told equation's cell, so for every option set each option is the key of some draw and only the picture or story tells them apart. Every option number is 1 to `maxTold` (the template's a and b domains), and an addition grid never has x0 = y0, which would offer x + y beside y + x.
- **tenframe-fill** with three addends (`addsub.three`): `a` is prefilled in frame 0 and the config's `b` is b + c; the solution puts in a's ten partner first (or b and c together into frame 1 when they make ten), then counts (`tenframe.total` with the typed total). MC.count-all-instead counts `a + b + c` counters.
- **MC.equals-means-answer** predicts a op b on a two-sided fill-blank, the left side's answer added to the right pan on a two-sided make-equal, and `false` for a true judged equation that is not `a + b = c` (`_ = a + b`, or operations on both sides). **MC.equals-add-all** predicts the sum of the numbers shown. **MC.start-unknown-reversed** reads the two shown numbers of `_ op b = c` (equality.eq), `unknown: start` (addsub.facts) and the start-unknown stories. **MC.keyword-more-means-add** predicts a + b on the comparing stories whose answer is a − b. These two rules `apply` only to the items they read (start-unknown items; comparing or inconsistent-language stories), so V25 counts only those. **MC.symbol-reversed** predicts the mirror of `<` or `>` on a `symbol` compare.

## Conventions the U04 formats fix (#13)

Response shapes and state-checker targets of the place-value and operations formats. Generators that build these formats emit these targets.

| Format | Response | Checker target |
|---|---|---|
| `base-ten-build` `build` | `{ thousands, hundreds, tens, ones }`: the mat | `baseten.value` `{ value }`: any pieces worth the value |
| `base-ten-build` `build-exact` | same | `baseten.exact` `{ value, exact }`: worth the value, with exactly the named counts |
| `base-ten-trade` | `{ hundreds, tens, ones, value? }`: the mat, plus the typed result | `trade.result` `{ regroupTarget }` (exact columns) or `{ result, value? }` (any mat worth the result) |
| `expanded-form` `build` | `numbers`: the cards placed (unordered answer) | — |
| `array-build` `build-dims` | `{ rows, cols }` | `array.dims` `{ rows, cols, orientationMatters }` |
| `array-build` `build-total`, `new-way` | `{ rows, cols }` | `array.area` `{ total, found? }`; a turned rectangle counts as found |
| `array-build` `split` | `{ rows, cols, split, value }`: the line after column `split` | `array.dims` `{ rows, cols, requireSplit: true }` |
| `equal-groups` `build` | `{ groups: number[], value }`: one count per container | `groups.equal` `{ groups, perGroup, value }`; empty containers are not groups |
| `equal-share` `each`, `leftover` | `{ shares: number[], leftover, value }`: `leftover` is the pile plus the seagull's | `share.fair` `{ items, recipients, allowLeftover, value }` |
| `area-tiles` `tile` | `{ tiles, value }`: row-major `'1'`/`'0'`, like the mask | `tiles.cover` `{ mask, value }` |
| `area-tiles` `decompose` | `{ splits: { dir: 'v' \| 'h', at }[], value }`: full-length lines after column/row `at` | `tiles.cover` `{ mask, w, h, decompose: true, value }`: two or more pieces, all rectangles |
| `area-tiles` `partition` | `{ rows, cols }`: the strips the lines make | `array.dims` `{ rows: h, cols: w, orientationMatters: true }` |

- **Piece kinds** in op args are `thousands`, `hundreds`, `tens`, `ones` (also `cube`, `flat`, `rod`, `unit` and the singulars). With `wholeIs: 'flat'` every value is in hundredths.
- **Tray limits** (`base-ten-build` `limits`) cap the pieces of a kind taken from the tray; fusing and splitting never use the tray.
- **Choices:** `equal-share` `fair-or-not` answers `yes` | `no` and `even-odd` answers `even` | `odd`; `expanded-form` `words` answers a `wordOptions` id.
- `expanded-form` `digitIndex` and `highlight-digit {index}` count digits from the left.
- `area-tiles` features scale by `(area − 1) / 10`; `array-build` and `equal-groups` `product` by `(product − 1) / 10`; `equal-share` `items` by `(items − recipients) / 10`, so the easiest item scores 0 (03 §5.4).
- The property test's near-miss mutations (03 §9.4 step 5) also add or remove one piece, row, column, item, leftover or tile in these shapes; A decompose split line may also be taken away. `array.dims` exempts moving the split line, and `tiles.cover` exempts taking away a line when the rest is still a valid decomposition.

## Tests

- `pnpm exec vitest run --project engine`: unit tests under `src/` and the fixture property test under `test/`. Seeds come from `CONTENT_PROPERTY_N`: 50 locally, 100 on PR CI, 500 nightly.
- `pnpm content:validate` also runs the property test on every template, through `tools/content-check`.
- `pnpm test:sim`: the 04 §8 simulated-learner harness in `test/sim/` (`vitest.sim.config.ts`; CI runs it in `verify`, and nightly). Synthetic children with a hidden, downward-closed mastery set answer real generated items. The harness compiles the current content sources, so it moves from the fixture graph to the full graph as the curriculum lands. It prints a metrics table and asserts only the 04 §8 thresholds, never exact numbers.
