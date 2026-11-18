// 04 §7 derived signals for the parent dashboard: pure functions over the learner state and the
// family event log. Every event list is read in `ts`, then `id` order (sortEvents), so the output
// is deterministic and independent of the input order. Time comes in as parameters.

import type {
  AnyEventEnvelope,
  AttemptPayload,
  ChildContext,
  ChildId,
  ItemFormat,
  LearnerState,
  MisconceptionId,
  MisconceptionSpec,
  ParamValues,
  RatedAttempt,
  ResponseValue,
  Skill,
  SkillId,
  SkillState,
  SkillStatus,
  StrandId,
  Tier,
} from '@number-island/shared';
import { TIERS } from '@number-island/shared';
import { eventTime, isEvent, sameId, sortEvents } from '../folds/order';
import { childKey, withoutDeletedChildren } from '../folds/tombstones';
import type { EloFireModel } from '../learner/elo-fire';
import { PARAMS } from '../params';

// ---------- skill map ----------

export interface SkillMapEntry {
  skillId: SkillId;
  strand: StrandId;
  status: SkillStatus;
  /** P(correct) at the reference difficulty d = 0. */
  pRef: number;
  /** SkillState.recent: the last 10 evidence first attempts, newest last. */
  recent: RatedAttempt[];
  /** Distinct formats of the independent (correct, no hints) entries of `recent`, sorted. */
  formats: ItemFormat[];
  /** Distinct tiers of the independent entries of `recent`, concrete → pictorial → abstract. */
  tiers: Tier[];
  /** min(memory.dueTs, atRiskDueTs), or null when neither is set. */
  nextReviewTs: number | null;
  retrievability: number | null;
  assumed: boolean;
  override: SkillState['override'];
}

/** One entry per skill of the graph, in `graph.nodes` (topological) order. */
export function skillMap(model: EloFireModel, state: LearnerState, now: number): SkillMapEntry[] {
  return model.graph.nodes.map((skillId) => {
    const st = state.skills[skillId];
    const recent = st?.recent ?? [];
    const independent = recent.filter((r) => r.correct && !r.hinted);
    const formats = [...new Set(independent.map((r) => r.format))].sort();
    const tierSet = new Set(independent.map((r) => r.tier));
    const dues = [st?.memory?.dueTs ?? null, st?.atRiskDueTs ?? null].filter(
      (t): t is number => t !== null,
    );
    return {
      skillId,
      strand: (model.graph.skills[skillId] as Skill).strand,
      status: model.status(state, skillId, now),
      pRef: model.pRef(state, skillId),
      recent: [...recent],
      formats,
      tiers: TIERS.filter((t) => tierSet.has(t)),
      nextReviewTs: dues.length > 0 ? Math.min(...dues) : null,
      retrievability: model.retrievability(state, skillId, now),
      assumed: st?.assumed ?? false,
      override: st?.override ?? null,
    };
  });
}

// ---------- misconception alerts ----------

/** 04 §6.4 rule 5: attempts per skill looked at, and the matches that raise an alert. */
export const MISCONCEPTION_WINDOW = 10;
export const MISCONCEPTION_MIN_MATCHES = 2;
/** Example attempts shown with an alert (the most recent first). */
export const MISCONCEPTION_EXAMPLES = 3;

export interface MisconceptionExample {
  params: ParamValues;
  response: ResponseValue;
  ts: number;
}

export interface MisconceptionAlert {
  misconceptionId: MisconceptionId;
  skillId: SkillId;
  /** Matching attempts among the child's last 10 non-placement attempts on the skill. */
  count: number;
  /** ts of the newest matching attempt. */
  lastTs: number;
  /** Up to 3 matching attempts, newest first. */
  examples: MisconceptionExample[];
  /** The suggested offline activity (MisconceptionSpec.parentTip), null for an unknown id. */
  parentTip: string | null;
  remediation: SkillId[];
}

