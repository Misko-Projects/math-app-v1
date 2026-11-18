// 04: every tunable v1 parameter of the learning engine, in one exported object so it can be
// tuned without code changes. Section references are to docs/spec/04-learning-engine.md.
// Values the spec leaves open are marked "(E02 reading)" and recorded in 02 §4.3.

export const DAY_MS = 86_400_000;

export interface EngineParams {
  /** §2.1–§2.3 Elo rating. */
  rating: {
    /** Ks(n) = ks / (1 + ksDecay·n). */
    ks: number;
    ksDecay: number;
    /** Kg(N) = kg / (1 + kgDecay·N). */
    kg: number;
    kgDecay: number;
    /** A new skill's offset is the mean prerequisite offset (n > 0) × this. */
    transferFactor: number;
    /** Weight of a slow correct answer (latency > slowFactor × expected). */
    slowWeight: number;
    slowFactor: number;
    /** Weight of a skip response. */
    skipWeight: number;
    /** Context and response multipliers of w (the §2.3 table). */
    lessonWeight: number;
    choiceWeight: number;
    /** expectedLatency default: abstract tier, manipulative (concrete or pictorial) tier, and the K multiplier. */
    expectedLatencyAbstractMs: number;
    expectedLatencyManipulativeMs: number;
    kLatencyFactor: number;
    /** A placement posterior is clamped to this range before it becomes a logit offset (E02 reading). */
    priorClamp: [number, number];
  };
  /** §2.4 rolling success controller. */
  controller: {
    window: number;
    high: number;
    low: number;
    stepUp: number;
    stepDown: number;
    cap: number;
    floor: number;
    /** The offset decays this fraction toward 0 at each session start. */
    sessionDecay: number;
  };
  /** §3 mastery ladder. */
  mastery: {
    /** last-N first attempts kept as evidence (SkillState.recent). */
    recentSize: number;
    pRef: number;
    /** k of the last n independent first attempts correct; variety = distinct formats or tiers (standard) or representations (gateway). */
    standard: { k: number; n: number; variety: number };
    gateway: { k: number; n: number; variety: number };
    minSessions: number;
    /** Fluent: median latency of the correct evidence attempts, needing at least this many (E02 reading). */
    fluencyMinSamples: number;
    /** Mastered: passed reviews ≥ firstReviewDays after practiced, then ≥ secondReviewDays after that. */
    firstReviewDays: number;
    secondReviewDays: number;
    /** Demotion after this many consecutive failed reviews. */
    demoteAfterFails: number;
    /** 03 §6.5: a test-out is offered at placement posterior ≥ testOutMinPrior or P(ref) ≥ testOutMinPRef. */
    testOutMinPrior: number;
    testOutMinPRef: number;
  };
  /** §4 FIRe-lite memory. */
  memory: {
    initialIntervalDays: number;
    assumedIntervalDays: number;
    /** R = retrievabilityBase^(elapsed / I). */
    retrievabilityBase: number;
    needsReviewBelow: number;
    multiplierFast: number;
    multiplierNormal: number;
    multiplierSlow: number;
    /** A correct review is "fast" at latency ≤ fastFactor × expected (E02 reading); slow is rating.slowFactor. */
    fastFactor: number;
    failureDivisor: number;
    minIntervalDays: number;
    /** Failure propagation: hard prerequisites become due within this many days. */
    atRiskDays: number;
    /** Review compression removes encompassed skills with weight ≥ this. */
    compressionMinWeight: number;
    /** Share of review tasks for mastered skills that are transfer probes. */
    transferProbeRate: number;
  };
  /** §5 placement (E03). */
  placement: {
    /** Priors by grade label relative to the child's grade g (advanced: g + 1). */
    priorBelow: number; // ≤ g − 1
    priorAt: number; // = g
    priorAbove: number; // = g + 1
    priorFar: number; // ≥ g + 2
    /** Probe candidates have p in this range. */
    candidateRange: [number, number];
    /** Converged when no skill on or near the frontier has p in this range. */
    uncertainRange: [number, number];
    /** U(v) counts uncertain ancestors and descendants within this many hops, at this weight each. */
    uncertaintyHops: number;
    uncertaintyWeight: number;
    gatewayBoost: number;
    /** Direct prerequisites of a wrongly answered probe get this added to their score. */
    downwardBoost: number;
    /** BKT guess (numeric entry) and slip. A k-choice item uses 1/k as its guess. */
    guess: number;
    slip: number;
    /** A slow-correct posterior is blended with the prior at this weight; a skip is an incorrect answer at this weight. */
    slowBlend: number;
    skipWeight: number;
    /** Propagation factors per hop (index 0 = 1 hop). */
    lambdaUp: number[];
    lambdaDown: number[];
    /** A skill is probed at most this many times in one placement. */
    maxProbesPerSkill: number;
    /** Item budgets: the K column and the G2 (G1+) column. */
    budgetK: { perSession: number; sessions: number };
    budgetG2: { perSession: number; sessions: number };
    /** Incremental (per strand) mini-placement: 4–6 items. */
    miniMin: number;
    miniMax: number;
    /** This many consecutive wrongs or skips plus a frustration signal end the mini-session. */
    frustrationMisses: number;
    /** p ≥ assumedAt → assumed; p ≤ unknownAt → not known. */
    assumedAt: number;
    unknownAt: number;
    /** p of a skill already on the practiced track (practiced or assumed); it is never probed (E03 reading). */
    onTrackP: number;
  };
}

