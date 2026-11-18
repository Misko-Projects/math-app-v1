// 04 §2–§5 formulas and status rules, table-driven, on the synthetic graph (templates there have
// difficulty 0 unless a test overrides it).

import {
  type AttemptPayload,
  type LearnerState,
  learnerStateSchema,
  type SkillState,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { DAY_MS, PARAMS } from '../params';
import { createRng } from '../rng';
import { createEloFireModel, type EloFireModel } from './elo-fire';
import { logit, sigmoid } from './math';
import { compressReviews, reviewContext } from './review';
import { A, attempt, B, C, day, F, N, syntheticGraph, T0 } from './synthetic.test-support';

const graph = syntheticGraph();
const mk = (isK = false, difficulty?: number): EloFireModel =>
  createEloFireModel(graph, {
    childId: '019a0000-0000-7000-8000-000000000001',
    isK,
    ...(difficulty !== undefined ? { difficultyOf: () => difficulty } : {}),
  });
const model = mk();

function run(
  m: EloFireModel,
  state: LearnerState,
  steps: [AttemptPayload, number][],
): LearnerState {
  return steps.reduce((s, [a, ts]) => m.apply(s, a, ts), state);
}

function skillState(over: Partial<SkillState> = {}): SkillState {
  return {
    theta: 0,
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
    ...over,
  };
}

function withSkills(
  state: LearnerState,
  skills: Record<string, Partial<SkillState>>,
): LearnerState {
  const next = { ...state, skills: { ...state.skills } };
  for (const [id, over] of Object.entries(skills)) next.skills[id] = skillState(over);
  return next;
}

const memory = (
  intervalDays: number,
  lastReviewTs: number,
  over: Partial<NonNullable<SkillState['memory']>> = {},
) => ({
  intervalDays,
  lastReviewTs,
  dueTs: lastReviewTs + Math.round(intervalDays * DAY_MS),
  reps: 0,
  reviewsPassed: [],
  consecutiveFails: 0,
  ...over,
});

const practiced = (over: Partial<SkillState> = {}): Partial<SkillState> => ({
  theta: 3,
  n: 10,
  practicedAt: day(0),
  memory: memory(1, day(0)),
  ...over,
});

const s0 = model.init(graph, null);

describe('§2.3 rating update (fresh skill, θ = 0, d = 0, so P = 0.5)', () => {
  const ks = PARAMS.rating.ks; // Ks(0)
  const kg = PARAMS.rating.kg; // Kg(0)
  it.each<[string, Partial<AttemptPayload>, number, boolean]>([
    // name, attempt overrides, w·e, isK
    ['correct, normal speed', {}, 0.5, false],
    ['correct with hints (score 0.5)', { hintsUsed: 1 }, 0, false],
    ['wrong', { correct: false }, -0.5, false],
    ['slow correct (> 2 × 8,000 ms abstract)', { latencyMs: 16_001 }, 0.6 * 0.5, false],
    ['not slow at exactly 2 × expected', { latencyMs: 16_000 }, 0.5, false],
    ['K: 20,000 ms is not slow (2 × 12,000)', { latencyMs: 20_000 }, 0.5, true],
    ['K: 24,001 ms is slow', { latencyMs: 24_001 }, 0.6 * 0.5, true],
    ['skip: score 0, w 0.5', { correct: false, response: { kind: 'skip' } }, 0.5 * -0.5, false],
    ['lesson: w × 0.5', { context: 'lesson' }, 0.5 * 0.5, false],
    ['choice response: w × 0.5', { response: { kind: 'choice', id: 'a' } }, 0.5 * 0.5, false],
    [
      'lesson + choice + slow',
      { context: 'lesson', response: { kind: 'choice', id: 'a' }, latencyMs: 30_000 },
      0.6 * 0.5 * 0.5 * 0.5,
      false,
    ],
    ['review counts like practice', { context: 'review' }, 0.5, false],
    ['warmup', { context: 'warmup' }, 0.5, false],
    ['challenge', { context: 'challenge' }, 0.5, false],
    ['transfer-probe', { context: 'transfer-probe' }, 0.5, false],
  ])('%s', (_name, over, we, isK) => {
    const m = mk(isK);
    const s = m.apply(m.init(graph, null), attempt(A, 3, over), T0);
    const st = s.skills[A] as SkillState;
    expect(st.theta).toBeCloseTo(ks * we, 12);
    expect(s.thetaG).toBeCloseTo(kg * we, 12);
    expect(st.n).toBe(1);
    expect(s.nTotal).toBe(1);
  });

  it('concrete tier defaults to 12,000 ms expected latency', () => {
    const s = model.apply(s0, attempt(A, 1, { latencyMs: 20_000 }), T0);
    expect(s.skills[A]?.theta).toBeCloseTo(ks * 0.5, 12);
    expect(model.expectedLatency({ templateId: `${A}.t1`, tier: 'concrete' })).toBe(12_000);
    expect(mk(true).expectedLatency({ templateId: `${A}.t3`, tier: 'abstract' })).toBe(12_000);
  });

  it('a template expectedLatencyMs overrides the default', () => {
    const g = syntheticGraph();
    (g.templates[`${A}.t3`] as { expectedLatencyMs?: number }).expectedLatencyMs = 2_000;
    const m = createEloFireModel(g, { childId: 'c', isK: false });
    const s = m.apply(m.init(g, null), attempt(A, 3, { latencyMs: 4_001 }), T0);
    expect(s.skills[A]?.theta).toBeCloseTo(ks * 0.6 * 0.5, 12);
  });

  it('placement attempts never move θ and create no skill state', () => {
    const s = model.apply(s0, attempt(A, 3, { context: 'placement' }), T0);
    expect(s).toBe(s0);
  });

  it('retries do not update the rating', () => {
    const s = model.apply(s0, attempt(A, 3, { attemptNo: 2 }), T0);
    expect(s.skills[A]?.theta).toBe(0);
    expect(s.skills[A]?.n).toBe(0);
    expect(s.thetaG).toBe(0);
  });

  it('Ks(n) and Kg(N) decay with the attempt counts', () => {
    const start = { ...withSkills(s0, { [A]: { theta: 0, n: 10 } }), nTotal: 50 };
    const s = model.apply(start, attempt(A, 3), T0);
    expect(s.skills[A]?.theta).toBeCloseTo((0.8 / (1 + 0.08 * 10)) * 0.5, 12);
    expect(s.thetaG).toBeCloseTo((0.12 / (1 + 0.01 * 50)) * 0.5, 12);
  });

  it('uses the item difficulty: P = σ(θg + θs − d)', () => {
    const m = mk(false, 1.5);
    const s = m.apply(m.init(graph, null), attempt(A, 3), T0);
    expect(s.skills[A]?.theta).toBeCloseTo(0.8 * (1 - sigmoid(-1.5)), 12);
  });
});

describe('§2.1 transfer and the placement prior', () => {
  it('a new skill takes 0.5 × the mean offset of attempted prerequisites', () => {
    const s = withSkills(s0, { [A]: { theta: 1.2, n: 3 } });
    expect(model.skillOffset(s, B)).toBeCloseTo(0.6, 12);
    expect(model.predict(s, B, 0)).toBeCloseTo(sigmoid(0.6), 12);
    expect(model.pRef(s, B)).toBeCloseTo(sigmoid(0.6), 12);
  });

  it('prerequisites with n = 0 do not transfer', () => {
    const s = withSkills(s0, { [A]: { theta: 1.2, n: 0 } });
    expect(model.skillOffset(s, B)).toBe(0);
  });

  it('the placement prior wins over transfer: θs = logit(p) − θg (p clamped to [0.05, 0.95])', () => {
    const base = withSkills(s0, { [A]: { theta: 1.2, n: 3 } });
    const s: LearnerState = {
      ...base,
      thetaG: 0.3,
      placement: { ...base.placement, prior: { p: { [B]: 0.8, [C]: 1 }, assumed: [] } },
    };
    expect(model.skillOffset(s, B)).toBeCloseTo(logit(0.8) - 0.3, 12);
    expect(model.predict(s, B, 0)).toBeCloseTo(0.8, 12);
    expect(model.predict(s, C, 0)).toBeCloseTo(0.95, 12);
  });

  it('a first attempt starts from the transferred offset', () => {
    const s = model.apply(withSkills(s0, { [A]: { theta: 1, n: 3 } }), attempt(B, 3), T0);
    const p = sigmoid(0.5);
    expect(s.skills[B]?.theta).toBeCloseTo(0.5 + 0.8 * (1 - p), 12);
  });
});

describe('§2.4 rolling success controller', () => {
  const items = (
    n: number,
    correct: (i: number) => boolean,
    context: AttemptPayload['context'] = 'practice',
  ) =>
    Array.from({ length: n }, (_, i): [AttemptPayload, number] => [
      attempt(A, 3, { correct: correct(i), context }),
      T0 + i,
    ]);

  it.each<[string, number, (i: number) => boolean, number, number]>([
    ['20 of 20 correct (> 0.92) → +0.2', 0, () => true, 0.2, 20],
    ['19 of 20 (0.95) → +0.2', 0, (i) => i !== 3, 0.2, 20],
    ['18 of 20 (0.90) → unchanged', 0, (i) => i % 10 !== 0, 0, 20],
    ['15 of 20 (0.75) → unchanged', 0, (i) => i % 4 !== 0, 0, 20],
    ['14 of 20 (0.70 < 0.75) → −0.3', 0, (i) => i % 10 > 2, -0.3, 20],
    ['cap +1.0', 0.9, () => true, 1, 20],
    ['floor −1.5', -1.4, () => false, -1.5, 20],
  ])('%s', (_n, startOffset, correct, offset, windowLen) => {
    const s = run(model, { ...s0, successOffset: startOffset }, items(20, correct));
    expect(s.successOffset).toBeCloseTo(offset, 12);
    expect(s.recentFirstTry).toHaveLength(windowLen);
  });

  it('the window keeps rolling after an adjustment; the next one waits for 20 new items', () => {
    const s20 = run(
      model,
      s0,
      items(20, () => true),
    );
    const s21 = model.apply(s20, attempt(A, 3, { correct: false }), T0 + 20);
    expect(s21.recentFirstTry).toEqual([...Array(19).fill(true), false]);
    expect(s21.successOffset).toBeCloseTo(0.2, 12);
    const s39 = run(
      model,
      s20,
      items(19, () => true),
    );
    expect(s39.successOffset).toBeCloseTo(0.2, 12);
    const s40 = run(
      model,
      s20,
      items(20, () => true),
    );
    expect(s40.successOffset).toBeCloseTo(0.4, 12);
  });

  it('19 items are not enough to adjust', () => {
    const s = run(
      model,
      s0,
      items(19, () => true),
    );
    expect(s.successOffset).toBe(0);
    expect(s.recentFirstTry).toHaveLength(19);
  });

  it('lesson items and retries stay out of the window', () => {
    const s = run(model, s0, [
      ...items(5, () => true, 'lesson'),
      [attempt(A, 3, { attemptNo: 2 }), T0],
    ]);
    expect(s.recentFirstTry).toHaveLength(0);
  });

  it('the offset decays 20% toward 0 at each session start', () => {
    const s = model.startSession(model.startSession({ ...s0, successOffset: 1 }));
    expect(s.successOffset).toBeCloseTo(0.64, 12);
    expect(s.sessionsSeen).toBe(2);
  });
});

describe('§3 practiced rule', () => {
  type Row = [string, string, [number, string, Partial<AttemptPayload>][], boolean, number?];
  const ok = (
    n: number,
    session = 's1',
    over: Partial<AttemptPayload> = {},
  ): [number, string, Partial<AttemptPayload>] => [n, session, over];
  const wrong = (n: number, session = 's1') => ok(n, session, { correct: false });
  const hinted = (n: number, session = 's1') => ok(n, session, { hintsUsed: 1 });

  it.each<Row>([
    [
      'standard: 6/6, two formats, two sessions',
      A,
      [ok(2), ok(3), ok(2), ok(3, 's2'), ok(3, 's2'), ok(2, 's2')],
      true,
    ],
    [
      'standard: 5 of the last 6',
      A,
      [ok(2), ok(3), wrong(2), ok(3, 's2'), ok(3, 's2'), ok(2, 's2')],
      true,
    ],
    [
      'standard: only 4 of the last 6',
      A,
      [ok(2), wrong(3), wrong(2), ok(3, 's2'), ok(3, 's2'), ok(2, 's2')],
      false,
    ],
    [
      'standard: hinted answers are not independent',
      A,
      [ok(2), hinted(3), hinted(2), ok(3, 's2'), ok(3, 's2'), ok(2, 's2')],
      false,
    ],
    [
      'standard: fewer than 6 attempts',
      A,
      [ok(2), ok(3), ok(3, 's2'), ok(3, 's2'), ok(2, 's2')],
      false,
    ],
    ['standard: one session', A, [ok(2), ok(3), ok(2), ok(3), ok(3), ok(2)], false],
    [
      'standard: one format and one tier',
      A,
      [ok(3), ok(3), ok(3), ok(3, 's2'), ok(3, 's2'), ok(3, 's2')],
      false,
    ],
    [
      'standard: two tiers, one format counts',
      A,
      [ok(3), ok(3, 's1', { tier: 'pictorial' }), ok(3), ok(3, 's2'), ok(3, 's2'), ok(3, 's2')],
      true,
    ],
    [
      'standard: two concrete formats, nothing pictorial/abstract',
      A,
      [ok(1), ok(1, 's1', { format: 'make-set' }), ok(1), ok(1, 's2'), ok(1, 's2'), ok(1, 's2')],
      false,
    ],
    [
      'standard: P(ref) < 0.90',
      A,
      [ok(2), ok(3), ok(2), ok(3, 's2'), ok(3, 's2'), ok(2, 's2')],
      false,
      0,
    ],
    [
      'gateway: 7/7, three representations incl. abstract',
      B,
      [ok(1), ok(2), ok(3), ok(1), ok(2, 's2'), ok(3, 's2'), ok(3, 's2')],
      true,
    ],
    [
      'gateway: 6 of the last 7',
      B,
      [ok(1), ok(2), wrong(3), ok(1), ok(2, 's2'), ok(3, 's2'), ok(3, 's2')],
      true,
    ],
    [
      'gateway: 5 of the last 7',
      B,
      [ok(1), wrong(2), wrong(3), ok(1), ok(2, 's2'), ok(3, 's2'), ok(3, 's2')],
      false,
    ],
    [
      'gateway: 6 attempts are not enough',
      B,
      [ok(1), ok(2), ok(3), ok(2, 's2'), ok(3, 's2'), ok(3, 's2')],
      false,
    ],
    [
      'gateway: only two representations',
      B,
      [ok(2), ok(3), ok(2), ok(3), ok(2, 's2'), ok(3, 's2'), ok(3, 's2')],
      false,
    ],
    [
      'gateway: three representations but no abstract tier',
      B,
      [
        ok(1),
        ok(2),
        ok(1, 's1', { representation: 'dots' }),
        ok(1),
        ok(2, 's2'),
        ok(2, 's2'),
        ok(1, 's2'),
      ],
      false,
    ],
  ])('%s', (_name, skill, steps, expected, theta = 3) => {
    const start = withSkills(s0, { [A]: practiced(), [skill]: { theta, n: 20 } });
    const s = run(
      model,
      start,
      steps.map(([n, sessionId, over], i) => [attempt(skill, n, { sessionId, ...over }), T0 + i]),
    );
    const st = s.skills[skill] as SkillState;
    expect(st.practicedAt !== null).toBe(expected);
    if (expected) {
      expect(st.practicedAt).toBe(T0 + steps.length - 1);
      expect(st.memory).toEqual(memory(1, T0 + steps.length - 1));
      expect(model.status(s, skill, T0 + steps.length)).toBe('practiced');
    }
  });

  it('lesson and choice attempts are not evidence', () => {
    const s = run(model, s0, [
      [attempt(A, 3, { context: 'lesson' }), T0],
      [attempt(A, 3, { response: { kind: 'choice', id: 'x' } }), T0],
    ]);
    expect(s.skills[A]?.recent).toHaveLength(0);
    expect(s.skills[A]?.n).toBe(2);
  });

  it('recent keeps the last 10 evidence attempts', () => {
    const s = run(
      model,
      s0,
      Array.from({ length: 13 }, (_, i): [AttemptPayload, number] => [attempt(A, 3), T0 + i]),
    );
    expect(s.skills[A]?.recent).toHaveLength(10);
    expect(s.skills[A]?.recent[0]?.ts).toBe(T0 + 3);
  });
});

describe('§3 test-out', () => {
  type Row = [string, string, Partial<AttemptPayload>[], boolean, boolean?];
  // A is offered a test-out through its placement posterior (≥ 0.6); B and N through P(ref) ≥ 0.75
  // with the transferred offset (A practiced at θ = 3 → 0.5 · 3 = 1.5, σ(1.5) = 0.82).
  const offered = (skill: string) => {
    const base = skill === A ? s0 : withSkills(s0, { [A]: practiced() });
    return skill === A
      ? { ...base, placement: { ...base.placement, prior: { p: { [A]: 0.65 }, assumed: [] } } }
      : base;
  };
  // The default pool is a skill's abstract templates: t3 (number-pad, symbols) and t4
  // (number-bond), so a draw must use both (03 §6.5: ≥ 2 templates; gateway: ≥ 2 representations).
  const t4 = (skill: string, over: Partial<AttemptPayload> = {}): Partial<AttemptPayload> => ({
    templateId: `${skill}.t4`,
    format: 'number-bond',
    representation: 'number-bond',
    ...over,
  });
  it.each<Row>([
    ['3 clean abstract items from 2 templates → practiced track', A, [{}, t4(A), {}], true],
    ['one template only, while the pool has 2', A, [{}, {}, {}], false],
    ['gateway, offered through P(ref) ≥ 0.75, 2 representations', B, [{}, t4(B), {}], true],
    ['gateway: repeating one template is not a valid draw', B, [{}, {}, {}], false],
    ['a slow item fails it', A, [{}, t4(A, { latencyMs: 16_001 }), {}], false],
    ['a hinted item fails it', A, [{}, t4(A, { hintsUsed: 1 }), {}], false],
    ['a wrong item fails it', A, [{}, t4(A), { correct: false }], false],
    [
      'an item outside the pool (concrete) ends it',
      A,
      [{}, { templateId: `${A}.t1`, tier: 'concrete' }, t4(A)],
      false,
    ],
    ['a lesson attempt first means no test-out', A, [{ context: 'lesson' }, {}, t4(A), {}], false],
    ['K: 20,000 ms is not slow', A, [{ latencyMs: 20_000 }, t4(A), {}], true, true],
    ['lesson mode none: no test-out', N, [{}, t4(N), {}], false],
  ])('%s', (_name, skill, overs, expected, isK = false) => {
    const m = mk(isK);
    const start = offered(skill);
    const s = run(
      m,
      start,
      overs.map((o, i) => [attempt(skill, 3, o), T0 + i]),
    );
    expect(s.skills[skill]?.practicedAt !== null).toBe(expected);
    if (expected) expect(m.status(s, skill, T0 + 10)).toBe('practiced');
  });

  it.each<[string, () => LearnerState, string]>([
    ['not offered: no prior and P(ref) = 0.50', () => s0, A],
    [
      'not offered: posterior below 0.6',
      () => ({ ...s0, placement: { ...s0.placement, prior: { p: { [A]: 0.55 }, assumed: [] } } }),
      A,
    ],
    ['not offered: locked skill', () => s0, B],
  ])('%s', (_name, start, skill) => {
    const s = run(model, start(), [
      [attempt(skill, 3), T0],
      [attempt(skill, 3), T0 + 1],
      [attempt(skill, 3), T0 + 2],
    ]);
    expect(s.skills[skill]?.practicedAt).toBeNull();
  });

  it('a choice-only compiled pool can pass', () => {
    const g = syntheticGraph();
    const sk = g.skills[A] as (typeof g.skills)[string];
    sk.lesson = { ...sk.lesson, testOut: { items: 3, minCorrect: 3, templateIds: [`${A}.t3`] } };
    const m = createEloFireModel(g, { childId: 'c', isK: false });
    const init = m.init(g, { p: { [A]: 0.7 }, assumed: [] });
    const choice = { response: { kind: 'choice' as const, id: 'a' } };
    const s = run(m, init, [
      [attempt(A, 3, choice), T0],
      [attempt(A, 3, choice), T0 + 1],
      [attempt(A, 3, choice), T0 + 2],
    ]);
    expect(s.skills[A]?.practicedAt).toBe(T0 + 2);
  });

  it('uses the compiled testOut pool and minCorrect when present', () => {
    const g = syntheticGraph();
    const sk = g.skills[A] as (typeof g.skills)[string];
    sk.lesson = {
      ...sk.lesson,
      testOut: { items: 3, minCorrect: 2, templateIds: [`${A}.t2`, `${A}.t3`] },
    };
    const m = createEloFireModel(g, { childId: 'c', isK: false });
    const s = run(m, m.init(g, { p: { [A]: 0.7 }, assumed: [] }), [
      [attempt(A, 2), T0],
      [attempt(A, 3, { correct: false }), T0 + 1],
      [attempt(A, 3), T0 + 2],
    ]);
    expect(s.skills[A]?.practicedAt).toBe(T0 + 2);
  });
});

describe('§3 fluent', () => {
  it.each<[string, number, number, boolean, boolean]>([
    ['median 2,500 ≤ 3,000 over 6 correct', 6, 2_500, false, true],
    ['median 3,500 > 3,000', 6, 3_500, false, false],
    ['K: 3,500 ≤ 4,500', 6, 3_500, true, true],
    ['5 correct samples are not enough', 5, 2_500, false, false],
  ])('%s', (_name, count, latencyMs, isK, expected) => {
    const m = mk(isK);
    const start = withSkills(s0, { [A]: practiced(), [F]: practiced() });
    const s = run(
      m,
      start,
      Array.from({ length: count }, (_, i): [AttemptPayload, number] => [
        attempt(F, 3, { latencyMs }),
        T0 + i,
      ]),
    );
    expect(s.skills[F]?.fluentAt !== null).toBe(expected);
    expect(m.status(s, F, T0 + 10)).toBe(expected ? 'fluent' : 'practiced');
  });

  it('only fact-fluency skills become fluent', () => {
    const s = run(
      model,
      withSkills(s0, { [A]: practiced() }),
      Array.from({ length: 8 }, (_, i): [AttemptPayload, number] => [
        attempt(A, 3, { latencyMs: 500 }),
        T0 + i,
      ]),
    );
    expect(s.skills[A]?.fluentAt).toBeNull();
  });
});

describe('§3 mastered', () => {
  const review = (
    skill: string,
    ts: number,
    over: Partial<AttemptPayload> = {},
  ): [AttemptPayload, number] => [attempt(skill, 3, { context: 'review', ...over }), ts];

  it('passed reviews ≥ 1 day after practiced and ≥ 6 days after that', () => {
    const s1 = run(model, withSkills(s0, { [A]: practiced() }), [review(A, day(1))]);
    expect(s1.skills[A]?.masteredAt).toBeNull();
    const s2 = run(model, s1, [review(A, day(6.9))]);
    expect(s2.skills[A]?.masteredAt).toBeNull();
    const s3 = run(model, s2, [review(A, day(7))]);
    expect(s3.skills[A]?.masteredAt).toBe(day(7));
    expect(model.status(s3, A, day(7))).toBe('mastered');
  });

  it('a review less than a day after practiced does not start the clock', () => {
    const s = run(model, withSkills(s0, { [A]: practiced() }), [
      review(A, day(0.9)),
      review(A, day(6.95)),
    ]);
    expect(s.skills[A]?.masteredAt).toBeNull();
  });

  it('fact-fluency skills count reviews from fluentAt', () => {
    const start = withSkills(s0, { [A]: practiced(), [F]: practiced({ fluentAt: day(3) }) });
    const s1 = run(model, start, [review(F, day(1)), review(F, day(7))]);
    expect(s1.skills[F]?.masteredAt).toBeNull();
    const s2 = run(model, s1, [review(F, day(13))]);
    expect(s2.skills[F]?.masteredAt).toBe(day(13));
  });

  it('a non-fluent fact-fluency skill cannot be mastered', () => {
    const start = withSkills(s0, { [A]: practiced(), [F]: practiced() });
    const s = run(model, start, [
      review(F, day(1), { latencyMs: 9_000 }),
      review(F, day(7), { latencyMs: 9_000 }),
    ]);
    expect(s.skills[F]?.masteredAt).toBeNull();
  });
});

describe('§4 explicit review result', () => {
  type Row = [string, number, number, Partial<AttemptPayload>, number];
  // name, I, elapsed days, attempt overrides, expected I'
  it.each<Row>([
    ['on time, fast (≤ 8,000 ms) → × 2.5', 4, 4, { latencyMs: 8_000 }, 10],
    ['on time, normal (≤ 16,000 ms) → × 2.0', 4, 4, { latencyMs: 12_000 }, 8],
    ['on time, slow → × 1.4', 4, 4, { latencyMs: 16_001 }, 5.6],
    ['on time, hinted → × 1.4', 4, 4, { hintsUsed: 1 }, 5.6],
    ['early (half the interval), fast → × (1 + 1.5·0.5)', 4, 2, {}, 7],
    ['late, fast → discount capped at 1', 4, 9, {}, 10],
    ['immediately, fast → × 1', 4, 0, {}, 4],
    ['failure → I / 3', 4, 4, { correct: false }, 4 / 3],
    ['failure → at least 1 day', 2, 2, { correct: false }, 1],
    ['skip on a review is a failure', 6, 6, { correct: false, response: { kind: 'skip' } }, 2],
  ])('%s', (_name, I, elapsed, over, expected) => {
    const start = withSkills(s0, { [A]: practiced({ memory: memory(I, day(0)) }) });
    const ts = day(elapsed);
    const s = model.apply(start, attempt(A, 3, { context: 'review', ...over }), ts);
    const mem = s.skills[A]?.memory;
    expect(mem?.intervalDays).toBeCloseTo(expected, 12);
    expect(mem?.lastReviewTs).toBe(ts);
    expect(mem?.dueTs).toBe(ts + Math.round(expected * DAY_MS));
    const failed = over.correct === false;
    expect(mem?.reps).toBe(failed ? 0 : 1);
    expect(mem?.consecutiveFails).toBe(failed ? 1 : 0);
    expect(model.status(s, A, ts)).toBe(failed ? 'needs-review' : 'practiced');
  });

  it('practice-context attempts never change memory', () => {
    const start = withSkills(s0, { [A]: practiced({ memory: memory(4, day(0)) }) });
    const s = model.apply(start, attempt(A, 3), day(4));
    expect(s.skills[A]?.memory).toEqual(memory(4, day(0)));
  });

  it('implicit credit: encompassed skills get I·(1 + (m − 1)·w·min(1, elapsed/I)), one hop', () => {
    const start = withSkills(s0, {
      [A]: practiced({ memory: memory(2, day(0)) }),
      [B]: practiced({ memory: memory(2, day(3)) }),
      [C]: practiced({ memory: memory(4, day(0)) }),
    });
    const s = model.apply(start, attempt(C, 3, { context: 'review' }), day(4));
    expect(s.skills[C]?.memory?.intervalDays).toBeCloseTo(10, 12);
    // B: w 0.8, elapsed 1 of 2 days → 2·(1 + 1.5·0.8·0.5) = 3.2; its lastReviewTs is unchanged.
    expect(s.skills[B]?.memory?.intervalDays).toBeCloseTo(3.2, 12);
    expect(s.skills[B]?.memory?.lastReviewTs).toBe(day(3));
    expect(s.skills[B]?.memory?.dueTs).toBe(day(3) + Math.round(3.2 * DAY_MS));
    expect(s.skills[B]?.memory?.reps).toBe(0);
    // A: w 0.3, elapsed 4 of 2 days (capped) → 2·(1 + 1.5·0.3) = 2.9.
    expect(s.skills[A]?.memory?.intervalDays).toBeCloseTo(2.9, 12);
  });

  it('implicit credit does not cascade beyond one hop', () => {
    const g = syntheticGraph();
    (g.encompasses[B] as Record<string, number>)[A] = 1;
    (g.encompasses[C] as Record<string, number>) = { [B]: 1 };
    const m = createEloFireModel(g, { childId: 'c', isK: false });
    const start = withSkills(m.init(g, null), {
      [A]: practiced({ memory: memory(2, day(0)) }),
      [B]: practiced({ memory: memory(2, day(0)) }),
      [C]: practiced({ memory: memory(2, day(0)) }),
    });
    const s = m.apply(start, attempt(C, 3, { context: 'review' }), day(2));
    expect(s.skills[B]?.memory?.intervalDays).toBeCloseTo(5, 12);
    expect(s.skills[A]?.memory?.intervalDays).toBe(2);
  });

  it('failure propagation: hard prerequisites become due within a day', () => {
    const start = withSkills(s0, {
      [A]: practiced({ memory: memory(30, day(0)) }),
      [B]: practiced({ memory: memory(30, day(0)) }),
      [C]: practiced({ memory: memory(4, day(0)) }),
    });
    const s = model.apply(start, attempt(C, 3, { context: 'review', correct: false }), day(4));
    expect(s.skills[B]?.atRiskDueTs).toBe(day(5));
    expect(s.skills[A]?.atRiskDueTs).toBeNull();
    expect(model.dueReviews(s, day(4.9)).map((r) => r.skillId)).toEqual([]);
    const due = model.dueReviews(s, day(5));
    expect(due.map((r) => [r.skillId, r.dueTs, r.atRisk])).toEqual([[B, day(5), true]]);
    // A later successful review of B clears the risk.
    const s2 = model.apply(s, attempt(B, 3, { context: 'review' }), day(5));
    expect(s2.skills[B]?.atRiskDueTs).toBeNull();
  });

  it('demotion: two consecutive failed reviews → learning, memory reset', () => {
    const start = withSkills(s0, {
      [A]: practiced({ memory: memory(8, day(0)), masteredAt: day(0), override: 'mastered' }),
    });
    const s1 = model.apply(start, attempt(A, 3, { context: 'review', correct: false }), day(8));
    expect(model.status(s1, A, day(8))).toBe('needs-review');
    const s2 = model.apply(s1, attempt(A, 3, { context: 'review', correct: false }), day(9));
    const st = s2.skills[A] as SkillState;
    expect(model.status(s2, A, day(9))).toBe('learning');
    expect(st.memory).toBeNull();
    expect([st.practicedAt, st.masteredAt, st.override]).toEqual([null, null, null]);
    expect(model.status(s2, B, day(9))).toBe('locked');
  });

  it('a success between failures resets the count', () => {
    const start = withSkills(s0, { [A]: practiced({ memory: memory(8, day(0)) }) });
    const s = run(model, start, [
      [attempt(A, 3, { context: 'review', correct: false }), day(8)],
      [attempt(A, 3, { context: 'review' }), day(9)],
      [attempt(A, 3, { context: 'review', correct: false }), day(12)],
    ]);
    expect(s.skills[A]?.practicedAt).toBe(day(0));
    expect(s.skills[A]?.memory?.consecutiveFails).toBe(1);
  });
});

describe('§4 retrievability, due reviews and §3 needs-review', () => {
  const s = withSkills(s0, {
    [A]: practiced({ memory: memory(1, day(0)) }),
    [B]: practiced({ memory: memory(2, day(0)) }),
    [C]: practiced({ memory: memory(1, day(0)) }),
  });

  it.each<[number, number]>([
    [0, 1],
    [0.5, 0.9 ** 0.5],
    [1, 0.9],
    [2, 0.81],
  ])('R at %s days with I = 1 is 0.9^(elapsed/I)', (elapsed, R) => {
    expect(model.retrievability(s, A, day(elapsed))).toBeCloseTo(R, 12);
  });

  it('due when now ≥ lastReviewTs + I, deepest first', () => {
    expect(model.dueReviews(s, day(0.99))).toEqual([]);
    expect(model.dueReviews(s, day(1)).map((r) => r.skillId)).toEqual([C, A]);
    const all = model.dueReviews(s, day(2));
    expect(all.map((r) => [r.skillId, r.depth])).toEqual([
      [C, 2],
      [B, 1],
      [A, 0],
    ]);
    expect(all[1]?.retrievability).toBeCloseTo(0.9, 12);
  });

  it.each<[number, string]>([
    [3, 'practiced'], // R = 0.729
    [3.4, 'needs-review'], // R = 0.699 < 0.70
  ])('A at day %s is %s', (d, status) => {
    expect(model.status(s, A, day(d))).toBe(status);
  });
});

describe('§3 statuses from the graph', () => {
  it.each<[string, Record<string, Partial<SkillState>>, string, string]>([
    ['root, untouched → ready', {}, A, 'ready'],
    ['prerequisite below practiced → locked', {}, B, 'locked'],
    ['prerequisite learning → locked', { [A]: { n: 3 } }, B, 'locked'],
    ['prerequisite practiced → ready', { [A]: practiced() }, B, 'ready'],
    ['prerequisite assumed → ready', { [A]: { assumed: true } }, B, 'ready'],
    [
      'prerequisite needs-review still unlocks',
      { [A]: practiced({ memory: memory(1, day(0), { consecutiveFails: 1 }) }) },
      B,
      'ready',
    ],
    ['attempts exist → learning', { [A]: { n: 2 } }, A, 'learning'],
    [
      'assumed → practiced',
      { [A]: { assumed: true, practicedAt: day(0), memory: memory(2, day(0)) } },
      A,
      'practiced',
    ],
    ['mastered', { [A]: practiced({ masteredAt: day(0) }) }, A, 'mastered'],
    [
      'mastered but forgotten → needs-review',
      { [A]: practiced({ masteredAt: day(0), memory: memory(1, day(-5)) }) },
      A,
      'needs-review',
    ],
    ['fact-fluency practiced', { [A]: practiced(), [F]: practiced() }, F, 'practiced'],
    [
      'fact-fluency fluent',
      { [A]: practiced(), [F]: practiced({ fluentAt: day(0) }) },
      F,
      'fluent',
    ],
  ])('%s', (_name, skills, skill, status) => {
    expect(model.status(withSkills(s0, skills), skill, day(0.5))).toBe(status);
  });

  it('frontier = ready or learning skills, in topological order', () => {
    expect(model.frontier(s0)).toEqual([A]);
    expect(model.frontier(withSkills(s0, { [A]: practiced() }))).toEqual([F, B, N]);
    expect(model.frontier(withSkills(s0, { [A]: practiced(), [B]: { n: 1 } }))).toEqual([F, B, N]);
  });
});

describe('§3 parent override', () => {
  it('mastered: shows as mastered, unlocks dependents, flagged as set by parent', () => {
    const s = model.applyOverride(s0, { skillId: A, to: 'mastered' }, day(0));
    expect(model.status(s, A, day(0))).toBe('mastered');
    expect(s.skills[A]?.override).toBe('mastered');
    expect(s.skills[A]?.memory).toEqual(memory(1, day(0)));
    expect(model.status(s, B, day(0))).toBe('ready');
  });

  it('mastered on a fact-fluency skill marks it fluent too', () => {
    const s = model.applyOverride(s0, { skillId: F, to: 'mastered' }, day(0));
    expect(s.skills[F]?.fluentAt).toBe(day(0));
  });

  it('reset: back to ready with the rating offset kept', () => {
    const start = withSkills(s0, { [A]: practiced({ masteredAt: day(0), theta: 2.5 }) });
    const s = model.applyOverride(start, { skillId: A, to: 'reset' }, day(1));
    expect(model.status(s, A, day(1))).toBe('ready');
    expect(s.skills[A]).toMatchObject({
      theta: 2.5,
      n: 0,
      recent: [],
      memory: null,
      override: 'reset',
    });
  });
});

describe('§5 placement prior and week-one verification', () => {
  const completed = (over: Partial<Parameters<EloFireModel['applyPlacement']>[1]> = {}) => ({
    placementId: 'p1',
    strand: null,
    posterior: { [A]: 0.9, [B]: 0.88, [C]: 0.86, [F]: 0.4 },
    assumed: [A, B, C],
    items: 12,
    reason: 'converged' as const,
    ...over,
  });

  it('seeds assumed skills with I = 2 days and records the prior and strands', () => {
    const probing = model.applyPlacementProbe(s0, {
      placementId: 'p1',
      strand: null,
      skillId: A,
      templateId: `${A}.t3`,
      seed: 1,
      correct: true,
      skipped: false,
      latencyMs: 2_000,
      posterior: 0.9,
    });
    expect(probing.placement.inProgress).toBe('p1');
    const s = model.applyPlacement(probing, completed(), day(0));
    expect(s.placement).toEqual({
      prior: { p: { [A]: 0.9, [B]: 0.88, [C]: 0.86, [F]: 0.4 }, assumed: [A, B, C] },
      strandsPlaced: ['ADD', 'CNT'],
      inProgress: null,
    });
    expect(s.skills[A]).toMatchObject({
      assumed: true,
      practicedAt: day(0),
      memory: memory(2, day(0)),
    });
    expect(s.skills[A]?.theta).toBeCloseTo(logit(0.9), 12);
    expect(model.status(s, C, day(1))).toBe('practiced');
    expect(model.dueReviews(s, day(2)).map((r) => r.skillId)).toEqual([C, B, A]);
    expect(model.frontier(s)).toEqual([F, N]);
  });

  it('a per-strand placement merges into the prior', () => {
    const s1 = model.applyPlacement(s0, completed(), day(0));
    const s2 = model.applyPlacement(
      s1,
      completed({ placementId: 'p2', strand: 'ADD', posterior: { [F]: 0.9 }, assumed: [F] }),
      day(3),
    );
    expect(s2.placement.prior?.p[F]).toBe(0.9);
    expect(s2.placement.prior?.assumed).toEqual([F, A, B, C].sort());
    expect(s2.placement.strandsPlaced).toEqual(['ADD', 'CNT']);
    expect(s2.skills[F]?.memory).toEqual(memory(2, day(3)));
  });

  it('skills already on track are not re-seeded', () => {
    const start = withSkills(s0, { [A]: practiced({ memory: memory(5, day(0)) }) });
    const s = model.applyPlacement(start, completed(), day(2));
    expect(s.skills[A]?.assumed).toBe(false);
    expect(s.skills[A]?.memory).toEqual(memory(5, day(0)));
  });

  it('init(graph, prior) marks assumed skills without a review clock', () => {
    const s = model.init(graph, { p: { [A]: 0.9 }, assumed: [A] });
    expect(s.skills[A]).toMatchObject({ assumed: true, memory: null });
    expect(model.status(s, A, day(0))).toBe('practiced');
    expect(model.dueReviews(s, day(30))).toEqual([]);
  });

  it('a passed review verifies an assumed skill', () => {
    const s1 = model.applyPlacement(s0, completed(), day(0));
    const s2 = model.apply(s1, attempt(A, 3, { context: 'review' }), day(2));
    expect(s2.skills[A]?.assumed).toBe(false);
    expect(s2.skills[A]?.memory?.intervalDays).toBeCloseTo(5, 12);
  });

  it('a failed review demotes the assumed skill and every assumed descendant', () => {
    const s1 = model.applyPlacement(s0, completed(), day(0));
    const s2 = model.apply(s1, attempt(B, 3, { context: 'review', correct: false }), day(2));
    expect(model.status(s2, A, day(2))).toBe('practiced');
    expect(model.status(s2, B, day(2))).toBe('learning');
    expect(model.status(s2, C, day(2))).toBe('locked');
    expect(s2.skills[C]).toMatchObject({ assumed: false, memory: null, practicedAt: null });
    expect(s2.skills[A]?.atRiskDueTs).toBe(day(3));
  });
});

describe('misconception hits (last 10 attempts)', () => {
  it('records hits and drops those older than the 10 most recent evidence attempts', () => {
    const steps: [AttemptPayload, number][] = [
      [attempt(A, 3, { correct: false, misconceptionIds: ['MC.off-by-one'] }), T0],
      [
        attempt(A, 3, { correct: false, attemptNo: 2, misconceptionIds: ['MC.off-by-one'] }),
        T0 + 1,
      ],
    ];
    const s1 = run(model, s0, steps);
    expect(s1.skills[A]?.misconceptionHits).toEqual([
      { id: 'MC.off-by-one', ts: T0 },
      { id: 'MC.off-by-one', ts: T0 + 1 },
    ]);
    const s2 = run(
      model,
      s1,
      Array.from({ length: 10 }, (_, i): [AttemptPayload, number] => [attempt(A, 3), T0 + 2 + i]),
    );
    expect(s2.skills[A]?.misconceptionHits).toEqual([]);
  });
});

describe('§4 review compression and transfer probes', () => {
  const due = [
    { skillId: A, dueTs: day(1), retrievability: 0.9, depth: 0, atRisk: false },
    { skillId: B, dueTs: day(1), retrievability: 0.9, depth: 1, atRisk: false },
    { skillId: C, dueTs: day(1), retrievability: 0.9, depth: 2, atRisk: false },
  ];

  it('picks deepest first and drops skills it encompasses with w ≥ 0.5', () => {
    expect(compressReviews(due, graph, 3).map((r) => r.skillId)).toEqual([C, A]);
    expect(compressReviews(due, graph, 1).map((r) => r.skillId)).toEqual([C]);
    expect(compressReviews([], graph, 3)).toEqual([]);
  });

  it('about 10% of review tasks for mastered skills are transfer probes', () => {
    const rng = createRng(7);
    const probes = Array.from({ length: 2_000 }, () => reviewContext('mastered', rng)).filter(
      (c) => c === 'transfer-probe',
    ).length;
    expect(probes / 2_000).toBeGreaterThan(0.08);
    expect(probes / 2_000).toBeLessThan(0.12);
    expect(Array.from({ length: 200 }, () => reviewContext('practiced', rng))).not.toContain(
      'transfer-probe',
    );
  });
});

describe('review round 3 and 4 regressions (PR #51)', () => {
  it('a zero-item test-out is never offered, even after a clean answer', () => {
    const g = syntheticGraph();
    const sk = g.skills[A] as (typeof g.skills)[string];
    sk.lesson = { ...sk.lesson, testOut: { items: 0, minCorrect: 0, templateIds: [`${A}.t3`] } };
    const m = createEloFireModel(g, { childId: 'c', isK: false });
    const s = m.apply(m.init(g, { p: { [A]: 0.9 }, assumed: [] }), attempt(A, 3), T0);
    expect(s.skills[A]?.practicedAt).toBeNull();
    expect(s.skills[A]?.memory).toBeNull();
  });

  it('the pass threshold is the compiled minCorrect (03 §6.5), zero included', () => {
    const g = syntheticGraph();
    const sk = g.skills[A] as (typeof g.skills)[string];
    sk.lesson = { ...sk.lesson, testOut: { items: 1, minCorrect: 0, templateIds: [`${A}.t3`] } };
    const m = createEloFireModel(g, { childId: 'c', isK: false });
    const s = m.apply(
      m.init(g, { p: { [A]: 0.9 }, assumed: [] }),
      attempt(A, 3, { correct: false }),
      T0,
    );
    expect(s.skills[A]?.practicedAt).toBe(T0);
  });

  it('a passed verification keeps an init(graph, prior) assumed skill practiced', () => {
    const s0p = model.init(graph, { p: { [A]: 0.9 }, assumed: [A] });
    const s = model.apply(s0p, attempt(A, 3, { context: 'review' }), day(1));
    expect(model.status(s, A, day(1))).toBe('practiced');
    expect(s.skills[A]?.assumed).toBe(false);
    expect(s.skills[A]?.practicedAt).toBe(day(1));
    expect(s.skills[A]?.memory?.dueTs).toBeGreaterThan(day(1));
    expect(model.status(s, B, day(1))).toBe('ready');
  });

  it('after a schema round trip, hits of unknown age expire; new hits are tracked again', () => {
    const steps: [AttemptPayload, number][] = [
      [attempt(A, 3, { correct: false, misconceptionIds: ['MC.x'] }), T0],
    ];
    for (let i = 1; i < 10; i++) steps.push([attempt(A, 3), T0]);
    const s9 = run(model, s0, steps);
    expect(s9.skills[A]?.misconceptionHits).toEqual([{ id: 'MC.x', ts: T0 }]);
    const parsed = learnerStateSchema.parse(s9) as LearnerState;
    expect(parsed.skills[A]).not.toHaveProperty('_hitSeqs');
    // Uninterrupted replay drops MC.x at the 11th attempt; the stripped state never resurrects it.
    const s10 = model.apply(parsed, attempt(A, 3), T0);
    expect(s10.skills[A]?.misconceptionHits).toEqual([]);
    expect(model.apply(s9, attempt(A, 3), T0).skills[A]?.misconceptionHits).toEqual([]);
    const s11 = model.apply(
      parsed,
      attempt(A, 3, { correct: false, misconceptionIds: ['MC.y'] }),
      T0,
    );
    expect(s11.skills[A]?.misconceptionHits).toEqual([{ id: 'MC.y', ts: T0 }]);
  });
});

describe('review round 2 regressions (PR #51)', () => {
  it('misconception hits leave the window after 10 attempts even when timestamps tie', () => {
    const steps: [AttemptPayload, number][] = [
      [attempt(A, 3, { correct: false, misconceptionIds: ['MC.x'] }), T0],
      [attempt(A, 3, { correct: false, attemptNo: 2, misconceptionIds: ['MC.x'] }), T0],
    ];
    for (let i = 0; i < 9; i++) steps.push([attempt(A, 3), T0]);
    const s9 = run(model, s0, steps);
    expect(s9.skills[A]?.misconceptionHits).toEqual([{ id: 'MC.x', ts: T0 }]);
    const s10 = model.apply(s9, attempt(A, 3), T0);
    expect(s10.skills[A]?.misconceptionHits).toEqual([]);
  });

  it('passed choice reviews complete mastery after a choice-only test-out', () => {
    const g = syntheticGraph();
    const sk = g.skills[A] as (typeof g.skills)[string];
    sk.lesson = { ...sk.lesson, testOut: { items: 3, minCorrect: 3, templateIds: [`${A}.t3`] } };
    const m = createEloFireModel(g, { childId: 'c', isK: false });
    const choice = { response: { kind: 'choice' as const, id: 'a' } };
    const s = run(m, m.init(g, { p: { [A]: 0.7 }, assumed: [] }), [
      [attempt(A, 3, choice), day(0)],
      [attempt(A, 3, choice), day(0)],
      [attempt(A, 3, choice), day(0)],
      [attempt(A, 3, { ...choice, context: 'review' }), day(1)],
      [attempt(A, 3, { ...choice, context: 'review' }), day(7)],
    ]);
    expect(s.skills[A]?.practicedAt).toBe(day(0));
    expect(s.skills[A]?.masteredAt).toBe(day(7));
  });

  it('a parent reset before the first rating keeps the latest prior offset', () => {
    const completed = (placementId: string, p: number) => ({
      placementId,
      strand: null,
      posterior: { [A]: p },
      assumed: [A],
      items: 6,
      reason: 'converged' as const,
    });
    const s1 = model.applyPlacement(s0, completed('p1', 0.85), day(0));
    const s2 = model.applyPlacement(s1, completed('p2', 0.95), day(1));
    const s3 = model.applyOverride(s2, { skillId: A, to: 'reset' }, day(2));
    expect(model.predict(s3, A, 0)).toBeCloseTo(0.95, 12);
    expect(model.status(s3, A, day(2))).toBe('ready');
  });
});

describe('review round 1 regressions (PR #51)', () => {
  it('the failure that demotes a skill does not promote it again on the same attempt', () => {
    const start = withSkills(s0, { [A]: practiced({ memory: memory(8, day(0)), theta: 4 }) });
    const practice = (n: number, sessionId: string, ts: number): [AttemptPayload, number] => [
      attempt(A, n, { sessionId }),
      ts,
    ];
    const s = run(model, start, [
      [attempt(A, 3, { context: 'review', correct: false }), day(8)],
      practice(2, 's2', day(8.1)),
      practice(3, 's2', day(8.2)),
      practice(2, 's3', day(8.3)),
      practice(3, 's3', day(8.4)),
      practice(4, 's3', day(8.5)),
      [attempt(A, 3, { context: 'review', correct: false }), day(9)],
    ]);
    expect(s.skills[A]?.practicedAt).toBeNull();
    expect(s.skills[A]?.memory).toBeNull();
    expect(model.status(s, A, day(9))).toBe('learning');
  });

  it('fluency reads the last 10 correct responses, beyond the 10-attempt evidence window', () => {
    const start = withSkills(s0, { [A]: practiced(), [F]: practiced() });
    const slow = (i: number): [AttemptPayload, number] => [
      attempt(F, 3, { latencyMs: 5_000 }),
      T0 + i,
    ];
    const fast = (i: number): [AttemptPayload, number] => [
      attempt(F, 3, { latencyMs: 1_000 }),
      T0 + i,
    ];
    const wrong = (i: number): [AttemptPayload, number] => [
      attempt(F, 3, { correct: false }),
      T0 + i,
    ];
    // Last 10 correct: 6 slow + 4 fast → median 5,000 > 3,000. The evidence window alone
    // (4 wrong, 2 slow, 4 fast) would have a median of 1,000 over its 6 correct entries.
    const steps = [slow(0), slow(1), slow(2), slow(3), slow(4), slow(5)];
    steps.push(wrong(6), wrong(7), wrong(8), wrong(9));
    steps.push(fast(10), fast(11), fast(12), fast(13));
    const s = run(model, start, steps);
    expect(s.skills[F]?.fluentAt).toBeNull();
    // One more fast answer: 5 slow + 5 fast → median 3,000 ≤ 3,000.
    const s2 = run(model, s, [fast(14)]);
    expect(s2.skills[F]?.fluentAt).toBe(T0 + 14);
  });

  it('early reviews never push the qualifying passes out of reviewsPassed', () => {
    const times = [1, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7].map(day);
    const s = run(
      model,
      withSkills(s0, { [A]: practiced() }),
      times.map((ts): [AttemptPayload, number] => [attempt(A, 3, { context: 'review' }), ts]),
    );
    expect(s.skills[A]?.masteredAt).toBe(day(7));
    expect(s.skills[A]?.memory?.reviewsPassed.length).toBeLessThanOrEqual(10);
  });

  it('a never-rated skill follows the latest placement prior', () => {
    const completed = (placementId: string, p: number) => ({
      placementId,
      strand: null,
      posterior: { [A]: p },
      assumed: [A],
      items: 6,
      reason: 'converged' as const,
    });
    const s1 = model.applyPlacement(s0, completed('p1', 0.85), day(0));
    const s2 = model.applyPlacement(s1, completed('p2', 0.95), day(1));
    expect(model.predict(s2, A, 0)).toBeCloseTo(0.95, 12);
    const s3 = model.apply(s2, attempt(A, 3), day(2));
    expect(s3.skills[A]?.theta).toBeCloseTo(logit(0.95) + 0.8 * (1 - 0.95), 12);
  });

  it('a mastered override restarts an expired review clock', () => {
    const start = withSkills(s0, {
      [A]: practiced({ memory: memory(1, day(-10), { reps: 3 }) }),
    });
    expect(model.status(start, A, day(0))).toBe('needs-review');
    const s = model.applyOverride(start, { skillId: A, to: 'mastered' }, day(0));
    expect(model.status(s, A, day(0))).toBe('mastered');
    expect(s.skills[A]?.memory?.dueTs).toBe(day(1));
  });

  it('misconception hits expire after 10 attempts of any kind (lessons and retries count)', () => {
    const s1 = model.apply(s0, attempt(A, 3, { correct: false, misconceptionIds: ['MC.x'] }), T0);
    const s2 = model.apply(
      s1,
      attempt(A, 3, { correct: false, attemptNo: 2, misconceptionIds: ['MC.x'] }),
      T0 + 1,
    );
    expect(s2.skills[A]?.misconceptionHits).toHaveLength(2);
    const s3 = run(
      model,
      s2,
      Array.from({ length: 9 }, (_, i): [AttemptPayload, number] => [
        attempt(A, 3, i % 2 === 0 ? { context: 'lesson' } : { attemptNo: 2 }),
        T0 + 2 + i,
      ]),
    );
    expect(s3.skills[A]?.misconceptionHits).toEqual([{ id: 'MC.x', ts: T0 + 1 }]);
    const s4 = model.apply(s3, attempt(A, 3, { context: 'lesson' }), T0 + 20);
    expect(s4.skills[A]?.misconceptionHits).toEqual([]);
  });

  it('apply never mutates the state it was given', () => {
    const start = withSkills(s0, {
      [A]: practiced({ memory: memory(2, day(0)) }),
      [B]: practiced({ memory: memory(2, day(0)) }),
      [C]: practiced({ memory: memory(2, day(0)) }),
    });
    const frozen = JSON.stringify(start);
    model.apply(start, attempt(C, 3, { context: 'review' }), day(2));
    model.apply(start, attempt(C, 3, { context: 'review', correct: false }), day(2));
    model.applyOverride(start, { skillId: A, to: 'mastered' }, day(3));
    expect(JSON.stringify(start)).toBe(frozen);
  });
});
