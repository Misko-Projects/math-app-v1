// 04 §8 session sim: a minimal, pure TaskRunner stand-in driven by the real engine. It runs one
// simulated child's initial placement and sessions, emitting the learner events a real runner
// would (`session.started`, `attempt`, `placement.probe`, `placement.completed`) and folding each
// into an incremental learner state with `applyLearnerEvent`.
//
// It follows the calling protocol in src/planner/adapt.ts:
// - each item: template = the task's, or another template of the skill with the request's tier
//   override whose format the request's workshop hosts; difficulty = targetDifficulty(…) at
//   presentation; item = generateItem(template, task.seed, { difficulty });
// - after every submit: apply the attempt, then call adaptNext with the working task list,
//   doneTaskIds (the current task included) and the request's signals; `retry` → the child tries
//   again with a hint; `show-solution` → the worked solution plays, then adaptNext is called once
//   more with attemptNo + 1; `continue` → tier overrides replace the request's, `insert` is spliced
//   right after the current task; `confidence-then-offer-break` → the confidence item is spliced in,
//   and once it is resolved the child is offered a break (and sometimes takes it, ending the
//   request); `end-request` ends it.
// Choices this stand-in makes (not engine rules):
// - A lesson task plays its worked and faded example (the learner `study`s it), then the child gives
//   the faded example's hand-over answer: one `lesson` attempt at the lesson template, which goes
//   through adaptNext like any submit (lessons never retry). A lesson whose skill a test-out has
//   already moved to practiced is skipped.
// - Signals are read over the current request: wrongInLast4 from its last 4 first tries on items,
//   rapidWrongTaps and longIdles counted over its attempts.
// - The session's first plan's warmup is presented first, as a one-task request at the first
//   themed workshop hosting its format (else the Practice Pier).
// - Wrong responses are the generator's exampleCorrect perturbed (same response kind); the attempt's
//   correctness is the learner's draw (checkResponse is not consulted).

import {
  type AdaptDecision,
  type AdaptInput,
  type AnyEventEnvelope,
  type AttemptPayload,
  type ChildContext,
  type EventPayloads,
  type EventType,
  FORMAT_DEFAULT_REPRESENTATION,
  type ItemTemplate,
  type LearnerState,
  type MisconceptionId,
  type PlannedRequest,
  type PlannedTask,
  type ResponseValue,
  type SkillGraph,
  type SkillId,
  type Tier,
  type WorkshopCapability,
} from '@number-island/shared';
import { generateItem } from '../../src/items/generate';
import { itemExampleCorrect } from '../../src/items/solution';
import type { EloFireModel } from '../../src/learner/elo-fire';
import { applyLearnerEvent } from '../../src/learner/fold';
import { DAY_MS } from '../../src/params';
import {
  beginPlacementSession,
  completePlacement,
  nextProbe,
  recordProbe,
  startPlacement,
} from '../../src/placement';
import { adaptNext, PRACTICE_PIER, planSession, targetDifficulty } from '../../src/planner';
import { hosts } from '../../src/planner/workshops';
import type { Rng } from '../../src/rng';
import { envelope } from '../support/events';
import { choiceCount, simContent } from './content';
import type { MemoryTrace, SimLearner } from './learner';
import { SIM_WORKSHOPS, simIsland } from './workshops';

/** Simulated time costs. */
export const TIMING = {
  /** Per attempt, on top of the child's latency (prompt narration, feedback, product animation). */
  attemptOverheadMs: 6_000,
  /** Per request (choosing it, the resident's intro, the parade to the Storehouse). */
  requestOverheadMs: 20_000,
  /** A lesson's worked and faded example, before the hand-over answer. */
  lessonMs: 60_000,
  /** A narrated worked solution after the second wrong. */
  solutionMs: 15_000,
  /** Gap between placement probes. */
  probeGapMs: 4_000,
} as const;

