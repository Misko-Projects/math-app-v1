// 04 §8 simulated-learner harness: a synthetic child with a hidden true mastery set over a
// SkillGraph. It answers with P = guess + (1 − guess − slip)·σ(trueAbility − d), takes about
// the template's expected time, sometimes skips what it does not know, and forgets with a hidden
// half-life (`recall`). Every draw comes from a seeded createRng stream.
//
// Two layers:
// - `answer` (placement): the hidden ability as drawn at the start, no learning, no forgetting.
//   The placement sim uses only this, and its draws come from their own stream.
// - `respond` / `study` / `retrieve` (sessions, see LearningParams): lessons and practice raise a
//   skill's hidden ability, and every skill the child knows has a hidden memory whose recall decays
//   with a half-life that spaced successful retrievals lengthen and failures shorten. These use
//   separate streams, so they never change the placement draws.

import type { Grade, SkillGraph, SkillId } from '@number-island/shared';
import { sigmoid } from '../../src/learner/math';
import { DAY_MS } from '../../src/params';
import { createRng, type Rng } from '../../src/rng';

const GRADE_INDEX: Readonly<Record<Grade, number>> = {
  K: 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  HS: 9,
};

/**
 * P(skill known | all its prerequisites known), by the skill's grade label relative to the
 * profile's grade. A skill with an unknown prerequisite is never known (the set is downward
 * closed), so the marginal known-rate of a deep skill is the product along its prerequisite
 * chains: the conditional rates sit above the marginal rates they are meant to produce.
 */
export interface KnownRates {
  /** ≤ g − 2 */
  wellBelow: number;
  /** = g − 1 */
  below: number;
  /** = g */
  at: number;
  /** = g + 1 */
  above: number;
  /** ≥ g + 2 */
  far: number;
}

/**
 * Learning and forgetting in sessions (the session sim). Calibration, for 5–8-year-olds:
 *
 * - Learning: the hidden ability approaches the child's ceiling for the skill (`knownAbility` ± the
 *   skill's jitter) with diminishing returns: a worked-example lesson closes `lessonRate` of the
 *   remaining gap (≈ 1 logit from the unknown level) and each practice item (with its feedback,
 *   hints and solution) `itemRate`. From the unknown level (−2), a lesson plus 10 items reaches
 *   ≈ +1.3 (P ≈ 0.78 on a typical item) and 20 items ≈ +2.1 (P ≈ 0.85): a new K skill takes three
 *   to five short sessions, as teachers report for early number skills. While a hard prerequisite
 *   is unknown, learning runs at `unmetPrereqFactor` of the rate.
 * - Overlearning (the power law of practice): practice beyond the known level keeps helping, more
 *   slowly. Above the ceiling each item closes `overlearnRate` of the gap to ceiling + `overlearn`
 *   (≈ +0.9 logit after 30 items, +1.3 after 60), and careless errors fade: the skill's slip is
 *   slip·(minSlipShare + (1 − minSlipShare)·slipDecay^items), half the child's slip after ~40
 *   items. Without this, a child at the known level answers a typical item at P ≈ 0.86 forever, so
 *   no amount of practice moves the model's P(ref) to the 0.90 that `practiced` needs (04 §3); the
 *   session sim reports that stationary variant as a sensitivity run.
 * - Memory: a skill counts as known once its ability reaches `knownAt` (the midpoint of the
 *   unknown and known levels). A newly learned skill starts with a half-life of `newHalfLifeDays`
 *   (2–5 days: recall 0.7–0.87 the next day, the steep early forgetting of new school learning). A
 *   skill known at the start uses the profile's `halfLifeDays` draw, × (1 + years the content has
 *   been in use), so content two grades down is the most durable (summer-slide studies report
 *   losses of a few weeks of learning over ~10 weeks off, i.e. half-lives of months for
 *   consolidated skills).
 * - Recall r = 2^(−elapsed / halfLife) since the last retrieval. Answering blends the known and
 *   the forgotten ability: P = r·P(a) + (1 − r)·P(a_forgotten), a_forgotten = max(the skill's
 *   unknown level, a − forgetDepth). Weak recall also slows the answer (latency × (1 +
 *   recallSlowdown·(1 − r))).
 * - Spacing effect: a successful retrieval at least `spacedMinDays` after the previous one
 *   multiplies the half-life by `growth[0]` at r = 1 rising linearly to `growth[1]` at r ≤
 *   1 − growthSpan (effortful retrieval strengthens memory more; ×1.5–2.5, below the ×2–3 that
 *   adult flashcard models such as FSRS fit near R = 0.9, since young children consolidate less per
 *   review). Massed same-day successes only reset the clock. A failed retrieval is a lapse in
 *   proportion to what was forgotten: the half-life is multiplied by failShrink + (1 −
 *   failShrink)·r (a slip at full recall costs nothing), never below `minHalfLifeDays` (relearning
 *   is never weaker than fresh learning: Ebbinghaus' savings); the hint and worked solution that
 *   follow re-encode it, so the clock restarts.
 * - Behaviour: a hint before the second try is worth `hintBonus` logits. A first-try miss is a
 *   rapid wrong tap (< 800 ms) with probability frustration × `rapidTapShare`; any item ends in a
 *   long idle (> 45 s) with probability `idleRate`. Offered a break, the child takes it with
 *   probability `takeBreak`.
 */