export function misconceptionAlerts(
  events: readonly AnyEventEnvelope[],
  childId: ChildId,
  misconceptions: readonly MisconceptionSpec[],
): MisconceptionAlert[] {
  const specs = new Map(misconceptions.map((m) => [m.id, m]));
  const bySkill = new Map<SkillId, { ts: number; payload: AttemptPayload }[]>();
  for (const e of withoutDeletedChildren(sortEvents(events))) {
    if (!sameId(e.childId, childId) || !isEvent(e, 'attempt')) continue;
    if (e.payload.context === 'placement') continue;
    const list = bySkill.get(e.payload.skillId) ?? [];
    list.push({ ts: eventTime(e), payload: e.payload });
    bySkill.set(e.payload.skillId, list);
  }

  const alerts: MisconceptionAlert[] = [];
  for (const [skillId, attempts] of bySkill) {
    const window = attempts.slice(-MISCONCEPTION_WINDOW);
    const matches = new Map<MisconceptionId, { ts: number; payload: AttemptPayload }[]>();
    for (const a of window) {
      for (const id of new Set(a.payload.misconceptionIds)) {
        const list = matches.get(id) ?? [];
        list.push(a);
        matches.set(id, list);
      }
    }
    for (const [misconceptionId, hits] of matches) {
      if (hits.length < MISCONCEPTION_MIN_MATCHES) continue;
      const newestFirst = [...hits].reverse();
      const spec = specs.get(misconceptionId);
      alerts.push({
        misconceptionId,
        skillId,
        count: hits.length,
        lastTs: (newestFirst[0] as (typeof hits)[number]).ts,
        examples: newestFirst.slice(0, MISCONCEPTION_EXAMPLES).map((h) => ({
          params: { ...h.payload.params },
          response: h.payload.response,
          ts: h.ts,
        })),
        parentTip: spec?.parentTip ?? null,
        remediation: spec ? [...spec.remediation] : [],
      });
    }
  }
  return alerts.sort(
    (a, b) =>
      b.lastTs - a.lastTs ||
      compareStrings(a.skillId, b.skillId) ||
      compareStrings(a.misconceptionId, b.misconceptionId),
  );
}

// ---------- time ----------

export interface ChildTimeSignals {
  /** Active minutes per local day ('YYYY-MM-DD' in the family timezone, keyed by session end). */
  minutesByDay: Record<string, number>;
  sessionsStarted: { child: number; parent: number };
  /** natural = 'wind-down'; other = 'child-exit', 'daily-cap', 'quiet-hours'. */
  endings: { natural: number; abandoned: number; other: number };
}

export interface TimeSignals {
  /** Children with at least one session event, keys in sorted order. */
  byChild: Record<ChildId, ChildTimeSignals>;
}

export function timeSignals(
  events: readonly AnyEventEnvelope[],
  opts: { timezone: string },
): TimeSignals {
  const dateOf = localDateFormatter(opts.timezone);
  const acc = new Map<
    ChildId,
    {
      activeMsByDay: Map<string, number>;
      sessionsStarted: { child: number; parent: number };
      endings: { natural: number; abandoned: number; other: number };
    }
  >();
  const forChild = (childId: ChildId) => {
    let a = acc.get(childId);
    if (!a) {
      a = {
        activeMsByDay: new Map(),
        sessionsStarted: { child: 0, parent: 0 },
        endings: { natural: 0, abandoned: 0, other: 0 },
      };
      acc.set(childId, a);
    }
    return a;
  };

  for (const e of withoutDeletedChildren(sortEvents(events))) {
    if (e.childId === null) continue;
    if (isEvent(e, 'session.started')) {
      forChild(childKey(e.childId)).sessionsStarted[e.payload.trigger] += 1;
    } else if (isEvent(e, 'session.ended')) {
      const a = forChild(childKey(e.childId));
      const date = dateOf(eventTime(e));
      a.activeMsByDay.set(date, (a.activeMsByDay.get(date) ?? 0) + e.payload.activeMs);
      const reason = e.payload.reason;
      if (reason === 'wind-down') a.endings.natural += 1;
      else if (reason === 'abandoned') a.endings.abandoned += 1;
      else a.endings.other += 1;
    }
  }

  const byChild: Record<ChildId, ChildTimeSignals> = {};
  for (const childId of [...acc.keys()].sort(compareStrings)) {
    const a = acc.get(childId) as NonNullable<ReturnType<typeof acc.get>>;
    const minutesByDay: Record<string, number> = {};
    for (const date of [...a.activeMsByDay.keys()].sort()) {
      minutesByDay[date] = roundTenth((a.activeMsByDay.get(date) as number) / 60_000);
    }
    byChild[childId] = { minutesByDay, sessionsStarted: a.sessionsStarted, endings: a.endings };
  }
  return { byChild };
}

