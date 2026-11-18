// foldGoals (02 §4.3, 05 §7 weekly goal): per child, the current week's progress toward
// `ChildSettings.weeklyGoal`. Accumulate-only: progress never decreases within a week and a past
// week is never lost. `goal.progress` carries the week (Monday, family timezone) the app computed.

import type {
  AnyEventEnvelope,
  ChildId,
  ChildSettings,
  WeeklyGoalState,
} from '@number-island/shared';
import { isEvent, sortEvents } from './order';
import { own } from './records';
import { childKey, fromDeletedChild } from './tombstones';

/** The weekly targets by child. A child without settings uses the G1+ default (6, 04 §6.1 / 02 §5.8). */
export type GoalSettings = Readonly<Record<ChildId, Pick<ChildSettings, 'weeklyGoal'>>>;
export const DEFAULT_WEEKLY_GOAL = 6;

/** Private bookkeeping: progress per week per child. */
export type EngineWeeklyGoalState = WeeklyGoalState & {
  _weeks?: Record<ChildId, Record<string, number>>;
  /** Lower-case ids of tombstoned children (08 §4). */
  _deleted?: string[];
};

export function initGoals(): EngineWeeklyGoalState {
  return { byChild: {} };
}

/**
 * The child's target, with the settings' child ids compared case-insensitively. When several
 * spellings of one child are present, the canonical lower-case key wins, then the smallest key,
 * so the result never depends on record order.
 */
function weeklyTarget(settings: GoalSettings, child: string): number {
  const exact = own(settings, child);
  if (exact) return exact.weeklyGoal;
  const ids = Object.keys(settings)
    .filter((id) => childKey(id) === child)
    .sort();
  const first = ids[0];
  return first !== undefined
    ? (own(settings, first)?.weeklyGoal ?? DEFAULT_WEEKLY_GOAL)
    : DEFAULT_WEEKLY_GOAL;
}

function summarize(weeks: Record<string, number>, target: number) {
  const starts = Object.keys(weeks).sort();
  const weekStart = starts[starts.length - 1] as string;
  return {
    weekStart,
    target,
    progress: weeks[weekStart] as number,
    weeksCompleted: starts.filter((w) => (weeks[w] as number) >= target).length,
  };
}

export function applyGoalsEvent(
  state: EngineWeeklyGoalState,
  e: AnyEventEnvelope,
  settings: GoalSettings,
): EngineWeeklyGoalState {
  if (fromDeletedChild(state._deleted, e)) return state;
  if (isEvent(e, 'goal.progress')) {
    if (e.childId === null) return state;
    const child = childKey(e.childId);
    const weeks = { ...(own(state._weeks, child) ?? {}) };
    weeks[e.payload.weekStart] =
      (own(weeks, e.payload.weekStart) ?? 0) + Math.max(0, e.payload.delta);
    const target = weeklyTarget(settings, child);
    return {
      ...state,
      byChild: { ...state.byChild, [child]: summarize(weeks, target) },
      _weeks: { ...state._weeks, [child]: weeks },
    };
  }
  if (isEvent(e, 'child.deleted')) {
    const key = childKey(e.payload.childId);
    if (state._deleted?.includes(key)) return state;
    const { [key]: _a, ...byChild } = state.byChild;
    const { [key]: _b, ...weeks } = state._weeks ?? {};
    return { byChild, _weeks: weeks, _deleted: [...(state._deleted ?? []), key].sort() };
  }
  return state;
}

export function foldGoals(
  events: readonly AnyEventEnvelope[],
  settings: GoalSettings,
): EngineWeeklyGoalState {
  return sortEvents(events).reduce((s, e) => applyGoalsEvent(s, e, settings), initGoals());
}
