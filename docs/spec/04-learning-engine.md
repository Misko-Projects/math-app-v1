# 04: Learning engine

Everything here is pure TypeScript in `packages/engine`, deterministic given (events, content, now). The parameters below are the v1 defaults. They live in `engine/src/params.ts` as one exported object so they can be tuned without code changes.

## 1. Overview

```
content (graph, templates) ─┐
event log ──► foldSkillStates ──► LearnerState ──► planSession ──► SessionPlan ──► TaskRunner (web)
                                   ▲                                                    │
                                   └──────────── attempt events ◄───────────────────────┘
placement runner ──► PlacementPrior ──► LearnerModel.init
```

The v1 model id is `elo-fire-v1`. Keep it behind the `LearnerModel` interface (02 §5.3) so later models (BKT + forgetting, FSRS) can be swapped in and **replayed over the same logs** for comparison.

## 2. Skill rating (Elo with feature-based item difficulty)

### 2.1 State per child

- `θg`: global ability (logit). Initial value 0.
- Per skill `s`: `θs` offset (logit) and `ns` (count of rated attempts).

`P(correct | s, item) = σ(θg + θs − d_item)`, where `σ(x) = 1/(1+e^−x)`.

New skills (no attempts) take their offset from transfer: `θs ← mean(θp for prerequisites p with n_p > 0)·0.5`, or the placement prior (§5) if present.

### 2.2 Item difficulty