export interface LearningParams {
  lessonRate: number;
  itemRate: number;
  overlearn: number;
  overlearnRate: number;
  minSlipShare: number;
  slipDecay: number;
  unmetPrereqFactor: number;
  knownAt: number;
  newHalfLifeDays: [number, number];
  consolidationPerGrade: number;
  spacedMinDays: number;
  growth: [number, number];
  growthSpan: number;
  failShrink: number;
  minHalfLifeDays: number;
  forgetDepth: number;
  recallSlowdown: number;
  hintBonus: number;
  rapidTapShare: number;
  idleRate: number;
  takeBreak: number;
}

export interface LearnerProfile {
  name: string;
  grade: Grade;
  advanced: boolean;
  known: KnownRates;
  /** Logit ability of a known / unknown skill, ± jitter (uniform). */
  knownAbility: number;
  unknownAbility: number;
  abilityJitter: number;
  /** Per-child slip, uniform in this range. */
  slip: [number, number];
  /** Guess on a constructed-response item (choice items: 1/k). */
  guess: number;
  /** Chance of pressing "skip / I haven't learned this" on an unknown skill. */
  skipUnknown: number;
  /** Chance of showing a frustration signal on a miss. */
  frustration: number;
  /** Hidden memory half-life in days of a known skill, uniform in this range. */
  halfLifeDays: [number, number];
  /** Session learning and forgetting. */
  learning: LearningParams;
}

const LEARNING: LearningParams = {
  lessonRate: 0.22,
  itemRate: 0.1,
  overlearn: 1.5,
  overlearnRate: 0.03,
  minSlipShare: 0.4,
  slipDecay: 0.97,
  unmetPrereqFactor: 0.35,
  knownAt: 0.25,
  newHalfLifeDays: [2, 5],
  consolidationPerGrade: 1,
  spacedMinDays: 0.5,
  growth: [1.5, 2.5],
  growthSpan: 0.4,
  failShrink: 0.5,
  minHalfLifeDays: 2,
  forgetDepth: 3,
  recallSlowdown: 0.8,
  hintBonus: 1.0,
  rapidTapShare: 0.5,
  idleRate: 0.02,
  takeBreak: 0.5,
};

const BASE: Omit<LearnerProfile, 'name' | 'grade' | 'known'> = {
  advanced: false,
  knownAbility: 2.5,
  unknownAbility: -2,
  abilityJitter: 0.75,
  slip: [0.05, 0.1],
  guess: 0.05,
  skipUnknown: 0.1,
  frustration: 0.25,
  halfLifeDays: [4, 40],
  learning: LEARNING,
};

