// 04 §5 placement runner: priors, BKT, propagation, probe scoring, stop rules, determinism and
// resume, on small synthetic graphs (table-driven where the rule is a formula).

import {
  type AnyEventEnvelope,
  type ChildContext,
  defaultChildSettings,
  type EventPayloads,
  eventSchemas,
  type Grade,
  type ItemTemplate,
  type LearnerState,
  type Skill,
  type SkillGraph,
  type SkillState,
} from '@number-island/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEloFireModel } from '../learner/elo-fire';
import { foldLearnerState } from '../learner/fold';
import { buildSkillGraph } from '../learner/graph';
import { attempt, syntheticGraph, T0 } from '../learner/synthetic.test-support';
import { type EngineParams, PARAMS } from '../params';
import { createRng } from '../rng';
import {
  ancestorsWithin,
  beginPlacementSession,
  bktPosterior,
  completePlacement,
  gradePrior,
  gradePriorPlacement,
  nextProbe,
  type PlacementAnswer,
  type PlacementRun,
  placementBudget,
  placementConverged,
  placementProbeSeed,
  probeScores,
  probeTemplates,
  recordProbe,
  resumePlacement,
  startPlacement,
} from './index';

const CHILD_ID = '019a0000-0000-7000-8000-00000000c001';

function child(grade: Grade, advanced = false): ChildContext {
  return {
    childId: CHILD_ID,
    grade,
    ageBand: '5-6',
    advanced,
    isK: grade === 'K',
    settings: defaultChildSettings(grade),
  };
}

// ---------- graph builders ----------

const BASE = syntheticGraph();
const baseSkill = BASE.skills['CNT.01'] as Skill;
const baseTemplates = baseSkill.templates.map((t) => BASE.templates[t]);

interface Node {
  id: string;
  pre?: string[];
  grade?: Grade;
  gateway?: boolean;
}

/** A graph of skills with the synthetic templates (t1 concrete tap-count … t4 abstract number-bond). */
function makeGraph(nodes: Node[]): SkillGraph {
  const skills: Skill[] = nodes.map((n) => ({
    ...baseSkill,
    id: n.id,
    name: n.id,
    strand: n.id.split('.')[0] as Skill['strand'],
    grade: n.grade ?? 'K',
    prerequisites: n.pre ?? [],
    gateway: n.gateway ?? false,
    templates: baseTemplates.map((t) => `${n.id}.${t?.id.split('.')[2]}`),
    lesson: { ...baseSkill.lesson, templateId: `${n.id}.t1` },
  }));
  const templates = nodes.flatMap((n) =>
    baseTemplates.map((t) => ({
      ...(t as NonNullable<typeof t>),
      id: `${n.id}.${t?.id.split('.')[2]}`,
      skillId: n.id,
    })),
  );
  const depth: Record<string, number> = {};
  for (const n of nodes) depth[n.id] = Math.max(-1, ...(n.pre ?? []).map((p) => depth[p] ?? 0)) + 1;
  const descendants2: Record<string, number> = {};
  for (const n of nodes) descendants2[n.id] = 0;
  return buildSkillGraph({
    contentVersion: 'test',
    skills,
    templates,
    graph: {
      nodes: nodes.map((n) => n.id),
      roots: nodes.filter((n) => (n.pre ?? []).length === 0).map((n) => n.id),
      gateways: nodes.filter((n) => n.gateway).map((n) => n.id),
      depth,
      descendants2,
    },
  });
}

/** CNT.01 → CNT.02 → … → CNT.0n (a chain). */
const chain = (n: number, grade: Grade = 'K'): SkillGraph =>
  makeGraph(
    Array.from({ length: n }, (_, i) => ({
      id: `CNT.0${i + 1}`,
      grade,
      ...(i > 0 ? { pre: [`CNT.0${i}`] } : {}),
    })),
  );

/** n independent root skills of one strand. */
const wide = (n: number, strand = 'CNT', grade: Grade = 'K'): SkillGraph =>
  makeGraph(
    Array.from({ length: n }, (_, i) => ({
      id: `${strand}.${String(i + 1).padStart(2, '0')}`,
      grade,
    })),
  );

