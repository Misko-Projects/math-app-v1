import type {
  ChildContext,
  IslandState,
  ItemTemplate,
  LearnerState,
  PlannedRequest,
  PlanSessionInput,
  RatedAttempt,
  SessionPlan,
  Skill,
  SkillGraph,
  SkillState,
  WorkshopCapability,
} from '@number-island/shared';
import {
  defaultChildSettings,
  ITEM_FORMATS,
  planSessionInputSchema,
  sessionPlanSchema,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { isConstructedTemplate } from '../items/answer-kind';
import { createEloFireModel } from '../learner/elo-fire';
import {
  A,
  B,
  C,
  day,
  F,
  N,
  attempt as synthAttempt,
  syntheticGraph,
} from '../learner/synthetic.test-support';
import { DAY_MS, PARAMS } from '../params';
import { neededTemplates, type PlanOptions, planSession, rankNewSkills } from './plan';
import { targetDifficulty } from './target';
import { PRACTICE_PIER, PUZZLE_TOWER, RHYTHM_ORCHARD } from './workshops';

const CHILD = '019a0000-0000-7000-8000-00000000c001';
const graph = syntheticGraph();
const NOW = day(10);

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

const island = (residents: string[] = []): IslandState => ({
  name: null,
  ringsUnlocked: 1,
  roadLength: 0,
  buildings: {},
  decor: {},
  residents: Object.fromEntries(residents.map((r) => [r, { arrivedTs: 0, homeInstanceId: null }])),
  projects: {},
  festival: { active: null, completed: 0, daysOfPlaySinceLast: 0 },
  giftsPending: [],
  milestones: {},
});

const cap = (
  workshopId: string,
  formats: WorkshopCapability['formats'],
  over: Partial<WorkshopCapability> = {},
): WorkshopCapability => ({
  workshopId,
  formats,
  strands: [],
  available: true,
  residents: [],
  produces: [],
  ...over,
});

// 05 §4 W1–W3 (fixture residents), W12, and a hall that hosts every synthetic format.
const ROAD = cap('road-crew', ['hundred-chart', 'number-line-jump', 'tap-count', 'order'], {
  strands: ['CNT', 'CMP'],
  residents: ['nib'],
  produces: ['stone'],
});
const GROVE = cap('lantern-grove', ['dot-flash', 'tap-count', 'make-set', 'numeral-pick'], {
  strands: ['SUB', 'CNT'],
  residents: ['tuck'],
  produces: ['light'],
});
const DOCK = cap('ten-boat-dock', ['tenframe-fill', 'number-bond', 'rekenrek', 'number-pad'], {
  strands: ['CPS', 'ADD'],
  residents: ['tenley', 'marlo'],
  produces: ['plank'],
});
const ORCHARD = cap(RHYTHM_ORCHARD, ['number-pad', 'numeral-pick'], {
  strands: ['ADD', 'MUL'],
  produces: ['fruit'],
});
const HALL = cap('test-hall', ['tap-count', 'tenframe-fill', 'number-pad', 'number-bond'], {
  strands: ['CNT'],
  residents: ['nib'],
  produces: ['stone', 'light'],
});

const model = createEloFireModel(graph, { childId: CHILD, isK: false });

/** A skill on the practiced track, due at `dueTs`. */
function practiced(theta: number, dueTs: number, over: Partial<SkillState> = {}): SkillState {
  return {
    theta,
    n: 6,
    recent: [],
    assumed: false,
    override: null,
    practicedAt: day(0),
    fluentAt: null,
    masteredAt: null,
    memory: {
      intervalDays: 1,
      lastReviewTs: dueTs - DAY_MS,
      dueTs,
      reps: 0,
      reviewsPassed: [],
      consecutiveFails: 0,
    },
    atRiskDueTs: null,
    misconceptionHits: [],
    ...over,
  };
}

function learning(theta: number): SkillState {
  return { ...practiced(theta, 0), n: 2, practicedAt: null, memory: null };
}

function stateWith(
  skills: Record<string, SkillState>,
  over: Partial<LearnerState> = {},
): LearnerState {
  return { ...model.init(graph, null), skills, ...over };
}

function input(over: Partial<PlanSessionInput> = {}): PlanSessionInput {
  return {
    child: child('2'),
    state: stateWith({}),
    graph,
    now: NOW,
    minutes: 15,
    workshopsAvailable: [ROAD, GROVE, DOCK],
    island: island(['nib']),
    ...over,
  };
}

/** The 04 §4 / §6.3 invariants every plan keeps. */
function checkPlan(plan: SessionPlan): void {
  expect(sessionPlanSchema.safeParse(plan).error?.issues).toBeUndefined();
  expect(plan.requests.length).toBeGreaterThanOrEqual(PARAMS.planner.requestsMin);
  expect(plan.requests.length).toBeLessThanOrEqual(PARAMS.planner.requestsMax);
  for (const r of plan.requests) {
    let run = 0;
    let last: string | null = null;
    for (const t of r.tasks) {
      if (t.mode !== 'item') continue;
      run = t.skillId === last ? run + 1 : 1;
      last = t.skillId;
      expect(run).toBeLessThanOrEqual(PARAMS.planner.maxRun);
    }
  }
}

const itemsOf = (r: PlannedRequest) => r.tasks.filter((t) => t.mode === 'item');
const plan = (i: PlanSessionInput, o?: PlanOptions) => {
  // The synthetic graph's templates have no hint keys, so validate everything but the graph.
  const checked = planSessionInputSchema.omit({ graph: true }).safeParse(i);
  expect(checked.error?.issues).toBeUndefined();
  const p = planSession(i, o);
  checkPlan(p);
  return p;
};

describe('planSession basics', () => {
  it('sets windDownAtMs to now + minutes and is deterministic', () => {
    const i = input({ minutes: 12 });
    const p = plan(i);
    expect(p.windDownAtMs).toBe(NOW + 12 * 60_000);
    expect(planSession(i)).toEqual(p);
    const ids = p.requests.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of p.requests) expect(r.id).toMatch(new RegExp(`^[0-9a-f]{8}-${NOW}-r\\d$`));
    // A different time gives different seeds.
    expect(planSession({ ...i, now: NOW + 1 }).warmup.seed).not.toBe(p.warmup.seed);
  });

  it('sizes requests to the minutes left within the column range', () => {
    const s = stateWith({
      [A]: practiced(2, NOW - 1),
      [B]: practiced(2, NOW - 1),
      [C]: learning(0),
      [N]: practiced(2, NOW - 1),
    });
    // G2: 180 s / 20 = 9 items; G1 (K column): 180 / 25 = 7.2 → 7; 1 minute → the minimum.
    // A lesson task uses lessonItemCost items of the budget.
    const size = (r: PlannedRequest) =>
      itemsOf(r).length +
      r.tasks.filter((t) => t.mode === 'lesson').length * PARAMS.planner.lessonItemCost;
    const g2 = plan(input({ state: s, workshopsAvailable: [HALL] }));
    expect(g2.requests.some((r) => r.tasks.some((t) => t.mode === 'lesson'))).toBe(true);
    for (const r of g2.requests) expect(size(r)).toBe(9);
    const g1 = plan(input({ state: s, child: child('1'), workshopsAvailable: [HALL] }));
    for (const r of g1.requests) expect(size(r)).toBe(7);
    const short = plan(input({ state: s, minutes: 1, workshopsAvailable: [HALL] }));
    for (const r of short.requests) expect(size(r)).toBe(6);
  });
});

describe('new-skill choice (04 §6.2)', () => {
  it('scores strand balance, unlock value, gateway and in-progress, in-progress first', () => {
    const s = stateWith({
      [A]: practiced(2, NOW + DAY_MS, {
        recent: [
          {
            ts: NOW - 3.5 * DAY_MS,
            sessionId: 's1',
            correct: true,
            hinted: false,
            format: 'tap-count',
            tier: 'concrete',
            representation: 'objects',
            latencyMs: 3_000,
            context: 'practice',
          },
        ],
      }),
      [N]: learning(0),
    });
    const ranked = rankNewSkills({ child: child('2'), state: s, graph, now: NOW });
    // Frontier: B (gateway, descendants2 1), ADD.01 (strand never practiced), N (in progress).
    // CNT strand balance = 3.5 / 7 = 0.5; unlockValue = d2 / max(1).
    expect(ranked).toEqual([
      { skillId: N, score: 0.5 + 2, inProgress: true },
      { skillId: B, score: 0.5 + 1.5 + 1, inProgress: false },
      { skillId: F, score: 1, inProgress: false },
    ]);
    // K takes the top 2 (N, B): no request focuses ADD.01 as a new skill.
    const k = plan(input({ state: s, child: child('K'), workshopsAvailable: [HALL] }));
    const focusSkills = new Set(k.requests.map((r) => itemsOf(r)[0]?.skillId));
    expect(focusSkills.has(F)).toBe(false);
  });
});