/** Contexts whose first tries count for the 04 §8 accuracy metric (and enter `recent`). */
export const EVIDENCE_CONTEXTS: ReadonlySet<AttemptPayload['context']> = new Set([
  'practice',
  'review',
  'warmup',
  'challenge',
  'transfer-probe',
]);

export interface FirstTry {
  session: number;
  ts: number;
  skillId: SkillId;
  context: AttemptPayload['context'];
  mode: PlannedTask['mode'];
  correct: boolean;
  /** The engine's target d* and the generated item's d. */
  targetD: number;
  itemD: number;
  /** The learner's P(correct) for the item (the hidden truth). */
  p: number;
}

/** A retrieval of a skill the child knows (one per item first try), with the model's view after it. */
export interface Retrieval {
  session: number;
  ts: number;
  skillId: SkillId;
  context: AttemptPayload['context'];
  success: boolean;
  /** The hidden recall at the retrieval, before it. */
  recall: number;
  /** The hidden memory after the retrieval. */
  trace: MemoryTrace;
  /** The model's view right after the attempt: practiced track / rated mastered. */
  onTrack: boolean;
  mastered: boolean;
  /** The model's review due time (memory or at-risk, the earlier) and interval after the attempt. */
  dueTs: number | null;
  intervalDays: number | null;
}

export type RequestEnd = 'complete' | 'wind-down' | 'frustration' | 'break' | 'exhausted';

export interface SimChild {
  readonly graph: SkillGraph;
  readonly child: ChildContext;
  readonly model: EloFireModel;
  readonly learner: SimLearner;
  /** The runner's and the child's choices (request pick, the break). */
  readonly rng: Rng;
  state: LearnerState;
  events: AnyEventEnvelope[];
  nextEventId: number;
  firstTries: FirstTry[];
  retrievals: Retrieval[];
  requestEnds: Record<RequestEnd, number>;
  /** adaptNext decisions by action (continue with an insert or a tier override counted apart). */
  decisions: Record<string, number>;
  remediation: { skillId: SkillId; misconceptionId: MisconceptionId } | null;
  /** The family's workshops (default SIM_WORKSHOPS). */
  readonly workshops: readonly WorkshopCapability[];
}

export function createSimChild(
  graph: SkillGraph,
  child: ChildContext,
  model: EloFireModel,
  learner: SimLearner,
  rng: Rng,
  workshops: readonly WorkshopCapability[] = SIM_WORKSHOPS,
): SimChild {
  return {
    graph,
    child,
    model,
    learner,
    rng,
    workshops,
    decisions: {},
    state: model.init(graph, null),
    events: [],
    nextEventId: 1,
    firstTries: [],
    retrievals: [],
    requestEnds: { complete: 0, 'wind-down': 0, frustration: 0, break: 0, exhausted: 0 },
    remediation: null,
  };
}

/** Emits one event and folds it into the incremental state. */
function emit<T extends EventType>(sim: SimChild, type: T, payload: EventPayloads[T], ts: number) {
  // A generic EventEnvelope<T> is one member of the AnyEventEnvelope union, but TypeScript cannot
  // narrow a type parameter to it.
  const e = envelope(
    sim.nextEventId++,
    type,
    payload,
    ts,
    sim.child.childId,
    sim.graph.contentVersion,
  ) as unknown as AnyEventEnvelope;
  sim.events.push(e);
  sim.state = applyLearnerEvent(sim.model, sim.state, e);
}

/** A wrong response of the same kind as `r`. */
function wrongResponse(r: ResponseValue): ResponseValue {
  switch (r.kind) {
    case 'number':
      return { kind: 'number', value: r.value + 1 };
    case 'numbers':
      return { kind: 'numbers', values: r.values.map((v, i) => (i === 0 ? v + 1 : v)) };
    case 'choice':
      return { kind: 'choice', id: `${r.id}-wrong` };
    case 'placement':
      return { kind: 'placement', value: r.value + 1 };
    case 'state':
      return { kind: 'state', value: { ...r.value, simWrong: true } };
    case 'skip':
      return r;
  }
}

