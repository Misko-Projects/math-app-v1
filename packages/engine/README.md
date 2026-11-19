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
- **puzzle-grid shape-fill** (`puzzle.satisfies`): response `{ fill: string[][] }`; demo op `fill {r, c, value}`. The number variants (`number-path`, `sum-triangle`, `all-ways`) are under "Pattern and puzzle formats" below.

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
- **addsub.facts** (K01): a make-ten tenframe-fill starts with `a` colour-a counters in frame 0 and `b` colour-b counters in frame 1 and asks for the total (`tenframe.makeTen`); a make-ten rekenrek starts with `a` on the top row and `b` below. Counting up to subtract is a `number-line-jump` with `goal: difference` from `b` to `a`, answering `{ jumps, value }` with the total jump. The open number line (and `jumps: free`) allows hops of 1–10 in the item's direction; its near-double solution (`b = a + 1`) jumps `a` again to the double and then 1, the jumps `strategy.used-doubles` praises. **MC.forgot-the-ten** and **MC.wrong-operation** read the asked number the same way as MC.teen-reversal (`rules/asked.ts`): a built item predicts the right build with the wrong number typed.

### Sharing and fraction formats (K01: div.share, frac.partition, frac.compare; fraction-cut, fraction-pick and fraction-line have no model yet)

- **fraction-cut** (`fraction.cut { parts, shade, acceptNonCongruent }`) responds with `{ regions: number[], shaded: number[] }`: each cut region's share of the whole area (any order, summing to 1) and the indices of the shaded regions. Each region must be within 3% of the whole area of 1/parts (`FRACTION_AREA_TOLERANCE`), and any `shade` distinct regions may be shaded (the checker exempts shading another part). The response holds areas only, so `acceptNonCongruent` is a widget rule (guided cuts are congruent). `thenName` adds `name: [shade, parts]`. Solutions use `cut {line}` (guided lines numbered from 0, `cutLines` in `generators/frac/partition.ts`: a circle's diameters, a rectangle's cross for fourths, parallel lines on a strip), then `shade {part}`.
- **fraction-line** `partition` (`fraction.partition { denominator, max }`) responds with `{ cuts: number[] }`: the marks placed, in units from 0 (any order, 0 < x < max). A mark on a whole is ignored; the others must match k/denominator (not wholes) one to one within 2% of the unit (`PARTITION_TOLERANCE`). Solutions name the middle first and end with `partition {b}`.
- **fraction-pick** `fair-or-not` answers `yes` | `no` about its `stimulus` and has no `options` (a fixed pair, like equal-share). `pick-picture` options are `fraction` pictures with ids `pic-<k>` in display order and no label. frac.partition's pick items show one shape three ways (halves, fourths, and `den` parts that are not equal) and the prompt names one with a word clip (`word.halves`, `word.fourths`, `word.unequal-parts`), so every picture is the answer of some item. Solutions say what to look at (no action), then `answer {id}`.
- **equal-share** (div.share): `fair-or-not` and `fix` pre-deal each ± `shift` to two plates (the rest get each); `fix` asks `each` on that pre-dealt share, so the child takes back from the bigger plate (`deal {to, count: −shift}`) and gives to the smaller one. `each` solutions `deal-round` once per item each gets, then `set-aside-leftover`, and end with `answer {value}`. The number-pad `moves` item pictures the pair as an `objects` set with `layout: groups`.
- **compare** and **order** (frac.compare) show `fraction` pictures with one part shaded. Order values are the piece size in 24ths of the whole (24 ÷ den: 2 → 12, 8 → 3), direction `desc`, so the answer is biggest piece first; the order model's `magnitude` is 0 for them.
- **MC.fraction-unequal-parts** predicts `yes` on an unfair fair-or-not item, the unequal picture with as many parts on a halves or fourths pick, a cut moving half a part from the first region to the second (`unequalRegions`), a partition with the first mark moved 0.4 of a part (`unequalCuts`), the pre-dealt share left as it is on `fix`, and 0 on `moves`; it matches every cut or partition with the right count that is not even. **MC.fraction-bigger-denominator** predicts the side cut into more parts, or the order reversed. **MC.unequal-share** has no prediction: it matches a `share.fair` response with unequal shares, or a leftover that could go round again.

### Data formats (K01: data.sort, data.chart; bar-graph-read and bar-graph-build have no model yet)

