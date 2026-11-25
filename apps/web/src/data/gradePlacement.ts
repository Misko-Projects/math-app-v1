// The child's starting level before the placement adventure (04 §5, Refs #26): one zero-probe
// initial placement, the engine's grade prior for the profile's grade and "working above grade",
// recorded as a `placement.completed` like any other event.
//
// Its placement id names the grade it was written for (`grade-prior:2+` = grade 2, advanced).
// It is written when the child has none yet (a new child, or one created before this existed)
// and again when the latest one names another grade (the parent changed the profile, on any
// device). A rewrite leaves out every skill the child has attempts on, so real evidence is never
// overwritten; it only moves the starting level of untried skills. Two devices may both write
// one for the same grade: the fold applies the same posterior twice, which changes nothing.

import {
  compareEvents,
  foldLearnerState,
  gradePriorPlacement,
  isEvent,
  sameId,
} from '@number-island/engine';
import type { ChildContext, SkillGraph } from '@number-island/shared';
import type { DataStore } from './store';

export const GRADE_PRIOR_PREFIX = 'grade-prior:';

/** The placement id of the grade prior for this grade and "working above grade" setting. */
export const gradePriorId = (child: Pick<ChildContext, 'grade' | 'advanced'>): string =>
  `${GRADE_PRIOR_PREFIX}${child.grade}${child.advanced ? '+' : ''}`;

/**
 * Writes the child's grade-prior placement unless the latest one (in fold order) is already for
 * the child's current grade. Returns whether it wrote one.
 */
export async function ensureGradePlacement(
  store: Pick<DataStore, 'db' | 'append' | 'skillStates'>,
  graph: SkillGraph,
  child: ChildContext,
): Promise<boolean> {
  const id = gradePriorId(child);
  const rows = await store.db.events.where('type').equals('placement.completed').toArray();
  const latest = rows
    .filter((e) => isEvent(e, 'placement.completed'))
    .filter(
      (e) =>
        sameId(e.childId, child.childId) && e.payload.placementId.startsWith(GRADE_PRIOR_PREFIX),
    )
    .sort(compareEvents)
    .at(-1);
  if (latest?.payload.placementId === id) return false;
  const state =
    (await store.skillStates(child.childId)) ??
    foldLearnerState([], graph, { childId: child.childId, isK: child.isK });
  await store.append(
    'placement.completed',
    gradePriorPlacement({ graph, child, state, placementId: id }),
    { childId: child.childId },
  );
  return true;
}
