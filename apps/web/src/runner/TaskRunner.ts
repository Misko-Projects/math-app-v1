// The TaskRunner (02 §5.6, 04 §6.4): plays one request, item by item. Framework-free.
//
// Per item: `targetDifficulty` at presentation → `generateItem` → present with the answer left out
// → the screen measures latency from item ready → `submit`: `checkResponse` plus the process
// detectors → the `attempt` event → the learner projection → `adaptNext` → `next`.
//
// `adaptNext`'s calling protocol is the one recorded in 04 §7b: the state passed already holds the
// attempt, `request.tasks` is the working list (inserted tasks are spliced in after the current
// one), and `doneTaskIds` holds every presented task, the current one included.
//
// Part 1 of #20. Not here yet, and each named where it would go:
// - the hint ladder (`hint()` returns null; `hintsUsed` is always 0) and the worked solution: a
//   `show-solution` decision is resolved at once by the protocol's second `adaptNext` call;
// - the break offer after a confidence item, the remediation queue, `material.produced`
//   (`materialEarned` stays 0) and the long-idle signal (always 0);
// - lesson tasks, which are skipped (the lesson player is part 3);
// - AI feedback: `onAiFeedback` never calls back.

import type * as EngineModule from '@number-island/engine';
import {
  type AdaptDecision,
  type AttemptPayload,
  type CheckResult,
  type ChildContext,
  type EventPayloads,
  FORMAT_DEFAULT_REPRESENTATION,
  type GeneratedItem,
  type HintStep,
  type InteractionEvent,
  type ItemTemplate,
  type LearnerState,
  type MisconceptionId,
  type NarrationKey,
  type PlannedRequest,
  type PlannedTask,
  type PresentedItem,
  type ResponseValue,
  type RunnerFeedback,
  type RunnerTask,
  type SkillGraph,
  type SkillId,
  type TaskRunner,
  type Tier,
} from '@number-island/shared';
import type { DataStore } from '@/data/store';

/** The engine functions the runner calls (the full entry, loaded through a dynamic import). */
export type RunnerEngine = Pick<
  typeof EngineModule,
  | 'adaptNext'
  | 'checkResponse'
  | 'detectProcessMisconceptions'
  | 'detectStrategies'
  | 'generateItem'
  | 'targetDifficulty'
>;

/** What the runner needs from the play session (the SessionController). */
export interface RunnerSession {
  sessionId: string;
  /** Active time played so far and the session's budget, both in ms. */
  elapsedMs(): number;
  budgetMs: number;
  /** Whether the session has signalled its wind-down (budget, daily cap or quiet hours). */
  windingDown(): boolean;
  recordMath(ms: number): void;
  recordItem(): void;
}

export interface TaskRunnerDeps {
  engine: RunnerEngine;
  store: Pick<DataStore, 'append' | 'skillStates' | 'now'>;
  graph: SkillGraph;
  child: ChildContext;
  session: RunnerSession;
  request: PlannedRequest;
  /** Whether the hosting workshop can show a template (a tier step-down only picks such ones). */
  hosts(template: ItemTemplate): boolean;
}

export type RequestEndReason = Extract<AdaptDecision, { action: 'end-request' }>['reason'];

export interface RequestSummary {
  items: number;
  firstTryCorrect: number;
  /** Why the request ended; `child-exit` when the child left before it did. */
  reason: RequestEndReason | 'child-exit';
}

/** The app's TaskRunner: the shared contract plus the request's own lifecycle. */
export interface PierTaskRunner extends TaskRunner {
  /** Why the request ended, once `next()` has returned null. */
  endReason(): RequestEndReason | null;
  /** Writes `request.completed` (once) and returns the summary. Call when the request is over. */
  finish(): Promise<RequestSummary>;
}

/** A wrong answer this fast counts as a rapid tap (04 §6.4 rule 4). */
const RAPID_TAP_MS = 800;

type ItemTask = Extract<RunnerTask, { kind: 'item' }>;

interface Current {
  index: number;
  item: GeneratedItem;
  task: ItemTask;
  /** Set by `submit`; `next()` acts on it. */
  outcome: 'open' | 'retry' | 'resolved';
  busy: boolean;
}