describe('warmup (04 §6.1)', () => {
  it('picks the on-track skill with the highest P(ref) ≥ 0.95, else the highest on-track one', () => {
    const s = stateWith({ [A]: practiced(3, NOW + DAY_MS), [N]: practiced(4, NOW + DAY_MS) });
    const p = plan(input({ state: s }));
    expect(p.warmup).toMatchObject({ skillId: N, context: 'warmup', mode: 'item' });
    const low = stateWith({ [A]: practiced(1, NOW + DAY_MS), [N]: practiced(0.5, NOW + DAY_MS) });
    expect(plan(input({ state: low })).warmup.skillId).toBe(A);
  });

  it('(c) takes an already attempted frontier skill, preferring hosted, non-concrete, constructed templates', () => {
    const s = stateWith({ [A]: learning(0) });
    const p = plan(input({ state: s, workshopsAvailable: [ROAD] }));
    // Nothing on track: A is learning. Road Crew hosts only its tap-count template.
    expect(p.warmup).toMatchObject({
      skillId: A,
      templateId: `${A}.t1`,
      context: 'warmup',
      mode: 'item',
    });
    const q = plan(input({ state: s, workshopsAvailable: [DOCK] }));
    expect(q.warmup.templateId).toBe(`${A}.t2`); // pictorial ten-frame, hosted
  });

  it('(d) takes a ready skill whose lesson mode is none before touching a lesson skill', () => {
    // N (lesson mode none) without prerequisites: ready next to the ready root A.
    const g: SkillGraph = { ...graph, prereqs: { ...graph.prereqs, [N]: [] } };
    const p = plan(input({ graph: g, workshopsAvailable: [HALL] }));
    expect(p.warmup).toMatchObject({ skillId: N, context: 'warmup', mode: 'item' });
    const lessonA = p.requests.some((r) =>
      r.tasks.some((t) => t.mode === 'lesson' && t.skillId === A),
    );
    expect(lessonA).toBe(true);
  });

  it('(e) plays a focus skill lesson as the warmup when nothing is attempted yet', () => {
    // Nothing on track, A ready with a lesson and no test-out offered.
    const p = plan(input({ workshopsAvailable: [ROAD] }));
    expect(p.warmup).toMatchObject({
      skillId: A,
      mode: 'lesson',
      context: 'lesson',
      templateId: graph.skills[A]?.lesson.templateId,
    });
    // The requests then omit A's lesson, so its lesson cost is not charged: they are at least as
    // large as those of a skill without a lesson (an item warmup of A would shorten A's first run).
    for (const r of p.requests) expect(r.tasks.every((t) => t.mode === 'item')).toBe(true);
    const learningA = plan(
      input({ state: stateWith({ [A]: learning(0) }), workshopsAvailable: [ROAD] }),
    );
    p.requests.forEach((r, i) => {
      expect(itemsOf(r).length).toBeGreaterThanOrEqual(
        itemsOf(learningA.requests[i] as PlannedRequest).length,
      );
    });
  });

  it('with nothing attempted, the warmup is a lesson; alternatives keep their own draws', () => {
    // Both roots offered (prior 0.7). The warmup is A's lesson (demonstration only); B's request
    // keeps its own whole draw before its lesson, and A's request keeps A's draw (A stays untouched
    // after a demonstration, so the learner offers that test-out at its first draw item).
    const prior = { p: { [A]: 0.7, [B]: 0.7 }, assumed: [] };
    const s = stateWith({}, { placement: { prior, strandsPlaced: [], inProgress: null } });
    const p = plan(input({ graph: twoRoots(0), state: s, workshopsAvailable: [HALL] }));
    expect(p.warmup).toMatchObject({ skillId: A, mode: 'lesson' });
    expect(drawOf(p, A)).toHaveLength(3);
    expect(drawOf(p, B)).toHaveLength(3);
    // A lesson with rated child steps touches A: A then gets no draw (ordinary practice).
    const q = plan(input({ graph: twoRoots(2), state: s, workshopsAvailable: [HALL] }));
    expect(q.warmup).toMatchObject({ skillId: A, mode: 'lesson' });
    const r = q.requests.find((x) => x.tasks[0]?.skillId === A) as PlannedRequest;
    expect(r.tasks.some((t) => t.mode === 'lesson')).toBe(false);
  });

  it('a rated lesson warmup: a draw only when certain; else a demonstration starts outside the pool', () => {
    // No priors; both roots offered only through P(ref) = 0.751. A's lesson (the warmup) has two
    // rated items, whose worst case lowers θg below the offer, so B gets no draw. B with a rated
    // lesson is planned lesson first, which touches B, so the learner never offers it. B with a
    // demonstration-only lesson stays untouched after it, so the learner may still offer B's
    // test-out: B's practice starts outside the pool, which cancels it.
    const s = stateWith({}, { thetaG: Math.log(0.751 / 0.249) });
    const ratedB = withRatedLesson(twoRoots(2), B, 1);
    const rated = plan(input({ graph: ratedB, state: s, workshopsAvailable: [HALL] }));
    expect(rated.warmup).toMatchObject({ skillId: A, mode: 'lesson' });
    expect(drawOf(rated, B)).toHaveLength(0);
    const demoB = plan(input({ graph: twoRoots(2), state: s, workshopsAvailable: [HALL] }));
    expect(demoB.warmup).toMatchObject({ skillId: A, mode: 'lesson' });
    expect(drawOf(demoB, B)).toHaveLength(0);
    firstItemsOutsidePool(demoB, B, twoRoots(2));
  });

  it('a test-out the learner may still offer without a planned draw is cancelled at once', () => {
    // Review round 6 (#61): θg = logit(0.75) + 0.04, no priors. A's lesson (the warmup) has one
    // scaffolded item; B's is demonstration-only, on B.t3 (number-pad). The only themed workshop
    // hosts number-pad alone: B's practice there would be in the pool. The worst case of A's step
    // ends B's offer, so B gets no draw; a hinted correct answer keeps B offered, and the learner
    // would start the test-out at B's first evidence item. So B's request goes to the Practice
    // Pier, where B's practice starts outside the pool: that first item cancels the test-out.
    const b = graph.skills[B] as Skill;
    const g0 = twoRoots(1);
    const g: SkillGraph = {
      ...g0,
      skills: { ...g0.skills, [B]: { ...b, lesson: { ...b.lesson, templateId: `${B}.t3` } } },
    };
    const s = stateWith({}, { thetaG: Math.log(0.75 / 0.25) + 0.04 });
    const padOnly = cap('pad-works', ['number-pad'], { residents: ['nib'], produces: ['stone'] });
    const p = plan(input({ graph: g, state: s, workshopsAvailable: [padOnly] }));
    expect(p.warmup).toMatchObject({ skillId: A, mode: 'lesson' });
    const r = p.requests.find((x) => x.tasks[0]?.skillId === B) as PlannedRequest;
    expect(r.workshopId).toBe(PRACTICE_PIER);
    expect(drawOf(p, B)).toHaveLength(0);
    const [first] = firstItemsOutsidePool(p, B, g);

    const gModel = createEloFireModel(g, { childId: CHILD, isK: false });
    const n = (templateId: string) => Number(templateId.split('.t')[1]);
    let st = gModel.apply(
      s,
      synthAttempt(A, 1, { context: 'lesson', hintsUsed: 1, partialCredit: 0.5 }),
      NOW,
    );
    expect(gModel.inTestOut(st, B)).toBe(true);
    const t = first as PlannedRequest['tasks'][number];
    st = gModel.apply(st, synthAttempt(B, n(t.templateId), { context: t.context }), NOW + 1);
    expect(gModel.inTestOut(st, B)).toBe(false);
    expect(targetDifficulty(st, B, 'practice', child('1'), g)).not.toBe(0);
  });

  it('keeps the lesson of a queued remediation when its skill is every request focus', () => {
    // Review round 6 (#61): the single ready root A has a queued remediation, so both requests
    // cycle through A. The lesson warmup may be A's, but the remediation request still starts
    // with A's lesson (04 §6.4).
    const p = plan(input({ workshopsAvailable: [HALL] }), {
      remediation: { skillId: A, misconceptionId: 'MC.test' },
    });
    const r0 = p.requests[0] as PlannedRequest;
    expect(r0.narration).toBe('req.idea');
    expect(r0.tasks[0]).toMatchObject({ skillId: A, mode: 'lesson' });
  });

  it('keeps a queued remediation in the first request when another root is offered a test-out', () => {
    // Remediation for A (lesson, req.idea); B qualifies for a test-out. Nothing is attempted.
    const prior = { p: { [B]: 0.7 }, assumed: [] };
    const s = stateWith({}, { placement: { prior, strandsPlaced: [], inProgress: null } });
    const p = plan(input({ graph: twoRoots(0), state: s, workshopsAvailable: [HALL] }), {
      remediation: { skillId: A, misconceptionId: 'MC.test' },
    });
    const r0 = p.requests[0] as PlannedRequest;
    expect(r0.narration).toBe('req.idea');
    expect(r0.tasks[0]).toMatchObject({ skillId: A, mode: 'lesson' });
  });
});

