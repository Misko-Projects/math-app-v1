// 04 §6.4 `adaptNext`: every rule and their priority order, on the synthetic graph
// (A = CNT.01 ── B = CNT.02 ── C = CNT.03; templates t1 tap-count concrete, t2 tenframe-fill
// pictorial, t3 number-pad abstract, t4 number-bond abstract).

import {
  type AdaptDecision,
  type AdaptInput,
  adaptDecisionSchema,
  type ChildContext,
  type ItemTemplate,
  type LearnerState,
  type MisconceptionSpec,
  type PlannedRequest,
  type PlannedTask,
  type SkillGraph,
} from '@number-island/shared';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../content/binding';
import { createEloFireModel } from '../learner/elo-fire';
import { A, attempt, B, C, syntheticGraph, T0 } from '../learner/synthetic.test-support';
import { PARAMS } from '../params';
import { adaptNext, confidenceSeed, probeSeed, stepDownTier } from './adapt';

const CHILD_ID = '019a0000-0000-7000-8000-000000000001';
const baseGraph = syntheticGraph();
const REQ = 'req-1';

const child: ChildContext = {
  childId: CHILD_ID,
  grade: '1',
  ageBand: '5-6',
  advanced: false,
  isK: false,
  settings: {
    sessionMinutes: 15,
    dailyCapMinutes: null,
    quietHours: null,
    timedChallenges: false,
    captions: true,
    tapOnly: false,
    snapRadiusPx: 24,
    speakOnTap: false,
    weeklyGoal: 3,
  },
};

/** A task on template n of a skill; seeds are the position unless set. */
function task(skillId: string, n: number, over: Partial<PlannedTask> = {}): PlannedTask {
  return {
    skillId,
    templateId: `${skillId}.t${n}`,
    seed: 100 + n,
    context: 'practice',
    mode: 'item',
    ...over,
  };
}

function request(tasks: PlannedTask[]): PlannedRequest {
  return {
    id: REQ,
    residentId: 'pip',
    workshopId: 'counting-hut',
    tasks,
    reward: { materials: {} },
    narration: 'rq.test.offer',
    vars: {},
  };
}

interface Scenario {
  graph?: SkillGraph;
  /** Attempts applied before the request (first tries, practice). */
  before?: { skillId: string; n: number; correct: boolean; misconceptionIds?: string[] }[];
  tasks: PlannedTask[];
  /** First-try results of the presented tasks, in order; the last one is the current task. */
  results: boolean[];
  /** Misconceptions matched by each presented task's first try (by position). */
  misconceptions?: Record<number, string[]>;
  last?: Partial<AdaptInput['last']>;
  lastResult?: Partial<AdaptInput['last']['result']>;
  input?: Partial<AdaptInput>;
  /** Patch the state after the attempts (e.g. practicedAt). */
  patch?: (s: LearnerState) => LearnerState;
}

const templateN = (templateId: string): number => Number(templateId.split('.t')[1]);

function scenario(sc: Scenario): AdaptInput {
  const graph = sc.graph ?? baseGraph;
  const model = createEloFireModel(graph, { childId: CHILD_ID, isK: false });
  let state = model.init(graph, null);
  let ts = T0;
  const tick = (): number => {
    ts += 1000;
    return ts;
  };
  for (const b of sc.before ?? []) {
    state = model.apply(
      state,
      attempt(b.skillId, b.n, { correct: b.correct, misconceptionIds: b.misconceptionIds ?? [] }),
      tick(),
    );
  }
  sc.results.forEach((correct, i) => {
    const t = sc.tasks[i] as PlannedTask;
    if (t.mode === 'lesson') return;
    const tpl = graph.templates[t.templateId] as ItemTemplate;
    const choice = tpl.format === 'numeral-pick' || tpl.format === 'compare';
    state = model.apply(
      state,
      attempt(t.skillId, Math.min(4, templateN(t.templateId)), {
        templateId: t.templateId,
        format: tpl.format,
        tier: tpl.tier,
        correct,
        context: t.context,
        seed: t.seed,
        misconceptionIds: sc.misconceptions?.[i] ?? [],
        ...(choice ? { response: { kind: 'choice', id: 'opt-1' } } : {}),
      }),
      tick(),
    );
  });
  if (sc.patch) state = sc.patch(state);
  const cur = sc.results.length - 1;
  const correct = sc.results[cur] as boolean;
  return {
    state,
    graph,
    child,
    now: ts,
    request: request(sc.tasks),
    doneTaskIds: sc.results.map((_, i) => i),
    last: {
      task: sc.tasks[cur] as PlannedTask,
      result: {
        correct,
        partialCredit: correct ? 1 : 0,
        misconceptionIds: sc.misconceptions?.[cur] ?? [],
        feedback: 'fb.test',
        ...sc.lastResult,
      },
      attemptNo: 1,
      hintsUsed: 0,
      latencyMs: 3000,
      ...sc.last,
    },
    signals: { wrongInLast4: 0, rapidWrongTaps: 0, longIdles: 0 },
    tierOverrides: {},
    elapsedMs: 60_000,
    budgetMs: 600_000,
    ...sc.input,
  };
}

