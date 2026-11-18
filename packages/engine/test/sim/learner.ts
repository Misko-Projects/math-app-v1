// 04 §8 simulated-learner harness: a synthetic child with a hidden true mastery set over a
// SkillGraph. It answers with P = guess + (1 − guess − slip)·σ(trueAbility − d), takes about
// the template's expected time, sometimes skips what it does not know, and forgets with a hidden
// half-life (`recall`). Every draw comes from a seeded createRng stream.

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
}

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
  K: learnerProfile('K', 'K', { skipUnknown: 0.15, frustration: 0.3 }),
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

export interface SimLearner {
  readonly profile: LearnerProfile;
  readonly seed: number;
  /** The hidden true mastery set (downward closed). */
  readonly known: ReadonlySet<SkillId>;
  readonly ability: Readonly<Record<SkillId, number>>;
  readonly halfLifeDays: Readonly<Record<SkillId, number>>;
  readonly slip: number;
  /** P(correct) for an item (before skips). */
  pCorrect(item: Pick<ProbeItem, 'skillId' | 'difficulty' | 'choices'>): number;
  answer(item: ProbeItem): SimAnswer;
  /** Records practice of `skill` at `now` (resets its forgetting clock). */
  practice(skill: SkillId, now: number): void;
  /** Hidden recall 2^(−elapsed / halfLife) since the last practice (or since `startTs`). */
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
  const g = GRADE_INDEX[profile.grade] + (profile.advanced ? 1 : 0);

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
  const lastPractice: Record<SkillId, number> = {};

  const pCorrect = (item: Pick<ProbeItem, 'skillId' | 'difficulty' | 'choices'>): number => {
    const guess =
      item.choices !== undefined && item.choices >= 2 ? 1 / item.choices : profile.guess;
    const a = ability[item.skillId] ?? profile.unknownAbility;
    return guess + (1 - guess - slip) * sigmoid(a - item.difficulty);
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
    practice(skill, now) {
      lastPractice[skill] = now;
    },
    recall(skill, now) {
      const since = lastPractice[skill] ?? startTs;
      const half = halfLifeDays[skill] ?? profile.halfLifeDays[0];
      return 2 ** (-Math.max(0, now - since) / (half * DAY_MS));
    },
  };
}