/** Typical conditional known-rates: a child has nearly all content two grades down. */
export const DEFAULT_KNOWN_RATES: KnownRates = {
  wellBelow: 0.98,
  below: 0.93,
  at: 0.6,
  above: 0.2,
  far: 0.05,
};

export function learnerProfile(
  name: string,
  grade: Grade,
  over: Partial<LearnerProfile> = {},
): LearnerProfile {
  return { ...BASE, known: { ...DEFAULT_KNOWN_RATES }, ...over, name, grade };
}

export const PROFILES = {
  K: learnerProfile('K', 'K', {
    skipUnknown: 0.15,
    frustration: 0.3,
    learning: { ...LEARNING, idleRate: 0.03 },
  }),
  G2: learnerProfile('G2', '2'),
} as const satisfies Record<string, LearnerProfile>;

export interface ProbeItem {
  skillId: SkillId;
  /** The generated item's difficulty logit. */
  difficulty: number;
  /** k for a k-choice item. */
  choices?: number;
  /** The template's expected latency for this child (ms). */
  expectedLatencyMs: number;
}

export interface SimAnswer {
  correct: boolean;
  skipped: boolean;
  latencyMs: number;
  frustrationSignal: boolean;
}

/** A session answer (`respond`). */
export interface SimResponse {
  correct: boolean;
  latencyMs: number;
  /** A rapid wrong tap (< 800 ms). */
  rapidWrong: boolean;
  /** A long idle (> 45 s) before answering. */
  idle: boolean;
  /** The hidden recall used for this answer (1 without memory). */
  recall: number;
}

/** A skill's hidden memory: recall 2^(−(now − lastTs) / halfLifeDays). */
export interface MemoryTrace {
  halfLifeDays: number;
  lastTs: number;
}

export interface SimLearner {
  readonly profile: LearnerProfile;
  readonly seed: number;
  /** The hidden true mastery set at the start (downward closed). Sessions never change it. */
  readonly known: ReadonlySet<SkillId>;
  /** The hidden ability per skill, as it is now. */
  readonly ability: Readonly<Record<SkillId, number>>;
  /** The profile's half-life draw per skill (the base of a start-known skill's memory). */
  readonly halfLifeDays: Readonly<Record<SkillId, number>>;
  readonly slip: number;
  /** P(correct) for an item at the start-of-sim ability, no forgetting (before skips). */
  pCorrect(item: Pick<ProbeItem, 'skillId' | 'difficulty' | 'choices'>): number;
  /** A placement answer (start-of-sim ability, no forgetting). */
  answer(item: ProbeItem): SimAnswer;
  /** Whether the child knows `skill` now (ability ≥ knownAt). */
  knows(skill: SkillId): boolean;
  /** P(correct) now: current ability blended by recall, + hintBonus with a hint. */
  pNow(
    item: Pick<ProbeItem, 'skillId' | 'difficulty' | 'choices'>,
    now: number,
    hint: boolean,
  ): number;
  /** A session answer. */
  respond(item: ProbeItem, now: number, hint: boolean): SimResponse;
  /** Learning from a lesson or one practice item (with its feedback, hints and solution). */
  study(skill: SkillId, now: number, kind: 'lesson' | 'item'): void;
  /** A retrieval (the first try of an item): updates the memory; returns it (null if not known). */
  retrieve(skill: SkillId, now: number, success: boolean): MemoryTrace | null;
  memory(skill: SkillId): MemoryTrace | null;
  /** Hidden recall 2^(−elapsed / halfLife) since the last retrieval (1 without memory). */
  recall(skill: SkillId, now: number): number;
}

function knownRate(rates: KnownRates, skillGrade: Grade, childGrade: number): number {
  const d = GRADE_INDEX[skillGrade] - childGrade;
  if (d <= -2) return rates.wellBelow;
  if (d === -1) return rates.below;
  if (d === 0) return rates.at;
  if (d === 1) return rates.above;
  return rates.far;
}