function template(graph: SkillGraph, id: string): ItemTemplate {
  const t = graph.templates[id];
  if (!t) throw new Error(`no template ${id}`);
  return t;
}

function onTrack(state: LearnerState, s: SkillId): boolean {
  const st = state.skills[s];
  return st !== undefined && (st.practicedAt !== null || st.assumed);
}

function dueOf(state: LearnerState, s: SkillId): number | null {
  const st = state.skills[s];
  if (!st?.memory) return null;
  return st.atRiskDueTs === null ? st.memory.dueTs : Math.min(st.memory.dueTs, st.atRiskDueTs);
}

function ratedMastered(sim: SimChild, s: SkillId, ts: number): boolean {
  const st = sim.state.skills[s];
  if (!st || st.masteredAt === null) return false;
  const status = sim.model.status(sim.state, s, ts);
  return status === 'mastered' || status === 'needs-review';
}

function recordRetrieval(
  sim: SimChild,
  session: number,
  skillId: SkillId,
  ts: number,
  success: boolean,
  context: AttemptPayload['context'],
) {
  const recall = sim.learner.recall(skillId, ts);
  const trace = sim.learner.retrieve(skillId, ts, success);
  if (!trace) return;
  sim.retrievals.push({
    session,
    ts,
    skillId,
    context,
    success,
    recall,
    trace,
    onTrack: onTrack(sim.state, skillId),
    mastered: ratedMastered(sim, skillId, ts),
    dueTs: dueOf(sim.state, skillId),
    intervalDays: sim.state.skills[skillId]?.memory?.intervalDays ?? null,
  });
}

// ---------- placement ----------

/**
 * The initial placement (04 §5) with real probes at d = 0, one mini-session per simulated day from
 * `startTs`; each mini-session is a session (`session.started`). Returns the day after the last one.
 */
export function runPlacement(sim: SimChild, startTs: number, placementId: string): number {
  const { graph, child, learner, model } = sim;
  const { probeItem } = simContent();
  const ctx = { graph, child };
  let run = startPlacement({ graph, child, state: sim.state, placementId, strand: null });
  let day = 0;
  let ts = startTs;
  let started = false;
  while (run.done === null) {
    if (run.session.ended !== null) {
      run = beginPlacementSession(run);
      day += 1;
      ts = startTs + day * DAY_MS;
      started = false;
      continue;
    }
    const task = nextProbe(run, ctx);
    if (!task) throw new Error(`no probe for an unfinished placement ${placementId}`);
    if (!started) {
      emit(
        sim,
        'session.started',
        { sessionId: `p${day}`, budgetMinutes: child.settings.sessionMinutes, trigger: 'child' },
        ts,
      );
      started = true;
    }
    const tpl = template(graph, task.templateId);
    const item = probeItem(task.templateId, task.seed);
    const choices = choiceCount(item);
    const a = learner.answer({
      skillId: task.skillId,
      difficulty: item.difficulty,
      ...(choices !== undefined ? { choices } : {}),
      expectedLatencyMs: model.expectedLatency({ templateId: task.templateId, tier: item.tier }),
    });
    ts += a.latencyMs + TIMING.probeGapMs;
    const example = itemExampleCorrect(item, tpl);
    const correct = a.correct && !a.skipped;
    const attempt: AttemptPayload = {
      sessionId: `p${day}`,
      skillId: task.skillId,
      templateId: task.templateId,
      seed: task.seed,
      params: item.params,
      format: tpl.format,
      tier: item.tier,
      representation: tpl.representation ?? FORMAT_DEFAULT_REPRESENTATION[tpl.format],
      response: a.skipped ? { kind: 'skip' } : correct ? example : wrongResponse(example),
      correct,
      partialCredit: correct ? 1 : 0,
      latencyMs: a.latencyMs,
      hintsUsed: 0,
      attemptNo: 1,
      misconceptionIds: [],
      context: 'placement',
      workshopId: null,
    };
    const out = recordProbe(run, ctx, {
      skillId: task.skillId,
      templateId: task.templateId,
      seed: task.seed,
      correct: a.correct,
      skipped: a.skipped,
      latencyMs: a.latencyMs,
      ts,
      tier: item.tier,
      ...(choices !== undefined ? { choices } : {}),
      frustrationSignal: a.frustrationSignal,
    });
    run = out.run;
    emit(sim, 'attempt', attempt, ts);
    emit(sim, 'placement.probe', out.event, ts);
    recordRetrieval(sim, -1, task.skillId, ts, correct, 'placement');
  }
  emit(sim, 'placement.completed', completePlacement(run), ts + 1);
  return startTs + (day + 1) * DAY_MS;
}