/** Two untouched roots A and B; A's lesson gets `rated` scaffolded (rated) items. */
function twoRoots(rated: number): SkillGraph {
  return withRatedLesson({ ...graph, prereqs: { ...graph.prereqs, [B]: [] } }, A, rated);
}

/** `g` with skill s's lesson given `rated` scaffolded (rated) items; 0 keeps it demonstration-only. */
function withRatedLesson(g: SkillGraph, s: string, rated: number): SkillGraph {
  const k = g.skills[s] as Skill;
  return {
    ...g,
    skills: {
      ...g.skills,
      [s]: { ...k, lesson: { ...k.lesson, scaffolded: { count: rated, hintStart: 1 } } },
    },
  };
}

/** The tasks of skill s before its lesson task in the request it focuses (its planned draw). */
function drawOf(p: SessionPlan, s: string): PlannedRequest['tasks'] {
  const r = p.requests.find((x) => x.tasks[0]?.skillId === s);
  if (!r) return [];
  const at = r.tasks.findIndex((t) => t.mode === 'lesson' && t.skillId === s);
  return r.tasks.slice(0, at < 0 ? r.tasks.length : at).filter((t) => t.skillId === s);
}

/**
 * The first item of skill s in every request that has one, with a check that it lies outside s's
 * test-out pool (the synthetic pool is the abstract t3 and t4), so it cancels any test-out the
 * learner would start.
 */
function firstItemsOutsidePool(p: SessionPlan, s: string, g: SkillGraph = graph) {
  const k = g.skills[s] as Skill;
  const pool = new Set(k.lesson.testOut.templateIds ?? [`${s}.t3`, `${s}.t4`]);
  const firsts = p.requests
    .map((r) => r.tasks.find((t) => t.skillId === s && t.mode === 'item'))
    .filter((t): t is PlannedRequest['tasks'][number] => t !== undefined);
  expect(firsts.length).toBeGreaterThan(0);
  for (const t of firsts) expect(pool.has(t.templateId)).toBe(false);
  return firsts;
}

