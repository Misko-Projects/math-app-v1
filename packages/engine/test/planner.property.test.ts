// 04 §8 planner properties over the compiled fixture graph: request counts, item budgets, the
// no-more-than-3-in-a-row rule, hosting, rewards, determinism and schema validity, for random
// children, budgets, learner states and workshop sets.

import type {
  AttemptPayload,
  ChildContext,
  Grade,
  IslandState,
  LearnerState,
  PlannedRequest,
  PlanSessionInput,
  SkillId,
  WorkshopCapability,
} from '@number-island/shared';
import { defaultChildSettings, sessionPlanSchema } from '@number-island/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEloFireModel } from '../src/learner/elo-fire';
import { DAY_MS, PARAMS } from '../src/params';
import { PRACTICE_PIER, planSession } from '../src/planner';
import { createRng } from '../src/rng';
import { fixtureGraph, loadFixture } from './fixture';
import { attemptFor, CHILD_1 } from './support/events';

loadFixture();
const graph = fixtureGraph();
const T0 = Date.UTC(2026, 10, 2, 16);
const P = PARAMS.planner;

// 05 §4 W1–W3 with the fixture residents (packages/content/game/fixture.yaml affinities).
const WORKSHOPS: WorkshopCapability[] = [
  {
    workshopId: 'road-crew',
    formats: ['hundred-chart', 'number-line-jump', 'tap-count', 'order'],
    strands: ['CNT', 'CMP'],
    available: true,
    residents: ['nib'],
    produces: ['stone'],
  },
  {
    workshopId: 'lantern-grove',
    formats: ['dot-flash', 'tap-count', 'make-set', 'numeral-pick'],
    strands: ['SUB', 'CNT'],
    available: true,
    residents: ['tuck'],
    produces: ['light'],
  },
  {
    workshopId: 'ten-boat-dock',
    formats: ['tenframe-fill', 'number-bond', 'rekenrek', 'number-pad'],
    strands: ['CPS', 'ADD'],
    available: true,
    residents: ['marlo', 'tenley'],
    produces: ['plank'],
  },
];
const PIER: WorkshopCapability = {
  workshopId: PRACTICE_PIER,
  formats: [],
  strands: [],
  available: true,
  residents: [],
  produces: [],
};

function island(residents: string[]): IslandState {
  return {
    name: null,
    ringsUnlocked: 1,
    roadLength: 0,
    buildings: {},
    decor: {},
    residents: Object.fromEntries(
      residents.map((r) => [r, { arrivedTs: T0, homeInstanceId: null }]),
    ),
    projects: {},
    festival: { active: null, completed: 0, daysOfPlaySinceLast: 0 },
    giftsPending: [],
    milestones: {},
  };
}

function child(grade: Grade): ChildContext {
  return {
    childId: CHILD_1,
    grade,
    ageBand: '5-6',
    advanced: false,
    isK: grade === 'K',
    settings: defaultChildSettings(grade),
  };
}

const CONTEXTS: AttemptPayload['context'][] = [
  'practice',
  'practice',
  'practice',
  'review',
  'lesson',
  'warmup',
  'challenge',
];

/** A learner state: a random placement, then random attempts applied with the model. */
function randomState(seed: number, size: number, days: number, priors: number, isK: boolean) {
  const rng = createRng(seed);
  const model = createEloFireModel(graph, { childId: CHILD_1, isK });
  let state: LearnerState = model.init(graph, null);
  if (priors > 0) {
    const posterior: Record<SkillId, number> = {};
    for (const s of rng.shuffle(graph.nodes).slice(0, priors)) posterior[s] = rng.float();
    const assumed = Object.keys(posterior)
      .filter((s) => (posterior[s] as number) >= 0.85)
      .sort();
    state = model.applyPlacement(
      state,
      { placementId: 'p1', strand: null, posterior, assumed, items: priors, reason: 'converged' },
      T0,
    );
  }
  let ts = T0;
  for (let i = 0; i < size; i++) {
    ts += rng.int(1, Math.max(1, Math.round((days * DAY_MS) / Math.max(1, size))));
    const frontier = model.frontier(state);
    const skillId =
      frontier.length > 0 && rng.bool(0.7) ? rng.pick(frontier) : rng.pick(graph.nodes);
    const templateId = rng.pick(graph.skills[skillId]?.templates ?? []);
    const correct = rng.bool(0.8);
    const a = attemptFor(graph, templateId, rng.int(1, 40), {
      sessionId: `s${Math.floor((ts - T0) / DAY_MS)}`,
      correct,
      latencyMs: rng.int(1_000, 20_000),
      context: rng.pick(CONTEXTS),
    });
    state = model.apply(state, a, ts);
  }
  return { state, last: ts };
}