const uniform = (rng: Rng, [lo, hi]: readonly [number, number]): number =>
  lo + (hi - lo) * rng.float();

/** A synthetic child over `graph` (generic constructor; see PROFILES for K and G2). */
export function createLearner(
  graph: SkillGraph,
  profile: LearnerProfile,
  seed: number,
  startTs = 0,
): SimLearner {
  const root = createRng(seed).fork(`learner:${profile.name}`);
  const setup = root.fork('setup');
  const draws = root.fork('answers');
  const sessionDraws = root.fork('session');
  const memoryDraws = root.fork('memory');
  const g = GRADE_INDEX[profile.grade] + (profile.advanced ? 1 : 0);
  const L = profile.learning;

  const known = new Set<SkillId>();
  const ability: Record<SkillId, number> = {};
  const halfLifeDays: Record<SkillId, number> = {};
  // graph.nodes is topological: prerequisites are decided first.
  for (const s of graph.nodes) {
    const skill = graph.skills[s];
    const prereqsKnown = (graph.prereqs[s] ?? []).every((p) => known.has(p));
    const rate = skill ? knownRate(profile.known, skill.grade, g) : 0;
    const roll = setup.float();
    const jitter = (2 * setup.float() - 1) * profile.abilityJitter;
    const isKnown = prereqsKnown && roll < rate;
    if (isKnown) known.add(s);
    ability[s] = (isKnown ? profile.knownAbility : profile.unknownAbility) + jitter;
    halfLifeDays[s] = uniform(setup, profile.halfLifeDays);
  }
  const slip = uniform(setup, profile.slip);
  const startAbility: Record<SkillId, number> = { ...ability };

  // Session state (no draws above this line change).
  const jitterOf = (s: SkillId): number =>
    (startAbility[s] ?? profile.unknownAbility) -
    (known.has(s) ? profile.knownAbility : profile.unknownAbility);
  const ceiling = (s: SkillId): number => profile.knownAbility + jitterOf(s);
  const floor = (s: SkillId): number => profile.unknownAbility + jitterOf(s);
  const memory: Record<SkillId, MemoryTrace> = {};
  /** Practice items per skill in sessions. */
  const practiced: Record<SkillId, number> = {};
  const slipOf = (s: SkillId): number =>
    slip * (L.minSlipShare + (1 - L.minSlipShare) * L.slipDecay ** (practiced[s] ?? 0));
  for (const s of graph.nodes) {
    if (!known.has(s)) continue;
    const years = Math.max(0, g - GRADE_INDEX[graph.skills[s]?.grade ?? 'K']);
    memory[s] = {
      halfLifeDays: (halfLifeDays[s] as number) * (1 + L.consolidationPerGrade * years),
      lastTs: startTs,
    };
  }

  const guessOf = (item: Pick<ProbeItem, 'choices'>): number =>
    item.choices !== undefined && item.choices >= 2 ? 1 / item.choices : profile.guess;
  const pAt = (a: number, d: number, guess: number, sl: number): number =>
    guess + (1 - guess - sl) * sigmoid(a - d);

  const pCorrect = (item: Pick<ProbeItem, 'skillId' | 'difficulty' | 'choices'>): number => {
    const a = startAbility[item.skillId] ?? profile.unknownAbility;
    return pAt(a, item.difficulty, guessOf(item), slip);
  };

  const recall = (skill: SkillId, now: number): number => {
    const m = memory[skill];
    if (!m) return 1;
    return 2 ** (-Math.max(0, now - m.lastTs) / (m.halfLifeDays * DAY_MS));
  };
  const knows = (skill: SkillId): boolean =>
    (ability[skill] ?? profile.unknownAbility) >= L.knownAt;

  const pNow = (
    item: Pick<ProbeItem, 'skillId' | 'difficulty' | 'choices'>,
    now: number,
    hint: boolean,
  ): number => {
    const s = item.skillId;
    const a = (ability[s] ?? profile.unknownAbility) + (hint ? L.hintBonus : 0);
    const r = recall(s, now);
    const forgotten = Math.max(floor(s), a - L.forgetDepth);
    const guess = guessOf(item);
    const sl = slipOf(s);
    return (
      r * pAt(a, item.difficulty, guess, sl) + (1 - r) * pAt(forgotten, item.difficulty, guess, sl)
    );
  };

  return {
    profile,
    seed,
    known,
    ability,
    halfLifeDays,
    slip,
    pCorrect,
    answer(item) {
      const isKnown = known.has(item.skillId);
      const skipped = !isKnown && draws.bool(profile.skipUnknown);
      const correct = !skipped && draws.bool(pCorrect(item));
      // Known skills: about the expected time; unknown ones (and guesses) take longer.
      const factor = isKnown ? 0.45 + 1.1 * draws.float() : 0.8 + 1.7 * draws.float();
      const latencyMs = skipped
        ? Math.round(2_000 + 4_000 * draws.float())
        : Math.round(item.expectedLatencyMs * factor);
      const frustrationSignal = !correct && draws.bool(profile.frustration);
      return { correct, skipped, latencyMs, frustrationSignal };
    },
    knows,
    pNow,
    respond(item, now, hint) {
      const r = recall(item.skillId, now);
      const correct = sessionDraws.bool(pNow(item, now, hint));
      const isKnown = knows(item.skillId);
      const factor = isKnown
        ? (0.45 + 1.1 * sessionDraws.float()) * (1 + L.recallSlowdown * (1 - r))
        : 0.8 + 1.7 * sessionDraws.float();
      let latencyMs = Math.round(item.expectedLatencyMs * factor);
      const rapidWrong = !correct && sessionDraws.bool(profile.frustration * L.rapidTapShare);
      if (rapidWrong) latencyMs = Math.round(300 + 490 * sessionDraws.float());
      const idle = sessionDraws.bool(L.idleRate);
      if (idle) latencyMs += Math.round(46_000 + 24_000 * sessionDraws.float());
      return { correct, latencyMs, rapidWrong, idle, recall: r };
    },
    study(skill, now, kind) {
      const before = ability[skill] ?? profile.unknownAbility;
      const prereqsKnown = (graph.prereqs[skill] ?? []).every((p) => knows(p));
      const scale = prereqsKnown ? 1 : L.unmetPrereqFactor;
      const top = ceiling(skill);
      if (before < top) {
        // Aim a little past the ceiling so it is reached in finitely many steps.
        const rate = scale * (kind === 'lesson' ? L.lessonRate : L.itemRate);
        ability[skill] = Math.min(top, before + rate * (top + 0.25 - before));
      } else if (kind === 'item') {
        ability[skill] = before + scale * L.overlearnRate * (top + L.overlearn - before);
      }
      if (kind === 'item') practiced[skill] = (practiced[skill] ?? 0) + 1;
      if (!memory[skill] && knows(skill)) {
        memory[skill] = {
          halfLifeDays: uniform(memoryDraws.fork(skill), L.newHalfLifeDays),
          lastTs: now,
        };
      }
    },
    retrieve(skill, now, success) {
      const m = memory[skill];
      if (!m) return null;
      const elapsedDays = Math.max(0, now - m.lastTs) / DAY_MS;
      const r = recall(skill, now);
      let half = m.halfLifeDays;
      if (!success) {
        // A lapse costs in proportion to what was forgotten: a slip at full recall costs nothing.
        const shrink = L.failShrink + (1 - L.failShrink) * r;
        half = Math.max(L.minHalfLifeDays, half * shrink);
      } else if (elapsedDays >= L.spacedMinDays) {
        const t = Math.min(1, (1 - r) / L.growthSpan);
        half *= L.growth[0] + (L.growth[1] - L.growth[0]) * t;
      }
      const next = { halfLifeDays: half, lastTs: now };
      memory[skill] = next;
      return { ...next };
    },
    memory(skill) {
      const m = memory[skill];
      return m ? { ...m } : null;
    },
    recall,
  };
}