function emptyState(graph: SkillGraph, isK = true): LearnerState {
  return createEloFireModel(graph, { childId: CHILD_ID, isK }).init(graph, null);
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

function start(
  graph: SkillGraph,
  c: ChildContext,
  over: { state?: LearnerState; strand?: Skill['strand'] | null; params?: EngineParams } = {},
): PlacementRun {
  return startPlacement({
    graph,
    child: c,
    state: over.state ?? emptyState(graph, c.isK),
    placementId: 'pl-1',
    strand: over.strand ?? null,
    ...(over.params ? { params: over.params } : {}),
  });
}

function answer(
  run: PlacementRun,
  graph: SkillGraph,
  c: ChildContext,
  correct: boolean,
  over: Partial<PlacementAnswer> = {},
  params?: EngineParams,
): { run: PlacementRun; event: EventPayloads['placement.probe'] } {
  const task = nextProbe(run, { graph, child: c, ...(params ? { params } : {}) });
  if (!task) throw new Error('no probe');
  const tier = graph.templates[task.templateId]?.tier ?? 'abstract';
  return recordProbe(
    run,
    { graph, child: c, ...(params ? { params } : {}) },
    {
      skillId: task.skillId,
      templateId: task.templateId,
      seed: task.seed,
      correct,
      skipped: false,
      latencyMs: 3_000,
      ts: T0 + run.items * 10_000,
      tier,
      ...over,
    },
  );
}

/** Records an answer on a named skill (not necessarily the selected probe). */
function answerOn(
  run: PlacementRun,
  graph: SkillGraph,
  c: ChildContext,
  skillId: string,
  correct: boolean,
  over: Partial<PlacementAnswer> = {},
): PlacementRun {
  return recordProbe(
    run,
    { graph, child: c },
    {
      skillId,
      templateId: `${skillId}.t3`,
      seed: placementProbeSeed(run.placementId, run.items),
      correct,
      skipped: false,
      latencyMs: 3_000,
      ts: T0 + run.items * 10_000,
      tier: 'abstract',
      ...over,
    },
  ).run;
}

const withPlacement = (over: Partial<EngineParams['placement']>): EngineParams => ({
  ...PARAMS,
  placement: { ...PARAMS.placement, ...over },
});

// ---------- priors and budgets ----------

describe('priors (04 §5 table, advanced → g + 1)', () => {
  const cases: [Grade, boolean, Grade, number][] = [
    ['K', false, 'K', 0.5],
    ['K', false, '1', 0.25],
    ['K', false, '2', 0.1],
    ['K', false, '3', 0.1],
    ['K', true, 'K', 0.85],
    ['K', true, '1', 0.5],
    ['K', true, '2', 0.25],
    ['K', true, '3', 0.1],
    ['2', false, 'K', 0.85],
    ['2', false, '1', 0.85],
    ['2', false, '2', 0.5],
    ['2', false, '3', 0.25],
    ['2', false, '4', 0.1],
    ['2', true, '2', 0.85],
    ['2', true, '3', 0.5],
    ['8', false, 'HS', 0.25],
    ['HS', false, '8', 0.85],
    ['HS', false, 'HS', 0.5],
  ];
  it.each(cases)('child %s (advanced %s), skill grade %s → %d', (g, adv, skillGrade, p) => {
    expect(gradePrior(skillGrade, { grade: g, advanced: adv })).toBe(p);
  });

  it('starts every scope skill at its grade prior', () => {
    const g = makeGraph([
      { id: 'CNT.01', grade: 'K' },
      { id: 'CNT.02', grade: '1', pre: ['CNT.01'] },
      { id: 'CNT.03', grade: '2', pre: ['CNT.02'] },
    ]);
    const run = start(g, child('K'));
    expect(run.p).toEqual({ 'CNT.01': 0.5, 'CNT.02': 0.25, 'CNT.03': 0.1 });
    expect(run.scope).toEqual(['CNT.01', 'CNT.02', 'CNT.03']);
  });

  it('puts skills on the practiced track at 0.95, never probes or outputs them', () => {
    const g = wide(3);
    const state = emptyState(g);
    state.skills['CNT.01'] = skillState({ practicedAt: T0 });
    state.skills['CNT.02'] = skillState({ assumed: true });
    let run = start(g, child('K'), { state });
    expect(run.onTrack).toEqual(['CNT.01', 'CNT.02']);
    expect(run.p['CNT.01']).toBe(0.95);
    expect(run.p['CNT.02']).toBe(0.95);
    expect(nextProbe(run, { graph: g, child: child('K') })?.skillId).toBe('CNT.03');
    expect(() => answerOn(run, g, child('K'), 'CNT.01', true)).toThrow();
    run = answerOn(run, g, child('K'), 'CNT.03', true);
    expect(run.done).toBe('converged');
    expect(Object.keys(completePlacement(run).posterior)).toEqual(['CNT.03']);
  });

  it('mini-placement: strand scope, existing prior for scope skills, out-of-scope ancestors fixed', () => {
    const g = makeGraph([
      { id: 'CNT.01' },
      { id: 'CNT.02', pre: ['CNT.01'] },
      { id: 'ADD.01', pre: ['CNT.02'] },
      { id: 'ADD.02', pre: ['ADD.01'] },
    ]);
    const state = emptyState(g);
    state.placement = {
      prior: { p: { 'CNT.01': 0.7, 'ADD.01': 0.6 }, assumed: [] },
      strandsPlaced: ['CNT'],
      inProgress: null,
    };
    const run = start(g, child('K'), { state, strand: 'ADD' });
    expect(run.scope).toEqual(['ADD.01', 'ADD.02']);
    expect(run.p).toEqual({ 'ADD.01': 0.6, 'ADD.02': 0.5, 'CNT.01': 0.7, 'CNT.02': 0.5 });
    expect(run.budget).toEqual({ perSession: 6, sessions: 1 });
    // Initial placements ignore an existing prior for scope skills.
    expect(start(g, child('K'), { state }).p['ADD.01']).toBe(0.5);
    // A correct probe of ADD.02 raises only scope ancestors.
    const after = answerOn(run, g, child('K'), 'ADD.02', true);
    expect(after.p['ADD.01']).toBeGreaterThan(0.6);
    expect(after.p['CNT.02']).toBe(0.5);
    expect(after.p['CNT.01']).toBe(0.7);
  });

  it.each([
    ['K', false, { perSession: 12, sessions: 4 }],
    ['1', false, { perSession: 20, sessions: 3 }],
    ['2', false, { perSession: 20, sessions: 3 }],
    ['3', false, { perSession: 20, sessions: 3 }],
    ['K', true, { perSession: 6, sessions: 1 }],
    ['2', true, { perSession: 6, sessions: 1 }],
  ] as const)('budget for grade %s (mini %s)', (g, mini, budget) => {
    expect(placementBudget(child(g), mini)).toEqual(budget);
  });
});

// ---------- BKT ----------

describe('BKT posterior (G = 0.05 or 1/k, S = 0.10)', () => {
  const G = 0.05;
  const S = 0.1;
  const right = (p: number, g = G) => (p * (1 - S)) / (p * (1 - S) + (1 - p) * g);
  const wrong = (p: number, g = G) => (p * S) / (p * S + (1 - p) * (1 - g));
  const cases: [string, Parameters<typeof bktPosterior>[0], number][] = [
    ['correct p=0.5', { p: 0.5, correct: true, skipped: false, slow: false }, right(0.5)],
    ['correct p=0.25', { p: 0.25, correct: true, skipped: false, slow: false }, right(0.25)],
    ['incorrect p=0.5', { p: 0.5, correct: false, skipped: false, slow: false }, wrong(0.5)],
    ['incorrect p=0.85', { p: 0.85, correct: false, skipped: false, slow: false }, wrong(0.85)],
    [
      'correct 4-choice',
      { p: 0.5, correct: true, skipped: false, slow: false, choices: 4 },
      right(0.5, 0.25),
    ],
    [
      'incorrect 3-choice',
      { p: 0.5, correct: false, skipped: false, slow: false, choices: 3 },
      wrong(0.5, 1 / 3),
    ],
    [
      'slow correct',
      { p: 0.5, correct: true, skipped: false, slow: true },
      0.5 * right(0.5) + 0.5 * 0.5,
    ],
    ['skip', { p: 0.5, correct: false, skipped: true, slow: false }, 0.5 * wrong(0.5) + 0.25],
    [
      'skip p=0.85',
      { p: 0.85, correct: false, skipped: true, slow: false },
      0.5 * wrong(0.85) + 0.425,
    ],
  ];
  it.each(cases)('%s', (_n, o, expected) => {
    expect(bktPosterior(o)).toBeCloseTo(expected, 12);
  });
  it('known values', () => {
    expect(right(0.5)).toBeCloseTo(0.947368, 6);
    expect(wrong(0.5)).toBeCloseTo(0.095238, 6);
  });

  it('recordProbe detects slow-correct from the expected latency (× 1.5 for K)', () => {
    const g = wide(2);
    // number-pad abstract: 8,000 ms expected; K ⇒ 12,000; slow beyond 2 × = 24,000.
    const run = start(g, child('K'));
    const at = (latencyMs: number) =>
      recordProbe(
        run,
        { graph: g, child: child('K') },
        {
          skillId: 'CNT.01',
          templateId: 'CNT.01.t3',
          seed: placementProbeSeed(run.placementId, run.items),
          correct: true,
          skipped: false,
          latencyMs,
          ts: T0,
          tier: 'abstract',
        },
      ).event.posterior;
    expect(at(24_000)).toBeCloseTo(right(0.5), 12);
    expect(at(24_001)).toBeCloseTo(0.5 * right(0.5) + 0.25, 12);
    const gg = wide(2, 'CNT', '2');
    const ev = recordProbe(
      start(gg, child('2')),
      { graph: gg, child: child('2') },
      {
        skillId: 'CNT.01',
        templateId: 'CNT.01.t3',
        seed: placementProbeSeed('pl-1', 0),
        correct: true,
        skipped: false,
        latencyMs: 16_001,
        ts: T0,
        tier: 'abstract',
      },
    ).event;
    expect(ev.posterior).toBeCloseTo(0.5 * right(0.5) + 0.25, 12);
  });

  it('a skipped answer is recorded as not correct and with the skip posterior', () => {
    const g = wide(2);
    const { event } = answer(start(g, child('K')), g, child('K'), true, { skipped: true });
    expect(event.correct).toBe(false);
    expect(event.skipped).toBe(true);
    expect(event.posterior).toBeCloseTo(0.5 * wrong(0.5) + 0.25, 12);
  });
});

// ---------- propagation ----------

describe('propagation by hop (λup [0.8, 0.6, 0.4], λdown [0.5, 0.35, 0.2])', () => {
  const g = chain(5);
  const k = child('K');

  it('correct → ancestors up to 3 hops rise by λup(h)·(1 − p)·post; descendants unchanged', () => {
    const run = answerOn(start(g, k), g, k, 'CNT.05', true);
    const post = run.p['CNT.05'] as number;
    expect(post).toBeCloseTo(0.947368, 6);
    expect(run.p['CNT.04']).toBeCloseTo(0.5 + 0.8 * 0.5 * post, 12);
    expect(run.p['CNT.03']).toBeCloseTo(0.5 + 0.6 * 0.5 * post, 12);
    expect(run.p['CNT.02']).toBeCloseTo(0.5 + 0.4 * 0.5 * post, 12);
    expect(run.p['CNT.01']).toBe(0.5);
  });

  it('incorrect → descendants up to 3 hops scale by (1 − λdown(h)); ancestors not lowered', () => {
    const run = answerOn(start(g, k), g, k, 'CNT.01', false);
    expect(run.p['CNT.01']).toBeCloseTo(0.095238, 6);
    expect(run.p['CNT.02']).toBeCloseTo(0.5 * 0.5, 12);
    expect(run.p['CNT.03']).toBeCloseTo(0.5 * 0.65, 12);
    expect(run.p['CNT.04']).toBeCloseTo(0.5 * 0.8, 12);
    expect(run.p['CNT.05']).toBe(0.5);
    const mid = answerOn(start(g, k), g, k, 'CNT.03', false);
    expect(mid.p['CNT.02']).toBe(0.5);
    expect(mid.p['CNT.01']).toBe(0.5);
    expect(mid.boost).toEqual({ 'CNT.02': 0.5 });
  });

  it('a skip propagates downward like an incorrect answer', () => {
    const run = answerOn(start(g, k), g, k, 'CNT.01', true, { skipped: true });
    expect(run.p['CNT.02']).toBeCloseTo(0.25, 12);
    expect(run.boost).toEqual({});
  });

  it('uses the nearest hop on diamonds', () => {
    const d = makeGraph([
      { id: 'CNT.01' },
      { id: 'CNT.02', pre: ['CNT.01'] },
      { id: 'CNT.03', pre: ['CNT.02'] },
      { id: 'CNT.04', pre: ['CNT.01', 'CNT.03'] },
    ]);
    const run = answerOn(start(d, k), d, k, 'CNT.04', true);
    const post = run.p['CNT.04'] as number;
    expect(run.p['CNT.01']).toBeCloseTo(0.5 + 0.8 * 0.5 * post, 12);
    expect(run.p['CNT.02']).toBeCloseTo(0.5 + 0.6 * 0.5 * post, 12);
  });
});

// ---------- probe selection ----------

describe('probe scoring', () => {
  const k = child('K');

  it('scores (1 − |2p − 1|)·(1 + 0.15·U)·gateway·answerable, best first', () => {
    // syntheticGraph: A (root) → B (gateway) → C; A → F; A → N.
    const g = BASE;
    const run = start(g, k);
    const scores = Object.fromEntries(probeScores(run, g).map((s) => [s.skillId, s.score]));
    expect(scores['CNT.01']).toBeCloseTo(1 + 0.15 * 4, 12);
    expect(scores['CNT.02']).toBeCloseTo((1 + 0.15 * 2) * 1.3, 12);
    expect(scores['CNT.03']).toBeCloseTo(1 + 0.15 * 2, 12);
    expect(scores['ADD.01']).toBeCloseTo(1.15, 12);
    expect(scores['CNT.04']).toBeCloseTo(1.15, 12);
    expect(nextProbe(run, { graph: g, child: k })?.skillId).toBe('CNT.02');
  });

  it('downward boost: the prerequisites of a wrong answer get +0.5 until probed', () => {
    const g = BASE;
    let run = answerOn(start(g, k), g, k, 'CNT.03', false);
    expect(run.boost).toEqual({ 'CNT.02': 0.5 });
    const b = probeScores(run, g).find((s) => s.skillId === 'CNT.02');
    // U(B) = A only (C dropped out of the candidate range).
    expect(b?.score).toBeCloseTo((1 + 0.15) * 1.3 + 0.5, 12);
    run = answerOn(run, g, k, 'CNT.02', true);
    expect(run.boost).toEqual({});
  });

  it('answerability: half weight when no prerequisite has p ≥ 0.5', () => {
    const g = makeGraph([
      { id: 'CNT.01', grade: '1' },
      { id: 'CNT.02', grade: 'K', pre: ['CNT.01'] },
    ]);
    const s = probeScores(start(g, k), g).find((x) => x.skillId === 'CNT.02');
    expect(s?.answerable).toBe(0.5);
    expect(s?.score).toBeCloseTo(1 * (1 + 0.15) * 0.5, 12);
  });

  it('ties break by skill id; candidates need p in [0.2, 0.85] and fewer than 2 probes', () => {
    const g = wide(3);
    let run = start(g, k);
    expect(probeScores(run, g).map((s) => s.skillId)).toEqual(['CNT.01', 'CNT.02', 'CNT.03']);
    run = answerOn(run, g, k, 'CNT.01', true); // 0.947: out of range
    expect(probeScores(run, g).map((s) => s.skillId)).toEqual(['CNT.02', 'CNT.03']);
    const p2 = withPlacement({ maxProbesPerSkill: 1 });
    let r2 = start(g, k, { params: p2 });
    r2 = recordProbe(
      r2,
      { graph: g, child: k, params: p2 },
      {
        skillId: 'CNT.02',
        templateId: 'CNT.02.t3',
        seed: placementProbeSeed(r2.placementId, r2.items),
        correct: true,
        skipped: false,
        latencyMs: 20_000,
        ts: T0,
        tier: 'abstract',
        choices: 2,
      },
    ).run;
    expect(r2.p['CNT.02']).toBeLessThan(0.85);
    expect(probeScores(r2, g, p2).map((s) => s.skillId)).toEqual(['CNT.01', 'CNT.03']);
  });

  it('prefers constructed-response abstract templates and rotates on repeat probes', () => {
    // t3 number-pad abstract, t4 number-bond abstract, t2 tenframe-fill pictorial; t1 concrete.
    expect(probeTemplates(BASE, 'CNT.01')).toEqual(['CNT.01.t3', 'CNT.01.t4', 'CNT.01.t2']);
    const g = wide(1);
    let run = start(g, k);
    const first = nextProbe(run, { graph: g, child: k });
    expect(first).toMatchObject({ templateId: 'CNT.01.t3', context: 'placement', mode: 'item' });
    run = recordProbe(
      run,
      { graph: g, child: k },
      {
        skillId: 'CNT.01',
        templateId: 'CNT.01.t3',
        seed: first?.seed ?? 0,
        correct: true,
        skipped: false,
        latencyMs: 30_000, // slow: p stays a candidate
        ts: T0,
        tier: 'abstract',
      },
    ).run;
    expect(run.p['CNT.01']).toBeLessThan(0.85);
    const second = nextProbe(run, { graph: g, child: k });
    expect(second?.templateId).toBe('CNT.01.t4');
    expect(second?.seed).not.toBe(first?.seed);
  });

  it('falls back to choice templates, then to any template', () => {
    const g = BASE;
    const choiceOnly: SkillGraph = {
      ...g,
      templates: {
        ...g.templates,
        'CNT.01.t2': { ...(g.templates['CNT.01.t2'] as ItemTemplate), format: 'numeral-pick' },
        'CNT.01.t3': { ...(g.templates['CNT.01.t3'] as ItemTemplate), format: 'compare' },
        'CNT.01.t4': { ...(g.templates['CNT.01.t4'] as ItemTemplate), tier: 'concrete' },
      },
    };
    expect(probeTemplates(choiceOnly, 'CNT.01')).toEqual(['CNT.01.t3', 'CNT.01.t2']);
    const concreteOnly: SkillGraph = {
      ...g,
      skills: {
        ...g.skills,
        'CNT.01': { ...(g.skills['CNT.01'] as Skill), templates: ['CNT.01.t1'] },
      },
    };
    expect(probeTemplates(concreteOnly, 'CNT.01')).toEqual(['CNT.01.t1']);
  });
});

// ---------- stop rules ----------

describe('stop rules', () => {
  const k = child('K');

  it('converged at once when nothing near the frontier is uncertain (G2 child, K graph)', () => {
    const g = BASE;
    const run = start(g, child('2'));
    expect(run.done).toBe('converged');
    expect(nextProbe(run, { graph: g, child: child('2') })).toBeNull();
    const out = completePlacement(run);
    expect(out).toMatchObject({ items: 0, reason: 'converged' });
    expect(out.assumed).toEqual(['ADD.01', 'CNT.01', 'CNT.02', 'CNT.03', 'CNT.04']);
  });

  it('converges once every frontier-near skill is settled', () => {
    const g = chain(4);
    let run = start(g, k);
    while (run.done === null) run = answer(run, g, k, true).run;
    expect(run.done).toBe('converged');
    expect(run.items).toBeLessThanOrEqual(4);
    expect(completePlacement(run).assumed).toEqual(['CNT.01', 'CNT.02', 'CNT.03', 'CNT.04']);
    expect(() => answer(run, g, k, true)).toThrow();
  });

  it('a mini-session ends on its budget; the placement stops when the sessions are used', () => {
    const params = withPlacement({ budgetK: { perSession: 2, sessions: 2 } });
    const g = wide(10);
    let run = start(g, k, { params });
    run = answer(run, g, k, true, {}, params).run;
    expect(run.session.ended).toBeNull();
    run = answer(run, g, k, true, {}, params).run;
    expect(run.session).toMatchObject({ index: 0, items: 2, ended: 'budget' });
    expect(run.done).toBeNull();
    expect(nextProbe(run, { graph: g, child: k, params })).toBeNull();
    expect(() => answer(run, g, k, true, {}, params)).toThrow();
    run = beginPlacementSession(run);
    expect(run.session).toEqual({ index: 1, items: 0, misses: 0, ended: null });
    expect(beginPlacementSession(run)).toBe(run);
    run = answer(run, g, k, true, {}, params).run;
    run = answer(run, g, k, true, {}, params).run;
    expect(run.done).toBe('budget');
    expect(completePlacement(run, params)).toMatchObject({ items: 4, reason: 'budget' });
  });

  it.each([
    ['K', 12, 4],
    ['2', 20, 3],
  ] as const)('default budget for %s: %d per session × %d', (grade, per, sessions) => {
    const c = child(grade);
    const g = wide(80, 'CNT', grade);
    let run = start(g, c);
    const perSession: number[] = [];
    while (run.done === null) {
      if (run.session.ended !== null) {
        perSession.push(run.session.items);
        run = beginPlacementSession(run);
        continue;
      }
      run = answer(run, g, c, true).run;
    }
    perSession.push(run.session.items);
    expect(run.done).toBe('budget');
    expect(perSession).toEqual(Array.from({ length: sessions }, () => per));
    expect(run.items).toBe(per * sessions);
  });

  it('frustration: 2 consecutive misses plus a signal end the mini-session', () => {
    const g = wide(10);
    let run = start(g, k);
    run = answer(run, g, k, false, { frustrationSignal: true }).run;
    expect(run.session.ended).toBeNull(); // one miss is not enough
    run = answer(run, g, k, true, { frustrationSignal: true }).run;
    run = answer(run, g, k, false).run;
    run = answer(run, g, k, false).run; // two misses, no signal
    expect(run.session.ended).toBeNull();
    run = answer(run, g, k, true, { skipped: true, frustrationSignal: true }).run;
    expect(run.session).toMatchObject({ ended: 'frustration', misses: 3 });
    expect(run.done).toBeNull();
    run = beginPlacementSession(run);
    expect(run.session).toEqual({ index: 1, items: 0, misses: 0, ended: null });
  });

  it('frustration in the last allowed session stops the placement', () => {
    const params = withPlacement({ budgetK: { perSession: 12, sessions: 1 } });
    const g = wide(10);
    let run = start(g, k, { params });
    run = answer(run, g, k, false, {}, params).run;
    run = answer(run, g, k, false, { frustrationSignal: true }, params).run;
    expect(run.done).toBe('frustration');
    expect(completePlacement(run, params).reason).toBe('frustration');
  });

  it('mini-placement stops at 6 items', () => {
    const g = makeGraph([
      ...Array.from({ length: 10 }, (_, i) => ({ id: `ADD.${String(i + 1).padStart(2, '0')}` })),
      { id: 'CNT.01' },
    ]);
    let run = start(g, k, { strand: 'ADD' });
    while (run.done === null) run = answer(run, g, k, true).run;
    expect(run.done).toBe('budget');
    expect(run.items).toBe(6);
    const out = completePlacement(run);
    expect(Object.keys(out.posterior).every((s) => s.startsWith('ADD.'))).toBe(true);
    expect(out.strand).toBe('ADD');
  });

  it('mini-placement does not converge before 4 items while a candidate exists', () => {
    const g = wide(6, 'ADD');
    const state = emptyState(g);
    const p: Record<string, number> = {};
    for (const s of Object.keys(g.skills)) p[s] = 0.22; // candidates, but not "uncertain"
    state.placement = { prior: { p, assumed: [] }, strandsPlaced: [], inProgress: null };
    let run = start(g, k, { state, strand: 'ADD' });
    expect(run.done).toBeNull();
    expect(placementConverged({ ...run, strand: null }, g)).toBe(true);
    const seen: number[] = [];
    while (run.done === null) {
      run = answer(run, g, k, false).run;
      seen.push(run.items);
    }
    expect(run.done).toBe('converged');
    expect(run.items).toBe(4);
  });

  it('a mini-placement with no candidate converges at once', () => {
    const g = wide(2, 'ADD');
    const state = emptyState(g);
    state.skills['ADD.01'] = skillState({ practicedAt: T0 });
    state.skills['ADD.02'] = skillState({ assumed: true });
    const run = start(g, k, { state, strand: 'ADD' });
    expect(run.done).toBe('converged');
    expect(completePlacement(run)).toMatchObject({ posterior: {}, assumed: [], items: 0 });
  });

  it('completePlacement throws until the placement stopped', () => {
    expect(() => completePlacement(start(wide(3), k))).toThrow();
  });
});

// ---------- determinism, schema, resume, fold ----------

const MIXED = makeGraph([
  { id: 'CNT.01' },
  { id: 'CNT.02', pre: ['CNT.01'], gateway: true },
  { id: 'CNT.03', pre: ['CNT.02'] },
  { id: 'CNT.04', pre: ['CNT.03'], grade: '1' },
  { id: 'SUB.01' },
  { id: 'SUB.02', pre: ['SUB.01'] },
  { id: 'CPS.01', pre: ['CNT.03', 'SUB.02'] },
  { id: 'CPS.02', pre: ['CPS.01'], grade: '1' },
  { id: 'ADD.01', pre: ['CPS.01', 'CNT.02'] },
  { id: 'ADD.02', pre: ['ADD.01'], grade: '1' },
  { id: 'ADD.03', pre: ['ADD.02'], grade: '2' },
  { id: 'CMP.01', pre: ['CNT.03'] },
]);

interface Step {
  correct: boolean;
  skipped: boolean;
  latencyMs: number;
  /** ms before this step; 0 gives events that tie on ts (sync clamps a batch to one ts, 08 §4). */
  gapMs: number;
  /** The child starts a new app session before this step (the app calls beginPlacementSession). */
  newSession: boolean;
  frustrationSignal: boolean;
}

/** An event envelope for the child; ids rise with creation order (UUIDv7-like), like the app's. */
function envelope(n: number, type: string, payload: unknown, ts: number): AnyEventEnvelope {
  return {
    id: `019a0000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`,
    familyId: '019a0000-0000-7000-8000-00000000f001',
    childId: CHILD_ID,
    deviceId: '019a0000-0000-7000-8000-00000000d001',
    ts,
    type,
    v: 1,
    payload,
    contentVersion: 'test',
  } as AnyEventEnvelope;
}

/** Records the app's events for one child: probes and session starts, in creation order. */
class Log {
  readonly events: AnyEventEnvelope[] = [];
  private n = 0;
  sessionStarted(ts: number): void {
    this.n += 1;
    const payload = { sessionId: `s${this.n}`, budgetMinutes: 10, trigger: 'child' };
    this.events.push(envelope(this.n, 'session.started', payload, ts));
  }
  probe(payload: EventPayloads['placement.probe'], ts: number): void {
    this.n += 1;
    this.events.push(envelope(this.n, 'placement.probe', payload, ts));
  }
  probes(): AnyEventEnvelope[] {
    return this.events.filter((e) => e.type === 'placement.probe');
  }
}

/**
 * A live run driven by `steps`, the way the app drives it: each new app session appends
 * `session.started` and calls `beginPlacementSession`; a mini-session that ended takes no probe
 * until the next app session.
 */
function live(
  graph: SkillGraph,
  c: ChildContext,
  steps: readonly Step[],
): { run: PlacementRun; log: Log; ts: number } {
  let run = start(graph, c);
  const log = new Log();
  let ts = T0;
  log.sessionStarted(ts);
  for (const step of steps) {
    if (run.done !== null) break;
    ts += step.gapMs;
    if (step.newSession) {
      log.sessionStarted(ts);
      run = beginPlacementSession(run);
      if (run.done !== null) break;
    }
    if (run.session.ended !== null) continue;
    const task = nextProbe(run, { graph, child: c });
    if (!task) break;
    const r = recordProbe(
      run,
      { graph, child: c },
      {
        skillId: task.skillId,
        templateId: task.templateId,
        seed: task.seed,
        correct: step.correct,
        skipped: step.skipped,
        latencyMs: step.latencyMs,
        ts,
        tier: graph.templates[task.templateId]?.tier ?? 'abstract',
        frustrationSignal: step.frustrationSignal,
      },
    );
    run = r.run;
    log.probe(r.event, ts);
  }
  return { run, log, ts };
}

const stepArb = fc.record({
  correct: fc.boolean(),
  skipped: fc.integer({ min: 0, max: 5 }).map((n) => n === 0),
  latencyMs: fc.integer({ min: 500, max: 40_000 }),
  // Ties, short and long gaps: a new app session can start at once, minutes or days later.
  gapMs: fc.oneof(
    fc.constant(0),
    fc.integer({ min: 0, max: 60_000 }),
    fc.integer({ min: 0, max: 3 * 86_400_000 }),
  ),
  newSession: fc.integer({ min: 0, max: 4 }).map((n) => n === 0),
  frustrationSignal: fc.integer({ min: 0, max: 3 }).map((n) => n === 0),
});

const resumeInput = (graph: SkillGraph, c: ChildContext, params?: EngineParams) => ({
  graph,
  child: c,
  state: emptyState(graph, c.isK),
  placementId: 'pl-1',
  strand: null,
  ...(params ? { params } : {}),
});

describe('determinism and persistence', () => {
  const k = child('K');
  const steps: Step[] = Array.from({ length: 40 }, (_, i) => ({
    correct: i % 3 !== 1,
    skipped: i % 7 === 5,
    latencyMs: 4_000 + (i % 5) * 7_000,
    gapMs: i % 9 === 8 ? 86_400_000 : 20_000,
    newSession: i % 9 === 8,
    frustrationSignal: false,
  }));

  it('same answers → deep-equal runs; a JSON round trip continues identically', () => {
    const a = live(MIXED, k, steps);
    const b = live(MIXED, k, steps);
    expect(a).toEqual(b);
    const half = live(MIXED, k, steps.slice(0, 5)).run;
    const copy = JSON.parse(JSON.stringify(half)) as PlacementRun;
    expect(copy).toEqual(half);
    expect(nextProbe(copy, { graph: MIXED, child: k })).toEqual(
      nextProbe(half, { graph: MIXED, child: k }),
    );
  });

  it('events validate against the shared schemas', () => {
    const { run, log } = live(MIXED, k, steps);
    expect(run.done).not.toBeNull();
    for (const e of log.probes())
      expect(eventSchemas['placement.probe'].parse(e.payload)).toEqual(e.payload);
    const out = completePlacement(run);
    expect(eventSchemas['placement.completed'].parse(out)).toEqual(out);
    for (const v of Object.values(out.posterior)) expect(v).toBe(Math.round(v * 1e4) / 1e4);
  });

  it('resumePlacement at a new app session equals the live run there (property)', () => {
    fc.assert(
      fc.property(
        fc.array(stepArb, { maxLength: 40 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 3 * 86_400_000 }),
        fc.integer({ min: 0, max: 1_000 }),
        (raw, isK, resumeGap, shuffleSeed) => {
          const c = child(isK ? 'K' : '1');
          const { run, log, ts } = live(MIXED, c, raw);
          // Resume applies to an unfinished placement (a stopped one has its placement.completed).
          if (run.done !== null) return;
          // Live: the app starts a new session (its session.started) and begins a mini-session.
          log.sessionStarted(ts + resumeGap);
          const expected = beginPlacementSession(run);
          // Any delivery order: the replay sorts by (ts, id), like every fold.
          const events = createRng(shuffleSeed).shuffle(
            JSON.parse(JSON.stringify(log.events)) as AnyEventEnvelope[],
          );
          const resumed = resumePlacement(resumeInput(MIXED, c), events);
          expect(resumed).toEqual(expected);
          expect(nextProbe(resumed, { graph: MIXED, child: c })).toEqual(
            nextProbe(expected, { graph: MIXED, child: c }),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('events that tie on ts (a clamped sync batch) keep their session boundaries', () => {
    const params = withPlacement({ budgetK: { perSession: 12, sessions: 2 } });
    const g = wide(10);
    let run = start(g, k, { params });
    const log = new Log();
    const at = T0 + 3 * 86_400_000; // every event below was clamped to this one ts
    log.sessionStarted(at);
    let r = answer(run, g, k, true, { ts: at, latencyMs: 30_000 }, params);
    run = r.run;
    log.probe(r.event, at);
    log.sessionStarted(at);
    run = beginPlacementSession(run);
    r = answer(run, g, k, true, { ts: at, latencyMs: 30_000 }, params);
    run = r.run;
    log.probe(r.event, at);
    expect(run.probes.map((p) => p.session)).toEqual([0, 1]);
    const replayed = resumePlacement(resumeInput(g, k, params), [...log.events].reverse());
    expect(replayed).toEqual(run);
    // The next restart finds both mini-sessions used: the placement stops on its budget.
    log.sessionStarted(at + 1);
    const restarted = resumePlacement(resumeInput(g, k, params), log.events);
    expect(restarted).toEqual(beginPlacementSession(run));
    expect(restarted.done).toBe('budget');
  });

  it('a session restarted within minutes keeps its boundary on replay', () => {
    const g = wide(10);
    let run = start(g, k);
    const log = new Log();
    log.sessionStarted(T0);
    const rec = (ts: number) => {
      const r = answer(run, g, k, true, { ts, latencyMs: 30_000 });
      run = r.run;
      log.probe(r.event, ts);
    };
    rec(T0);
    rec(T0 + 10_000);
    log.sessionStarted(T0 + 5 * 60_000); // the app was reopened five minutes later
    run = beginPlacementSession(run);
    rec(T0 + 5 * 60_000 + 1_000);
    expect(run.probes.map((p) => p.session)).toEqual([0, 0, 1]);
    expect(resumePlacement(resumeInput(g, k), log.events)).toEqual(run);
  });

  it('every mini-session used: a resumed placement stops on its budget, offering no probe', () => {
    const params = withPlacement({ budgetK: { perSession: 12, sessions: 1 } });
    const g = wide(10);
    let run = start(g, k, { params });
    const log = new Log();
    log.sessionStarted(T0);
    for (const ts of [T0, T0 + 10_000]) {
      const r = answer(run, g, k, false, { ts, frustrationSignal: ts > T0 }, params);
      run = r.run;
      log.probe(r.event, ts);
    }
    expect(run.done).toBe('frustration'); // live: the app also appends placement.completed
    // If only the probes were saved, a later session still offers no further probe.
    log.sessionStarted(T0 + 86_400_000);
    const resumed = resumePlacement(resumeInput(g, k, params), log.events);
    expect(resumed.done).toBe('budget');
    expect(nextProbe(resumed, { graph: g, child: k, params })).toBeNull();
  });

  it('a mini-session ended by frustration resumes on a later day as the live run did', () => {
    const g = wide(10);
    let run = start(g, k);
    const log = new Log();
    log.sessionStarted(T0);
    const rec = (correct: boolean, ts: number, frustrationSignal = false) => {
      const r = answer(run, g, k, correct, { ts, frustrationSignal });
      run = r.run;
      log.probe(r.event, ts);
    };
    rec(false, T0);
    rec(false, T0 + 10_000, true);
    expect(run.session.ended).toBe('frustration');
    log.sessionStarted(T0 + 86_400_000);
    run = beginPlacementSession(run);
    rec(true, T0 + 86_400_000 + 1);
    expect(resumePlacement(resumeInput(g, k), log.events)).toEqual(run);
  });

  it('a retried answer is refused, not counted twice', () => {
    const g = wide(10);
    const run = start(g, k);
    const task = nextProbe(run, { graph: g, child: k });
    if (!task) throw new Error('no probe');
    const submit = (r: PlacementRun) =>
      recordProbe(
        r,
        { graph: g, child: k },
        { ...task, correct: true, skipped: false, latencyMs: 3_000, ts: T0, tier: 'abstract' },
      );
    const once = submit(run);
    expect(() => submit(once.run)).toThrow(/retried or stale/);
    expect(once.run.items).toBe(1);
  });

  it('refuses a skill at its probe cap and a template of another skill', () => {
    const g = wide(3);
    const p1 = withPlacement({ maxProbesPerSkill: 1 });
    let run = start(g, k, { params: p1 });
    const base = {
      correct: false,
      skipped: false,
      latencyMs: 3_000,
      ts: T0,
      tier: 'abstract' as const,
    };
    const seed = () => placementProbeSeed(run.placementId, run.items);
    run = recordProbe(
      run,
      { graph: g, child: k, params: p1 },
      { ...base, skillId: 'CNT.01', templateId: 'CNT.01.t3', seed: seed() },
    ).run;
    expect(() =>
      recordProbe(
        run,
        { graph: g, child: k, params: p1 },
        { ...base, skillId: 'CNT.01', templateId: 'CNT.01.t3', seed: seed() },
      ),
    ).toThrow(/probe cap/);
    expect(() =>
      recordProbe(
        run,
        { graph: g, child: k, params: p1 },
        { ...base, skillId: 'CNT.02', templateId: 'CNT.01.t3', seed: seed() },
      ),
    ).toThrow(/not a template/);
  });

  it('ancestorsWithin returns a copy: mutating it never changes placement', () => {
    const g = chain(3);
    const view = ancestorsWithin(g, 'CNT.03', 3);
    expect(view.map((h) => h.id)).toEqual(['CNT.02', 'CNT.01']);
    view.length = 0;
    expect(ancestorsWithin(g, 'CNT.03', 3)).toHaveLength(2);
    const run = answer(start(g, k), g, k, true, {}).run;
    const fresh = chain(3);
    expect(run.p).toEqual(answer(start(fresh, k), fresh, k, true, {}).run.p);
  });

  it('ignores probes of other placements, other children and other event types', () => {
    const { run, log } = live(MIXED, k, steps.slice(0, 3));
    const noise = log.events.flatMap((e, i) => [
      { ...e, id: `${e.id}-a`, payload: { ...(e.payload as object), placementId: 'pl-2' } },
      { ...e, id: `${e.id}-b`, childId: '019a0000-0000-7000-8000-00000000c002' },
      envelope(500 + i, 'attempt', {}, e.ts),
    ]) as AnyEventEnvelope[];
    expect(resumePlacement(resumeInput(MIXED, k), [...log.events, ...noise])).toEqual(run);
  });

  it('foldLearnerState consumes the probe and completed events and marks assumed skills', () => {
    const allRight: Step[] = Array.from({ length: 40 }, () => ({
      correct: true,
      skipped: false,
      latencyMs: 3_000,
      gapMs: 10_000,
      newSession: false,
      frustrationSignal: false,
    }));
    const { run, log: recorded, ts: lastTs } = live(MIXED, k, allRight);
    expect(run.done).toBe('converged');
    const out = completePlacement(run);
    expect(out.assumed.length).toBeGreaterThan(0);
    const log = [...recorded.events];
    const midway = foldLearnerState(log, MIXED, { childId: CHILD_ID, isK: true });
    expect(midway.placement.inProgress).toBe('pl-1');
    log.push(envelope(999, 'placement.completed', out, lastTs + 1));
    const state = foldLearnerState(log, MIXED, { childId: CHILD_ID, isK: true });
    expect(state.placement.inProgress).toBeNull();
    expect(state.placement.prior?.p).toEqual(out.posterior);
    expect(state.placement.prior?.assumed).toEqual(out.assumed);
    for (const s of out.assumed) {
      expect(state.skills[s]?.assumed).toBe(true);
      expect(state.skills[s]?.practicedAt).toBe(lastTs + 1);
    }
    // A later mini-placement treats them as on track.
    const mini = startPlacement({
      graph: MIXED,
      child: k,
      state,
      placementId: 'pl-3',
      strand: 'CNT',
    });
    expect(mini.onTrack).toEqual(out.assumed.filter((s) => s.startsWith('CNT.')));
  });
});

// ---------- the zero-probe placement (the grade prior, written before any probe) ----------

describe('gradePriorPlacement', () => {
  const g1 = child('1');
  const fold = (events: AnyEventEnvelope[]) =>
    foldLearnerState(events, MIXED, { childId: CHILD_ID, isK: false });
  const priorOf = (c: ChildContext, state: LearnerState, placementId = 'gp') =>
    gradePriorPlacement({ graph: MIXED, child: c, state, placementId });

  it('is the runner before any probe: the §5 grade prior of every skill, no items', () => {
    const state = emptyState(MIXED, false);
    const out = priorOf(g1, state);
    expect(out).toMatchObject({ placementId: 'gp', strand: null, items: 0, reason: 'budget' });
    expect(out.posterior).toEqual(start(MIXED, g1, { state }).p);
    for (const [s, p] of Object.entries(out.posterior))
      expect(p).toBe(gradePrior(MIXED.skills[s]?.grade ?? 'K', g1));
    // Grade 1: every K skill is assumed (0.85), grade 1 is 0.5, grade 2 is 0.25.
    const kSkills = Object.keys(MIXED.skills).filter((s) => MIXED.skills[s]?.grade === 'K');
    expect(out.assumed).toEqual(kSkills.sort());
    expect(eventSchemas['placement.completed'].safeParse(out).success).toBe(true);
  });

  it('two devices writing it fold to the same state as one', () => {
    const out = priorOf(g1, emptyState(MIXED, false));
    const once = fold([envelope(1, 'placement.completed', out, T0)]);
    const twice = fold([
      envelope(1, 'placement.completed', out, T0),
      envelope(2, 'placement.completed', out, T0 + 5_000),
    ]);
    expect(twice).toEqual(once);
    expect(once.skills['CNT.01']).toMatchObject({ assumed: true, practicedAt: T0 });
  });

  it('a copy written offline after a failed verification does not undo the demotion', () => {
    const out = priorOf(g1, emptyState(MIXED, false));
    const DAY = 86_400_000;
    const failed = attempt('CNT.02', 1, { correct: false, context: 'review' });
    const log = [
      envelope(1, 'placement.completed', out, T0),
      envelope(2, 'attempt', failed, T0 + 2.1 * DAY),
    ];
    const demoted = fold(log);
    expect(demoted.skills['CNT.02']?.assumed).toBe(false);
    // Device B, offline since before the review, writes its own copy of the same prior later.
    const merged = fold([...log, envelope(3, 'placement.completed', out, T0 + 2.2 * DAY)]);
    expect(merged.skills).toEqual(demoted.skills);
  });

  it('after a changed grade, moves only the skills without attempts', () => {
    const log = [
      envelope(1, 'placement.completed', priorOf(g1, emptyState(MIXED, false), 'gp-1'), T0),
      envelope(2, 'attempt', attempt('CNT.04', 1), T0 + 1_000),
      envelope(3, 'attempt', attempt('CNT.04', 2, { correct: false }), T0 + 2_000),
    ];
    const before = fold(log);
    const next = priorOf(child('2'), before, 'gp-2');
    // The attempted skill and the skills already on the track are left out.
    expect(next.posterior).toEqual({ 'ADD.02': 0.85, 'ADD.03': 0.5, 'CPS.02': 0.85 });
    expect(next.assumed).toEqual(['ADD.02', 'CPS.02']);
    const after = fold([...log, envelope(4, 'placement.completed', next, T0 + 3_000)]);
    expect(after.skills['CNT.04']).toEqual(before.skills['CNT.04']);
    expect(after.placement.prior?.p['CNT.04']).toBe(before.placement.prior?.p['CNT.04']);
    expect(after.placement.prior?.p['ADD.03']).toBe(0.5);
    expect(after.skills['ADD.02']).toMatchObject({ assumed: true, practicedAt: T0 + 3_000 });
  });

  it('a measured initial placement written later supersedes it', () => {
    const prior = priorOf(g1, emptyState(MIXED, false));
    const measured = {
      ...prior,
      placementId: 'pl',
      items: 9,
      reason: 'converged' as const,
      posterior: { ...prior.posterior, 'ADD.03': 0.7 },
    };
    const state = fold([
      envelope(1, 'placement.completed', prior, T0),
      envelope(2, 'placement.completed', measured, T0 + 1_000),
    ]);
    expect(state.placement.prior?.p['ADD.03']).toBe(0.7);
  });
});