const inputArb = fc
  .record({
    grade: fc.constantFrom<Grade>('K', '1', '2', '3'),
    minutes: fc.integer({ min: 5, max: 30 }),
    seed: fc.integer({ min: 1, max: 1_000_000 }),
    size: fc.integer({ min: 0, max: 50 }),
    days: fc.integer({ min: 1, max: 20 }),
    priors: fc.integer({ min: 0, max: graph.nodes.length }),
    gapHours: fc.integer({ min: 0, max: 24 * 10 }),
    workshops: fc.subarray(WORKSHOPS),
    unavailable: fc.subarray(WORKSHOPS.map((w) => w.workshopId)),
    pier: fc.boolean(),
    residents: fc.subarray(['nib', 'tuck', 'marlo', 'tenley']),
    remediation: fc.option(fc.constantFrom(...graph.nodes), { nil: undefined }),
  })
  .map((r): { input: PlanSessionInput; remediation: SkillId | undefined } => {
    const c = child(r.grade);
    const { state, last } = randomState(r.seed, r.size, r.days, r.priors, c.isK);
    const caps = r.workshops.map((w) => ({
      ...w,
      available: !r.unavailable.includes(w.workshopId),
    }));
    return {
      input: {
        child: c,
        state,
        graph,
        now: last + r.gapHours * 3_600_000,
        minutes: r.minutes,
        workshopsAvailable: r.pier ? [...caps, PIER] : caps,
        island: island(r.residents),
      },
      remediation: r.remediation,
    };
  });

const isItem = (t: PlannedRequest['tasks'][number]) => t.mode === 'item';

describe('planSession properties (fixture graph)', () => {
  it('respects request counts, budgets, runs, hosting and rewards; deterministic and schema-valid', () => {
    fc.assert(
      fc.property(inputArb, ({ input, remediation }) => {
        const opts = remediation
          ? { remediation: { skillId: remediation, misconceptionId: 'MC.off-by-one-counting' } }
          : {};
        const plan = planSession(input, opts);
        // (f) deterministic and schema-valid.
        expect(planSession(input, opts)).toEqual(plan);
        expect(sessionPlanSchema.safeParse(plan).error?.issues).toBeUndefined();
        // (a) 2–3 requests.
        expect(plan.requests.length).toBeGreaterThanOrEqual(P.requestsMin);
        expect(plan.requests.length).toBeLessThanOrEqual(P.requestsMax);

        const kItems = input.child.grade === 'K' || input.child.grade === '1';
        const [min, max] = kItems ? P.requestItemsK : P.requestItemsG2;
        const model = createEloFireModel(graph, { childId: CHILD_1, isK: input.child.isK });
        const anyProducts = input.workshopsAvailable.some(
          (w) => w.available && w.workshopId !== PRACTICE_PIER && w.produces.length > 0,
        );
        for (const r of plan.requests) {
          const items = r.tasks.filter(isItem);
          const lessons = r.tasks.length - items.length;
          const size = items.length + lessons * P.lessonItemCost;

          // (d) hostable: an available workshop hosting every task's format, or the Practice Pier.
          const cap = input.workshopsAvailable.find((w) => w.workshopId === r.workshopId);
          const hosted = (format: string) =>
            r.workshopId === PRACTICE_PIER || (cap?.formats ?? []).some((f) => f === format);
          if (r.workshopId !== PRACTICE_PIER) expect(cap?.available).toBe(true);
          for (const t of r.tasks) {
            const tpl = graph.templates[t.templateId];
            expect(tpl?.skillId).toBe(t.skillId);
            expect(hosted(tpl?.format as string)).toBe(true);
          }

          // (b) never above the max; within range when ≥ 2 distinct skills can fill it here.
          expect(size).toBeLessThanOrEqual(max);
          const usable = new Set(items.map((t) => t.skillId));
          for (const s of graph.nodes) {
            const templates = (graph.skills[s]?.templates ?? []).map((id) => graph.templates[id]);
            if (!templates.some((t) => t && hosted(t.format))) continue;
            const st = model.status(input.state, s, input.now);
            const lessonFirst = st === 'ready' && graph.skills[s]?.lesson.mode !== 'none';
            if (st !== 'locked' && !lessonFirst) usable.add(s);
          }
          if (usable.size >= 2) {
            expect(size).toBeGreaterThanOrEqual(min);
          }

          // (c) no more than maxRun consecutive items of one skill.
          let run = 0;
          let last: string | null = null;
          for (const t of items) {
            run = t.skillId === last ? run + 1 : 1;
            last = t.skillId;
            expect(run).toBeLessThanOrEqual(P.maxRun);
          }

          // (e) one material per item, unless there is nothing to produce.
          const sum = Object.values(r.reward.materials).reduce<number>((a, b) => a + (b ?? 0), 0);
          if (r.workshopId !== PRACTICE_PIER || anyProducts) expect(sum).toBe(items.length);
          else expect(sum).toBe(0);
          expect(r.vars.count).toBe(items.length);
          expect(r.vars.who).toBe(r.residentId);
        }
        const ids = plan.requests.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(plan.windDownAtMs).toBe(input.now + input.minutes * 60_000);
      }),
      { numRuns: 200 },
    );
  });
});