- **Charts** (`ChartSpec`) use scale 1 and two or three categories. Category ids are the island object (noun) ids (`fish`, `crab`, `shell`, `apple`) and labels `noun.<id>.many`. Picture graphs, tally charts and tables are horizontal, bar graphs vertical; `axisMax` is at least 5.
- **bar-graph-read** answers `number` for `how-many` (the one category in `question.categories`), `total` (every category) and `difference` (first − second of `question.categories`, always positive), and `choice` with a category id for `most` and `least`, whose `question.categories` lists every category. A most or least item never has a tie, and the chart's categories are its options (the property test needs two or more). Solutions use `count-pictures {id}` (picture graphs, tally charts, tables) or `read-axis {id}` (bar graphs) per category, then `answer`.
- **bar-graph-build** shows `data` (`objects` to tally first, `tally` marks or a `table` of counts; `data.values` in chart category order) and an empty chart: its categories carry value 0, so the widget never shows the counts it asks for. The response is `{ values }`, the count the child built for each category in chart order, whatever the marks are (bars, pictures or tally marks), and `chart.values { values }` checks it exactly. Solutions use `tally {id, count}`, `add-picture {id, count}` or `raise-bar {id, to}` per category. The property test's near misses add or take away one mark in one category.
- **compare** (data.chart): two one-bar charts on one scale (category a and category b, sides shuffled); `ask` `more` or `fewer`, and equal counts answer `same`.
- **number-pad** (data.chart) shows the whole chart as the stimulus (`{ kind: 'chart' }`) and asks for the total or the difference; (data.sort) an `objects` picture of one kind among `distractors` of another, counting the asked kind.
- **shape-sort** sorts (data.sort): object cards carry props `{ kind }` with bins `noun.<kind>.many`; shape cards carry `{ shape, color, size }`, sorted by colour (`word.red`, `word.blue`, `word.yellow`), shape (`shape.<kind>.many`) or size (`word.big`, `word.small`, scale 1.5 or 0.6). Response `{ bins }` (`sort.byRule`, as for the geo sorts).
- **order** (data.sort): one objects picture per group, no label, put in order from the fewest; values are the counts, which are all different.

### Time formats (K01: time.clock, time.sequence; clock-set and clock-read have no model yet)

- **clock-set** answers state `clock.time { h, m }`. The response is `{ h, m }`, the time the geared hands show: `h` the hour the short hand has reached (1–12), `m` the minute the long hand points at (0–59). The checker compares face times, so any `h` for the same hour on the face counts (12 and 0, 3 and 15); a minute outside 0–59 is not a reading. K01 items start at `start` 12:00 with `precision` 5, so a swapped setting (12:15 for 3:00) can be made. Solutions use `highlight-hand {hand: 'minute'}`, `drag-minute {to: m}`, `highlight-hand {hand: 'hour'}` and end with `drag-hour {to: h}` (the hour hand then sits between `h` and the next hour by `m`). The property test's near misses move the short hand one hour or the long hand five minutes.
- **clock-read** `digital-pad` answers `numbers` `[h, m]`, ordered, with `h` 1–12. `pick` (K01: TIM.09, `ask: hour`) asks only which hour it is after: the options are hours with the numeric pick ids `opt-<h>` and labels `"<h>"`, the hour, then the template's diagnostic distractors (MC.hour-hand-next: the next hour when m ≥ 30; MC.hour-minute-swap: the number the long hand points at), then the hours round it, 3 options (4 with distractors), all different. Solutions use `point-hour`, `point-minute` and end with `answer {values}` or `answer {id}`.
- **Clock features**: time.clock emits the 03 §5.5 clock format features itself. The precision features read the target time (the finest step it needs: half, quarter, five or one minute), not the widget's snapping, and the hour pick reads no minutes, so it has none. `turn` is how far the hands travel from the start, the shorter way round (half a day = 1).
- **MC.hour-minute-swap** and **MC.hour-hand-next** read a buggy face time and answer with the item's own kind (`rules/clock.ts`): numbers `[h, m]` on the pad, the state `{ h, m }` on a clock-set (null when the long hand cannot reach the minute), the `opt-<h>` option on the hour pick. On the pick the long hand at 6 for 5:30 is also the next hour, so only MC.hour-hand-next claims it.
- **order** (time.sequence): one objects picture per daily event (sprite `event-<id>`: wake-up, breakfast, lunch, dinner, bedtime), no label; values are the event's place in the day (1–5), `direction: asc`. On the timeline template one event is pre-placed through `fixed` on its own slot. Solutions start with a line that places nothing, then `drag {id, slot}` for every slot that is not fixed.
- **shape-sort** `sort` (time.sequence): `event` cards (`isPm` true for the night ones), target props `{ part: 'morning' | 'night' }`, bins `b0` (`word.morning`) and `b1` (`word.night`); `sort.byRule`. Solutions `drag-card {id, bin}`.

