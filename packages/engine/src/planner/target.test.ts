import type { AttemptPayload, ChildContext, LearnerState } from '@number-island/shared';
import { defaultChildSettings } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { createEloFireModel } from '../learner/elo-fire';
import { logit } from '../learner/math';
import {
  A,
  B,
  C,
  attempt as synthAttempt,
  syntheticGraph,
  T0,
} from '../learner/synthetic.test-support';
import { PARAMS } from '../params';
import { targetDifficulty, targetSuccess } from './target';

const CHILD = '019a0000-0000-7000-8000-00000000c001';
const graph = syntheticGraph();

function child(grade: ChildContext['grade']): ChildContext {
  return {
    childId: CHILD,
    grade,
    ageBand: '5-6',
    advanced: false,
    isK: grade === 'K',
    settings: defaultChildSettings(grade),
  };
}

function baseState(): LearnerState {
  const model = createEloFireModel(graph, { childId: CHILD, isK: false });
  return model.init(graph, null);
}

/** θg 0.3, A rated with θ 0.5, offset 0.2. */
function ratedState(): LearnerState {
  const s = baseState();
  return {
    ...s,
    thetaG: 0.3,
    successOffset: 0.2,
    skills: {
      [A]: {
        theta: 0.5,
        n: 4,
        recent: [],
        assumed: false,
        override: null,
        practicedAt: null,
        fluentAt: null,
        masteredAt: null,
        memory: null,
        atRiskDueTs: null,
        misconceptionHits: [],
      },
    },
  };
}

describe('targetSuccess / targetDifficulty (04 §2.4)', () => {
  // p* by context: [G1+, K]. G1 uses the G1+ column here; transfer probes use review; lessons practice.
  const table: [AttemptPayload['context'], number, number][] = [
    ['practice', 0.85, 0.88],
    ['lesson', 0.85, 0.88],
    ['review', 0.9, 0.92],
    ['transfer-probe', 0.9, 0.92],
    ['warmup', 0.95, 0.96],
    ['challenge', 0.65, 0.75],
  ];
  for (const [context, g1, k] of table) {
    for (const grade of ['K', '1', '2'] as const) {
      const p = grade === 'K' ? k : g1;
      it(`${context} for grade ${grade}: d* = θg + θs − logit(${p}) + offset`, () => {
        const ch = child(grade);
        expect(targetSuccess(context as Exclude<typeof context, 'placement'>, ch)).toBe(p);
        const expected = 0.3 + 0.5 - logit(p) + 0.2;
        expect(targetDifficulty(ratedState(), A, context, ch)).toBeCloseTo(expected, 12);
        expect(targetDifficulty(ratedState(), A, context, ch, graph)).toBeCloseTo(expected, 12);
      });
    }
  }

  it('returns the reference difficulty 0 for placement', () => {
    expect(targetDifficulty(ratedState(), A, 'placement', child('2'))).toBe(0);
    expect(targetDifficulty(ratedState(), A, 'placement', child('K'), graph)).toBe(0);
  });

  it('includes the rolling success offset', () => {
    const s = { ...ratedState(), successOffset: -1.5 };
    const d = targetDifficulty(s, A, 'practice', child('2'));
    expect(d).toBeCloseTo(0.3 + 0.5 - logit(0.85) - 1.5, 12);
  });

  it('uses the model offset with a graph: transfer from rated prerequisites', () => {
    // B is never rated; its prerequisite A has θ 0.5 → transfer 0.5 × 0.5.
    const d = targetDifficulty(ratedState(), B, 'practice', child('2'), graph);
    expect(d).toBeCloseTo(0.3 + 0.25 - logit(0.85) + 0.2, 12);
    // Without a graph there is no transfer: θs = 0.
    const d0 = targetDifficulty(ratedState(), B, 'practice', child('2'));
    expect(d0).toBeCloseTo(0.3 + 0 - logit(0.85) + 0.2, 12);
  });

  it('without a graph: prior offset, else the stored θ of an unrated state, else 0', () => {
    const s = ratedState();
    const withPrior: LearnerState = {
      ...s,
      placement: { ...s.placement, prior: { p: { [C]: 0.99 }, assumed: [] } },
      skills: {
        ...s.skills,
        [B]: { ...(s.skills[A] as NonNullable<LearnerState['skills'][string]>), n: 0, theta: 0.4 },
      },
    };
    const ch = child('2');
    const base = 0.3 - logit(0.85) + 0.2;
    // C has a prior (clamped to 0.95): logit(0.95) − θg.
    expect(targetDifficulty(withPrior, C, 'practice', ch)).toBeCloseTo(
      base + logit(PARAMS.rating.priorClamp[1]) - 0.3,
      12,
    );
    // B: an unrated stored state without a prior keeps its θ.
    expect(targetDifficulty(withPrior, B, 'practice', ch)).toBeCloseTo(base + 0.4, 12);
    // A parent reset keeps the stored θ as the skill's own offset.
    const reset: LearnerState = {
      ...withPrior,
      skills: {
        ...withPrior.skills,
        [C]: {
          ...(withPrior.skills[B] as NonNullable<LearnerState['skills'][string]>),
          override: 'reset',
          theta: -0.7,
        },
      },
    };
    expect(targetDifficulty(reset, C, 'practice', ch)).toBeCloseTo(base - 0.7, 12);
    // Unknown skill: 0.
    expect(targetDifficulty(s, 'CNT.99', 'practice', ch)).toBeCloseTo(base, 12);
  });
});

describe('test-out items at the reference difficulty (03 §6.5)', () => {
  const ch = child('1');
  const model = createEloFireModel(graph, { childId: CHILD, isK: false });
  const start = model.init(graph, { p: { [A]: 0.7 }, assumed: [] });
  const at = (state: LearnerState, context: AttemptPayload['context']) =>
    targetDifficulty(state, A, context, ch, graph);

  it('an offered test-out asks at d* = 0; ordinary items of the same skill stay adaptive', () => {
    expect(at(start, 'practice')).toBe(0);
    expect(at(start, 'warmup')).toBe(0);
    expect(at(start, 'lesson')).not.toBe(0); // lessons are not test-out items
    // A skill without an offered test-out (low prior, low P(ref)) keeps its adaptive target.
    const low = model.init(graph, { p: { [A]: 0.2 }, assumed: [] });
    expect(at(low, 'practice')).not.toBe(0);
  });

  it('stays at 0 while the test-out runs, then the skill is adaptive again', () => {
    let s = model.apply(start, synthAttempt(A, 3), T0);
    expect(at(s, 'practice')).toBe(0);
    // Without the graph, a test-out in progress is still known from the state.
    expect(targetDifficulty(s, A, 'practice', ch)).toBe(0);
    s = model.apply(s, synthAttempt(A, 4), T0 + 1_000);
    s = model.apply(s, synthAttempt(A, 3), T0 + 2_000); // the third item decides the test-out
    expect(at(s, 'practice')).not.toBe(0);
    expect(at(s, 'review')).not.toBe(0);
  });

  it('an out-of-pool first item cancels the test-out', () => {
    const s = model.apply(start, synthAttempt(A, 1), T0); // concrete: outside the abstract pool
    expect(at(s, 'practice')).not.toBe(0);
  });
});