/** adaptNext, checked against the shared schema and for determinism on every call. */
function run(input: AdaptInput): AdaptDecision {
  const d = adaptNext(input);
  expect(adaptDecisionSchema.safeParse(d).success).toBe(true);
  expect(adaptNext(input)).toEqual(d);
  return d;
}

const W = false;
const R = true;
const five = [task(B, 3), task(B, 1, { seed: 2 }), task(B, 3, { seed: 3 }), task(A, 3), task(B, 4)];

/** A graph variant: extra templates and patched skills/prereqs. */
function variant(extra: ItemTemplate[], patch: (g: SkillGraph) => void = () => {}): SkillGraph {
  const g: SkillGraph = {
    ...baseGraph,
    skills: { ...baseGraph.skills },
    templates: { ...baseGraph.templates },
    prereqs: { ...baseGraph.prereqs },
  };
  for (const t of extra) {
    g.templates[t.id] = t;
    const s = g.skills[t.skillId];
    if (s) g.skills[t.skillId] = { ...s, templates: [...s.templates, t.id] };
  }
  patch(g);
  return g;
}

const pickTemplate = (skillId: string, n: number): ItemTemplate => ({
  ...(baseGraph.templates[`${skillId}.t3`] as ItemTemplate),
  id: `${skillId}.t${n}`,
  format: 'numeral-pick',
  tier: 'abstract',
  representation: 'symbols',
});

afterEach(() => resetContent());

