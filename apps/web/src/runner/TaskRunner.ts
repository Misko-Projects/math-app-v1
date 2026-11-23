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
// The feedback flow (#20 part 2, 04 §6.4, 03 §5.8):
// - the hint ladder: `hint()` gives the item's next rung among levels 2–4 and a retry gives the
//   rung `adaptNext` asks for (the next one up when the child has seen that one). Each rung shown
//   is one `hint.used` event and one `hintsUsed`; a right answer after a hint is half credit.
//   A rung that comes with feedback is used when the screen says it shows it (`shown()`);
// - the worked solution: on a `show-solution` decision the feedback carries the item's solution
//   steps (`hint.used` level 5 when shown), and the protocol's second `adaptNext` call resolves
//   the item;
// - `queueRemediation` goes to `deps.queueRemediation`, which keeps one per (skill,
//   misconception) for the next plan;
// - frustration: `idle()` counts a long idle period; after the confidence item the runner holds
//   a break offer (`breakOffered()`, `answerBreak()`);
// - `material.produced` is written once in `finish()`: one unit per item answered right.
//
// Lessons (#20 part 3, 03 §6): a `mode: 'lesson'` task plays the skill's lesson (`lesson.ts`).
// `current()` / `next()` hand out one `lesson-step` task at a time: the intro, each demo step of a
// worked or faded example, the child's turn at the end of a faded example, and the outro. `next()`
// on a demo step writes its `lesson.step` and moves on. The child's turn is answered with
// `lessonAnswer`: right → `done`; a second unsuccessful try → the screen demonstrates the steps
// and `next()` writes `demo-corrected`. Then the scaffolded items: real items of the lesson's
// template in context `lesson`, through `submit` like any item, with the hint ladder opened at
// `hintStart` (the rung is on the task as `_nudge`; it is not a hint the child used). The
// shortening rules and "I can try" (`skipWorked`) write `skipped`.
//
// Not here yet: AI feedback (`onAiFeedback` never calls back, #21).

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
  type LessonStep,
  type MisconceptionId,
  type MisconceptionSpec,
  type NarrationKey,
  type PlannedRequest,
  type PlannedTask,
  type PresentedItem,
  type Recipe,
  type ResponseValue,
  type RunnerFeedback,
  type RunnerTask,
  type SkillGraph,
  type SkillId,
  type TaskRunner,
  type TemplateId,
  type Tier,
  type WidgetAction,
} from '@number-island/shared';
import type { DataStore } from '@/data/store';
import { buildLesson, type LessonExamplePlay, type LessonScript } from './lesson';

/** The engine functions the runner calls (the full entry, loaded through a dynamic import). */
export type RunnerEngine = Pick<
  typeof EngineModule,
  | 'adaptNext'
  | 'checkResponse'
  | 'detectProcessMisconceptions'
  | 'detectStrategies'
  | 'generateItem'
  | 'generateItemFromParams'
  | 'itemSolution'
  | 'PARAMS'
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
  /**
   * The content's misconceptions (03 §7.1). A wrong first try that shows one in how the child
   * worked (the process detectors) is answered with that misconception's own line.
   */
  misconceptions?: readonly Pick<MisconceptionSpec, 'id' | 'feedback'>[];
  /** Takes a remediation `adaptNext` queued (04 §6.4 rule 5); the next plan starts with it. */
  queueRemediation?(remediation: QueuedRemediation): void;
}

export type QueuedRemediation = NonNullable<AdaptDecision['queueRemediation']>;

export type RequestEndReason = Extract<AdaptDecision, { action: 'end-request' }>['reason'];

export interface RequestSummary {
  items: number;
  firstTryCorrect: number;
  /** Why the request ended; `child-exit` when the child left before it did. */
  reason: RequestEndReason | 'child-exit';
  /** What the request produced: one unit per item answered right, from its reward. */
  materials: Recipe;
}