// ---------- requests ----------

interface Clock {
  sessionId: string;
  session: number;
  startTs: number;
  elapsedMs: number;
  budgetMs: number;
}

const now = (c: Clock): number => c.startTs + c.elapsedMs;

interface RequestRun {
  req: PlannedRequest;
  cap: WorkshopCapability;
  done: number[];
  tierOverrides: Partial<Record<SkillId, Tier>>;
  /** First tries on item tasks in this request, oldest first. */
  firstTries: boolean[];
  rapidWrongTaps: number;
  longIdles: number;
}

function capability(sim: SimChild, workshopId: string): WorkshopCapability {
  const cap = sim.workshops.find((c) => c.workshopId === workshopId);
  if (!cap) throw new Error(`unknown workshop ${workshopId}`);
  return cap;
}

/** The task's template, or the request's tier override for its skill (hosted by the workshop). */
function presentedTemplate(sim: SimChild, run: RequestRun, task: PlannedTask): ItemTemplate {
  const tpl = template(sim.graph, task.templateId);
  const tier = run.tierOverrides[task.skillId];
  if (tier === undefined || tier === tpl.tier) return tpl;
  const alt = (sim.graph.skills[task.skillId]?.templates ?? [])
    .map((id) => sim.graph.templates[id])
    .find((t): t is ItemTemplate => t !== undefined && t.tier === tier && hosts(run.cap, t.format));
  return alt ?? tpl;
}

function adaptInput(
  sim: SimChild,
  clock: Clock,
  run: RequestRun,
  task: PlannedTask,
  last: {
    correct: boolean;
    partialCredit: number;
    attemptNo: number;
    hintsUsed: number;
    latencyMs: number;
  },
): AdaptInput {
  const recent = run.firstTries.slice(-4);
  return {
    state: sim.state,
    graph: sim.graph,
    child: sim.child,
    now: now(clock),
    request: run.req,
    doneTaskIds: [...run.done],
    last: {
      task,
      result: {
        correct: last.correct,
        partialCredit: last.partialCredit,
        misconceptionIds: [],
        feedback: last.correct ? 'fb.correct' : 'fb.try-again',
      },
      attemptNo: last.attemptNo,
      hintsUsed: last.hintsUsed,
      latencyMs: last.latencyMs,
    },
    signals: {
      wrongInLast4: recent.filter((c) => !c).length,
      rapidWrongTaps: run.rapidWrongTaps,
      longIdles: run.longIdles,
    },
    tierOverrides: run.tierOverrides,
    elapsedMs: clock.elapsedMs,
    budgetMs: clock.budgetMs,
  };
}