export const PARAMS: EngineParams = {
  rating: {
    ks: 0.8,
    ksDecay: 0.08,
    kg: 0.12,
    kgDecay: 0.01,
    transferFactor: 0.5,
    slowWeight: 0.6,
    slowFactor: 2,
    skipWeight: 0.5,
    lessonWeight: 0.5,
    choiceWeight: 0.5,
    expectedLatencyAbstractMs: 8_000,
    expectedLatencyManipulativeMs: 12_000,
    kLatencyFactor: 1.5,
    priorClamp: [0.05, 0.95],
  },
  controller: {
    window: 20,
    high: 0.92,
    low: 0.75,
    stepUp: 0.2,
    stepDown: -0.3,
    cap: 1.0,
    floor: -1.5,
    sessionDecay: 0.2,
  },
  mastery: {
    recentSize: 10,
    pRef: 0.9,
    standard: { k: 5, n: 6, variety: 2 },
    gateway: { k: 6, n: 7, variety: 3 },
    minSessions: 2,
    fluencyMinSamples: 6,
    firstReviewDays: 1,
    secondReviewDays: 6,
    demoteAfterFails: 2,
    testOutMinPrior: 0.6,
    testOutMinPRef: 0.75,
  },
  memory: {
    initialIntervalDays: 1,
    assumedIntervalDays: 2,
    retrievabilityBase: 0.9,
    needsReviewBelow: 0.7,
    multiplierFast: 2.5,
    multiplierNormal: 2.0,
    multiplierSlow: 1.4,
    fastFactor: 1,
    failureDivisor: 3,
    minIntervalDays: 1,
    atRiskDays: 1,
    compressionMinWeight: 0.5,
    transferProbeRate: 0.1,
  },
  placement: {
    priorBelow: 0.85,
    priorAt: 0.5,
    priorAbove: 0.25,
    priorFar: 0.1,
    candidateRange: [0.2, 0.85],
    uncertainRange: [0.25, 0.8],
    uncertaintyHops: 3,
    uncertaintyWeight: 0.15,
    gatewayBoost: 1.3,
    downwardBoost: 0.5,
    guess: 0.05,
    slip: 0.1,
    slowBlend: 0.5,
    skipWeight: 0.5,
    lambdaUp: [0.8, 0.6, 0.4],
    lambdaDown: [0.5, 0.35, 0.2],
    maxProbesPerSkill: 2,
    budgetK: { perSession: 12, sessions: 4 },
    budgetG2: { perSession: 20, sessions: 3 },
    miniMin: 4,
    miniMax: 6,
    frustrationMisses: 2,
    assumedAt: 0.85,
    unknownAt: 0.3,
    onTrackP: 0.95,
  },
};