/** What the screen plays after an answer, beyond the shared contract. */
export interface PierFeedback extends RunnerFeedback {
  /** A retry: the rung of the hint ladder to show before the next try. */
  hint: HintStep | null;
  /** The second wrong: the worked solution to play before moving on. */
  solution: LessonStep[] | null;
  /**
   * The screen calls this when it starts to show `hint` or `solution`: only then is the rung
   * used (`hint.used`, `hintsUsed`). A child who leaves during the feedback line before it was
   * never given the hint, and none is logged.
   */
  shown(): void;
}

type LessonStepTask = Extract<RunnerTask, { kind: 'lesson-step' }>;

/** A lesson step as the screen plays it: the shared task plus what the pier needs (02 §5.8: private fields). */
export interface PierLessonStep extends LessonStepTask {
  _tier: Tier;
  /** Changes when the step needs a fresh widget: a new example. */
  _widgetKey: string;
  /** The child's turn: every step that is the child's, in order. Null on a demo step. */
  _turn: LessonStep[] | null;
  /** The child's turn: the demo actions already played in this example. */
  _prior: WidgetAction[];
  /** "I can try" is on offer (grade 1 up, after the first worked step, 03 §6.2). */
  _canSkip: boolean;
}

/** An item as the pier plays it: a scaffolded lesson item carries the rung that opens its ladder. */
export type PierItemTask = Extract<RunnerTask, { kind: 'item' }> & { _nudge?: HintStep };

/** What the child's answer in a faded example leads to. */
export type LessonTurnResult =
  | 'done' // right: the steps are the child's
  | 'again' // one more try, with the same invitation
  | 'demo'; // the second unsuccessful try: the screen demonstrates the steps, then `next()`

/** The app's TaskRunner: the shared contract plus the request's own lifecycle. */
export interface PierTaskRunner extends TaskRunner {
  /** The child's answer on their turn in a faded example (03 §6.2). No attempt is logged. */
  lessonAnswer(r: ResponseValue, meta: { latencyMs: number }): LessonTurnResult;
  /** "I can try": leaves the worked examples for the first faded one. Null when not on offer. */
  skipWorked(): RunnerTask | null;
  submit(
    r: ResponseValue,
    meta: { latencyMs: number; trace?: InteractionEvent[] },
  ): Promise<PierFeedback>;
  /** A long idle period while an item waited for an answer (04 §6.4 rule 4). */
  idle(): void;
  /** Whether the break is on offer: the confidence item is resolved and the child has not chosen. */
  breakOffered(): boolean;
  /** The child's choice: a break ends the request early (`frustration`), with its celebration. */
  answerBreak(take: boolean): void;
  /** Why the request ended, once `next()` has returned null. */
  endReason(): RequestEndReason | null;
  /** Writes `request.completed` (once) and returns the summary. Call when the request is over. */
  finish(): Promise<RequestSummary>;
}

/** A wrong answer this fast counts as a rapid tap (04 §6.4 rule 4). */
const RAPID_TAP_MS = 800;

type ItemTask = PierItemTask;

type LessonPos =
  | { at: 'intro' }
  | { at: 'step'; ex: number; step: number }
  | {
      at: 'turn';
      ex: number;
      tries: number;
      outcome: 'done' | 'demo-corrected' | null;
      /** Right on the first try within the template's expected latency (the shortening rule). */
      fast: boolean;
    }
  | { at: 'scaffold'; n: number }
  | { at: 'outro' };

/** The lesson being played: its place in the request's tasks and where the child is in it. */
interface LessonRun {
  index: number;
  planned: PlannedTask;
  script: LessonScript;
  pos: LessonPos;
}