/** Presents task `i` of the working list; returns the decision that resolves it (null: skipped). */
function presentTask(
  sim: SimChild,
  clock: Clock,
  run: RequestRun,
  i: number,
): AdaptDecision | null {
  const { graph, learner, model, child } = sim;
  const planned = run.req.tasks[i] as PlannedTask;
  const lesson = planned.mode === 'lesson';
  if (lesson && (sim.state.skills[planned.skillId]?.practicedAt ?? null) !== null) return null;
  const tpl = lesson ? template(graph, planned.templateId) : presentedTemplate(sim, run, planned);
  const task: PlannedTask = { ...planned, templateId: tpl.id };
  run.req.tasks[i] = task;
  if (lesson) {
    learner.study(task.skillId, now(clock), 'lesson');
    clock.elapsedMs += TIMING.lessonMs;
  }
  const difficulty = targetDifficulty(sim.state, task.skillId, task.context, child, graph);
  const item = generateItem(tpl, task.seed, { difficulty });
  const choices = choiceCount(item);
  const example = itemExampleCorrect(item, tpl);
  const probe = {
    skillId: task.skillId,
    difficulty: item.difficulty,
    ...(choices !== undefined ? { choices } : {}),
    expectedLatencyMs: model.expectedLatency({ templateId: tpl.id, tier: item.tier }),
  };
  let attemptNo = 1;
  let hintsUsed = 0;
  let decision: AdaptDecision;
  for (;;) {
    // The faded example of a lesson is scaffolded: it answers with the hint bonus.
    const hinted = lesson || attemptNo > 1;
    const pTrue = learner.pNow(probe, now(clock), hinted);
    const r = learner.respond(probe, now(clock), hinted);
    clock.elapsedMs += r.latencyMs + TIMING.attemptOverheadMs;
    const ts = now(clock);
    const partialCredit = r.correct ? (hintsUsed > 0 ? 0.5 : 1) : 0;
    const attempt: AttemptPayload = {
      sessionId: clock.sessionId,
      skillId: task.skillId,
      templateId: tpl.id,
      seed: task.seed,
      params: item.params,
      format: tpl.format,
      tier: item.tier,
      representation: tpl.representation ?? FORMAT_DEFAULT_REPRESENTATION[tpl.format],
      response: r.correct ? example : wrongResponse(example),
      correct: r.correct,
      partialCredit,
      latencyMs: r.latencyMs,
      hintsUsed,
      attemptNo,
      misconceptionIds: [],
      context: task.context,
      workshopId: run.req.workshopId,
    };
    emit(sim, 'attempt', attempt, ts);
    if (r.rapidWrong) run.rapidWrongTaps += 1;
    if (r.idle) run.longIdles += 1;
    if (attemptNo === 1) {
      sim.firstTries.push({
        session: clock.session,
        ts,
        skillId: task.skillId,
        context: task.context,
        mode: task.mode,
        correct: r.correct,
        targetD: difficulty,
        itemD: item.difficulty,
        p: pTrue,
      });
      if (!lesson) {
        run.firstTries.push(r.correct);
        recordRetrieval(sim, clock.session, task.skillId, ts, r.correct, task.context);
      }
    }
    const last = {
      correct: r.correct,
      partialCredit,
      attemptNo,
      hintsUsed,
      latencyMs: r.latencyMs,
    };
    decision = adaptNext(adaptInput(sim, clock, run, task, last));
    if (decision.action === 'retry') {
      attemptNo += 1;
      hintsUsed += 1;
      continue;
    }
    if (decision.action === 'show-solution') {
      clock.elapsedMs += TIMING.solutionMs;
      decision = adaptNext(
        adaptInput(sim, clock, run, task, { ...last, attemptNo: attemptNo + 1 }),
      );
    }
    break;
  }
  if (!lesson) learner.study(task.skillId, now(clock), 'item');
  return decision;
}

/** Runs one request through adaptNext until it ends. */
function runRequest(sim: SimChild, clock: Clock, request: PlannedRequest): RequestEnd {
  const run: RequestRun = {
    req: { ...request, tasks: [...request.tasks] },
    cap: capability(sim, request.workshopId),
    done: [],
    tierOverrides: {},
    firstTries: [],
    rapidWrongTaps: 0,
    longIdles: 0,
  };
  clock.elapsedMs += TIMING.requestOverheadMs;
  let confidenceAt = -1;
  for (let i = 0; i < run.req.tasks.length; i++) {
    run.done.push(i);
    const d = presentTask(sim, clock, run, i);
    if (d === null) continue;
    const kind =
      d.action === 'continue' && d.insert
        ? 'continue+insert'
        : d.action === 'continue' && d.tierOverrides
          ? 'continue+tier'
          : d.action === 'end-request'
            ? `end:${d.reason}`
            : d.action;
    sim.decisions[kind] = (sim.decisions[kind] ?? 0) + 1;
    if (d.queueRemediation && sim.remediation === null) sim.remediation = d.queueRemediation;
    if (d.action === 'continue') {
      if (d.tierOverrides) run.tierOverrides = { ...d.tierOverrides };
      if (d.insert) run.req.tasks.splice(i + 1, 0, ...d.insert);
    } else if (d.action === 'confidence-then-offer-break') {
      run.req.tasks.splice(i + 1, 0, ...d.insert);
      confidenceAt = i + 1;
    }
    const end = endAfter(d, i === confidenceAt, () =>
      sim.rng.bool(sim.learner.profile.learning.takeBreak),
    );
    if (end !== null) return end;
  }
  return 'exhausted';
}