### Pattern and puzzle formats (K01: pattern.repeat, pattern.grow, puzzle.grid; pattern-extend and puzzle-grid have no model yet)

- **pattern-extend** `extend` and `fill` answer state `pattern.tokens { expected }`: the response is `{ tokens }`, the tokens placed in the blanks (the `null` entries of `sequence`) in reading order, each the same unit as expected (`{ sprite, color? }`, `{ n }` or `{ tiles }`, every field equal). `fill` hides the tokens ending one before the last, after at least one whole core. `core` answers `select.exactSet { values }`: the indices of the first repeat of the core (the prompt asks to mark it from the start). `rule` answers `number`, the step. `palette` holds the units a repeating pattern uses (A, B, C order) and is empty for number patterns, which are typed. Solutions use `place-token {index, token}` per blank, or `highlight {index}` and `bracket-core {from, to}`, after a first line that places nothing. The property test's near misses take away the last token or swap one for its neighbour.
- **Pattern units** (pattern.repeat) come from the params: `theme` picks three units from `OBJECT_THEMES` (island sprites) or, with the `shapes` representation, `SHAPE_THEMES` (a shape kind as the sprite plus a colour; every unit differs in both). pattern.repeat and pattern.grow emit the pattern-extend format features they use (`core.len`, `hidden.middle`, `step.notOne`) themselves.
- **order** (pattern.repeat): the whole pattern as cards with one-object pictures and no label, values 1, 2, … in pattern order; the first `shown` cards are `fixed` in their slots and the child places the next `ask`, which are always different units, so no two free cards look alike. Solutions start with a line that places nothing, then `drag {id, slot}`. **MC.pattern-restart** (`rules/patternRestart.ts`) predicts the blanks filled from index 0, the free cards placed in the order of the first cards, and on core items the bracket that stops where the first unit comes back (AAB → the first A); it is null when that is the answer.
- **hundred-chart** `pattern` (pattern.grow): the widget shades `patternStart + k·patternStep` for k = 0, 1, 2 and the child taps the next terms; how many is in the prompt (`ask`), and the answer is `select.exactSet { values }`. `hidden` is empty. Solutions highlight a row, then `tap {n}` per term.
- **number-line-jump** (pattern.grow): `goal: add`, `thenAsk: landing`, from the third term, with `allowedJumps` [1, 2, 10] so the jumps never give the rule away; `target` (the next term) is not drawn on an `add` line. The answer is `jumps.reach { start, target, allowedJumps, value }`.
- **puzzle-grid number variants** (`puzzle.satisfies`): target `{ variant, rows, cols, cells, givens, constraints, palette, nonZero? }`, with `cells` every puzzle cell as [r, c] and `givens` the shown numbers as [r, c, value]. The response is `{ fill: (number | '')[][] }` (rows × cols): each puzzle cell a whole number (from `palette` when it is not empty), the givens unchanged, '' elsewhere. `number-path` (PUZ.01) lists `cells` in path order (a snake through the grid) with one `adjacent-step` constraint (step 1): each cell is one more than the one before it. `sum-triangle` (PUZ.02) is a 3 × 5 grid with corners (0, 2), (2, 0), (2, 4) and middles (1, 1), (1, 3), (2, 2), one `line-sum` per side; its blank sets (`BLANKS` in `generators/puzzle/grid.ts`) always solve one side at a time. `all-ways` (CPS.06) has a row of two blank cells for each way to make the whole (both parts non-zero, turn-arounds once), a `line-sum` per row, and the rows must be different ways, so any order and either way round is correct (the checker's near-miss exemption). Demo op `fill {r, c, value}`; the near misses change one number by one.
- **hundred-chart** `fill` (puzzle.grid, PUZ.01): a puzzle piece (`PIECES`) cut out of the 1–100 chart, every cell 1–99; `hidden` is the piece in reading order and the answer its numbers in that order. Solutions highlight a row and end with `answer {values}`.
- **number-bond** (puzzle.grid sum-triangle): one side of a triangle, `missing-part` with the whole the side's sum and the known part the two corners together; the answer is the middle.
- **order** (puzzle.grid all-ways): every way to make the whole as a two-group objects picture (`layout: groups`, turn-arounds included), no label, value = the first group; `direction: asc`.
- **number-bond** `new-way` with `gap` (bond.parts, CPS.06): `found` is every way but one in order (1 + (n − 1), 2 + (n − 2), …), so bond.newWay accepts only the missing way (either way round).

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
