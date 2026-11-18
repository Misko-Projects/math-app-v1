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

`expectedLatency` = the template's `expectedLatencyMs` (default 8,000 ms abstract, 12,000 ms manipulative), × 1.5 for K children.

### 2.4 Difficulty targeting

To pick an item for skill `s` at target success `p*`: `d* = θg + θs − logit(p*)`. The generator chooses params whose computed `d` is closest to `d*` (03 §5 defines the search).

| Context | `p*` (G1+) | `p*` (K) |
|---|---|---|
| practice | 0.85 | 0.88 |
| review | 0.90 | 0.92 |
| warmup / confidence | 0.95 | 0.96 |
| challenge (opt-in, puzzles) | 0.65 | 0.75 |
| placement | n/a (reference difficulty `d = 0`) | n/a |

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
- Reward amount = number of items (materials are the direct product). Requests that use challenge items add a rare decor item.
- If no workshop can host a skill's formats, choose another template of that skill whose format a built workshop hosts. If none exists, fall back to the **Practice Pier** generic workshop (05 §4), which hosts every format.

### 6.4 `adaptNext` rules (between items, inside a request)

1. Wrong on first try → `retry: true` with the hint ladder: nudge → representation → worked step. Second wrong → show the worked solution, narrate it, move on (no penalty language).
2. Two first-try wrongs in a row on the same skill → step down one CPA tier for that skill (abstract → pictorial → concrete) for the rest of the request.
3. Three first-try wrongs on the same skill in one request → insert one probe item for its weakest prerequisite (lowest `θ`). If that fails too, end the skill's slot and schedule the prerequisite.
4. **Frustration signals:** ≥ 3 wrong in the last 4 items; or 3 rapid taps (< 800 ms, response wrong); or 2 idle periods > 45 s. Response: give a confidence item (P ≥ 0.95), then offer "take a break?" (Pebbling suggests building something) or finish the request early with full celebration.
5. **Misconception trigger:** the same misconception matched ≥ 2 times in this child's last 10 attempts on the skill → queue the remediation skill's lesson as the next request ("Pebbling has an idea!"), and derive a parent alert (dashboard).
6. **Wind-down:** at the budget, finish the current item and request (truncating remaining tasks), then play the wind-down scene. A child may stop anytime with no penalty.

### 6.5 Fluency

Fact-fluency skills that are `practiced` but not `fluent` are routed to the fluency workshop (Rhythm Harvest). Latency is always measured silently. Visible timing ("beat your best") appears only for G1+ when the `timedChallenges` setting is on, and **never** for K.

## 7. Derived signals for the parent dashboard

- Skill map: status, `P(ref)`, last 10 attempts, formats and tiers covered, next review date, "assumed" flags and overrides.
- Misconception alerts: misconception id, skill, examples (item params plus response), suggested offline activity (from content).
- Time: minutes per day per child, sessions started by the child vs. prompted, natural vs. abandoned endings.
- Accuracy band: rolling first-try accuracy vs. target.
- Math density: math-interaction ms / active ms per session (the web app records interaction time).

## 8. Testing requirements (engine)

- Unit tests for every formula above (table-driven).
- Property tests (fast-check):
  - folds are order-independent for the same event set;
  - `applyEvent` incremental = full fold;
  - the inventory never goes negative;
  - planner output always respects the item budgets and the no-more-than-3-in-a-row rule.
- **Simulated learner harness** (`engine/test/sim`): synthetic children with a hidden true mastery set over the real K–3 graph, answering with `P = σ(trueAbility − d)` plus guess and slip, and forgetting with a hidden half-life. Required results:
  - placement recovers the frontier with ≥ 85% per-skill classification accuracy within the K and G2 item budgets;
  - over 60 simulated sessions, first-try accuracy stays within 0.78–0.92 for ≥ 80% of sessions;
  - mastered skills that are forgotten are re-reviewed before their simulated recall drops below 0.6 in ≥ 90% of cases.
- **Replay test:** a recorded fixture log of 2,000 events replays to an identical snapshot (golden file).
