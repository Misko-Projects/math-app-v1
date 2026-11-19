// The v1 learner model `elo-fire-v1` (04 §2–§4): Elo-style rating with feature-based item
// difficulty, the rule-based mastery ladder, and FIRe-lite spaced review. Every method is pure:
// time comes in as `ts` / `now` (ms epoch) and nothing reads a clock or Math.random.

import type {
  AttemptPayload,
  ChildId,
  DueReview,
  EventPayloads,
  LearnerModel,
  LearnerState,
  PlacementPrior,
  RatedAttempt,
  Skill,
  SkillGraph,
  SkillId,
  SkillState,
  SkillStatus,
  StrandId,
  Tier,
} from '@number-island/shared';
import { FORMAT_DEFAULT_REPRESENTATION } from '@number-island/shared';
import { DAY_MS, type EngineParams, PARAMS } from '../params';
import { allDescendants } from './graph';
import { attemptDifficulty } from './item-difficulty';
import { logit, median, sigmoid } from './math';

export const ELO_FIRE_V1 = 'elo-fire-v1';

/**
 * Private engine bookkeeping on a skill state (02 §5.8 allows `_`-prefixed private fields).
 * - `_testOut` counts the first attempts of a never-attempted skill while a test-out (04 §3) is
 *   still possible; it is null once it is decided.
 * - `_correctLatencies`: latencies of the last 10 correct evidence first attempts (fluency).
 * - `_attempts` numbers the skill's non-placement attempts, and `_hitSeqs[i]` is the attempt
 *   number of `misconceptionHits[i]` (the misconception window, robust to equal timestamps).
 */
export type EngineSkillState = SkillState & {
  _testOut?: { seen: number; clean: number; templates: string[]; reps: string[] } | null;
  _correctLatencies?: number[];
  _attempts?: number;
  _hitSeqs?: number[];
};

/**
 * Private learner bookkeeping: `_sinceAdjust` counts first attempts since the last controller
 * adjustment (04 §2.4); `_deleted` marks a child whose tombstone was folded (08 §4: permanent).
 */
export type EngineLearnerState = LearnerState & { _sinceAdjust?: number; _deleted?: true };

export interface LearnerOptions {
  childId: ChildId;
  /** K columns of the 04 tables (expected latency and fluency thresholds × 1.5). */
  isK: boolean;
  params?: EngineParams;
  /** Override the item difficulty of an attempt (default: rebuilt from its template and params). */
  difficultyOf?: (attempt: AttemptPayload, graph: SkillGraph) => number;
}

const EVIDENCE_CONTEXTS: ReadonlySet<AttemptPayload['context']> = new Set([
  'practice',
  'review',
  'warmup',
  'challenge',
  'transfer-probe',
]);
const REVIEW_CONTEXTS: ReadonlySet<AttemptPayload['context']> = new Set([
  'review',
  'transfer-probe',
]);

/** The `elo-fire-v1` model, bound to one skill graph and one child. */
export interface EloFireModel extends LearnerModel {
  readonly graph: SkillGraph;
  readonly params: EngineParams;
  /** `placement.completed`: merge the posterior into the prior and seed assumed skills (04 §5). */
  applyPlacement(
    state: LearnerState,
    payload: EventPayloads['placement.completed'],
    ts: number,
  ): LearnerState;
  /** `placement.probe`: marks the placement as in progress (it resumes from its probes). */
  applyPlacementProbe(state: LearnerState, payload: EventPayloads['placement.probe']): LearnerState;
  /** `skill.override` (04 §3 parent override). */
  applyOverride(
    state: LearnerState,
    payload: EventPayloads['skill.override'],
    ts: number,
  ): LearnerState;
  /** `session.started`: counts the session and decays the rolling success offset (04 §2.4). */
  startSession(state: LearnerState): LearnerState;
  /** θs used for a skill: its own offset, or the transfer / prior offset if never attempted (04 §2.1). */
  skillOffset(state: LearnerState, skill: SkillId): number;
  /** P(correct) at the reference difficulty d = 0. */
  pRef(state: LearnerState, skill: SkillId): number;
  /** R = 0.9^(elapsed / I) for a skill with memory, else null (04 §4). */
  retrievability(state: LearnerState, skill: SkillId, now: number): number | null;
  /** expectedLatency(template, child) in ms (04 §2.3). */
  expectedLatency(attempt: Pick<AttemptPayload, 'templateId' | 'tier'>): number;
  /**
   * Whether the skill's next evidence item is a test-out item (03 §6.5): a test-out is offered on
   * an untouched skill, or one is in progress. Test-out items are asked at d* = 0 (E03 reading).
   */
  inTestOut(state: LearnerState, skill: SkillId): boolean;
}