describe('lessons and test-outs (04 §3, 03 §6.5)', () => {
  it('starts a ready skill with its lesson when no test-out is offered', () => {
    // The warmup goes to the on-track A; the ready B (gateway, a lesson) starts with its lesson. A
    // low θg keeps B's test-out unoffered whatever the warmup's outcome.
    const s = stateWith({ [A]: practiced(2, NOW + DAY_MS) }, { thetaG: -4 });
    const p = plan(input({ state: s, workshopsAvailable: [HALL] }));
    expect(p.warmup.skillId).toBe(A);
    const r = p.requests.find((x) => x.tasks.some((t) => t.skillId === B)) as PlannedRequest;
    expect(r.tasks[0]).toMatchObject({
      skillId: B,
      mode: 'lesson',
      context: 'lesson',
      templateId: graph.skills[B]?.lesson.templateId,
    });
    expect(r.tasks.filter((t) => t.mode === 'lesson')).toHaveLength(1);
  });

  it('offers a test-out from the pool before the lesson at a high placement prior', () => {
    // C is on the practiced track, so the warmup is an item of C and A's test-out stays whole.
    const s = stateWith(
      { [C]: practiced(2, NOW + DAY_MS) },
      {
        placement: { prior: { p: { [A]: 0.7 }, assumed: [] }, strandsPlaced: [], inProgress: null },
      },
    );
    const p = plan(input({ state: s, workshopsAvailable: [HALL] }));
    const r = p.requests[0] as PlannedRequest;
    const lessonAt = r.tasks.findIndex((t) => t.mode === 'lesson');
    const before = r.tasks.slice(0, lessonAt).filter((t) => t.skillId === A);
    expect(before).toHaveLength(3);
    for (const t of before) {
      expect(t).toMatchObject({ mode: 'item', context: 'practice' });
      expect([`${A}.t3`, `${A}.t4`]).toContain(t.templateId); // abstract pool
    }
    expect(new Set(before.map((t) => t.templateId)).size).toBe(2);

    // The warmup does not touch A: folding it and then three clean first attempts on the planned
    // test-out items reaches the practiced track before the lesson.
    expect(p.warmup).toMatchObject({ skillId: C, context: 'warmup', mode: 'item' });
    const n = (templateId: string) => Number(templateId.split('.t')[1]);
    let st = model.apply(s, synthAttempt(C, n(p.warmup.templateId), { context: 'warmup' }), NOW);
    before.forEach((t, k) => {
      const a = synthAttempt(A, n(t.templateId), { context: t.context });
      st = model.apply(st, a, NOW + 1_000 * (k + 1));
    });
    expect(st.skills[A]?.practicedAt).not.toBeNull();

    // With nothing attempted at all, A's (demonstration-only) lesson is the warmup.
    const fresh = stateWith(
      {},
      {
        placement: { prior: { p: { [A]: 0.7 }, assumed: [] }, strandsPlaced: [], inProgress: null },
      },
    );
    const q = plan(input({ state: fresh, workshopsAvailable: [HALL] }));
    expect(q.warmup).toMatchObject({ skillId: A, mode: 'lesson', context: 'lesson' });
  });

  it('plans a test-out only when it stays offered after a wrong warmup (plan and learner agree)', () => {
    // A untouched with no prior: offered only through P(ref) = 0.751, just above 0.75. A wrong
    // warmup on C would lower θg below it. With a rated lesson no draw is planned: A starts with
    // its lesson, which touches A, so the learner never offers the test-out either.
    const s = stateWith({ [C]: practiced(2, NOW + DAY_MS) }, { thetaG: Math.log(0.751 / 0.249) });
    expect(model.pRef(s, A)).toBeGreaterThan(0.75);
    const p = plan(
      input({ graph: withRatedLesson(graph, A, 1), state: s, workshopsAvailable: [HALL] }),
    );
    expect(p.warmup.skillId).toBe(C);
    for (const r of p.requests.filter((x) => x.tasks.some((t) => t.skillId === A))) {
      const first = r.tasks.find((t) => t.skillId === A);
      expect(first?.mode).toBe('lesson');
    }

    // With a demonstration-only lesson A stays untouched, so the learner may still offer the
    // test-out after a right warmup. No draw is planned (it is not certain), so A's practice starts
    // outside the pool; after a right warmup that first item cancels the test-out, and after a
    // wrong one the learner never offers it.
    const d = plan(input({ state: s, workshopsAvailable: [HALL] }));
    expect(drawOf(d, A)).toHaveLength(0);
    const [firstD] = firstItemsOutsidePool(d, A);
    const nD = (templateId: string) => Number(templateId.split('.t')[1]);
    const warm = (correct: boolean) =>
      model.apply(
        s,
        synthAttempt(C, nD(d.warmup.templateId), {
          context: 'warmup',
          correct,
          partialCredit: correct ? 1 : 0,
        }),
        NOW,
      );
    expect(model.inTestOut(warm(true), A)).toBe(true);
    expect(model.inTestOut(warm(false), A)).toBe(false);
    const f = firstD as PlannedRequest['tasks'][number];
    const afterFirst = model.apply(
      warm(true),
      synthAttempt(A, nD(f.templateId), { context: f.context }),
      NOW + 1,
    );
    expect(model.inTestOut(afterFirst, A)).toBe(false);

    // With a robust offer (placement prior 0.7) the draw is planned; after a WRONG warmup the
    // learner still offers it, the draw is asked at d* = 0 and three clean answers earn the skip.
    const prior = { p: { [A]: 0.7 }, assumed: [] };
    const robust = stateWith(
      { [C]: practiced(2, NOW + DAY_MS) },
      { placement: { prior, strandsPlaced: [], inProgress: null } },
    );
    const q = plan(input({ state: robust, workshopsAvailable: [HALL] }));
    const r = q.requests.find((x) => x.tasks[0]?.skillId === A) as PlannedRequest;
    const draw = r.tasks.slice(
      0,
      r.tasks.findIndex((t) => t.mode === 'lesson'),
    );
    const drawA = draw.filter((t) => t.skillId === A);
    expect(drawA).toHaveLength(3);
    const n = (templateId: string) => Number(templateId.split('.t')[1]);
    const c = child('1');
    let st = model.apply(
      robust,
      synthAttempt(C, n(q.warmup.templateId), {
        context: 'warmup',
        correct: false,
        partialCredit: 0,
      }),
      NOW,
    );
    drawA.forEach((t, k) => {
      expect(targetDifficulty(st, A, t.context, c, graph)).toBe(0);
      st = model.apply(st, synthAttempt(A, n(t.templateId), { context: t.context }), NOW + k + 1);
    });
    expect(st.skills[A]?.practicedAt).not.toBeNull();
  });

  it('an uncertain choice-only draw is not planned, and the request still leaves practiced evidence', () => {
    // Review round 7 (#61): A's lesson is demonstration-only, and its test-out pool holds two
    // abstract choice templates. P(ref) starts just below the offer, so only a right C warmup would
    // make the learner offer it: no draw is planned (a draw is planned only when certain). A's
    // practice starts outside the pool with a constructed template, so whatever the warmup's
    // outcome the request records practiced evidence and the learner starts no test-out.
    const a = graph.skills[A] as Skill;
    const base = graph.templates[`${A}.t3`] as ItemTemplate;
    const c1: ItemTemplate = { ...base, id: `${A}.t5`, format: 'numeral-pick' };
    const c2: ItemTemplate = { ...base, id: `${A}.t6`, format: 'compare' };
    const g: SkillGraph = {
      ...graph,
      templates: { ...graph.templates, [c1.id]: c1, [c2.id]: c2 },
      skills: {
        ...graph.skills,
        [A]: {
          ...a,
          templates: [...a.templates, c1.id, c2.id],
          lesson: { ...a.lesson, testOut: { ...a.lesson.testOut, templateIds: [c1.id, c2.id] } },
        },
      },
    };
    const s = stateWith(
      { [C]: practiced(2, NOW + 3 * DAY_MS) },
      { thetaG: Math.log(0.745 / 0.255) },
    );
    const all = cap(
      'all-works',
      ['tap-count', 'tenframe-fill', 'number-pad', 'number-bond', 'numeral-pick', 'compare'],
      {
        residents: ['nib'],
        produces: ['stone'],
      },
    );
    // Short and long K requests, and grade 2 at one minute (review round 5 on #66).
    const cases: [ChildContext['grade'], number][] = [
      ['K', 1],
      ['K', 15],
      ['2', 1],
    ];
    for (const [grade, minutes] of cases) {
      const gModel = createEloFireModel(g, { childId: CHILD, isK: grade === 'K' });
      expect(gModel.inTestOut(s, A)).toBe(false);
      const p = plan(
        input({ child: child(grade), graph: g, state: s, minutes, workshopsAvailable: [all] }),
      );
      expect(p.warmup.skillId).toBe(C);
      const warm = gModel.apply(
        s,
        synthAttempt(C, Number(p.warmup.templateId.split('.t')[1]), {
          context: 'warmup',
          correct: false,
          partialCredit: 0,
        }),
        NOW,
      );
      expect(gModel.inTestOut(warm, A)).toBe(false);
      for (const r of p.requests.filter((x) => x.tasks.some((t) => t.skillId === A))) {
        let st = warm;
        r.tasks
          .filter((t) => t.skillId === A && t.mode === 'item')
          .forEach((t, k) => {
            const tpl = g.templates[t.templateId] as ItemTemplate;
            const choice = !isConstructedTemplate(tpl);
            st = gModel.apply(
              st,
              synthAttempt(A, 3, {
                templateId: tpl.id,
                format: tpl.format,
                context: t.context,
                response: choice ? { kind: 'choice', id: 'opt-1' } : { kind: 'number', value: 1 },
              }),
              NOW + k + 1,
            );
          });
        expect(st.skills[A]?.recent.length ?? 0).toBeGreaterThan(0);
      }
      expect(drawOf(p, A)).toHaveLength(0);
      firstItemsOutsidePool(p, A, g);
    }
  });

  it('a failed review outranks a test-out draw: the Practice Pier fallback never drops it', () => {
    // Review round 5 (#66): a one-minute K plan. A, the sole focus, has an offered three-item
    // test-out (placement prior 0.7); C is the sole practiced skill and failed its review. The only
    // themed workshop hosts tap-count alone: A's lesson and practice and C's review, but not A's
    // abstract draw. Only the Practice Pier could host the draw, and with the lesson cost there is no
    // room for both the draw and C's review. Every alternative must still review C (04 §6.4 rule 3).
    const prior = { p: { [A]: 0.7 }, assumed: [] };
    const before = stateWith(
      { [C]: practiced(1, NOW + 1) },
      { placement: { prior, strandsPlaced: [], inProgress: null } },
    );
    const kModel = createEloFireModel(graph, { childId: CHILD, isK: true });
    const s = kModel.apply(
      before,
      synthAttempt(C, 1, { correct: false, context: 'review', seed: 777 }),
      NOW,
    );
    expect(s.skills[C]?.memory?.consecutiveFails).toBe(1);
    const taps = cap('tap-works', ['tap-count'], { residents: ['nib'], produces: ['stone'] });
    const p = plan(input({ child: child('K'), state: s, minutes: 1, workshopsAvailable: [taps] }));
    for (const r of p.requests) {
      expect(r.tasks.some((t) => t.skillId === C && t.context === 'review')).toBe(true);
    }

    // Review round 6 (#66): the lesson is on A.t3 and the only themed workshop hosts just A's pool
    // formats (number-pad, number-bond), so its practice items would all be in the pool. After the
    // demonstration A is untouched, and the learner would start the test-out on them, with no room
    // to finish it. A request without A's draw therefore starts A's practice outside the pool (the
    // Practice Pier, here), which cancels the test-out; C is still reviewed.
    const a = graph.skills[A] as Skill;
    const g: SkillGraph = {
      ...graph,
      skills: { ...graph.skills, [A]: { ...a, lesson: { ...a.lesson, templateId: `${A}.t3` } } },
    };
    const gModel = createEloFireModel(g, { childId: CHILD, isK: true });
    const pads = cap('pad-works', ['number-pad', 'number-bond'], {
      residents: ['nib'],
      produces: ['stone'],
    });
    const q = plan(
      input({ child: child('K'), graph: g, state: s, minutes: 1, workshopsAvailable: [pads] }),
    );
    const n = (templateId: string) => Number(templateId.split('.t')[1]);
    const pool = new Set(a.lesson.testOut.templateIds ?? [`${A}.t3`, `${A}.t4`]);
    for (const r of q.requests) {
      expect(r.tasks.some((t) => t.skillId === C && t.context === 'review')).toBe(true);
      if (drawOf(q, A).length > 0 && r.tasks[0]?.skillId === A) continue; // a whole draw: a real test-out
      const firstA = r.tasks.find((t) => t.skillId === A && t.mode === 'item');
      if (!firstA) continue;
      expect(pool.has(firstA.templateId)).toBe(false);
      const st = gModel.apply(
        s,
        synthAttempt(A, n(firstA.templateId), { context: firstA.context }),
        NOW,
      );
      expect(gModel.inTestOut(st, A)).toBe(false);
    }
  });

  it('a choice-only skill keeps its passable draw before a rated lesson', () => {
    // Review round 6 (#66): A has only choice-answer templates, a placement prior of 0.7 and one
    // rated lesson step, so its draw is certain (a real test-out whatever the warmup). No
    // constructed follow-up item exists or is needed: the three draw items precede the lesson, and
    // three clean first attempts pass the test-out.
    const a = graph.skills[A] as Skill;
    const base = graph.templates[`${A}.t3`] as ItemTemplate;
    const c1: ItemTemplate = { ...base, id: `${A}.t5`, format: 'numeral-pick' };
    const c2: ItemTemplate = { ...base, id: `${A}.t6`, format: 'compare' };
    const g: SkillGraph = {
      ...graph,
      templates: { ...graph.templates, [c1.id]: c1, [c2.id]: c2 },
      skills: {
        ...graph.skills,
        [A]: {
          ...a,
          templates: [c1.id, c2.id],
          lesson: {
            ...a.lesson,
            templateId: c1.id,
            scaffolded: { count: 1, hintStart: 1 },
            testOut: { ...a.lesson.testOut, templateIds: [c1.id, c2.id] },
          },
        },
      },
    };
    const prior = { p: { [A]: 0.7 }, assumed: [] };
    const s = stateWith(
      { [C]: practiced(2, NOW + 3 * DAY_MS) },
      { placement: { prior, strandsPlaced: [], inProgress: null } },
    );
    const all = cap(
      'all-works',
      ['tap-count', 'tenframe-fill', 'number-pad', 'number-bond', 'numeral-pick', 'compare'],
      { residents: ['nib'], produces: ['stone'] },
    );
    const p = plan(
      input({ child: child('2'), graph: g, state: s, minutes: 1, workshopsAvailable: [all] }),
    );
    expect(p.warmup.skillId).toBe(C);
    const draw = drawOf(p, A);
    expect(draw).toHaveLength(3);
    const gModel = createEloFireModel(g, { childId: CHILD, isK: false });
    let st = s;
    draw.forEach((t, k) => {
      const tpl = g.templates[t.templateId] as ItemTemplate;
      st = gModel.apply(
        st,
        synthAttempt(A, 3, {
          templateId: tpl.id,
          format: tpl.format,
          context: t.context,
          response: { kind: 'choice', id: 'opt-1' },
        }),
        NOW + k + 1,
      );
    });
    expect(st.skills[A]?.practicedAt).not.toBeNull();
  });

  it('a request that cannot cancel a test-out goes to the Practice Pier, keeping both failed reviews', () => {
    // Review round 1 (#71): a three-minute K plan (five item slots after A's lesson). C (number-pad
    // only) and N (number-bond only) both failed their reviews. A is the sole focus; its lesson is
    // demonstration-only on A.t3 and its offer is uncertain, so it gets no draw and its first item
    // must lie outside the pool. Pad-bond hosts both reviews but only A's pool templates; pad-tap
    // hosts a cancelling item (A.t1) and only C's review. Neither may win: the Practice Pier hosts
    // both reviews and the cancelling item.
    const a = graph.skills[A] as Skill;
    const c = graph.skills[C] as Skill;
    const nSkill = graph.skills[N] as Skill;
    const g: SkillGraph = {
      ...graph,
      skills: {
        ...graph.skills,
        [A]: { ...a, lesson: { ...a.lesson, templateId: `${A}.t3` } },
        [C]: { ...c, templates: [`${C}.t3`] },
        [N]: { ...nSkill, templates: [`${N}.t4`] },
      },
    };
    const kModel = createEloFireModel(g, { childId: CHILD, isK: true });
    const before = stateWith(
      { [C]: practiced(1, NOW + 1), [N]: practiced(1, NOW + 1) },
      { thetaG: Math.log(0.751 / 0.249) },
    );
    const s1 = kModel.apply(
      before,
      synthAttempt(C, 3, { correct: false, context: 'review', seed: 11 }),
      NOW,
    );
    // The failed reviews lower θg; it is reset to just above A's offer, so the offer is uncertain.
    const s = {
      ...kModel.apply(s1, synthAttempt(N, 4, { correct: false, context: 'review', seed: 12 }), NOW),
      thetaG: Math.log(0.751 / 0.249),
    };
    expect(kModel.inTestOut(s, A)).toBe(true);
    expect(s.skills[C]?.memory?.consecutiveFails).toBe(1);
    expect(s.skills[N]?.memory?.consecutiveFails).toBe(1);
    const padBond = cap('pad-bond', ['number-pad', 'number-bond'], {
      residents: ['nib'],
      produces: ['stone'],
    });
    const padTap = cap('pad-tap', ['number-pad', 'tap-count'], {
      residents: ['nib'],
      produces: ['stone'],
    });
    const p = plan(
      input({
        child: child('K'),
        graph: g,
        state: s,
        minutes: 3,
        workshopsAvailable: [padBond, padTap],
      }),
    );
    expect(drawOf(p, A)).toHaveLength(0); // the offer is uncertain: no draw
    for (const r of p.requests.filter((x) => x.tasks.some((t) => t.skillId === A))) {
      expect(r.workshopId).toBe(PRACTICE_PIER);
      expect(r.tasks.some((t) => t.skillId === C && t.context === 'review')).toBe(true);
      expect(r.tasks.some((t) => t.skillId === N && t.context === 'review')).toBe(true);
    }
    firstItemsOutsidePool(p, A, g);
  });

  it('a choice template outside the pool cancels the test-out when no constructed one is', () => {
    // Review round 1 (#71): A is a gateway skill with a demonstration-only lesson and an uncertain
    // offer. Its four constructed templates are all in the pool, the first three in one
    // representation, and one choice template lies outside it. After a right warmup the learner
    // offers the test-out; A's first item is the choice template, which cancels it (04 §7a), and a
    // constructed item still follows for practiced evidence.
    const a = graph.skills[A] as Skill;
    const base = graph.templates[`${A}.t3`] as ItemTemplate;
    const t7: ItemTemplate = { ...base, id: `${A}.t7` };
    const t8: ItemTemplate = { ...base, id: `${A}.t8` };
    const t5: ItemTemplate = { ...base, id: `${A}.t5`, format: 'numeral-pick' };
    const pool = [`${A}.t3`, t7.id, t8.id, `${A}.t4`];
    const g: SkillGraph = {
      ...graph,
      templates: { ...graph.templates, [t5.id]: t5, [t7.id]: t7, [t8.id]: t8 },
      skills: {
        ...graph.skills,
        [A]: {
          ...a,
          gateway: true,
          templates: [...pool, t5.id],
          lesson: {
            ...a.lesson,
            templateId: `${A}.t3`,
            testOut: { ...a.lesson.testOut, templateIds: pool },
          },
        },
      },
    };
    const gModel = createEloFireModel(g, { childId: CHILD, isK: false });
    const s = stateWith(
      { [C]: practiced(2, NOW + 3 * DAY_MS) },
      { thetaG: Math.log(0.751 / 0.249) },
    );
    const all = cap(
      'all-works',
      ['tap-count', 'tenframe-fill', 'number-pad', 'number-bond', 'numeral-pick'],
      {
        residents: ['nib'],
        produces: ['stone'],
      },
    );
    const p = plan(input({ graph: g, state: s, workshopsAvailable: [all] }));
    expect(p.warmup.skillId).toBe(C);
    expect(drawOf(p, A)).toHaveLength(0);
    const warm = gModel.apply(
      s,
      synthAttempt(C, Number(p.warmup.templateId.split('.t')[1]), { context: 'warmup' }),
      NOW,
    );
    expect(gModel.inTestOut(warm, A)).toBe(true);
    for (const r of p.requests.filter((x) => x.tasks.some((t) => t.skillId === A))) {
      const items = r.tasks.filter((t) => t.skillId === A && t.mode === 'item');
      const first = items[0] as PlannedRequest['tasks'][number];
      expect(first.templateId).toBe(t5.id);
      const st = gModel.apply(
        warm,
        synthAttempt(A, 3, {
          templateId: t5.id,
          format: t5.format,
          context: first.context,
          response: { kind: 'choice', id: 'opt-1' },
        }),
        NOW + 1,
      );
      expect(gModel.inTestOut(st, A)).toBe(false);
      expect(
        items
          .slice(1)
          .some((t) => isConstructedTemplate(g.templates[t.templateId] as ItemTemplate)),
      ).toBe(true);
    }
  });

  it('after a demonstration-only lesson warmup, the kept draw is a real, passable test-out', () => {
    // Nothing attempted; A's test-out is offered; A's lesson (demo only) is the warmup and records
    // no attempt. A's request keeps its whole draw: each item is asked at d* = 0, three clean
    // answers put A on the practiced track, and A is adaptive afterwards.
    const prior = { p: { [A]: 0.7 }, assumed: [] };
    const fresh = stateWith({}, { placement: { prior, strandsPlaced: [], inProgress: null } });
    const p = plan(input({ state: fresh, workshopsAvailable: [HALL] }));
    expect(p.warmup).toMatchObject({ skillId: A, mode: 'lesson' });
    const n = (templateId: string) => Number(templateId.split('.t')[1]);
    const draw = drawOf(p, A);
    expect(draw).toHaveLength(3);
    let st = fresh;
    for (const t of draw) {
      expect(targetDifficulty(st, A, t.context, child('1'), graph)).toBe(0);
      st = model.apply(st, synthAttempt(A, n(t.templateId), { context: t.context }), NOW);
    }
    expect(st.skills[A]?.practicedAt).not.toBeNull();
    expect(targetDifficulty(st, A, 'practice', child('1'), graph)).not.toBe(0);
  });

  it('a test-out no themed workshop can host as a passable draw goes to the Practice Pier', () => {
    // A's pool is t3 (number-pad) and t4 (number-bond); a workshop hosting only number-pad could
    // only repeat t3, which can never pass the two-template rule. The request goes to the pier.
    const PAD = cap('pad-hut', ['number-pad', 'tap-count'], {
      strands: ['CNT'],
      residents: ['nib'],
    });
    const prior = { p: { [A]: 0.7 }, assumed: [] };
    const s = stateWith(
      { [C]: practiced(2, NOW + DAY_MS) },
      { placement: { prior, strandsPlaced: [], inProgress: null } },
    );
    const p = plan(input({ state: s, workshopsAvailable: [PAD] }));
    const r = p.requests.find((x) => x.tasks[0]?.skillId === A) as PlannedRequest;
    expect(r.workshopId).toBe(PRACTICE_PIER);
    const at = r.tasks.findIndex((t) => t.mode === 'lesson');
    const draw = r.tasks.slice(0, at).filter((t) => t.skillId === A);
    expect(new Set(draw.map((t) => t.templateId)).size).toBe(2);
  });

  it('the warmup item starts the run: warmup plus a request never holds 4 of one skill in a row', () => {
    // A learning focus skill is also the warmup (rule c): its request continues the warmup's run.
    const s = stateWith({ [A]: learning(0) });
    for (const ws of [[HALL], [ROAD], [DOCK]]) {
      const p = plan(input({ state: s, workshopsAvailable: ws }));
      expect(p.warmup).toMatchObject({ skillId: A, mode: 'item' });
      for (const r of p.requests) {
        let run = 1;
        let last: string = p.warmup.skillId;
        for (const t of itemsOf(r)) {
          run = t.skillId === last ? run + 1 : 1;
          last = t.skillId;
          expect(run).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it('never truncates a test-out: the whole draw before the lesson, or the lesson first', () => {
    // K, one workshop, no other eligible skill, and a 4-item test-out: three in a row is the most
    // the run rule allows with nothing to break the run.
    const aSkill = graph.skills[A] as Skill;
    const g: SkillGraph = {
      ...graph,
      skills: {
        ...graph.skills,
        [A]: { ...aSkill, lesson: { ...aSkill.lesson, testOut: { items: 4, minCorrect: 4 } } },
      },
    };
    const s = stateWith(
      {},
      {
        placement: { prior: { p: { [A]: 0.7 }, assumed: [] }, strandsPlaced: [], inProgress: null },
      },
    );
    const p = plan(input({ graph: g, state: s, child: child('K'), workshopsAvailable: [HALL] }));
    const lessonIsWarmup = p.warmup.mode === 'lesson' && p.warmup.skillId === A;
    for (const r of p.requests) {
      const lessonAt = r.tasks.findIndex((t) => t.mode === 'lesson' && t.skillId === A);
      if (lessonIsWarmup) {
        expect(lessonAt).toBe(-1);
        continue;
      }
      if (lessonAt <= 0) continue; // the lesson comes first (or not at all)
      const draw = r.tasks.slice(0, lessonAt).filter((t) => t.skillId === A);
      expect(draw).toHaveLength(4);
      for (const t of draw) expect([`${A}.t3`, `${A}.t4`]).toContain(t.templateId);
    }
  });

  it('gives a lesson-mode none skill no lesson', () => {
    const s = stateWith({ [A]: practiced(2, NOW + DAY_MS) });
    const p = plan(input({ state: s, workshopsAvailable: [HALL] }));
    const nReq = p.requests.filter((r) => r.tasks.some((t) => t.skillId === N));
    expect(nReq.length).toBeGreaterThan(0);
    for (const r of p.requests) {
      expect(r.tasks.some((t) => t.mode === 'lesson' && t.skillId === N)).toBe(false);
    }
  });
});

describe('reviews (04 §4)', () => {
  it('uses compressed due reviews: an encompassed due skill is not reviewed', () => {
    const s = stateWith({
      [A]: practiced(2, NOW + 3 * DAY_MS),
      [B]: practiced(2, NOW - 1),
      [C]: practiced(2, NOW - 1),
    });
    const p = plan(input({ state: s, workshopsAvailable: [HALL] }));
    const reviewed = new Set(
      p.requests.flatMap((r) =>
        r.tasks
          .filter((t) => t.context === 'review' || t.context === 'transfer-probe')
          .map((t) => t.skillId),
      ),
    );
    expect(reviewed).toEqual(new Set([C]));
    // Each request (alternatives) gets the review.
    for (const r of p.requests)
      expect(r.tasks.some((t) => t.skillId === C && t.context === 'review')).toBe(true);
  });

  it('a failed review is due again at once (a failed prerequisite probe gets scheduled)', () => {
    // B is practiced and not due yet; adaptNext probes it in the 'review' context and the child
    // fails it, so its dueTs moves a day ahead, but the next plan (same `now`) still reviews it.
    const before = stateWith({ [A]: practiced(2, NOW + 3 * DAY_MS), [B]: practiced(2, NOW + 1) });
    const s = model.apply(
      before,
      synthAttempt(B, 3, { correct: false, context: 'review', seed: 12345 }),
      NOW,
    );
    expect(s.skills[B]?.memory?.consecutiveFails).toBe(1);
    expect(model.status(s, B, NOW)).toBe('needs-review');
    expect(model.dueReviews(s, NOW).map((r) => r.skillId)).not.toContain(B);
    const p = plan(input({ state: s, workshopsAvailable: [HALL] }));
    expect(
      p.requests.some((r) => r.tasks.some((t) => t.skillId === B && t.context === 'review')),
    ).toBe(true);
    // Without the failure, B is not reviewed.
    const q = plan(input({ state: before, workshopsAvailable: [HALL] }));
    expect(q.requests.some((r) => r.tasks.some((t) => t.context === 'review'))).toBe(false);
  });

  it('review compression never drops a failed review behind an encompassing skill', () => {
    // C (deeper, encompasses B at 0.8) is due; B failed its review. Compression alone would keep
    // C and drop B, but C's implicit credit never clears B's failure, so B is reviewed too.
    const before = stateWith({
      [A]: practiced(2, NOW + 3 * DAY_MS),
      [B]: practiced(2, NOW + 1),
      [C]: practiced(2, NOW - 1),
    });
    const s = model.apply(
      before,
      synthAttempt(B, 3, { correct: false, context: 'review', seed: 12345 }),
      NOW,
    );
    expect(graph.encompasses[C]?.[B]).toBeGreaterThanOrEqual(0.5);
    const p = plan(input({ state: s, workshopsAvailable: [HALL] }));
    const reviewed = (x: string) =>
      p.requests.some((r) => r.tasks.some((t) => t.skillId === x && t.context === 'review'));
    expect(reviewed(B)).toBe(true);
    expect(reviewed(C)).toBe(true);
  });

  it('a scheduled failed review still compresses the ordinary reviews it encompasses', () => {
    // C failed its review and encompasses the ordinary due B at 0.8; A is due on its own (C
    // encompasses it at 0.3, below the threshold). With two review slots, C and A are reviewed: B
    // gets C's implicit credit, as compression would give it.
    const before = stateWith({
      [A]: practiced(2, NOW - 1),
      [B]: practiced(2, NOW - 1),
      [C]: practiced(2, NOW + 1),
    });
    const s = model.apply(
      before,
      synthAttempt(C, 3, { correct: false, context: 'review', seed: 12345 }),
      NOW,
    );
    expect(s.skills[C]?.memory?.consecutiveFails).toBe(1);
    expect(s.skills[B]?.memory?.consecutiveFails).toBe(0);
    expect(graph.encompasses[C]?.[B]).toBeGreaterThanOrEqual(PARAMS.memory.compressionMinWeight);
    expect(graph.encompasses[C]?.[A] ?? 0).toBeLessThan(PARAMS.memory.compressionMinWeight);
    // Grade 1: 7 items a request; round(0.35 × 7) and round(0.35 × (7 − 2)) are both 2 slots.
    const p = plan(input({ child: child('1'), state: s, workshopsAvailable: [HALL] }));
    const focused = p.requests.filter((r) => r.tasks.some((t) => t.context === 'practice'));
    expect(focused.length).toBeGreaterThan(0);
    for (const r of p.requests) {
      const reviewed = new Set(r.tasks.filter((t) => t.context === 'review').map((t) => t.skillId));
      expect(reviewed).toEqual(new Set([C, A]));
    }
  });

  it('a failed review of a fluency skill is reviewed, not made the focus', () => {
    // F (fact-fluency) is practiced, not fluent, and failed its review; every other skill is on
    // the practiced track and not due, so F would be the only focus. A request never reviews its
    // own focus, so F is left out of the focus pool and reviewed through the failed-review path.
    const notDue = NOW + 3 * DAY_MS;
    const before = stateWith({
      [A]: practiced(2, notDue),
      [B]: practiced(2, notDue),
      [C]: practiced(2, notDue),
      [N]: practiced(2, notDue),
      [F]: practiced(1, NOW + 1),
    });
    const s = model.apply(
      before,
      synthAttempt(F, 3, { correct: false, context: 'review', seed: 12345 }),
      NOW,
    );
    expect(s.skills[F]?.fluentAt).toBeNull();
    expect(s.skills[F]?.memory?.consecutiveFails).toBe(1);
    expect(model.status(s, F, NOW)).toBe('needs-review');
    // Without the failure, F is the fluency focus.
    expect(
      rankNewSkills({ child: child('2'), state: before, graph, now: NOW }).map((x) => x.skillId),
    ).toEqual([F]);
    const p = plan(input({ state: s, workshopsAvailable: [HALL, ORCHARD] }));
    expect(
      p.requests.some((r) => r.tasks.some((t) => t.skillId === F && t.context === 'review')),
    ).toBe(true);
    expect(rankNewSkills({ child: child('2'), state: s, graph, now: NOW })).toEqual([]);
  });

  it('a failed review no themed workshop hosts sends the request to the Practice Pier', () => {
    // Review round 4 (#66): F failed its review and has only a number-pad template; N is the sole
    // (learning) focus; the only themed workshop hosts tap-count alone, so it could fill every
    // request with N and the practiced A, B and C without F. The next plan must review F (04 §6.4
    // rule 3), so the requests go to the Practice Pier, which hosts every format.
    const f = graph.skills[F] as Skill;
    const g: SkillGraph = {
      ...graph,
      skills: { ...graph.skills, [F]: { ...f, templates: [`${F}.t3`] } },
    };
    const gModel = createEloFireModel(g, { childId: CHILD, isK: false });
    const notDue = NOW + 3 * DAY_MS;
    const before = stateWith({
      [A]: practiced(2, notDue),
      [B]: practiced(2, notDue),
      [C]: practiced(2, notDue),
      [N]: learning(0),
      [F]: practiced(1, NOW + 1),
    });
    const s = gModel.apply(
      before,
      synthAttempt(F, 3, { correct: false, context: 'review', seed: 12345 }),
      NOW,
    );
    expect(s.skills[F]?.memory?.consecutiveFails).toBe(1);
    const taps = cap('tap-works', ['tap-count'], { residents: ['nib'], produces: ['stone'] });
    const p = plan(input({ graph: g, state: s, workshopsAvailable: [taps] }));
    for (const r of p.requests) {
      expect(r.tasks.some((t) => t.skillId === F && t.context === 'review')).toBe(true);
      expect(r.workshopId).toBe(PRACTICE_PIER);
    }
  });
});

describe('hosting and the Practice Pier (04 §6.3)', () => {
  it('binds each task to formats the workshop hosts', () => {
    const s = stateWith({ [A]: practiced(2, NOW - 1), [N]: learning(0) });
    const caps = [ROAD, GROVE, DOCK];
    const p = plan(input({ state: s, workshopsAvailable: caps }));
    for (const r of p.requests) {
      const c = caps.find((x) => x.workshopId === r.workshopId);
      if (r.workshopId === PRACTICE_PIER) continue;
      expect(c?.available).toBe(true);
      for (const t of r.tasks) {
        const format = graph.templates[t.templateId]?.format;
        expect(c?.formats).toContain(format);
      }
    }
  });

  it('falls back to a synthesised pier when no workshop hosts the formats', () => {
    const market = cap('market', ['coin-pay'], { residents: ['marlo'], produces: ['coins'] });
    const p = plan(input({ workshopsAvailable: [market], island: island([]) }));
    for (const r of p.requests) {
      expect(r.workshopId).toBe(PRACTICE_PIER);
      expect(r.residentId).toBe('marlo');
      expect(r.reward.materials).toEqual({ coins: itemsOf(r).length });
      expect(r.vars).toEqual({ who: 'marlo', count: itemsOf(r).length, material: 'coins' });
    }
  });

  it('uses the input pier capability, an island resident, else Pip', () => {
    const unavailable = cap('road-crew', ['tap-count'], { available: false, residents: ['nib'] });
    const withPier = plan(
      input({ workshopsAvailable: [cap(PRACTICE_PIER, ['tap-count'], { residents: ['pebble'] })] }),
    );
    for (const r of withPier.requests) {
      expect(r.workshopId).toBe(PRACTICE_PIER);
      expect(r.residentId).toBe('pebble');
      expect(r.reward.materials).toEqual({});
    }
    const fromIsland = plan(input({ workshopsAvailable: [unavailable], island: island(['tuck']) }));
    expect(fromIsland.requests.map((r) => r.residentId)).toEqual(['tuck', 'tuck']);
    const anyCap = plan(input({ workshopsAvailable: [unavailable], island: island([]) }));
    expect(anyCap.requests[0]?.residentId).toBe('nib');
    const none = plan(input({ workshopsAvailable: [], island: island([]) }));
    expect(none.requests.map((r) => r.residentId)).toEqual(['pip', 'pip']);
    // The synthesised pier hosts every format.
    expect(ITEM_FORMATS.length).toBeGreaterThan(30);
  });

  it('never binds a request to an unavailable workshop', () => {
    const off = { ...HALL, available: false };
    const p = plan(input({ workshopsAvailable: [off] }));
    for (const r of p.requests) expect(r.workshopId).toBe(PRACTICE_PIER);
  });

  it('routes a practiced, not fluent fact-fluency skill to Rhythm Orchard', () => {
    const s = stateWith({
      [A]: practiced(2, NOW + DAY_MS),
      [F]: practiced(1, NOW + DAY_MS),
    });
    const ranked = rankNewSkills({ child: child('2'), state: s, graph, now: NOW });
    expect(ranked.map((x) => x.skillId)).toContain(F);
    const p = plan(input({ state: s, workshopsAvailable: [ROAD, GROVE, DOCK, ORCHARD] }));
    const fluency = p.requests.filter((r) => itemsOf(r).filter((t) => t.skillId === F).length >= 3);
    expect(fluency.length).toBeGreaterThan(0);
    for (const r of fluency) {
      expect(r.workshopId).toBe(RHYTHM_ORCHARD);
      expect(r.tasks.every((t) => t.mode === 'item')).toBe(true);
    }
  });
});

describe('rewards (04 §6.3)', () => {
  const s = stateWith({
    [A]: practiced(3, NOW - 1),
    [B]: practiced(3, NOW + DAY_MS),
    [N]: learning(0),
  });

  it('alternates two products, one per item', () => {
    const p = plan(input({ state: s, workshopsAvailable: [HALL] }));
    for (const r of p.requests) {
      const n = itemsOf(r).length;
      expect(r.workshopId).toBe('test-hall');
      expect(r.reward.materials).toEqual({ stone: Math.ceil(n / 2), light: Math.floor(n / 2) });
      expect(r.vars.material).toBe('stone');
    }
  });

  it('adds puzzle decor to requests with challenge items', () => {
    const p = plan(input({ state: s, workshopsAvailable: [HALL] }), {
      puzzleDecor: ['star-shard-b', 'star-shard-a'],
    });
    const withChallenge = p.requests.filter((r) => r.tasks.some((t) => t.context === 'challenge'));
    expect(withChallenge.length).toBeGreaterThan(0);
    for (const r of p.requests) {
      const challenge = r.tasks.some((t) => t.context === 'challenge');
      if (challenge) {
        expect(r.reward.decor).toHaveLength(1);
        expect(['star-shard-a', 'star-shard-b']).toContain(r.reward.decor?.[0]);
        // Challenge items come late (in the second half; earlier only to break a run).
        const items = itemsOf(r);
        const first = items.findIndex((t) => t.context === 'challenge');
        expect(first).toBeGreaterThanOrEqual(Math.floor(items.length / 2));
      } else expect(r.reward.decor).toBeUndefined();
    }
    // Without puzzle decor there is none.
    const q = plan(input({ state: s, workshopsAvailable: [HALL] }));
    for (const r of q.requests) expect(r.reward.decor).toBeUndefined();
  });

  it('gives Puzzle Tower requests no materials, only decor', () => {
    const tower = cap(PUZZLE_TOWER, ['tap-count', 'tenframe-fill', 'number-pad', 'number-bond'], {
      residents: ['nib'],
    });
    const p = plan(input({ state: s, workshopsAvailable: [tower] }), {
      puzzleDecor: ['star-shard'],
    });
    for (const r of p.requests) {
      expect(r.workshopId).toBe(PUZZLE_TOWER);
      expect(r.reward.materials).toEqual({});
      expect(r.reward.decor).toEqual(['star-shard']);
      expect(r.vars.material).toBe('');
    }
  });
});

describe('remediation (04 §6.4 rule 5)', () => {
  it('makes the first request the remediation skill lesson, then its practice with reviews', () => {
    const s = stateWith({
      [A]: practiced(2, NOW + DAY_MS),
      [B]: practiced(2, NOW - 1),
      [N]: learning(0),
    });
    const p = plan(input({ state: s, workshopsAvailable: [HALL] }), {
      remediation: { skillId: A, misconceptionId: 'MC.off-by-one-counting' },
    });
    const r = p.requests[0] as PlannedRequest;
    expect(r.narration).toBe('req.idea');
    expect(r.tasks[0]).toMatchObject({
      skillId: A,
      mode: 'lesson',
      context: 'lesson',
      templateId: graph.skills[A]?.lesson.templateId,
    });
    const items = itemsOf(r);
    expect(
      items.filter((t) => t.skillId === A && t.context === 'practice').length,
    ).toBeGreaterThanOrEqual(3);
    expect(items.some((t) => t.context === 'review')).toBe(true);
    expect(itemsOf(r).length + PARAMS.planner.lessonItemCost).toBe(9);
    for (const other of p.requests.slice(1)) expect(other.narration).toBe('req.help');
    // An unknown remediation skill is ignored.
    const q = plan(input({ state: s, workshopsAvailable: [HALL] }), {
      remediation: { skillId: 'CNT.99', misconceptionId: 'MC.off-by-one-counting' },
    });
    expect(q.requests.every((x) => x.narration === 'req.help')).toBe(true);
  });

  it('plans the lesson of a remediation skill that is still learning', () => {
    const s = stateWith({ [A]: practiced(2, NOW + DAY_MS), [B]: learning(0) });
    const p = plan(input({ state: s, workshopsAvailable: [HALL] }), {
      remediation: { skillId: B, misconceptionId: 'MC.off-by-one-counting' },
    });
    expect(p.requests[0]?.tasks[0]).toMatchObject({ skillId: B, mode: 'lesson' });
  });
});

describe('evidence templates and needed variety (04 §3, §6.3, §7a)', () => {
  const attempt = (n: number): RatedAttempt => {
    const t = graph.templates[`${B}.t${n}`] as ItemTemplate;
    return {
      ts: day(9),
      sessionId: 's1',
      correct: true,
      hinted: false,
      format: t.format,
      tier: t.tier,
      representation: t.representation ?? 'symbols',
      latencyMs: 3_000,
      context: 'practice',
    };
  };
  /** The synthetic graph with N's templates set to `ids` (t5 is a choice-only numeral-pick). */
  const withN = (ids: string[]): SkillGraph => {
    const t5: ItemTemplate = {
      ...(graph.templates[`${N}.t2`] as ItemTemplate),
      id: `${N}.t5`,
      format: 'numeral-pick',
      representation: 'dots',
    };
    const nSkill = graph.skills[N] as Skill;
    return {
      ...graph,
      templates: { ...graph.templates, [t5.id]: t5 },
      skills: { ...graph.skills, [N]: { ...nSkill, templates: ids } },
    };
  };
  const PICK = cap('pick-hall', ['numeral-pick'], { strands: ['CNT'], produces: ['light'] });
  const COUNTER = cap('count-hall', ['tap-count'], { strands: ['CNT'], produces: ['stone'] });
  const onTrackA = { [A]: practiced(2, NOW + DAY_MS) };

  it('lists the templates a skill still needs for its practiced rule', () => {
    // Standard: tap-count/concrete correct → every template adding a format or a tier.
    const a = stateWith({ [A]: { ...learning(0), recent: [attempt(1)] } });
    expect(neededTemplates(graph, a, A).map((t) => t.id)).toEqual([
      `${A}.t2`,
      `${A}.t3`,
      `${A}.t4`,
    ]);
    // Gateway: objects and ten-frame correct, no abstract → the abstract representations.
    const b = stateWith({ ...onTrackA, [B]: { ...learning(0), recent: [attempt(1), attempt(2)] } });
    expect(neededTemplates(graph, b, B).map((t) => t.id)).toEqual([`${B}.t3`, `${B}.t4`]);
    // Hinted or wrong entries are not evidence; the practiced track needs nothing.
    const c = stateWith({
      [B]: {
        ...learning(0),
        recent: [
          { ...attempt(3), hinted: true },
          { ...attempt(4), correct: false },
        ],
      },
    });
    expect(neededTemplates(graph, c, B)).toHaveLength(4);
    expect(neededTemplates(graph, stateWith({ [B]: practiced(2, NOW) }), B)).toEqual([]);
    // Choice-only templates are never needed.
    const g = withN([`${N}.t1`, `${N}.t5`]);
    expect(neededTemplates(g, stateWith({}), N).map((t) => t.id)).toEqual([`${N}.t1`]);
  });

  it('practises with evidence templates only, at a workshop hosting one', () => {
    const g = withN([`${N}.t1`, `${N}.t5`]);
    const s = stateWith({ ...onTrackA, [N]: learning(0) });
    const p = plan(input({ graph: g, state: s, workshopsAvailable: [PICK, COUNTER] }));
    const nItems = p.requests.flatMap((r) => itemsOf(r).filter((t) => t.skillId === N));
    expect(nItems.length).toBeGreaterThan(0);
    for (const t of nItems) expect(t.templateId).toBe(`${N}.t1`);
    for (const r of p.requests) {
      if (itemsOf(r).some((t) => t.skillId === N)) expect(r.workshopId).not.toBe('pick-hall');
    }
  });

  it('uses choice-only templates when a skill has nothing else', () => {
    const g = withN([`${N}.t5`]);
    const s = stateWith({ ...onTrackA, [N]: learning(0) });
    const p = plan(input({ graph: g, state: s, workshopsAvailable: [PICK, COUNTER] }));
    const nItems = p.requests.flatMap((r) => itemsOf(r).filter((t) => t.skillId === N));
    expect(nItems.length).toBeGreaterThan(0);
    for (const t of nItems) expect(t.templateId).toBe(`${N}.t5`);
  });

  it('ranks a workshop hosting a needed template first, above strand affinity', () => {
    const ABSTRACT = cap('abstract-hall', ['number-pad'], { produces: ['plank'] });
    const s = stateWith({
      ...onTrackA,
      [B]: { ...learning(0), recent: [attempt(1), attempt(2), attempt(1)] },
    });
    const p = plan(input({ state: s, workshopsAvailable: [COUNTER, ABSTRACT] }));
    const r = p.requests[0] as PlannedRequest;
    expect(r.workshopId).toBe('abstract-hall');
    const bItems = itemsOf(r).filter((t) => t.skillId === B);
    expect(bItems.length).toBeGreaterThan(0);
    for (const t of bItems) expect(t.templateId).toBe(`${B}.t3`);
  });

  it('falls back to the Practice Pier when no themed workshop hosts a needed template', () => {
    const s = stateWith({
      ...onTrackA,
      [B]: { ...learning(0), recent: [attempt(1), attempt(2), attempt(1)] },
    });
    const p = plan(input({ state: s, workshopsAvailable: [COUNTER] }));
    const r = p.requests[0] as PlannedRequest;
    expect(r.workshopId).toBe(PRACTICE_PIER);
    const abstract = itemsOf(r).filter(
      (t) => t.skillId === B && graph.templates[t.templateId]?.tier === 'abstract',
    );
    expect(abstract.length).toBeGreaterThan(0);
    // With every representation and the abstract tier in `recent`, nothing is needed any more.
    const done = stateWith({
      ...onTrackA,
      [B]: { ...learning(0), recent: [attempt(1), attempt(2), attempt(3), attempt(4)] },
    });
    expect(
      plan(input({ state: done, workshopsAvailable: [COUNTER] })).requests[0]?.workshopId,
    ).toBe('count-hall');
  });
});