/** ts → 'YYYY-MM-DD' in `timezone`, or in UTC when the timezone is not a valid IANA name. */
function localDateFormatter(timezone: string): (ts: number) => string {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: timezone });
  } catch {
    fmt = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' });
  }
  return (ts) => {
    const parts = fmt.formatToParts(ts);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
}

// ---------- accuracy band ----------

/** 04 §2.4 table: practice p* for K and for G1+ (G1 uses the G1+ column, 04 §2.4 "Grade columns"). */
export const PRACTICE_TARGET = { k: 0.88, g1plus: 0.85 } as const;

/** First attempts outside the rolling window (04 §7a, the controller's reading). */
const ACCURACY_EXCLUDED: ReadonlySet<AttemptPayload['context']> = new Set(['placement', 'lesson']);

export interface AccuracyBand {
  /** First-try accuracy over the last `n` first attempts (at most 20), null when there are none. */
  accuracy: number | null;
  n: number;
  /** Practice p* (04 §2.4). */
  target: number;
  /** Against the controller band [PARAMS.controller.low, PARAMS.controller.high]; null when no attempts. */
  band: 'below' | 'on' | 'above' | null;
}

export function accuracyBand(
  events: readonly AnyEventEnvelope[],
  childId: ChildId,
  child: Pick<ChildContext, 'isK'>,
): AccuracyBand {
  const firstTries: boolean[] = [];
  for (const e of withoutDeletedChildren(sortEvents(events))) {
    if (!sameId(e.childId, childId) || !isEvent(e, 'attempt')) continue;
    if (e.payload.attemptNo !== 1 || ACCURACY_EXCLUDED.has(e.payload.context)) continue;
    firstTries.push(e.payload.correct);
  }
  const window = firstTries.slice(-PARAMS.controller.window);
  const target = child.isK ? PRACTICE_TARGET.k : PRACTICE_TARGET.g1plus;
  if (window.length === 0) return { accuracy: null, n: 0, target, band: null };
  const accuracy = window.filter(Boolean).length / window.length;
  const band =
    accuracy < PARAMS.controller.low ? 'below' : accuracy > PARAMS.controller.high ? 'above' : 'on';
  return { accuracy, n: window.length, target, band };
}

// ---------- math density ----------

export interface MathDensityEntry {
  sessionId: string;
  /** ts of the session.ended event. */
  ts: number;
  activeMs: number;
  mathMs: number;
  /** mathMs / activeMs, clamped to [0, 1]; 0 when activeMs is 0. */
  density: number;
}

export function mathDensity(
  events: readonly AnyEventEnvelope[],
  childId: ChildId,
): MathDensityEntry[] {
  const out: MathDensityEntry[] = [];
  for (const e of withoutDeletedChildren(sortEvents(events))) {
    if (!sameId(e.childId, childId) || !isEvent(e, 'session.ended')) continue;
    const { sessionId, activeMs, mathMs } = e.payload;
    const density = activeMs > 0 ? Math.min(1, Math.max(0, mathMs / activeMs)) : 0;
    out.push({ sessionId, ts: eventTime(e), activeMs, mathMs, density });
  }
  return out;
}

// ---------- helpers ----------

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function roundTenth(x: number): number {
  return Math.round(x * 10) / 10;
}