/**
 * How a request ends after a decision, or null when it goes on. The break is offered once the
 * confidence item resolves (`breakOffered`), also when that item was the last task and its
 * resolution completes the request; `takesBreak` draws the child's answer only when it is offered.
 */
export function endAfter(
  d: AdaptDecision,
  breakOffered: boolean,
  takesBreak: () => boolean,
): RequestEnd | null {
  if (d.action === 'end-request') {
    return breakOffered && d.reason === 'complete' && takesBreak() ? 'break' : d.reason;
  }
  return breakOffered && takesBreak() ? 'break' : null;
}

// ---------- sessions ----------

export interface SessionResult {
  requests: number;
  elapsedMs: number;
}

/** One session at `startTs`: warmup, then plan → pick → run → re-plan until the budget. */
export function runSession(sim: SimChild, session: number, startTs: number): SessionResult {
  const { child, graph } = sim;
  const minutes = child.settings.sessionMinutes;
  const clock: Clock = {
    sessionId: `s${session}`,
    session,
    startTs,
    elapsedMs: 0,
    budgetMs: minutes * 60_000,
  };
  emit(
    sim,
    'session.started',
    { sessionId: clock.sessionId, budgetMinutes: minutes, trigger: 'child' },
    startTs,
  );
  const island = simIsland(startTs);
  const plan = (at: number, mins: number) => {
    const remediation = sim.remediation;
    sim.remediation = null;
    return planSession(
      {
        child,
        state: sim.state,
        graph,
        now: at,
        minutes: mins,
        workshopsAvailable: [...sim.workshops],
        island,
      },
      remediation ? { remediation } : {},
    );
  };
  let current = plan(startTs, minutes);

  // The warmup: a one-task request at a themed workshop hosting its format.
  const w = current.warmup;
  const wFormat = template(graph, w.templateId).format;
  const wCap =
    sim.workshops.find((c) => c.workshopId !== PRACTICE_PIER && hosts(c, wFormat)) ??
    capability(sim, PRACTICE_PIER);
  const warmup: PlannedRequest = {
    id: `${clock.sessionId}-warmup`,
    residentId: wCap.residents[0] ?? 'pip',
    workshopId: wCap.workshopId,
    tasks: [w],
    reward: { materials: {} },
    narration: 'req.help',
    vars: {},
  };
  runRequest(sim, clock, warmup); // not counted as a request
  let requests = 0;
  let first = true;
  while (clock.elapsedMs < clock.budgetMs && requests < 40) {
    if (!first) current = plan(now(clock), (clock.budgetMs - clock.elapsedMs) / 60_000);
    first = false;
    const offered = current.requests.filter((r) => r.tasks.length > 0);
    if (offered.length === 0) break;
    // The child picks: usually the first offer, otherwise any other.
    const pick =
      offered.length === 1 || sim.rng.bool(0.6)
        ? (offered[0] as PlannedRequest)
        : (offered[sim.rng.int(1, offered.length - 1)] as PlannedRequest);
    const end = runRequest(sim, clock, pick);
    sim.requestEnds[end] += 1;
    requests += 1;
  }
  return { requests, elapsedMs: clock.elapsedMs };
}
