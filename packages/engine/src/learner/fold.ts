// foldSkillStates (02 §4.3, 04 §1): the learner state of one child as a pure fold over the
// family event log. Deterministic and order-independent given the same event set (sorted by
// `ts`, then `id`), and incrementally updatable with `applyLearnerEvent`.

import type {
  AnyEventEnvelope,
  ChildId,
  LearnerState,
  SkillGraph,
  SkillId,
  SkillState,
} from '@number-island/shared';
import { isEvent, sortEvents } from '../folds/order';
import type { EngineParams } from '../params';
import { createEloFireModel, type EloFireModel } from './elo-fire';

export interface FoldLearnerOptions {
  /** The child whose events are folded (events of other children are ignored). */
  childId: ChildId;
  /** K columns of the 04 tables. Default false. */
  isK?: boolean;
  params?: EngineParams;
}

/**
 * Applies one event to a learner state. Applying the events of a full fold one by one, in
 * `ts`/`id` order, gives the full fold. Unknown event types and other children's events are ignored.
 */
export function applyLearnerEvent(
  model: EloFireModel,
  state: LearnerState,
  e: AnyEventEnvelope,
): LearnerState {
  if (isEvent(e, 'child.deleted')) {
    return e.payload.childId === state.childId ? model.init(model.graph, null) : state;
  }
  if (e.childId !== state.childId) return state;
  if (isEvent(e, 'attempt')) return model.apply(state, e.payload, e.ts);
  if (isEvent(e, 'placement.completed')) return model.applyPlacement(state, e.payload, e.ts);
  if (isEvent(e, 'placement.probe')) return model.applyPlacementProbe(state, e.payload);
  if (isEvent(e, 'skill.override')) return model.applyOverride(state, e.payload, e.ts);
  if (isEvent(e, 'session.started')) return model.startSession(state);
  return state;
}

/** The whole `LearnerState` of one child (what the planner and dashboard read). */
export function foldLearnerState(
  events: readonly AnyEventEnvelope[],
  graph: SkillGraph,
  opts: FoldLearnerOptions,
): LearnerState {
  const model = learnerModelFor(graph, opts);
  let state = model.init(graph, null);
  for (const e of sortEvents(events)) state = applyLearnerEvent(model, state, e);
  return state;
}

/**
 * 02 §4.3 `foldSkillStates(events, graph, now)`. Transitions are event-driven, so `now` does not
 * change the fold; statuses at `now` come from `model.status(state, skill, now)`. `opts` names the
 * child (02 §4.3 E02 note); without it every event must belong to one child.
 */
export function foldSkillStates(
  events: readonly AnyEventEnvelope[],
  graph: SkillGraph,
  _now: number,
  opts?: Partial<FoldLearnerOptions>,
): Map<SkillId, SkillState> {
  const childId = opts?.childId ?? soleChild(events);
  if (childId === null) return new Map();
  const state = foldLearnerState(events, graph, { ...opts, childId });
  return new Map(
    Object.keys(state.skills)
      .sort()
      .map((s) => [s, state.skills[s] as SkillState]),
  );
}

export function learnerModelFor(graph: SkillGraph, opts: FoldLearnerOptions): EloFireModel {
  return createEloFireModel(graph, {
    childId: opts.childId,
    isK: opts.isK ?? false,
    ...(opts.params ? { params: opts.params } : {}),
  });
}

function soleChild(events: readonly AnyEventEnvelope[]): ChildId | null {
  const ids = new Set(events.map((e) => e.childId).filter((c): c is ChildId => c !== null));
  if (ids.size === 0) return null;
  if (ids.size > 1) {
    throw new Error(`foldSkillStates needs opts.childId when the events hold ${ids.size} children`);
  }
  return [...ids][0] as ChildId;
}
