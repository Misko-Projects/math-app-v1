// 04 §8 simulated-learner harness: the hidden known sets meet their known-rate targets. For
// content already taught, `conditionalKnownRates` calibrates P(known | prerequisites known) per
// skill so that P(known) is the target; children drawn by `createLearner` (their own seeds, not
// the calibration's) must realise it within ±0.03, or, where the downward closure cannot reach
// it, know the skill whenever they know its prerequisites. Content being learned keeps its
// conditional rate.

import type { SkillId } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { simContent } from './content';
import {
  CALIBRATION_SAMPLES,
  conditionalKnownRates,
  createLearner,
  isMarginalRate,
  knownRate,
  PROFILES,
} from './learner';

const CHILDREN = 4000;
const GRADE = { K: 0, G2: 2 } as const;

describe('learner known-set calibration (04 §8)', () => {
  const { graph } = simContent();

  it('is deterministic', () => {
    const rates = { ...PROFILES.G2.known };
    const a = conditionalKnownRates(graph, rates, GRADE.G2);
    // A fresh graph object misses the memo, so this recomputes from the fixed seed.
    const b = conditionalKnownRates({ ...graph }, { ...rates }, GRADE.G2);
    expect(b).toEqual(a);
    expect(CALIBRATION_SAMPLES).toBeGreaterThanOrEqual(4000);
  });

  for (const name of ['K', 'G2'] as const) {
    it(`${name}: each skill meets its known-rate target within ±0.03 where the graph allows it`, () => {
      const profile = PROFILES[name];
      const g = GRADE[name];
      const conditional = conditionalKnownRates(graph, profile.known, g);
      const known: Record<SkillId, number> = {};
      const prereqsKnown: Record<SkillId, number> = {};
      for (let seed = 1; seed <= CHILDREN; seed += 1) {
        const k = createLearner(graph, profile, 1_000_000 + seed).known;
        for (const s of graph.nodes) {
          if (k.has(s)) known[s] = (known[s] ?? 0) + 1;
          if ((graph.prereqs[s] ?? []).every((p) => k.has(p)))
            prereqsKnown[s] = (prereqsKnown[s] ?? 0) + 1;
        }
      }
      const off: string[] = [];
      let marginalSkills = 0;
      let capped = 0;
      for (const s of graph.nodes) {
        const skill = graph.skills[s];
        if (!skill) continue;
        const rate = knownRate(profile.known, skill.grade, g);
        const withPrereqs = (prereqsKnown[s] ?? 0) / CHILDREN;
        const marginal = (known[s] ?? 0) / CHILDREN;
        let expected: number;
        if (!isMarginalRate(skill.grade, g)) {
          // Content being learned: the rate is P(known | prerequisites known).
          expected = rate * withPrereqs;
        } else {
          marginalSkills += 1;
          // Capped (c = 1): the target is out of reach, and the skill follows its prerequisites.
          const reachable = (conditional[s] ?? 0) < 1;
          if (!reachable) capped += 1;
          expected = reachable ? rate : withPrereqs;
        }
        if (Math.abs(marginal - expected) > 0.03)
          off.push(`${s} ${marginal.toFixed(3)} vs ${expected.toFixed(3)}`);
      }
      expect(off).toEqual([]);
      console.log(
        `${name}: ${graph.nodes.length} skills, ${marginalSkills} with a marginal target, ${capped} of them capped by their prerequisites`,
      );
    });
  }
});