export function createEloFireModel(graph: SkillGraph, opts: LearnerOptions): EloFireModel {
  const P = opts.params ?? PARAMS;
  const difficultyOf =
    opts.difficultyOf ?? ((a: AttemptPayload, g: SkillGraph) => defaultDifficulty(a, g));

  const def = (s: SkillId): Skill | undefined => graph.skills[s];

  const expectedLatency = (a: Pick<AttemptPayload, 'templateId' | 'tier'>): number => {
    const t = graph.templates[a.templateId];
    const base =
      t?.expectedLatencyMs ??
      (a.tier === 'abstract'
        ? P.rating.expectedLatencyAbstractMs
        : P.rating.expectedLatencyManipulativeMs);
    return base * (opts.isK ? P.rating.kLatencyFactor : 1);
  };
  const isSlow = (a: AttemptPayload) => a.latencyMs > P.rating.slowFactor * expectedLatency(a);

  const priorOffset = (state: LearnerState, s: SkillId): number | null => {
    const p = state.placement.prior?.p[s];
    if (p === undefined) return null;
    const [lo, hi] = P.rating.priorClamp;
    return logit(Math.min(hi, Math.max(lo, p))) - state.thetaG;
  };

  const transferOffset = (state: LearnerState, s: SkillId): number => {
    const known = (graph.prereqs[s] ?? [])
      .map((p) => state.skills[p])
      .filter((st): st is SkillState => st !== undefined && st.n > 0);
    if (known.length === 0) return 0;
    return (known.reduce((sum, st) => sum + st.theta, 0) / known.length) * P.rating.transferFactor;
  };

  /** A skill has its own offset once rated (or after a parent reset, which keeps it). */
  const rated = (st: SkillState): boolean => st.n > 0 || st.override === 'reset';

  const skillOffset = (state: LearnerState, s: SkillId): number => {
    const st = state.skills[s];
    if (st && rated(st)) return st.theta;
    return priorOffset(state, s) ?? transferOffset(state, s);
  };

  const fresh = (state: LearnerState, s: SkillId): EngineSkillState => ({
    theta: skillOffset(state, s),
    n: 0,
    recent: [],
    assumed: false,
    override: null,
    practicedAt: null,
    fluentAt: null,
    masteredAt: null,
    memory: null,
    atRiskDueTs: null,
    misconceptionHits: [],
  });

  const cloneSkill = (st: EngineSkillState): EngineSkillState => ({
    ...st,
    recent: [...st.recent],
    misconceptionHits: [...st.misconceptionHits],
    memory: st.memory ? { ...st.memory, reviewsPassed: [...st.memory.reviewsPassed] } : null,
    ...(st._testOut
      ? {
          _testOut: {
            ...st._testOut,
            templates: [...st._testOut.templates],
            reps: [...st._testOut.reps],
          },
        }
      : {}),
    ...(st._correctLatencies ? { _correctLatencies: [...st._correctLatencies] } : {}),
    ...(st._hitSeqs ? { _hitSeqs: [...st._hitSeqs] } : {}),
  });

  const newMemory = (ts: number, intervalDays: number): NonNullable<SkillState['memory']> => ({
    intervalDays,
    lastReviewTs: ts,
    dueTs: ts + Math.round(intervalDays * DAY_MS),
    reps: 0,
    reviewsPassed: [],
    consecutiveFails: 0,
  });

  const onTrack = (st: SkillState | undefined): boolean =>
    st !== undefined && (st.practicedAt !== null || st.assumed);

  const prereqsMet = (state: LearnerState, s: SkillId): boolean =>
    (graph.prereqs[s] ?? []).every((p) => onTrack(state.skills[p]));

  const retrievabilityOf = (st: SkillState | undefined, now: number): number | null => {
    if (!st?.memory) return null;
    const elapsed = Math.max(0, now - st.memory.lastReviewTs) / DAY_MS;
    const I = Math.max(st.memory.intervalDays, Number.EPSILON);
    return P.memory.retrievabilityBase ** (elapsed / I);
  };

  // ---------- mastery rules (04 §3) ----------

  const independent = (r: RatedAttempt) => r.correct && !r.hinted;

  const meetsPracticed = (state: LearnerState, s: SkillId, st: SkillState): boolean => {
    if (sigmoid(state.thetaG + st.theta) < P.mastery.pRef) return false;
    const gateway = def(s)?.gateway ?? false;
    const rule = gateway ? P.mastery.gateway : P.mastery.standard;
    const lastN = st.recent.slice(-rule.n);
    if (lastN.length < rule.n || lastN.filter(independent).length < rule.k) return false;
    const correct = st.recent.filter(independent);
    if (new Set(correct.map((r) => r.sessionId)).size < P.mastery.minSessions) return false;
    if (gateway) {
      return (
        new Set(correct.map((r) => r.representation)).size >= rule.variety &&
        correct.some((r) => r.tier === 'abstract')
      );
    }
    const varied =
      new Set(correct.map((r) => r.format)).size >= rule.variety ||
      new Set(correct.map((r) => r.tier)).size >= rule.variety;
    return varied && correct.some((r) => r.tier === 'pictorial' || r.tier === 'abstract');
  };

  const meetsFluent = (s: SkillId, st: SkillState): boolean => {
    const skill = def(s);
    if (skill?.kind !== 'fact-fluency' || !skill.fluency || st.practicedAt === null) return false;
    // The last 10 correct evidence responses (04 §3), kept beyond `recent`'s window.
    const latencies = (st as EngineSkillState)._correctLatencies ?? [];
    if (latencies.length < P.mastery.fluencyMinSamples) return false;
    const limit = skill.fluency.medianLatencyMs * (opts.isK ? P.rating.kLatencyFactor : 1);
    return median(latencies) <= limit;
  };

  const meetsMastered = (s: SkillId, st: SkillState): boolean => {
    if (!st.memory) return false;
    const base = def(s)?.kind === 'fact-fluency' ? st.fluentAt : st.practicedAt;
    if (base === null) return false;
    const passed = [...st.memory.reviewsPassed].sort((a, b) => a - b);
    const first = passed.find((t) => t >= base + P.mastery.firstReviewDays * DAY_MS);
    if (first === undefined) return false;
    return passed.some((t) => t >= first + P.mastery.secondReviewDays * DAY_MS);
  };

  /** The template ids a test-out draws from (03 §6.5): the compiled pool, else abstract (or pictorial). */
  const testOutPool = (s: SkillId): ReadonlySet<string> => {
    const skill = def(s);
    if (!skill) return new Set();
    if (skill.lesson.testOut.templateIds) return new Set(skill.lesson.testOut.templateIds);
    const tiers = (tier: Tier) =>
      skill.templates.filter((id) => graph.templates[id]?.tier === tier);
    const abstract = tiers('abstract');
    return new Set(abstract.length > 0 ? abstract : tiers('pictorial'));
  };

  const representationOf = (templateId: string): string | undefined => {
    const t = graph.templates[templateId];
    return t ? (t.representation ?? FORMAT_DEFAULT_REPRESENTATION[t.format]) : undefined;
  };

  /**
   * 03 §6.5 draw rules: ≥ 2 distinct templates when the pool has ≥ 2, and for a gateway skill
   * ≥ 2 representations when the pool spans ≥ 2.
   */
  const testOutDrawOk = (s: SkillId, t: { templates: string[]; reps: string[] }): boolean => {
    const pool = [...testOutPool(s)];
    if (t.templates.length < Math.min(2, pool.length)) return false;
    if (!def(s)?.gateway) return true;
    const poolReps = new Set(pool.map(representationOf).filter((r) => r !== undefined));
    return t.reps.length >= Math.min(2, poolReps.size);
  };

  /**
   * 03 §6.5 / 04 §7a: a test-out is offered on a skill with a lesson (`testOut.items` ≥ 1) whose
   * prerequisites are met, when its placement posterior is ≥ testOutMinPrior or its P(ref)
   * (`pRefNow`, with the transferred offset for a never-rated skill) is ≥ testOutMinPRef.
   */
  const testOutOffered = (state: LearnerState, s: SkillId, pRefNow: number): boolean => {
    const skill = def(s);
    if (!skill || skill.lesson.mode === 'none' || skill.lesson.testOut.items < 1) return false;
    if (!prereqsMet(state, s)) return false;
    return (
      (state.placement.prior?.p[s] ?? 0) >= P.mastery.testOutMinPrior ||
      pRefNow >= P.mastery.testOutMinPRef
    );
  };

  const inTestOut = (state: LearnerState, s: SkillId): boolean => {
    const st = state.skills[s] as EngineSkillState | undefined;
    if (st && (st.n > 0 || st.recent.length > 0)) return st._testOut != null;
    return testOutOffered(state, s, sigmoid(state.thetaG + skillOffset(state, s)));
  };

  const demote = (st: EngineSkillState): void => {
    st.practicedAt = null;
    st.fluentAt = null;
    st.masteredAt = null;
    st.memory = null;
    st.assumed = false;
    st.atRiskDueTs = null;
    if (st.override === 'mastered') st.override = null;
  };

  // ---------- review (04 §4) ----------

  const reviewMultiplier = (a: AttemptPayload): number => {
    const expected = expectedLatency(a);
    if (a.hintsUsed > 0 || a.latencyMs > P.rating.slowFactor * expected)
      return P.memory.multiplierSlow;
    if (a.latencyMs <= P.memory.fastFactor * expected) return P.memory.multiplierFast;
    return P.memory.multiplierNormal;
  };

  const reviewSuccess = (
    skills: Record<SkillId, EngineSkillState>,
    s: SkillId,
    st: EngineSkillState,
    a: AttemptPayload,
    ts: number,
  ): void => {
    const mem = st.memory as NonNullable<SkillState['memory']>;
    const m = reviewMultiplier(a);
    const frac = Math.min(1, Math.max(0, ts - mem.lastReviewTs) / DAY_MS / mem.intervalDays);
    mem.intervalDays *= 1 + (m - 1) * frac;
    mem.lastReviewTs = ts;
    mem.dueTs = ts + Math.round(mem.intervalDays * DAY_MS);
    mem.reps += 1;
    mem.reviewsPassed = [...mem.reviewsPassed, ts];
    mem.consecutiveFails = 0;
    st.atRiskDueTs = null;
    // Verified (04 §5 week-one verification): an assumed skill stays on the practiced track.
    st.practicedAt ??= ts;
    st.assumed = false;

    // Implicit credit, one hop (04 §4).
    const enc = graph.encompasses[s] ?? def(s)?.encompasses ?? {};
    for (const b of Object.keys(enc).sort()) {
      const w = enc[b] as number;
      const prev = skills[b];
      if (!prev?.memory || b === s) continue;
      const sb = cloneSkill(prev);
      const mb = sb.memory as NonNullable<SkillState['memory']>;
      const fb = Math.min(1, Math.max(0, ts - mb.lastReviewTs) / DAY_MS / mb.intervalDays);
      mb.intervalDays *= 1 + (m - 1) * w * fb;
      mb.dueTs = mb.lastReviewTs + Math.round(mb.intervalDays * DAY_MS);
      skills[b] = sb;
    }
  };

  const reviewFailure = (
    skills: Record<SkillId, EngineSkillState>,
    s: SkillId,
    st: EngineSkillState,
    ts: number,
  ): boolean => {
    let demoted = false;
    if (st.assumed) {
      // Week-one verification (04 §5): an assumed skill that fails is demoted with every
      // assumed descendant; the graph then decides ready / locked.
      demote(st);
      demoted = true;
      for (const d of allDescendants(graph, s)) {
        const prev = skills[d];
        if (!prev?.assumed) continue;
        const sd = cloneSkill(prev);
        demote(sd);
        skills[d] = sd;
      }
    } else {
      const mem = st.memory as NonNullable<SkillState['memory']>;
      mem.intervalDays = Math.max(
        P.memory.minIntervalDays,
        mem.intervalDays / P.memory.failureDivisor,
      );
      mem.lastReviewTs = ts;
      mem.dueTs = ts + Math.round(mem.intervalDays * DAY_MS);
      mem.consecutiveFails += 1;
      if (mem.consecutiveFails >= P.mastery.demoteAfterFails) {
        demote(st);
        demoted = true;
      }
    }
    // Failure propagation (04 §4): hard prerequisites are due within a day.
    const atRisk = ts + P.memory.atRiskDays * DAY_MS;
    for (const p of graph.prereqs[s] ?? []) {
      const prev = skills[p];
      if (!prev) continue;
      const sp = cloneSkill(prev);
      sp.atRiskDueTs = Math.min(sp.atRiskDueTs ?? Number.POSITIVE_INFINITY, atRisk);
      skills[p] = sp;
    }
    return demoted;
  };

  // ---------- LearnerModel ----------

  const init = (_g: SkillGraph, prior: PlacementPrior | null): LearnerState => {
    const state: LearnerState = {
      modelId: ELO_FIRE_V1,
      childId: opts.childId,
      thetaG: 0,
      nTotal: 0,
      skills: {},
      successOffset: 0,
      recentFirstTry: [],
      placement: { prior, strandsPlaced: [], inProgress: null },
      sessionsSeen: 0,
    };
    for (const a of [...(prior?.assumed ?? [])].sort()) {
      state.skills[a] = { ...fresh(state, a), assumed: true };
    }
    return state;
  };

  const apply = (state: LearnerState, a: AttemptPayload, ts: number): LearnerState => {
    // Placement attempts never move θ: placement feeds the prior (04 §2.3, §5).
    if (a.context === 'placement') return state;
    const s = a.skillId;
    const skills: Record<SkillId, EngineSkillState> = { ...state.skills };
    const prev = skills[s];
    const st = prev ? cloneSkill(prev) : fresh(state, s);
    // A never-rated skill starts from the current prior or transfer offset (04 §2.1).
    if (!rated(st)) st.theta = skillOffset(state, s);
    skills[s] = st;
    const next: EngineLearnerState = { ...state, skills };

    // Misconception hits within the last 10 attempts on the skill (04 §6.4, SkillState).
    const seq = (st._attempts ?? 0) + 1;
    st._attempts = seq;
    const hits = [...st.misconceptionHits, ...a.misconceptionIds.map((id) => ({ id, ts }))];
    // Private fields do not survive schema validation (02 §5.8 strips them). A hit whose attempt
    // number is unknown cannot be placed in the window, so it expires: stale evidence must never
    // trigger a remediation (04 §6.4). Rebuild from the events to keep it.
    const known =
      st._hitSeqs?.length === st.misconceptionHits.length
        ? st._hitSeqs
        : st.misconceptionHits.map(() => Number.NEGATIVE_INFINITY);
    const seqs = [...known, ...a.misconceptionIds.map(() => seq)];
    const keep = seqs.map((n) => n > seq - P.mastery.recentSize);
    st.misconceptionHits = hits.filter((_, i) => keep[i]);
    st._hitSeqs = seqs.filter((_, i) => keep[i]);

    if (a.attemptNo !== 1) return next;

    // §2.3 rating update (first attempt only).
    const isSkip = a.response.kind === 'skip';
    const isChoice = a.response.kind === 'choice';
    const isLesson = a.context === 'lesson';
    const slow = a.correct && isSlow(a);
    const score = isSkip ? 0 : Math.min(1, Math.max(0, a.partialCredit));
    let w = 1;
    if (slow) w = P.rating.slowWeight;
    if (isSkip) w = P.rating.skipWeight;
    if (isLesson) w *= P.rating.lessonWeight;
    if (isChoice) w *= P.rating.choiceWeight;
    const pBefore = sigmoid(state.thetaG + st.theta - difficultyOf(a, graph));
    const pRefBefore = sigmoid(state.thetaG + st.theta);
    const e = score - pBefore;
    const wasUntouched = st.n === 0 && st.recent.length === 0;
    st.theta += (P.rating.ks / (1 + P.rating.ksDecay * st.n)) * w * e;
    next.thetaG = state.thetaG + (P.rating.kg / (1 + P.rating.kgDecay * state.nTotal)) * w * e;
    st.n += 1;
    next.nTotal = state.nTotal + 1;

    // §2.4 rolling success controller: first-try accuracy over the last 20 items. The window
    // always rolls; after an adjustment the next one waits for 20 new items (E02 reading).
    if (!isLesson) {
      const window = [...state.recentFirstTry, a.correct].slice(-P.controller.window);
      const since = ((state as EngineLearnerState)._sinceAdjust ?? P.controller.window - 1) + 1;
      next.recentFirstTry = window;
      next._sinceAdjust = Math.min(since, P.controller.window);
      if (window.length === P.controller.window && since >= P.controller.window) {
        const acc = window.filter(Boolean).length / window.length;
        if (acc > P.controller.high) {
          next.successOffset = Math.min(
            P.controller.cap,
            state.successOffset + P.controller.stepUp,
          );
          next._sinceAdjust = 0;
        } else if (acc < P.controller.low) {
          next.successOffset = Math.max(
            P.controller.floor,
            state.successOffset + P.controller.stepDown,
          );
          next._sinceAdjust = 0;
        }
      }
    }

    const evidence = EVIDENCE_CONTEXTS.has(a.context) && !isChoice;
    if (evidence) {
      st.recent = [
        ...st.recent,
        {
          ts,
          sessionId: a.sessionId,
          correct: a.correct,
          hinted: a.hintsUsed > 0,
          format: a.format,
          tier: a.tier,
          representation: a.representation,
          latencyMs: a.latencyMs,
          context: a.context,
        },
      ].slice(-P.mastery.recentSize);
      if (a.correct) {
        st._correctLatencies = [...(st._correctLatencies ?? []), a.latencyMs].slice(
          -P.mastery.recentSize,
        );
      }
    }

    // §3 test-out (03 §6.5): offered on a ready skill whose placement posterior is ≥ 0.6 or whose
    // P(ref) with the transferred offset is ≥ 0.75; its first `testOut.items` items come from
    // the test-out pool (which may hold choice templates).
    const skill = def(s);
    const inPool = EVIDENCE_CONTEXTS.has(a.context) && testOutPool(s).has(a.templateId);
    if (wasUntouched) {
      st._testOut =
        inPool && testOutOffered(state, s, pRefBefore)
          ? { seen: 0, clean: 0, templates: [], reps: [] }
          : null;
    }
    let testedOut = false;
    if (st._testOut && skill) {
      if (!inPool) {
        st._testOut = null;
      } else {
        const clean = a.correct && a.hintsUsed === 0 && !slow;
        const t = st._testOut;
        st._testOut = {
          seen: t.seen + 1,
          clean: t.clean + (clean ? 1 : 0),
          templates: t.templates.includes(a.templateId)
            ? t.templates
            : [...t.templates, a.templateId],
          reps: t.reps.includes(a.representation) ? t.reps : [...t.reps, a.representation],
        };
        if (st._testOut.seen >= skill.lesson.testOut.items) {
          testedOut =
            st._testOut.clean >= skill.lesson.testOut.minCorrect && testOutDrawOk(s, st._testOut);
          st._testOut = null;
        }
      }
    }

    // §4 explicit review result.
    let demoted = false;
    if (REVIEW_CONTEXTS.has(a.context) && onTrack(st)) {
      if (!st.memory) {
        st.memory = newMemory(
          ts,
          st.assumed ? P.memory.assumedIntervalDays : P.memory.initialIntervalDays,
        );
      }
      if (a.correct) reviewSuccess(skills, s, st, a, ts);
      else demoted = reviewFailure(skills, s, st, ts);
    }

    // §3 ladder transitions, recorded when first met. The failure that demotes a skill never
    // promotes it again on the same attempt.
    if ((evidence || testedOut) && !demoted) {
      if (st.practicedAt === null && !st.assumed && (testedOut || meetsPracticed(next, s, st))) {
        st.practicedAt = ts;
        st.memory = newMemory(ts, P.memory.initialIntervalDays);
      }
      if (st.fluentAt === null && meetsFluent(s, st)) st.fluentAt = ts;
    }
    // Mastery depends only on passed reviews, so a passed review of any response kind counts.
    if (!demoted && st.masteredAt === null && meetsMastered(s, st)) st.masteredAt = ts;
    // Passed reviews are kept until the skill is mastered (early reviews must not push the
    // qualifying ones out), then only the last 10.
    if (st.memory && st.masteredAt !== null) {
      st.memory.reviewsPassed = st.memory.reviewsPassed.slice(-P.mastery.recentSize);
    }
    return next;
  };

  const predict = (state: LearnerState, s: SkillId, d: number): number =>
    sigmoid(state.thetaG + skillOffset(state, s) - d);

  const status = (state: LearnerState, s: SkillId, now: number): SkillStatus => {
    const st = state.skills[s];
    if (st && onTrack(st)) {
      const R = retrievabilityOf(st, now);
      if (
        st.memory &&
        ((R !== null && R < P.memory.needsReviewBelow) || st.memory.consecutiveFails > 0)
      ) {
        return 'needs-review';
      }
      if (st.masteredAt !== null) return 'mastered';
      if (def(s)?.kind === 'fact-fluency' && st.fluentAt !== null) return 'fluent';
      return 'practiced';
    }
    if (!prereqsMet(state, s)) return 'locked';
    return st && st.n > 0 ? 'learning' : 'ready';
  };

  const dueReviews = (state: LearnerState, now: number): DueReview[] => {
    const out: DueReview[] = [];
    for (const s of Object.keys(state.skills).sort()) {
      const st = state.skills[s] as SkillState;
      if (!onTrack(st) || (!st.memory && st.atRiskDueTs === null)) continue;
      const memDue = st.memory?.dueTs ?? Number.POSITIVE_INFINITY;
      const riskDue = st.atRiskDueTs ?? Number.POSITIVE_INFINITY;
      const dueTs = Math.min(memDue, riskDue);
      if (now < dueTs) continue;
      out.push({
        skillId: s,
        dueTs,
        retrievability: retrievabilityOf(st, now) ?? 1,
        depth: graph.depth[s] ?? 0,
        atRisk: riskDue <= memDue,
      });
    }
    return out.sort(
      (a, b) => b.depth - a.depth || a.dueTs - b.dueTs || (a.skillId < b.skillId ? -1 : 1),
    );
  };

  const frontier = (state: LearnerState): SkillId[] =>
    graph.nodes.filter((s) => {
      const st = state.skills[s];
      return !onTrack(st) && prereqsMet(state, s);
    });

  // ---------- events beyond attempts ----------

  const applyPlacement = (
    state: LearnerState,
    payload: EventPayloads['placement.completed'],
    ts: number,
  ): LearnerState => {
    const prior: PlacementPrior = {
      p: { ...(state.placement.prior?.p ?? {}), ...payload.posterior },
      assumed: [...new Set([...(state.placement.prior?.assumed ?? []), ...payload.assumed])].sort(),
    };
    const strands = new Set<StrandId>(state.placement.strandsPlaced);
    if (payload.strand) strands.add(payload.strand);
    else
      for (const s of Object.keys(payload.posterior)) {
        const strand = def(s)?.strand;
        if (strand) strands.add(strand);
      }
    const next: LearnerState = {
      ...state,
      skills: { ...state.skills },
      placement: {
        prior,
        strandsPlaced: [...strands].sort(),
        inProgress:
          state.placement.inProgress === payload.placementId ? null : state.placement.inProgress,
      },
    };
    for (const a of [...payload.assumed].sort()) {
      const prev = next.skills[a];
      if (onTrack(prev)) continue;
      const st = prev ? cloneSkill(prev) : fresh(next, a);
      st.assumed = true;
      st.practicedAt = ts;
      st.memory = newMemory(ts, P.memory.assumedIntervalDays);
      next.skills[a] = st;
    }
    return next;
  };

  const applyPlacementProbe = (
    state: LearnerState,
    payload: EventPayloads['placement.probe'],
  ): LearnerState =>
    state.placement.inProgress === payload.placementId
      ? state
      : { ...state, placement: { ...state.placement, inProgress: payload.placementId } };

  const applyOverride = (
    state: LearnerState,
    payload: EventPayloads['skill.override'],
    ts: number,
  ): LearnerState => {
    const s = payload.skillId;
    const prev = state.skills[s];
    let st: EngineSkillState;
    if (payload.to === 'mastered') {
      st = prev ? cloneSkill(prev) : fresh(state, s);
      st.practicedAt ??= ts;
      if (def(s)?.kind === 'fact-fluency') st.fluentAt ??= ts;
      st.masteredAt = ts;
      st.memory = newMemory(ts, P.memory.initialIntervalDays);
      st.atRiskDueTs = null;
    } else {
      // Reset to ready: the evidence and ladder restart; the rating offset is kept.
      // The effective offset (the current prior or transfer if the skill was never rated).
      st = { ...fresh(state, s), theta: skillOffset(state, s), _testOut: null };
    }
    st.override = payload.to;
    return { ...state, skills: { ...state.skills, [s]: st } };
  };

  const startSession = (state: LearnerState): LearnerState => ({
    ...state,
    sessionsSeen: state.sessionsSeen + 1,
    successOffset: state.successOffset * (1 - P.controller.sessionDecay),
  });

  return {
    id: ELO_FIRE_V1,
    graph,
    params: P,
    init,
    apply,
    predict,
    status,
    dueReviews,
    frontier,
    applyPlacement,
    applyPlacementProbe,
    applyOverride,
    startSession,
    skillOffset,
    pRef: (state, s) => predict(state, s, 0),
    retrievability: (state, s, now) => retrievabilityOf(state.skills[s], now),
    expectedLatency,
    inTestOut,
  };
}

function defaultDifficulty(a: AttemptPayload, graph: SkillGraph): number {
  const t = graph.templates[a.templateId];
  return t ? attemptDifficulty(t, a.params, a.seed) : 0;
}