describe('helpers', () => {
  it('stepDownTier: abstract → pictorial → concrete → concrete', () => {
    expect(stepDownTier('abstract')).toBe('pictorial');
    expect(stepDownTier('pictorial')).toBe('concrete');
    expect(stepDownTier('concrete')).toBe('concrete');
  });

  it('seeds are stable integers and distinguish their inputs', () => {
    expect(probeSeed('r', B, A)).toBe(probeSeed('r', B, A));
    expect(Number.isInteger(probeSeed('r', B, A))).toBe(true);
    expect(Number.isInteger(confidenceSeed('r'))).toBe(true);
    const all = [
      probeSeed('r', B, A),
      probeSeed('r', C, B),
      probeSeed('q', B, A),
      confidenceSeed('r'),
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('rule 2: the unresolved item (hint ladder, worked solution)', () => {
  it.each([
    [0, 2],
    [1, 3],
    [2, 4],
    [5, 4],
  ])('first wrong with %i hints used → retry at hint level %i', (hintsUsed, level) => {
    const d = run(scenario({ tasks: five, results: [W], last: { hintsUsed } }));
    expect(d).toEqual({ action: 'retry', hintLevel: level });
  });

  it('second wrong → show-solution', () => {
    expect(run(scenario({ tasks: five, results: [W], last: { attemptNo: 2 } }))).toEqual({
      action: 'show-solution',
    });
  });

  it('attempt 3 resolves the item: continue, or wind-down at the budget', () => {
    expect(run(scenario({ tasks: five, results: [W], last: { attemptNo: 3 } }))).toEqual({
      action: 'continue',
    });
    expect(
      run(
        scenario({
          tasks: five,
          results: [W],
          last: { attemptNo: 3 },
          input: { elapsedMs: 600_000 },
        }),
      ),
    ).toEqual({ action: 'end-request', reason: 'wind-down' });
  });

  it('a correct retry resolves the item', () => {
    expect(
      run(
        scenario({
          tasks: five,
          results: [W],
          last: { attemptNo: 2 },
          lastResult: { correct: true },
        }),
      ),
    ).toEqual({ action: 'continue' });
  });

  it('lesson tasks never retry; they go to the between-item rules', () => {
    const tasks = [task(B, 1, { mode: 'lesson', context: 'lesson' }), task(B, 3)];
    expect(run(scenario({ tasks, results: [W] }))).toEqual({ action: 'continue' });
    expect(
      run(scenario({ tasks: [tasks[0] as PlannedTask], results: [W], last: { attemptNo: 2 } })),
    ).toEqual({ action: 'end-request', reason: 'complete' });
  });
});

describe('rule 3: wind-down (no overrun beyond the current item)', () => {
  it('a wrong first try at the budget still retries, then shows the solution', () => {
    const input = { elapsedMs: 700_000, budgetMs: 600_000 };
    expect(run(scenario({ tasks: five, results: [W], input }))).toEqual({
      action: 'retry',
      hintLevel: 2,
    });
    expect(run(scenario({ tasks: five, results: [W], input, last: { attemptNo: 2 } }))).toEqual({
      action: 'show-solution',
    });
  });

  it('a resolved item at the budget ends the request, ahead of frustration and completion', () => {
    const d = run(
      scenario({
        tasks: [task(B, 3)],
        results: [R],
        input: {
          elapsedMs: 600_000,
          budgetMs: 600_000,
          signals: { wrongInLast4: 4, rapidWrongTaps: 3, longIdles: 2 },
        },
      }),
    );
    expect(d).toEqual({ action: 'end-request', reason: 'wind-down' });
  });
});

describe('rule 4: frustration', () => {
  // A is practiced and strong; the request is on B (number-pad and tap-count templates).
  const strongA = Array.from({ length: 6 }, () => ({ skillId: A, n: 3, correct: true }));
  const practicedA = (s: LearnerState): LearnerState => ({
    ...s,
    skills: {
      ...s.skills,
      [A]: { ...(s.skills[A] as LearnerState['skills'][string]), practicedAt: T0, theta: 3 },
    },
  });
  const bTasks = [
    task(B, 3),
    task(B, 1, { seed: 2 }),
    task(B, 3, { seed: 3 }),
    task(B, 3, { seed: 4 }),
  ];

  it.each([
    ['wrongInLast4', { wrongInLast4: 3, rapidWrongTaps: 0, longIdles: 0 }],
    ['rapidWrongTaps', { wrongInLast4: 0, rapidWrongTaps: 3, longIdles: 0 }],
    ['longIdles', { wrongInLast4: 0, rapidWrongTaps: 0, longIdles: 2 }],
  ])('%s triggers a confidence item on the strongest hosted skill', (_name, signals) => {
    const input = scenario({
      before: strongA,
      patch: practicedA,
      tasks: bTasks,
      results: [W, W],
      last: { attemptNo: 3 },
      input: { signals },
    });
    const d = run(input);
    // A has the highest P(ref); its abstract number-pad template is hosted (the request uses
    // number-pad), and is preferred over the hosted concrete tap-count.
    expect(d).toEqual({
      action: 'confidence-then-offer-break',
      insert: [
        {
          skillId: A,
          templateId: `${A}.t3`,
          seed: confidenceSeed(REQ),
          context: 'warmup',
          mode: 'item',
        },
      ],
    });
    const model = createEloFireModel(baseGraph, { childId: CHILD_ID, isK: false });
    expect(model.pRef(input.state, A)).toBeGreaterThanOrEqual(PARAMS.planner.warmupMinP);
  });

  it('below every threshold there is no frustration', () => {
    const d = run(
      scenario({
        tasks: bTasks,
        results: [R],
        input: { signals: { wrongInLast4: 2, rapidWrongTaps: 2, longIdles: 1 } },
      }),
    );
    expect(d).toEqual({ action: 'continue' });
  });

  it('an un-practiced strong skill outside the request is not a candidate', () => {
    const d = run(
      scenario({
        before: strongA,
        tasks: bTasks,
        results: [R],
        input: { signals: { wrongInLast4: 3, rapidWrongTaps: 0, longIdles: 0 } },
      }),
    );
    expect(d).toMatchObject({ action: 'confidence-then-offer-break', insert: [{ skillId: B }] });
  });

  it('frustration comes before completion', () => {
    const d = run(
      scenario({
        tasks: [task(B, 3)],
        results: [R],
        input: { signals: { wrongInLast4: 3, rapidWrongTaps: 0, longIdles: 0 } },
      }),
    );
    expect(d.action).toBe('confidence-then-offer-break');
  });

  it('falls back to the easiest presented task when no skill has a hosted template', () => {
    // B lists no templates of its own, so no candidate qualifies.
    const graph = variant([], (g) => {
      g.skills[B] = { ...(g.skills[B] as SkillGraph['skills'][string]), templates: [] };
    });
    const d = run(
      scenario({
        graph,
        tasks: [task(B, 3), task(B, 2, { seed: 7 })],
        results: [W, W],
        last: { attemptNo: 3 },
        input: { signals: { wrongInLast4: 3, rapidWrongTaps: 0, longIdles: 0 } },
      }),
    );
    expect(d).toMatchObject({
      action: 'confidence-then-offer-break',
      insert: [{ skillId: B, templateId: `${B}.t3`, seed: confidenceSeed(REQ), context: 'warmup' }],
    });
  });

  const conf = task(A, 3, { seed: confidenceSeed(REQ), context: 'warmup' });
  const signals = { wrongInLast4: 3, rapidWrongTaps: 0, longIdles: 0 };

  it('an inserted confidence item not yet presented: continue with nothing', () => {
    const tasks = [task(B, 3), task(B, 3, { seed: 2 }), conf, task(B, 3, { seed: 3 })];
    const d = run(scenario({ tasks, results: [W, W], last: { attemptNo: 3 }, input: { signals } }));
    expect(d).toEqual({ action: 'continue' });
  });

  it('still frustrated after the confidence item → finish early (frustration)', () => {
    const tasks = [task(B, 3), task(B, 3, { seed: 2 }), conf, task(B, 3, { seed: 3 }), task(B, 1)];
    const d = run(
      scenario({ tasks, results: [W, W, R, W], last: { attemptNo: 3 }, input: { signals } }),
    );
    expect(d).toEqual({ action: 'end-request', reason: 'frustration' });
  });

  it("the confidence item's own resolution does not re-trigger (the break offer follows it)", () => {
    const tasks = [task(B, 3), task(B, 3, { seed: 2 }), conf, task(B, 3, { seed: 3 })];
    const d = run(scenario({ tasks, results: [W, W, R], input: { signals } }));
    expect(d).toEqual({ action: 'continue' });
  });
});

describe('rule 5: complete', () => {
  it('every task presented → end-request complete', () => {
    const tasks = [task(B, 3), task(A, 3)];
    expect(run(scenario({ tasks, results: [R, R] }))).toEqual({
      action: 'end-request',
      reason: 'complete',
    });
  });

  it('completion wins over a due probe or step-down', () => {
    const tasks = [task(C, 3), task(C, 3, { seed: 2 }), task(C, 3, { seed: 3 })];
    const d = run(scenario({ tasks, results: [W, W, W], last: { attemptNo: 3 } }));
    expect(d).toEqual({ action: 'end-request', reason: 'complete' });
  });
});

describe('rule 6: prerequisite probe', () => {
  const cTasks = [
    task(C, 3),
    task(C, 3, { seed: 2 }),
    task(C, 3, { seed: 3 }),
    task(C, 3, { seed: 4 }),
    task(C, 1, { seed: 5 }),
  ];

  it('three first-try wrongs insert one probe for the prerequisite (with the tier step-down)', () => {
    const d = run(scenario({ tasks: cTasks, results: [W, W, W], last: { attemptNo: 3 } }));
    expect(d).toEqual({
      action: 'continue',
      tierOverrides: { [C]: 'pictorial' },
      insert: [
        // B's number-pad template: a format already in the request, abstract.
        {
          skillId: B,
          templateId: `${B}.t3`,
          seed: probeSeed(REQ, C, B),
          context: 'practice',
          mode: 'item',
        },
      ],
    });
  });

  it('wrongs need not be in a row; the probe is inserted only once', () => {
    const d = run(scenario({ tasks: cTasks, results: [W, R, W, W], last: { attemptNo: 3 } }));
    expect(d).toMatchObject({ insert: [{ skillId: B }] });
    const withProbe = [
      ...cTasks.slice(0, 3),
      task(B, 3, { seed: probeSeed(REQ, C, B) }),
      ...cTasks.slice(3),
    ];
    const again = run(
      scenario({ tasks: withProbe, results: [W, W, W, R, W], last: { attemptNo: 3 } }),
    );
    expect(again).toEqual({ action: 'continue', tierOverrides: { [C]: 'pictorial' } });
  });

  it('picks the weakest prerequisite (lowest offset) and reviews it when practiced', () => {
    // C gets a second prerequisite, A; B is strong and practiced, A is weak.
    const graph = variant([], (g) => {
      g.prereqs[C] = [B, A];
    });
    const before = [
      ...Array.from({ length: 6 }, () => ({ skillId: B, n: 3, correct: true })),
      ...Array.from({ length: 3 }, () => ({ skillId: A, n: 3, correct: false })),
    ];
    const d = run(
      scenario({ graph, before, tasks: cTasks, results: [W, W, W], last: { attemptNo: 3 } }),
    );
    expect(d).toMatchObject({
      insert: [{ skillId: A, seed: probeSeed(REQ, C, A), context: 'practice' }],
    });

    const practicedA = (s: LearnerState): LearnerState => ({
      ...s,
      skills: {
        ...s.skills,
        [A]: { ...(s.skills[A] as LearnerState['skills'][string]), practicedAt: T0 },
      },
    });
    const reviewed = run(
      scenario({
        graph,
        before,
        patch: practicedA,
        tasks: cTasks,
        results: [W, W, W],
        last: { attemptNo: 3 },
      }),
    );
    expect(reviewed).toMatchObject({ insert: [{ skillId: A, context: 'review' }] });
  });

  it('a skill without prerequisites gets no probe', () => {
    const aTasks = cTasks.map((t) => ({
      ...t,
      skillId: A,
      templateId: t.templateId.replace(C, A),
    }));
    const d = run(scenario({ tasks: aTasks, results: [W, W, W], last: { attemptNo: 3 } }));
    expect(d).toEqual({ action: 'continue', tierOverrides: { [A]: 'pictorial' } });
  });

  const probe = task(B, 3, { seed: probeSeed(REQ, C, B) });
  const withProbe = [...cTasks.slice(0, 3), probe, ...cTasks.slice(3)];

  it('a failed probe ends the request gently (complete)', () => {
    const d = run(scenario({ tasks: withProbe, results: [W, W, W, W], last: { attemptNo: 3 } }));
    expect(d).toEqual({ action: 'end-request', reason: 'complete' });
    // Correct only on the retry is still a failed probe.
    const retry = run(
      scenario({
        tasks: withProbe,
        results: [W, W, W, W],
        last: { attemptNo: 2 },
        lastResult: { correct: true },
      }),
    );
    expect(retry).toEqual({ action: 'end-request', reason: 'complete' });
  });

  it('a failed probe still retries first; a passed probe continues', () => {
    expect(run(scenario({ tasks: withProbe, results: [W, W, W, W] }))).toEqual({
      action: 'retry',
      hintLevel: 2,
    });
    expect(run(scenario({ tasks: withProbe, results: [W, W, W, R] }))).toEqual({
      action: 'continue',
    });
  });

  it('a task on the prerequisite with an unrelated seed is not a probe', () => {
    const tasks = [...cTasks.slice(0, 3), task(B, 3, { seed: 9 }), ...cTasks.slice(3)];
    expect(run(scenario({ tasks, results: [W, W, W, W], last: { attemptNo: 3 } }))).toEqual({
      action: 'continue',
    });
  });
});

describe('rule 7: tier step-down', () => {
  const bTasks = [
    task(B, 3),
    task(B, 3, { seed: 2 }),
    task(B, 3, { seed: 3 }),
    task(B, 3, { seed: 4 }),
  ];

  it('two first-try wrongs in a row step the tier down, chaining to concrete', () => {
    expect(run(scenario({ tasks: bTasks, results: [W, W], last: { attemptNo: 3 } }))).toEqual({
      action: 'continue',
      tierOverrides: { [B]: 'pictorial' },
    });
    // Two more wrongs, now at the pictorial tier, step down again.
    const pictorial = [task(B, 2), task(B, 2, { seed: 2 }), task(B, 2, { seed: 3 })];
    expect(
      run(
        scenario({
          tasks: pictorial,
          results: [W, W],
          last: { attemptNo: 3 },
          input: { tierOverrides: { [B]: 'pictorial', [A]: 'pictorial' } },
        }),
      ),
    ).toEqual({ action: 'continue', tierOverrides: { [B]: 'concrete', [A]: 'pictorial' } });
  });

  it('after a step, the wrongs that caused it never step again: two more at the new tier are needed', () => {
    // The two wrongs were at the abstract tier; the override already moved B to pictorial.
    expect(
      run(
        scenario({
          tasks: bTasks,
          results: [W, W],
          last: { attemptNo: 3 },
          input: { tierOverrides: { [B]: 'pictorial' } },
        }),
      ),
    ).toEqual({ action: 'continue' });
    // One wrong at pictorial after two at abstract is not two in a row at one tier.
    const mixed = [
      task(B, 3),
      task(B, 3, { seed: 2 }),
      task(B, 2, { seed: 3 }),
      task(B, 2, { seed: 4 }),
    ];
    const d = run(
      scenario({
        tasks: mixed,
        results: [W, W, W],
        last: { attemptNo: 3 },
        input: { tierOverrides: { [B]: 'pictorial' } },
      }),
    );
    expect(d.action).toBe('continue'); // the third wrong inserts a prerequisite probe (rule 6)
    expect('tierOverrides' in d).toBe(false);
  });
  it('no-op at concrete (the field is omitted)', () => {
    const concrete = [task(B, 1), task(B, 1, { seed: 2 }), task(B, 1, { seed: 3 })];
    expect(run(scenario({ tasks: concrete, results: [W, W], last: { attemptNo: 3 } }))).toEqual({
      action: 'continue',
    });
    expect(
      run(
        scenario({
          tasks: bTasks,
          results: [W, W],
          last: { attemptNo: 3 },
          input: { tierOverrides: { [B]: 'concrete' } },
        }),
      ),
    ).toEqual({ action: 'continue' });
  });

  it('not in a row, or a correct current item: no step-down', () => {
    expect(run(scenario({ tasks: bTasks, results: [W, R, W], last: { attemptNo: 3 } }))).toEqual({
      action: 'continue',
    });
    expect(run(scenario({ tasks: bTasks, results: [W, W, R] }))).toEqual({ action: 'continue' });
  });

  it('only first tries inside the request count', () => {
    // A wrong first try on B before the request is not part of it.
    const d = run(
      scenario({
        before: [{ skillId: B, n: 3, correct: false }],
        tasks: bTasks,
        results: [W],
        last: { attemptNo: 3 },
      }),
    );
    expect(d).toEqual({ action: 'continue' });
  });

  it('choice-only templates and non-evidence tasks do not enter the window', () => {
    const graph = variant([pickTemplate(B, 5)]);
    // pre-request wrong, then a choice item (not in `recent`), then a wrong number-pad item: the
    // window is that one wrong, so no step-down.
    const tasks = [task(B, 5), task(B, 3), task(B, 3, { seed: 3 })];
    const d = run(
      scenario({
        graph,
        before: [{ skillId: B, n: 3, correct: false }],
        tasks,
        results: [W, W],
        last: { attemptNo: 3 },
      }),
    );
    expect(d).toEqual({ action: 'continue' });
    // The choice item itself never triggers rules 6–7.
    const onChoice = run(
      scenario({
        graph,
        tasks: [task(B, 3), task(B, 3, { seed: 2 }), task(B, 5), task(B, 3, { seed: 3 })],
        results: [W, W, W],
        last: { attemptNo: 3 },
      }),
    );
    expect(onChoice).toEqual({ action: 'continue' });
  });

  it('a lesson task after the step-down does not step again', () => {
    const tasks = [
      task(B, 3),
      task(B, 3, { seed: 2 }),
      task(B, 1, { mode: 'lesson', context: 'lesson' }),
      task(B, 3, { seed: 3 }),
    ];
    const d = run(
      scenario({
        tasks,
        results: [W, W, W],
        input: { tierOverrides: { [B]: 'pictorial' } },
      }),
    );
    expect(d).toEqual({ action: 'continue' });
  });
});

describe('rule 1: misconception side effect', () => {
  const MC = 'MC.count-all-instead';
  const OTHER = 'MC.off-by-one-counting';
  const spec = (id: string, remediation: string[]): MisconceptionSpec => ({
    id,
    name: id,
    area: 'count',
    detect: { kind: 'answer', rule: 'countAll' },
    appliesTo: { generators: ['test.none'] },
    skills: [B],
    remediation,
    feedback: 'fb.mc.test',
    priority: 50,
    parentTip: 'tip',
    examples: [],
  });
  const bind = (...specs: MisconceptionSpec[]) =>
    initContent({ templates: [], narration: {}, misconceptions: specs });
  const tasks = [task(B, 3), task(B, 3, { seed: 2 }), task(B, 3, { seed: 3 })];
  // One earlier hit of MC; the current attempt matches OTHER (1 hit) and MC (2nd hit).
  const twoHits = (over: Partial<Scenario> = {}): AdaptInput =>
    scenario({
      before: [{ skillId: B, n: 3, correct: false, misconceptionIds: [MC] }],
      tasks,
      results: [W],
      misconceptions: { 0: [OTHER, MC] },
      ...over,
    });

  it('rides along a retry, with the first existing remediation skill', () => {
    bind(spec(MC, ['ZZZ.99', A, C]));
    expect(run(twoHits())).toEqual({
      action: 'retry',
      hintLevel: 2,
      queueRemediation: { skillId: A, misconceptionId: MC },
    });
  });

  it('falls back to the current skill (unbound spec, or no remediation skill in the graph)', () => {
    expect(run(twoHits())).toMatchObject({ queueRemediation: { skillId: B, misconceptionId: MC } });
    bind(spec(MC, ['ZZZ.99']));
    expect(run(twoHits())).toMatchObject({ queueRemediation: { skillId: B, misconceptionId: MC } });
  });

  it('accompanies show-solution, continue and end-request too', () => {
    bind(spec(MC, [A]));
    const q = { queueRemediation: { skillId: A, misconceptionId: MC } };
    expect(run(twoHits({ last: { attemptNo: 2 } }))).toEqual({ action: 'show-solution', ...q });
    expect(run(twoHits({ last: { attemptNo: 3 } }))).toEqual({ action: 'continue', ...q });
    expect(run(twoHits({ last: { attemptNo: 3 }, input: { elapsedMs: 600_000 } }))).toEqual({
      action: 'end-request',
      reason: 'wind-down',
      ...q,
    });
  });

  it('takes the first qualifying misconception in the given order', () => {
    bind(spec(MC, [A]), spec(OTHER, [C]));
    const d = run(
      scenario({
        before: [
          { skillId: B, n: 3, correct: false, misconceptionIds: [MC] },
          { skillId: B, n: 3, correct: false, misconceptionIds: [OTHER] },
        ],
        tasks,
        results: [W],
        misconceptions: { 0: [OTHER, MC] },
      }),
    );
    expect(d).toMatchObject({ queueRemediation: { skillId: C, misconceptionId: OTHER } });
  });

  it('needs the trigger count, and a match on the current attempt', () => {
    bind(spec(MC, [A]));
    const once = run(scenario({ tasks, results: [W], misconceptions: { 0: [MC] } }));
    expect(once).toEqual({ action: 'retry', hintLevel: 2 });
    const notNow = run(
      scenario({
        before: [
          { skillId: B, n: 3, correct: false, misconceptionIds: [MC] },
          { skillId: B, n: 3, correct: false, misconceptionIds: [MC] },
        ],
        tasks,
        results: [W],
      }),
    );
    expect(notNow).toEqual({ action: 'retry', hintLevel: 2 });
  });
});

describe('properties', () => {
  it('every decision parses, is deterministic, and never retries a lesson or a correct item', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 0, max: 5 }),
        fc.record({
          wrongInLast4: fc.integer({ min: 0, max: 4 }),
          rapidWrongTaps: fc.integer({ min: 0, max: 4 }),
          longIdles: fc.integer({ min: 0, max: 3 }),
        }),
        fc.boolean(),
        fc.constantFrom(B, C),
        (results, attemptNo, hintsUsed, signals, atBudget, skill) => {
          const tasks = Array.from({ length: 7 }, (_, i) => task(skill, (i % 3) + 1, { seed: i }));
          const input = scenario({
            tasks,
            results,
            last: { attemptNo, hintsUsed },
            input: { signals, elapsedMs: atBudget ? 600_000 : 0 },
          });
          const d = run(input);
          if (input.last.result.correct) expect(['retry', 'show-solution']).not.toContain(d.action);
          if (!input.last.result.correct && attemptNo === 1) expect(d.action).toBe('retry');
          if (d.action === 'continue' && d.insert) expect(d.insert).toHaveLength(1);
        },
      ),
      { numRuns: 150 },
    );
  });
});
