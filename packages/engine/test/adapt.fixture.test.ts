// `adaptNext` regressions on the real fixture content (cross-model review of PR #66): the hint
// rungs a template generates (F5), the probe's format (F1), and a skip on a choice item (F4).

import {
  type AdaptDecision,
  type AdaptInput,
  type AttemptPayload,
  adaptDecisionSchema,
  type ChildContext,
  defaultChildSettings,
  type ItemTemplate,
  type LearnerState,
  type PlannedTask,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { isConstructedTemplate } from '../src/items/answer-kind';
import { createEloFireModel } from '../src/learner/elo-fire';
import { adaptNext } from '../src/planner';
import { fixtureGraph, loadFixture } from './fixture';
import { CHILD_1 } from './support/events';

loadFixture();
const graph = fixtureGraph();
const T0 = Date.UTC(2026, 10, 12, 16);
const REQ = 'req-fixture';

const child: ChildContext = {
  childId: CHILD_1,
  grade: '1',
  ageBand: '5-6',
  advanced: false,
  isK: false,
  settings: defaultChildSettings('1'),
};

const tpl = (id: string): ItemTemplate => {
  const t = graph.templates[id];
  if (!t) throw new Error(`fixture template ${id} is missing`);
  return t;
};

const task = (templateId: string, seed: number): PlannedTask => ({
  skillId: tpl(templateId).skillId,
  templateId,
  seed,
  context: 'practice',
  mode: 'item',
});

type Outcome = 'correct' | 'wrong' | 'skip';

/** The first attempt at a task, as the TaskRunner logs it. */
function firstAttempt(t: PlannedTask, outcome: Outcome): AttemptPayload {
  const template = tpl(t.templateId);
  return {
    sessionId: 's1',
    skillId: t.skillId,
    templateId: t.templateId,
    seed: t.seed,
    params: {},
    format: template.format,
    tier: template.tier,
    representation: template.representation ?? 'symbols',
    response:
      outcome === 'skip'
        ? { kind: 'skip' }
        : isConstructedTemplate(template)
          ? { kind: 'number', value: 3 }
          : { kind: 'choice', id: 'opt-1' },
    correct: outcome === 'correct',
    partialCredit: outcome === 'correct' ? 1 : 0,
    latencyMs: 4_000,
    hintsUsed: 0,
    attemptNo: 1,
    misconceptionIds: [],
    context: t.context,
    workshopId: null,
  };
}

/**
 * Folds the first tries of the presented tasks (the last one is the current task) and builds the
 * adaptNext input for the current task at attempt `attemptNo`.
 */
function input(
  tasks: PlannedTask[],
  outcomes: Outcome[],
  last: Partial<AdaptInput['last']> = {},
): AdaptInput {
  const model = createEloFireModel(graph, { childId: CHILD_1, isK: false });
  let state: LearnerState = model.init(graph, null);
  outcomes.forEach((o, i) => {
    state = model.apply(state, firstAttempt(tasks[i] as PlannedTask, o), T0 + i * 1000);
  });
  const cur = outcomes.length - 1;
  const correct = outcomes[cur] === 'correct';
  return {
    state,
    graph,
    child,
    now: T0 + cur * 1000,
    request: {
      id: REQ,
      residentId: 'tenley',
      workshopId: 'ten-boat-dock',
      tasks,
      reward: { materials: {} },
      narration: 'req.help',
      vars: {},
    },
    doneTaskIds: outcomes.map((_, i) => i),
    last: {
      task: tasks[cur] as PlannedTask,
      result: {
        correct,
        partialCredit: correct ? 1 : 0,
        misconceptionIds: [],
        feedback: 'fb.test',
      },
      attemptNo: 1,
      hintsUsed: 0,
      latencyMs: 4_000,
      ...last,
    },
    signals: { wrongInLast4: 0, rapidWrongTaps: 0, longIdles: 0 },
    tierOverrides: {},
    elapsedMs: 60_000,
    budgetMs: 600_000,
  };
}

function run(i: AdaptInput): AdaptDecision {
  const d = adaptNext(i);
  expect(adaptDecisionSchema.safeParse(d).success).toBe(true);
  return d;
}

describe('F5: retry asks only for a hint rung the template generates', () => {
  it('CNT.01.t3 lists one hint key: every retry is level 2 (no rung 3 or 4)', () => {
    expect(tpl('CNT.01.t3').narration.hints).toHaveLength(1);
    const tasks = [task('CNT.01.t3', 1), task('CNT.01.t3', 2)];
    for (const hintsUsed of [0, 1, 2]) {
      expect(run(input(tasks, ['wrong'], { hintsUsed }))).toEqual({
        action: 'retry',
        hintLevel: 2,
      });
    }
  });
});

describe('F1: the prerequisite probe uses a format the request already uses', () => {
  it('a Ten-Boat Dock number-pad request on CNT.03 gets no CNT.02 probe (tap-count / make-set only)', () => {
    expect(graph.prereqs['CNT.03']).toEqual(['CNT.02']);
    const t4 = tpl('CNT.03.t4');
    expect(t4.format).toBe('number-pad');
    const prereqFormats = new Set(
      (graph.skills['CNT.02']?.templates ?? []).map((id) => tpl(id).format),
    );
    expect(prereqFormats.has('number-pad')).toBe(false);
    const tasks = [1, 2, 3, 4, 5].map((n) => task('CNT.03.t4', n));
    const d = run(input(tasks, ['wrong', 'wrong', 'wrong'], { attemptNo: 3 }));
    expect(d.action).toBe('continue');
    expect('insert' in d).toBe(false);
  });
});

describe('F4: a skip on a choice item does not shift the request history', () => {
  it('CNT.03.t2 correct, CNT.03.t3 (choice) skipped, CNT.03.t2 wrong: no tier step-down', () => {
    expect(isConstructedTemplate(tpl('CNT.03.t2'))).toBe(true);
    expect(isConstructedTemplate(tpl('CNT.03.t3'))).toBe(false);
    expect(tpl('CNT.03.t2').tier).toBe(tpl('CNT.03.t3').tier);
    const tasks = [
      task('CNT.03.t2', 1),
      task('CNT.03.t3', 2),
      task('CNT.03.t2', 3),
      task('CNT.03.t2', 4),
    ];
    const i = input(tasks, ['correct', 'skip', 'wrong'], { attemptNo: 3 });
    // The skip is not evidence, so `recent` is the two constructed first tries.
    expect(i.state.skills['CNT.03']?.recent.map((r) => r.correct)).toEqual([true, false]);
    const d = run(i);
    expect(d).toEqual({ action: 'continue' });
  });
});