interface Current {
  index: number;
  item: GeneratedItem;
  task: ItemTask;
  /** A scaffolded lesson item: its number in the lesson (0-based). */
  scaffold?: number;
  /** Right on the first try with no hint. */
  clean: boolean;
  /** Rungs the ladder was opened at (a scaffolded item's nudge): seen, but not a hint used. */
  opened: Set<HintStep['level']>;
  /** Set by `submit`; `next()` acts on it. */
  outcome: 'open' | 'retry' | 'resolved';
  busy: boolean;
  /** The ladder levels shown on this item; each is one `hintsUsed`. */
  shown: Set<HintStep['level']>;
}

/** The request's reward, dealt one unit at a time in its own order, up to `units`. */
function dealMaterials(reward: Recipe, units: number): Recipe {
  const out: Recipe = {};
  const left = Object.entries(reward).map(([id, n]) => [id, n ?? 0] as [string, number]);
  let remaining = units;
  while (remaining > 0 && left.some(([, n]) => n > 0)) {
    for (const entry of left) {
      if (remaining === 0) break;
      if (entry[1] <= 0) continue;
      entry[1] -= 1;
      remaining -= 1;
      const id = entry[0] as keyof Recipe;
      out[id] = (out[id] ?? 0) + 1;
    }
  }
  return out;
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
  let longIdles = 0;
  /** The first try the frustration signals count from: after a declined break, the ones since. */
  let signalsFrom = 0;
  /** Items answered right, on any try: each produces one unit of the request's material. */
  let earned = 0;
  let materialWritten = false;
  /** Where the confidence item sits in the working list, once frustration inserted one. */
  let confidenceAt = -1;
  let breakPending = false;
  /** `hint.used` writes of rungs the child asked for, in order; a submit and `finish` wait for them. */
  let hintWrites: Promise<unknown> = Promise.resolve();
  let resolved = 0;
  let ended: RequestEndReason | null = null;
  let current: Current | null = null;
  let finished: Promise<RequestSummary> | null = null;
  /** The submit being written, if any: `finish` waits for it, so its attempt is counted. */
  let submitting: Promise<unknown> | null = null;
  /** Misconceptions already logged on the item on screen: a second try never logs one again. */
  let loggedOnItem = new Set<MisconceptionId>();
  /** The lesson being played, if the task on screen belongs to one. */
  let lesson: LessonRun | null = null;
  /** Scaffolded lesson items presented so far: items of the request that no plan counted. */
  let scaffolds = 0;

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

  const itemCurrent = (index: number, task: PlannedTask, tpl: ItemTemplate): Current => {
    const difficulty = engine.targetDifficulty(state, task.skillId, task.context, child, graph);
    const item = engine.generateItem(tpl, task.seed, { difficulty });
    const { answer: _answer, ...presented } = item;
    return {
      index,
      item,
      task: {
        kind: 'item',
        task,
        item: presented satisfies PresentedItem,
        attemptNo: 1,
        hintLevel: 0,
        tier: item.tier,
      },
      clean: false,
      opened: new Set(),
      outcome: 'open',
      busy: false,
      shown: new Set(),
    };
  };

  /**
   * Presents the first task at or after `from`: an item, or a lesson's first step. Neither is
   * left when the list has none (a lesson with nothing to show is passed over).
   */
  const present = (from: number): void => {
    current = null;
    lesson = null;
    for (let i = from; i < request.tasks.length; i += 1) {
      const planned = request.tasks[i] as PlannedTask;
      done.push(i);
      if (!isItem(planned)) {
        const skill = graph.skills[planned.skillId];
        const script = skill ? buildLesson(engine, graph, skill, deps.hosts) : null;
        if (!script) continue;
        lesson = { index: i, planned, script, pos: { at: 'intro' } };
        return;
      }
      const tpl = presentedTemplate(planned);
      const task: PlannedTask = { ...planned, templateId: tpl.id };
      request.tasks[i] = task;
      current = itemCurrent(i, task, tpl);
      return;
    }
  };

  // ---------- lessons (03 §6) ----------

  const example = (run: LessonRun, ex: number): LessonExamplePlay =>
    run.script.examples[ex] as LessonExamplePlay;

  /** The step task at the lesson's position; null while a scaffolded item is on screen. */
  const lessonTask = (run: LessonRun): PierLessonStep | null => {
    const { pos, script } = run;
    if (pos.at === 'scaffold') return null;
    const edge = pos.at === 'intro' ? 0 : script.examples.length - 1;
    const ex = pos.at === 'step' || pos.at === 'turn' ? pos.ex : edge;
    const e = example(run, ex);
    const base = {
      kind: 'lesson-step' as const,
      skillId: script.skillId,
      templateId: e.template.id,
      widget: e.item.widget,
      _tier: e.item.tier,
      _widgetKey: `${run.index}:${ex}`,
      _turn: null,
      _prior: [],
      _canSkip: false,
    };
    if (pos.at === 'intro' || pos.at === 'outro') {
      return {
        ...base,
        templateId: script.templateId,
        phase: pos.at,
        example: 0,
        step: 0,
        narration: pos.at === 'intro' ? script.intro : (script.outro as NarrationKey),
        vars: {},
        demo: null,
        childStep: false,
      };
    }
    const stepNo = pos.at === 'step' ? pos.step : e.childFrom;
    const step = e.steps[stepNo] as LessonStep;
    return {
      ...base,
      phase: e.phase,
      example: e.example,
      step: stepNo,
      narration: step.say,
      vars: step.vars ?? {},
      demo: step.action ?? null,
      childStep: pos.at === 'turn',
      _turn: pos.at === 'turn' ? e.steps.slice(e.childFrom) : null,
      _prior:
        pos.at === 'turn'
          ? e.steps.slice(0, e.childFrom).flatMap((s) => (s.action ? [s.action] : []))
          : [],
      // 03 §6.2: from grade 1, after step 1 of the worked examples. K has no skip button.
      _canSkip: !child.isK && e.phase === 'worked' && (ex > 0 || stepNo > 0),
    };
  };

  const shownTask = (): RunnerTask | null =>
    lesson ? (lessonTask(lesson) ?? current?.task ?? null) : (current?.task ?? null);

  const writeStep = (
    run: LessonRun,
    at: Pick<EventPayloads['lesson.step'], 'phase' | 'example' | 'step' | 'actor' | 'outcome'> & {
      templateId?: TemplateId;
    },
  ) => {
    const payload: EventPayloads['lesson.step'] = {
      sessionId: session.sessionId,
      skillId: run.script.skillId,
      templateId: at.templateId ?? run.script.templateId,
      phase: at.phase,
      example: at.example,
      step: at.step,
      actor: at.actor,
      outcome: at.outcome,
    };
    // The request is over (the child left): a screen on its way out records nothing more.
    if (finished) return;
    hintWrites = hintWrites.then(() => store.append('lesson.step', payload, { childId }));
  };

  const writeExampleStep = (
    run: LessonRun,
    ex: number,
    step: number,
    actor: 'demo' | 'child',
    outcome: EventPayloads['lesson.step']['outcome'],
  ) => {
    const e = example(run, ex);
    writeStep(run, {
      templateId: e.template.id,
      phase: e.phase,
      example: e.example,
      step,
      actor,
      outcome,
    });
  };

  /** No new part of a lesson, and no item, starts after the wind-down (04 §6.4 rule 6). */
  const windDown = (): boolean => {
    if (!ended && (session.windingDown() || session.elapsedMs() >= session.budgetMs)) {
      ended = 'wind-down';
    }
    if (ended) {
      current = null;
      lesson = null;
    }
    return ended !== null;
  };

  const leaveLesson = (run: LessonRun): RunnerTask | null => {
    present(run.index + 1);
    if (!current && !lesson && !ended) ended = 'complete';
    return shownTask();
  };

  const enterOutro = (run: LessonRun): RunnerTask | null => {
    current = null;
    if (!run.script.outro) return leaveLesson(run);
    run.pos = { at: 'outro' };
    return lessonTask(run);
  };

  const enterScaffold = (run: LessonRun, n: number): RunnerTask | null => {
    if (windDown()) return null;
    const { script } = run;
    if (n >= script.scaffolded.count) return enterOutro(run);
    run.pos = { at: 'scaffold', n };
    const task: PlannedTask = {
      skillId: script.skillId,
      templateId: script.templateId,
      seed: (run.planned.seed + 7919 * (n + 1)) % 0x7fffffff,
      context: 'lesson',
      mode: 'item',
    };
    const cur = itemCurrent(run.index, task, template(script.templateId));
    cur.scaffold = n;
    // 03 §6.2: the ladder opens at `hintStart`, and that rung plays before the child starts.
    // Level 1 is the prompt again, which every item starts with.
    const nudge =
      script.scaffolded.hintStart > 1
        ? cur.item.hints.find((h) => h.level === script.scaffolded.hintStart)
        : undefined;
    if (nudge) {
      cur.opened.add(nudge.level);
      cur.task = { ...cur.task, _nudge: nudge };
    }
    scaffolds += 1;
    current = cur;
    return cur.task;
  };

  const enterExample = (run: LessonRun, ex: number): RunnerTask | null => {
    if (windDown()) return null;
    if (ex >= run.script.examples.length) return enterScaffold(run, 0);
    run.pos = { at: 'step', ex, step: 0 };
    return lessonTask(run);
  };

  /** `next()` while a lesson step (not a scaffolded item) is on screen. */
  const lessonNext = (run: LessonRun): RunnerTask | null => {
    const { pos } = run;
    if (pos.at === 'intro') {
      writeStep(run, { phase: 'intro', example: 0, step: 0, actor: 'demo', outcome: 'done' });
      return enterExample(run, 0);
    }
    if (pos.at === 'outro') {
      writeStep(run, { phase: 'outro', example: 0, step: 0, actor: 'demo', outcome: 'done' });
      return leaveLesson(run);
    }
    if (pos.at === 'step') {
      const e = example(run, pos.ex);
      writeExampleStep(run, pos.ex, pos.step, 'demo', 'done');
      if (pos.step + 1 < e.childFrom) {
        run.pos = { at: 'step', ex: pos.ex, step: pos.step + 1 };
        return lessonTask(run);
      }
      if (e.childFrom < e.steps.length) {
        run.pos = { at: 'turn', ex: pos.ex, tries: 0, outcome: null, fast: false };
        return lessonTask(run);
      }
      return enterExample(run, pos.ex + 1);
    }
    if (pos.at === 'turn') {
      if (pos.outcome === null) return lessonTask(run);
      const e = example(run, pos.ex);
      if (pos.outcome === 'demo-corrected') {
        for (let i = e.childFrom; i < e.steps.length; i += 1) {
          writeExampleStep(run, pos.ex, i, 'child', 'demo-corrected');
        }
      }
      let nextEx = pos.ex + 1;
      // Shortening (03 §6.2): faded example 1 on the first try, in time → example 2 is skipped.
      if (e.phase === 'faded' && e.example === 0 && pos.fast) {
        while (nextEx < run.script.examples.length) {
          writeExampleStep(run, nextEx, 0, 'demo', 'skipped');
          nextEx += 1;
        }
      }
      return enterExample(run, nextEx);
    }
    return current?.task ?? null;
  };

  /** `next()` after a scaffolded item is resolved. */
  const afterScaffold = (run: LessonRun, cur: Current): RunnerTask | null => {
    const { count } = run.script.scaffolded;
    const n = cur.scaffold ?? 0;
    const scaffolded = (item: number, outcome: 'done' | 'skipped') =>
      writeStep(run, { phase: 'scaffolded', example: item, step: 0, actor: 'child', outcome });
    scaffolded(n, 'done');
    // Shortening (03 §6.2): item 1 right with no hint → the rest are skipped.
    if (n === 0 && cur.clean) {
      for (let i = 1; i < count; i += 1) scaffolded(i, 'skipped');
      return enterOutro(run);
    }
    return enterScaffold(run, n + 1);
  };

  const expectedLatencyMs = (t: ItemTemplate): number =>
    (t.expectedLatencyMs ??
      (t.tier === 'abstract'
        ? engine.PARAMS.rating.expectedLatencyAbstractMs
        : engine.PARAMS.rating.expectedLatencyManipulativeMs)) *
    (child.isK ? engine.PARAMS.rating.kLatencyFactor : 1);

  const lessonAnswer = (r: ResponseValue, meta: { latencyMs: number }): LessonTurnResult => {
    const run = lesson;
    if (run?.pos.at !== 'turn' || run.pos.outcome !== null) {
      throw new Error('TaskRunner.lessonAnswer: no lesson step is waiting for the child');
    }
    const { pos } = run;
    const e = example(run, pos.ex);
    const latencyMs = Math.max(0, Math.round(meta.latencyMs));
    session.recordMath(latencyMs);
    if (engine.checkResponse(e.item, r).correct) {
      pos.outcome = 'done';
      pos.fast = pos.tries === 0 && latencyMs <= expectedLatencyMs(e.template);
      for (let i = e.childFrom; i < e.steps.length; i += 1) {
        writeExampleStep(run, pos.ex, i, 'child', 'done');
      }
      return 'done';
    }
    pos.tries += 1;
    if (pos.tries < 2) return 'again';
    pos.outcome = 'demo-corrected';
    return 'demo';
  };

  const skipWorked = (): RunnerTask | null => {
    const run = lesson;
    if (!run || run.pos.at !== 'step' || !lessonTask(run)?._canSkip) return null;
    let ex = run.pos.ex;
    let step = run.pos.step;
    while (ex < run.script.examples.length && example(run, ex).phase === 'worked') {
      for (; step < example(run, ex).steps.length; step += 1) {
        writeExampleStep(run, ex, step, 'demo', 'skipped');
      }
      ex += 1;
      step = 0;
    }
    return enterExample(run, ex);
  };

  const adapt = (cur: Current, result: CheckResult, attemptNo: number, latencyMs: number) =>
    engine.adaptNext({
      state,
      graph,
      child,
      now: store.now(),
      request,
      doneTaskIds: [...done],
      last: { task: cur.task.task, result, attemptNo, hintsUsed: cur.shown.size, latencyMs },
      signals: {
        wrongInLast4: firstTries
          .slice(signalsFrom)
          .slice(-4)
          .filter((c) => !c).length,
        rapidWrongTaps,
        longIdles,
      },
      tierOverrides,
      elapsedMs: session.windingDown()
        ? Math.max(session.elapsedMs(), session.budgetMs)
        : session.elapsedMs(),
      budgetMs: session.budgetMs,
    });

  /**
   * The rung to show: `wanted` (a retry's level) unless the child has seen it, else the lowest
   * rung of levels 2–4 not shown yet, else the highest one again. Level 1 only when asked for.
   */
  const pickRung = (cur: Current, wanted: HintStep['level'] | null): HintStep | null => {
    const byLevel = (level: HintStep['level']) => cur.item.hints.find((h) => h.level === level);
    const seen = (level: HintStep['level']) => cur.shown.has(level) || cur.opened.has(level);
    const asked = wanted !== null && !seen(wanted) ? byLevel(wanted) : undefined;
    if (asked) return asked;
    const ladder = cur.item.hints.filter((h) => h.level >= 2 && h.level <= 4);
    return (
      ladder.find((h) => !seen(h.level)) ??
      ladder.at(-1) ??
      (wanted !== null ? (byLevel(wanted) ?? null) : null)
    );
  };

  /** Marks a rung as shown; the `hint.used` write it needs, or null for a rung shown before. */
  const markRung = (cur: Current, level: HintStep['level']): (() => Promise<unknown>) | null => {
    if (cur.shown.has(level)) return null;
    cur.shown.add(level);
    const payload: EventPayloads['hint.used'] = {
      sessionId: session.sessionId,
      skillId: cur.item.skillId,
      templateId: cur.item.templateId,
      seed: cur.item.seed,
      level,
    };
    return () => store.append('hint.used', payload, { childId });
  };

  /** The child asks for help: the next rung, or null when no item is waiting for an answer. */
  const hint = (): HintStep | null => {
    const cur = current;
    if (cur?.outcome !== 'open' || cur.busy) return null;
    const step = pickRung(cur, null);
    if (!step) return null;
    const write = markRung(cur, step.level);
    if (write) hintWrites = hintWrites.then(write);
    cur.task = { ...cur.task, hintLevel: step.level };
    return step;
  };

  const queue = (decision: AdaptDecision) => {
    if (decision.queueRemediation) deps.queueRemediation?.(decision.queueRemediation);
  };

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
  present(0);
  if (!current && !lesson) ended = 'complete';

  const submit = (
    r: ResponseValue,
    meta: { latencyMs: number; trace?: InteractionEvent[] },
  ): Promise<PierFeedback> => {
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
  ): Promise<PierFeedback> => {
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
      // The process detectors read the item's whole trace, which on a second try holds both
      // tries (counting again after "let's count again" would read as a recount), so they judge
      // the first try only.
      const process =
        attemptNo === 1 ? engine.detectProcessMisconceptions(item, r, { ...meta, latencyMs }) : [];
      const matched = [...new Set([...checked.misconceptionIds, ...process])];
      // Hints the child asked for are written before the attempt they led to.
      await hintWrites;
      const hintsUsed = cur.shown.size;
      // The answer's own misconception already chose the line (`checkResponse`); one seen only
      // in how the child worked chooses it here.
      const shownInProcess =
        !checked.correct && checked.misconceptionIds.length === 0
          ? deps.misconceptions?.find((m) => m.id === process[0] && !loggedOnItem.has(m.id))
          : undefined;
      const result: CheckResult = {
        ...checked,
        feedback: shownInProcess?.feedback ?? checked.feedback,
        // 04 §2.3: 1 right, 0.5 right with hints, 0 wrong.
        partialCredit: checked.correct ? (hintsUsed > 0 ? 0.5 : 1) : 0,
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
        hintsUsed,
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

      if (attemptNo === 1) cur.clean = result.correct && hintsUsed === 0;

      let decision = adapt(cur, result, attemptNo, latencyMs);
      queue(decision);
      let solution: LessonStep[] | null = null;
      if (decision.action === 'show-solution') {
        // The worked solution is level 5 of the ladder (03 §5.8). The protocol's second call
        // resolves the item (04 §7b).
        solution = engine.itemSolution(item, tpl);
        decision = adapt(cur, result, attemptNo + 1, latencyMs);
        queue(decision);
      }
      // `adaptNext` sees every planned task presented once the lesson is the last one; the lesson
      // itself decides what follows its scaffolded item.
      if (
        cur.scaffold !== undefined &&
        decision.action === 'end-request' &&
        decision.reason === 'complete'
      ) {
        decision = { action: 'continue' };
      }

      let say: NarrationKey | undefined = result.feedback;
      let step: HintStep | null = null;
      if (decision.action === 'retry') {
        cur.outcome = 'retry';
        step = pickRung(cur, decision.hintLevel);
      } else {
        cur.outcome = 'resolved';
        resolved += 1;
        if (result.correct) earned += 1;
        if (decision.action === 'continue') {
          if (decision.tierOverrides) tierOverrides = { ...decision.tierOverrides };
          if (decision.insert) request.tasks.splice(cur.index + 1, 0, ...hosted(decision.insert));
        } else if (decision.action === 'confidence-then-offer-break') {
          // An easy item first, then the offer (04 §6.4 rule 4). When the pier cannot show the
          // item, the offer comes right away.
          const confidence = hosted(decision.insert);
          request.tasks.splice(cur.index + 1, 0, ...confidence);
          if (confidence.length > 0) confidenceAt = cur.index + 1;
          else breakPending = true;
        } else if (decision.action === 'end-request') {
          ended = decision.reason;
        }
        if (cur.index === confidenceAt && !ended) breakPending = true;
        if (result.correct) {
          const [strategy] = engine.detectStrategies(item, r, { ...meta, latencyMs });
          if (strategy) say = strategy.replace(/^strategy\./, 'fb.praise.');
        } else {
          // Moving on after the last try: never the "one more time" line.
          say = solution ? 'fb.reveal' : 'fb.skip';
        }
      }
      return {
        ...result,
        say: { key: say },
        onAiFeedback: () => {},
        retry: decision.action === 'retry',
        hint: step,
        solution,
        shown: () => {
          // The request is over (the child left while this answer was being written): nothing
          // was shown, whatever a screen on its way out still calls.
          if (finished) return;
          const level = solution ? 5 : step?.level;
          if (level === undefined) return;
          const write = markRung(cur, level);
          if (write) hintWrites = hintWrites.then(write);
          if (step && current === cur) cur.task = { ...cur.task, hintLevel: step.level };
        },
      };
    } finally {
      cur.busy = false;
    }
  };

  const next = (): RunnerTask | null => {
    if (lesson && lesson.pos.at !== 'scaffold') return lessonNext(lesson);
    const cur = current;
    if (!cur) return null;
    if (cur.outcome === 'open') return cur.task;
    if (cur.outcome === 'retry') {
      cur.task = { ...cur.task, attemptNo: cur.task.attemptNo + 1 };
      cur.outcome = 'open';
      return cur.task;
    }
    loggedOnItem = new Set();
    // The wind-down may have been signalled while the feedback was showing: no item starts after
    // it (04 §6.4 rule 6: no overrun beyond the current item).
    if (windDown()) return null;
    if (lesson) return afterScaffold(lesson, cur);
    present(cur.index + 1);
    if (!current && !lesson) ended = 'complete';
    return shownTask();
  };

  const finish = (): Promise<RequestSummary> => {
    finished ??= (async () => {
      // An answer still being written belongs to this request: count it.
      await submitting?.catch(() => {});
      await hintWrites.catch(() => {});
      const materials = dealMaterials(request.reward.materials, earned);
      if (!materialWritten && Object.keys(materials).length > 0) {
        const produced: EventPayloads['material.produced'] = {
          sessionId: session.sessionId,
          requestId: request.id,
          workshopId: request.workshopId,
          materials,
        };
        await store.append('material.produced', produced, { childId });
        materialWritten = true;
      }
      const summary: RequestSummary = {
        items: firstTries.length,
        firstTryCorrect: firstTries.filter(Boolean).length,
        reason: current === null && lesson === null && ended ? ended : 'child-exit',
        materials,
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
    current: shownTask,
    submit,
    lessonAnswer,
    skipWorked,
    hint,
    next,
    progress: () => ({
      done: resolved,
      total: request.tasks.filter(isItem).length + scaffolds,
      materialEarned: Object.values(dealMaterials(request.reward.materials, earned)).reduce(
        (sum: number, n) => sum + (n ?? 0),
        0,
      ),
    }),
    idle: () => {
      if (current?.outcome === 'open') longIdles += 1;
    },
    breakOffered: () => breakPending && !ended,
    answerBreak: (take) => {
      if (!breakPending) return;
      breakPending = false;
      if (take && !ended) ended = 'frustration';
      // Playing on is a fresh start: what led to the offer is not held against the next item
      // (`adaptNext` ends the request on a frustration signal after the confidence item).
      rapidWrongTaps = 0;
      longIdles = 0;
      signalsFrom = firstTries.length;
    },
    endReason: () => (current === null && lesson === null ? ended : null),
    finish,
  };
}