`d_item = template.difficulty.base + Σ_f weight_f · feature_f(params)`, computed by the generator (see 03 §5 for each format's features). The base scale: a typical in-grade item for that skill sits at `d = 0`. v1 weights are hand-set. Log everything so v2 can refit them.

### 2.3 Update after an attempt

Only the **first attempt** on an item updates the rating; retries do not.

```
score = correct ? (hintsUsed>0 ? 0.5 : 1) : 0         // skip → 0
w     = 1.0
if correct && latencyMs > 2 × expectedLatency(template, child): w = 0.6   // slow-correct counts less
if response.kind === 'skip': w = 0.5
e     = score − P
θs   += Ks(ns) · w · e,   Ks(n) = 0.8 / (1 + 0.08·n)
θg   += Kg(N)  · w · e,   Kg(N) = 0.12 / (1 + 0.01·N)   (N = total rated attempts)
ns   += 1
```

`expectedLatency` = the template's `expectedLatencyMs` (default 8,000 ms abstract, 12,000 ms manipulative), × 1.5 for K children. Latency is measured from item ready (prompt narration finished) to submit (02 §4.2).

**Context weights.** These multiply `w` above:

| `context` | Rating update | Counts as `practiced` evidence (§3)? |
|---|---|---|
| `practice`, `review`, `warmup`, `challenge`, `transfer-probe` | w × 1 | yes |
| `lesson` (scaffolded items) | w × 0.5 | no |
| `placement` | **no θ update**: placement feeds the prior (§5) | no |
| any `choice` response (multiple choice) | w × 0.5 | no |

`partialCredit` in the attempt event is written by the `TaskRunner` (1 / 0.5 / 0). `score` above equals `partialCredit`.

**Frontier** (everywhere in the specs): skills whose status is `ready` or `learning`.

### 2.4 Difficulty targeting

To pick an item for skill `s` at target success `p*`: `d* = θg + θs − logit(p*)`. The generator chooses params whose computed `d` is closest to `d*` (03 §5 defines the search).

| Context | `p*` (G1+) | `p*` (K) |
|---|---|---|
| practice | 0.85 | 0.88 |
| review | 0.90 | 0.92 |
| warmup / confidence | 0.95 | 0.96 |
| challenge (opt-in, puzzles) | 0.65 | 0.75 |
| placement | n/a (reference difficulty `d = 0`) | n/a |

**Grade columns:** tables in this doc give K and G2 (or G1+) columns. G1 uses the K values for item counts per request and the G2/G1+ values for everything else. G3 and above use the G2/G1+ values. `targetDifficulty(state, skill, context, child)` (02 §5.4) is called by the `TaskRunner` at presentation time.

**Rolling success controller:** keep first-try accuracy over the last 20 items. If it is > 0.92, add +0.2 to an `offset` applied to `d*` (cap +1.0). If it is < 0.75, add −0.3 (floor −1.5). The offset decays 20% toward 0 each session.

## 3. Mastery ladder

Derived status per skill (recompute in `status()`):

| Status | Rule |
|---|---|
| `locked` | some hard prerequisite is below `practiced` and not `assumed` |
| `ready` | all prerequisites ≥ `practiced` (or assumed); no attempts yet |
| `learning` | attempts exist; practiced criteria not met |
| `practiced` | `P(ref) ≥ 0.90` at `d = 0` **and** ≥ 5 of the last 6 independent first attempts correct (no hints) **and** correct on ≥ 2 distinct formats *or* tiers (at least one pictorial/abstract) **and** across ≥ 2 sessions. **Gateway skills:** 6 of the last 7 and ≥ 3 representations including abstract. |
| `fluent` | `kind = 'fact-fluency'` only: practiced, and the median latency of the last 10 correct ≤ `skill.fluency.medianLatencyMs` (× 1.5 for K) |
| `mastered` | practiced (fluent for fact-fluency), then passed a review ≥ 1 day later and another ≥ 6 days after that |
| `needs-review` | was ≥ practiced and (retrievability `R < 0.70` **or** the last review failed) |

- **Demotion:** two consecutive failed reviews → `learning`; reset memory (§4) to the initial interval.
- **Test-out:** on a `ready` skill, if the first 3 items (abstract tier, reference difficulty) are correct, first try, with no hints and not slow → skip the lesson and mark `practiced`-track (still needs the reviews to reach `mastered`).
- **Parent override:** a `skill.override` event can set `mastered` or reset to `ready`. It is shown as "set by parent" in the dashboard.

## 4. Memory and spaced review (FIRe-lite)

Per skill once it reaches `practiced`: `interval I` (days), `lastReviewTs`, `reps`.

- Initial `I = 1` day (assumed-from-placement: `I = 2`, flagged `assumed`).
- Due when `now ≥ lastReviewTs + I`. Retrievability for display: `R = 0.9^(elapsed/I)` (0.9 at due).
- **Explicit review result** (first attempt on a review-context item for skill `s`):
  - success fast → `I ← I·2.5`; success normal → `I·2.0`; success slow or hinted → `I·1.4`
  - early review discount: multiplier `m ← 1 + (m − 1)·min(1, elapsed/I)`
  - failure → `I ← max(1, I/3)`, status `needs-review`, `reps` unchanged
- **Implicit credit (encompassing):** a successful explicit review of `A` gives each `B` in `A.encompasses` (weight `w`) `I_B ← I_B·(1 + (m − 1)·w·min(1, elapsed_B/I_B))`. Credit does not cascade beyond one hop in v1.
- **Failure propagation:** failing `A` marks each hard prerequisite `P` of `A` as "at risk": `due_P ← min(due_P, now + 1 day)`.
- **Review compression:** when choosing review tasks, sort due skills by graph depth (deepest first). Pick a skill, then remove from the due set every skill it encompasses with `w ≥ 0.5` (they get implicit credit when it succeeds). Repeat until the review budget is filled.
- **Interleaving:** review tasks are placed between new-skill tasks (§6). Never present more than 3 consecutive items of the same skill outside a lesson.
- **Transfer probes:** 10% of review tasks for mastered skills use the abstract tier with no manipulative (`context: 'transfer-probe'`).

## 5. Placement ("graph-propagated adaptive placement")

State: `p(v)` = probability that skill `v` is known.

**Priors** by grade label relative to the child's grade `g` (K = 0). If the parent selects "advanced", treat `g` as `g + 1` for priors.

| Skill grade label | prior |
|---|---|
| ≤ g − 1 | 0.85 |
| = g | 0.50 |
| = g + 1 | 0.25 |
| ≥ g + 2 | 0.10 |

**Loop**
1. **Select a probe:** among skills with `p ∈ [0.2, 0.85]`, maximise `(1 − |2p − 1|) · (1 + 0.15·U(v)) · (gateway ? 1.3 : 1)`, where `U(v)` = number of uncertain ancestors and descendants within 3 hops. Prefer skills whose prerequisites are mostly `p ≥ 0.5` so the item is answerable.
2. **Ask** 1 item at reference difficulty (`d ≈ 0`), abstract or pictorial tier, constructed response. A "skip / I haven't learned this" button is always visible.
3. **Update** `v` with a BKT-style posterior: guess `G = 0.05` (numeric entry; `1/k` for k-choice), slip `S = 0.10`. A slow-correct answer gets a posterior blended 50% with the prior. A skip counts as incorrect with weight 0.5.
4. **Propagate:**
   - correct → for ancestors `a` at hop distance `h`, `p(a) ← p(a) + λup(h)·(1 − p(a))·post(v)`, with `λup = [0.8, 0.6, 0.4]`.
   - incorrect → for descendants `d`, `p(d) ← p(d)·(1 − λdown(h))`, with `λdown = [0.5, 0.35, 0.2]`. Ancestors are not lowered. Instead, the direct prerequisites of `v` get +0.5 priority in the next probe selection (downward search).
5. **Stop** when no skill on or near the frontier has `p ∈ [0.25, 0.80]`, **or** the item budget is spent (K: 12 per mini-session, ≤ 4 mini-sessions; G2: 20 per session, ≤ 3 sessions), **or** frustration triggers (2 consecutive skips/wrongs plus a frustration signal → end the mini-session happily and continue another day).

**Output**
- `p ≥ 0.85` → `assumed` (treated as practiced, `I = 2` days, flagged for verification).
- `p ≤ 0.30` → not known.
- In between → unknown; the planner introduces these through normal practice.

**Week-one verification:** assumed skills nearest the frontier get review tasks within 1–3 days. Failing one demotes it and every assumed descendant to `ready`/`locked` as the graph dictates.

**Incremental placement:** when a child first reaches a strand they never placed into (e.g. FRA), run a 4–6 item mini-placement inside the first request of that strand.

**Persistence:** every probe emits `placement.probe` (plus an `attempt` with `context: 'placement'`). When a placement (initial or per strand) stops, the runner emits `placement.completed` with the posterior and the assumed list (02 §5.8). `foldSkillStates` builds `LearnerState.placement.prior` from those events. An unfinished placement resumes from its probes on a later day.

## 6. Session planner and in-session adaptation

### 6.1 Session budget

Default `minutes`: K = 10, G1–2 = 15, G3 = 20 (parent-configurable 5–30). Target mix by item count:

| Slice | K | G2 |
|---|---|---|
| Warmup (P ≥ 0.95 skill) | 1–2 items | 1 item |
| New learning (frontier) | 55% | 50% |
| Due reviews (interleaved) | 35% | 35% |
| Challenge / puzzle / transfer | 10% (gentle) | 15% |

### 6.2 Choosing new skills

Score each frontier skill, then take the top N (concurrent learning skills: K ≤ 2, G2 ≤ 3, with in-progress ones first):

`score = 1.0·strandBalance + 1.5·unlockValue + 1.0·gateway + 2.0·inProgress`

- `strandBalance` = days since the strand was last practiced, normalised to [0, 1].
- `unlockValue` = number of descendants within 2 hops / max over the frontier.

### 6.3 Requests

The planner turns the task list into 2–3 **requests**. Each one is bound to a workshop that hosts the needed formats (02 §5.6) and voiced by a resident. The child chooses which request to do.

- Each request has 5–8 items (K) or 6–10 (G2) and lasts 2–4 minutes.
- Pattern: `[lesson?] new, new, review, new, review, new …`. A lesson is inserted the first time a skill is introduced unless test-out applies (§3).
- Reward: `materials` = one unit of the workshop's product per item (for workshops with two products, alternate them; Practice Pier produces the material the resident asked for). Requests that use challenge items add a rare decor item (`reward.decor`). Puzzle Tower rewards only decor (star shards).
- **Re-planning:** `planSession` runs at session start and again after each request completes.
- **Workshop availability is family-wide:** the planner may use any workshop built on the shared island, whichever child built it.
- If no workshop can host a skill's formats, choose another template of that skill whose format a built workshop hosts. If none exists, fall back to the **Practice Pier** generic workshop (05 §4), which hosts every format.

### 6.4 `adaptNext` rules (between items, inside a request)

1. Wrong on first try → `retry: true` with the hint ladder: nudge → representation → worked step. Second wrong → show the worked solution, narrate it, move on (no penalty language).
2. Two first-try wrongs in a row on the same skill → step down one CPA tier for that skill (abstract → pictorial → concrete) for the rest of the request.
3. Three first-try wrongs on the same skill in one request → insert one probe item for its weakest prerequisite (lowest `θ`). If that fails too, end the skill's slot and schedule the prerequisite.
4. **Frustration signals:** ≥ 3 wrong in the last 4 items; or 3 rapid taps (< 800 ms, response wrong); or 2 idle periods > 45 s. Response: give a confidence item (P ≥ 0.95), then offer "take a break?" (Pebbling suggests building something) or finish the request early with full celebration.
5. **Misconception trigger:** the same misconception matched ≥ 2 times in this child's last 10 attempts on the skill → queue the remediation skill's lesson as the next request ("Pebbling has an idea!"), and derive a parent alert (dashboard).
6. **Wind-down:** at the budget, let the child finish the **current item**, then end the request (the remaining tasks are dropped, and the products earned so far parade to the Storehouse), then play the wind-down scene. There is no overrun beyond the current item. A child may stop anytime with no penalty.

### 6.5 Fluency

Fact-fluency skills that are `practiced` but not `fluent` are routed to the fluency workshop (Rhythm Orchard, W12). Latency is always measured silently. Visible timing ("beat your best") appears only for G1+ when the `timedChallenges` setting is on, and **never** for K.

## 7. Derived signals for the parent dashboard

- Skill map: status, `P(ref)`, last 10 attempts, formats and tiers covered, next review date, "assumed" flags and overrides.
- Misconception alerts: misconception id, skill, examples (item params plus response), suggested offline activity (from content).
- Time: minutes per day per child, sessions started by the child vs. prompted, natural vs. abandoned endings.
- Accuracy band: rolling first-try accuracy vs. target.
- Math density: math-interaction ms / active ms per session (the web app records interaction time).

## 7a. Readings fixed by E02 (2026-11-18)

Points §2–§5 leave open, as `elo-fire-v1` implements them (all parameters in `engine/src/params.ts`):

- **Expected latency:** "manipulative" means a concrete or pictorial tier (12,000 ms), and abstract is 8,000 ms, unless the template sets `expectedLatencyMs`.
- **Rolling success controller (§2.4):** `recentFirstTry` always holds the last 20 first attempts of every context except `placement` and `lesson`. When it is full and outside [0.75, 0.92], the offset moves once, and the next adjustment waits until 20 more items have entered the window. The 20% decay applies at each `session.started`.
- **Evidence (§3):** `SkillState.recent` holds the last 10 first attempts in an evidence context (`practice`, `review`, `warmup`, `challenge`, `transfer-probe`) that are not `choice` responses. The practiced rules read "correct" as correct with no hints, over `recent`: the k-of-n rule on its last n entries, and the format/tier/representation and two-session rules on its correct entries.
- **Fluent:** the median latency of the last 10 correct evidence first attempts, which the model keeps beyond `recent`'s window. At least 6 are needed.
- **Mastered:** a passed explicit review counts from `practicedAt` (from `fluentAt` for fact-fluency skills): the first ≥ 1 day after, the second ≥ 6 days after the first. Any passed explicit review counts, including a `choice` response.
- **Review speed (§4):** a correct review is fast at latency ≤ 1 × expected, normal ≤ 2 ×, and slow (or hinted) beyond that. Explicit reviews are first attempts in the `review` or `transfer-probe` context on a skill that is practiced or assumed. Implicit credit uses the reviewed skill's undiscounted multiplier `m` and each encompassed skill's own elapsed fraction, changes only `intervalDays` and `dueTs`, and applies to encompassed skills that already have memory. A failed review sets `dueTs = now + I`, and a passed one clears `atRiskDueTs`. `dueReviews` lists skills on the practiced track whose `min(memory.dueTs, atRiskDueTs) ≤ now`, deepest first.
- **Test-out (§3, 03 §6.5):** a test-out is offered for a never-attempted skill whose prerequisites are met, whose lesson mode is not `none` and whose `testOut.items` is at least 1, and only when its placement posterior is ≥ 0.6 or its P(ref) is ≥ 0.75 with the transferred offset. It covers the first `testOut.items` first attempts in an evidence context, all from the test-out pool. The draw must use at least 2 distinct templates when the pool has 2 or more. For a gateway skill it must also span 2 representations when the pool does. A compiled pool may hold choice templates, and their responses count here, though they are not evidence for `recent`. At least `minCorrect` (as compiled) of them correct on the first try, with no hints and not slow, set `practicedAt`. If a lesson or an out-of-pool item comes first, there is no test-out.
- **Placement (§5):** `placement.completed` merges its posterior into `LearnerState.placement.prior` (later values win per skill) and unions `assumed`. Each assumed skill that is not already practiced gets `assumed: true`, `practicedAt` = the event's `ts` and `I = 2` days. A never-attempted skill with a prior takes `θs = logit(clamp(p, 0.05, 0.95)) − θg`. A passed review clears `assumed` (verified), and the skill stays practiced: if `practicedAt` was unset (a state built by `init(graph, prior)`), it becomes the review's time. A failed review of an assumed skill demotes it, and every assumed descendant, at once.
- **Parent override:** `mastered` sets `masteredAt` (and `practicedAt`, plus `fluentAt` for fact-fluency, if missing) and restarts memory at `I = 1` from the override's time. `reset` restarts the skill's evidence and ladder but keeps its effective θ offset (for a never-rated skill, the current prior or transfer). Demotion clears an earlier `mastered` override, and the failure that demotes a skill never promotes it again on the same attempt.
- **Never-rated skills:** until a skill's first rated attempt, its offset is the current placement prior (or transfer). A skill state created by placement does not freeze it.
- **Passed reviews:** `memory.reviewsPassed` keeps every passed review until the skill is mastered, so early reviews never displace the qualifying ones. After mastery it keeps the last 10.
- **Private fields:** the model keeps some bookkeeping in `_`-prefixed fields (02 §5.8). Schema validation strips them, and the model then degrades conservatively: a test-out in progress ends, fluency samples accumulate again, hits with unknown attempt numbers expire (stale evidence must not trigger a remediation; rebuild from the events to keep them), and the controller may adjust once more.
- **Misconception hits:** hits from every non-placement attempt on the skill (lessons and retries included), keeping those from its 10 most recent such attempts. The window counts attempts in fold order, so equal timestamps don't matter.

## 7b. Readings fixed by E03 (2026-11-18)

Points §2.4, §5 and §6 leave open, as the placement runner, the planner and `adaptNext` implement them (parameters in `engine/src/params.ts`, sections `placement`, `planner`, `targets` and `adapt`).

**Placement (§5).** The runner is pure: `startPlacement`, `nextProbe`, `recordProbe`, `beginPlacementSession`, `completePlacement` and `resumePlacement` pass a plain, JSON-serialisable run.

- **Scope:** an initial placement (`strand: null`) covers every skill, and a mini-placement covers the skills of its strand. A skill already on the practiced track (practiced or assumed) is fixed at p = 0.95, is never probed and is left out of the output. Skills outside the scope are never probed or output. They act as ancestors at 0.95 when on track, else at their earlier prior, else at the grade prior. A mini-placement starts a scope skill from its earlier prior when one exists.
- **Probe score:** `U(v)` counts open scope skills (in scope, not on track) with p in [0.2, 0.85] among the ancestors and descendants within 3 hops. "Mostly answerable" multiplies the score by 0.5 + 0.5 × the share of direct prerequisites with p ≥ 0.5 (1 for a root). The +0.5 downward priority is added to the score of each open direct prerequisite of a wrongly answered probe, and it is cleared when that prerequisite is probed. A skill is probed at most twice. Ties go to the skill id.
- **Probe item:** the first non-empty pool of (a) constructed-response abstract or pictorial templates, (b) any abstract or pictorial template, (c) any template, ordered abstract first and then by id. "Constructed response" is the template's own answer kind, read from a sample item, because one format can answer both ways (tap-count answers with a choice in ordinal mode). A repeat probe takes the next template. Seeds derive from the placement id and the probe number. The `TaskRunner` generates the item at d = 0.
- **Accepted answers:** `recordProbe` accepts an answer only with the current item's probe seed. A retried submission of an answer already recorded is therefore refused, not counted twice. The skill must also be open and below its probe cap, and the template must be one of its own.
- **Update:** the guess is 1/k when the runner reports a k-choice item, else 0.05. "Slow" applies to correct answers only, as in §2.3. A skip propagates like a wrong answer and is logged as `correct: false, skipped: true`.
- **Stop:** the estimated frontier is the scope skills with p < 0.85 whose prerequisites all have p ≥ 0.5. "Near" adds their direct prerequisites and dependents. After each probe the rules run in order: converged, frustration (2 consecutive misses within the mini-session and a frustration signal on the latest answer), then the mini-session budget. Convergence is also checked at start, so a placement can end after 0 items (for example, a G2 child on a K-only graph). The item budgets are 12 × ≤ 4 mini-sessions for K and 20 × ≤ 3 otherwise: G1 uses the G1+ column, because a placement budget is not a per-request item count. The placement ends as `budget` when its last mini-session is used up, and as `frustration` when frustration ends its last one. A mini-placement is one mini-session of 4–6 items, and it cannot converge before 4 items while a candidate remains.
- **Mini-sessions follow app sessions:** the app calls `beginPlacementSession` at each new app session (`session.started`). A mini-session that ended on its budget or on frustration takes no further probe until then.
- **Resume:** `resumePlacement(input, events)` replays the child's event log. It reads this placement's `placement.probe` events and the child's `session.started` events in the canonical fold order (`sortEvents`: ts, then id). The id breaks ties, so the order holds even when sync clamps a batch to one ts (08 §4). Each `session.started` begins the next mini-session, as it does live, so session boundaries survive however soon the app is reopened. The log includes the current session's `session.started`, which begins a fresh mini-session, or stops the placement on its budget when every mini-session is used. Replay sets each probed skill's p from the event's `posterior`, because a probe event carries no tier, choice count or frustration signal. Without the signal, a frustration end is known only at the next session start, so the app appends the final probe and `placement.completed` together. Probes of other placement ids are ignored.
- **Output:** the posterior is rounded to 4 decimals, and `assumed` lists scope skills whose rounded posterior is ≥ 0.85.

**Session planner (§6.1–§6.3, §6.5) and difficulty targets (§2.4).** `planSession(input, opts?)` takes the 02 §5.4 input plus an engine-local `PlanOptions`: `puzzleDecor` (the `GameData` decor ids with `source: 'puzzle'`, for `reward.decor`) and `remediation` (the `queueRemediation` that `adaptNext` returned). The app passes both. `targetDifficulty(state, skill, context, child, graph?)` takes an optional graph so a never-rated skill gets its transfer offset.

- **p\*:** `transfer-probe` uses the review row and lesson items use the practice row. `placement` returns 0 (the reference difficulty). Without a graph, θs is the skill's own offset once rated, else its placement-prior offset, else its stored offset, else 0. The rolling success offset is added to d\*.
- **Test-out items at d\* = 0 (03 §6.5):** `targetDifficulty` returns 0 for an item in an evidence context while the skill's test-out is offered or in progress. That is the learner model's `inTestOut`: an untouched skill with an offered test-out, or a test-out already counting. When the test-out is decided, or cancelled by an out-of-pool first item, the skill's items are adaptive again. Without a graph, only a test-out already in progress is known. The `TaskRunner` records a lesson's child steps as `lesson` attempts, so a skill whose lesson has played is no longer untouched.
- **Columns:** request item counts use the K column for grades K and 1 and the G2 column otherwise. Slices, concurrency and p\* use the K column only for a K child.
- **Time:** `minutes` is the budget left when the plan is made, because the app re-plans after each request with the minutes remaining. `windDownAtMs` = `now + minutes × 60,000`.
- **Requests are alternatives:** the child picks one and the app re-plans, so each request is built from the same pools. Request *i* focuses on the *i*-th focus skill (cycled), and requests may reuse the same due reviews. There are 3 requests when there are at least 3 focus skills or at least 3 available themed workshops host one; otherwise 2.
- **Request size:** `clamp(round(min(minutes·60, 180) / secondsPerItem), range)`, with 25 s per item for the K column and 20 s for G1+. A lesson task costs 2 items of that budget but is not an item.
- **Focus skills:** the top N of §6.2, in-progress first. The pool is the frontier plus practiced fact-fluency skills that are not fluent (§6.5). `strandBalance` = min(1, days since the strand's latest evidence attempt / 7), and 1 for a strand never practised. `unlockValue` divides by the maximum over the pool. With no new skill, a request holds reviews and then practiced-track skills in the `practice` context.
- **Slices per request:** reviews = round(0.35 × items), from `compressReviews` over the due skills the workshop hosts. Challenge items = round(challenge share × the plan's total items). They are dealt one per request from the last request backwards, go to practiced-track skills by highest P(ref), and are placed late. The remaining items are new learning. A transfer probe needs a hosted abstract template; otherwise it stays `review`.
- **A failed review is due again at once:** a failed review moves `dueTs` at least a day ahead (§7a), so `dueReviews` alone would not schedule it. The planner's due list is `dueReviews` plus every practiced-track skill whose status is `needs-review` because of a failed review (`memory.consecutiveFails > 0`), as an ordinary review with `dueTs = now`, its current retrievability and `atRisk: false`. The list keeps the `dueReviews` order (deepest first, then `dueTs`, then id). `dueReviews` itself is unchanged. A failed review is never removed by review compression (§4): an encompassing skill's implicit credit lengthens its interval but does not clear the failure, so it is reviewed itself, ahead of the compressed reviews. This is how the next plan schedules a practiced prerequisite after a failed probe (§6.4 rule 3). A prerequisite that is not on the practiced track is already a frontier or in-progress skill.
- **One test-out rule:** the learner decides a test-out at the skill's first evidence attempt (§7a), and `targetDifficulty` follows the learner's live state. The planner plans a draw only when that decision is certain to agree. It uses the learner's own rule (`inTestOut`) on the state after the worst outcome of what comes first. For a warmup item that is one wrong answer, lowering θg by Kg(N) and that skill's offset by Ks(n). For a lesson warmup it is every rated child step wrong: its faded child steps plus scaffolded items, as `lesson` attempts at w × 0.5. Nothing else precedes a request's first draw item. So a planned draw is always a real test-out, at d\* = 0.
- **Lesson and test-out:** a `ready` focus skill with a lesson gets its test-out when that rule offers one and the workshop can host the draw (≥ 2 distinct templates when the pool has ≥ 2, and 2 representations for a gateway skill). An offered draw that no themed workshop can host as a passable draw (for example, only one of two pool templates) goes to the Practice Pier, which hosts every format. A planned test-out is therefore always passable. The test-out items are followed by the lesson task. The `TaskRunner` skips that lesson after a passed test-out, or starts it at faded example 1 at `minCorrect − 1` (03 §6.5). Otherwise the lesson task comes first. Remediation requests always start with the lesson unless its mode is `none`. A test-out is never truncated: when the run rule leaves no way to place the whole draw before the lesson, the request is planned without the test-out, lesson first.
- **Warmup (§6.1):** the first that applies of: (a) the practiced-track skill with the highest P(ref) ≥ 0.95; (b) the highest-P(ref) practiced-track skill; (c) the highest-P(ref) frontier skill already attempted (`learning`), with one of its evidence templates; (d) a `ready` skill whose lesson mode is `none`; (e) when nothing is attempted yet, the lesson (mode `lesson`) of a focus skill that is not a queued remediation, preferring one whose test-out is not offered. Requests on that skill omit their lesson task and its cost. The skill keeps its draw only when the lesson is demonstration-only: with no rated child step it stays untouched, so the learner offers that test-out at the first draw item. A lesson with child steps touches the skill, so it gets ordinary practice. Every other request keeps its own focus, remediation and draw, a draw planned only if it survives the worst case of the lesson's rated steps. (f) Otherwise, an evidence template of the first focus skill. An item warmup is never the first attempt on a `ready` skill with a lesson. The warmup comes before the child picks one of the alternative requests, so it never starts or cancels a test-out of a request the child may not choose. The requests continue the warmup item's run, so the warmup plus a request never holds more than 3 items of one skill in a row. Ties go by id. The template prefers a format an available themed workshop hosts, then a pictorial or abstract tier, then a constructed answer.
- **Run rule:** a request never has more than 3 consecutive items of one skill. Lesson tasks are not items and do not break a run. When reviews and challenge items cannot break the focus skill's runs, the planner adds one other new skill that needs no lesson first, then practiced-track skills, and otherwise drops the excess focus items, so the request is shorter.
- **Evidence and needed templates:** a skill's *evidence templates* are those whose items take a constructed answer, because only their first attempts enter `recent` (§7a). The template's own answer kind decides (the kind of the `AnswerSpec` its generator builds, `templateAnswerKind`), not what its format could accept: `count.ordinal` answers a `tap-count` item with a choice. Only when the generator is unknown does the format's capability (03 §5.5 `FORMAT_SUPPORT`) decide. A skill's new-learning items use only those when it has any, so a request always produces practiced evidence. Its *needed templates* are the evidence templates that add something its practiced rule still lacks among its correct, unhinted `recent` entries. For a standard skill that is a format or tier not yet there. For a gateway skill it is a representation not yet there, or the abstract tier when none is there.
- **Hosting:** every task of a request uses a template whose format the request's workshop hosts. A themed workshop qualifies for a focus skill when it hosts the lesson template (when one is planned) and at least one evidence template. Candidates are ranked by: hosts a needed template, fills the item range, hosts the test-out draw, strand affinity, not used by an earlier request in the plan, number of the skill's formats hosted, then id. A fluency skill goes to Rhythm Orchard (`rhythm-orchard`) when it qualifies. The request falls back to the Practice Pier (`practice-pier`, every format) in three cases: no themed workshop qualifies; only the pier fills the item range; or the skill has needed templates and no themed workshop hosts one. The last is §6.3's "needed format" fallback. Without it, a skill whose missing representation only the pier hosts would never reach practiced. A request with no focus skill (review-only) ranks its candidates first by the number of due reviews they host, then by filling the item range, not used earlier, and item count. When reviews are due and no themed workshop hosts any of them, it goes to the Practice Pier, the same fallback applied to reviews, so a due review is never replaced by filler. An input entry for the pier supplies its residents.
- **Residents and rewards:** residents rotate through the workshop's residents. The Practice Pier, or a workshop without residents, uses every available workshop's residents, then the island's, then `pip` as the last resort. Materials are one unit per item, alternating between two products. The Practice Pier gives the first product of an available workshop that lists its resident. Puzzle Tower gives decor only. A request with challenge items, or bound to Puzzle Tower, adds one `puzzleDecor` id.
- **Narration:** a request is voiced by `req.help`, or by `req.idea` for a remediation, with `vars` `{ who, count, material }`.

**In-session adaptation (§6.4).** `adaptNext` implements the 02 §5.8 types exactly. The calling protocol it assumes:

- **Calls:** the `TaskRunner` calls it after every submit, with `state` already including that attempt. `request.tasks` is the runner's working list, and inserted tasks are spliced in right after the current task. `doneTaskIds` holds the tasks presented so far, the current one included.
- **Show-solution:** after it plays a worked solution, the runner calls `adaptNext` once more with the same `last` and `attemptNo + 1`. That call resolves the item, so wind-down and frustration are checked at the end of every item without cutting into it.
- **Request history:** first-try results inside the request come from `state.skills[s].recent`, the last *m* entries. *m* counts the presented tasks of `s` that enter `recent`: item mode, an evidence context, and a template whose own answer kind is constructed (`isConstructedTemplate`; a choice response never enters `recent`). The learner agrees: a choice item is answered with a choice or a skip, and the learner treats a skip on a choice-answer template like the choice it replaces, as not evidence. Its other responses keep E02's response-kind rule (§7a), and the rating weight still keys on the response kind.
- **Rule order:**
  1. an unresolved item: on the first wrong, `retry`; on the second wrong, `show-solution`;
  2. wind-down;
  3. a failed prerequisite probe ends the request;
  4. frustration;
  5. request complete;
  6. prerequisite probe;
  7. tier step-down;
  8. continue.

  Lesson tasks never retry here. The failed probe comes before frustration, so a confidence item never replaces its outcome.
- **Retry hint level (03 §5.8):** the next rung that the current task's template generates among levels 2–4. Level 2 exists when the template lists a first hint key, level 3 a second, and level 4 a third. The level is `available[min(hintsUsed, available.length − 1)]`, and level 1 (replay) when none of 2–4 exists.
- **Frustration:** the confidence item is the highest-P(ref) skill among practiced-track skills and the request's own skills, with a template in a format the request already uses, in the `warmup` context. A skill qualifies only if its run through the insertion point (the item just presented, the confidence item, the next task) stays within 3 items in a row (§4). Its seed is `confidenceSeed(request.id)`. Its own result never re-triggers. Frustration on a later item ends the request (`frustration`), with full celebration.
- **Prerequisite probe:** inserted once per skill. `AdaptInput` carries no workshop capability, but the request's workshop hosts every format its tasks already use, so the probe uses only a prerequisite template in one of those formats. The weakest prerequisite is the one with the lowest offset among those with such a template, ties by id. When no prerequisite has one, the rule does not fire. Its seed is `probeSeed(request.id, skill, prerequisite)`, and its context is `review` when the prerequisite is on the practiced track, else `practice`. The decision union cannot remove tasks, so a failed probe ends the request as `complete`, and the next plan schedules the prerequisite.
- **Tier step-down:** the last two first tries on the skill are wrong *at the same tier*, so the skill moves one tier below that tier, for the rest of the request. The wrongs that caused a step never cause another; the next step needs two more wrongs at the new tier. `tierOverrides` returns the merged map. A step is omitted at `concrete`, or when the current override is already at or below the target.
- **Misconception trigger:** it fires when the current attempt matched a misconception that has reached 2 hits in the skill's window. It can therefore repeat, so the runner keeps one queued remediation per (skill, misconception). Per 03 §7.1 the remediation skill is the first of the misconception's `remediation` skills that exists in the graph, is not the skill being practised and is on the practiced track (practiced or assumed). Otherwise it is the skill itself, and the planner's remediation request starts with its own lesson. The "concrete tier" in 03 §7.1 is the `TaskRunner`'s lesson presentation.

**Session simulation (§8).** `pnpm test:sim` runs the session simulation on the fixture graph until K02 lands. The simulated K and G2 children play 60 sessions each through the planner, `adaptNext` and the learner model.

- **Accuracy band, as asserted:** the band is read on each session's *expected* first-try accuracy (the mean of the child's hidden P) over the counted first tries whose generated item reached its target (|d − d\*| ≤ 0.5), for sessions with at least 8 such items. Two things keep the raw metric from measuring the targeting on this graph. Observed accuracy over 19–39 items has a sampling-noise ceiling below 80% of sessions even for a perfect controller. The K–1 content also cannot generate items as hard as the targets for strong children. The raw per-session metric is printed and kept as an expected failure. It is re-asserted on the full K–3 graph (K02).
- **Measured on the fixture graph:** G2 meets the band (88.6% of sessions), and so do both stationary learners (K 99.6%, G2 98.6%). K does not: 37.4% of sessions are in the band. On the raw metric 42.8% of K sessions are above the band and 14.9% below, and K's practice items have a mean hidden P of 0.892 at a mean d − d\* of +0.06. K is kept as an expected failure, and the simulated learner is not recalibrated to pass. K is re-checked on the full K–3 graph. If it still fails, young-learner adaptation is tuned there (Ks and the rolling controller, a §2.3–§2.4 change).
- **Review metric:** both profiles meet it: mastered skills are re-reviewed before recall < 0.6 in 95.8% of cases for K (23 of 24) and 96.0% for G2 (24 of 25). When a run has no mastered case, practiced-track skills stand in.

## 8. Testing requirements (engine)

- Unit tests for every formula above (table-driven).
- Property tests (fast-check):
  - folds are order-independent for the same event set;
  - `applyEvent` incremental = full fold;
  - the inventory never goes negative (clamped), and buildings are never un-built;
  - planner output always respects the item budgets and the no-more-than-3-in-a-row rule.
- **Simulated learner harness** (`engine/test/sim`, `pnpm test:sim`; runs on PRs touching `packages/engine` and nightly, against the fixture graph until K02 lands and then the full compiled graph): synthetic children with a hidden true mastery set over the real K–3 graph, answering with `P = σ(trueAbility − d)` plus guess and slip, and forgetting with a hidden half-life. Required results:
  - placement recovers the frontier with ≥ 85% per-skill classification accuracy within the K and G2 item budgets;
  - over 60 simulated sessions, first-try accuracy stays within 0.78–0.92 for ≥ 80% of sessions;
  - mastered skills that are forgotten are re-reviewed before their simulated recall drops below 0.6 in ≥ 90% of cases.
- **Replay test:** a recorded fixture log of 2,000 events replays to an identical snapshot (golden file). The log and snapshot are taken against a frozen copy of the content (`packages/engine/test/golden/content`, the C01 fixture), so curriculum PRs never move them. The same log also replays against the live content, which is checked for invariants only: no fold throws, and every skill gets a valid status. A deliberate change to what the folds compute from the same events, such as generator features (the learner rebuilds each attempt's difficulty from them, §2.2), re-derives only the snapshot with `UPDATE_GOLDEN=snapshot`.