/** Starts a request: writes `request.accepted` and presents the first item. */
export async function createTaskRunner(deps: TaskRunnerDeps): Promise<PierTaskRunner> {
  const { engine, store, graph, child, session } = deps;
  const request: PlannedRequest = { ...deps.request, tasks: [...deps.request.tasks] };
  const childId = child.childId;

  const loaded = await store.skillStates(childId);
  if (!loaded) throw new Error(`TaskRunner: no learner state for child ${childId}`);
  let state: LearnerState = loaded;

  const done: number[] = [];
  const firstTries: boolean[] = [];
  let tierOverrides: Partial<Record<SkillId, Tier>> = {};
  let rapidWrongTaps = 0;
  let resolved = 0;
  let ended: RequestEndReason | null = null;
  let current: Current | null = null;
  let finished: Promise<RequestSummary> | null = null;
  /** The submit being written, if any: `finish` waits for it, so its attempt is counted. */
  let submitting: Promise<unknown> | null = null;
  /** Misconceptions already logged on the item on screen: a second try never logs one again. */
  let loggedOnItem = new Set<MisconceptionId>();

  /** Inserted tasks the hosting workshop can show (04 §7b picks them by format alone). */
  const hosted = (tasks: PlannedTask[]) =>
    tasks.filter((t) => {
      const tpl = graph.templates[t.templateId];
      return tpl !== undefined && deps.hosts(tpl);
    });

  const isItem = (t: PlannedTask) => t.mode === 'item';

  const template = (id: string): ItemTemplate => {
    const t = graph.templates[id];
    if (!t) throw new Error(`TaskRunner: template ${id} is not in the content`);
    return t;
  };

  /** The task's template, or the skill's template at the request's tier override (04 §6.4 rule 2). */
  const presentedTemplate = (task: PlannedTask): ItemTemplate => {
    const planned = template(task.templateId);
    const tier = tierOverrides[task.skillId];
    if (tier === undefined || tier === planned.tier) return planned;
    const other = (graph.skills[task.skillId]?.templates ?? [])
      .map((id) => graph.templates[id])
      .find((t) => t !== undefined && t.tier === tier && deps.hosts(t));
    return other ?? planned;
  };

  /** Presents the first item task at or after `from`; null when the list has none left. */
  const present = (from: number): Current | null => {
    for (let i = from; i < request.tasks.length; i += 1) {
      const planned = request.tasks[i] as PlannedTask;
      done.push(i);
      if (!isItem(planned)) continue;
      const tpl = presentedTemplate(planned);
      const task: PlannedTask = { ...planned, templateId: tpl.id };
      request.tasks[i] = task;
      const difficulty = engine.targetDifficulty(state, task.skillId, task.context, child, graph);
      const item = engine.generateItem(tpl, task.seed, { difficulty });
      const { answer: _answer, ...presented } = item;
      return {
        index: i,
        item,
        task: {
          kind: 'item',
          task,
          item: presented satisfies PresentedItem,
          attemptNo: 1,
          hintLevel: 0,
          tier: item.tier,
        },
        outcome: 'open',
        busy: false,
      };
    }
    return null;
  };

  const adapt = (cur: Current, result: CheckResult, attemptNo: number, latencyMs: number) =>
    engine.adaptNext({
      state,
      graph,
      child,
      now: store.now(),
      request,
      doneTaskIds: [...done],
      last: { task: cur.task.task, result, attemptNo, hintsUsed: 0, latencyMs },
      signals: {
        wrongInLast4: firstTries.slice(-4).filter((c) => !c).length,
        rapidWrongTaps,
        longIdles: 0,
      },
      tierOverrides,
      elapsedMs: session.windingDown()
        ? Math.max(session.elapsedMs(), session.budgetMs)
        : session.elapsedMs(),
      budgetMs: session.budgetMs,
    });

  await store.append(
    'request.accepted',
    {
      sessionId: session.sessionId,
      requestId: request.id,
      residentId: request.residentId,
      workshopId: request.workshopId,
      taskCount: request.tasks.length,
    },
    { childId },
  );
  current = present(0);
  if (!current) ended = 'complete';

  const submit = (
    r: ResponseValue,
    meta: { latencyMs: number; trace?: InteractionEvent[] },
  ): Promise<RunnerFeedback> => {
    const run = judge(r, meta);
    submitting = run;
    const settled = () => {
      if (submitting === run) submitting = null;
    };
    run.then(settled, settled);
    return run;
  };

  const judge = async (
    r: ResponseValue,
    meta: { latencyMs: number; trace?: InteractionEvent[] },
  ): Promise<RunnerFeedback> => {
    const cur = current;
    if (cur?.outcome !== 'open' || cur.busy) {
      throw new Error('TaskRunner.submit: no item is waiting for an answer');
    }
    cur.busy = true;
    try {
      const { item } = cur;
      const { attemptNo } = cur.task;
      const latencyMs = Math.max(0, Math.round(meta.latencyMs));
      const checked = engine.checkResponse(item, r);
      // The session's totals are counted before anything is awaited: a session that ends while
      // this answer is being written (the child leaves during a wind-down) still holds it.
      session.recordMath(latencyMs);
      if (attemptNo === 1) session.recordItem();
      // The widget stays mounted for the second try, so the trace (and often the answer) of the
      // first try is still there. One slip is one hit: a misconception is logged once per item.
      const process = engine.detectProcessMisconceptions(item, r, { ...meta, latencyMs });
      const matched = [...new Set([...checked.misconceptionIds, ...process])];
      const result: CheckResult = {
        ...checked,
        partialCredit: checked.correct ? 1 : 0,
        misconceptionIds: matched.filter((id) => !loggedOnItem.has(id)),
      };
      for (const id of matched) loggedOnItem.add(id);
      const tpl = template(item.templateId);
      const payload: AttemptPayload = {
        sessionId: session.sessionId,
        skillId: item.skillId,
        templateId: item.templateId,
        seed: item.seed,
        params: item.params,
        format: item.format,
        tier: item.tier,
        representation: tpl.representation ?? FORMAT_DEFAULT_REPRESENTATION[item.format],
        response: r,
        correct: result.correct,
        partialCredit: result.partialCredit,
        latencyMs,
        hintsUsed: 0,
        attemptNo,
        misconceptionIds: result.misconceptionIds,
        context: cur.task.task.context,
        workshopId: request.workshopId,
      };
      await store.append('attempt', payload, { childId });
      const folded = await store.skillStates(childId);
      if (!folded) throw new Error(`TaskRunner: the learner state of ${childId} is gone`);
      state = folded;

      if (attemptNo === 1) firstTries.push(result.correct);
      if (!result.correct && latencyMs < RAPID_TAP_MS) rapidWrongTaps += 1;

      let decision = adapt(cur, result, attemptNo, latencyMs);
      if (decision.action === 'show-solution') {
        // No worked solution yet (part 2): the protocol's second call resolves the item.
        decision = adapt(cur, result, attemptNo + 1, latencyMs);
      }

      let say: NarrationKey | undefined = result.feedback;
      if (decision.action === 'retry') {
        cur.outcome = 'retry';
      } else {
        cur.outcome = 'resolved';
        resolved += 1;
        if (decision.action === 'continue') {
          if (decision.tierOverrides) tierOverrides = { ...decision.tierOverrides };
          if (decision.insert) request.tasks.splice(cur.index + 1, 0, ...hosted(decision.insert));
        } else if (decision.action === 'confidence-then-offer-break') {
          request.tasks.splice(cur.index + 1, 0, ...hosted(decision.insert));
        } else if (decision.action === 'end-request') {
          ended = decision.reason;
        }
        if (result.correct) {
          const [strategy] = engine.detectStrategies(item, r, { ...meta, latencyMs });
          if (strategy) say = strategy.replace(/^strategy\./, 'fb.praise.');
        } else {
          // Moving on after the last try: never the "one more time" line.
          say = 'fb.skip';
        }
      }
      return {
        ...result,
        say: { key: say },
        onAiFeedback: () => {},
        retry: decision.action === 'retry',
      };
    } finally {
      cur.busy = false;
    }
  };

  const next = (): RunnerTask | null => {
    const cur = current;
    if (!cur) return null;
    if (cur.outcome === 'open') return cur.task;
    if (cur.outcome === 'retry') {
      cur.task = { ...cur.task, attemptNo: cur.task.attemptNo + 1 };
      cur.outcome = 'open';
      return cur.task;
    }
    // The wind-down may have been signalled while the feedback was showing: no item starts after
    // it (04 §6.4 rule 6: no overrun beyond the current item).
    if (!ended && (session.windingDown() || session.elapsedMs() >= session.budgetMs)) {
      ended = 'wind-down';
    }
    loggedOnItem = new Set();
    current = ended ? null : present(cur.index + 1);
    if (!current && !ended) ended = 'complete';
    return current?.task ?? null;
  };

  const finish = (): Promise<RequestSummary> => {
    finished ??= (async () => {
      // An answer still being written belongs to this request: count it.
      await submitting?.catch(() => {});
      const summary: RequestSummary = {
        items: firstTries.length,
        firstTryCorrect: firstTries.filter(Boolean).length,
        reason: current === null && ended ? ended : 'child-exit',
      };
      const payload: EventPayloads['request.completed'] = {
        sessionId: session.sessionId,
        requestId: request.id,
        workshopId: request.workshopId,
        items: summary.items,
        firstTryCorrect: summary.firstTryCorrect,
        endedEarly: summary.reason !== 'complete',
      };
      await store.append('request.completed', payload, { childId });
      return summary;
    })();
    // A failed write is not remembered: the next call tries again.
    finished.catch(() => {
      finished = null;
    });
    return finished;
  };

  return {
    current: () => current?.task ?? null,
    submit,
    hint: (): HintStep | null => null,
    next,
    progress: () => ({
      done: resolved,
      total: request.tasks.filter(isItem).length,
      materialEarned: 0,
    }),
    endReason: () => (current === null ? ended : null),
    finish,
  };
}
