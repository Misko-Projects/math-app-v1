// 04 §7 dashboard signals, table-driven: skill map over the synthetic graph, and the event-log
// signals (misconception alerts, time, accuracy band, math density) over inline envelopes.

import type {
  AnyEventEnvelope,
  AttemptPayload,
  ChildId,
  EventEnvelope,
  EventPayloads,
  EventType,
  LearnerState,
  MisconceptionSpec,
  SkillState,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { createEloFireModel } from '../learner/elo-fire';
import { A, attempt, B, C, day, F, N, syntheticGraph, T0 } from '../learner/synthetic.test-support';
import { DAY_MS } from '../params';
import {
  type AccuracyBand,
  accuracyBand,
  type MisconceptionAlert,
  mathDensity,
  misconceptionAlerts,
  skillMap,
  timeSignals,
} from './index';

const CHILD: ChildId = '019a0000-0000-7000-8000-000000000001';
const OTHER: ChildId = '019a0000-0000-7000-8000-000000000002';
const MIN = 60_000;

const graph = syntheticGraph();
const model = createEloFireModel(graph, { childId: CHILD, isK: false });
const s0 = model.init(graph, null);

let seq = 0;
function env<T extends EventType>(
  type: T,
  payload: EventPayloads[T],
  ts: number,
  childId: ChildId | null = CHILD,
  id = `e${String(++seq).padStart(5, '0')}`,
): EventEnvelope<T> {
  return {
    id,
    familyId: 'fam-1',
    childId,
    deviceId: 'dev-1',
    ts,
    type,
    v: 1,
    payload,
    contentVersion: 'test',
  };
}

const att = (
  skillId: string,
  ts: number,
  over: Partial<AttemptPayload> = {},
  childId: ChildId = CHILD,
) => env('attempt', attempt(skillId, 3, over), ts, childId);

const started = (ts: number, trigger: 'child' | 'parent', childId: ChildId | null = CHILD) =>
  env('session.started', { sessionId: `s${ts}`, budgetMinutes: 15, trigger }, ts, childId);

const ended = (
  ts: number,
  over: Partial<EventPayloads['session.ended']> = {},
  childId: ChildId | null = CHILD,
  id?: string,
) =>
  env(
    'session.ended',
    {
      sessionId: `s${ts}`,
      reason: 'wind-down',
      activeMs: 10 * MIN,
      mathMs: 5 * MIN,
      items: 8,
      ...over,
    },
    ts,
    childId,
    id,
  );

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

const memory = (dueTs: number) => ({
  intervalDays: 1,
  lastReviewTs: dueTs - DAY_MS,
  dueTs,
  reps: 1,
  reviewsPassed: [],
  consecutiveFails: 0,
});

function withSkill(state: LearnerState, id: string, over: Partial<SkillState>): LearnerState {
  return { ...state, skills: { ...state.skills, [id]: skillState(over) } };
}

// ---------- skill map ----------

describe('skillMap (04 §7 skill map)', () => {
  it('lists every graph node in topological order, with model status and P(ref)', () => {
    const map = skillMap(model, s0, T0);
    expect(map.map((e) => e.skillId)).toEqual(graph.nodes);
    expect(map.map((e) => e.skillId)).toEqual([A, F, B, N, C]);
    for (const e of map) {
      expect(e.status).toBe(model.status(s0, e.skillId, T0));
      expect(e.pRef).toBe(model.pRef(s0, e.skillId));
      expect(e.strand).toBe(graph.skills[e.skillId]?.strand);
    }
  });

  it('gives an untouched skill empty evidence and no review', () => {
    const entry = skillMap(model, s0, T0).find((e) => e.skillId === B);
    expect(entry).toMatchObject({
      recent: [],
      formats: [],
      tiers: [],
      nextReviewTs: null,
      retrievability: null,
      assumed: false,
      override: null,
    });
  });

  it('covers formats (sorted) and tiers (CPA order) of independent correct entries only', () => {
    const steps: [AttemptPayload, number][] = [
      [attempt(A, 3), T0], // abstract, number-pad
      [attempt(A, 1), T0 + 1], // concrete, tap-count
      [attempt(A, 2, { hintsUsed: 1 }), T0 + 2], // hinted: not covered
      [attempt(A, 4, { correct: false }), T0 + 3], // wrong: not covered
    ];
    const state = steps.reduce((s, [a, ts]) => model.apply(s, a, ts), s0);
    const entry = skillMap(model, state, T0 + 10).find((e) => e.skillId === A);
    expect(entry?.recent.map((r) => r.ts)).toEqual([T0, T0 + 1, T0 + 2, T0 + 3]);
    expect(entry?.formats).toEqual(['number-pad', 'tap-count']);
    expect(entry?.tiers).toEqual(['concrete', 'abstract']);
  });

  it.each<[string, Partial<SkillState>, number | null]>([
    ['neither set', {}, null],
    ['memory only', { memory: memory(day(3)) }, day(3)],
    ['at-risk only', { atRiskDueTs: day(2) }, day(2)],
    ['both, at-risk earlier', { memory: memory(day(3)), atRiskDueTs: day(2) }, day(2)],
    ['both, memory earlier', { memory: memory(day(1)), atRiskDueTs: day(2) }, day(1)],
  ])('nextReviewTs: %s', (_name, over, expected) => {
    const state = withSkill(s0, A, over);
    expect(skillMap(model, state, T0)[0]?.nextReviewTs).toBe(expected);
  });

  it('reports retrievability, assumed and override from the state', () => {
    const state = withSkill(s0, A, {
      theta: 2,
      practicedAt: day(0),
      memory: memory(day(1)),
      assumed: true,
      override: 'mastered',
    });
    const entry = skillMap(model, state, day(2))[0];
    expect(entry?.retrievability).toBe(model.retrievability(state, A, day(2)));
    expect(entry?.retrievability).not.toBeNull();
    expect(entry?.assumed).toBe(true);
    expect(entry?.override).toBe('mastered');
  });
});

// ---------- misconception alerts ----------

const M1 = 'add.count-all';
const M2 = 'sub.reverse';
const specs: MisconceptionSpec[] = [
  {
    id: M1,
    name: 'Counts all',
    area: 'addition',
    detect: { kind: 'answer', rule: 'r' },
    appliesTo: { generators: [] },
    skills: [A],
    remediation: [B, A],
    feedback: 'fb.m1',
    priority: 1,
    parentTip: 'Count on from the bigger number with a handful of buttons.',
    examples: [],
  },
];

describe('misconceptionAlerts (04 §6.4 rule 5)', () => {
  const hit = (skillId: string, ts: number, ids: string[], over: Partial<AttemptPayload> = {}) =>
    att(skillId, ts, { misconceptionIds: ids, correct: false, ...over });
  const clean = (skillId: string, ts: number, over: Partial<AttemptPayload> = {}) =>
    att(skillId, ts, over);

  it.each<[string, AnyEventEnvelope[], number]>([
    ['no events', [], 0],
    ['one match', [hit(A, T0, [M1]), clean(A, T0 + 1)], 0],
    ['two matches (threshold exactly)', [hit(A, T0, [M1]), hit(A, T0 + 1, [M1])], 1],
    ['matches split across skills do not add up', [hit(A, T0, [M1]), hit(B, T0 + 1, [M1])], 0],
    ['the same id twice in one attempt counts once', [hit(A, T0, [M1, M1]), clean(A, T0 + 1)], 0],
    [
      'the same event delivered twice counts once',
      (() => {
        const e = hit(A, T0, [M1]);
        return [e, { ...e }];
      })(),
      0,
    ],
    [
      'placement attempts are excluded',
      [hit(A, T0, [M1], { context: 'placement' }), hit(A, T0 + 1, [M1])],
      0,
    ],
    [
      "another child's attempts are ignored",
      [hit(A, T0, [M1]), { ...hit(A, T0 + 1, [M1]), childId: OTHER }],
      0,
    ],
    [
      'retries (attemptNo 2) are attempts too',
      [hit(A, T0, [M1]), hit(A, T0 + 1, [M1], { attemptNo: 2 })],
      1,
    ],
  ])('%s → %i alert(s)', (_name, events, n) => {
    expect(misconceptionAlerts(events, CHILD, specs)).toHaveLength(n);
  });

  it.each<[string, number[], number | null]>([
    // 11 attempts on A; the listed (1-based) positions match M1. The window is the last 10.
    ['first and last: the first fell out of the window', [1, 11], null],
    ['second and last: both inside', [2, 11], 2],
    ['three inside', [2, 5, 11], 3],
  ])('window of 10: %s', (_name, positions, count) => {
    const events = Array.from({ length: 11 }, (_, i) =>
      positions.includes(i + 1) ? hit(A, T0 + i, [M1]) : clean(A, T0 + i),
    );
    const alerts = misconceptionAlerts(events, CHILD, specs);
    expect(alerts[0]?.count ?? null).toBe(count);
  });

  it('placement attempts do not take window slots', () => {
    const events = [
      hit(A, T0, [M1]),
      ...Array.from({ length: 10 }, (_, i) => clean(A, T0 + 1 + i, { context: 'placement' })),
      hit(A, T0 + 20, [M1]),
    ];
    expect(misconceptionAlerts(events, CHILD, specs)).toHaveLength(1);
  });

  it('builds the alert: count, lastTs, up to 3 newest examples, tip and remediation', () => {
    const events = [1, 2, 3, 4].map((k) =>
      hit(A, T0 + k * MIN, [M1], {
        params: { a: k, b: 3 },
        response: { kind: 'number', value: k + 3 + 1 },
      }),
    );
    const [alert, ...rest] = misconceptionAlerts(events, CHILD, specs);
    expect(rest).toEqual([]);
    expect(alert).toEqual<MisconceptionAlert>({
      misconceptionId: M1,
      skillId: A,
      count: 4,
      lastTs: T0 + 4 * MIN,
      examples: [4, 3, 2].map((k) => ({
        params: { a: k, b: 3 },
        response: { kind: 'number', value: k + 4 },
        ts: T0 + k * MIN,
      })),
      parentTip: specs[0]?.parentTip ?? null,
      remediation: [B, A],
    });
  });

  it('an unknown misconception id still alerts, with no tip and no remediation', () => {
    const events = [hit(A, T0, [M2]), hit(A, T0 + 1, [M2])];
    expect(misconceptionAlerts(events, CHILD, specs)[0]).toMatchObject({
      misconceptionId: M2,
      parentTip: null,
      remediation: [],
    });
  });

  it('sorts by lastTs desc, then skillId, then misconceptionId, whatever the input order', () => {
    const events = [
      hit(A, T0, [M1, M2]),
      hit(A, T0 + 5, [M1, M2]), // A: M1 and M2 tie at T0 + 5
      hit(C, T0 + 1, [M1]),
      hit(C, T0 + 9, [M1]), // C: newest
      hit(B, T0 + 2, [M2]),
      hit(B, T0 + 5, [M2]), // B: ties A on lastTs, B > A
    ];
    const expected: [string, string][] = [
      [C, M1],
      [A, M1],
      [A, M2],
      [B, M2],
    ];
    for (const order of [events, [...events].reverse()]) {
      expect(
        misconceptionAlerts(order, CHILD, specs).map((a) => [a.skillId, a.misconceptionId]),
      ).toEqual(expected);
    }
  });
});

// ---------- time ----------

describe('timeSignals (04 §7 time)', () => {
  const utc = { timezone: 'UTC' };

  it('is empty for no events and skips family-level (null child) events', () => {
    expect(timeSignals([], utc)).toEqual({ byChild: {} });
    expect(timeSignals([started(T0, 'child', null), ended(T0 + MIN, {}, null)], utc)).toEqual({
      byChild: {},
    });
  });

  it('sums active minutes per local day, rounded to 0.1, per child', () => {
    const events = [
      ended(T0, { activeMs: 90_000 }), // 1.5
      ended(T0 + 3_600_000, { activeMs: 100_000 }), // + 1.666… = 3.1666… → 3.2
      ended(day(1), { activeMs: 20 * MIN }),
      ended(day(1), { activeMs: 7 * MIN }, OTHER),
    ];
    const out = timeSignals(events, utc);
    expect(Object.keys(out.byChild)).toEqual([CHILD, OTHER]);
    expect(out.byChild[CHILD]?.minutesByDay).toEqual({ '2026-11-02': 3.2, '2026-11-03': 20 });
    expect(out.byChild[OTHER]?.minutesByDay).toEqual({ '2026-11-03': 7 });
  });

  // T0 + 11 h = 2026-11-03 03:00 UTC = 2026-11-02 21:00 CST (UTC−6).
  it.each<[string, string, string]>([
    ['UTC', 'UTC', '2026-11-03'],
    ['America/Chicago', 'America/Chicago', '2026-11-02'],
    ['Pacific/Auckland (UTC+13)', 'Pacific/Auckland', '2026-11-03'],
    ['an invalid timezone falls back to UTC', 'Not/A_Zone', '2026-11-03'],
    ['an empty timezone falls back to UTC', '', '2026-11-03'],
  ])('day boundary: %s', (_name, timezone, date) => {
    const out = timeSignals([ended(T0 + 11 * 3_600_000, { activeMs: 6 * MIN })], { timezone });
    expect(out.byChild[CHILD]?.minutesByDay).toEqual({ [date]: 6 });
  });

  it('counts sessions started by the child vs. prompted by a parent', () => {
    const events = [
      started(T0, 'child'),
      started(T0 + 1, 'child'),
      started(T0 + 2, 'parent'),
      started(T0 + 3, 'parent', OTHER),
    ];
    const out = timeSignals(events, utc);
    expect(out.byChild[CHILD]?.sessionsStarted).toEqual({ child: 2, parent: 1 });
    expect(out.byChild[CHILD]?.minutesByDay).toEqual({});
    expect(out.byChild[OTHER]?.sessionsStarted).toEqual({ child: 0, parent: 1 });
  });

  it.each<[EventPayloads['session.ended']['reason'], 'natural' | 'abandoned' | 'other']>([
    ['wind-down', 'natural'],
    ['abandoned', 'abandoned'],
    ['child-exit', 'other'],
    ['daily-cap', 'other'],
    ['quiet-hours', 'other'],
  ])('ending %s counts as %s', (reason, bucket) => {
    const endings = timeSignals([ended(T0, { reason })], utc).byChild[CHILD]?.endings;
    expect(endings).toEqual({ natural: 0, abandoned: 0, other: 0, [bucket]: 1 });
  });
});

// ---------- accuracy band ----------

describe('accuracyBand (04 §7 accuracy band, §2.4 controller window)', () => {
  const firstTries = (results: boolean[], over: Partial<AttemptPayload> = {}, start = T0) =>
    results.map((correct, i) => att(A, start + i, { correct, ...over }));
  const pattern = (correct: number, wrong: number) => [
    ...Array<boolean>(wrong).fill(false),
    ...Array<boolean>(correct).fill(true),
  ];

  it.each<[string, boolean, number]>([
    ['G1+ practice p*', false, 0.85],
    ['K practice p*', true, 0.88],
  ])('target: %s', (_name, isK, target) => {
    expect(accuracyBand([], CHILD, { isK })).toEqual({ accuracy: null, n: 0, target, band: null });
  });

  it.each<[string, boolean[], number, NonNullable<AccuracyBand['band']>]>([
    ['all correct', pattern(20, 0), 1, 'above'],
    ['19 of 20 (0.95)', pattern(19, 1), 0.95, 'above'],
    ['18 of 20 (0.90)', pattern(18, 2), 0.9, 'on'],
    ['15 of 20 (0.75, the low edge is on)', pattern(15, 5), 0.75, 'on'],
    ['14 of 20 (0.70)', pattern(14, 6), 0.7, 'below'],
    ['3 of 4 (short window)', pattern(3, 1), 0.75, 'on'],
    ['one wrong', [false], 0, 'below'],
  ])('band: %s', (_name, results, accuracy, band) => {
    const out = accuracyBand(firstTries(results), CHILD, { isK: false });
    expect(out).toEqual({ accuracy, n: results.length, target: 0.85, band });
  });

  it('keeps only the last 20 first attempts', () => {
    const out = accuracyBand(firstTries(pattern(20, 5)), CHILD, { isK: false });
    expect(out).toMatchObject({ accuracy: 1, n: 20, band: 'above' });
  });

  it('orders by ts, not input order', () => {
    // Oldest 5 wrong, newest 20 correct; reversed input must still drop the wrong ones.
    const events = firstTries(pattern(20, 5)).reverse();
    expect(accuracyBand(events, CHILD, { isK: false }).accuracy).toBe(1);
  });

  it.each<[string, AnyEventEnvelope]>([
    ['retries (attemptNo 2)', att(A, T0 + 100, { correct: false, attemptNo: 2 })],
    ['placement', att(A, T0 + 100, { correct: false, context: 'placement' })],
    ['lesson', att(A, T0 + 100, { correct: false, context: 'lesson' })],
    ["another child's attempts", att(A, T0 + 100, { correct: false }, OTHER)],
    ['session events', ended(T0 + 100)],
  ])('ignores %s', (_name, extra) => {
    const out = accuracyBand([...firstTries(pattern(4, 0)), extra], CHILD, { isK: false });
    expect(out).toMatchObject({ accuracy: 1, n: 4 });
  });

  it.each<[string, AttemptPayload['context']]>([
    ['practice', 'practice'],
    ['review', 'review'],
    ['warmup', 'warmup'],
    ['challenge', 'challenge'],
    ['transfer-probe', 'transfer-probe'],
  ])('counts %s first attempts', (_name, context) => {
    const out = accuracyBand(firstTries([false], { context }), CHILD, { isK: false });
    expect(out.n).toBe(1);
  });
});

// ---------- math density ----------

describe('mathDensity (04 §7 math density)', () => {
  it('is empty without session.ended events', () => {
    expect(mathDensity([], CHILD)).toEqual([]);
    expect(mathDensity([started(T0, 'child'), att(A, T0 + 1)], CHILD)).toEqual([]);
  });

  it.each<[string, number, number, number]>([
    ['half', 10 * MIN, 5 * MIN, 0.5],
    ['all math', 10 * MIN, 10 * MIN, 1],
    ['no math', 10 * MIN, 0, 0],
    ['active 0 → 0', 0, 0, 0],
    ['active 0 with math ms → 0', 0, 3 * MIN, 0],
    ['math > active clamps to 1', 4 * MIN, 5 * MIN, 1],
  ])('density: %s', (_name, activeMs, mathMs, density) => {
    const [entry] = mathDensity([ended(T0, { activeMs, mathMs })], CHILD);
    expect(entry).toEqual({ sessionId: `s${T0}`, ts: T0, activeMs, mathMs, density });
  });

  it("sorts by ts then id and ignores another child's sessions", () => {
    const events = [
      ended(day(2), { sessionId: 'late' }),
      ended(day(1), { sessionId: 'tie-b' }, CHILD, 'id-b'),
      ended(day(1), { sessionId: 'tie-a' }, CHILD, 'id-a'),
      ended(day(0), { sessionId: 'other' }, OTHER),
      ended(day(0), { sessionId: 'early' }),
    ];
    expect(mathDensity(events, CHILD).map((e) => e.sessionId)).toEqual([
      'early',
      'tie-a',
      'tie-b',
      'late',
    ]);
  });
});
