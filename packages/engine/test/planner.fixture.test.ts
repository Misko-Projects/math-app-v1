// Planner regressions on the real fixture content (cross-model review of PR #61): evidence by the
// template's own answer kind (F3) and review-only requests that host the due reviews (F4).

import type {
  ChildContext,
  IslandState,
  ItemTemplate,
  LearnerState,
  PlanSessionInput,
  Skill,
  SkillGraph,
  SkillState,
  WorkshopCapability,
} from '@number-island/shared';
import { defaultChildSettings, FORMAT_SUPPORT, sessionPlanSchema } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { isConstructedTemplate, templateAnswerKind } from '../src/items/answer-kind';
import { createEloFireModel } from '../src/learner/elo-fire';
import { buildSkillGraph } from '../src/learner/graph';
import { DAY_MS } from '../src/params';
import { PRACTICE_PIER, planSession } from '../src/planner';
import { evidenceTemplates, neededTemplates } from '../src/planner/plan';
import { fixtureGraph, loadFixture } from './fixture';
import { CHILD_1 } from './support/events';

loadFixture();
const graph = fixtureGraph();
const NOW = Date.UTC(2026, 10, 12, 16);

const ROAD: WorkshopCapability = {
  workshopId: 'road-crew',
  formats: ['hundred-chart', 'number-line-jump', 'tap-count', 'order'],
  strands: ['CNT', 'CMP'],
  available: true,
  residents: ['nib'],
  produces: ['stone'],
};

const child: ChildContext = {
  childId: CHILD_1,
  grade: '1',
  ageBand: '5-6',
  advanced: false,
  isK: false,
  settings: defaultChildSettings('1'),
};

const island: IslandState = {
  name: null,
  ringsUnlocked: 1,
  roadLength: 0,
  buildings: {},
  decor: {},
  residents: {},
  projects: {},
  festival: { active: null, completed: 0, daysOfPlaySinceLast: 0 },
  giftsPending: [],
  milestones: {},
};

const ids = (ts: readonly ItemTemplate[]) => ts.map((t) => t.id);
const tpl = (id: string) => graph.templates[id] as ItemTemplate;

describe('F3: evidence follows the template answer kind, not the format', () => {
  it('treats count.ordinal tap-count templates as choice templates', () => {
    for (const id of ['CNT.15.t1', 'CNT.15.t2']) {
      expect(tpl(id).format).toBe('tap-count');
      // The format could take a constructed answer, but these templates answer with a choice.
      expect(FORMAT_SUPPORT['tap-count'].answers.some((a) => a !== 'choice')).toBe(true);
      expect(templateAnswerKind(tpl(id))).toBe('choice');
      expect(isConstructedTemplate(tpl(id))).toBe(false);
    }
    expect(templateAnswerKind(tpl('CNT.02.t1'))).not.toBe('choice');
    expect(isConstructedTemplate(tpl('CNT.02.t1'))).toBe(true);
    // An unregistered generator has no known kind: the format decides.
    const unknown: ItemTemplate = { ...tpl('CNT.15.t1'), generator: 'test.none' };
    expect(templateAnswerKind(unknown)).toBeNull();
    expect(isConstructedTemplate(unknown)).toBe(true);
  });

  it('falls back to every CNT.15 template, none of which is ever needed', () => {
    const model = createEloFireModel(graph, { childId: CHILD_1, isK: false });
    const state = model.init(graph, null);
    const all = ids(
      (graph.skills['CNT.15'] as Skill).templates.map((id) => tpl(id)).filter(Boolean),
    ).sort();
    expect(ids(evidenceTemplates(graph, 'CNT.15')).sort()).toEqual(all);
    expect(neededTemplates(graph, state, 'CNT.15')).toEqual([]);
  });

  it('practises only the constructed template of a skill mixing it with an ordinal tap-count one', () => {
    // A one-skill graph: CNT.15 with copies of the ordinal tap-count CNT.15.t1 (a choice) and the
    // count.set tap-count CNT.02.t1 (constructed), lesson mode none.
    const ordinal: ItemTemplate = { ...tpl('CNT.15.t1') };
    const counted: ItemTemplate = { ...tpl('CNT.02.t1'), id: 'CNT.15.t9', skillId: 'CNT.15' };
    const base = graph.skills['CNT.15'] as Skill;
    const skill: Skill = {
      ...base,
      prerequisites: [],
      templates: [ordinal.id, counted.id],
      lesson: { ...base.lesson, mode: 'none' },
    };
    const g: SkillGraph = buildSkillGraph({
      contentVersion: graph.contentVersion,
      skills: [skill],
      templates: [ordinal, counted],
      graph: {
        nodes: ['CNT.15'],
        roots: ['CNT.15'],
        gateways: [],
        depth: { 'CNT.15': 0 },
        descendants2: { 'CNT.15': 0 },
      },
    });
    expect(ids(evidenceTemplates(g, 'CNT.15'))).toEqual([counted.id]);
    const model = createEloFireModel(g, { childId: CHILD_1, isK: false });
    const plan = planSession({
      child,
      state: model.init(g, null),
      graph: g,
      now: NOW,
      minutes: 15,
      workshopsAvailable: [ROAD],
      island,
    });
    const items = plan.requests.flatMap((r) => r.tasks.filter((t) => t.mode === 'item'));
    expect(items.length).toBeGreaterThan(0);
    for (const t of [...items, plan.warmup]) expect(t.templateId).toBe(counted.id);
  });
});

describe('F4: a review-only request hosts the due reviews', () => {
  it('goes to the Practice Pier when only it hosts the one due review', () => {
    const model = createEloFireModel(graph, { childId: CHILD_1, isK: false });
    const st = (dueTs: number): SkillState => ({
      theta: 3,
      n: 12,
      recent: [],
      assumed: false,
      override: null,
      practicedAt: NOW - 20 * DAY_MS,
      fluentAt: NOW - 20 * DAY_MS,
      masteredAt: null,
      memory: {
        intervalDays: 30,
        lastReviewTs: NOW - DAY_MS,
        dueTs,
        reps: 3,
        reviewsPassed: [],
        consecutiveFails: 0,
      },
      atRiskDueTs: null,
      misconceptionHits: [],
    });
    const skills = Object.fromEntries(
      graph.nodes.map((s) => [s, st(s === 'SUB.01' ? NOW - 1 : NOW + 10 * DAY_MS)]),
    );
    const state: LearnerState = { ...model.init(graph, null), skills };
    expect(model.frontier(state)).toEqual([]);
    expect(model.dueReviews(state, NOW).map((r) => r.skillId)).toEqual(['SUB.01']);
    const input: PlanSessionInput = {
      child,
      state,
      graph,
      now: NOW,
      minutes: 15,
      workshopsAvailable: [ROAD],
      island,
    };
    const plan = planSession(input);
    expect(sessionPlanSchema.safeParse(plan).error?.issues).toBeUndefined();
    const reviewed = plan.requests.filter((r) =>
      r.tasks.some(
        (t) => t.skillId === 'SUB.01' && (t.context === 'review' || t.context === 'transfer-probe'),
      ),
    );
    expect(reviewed.length).toBeGreaterThan(0);
    for (const r of reviewed) expect(r.workshopId).toBe(PRACTICE_PIER);
  });
});
