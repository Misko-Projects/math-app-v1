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

import type * as EngineModule from '@number-island/engine';
import { compareEvents, foldLearnerState, isEvent, sameId } from '@number-island/engine/shell';
import type { ChildContext, SkillGraph } from '@number-island/shared';
import type { DataStore } from './store';

export const GRADE_PRIOR_PREFIX = 'grade-prior:';

/** The placement id of the grade prior for this grade and "working above grade" setting. */
export const gradePriorId = (child: Pick<ChildContext, 'grade' | 'advanced'>): string =>
  `${GRADE_PRIOR_PREFIX}${child.grade}${child.advanced ? '+' : ''}`;

type PlacementStore = Pick<DataStore, 'db' | 'append' | 'skillStates'>;

// A check in progress per store and child: the island's plan effect can run twice at once (a
// re-render, React's development double run), and both would find no placement and write one.
const pending = new WeakMap<PlacementStore, Map<string, Promise<boolean>>>();

/**
 * Writes the child's grade-prior placement unless the latest one (in fold order) is already for
 * the child's current grade. Returns whether it wrote one; a call while one for the same child
 * and grade is in progress returns that call's answer. The placement runner is passed in,
 * because the shell's initial JS holds only `@number-island/engine/shell` (02 §6a).
 */
export function ensureGradePlacement(
  engine: Pick<typeof EngineModule, 'gradePriorPlacement'>,
  store: PlacementStore,
  graph: SkillGraph,
  child: ChildContext,
): Promise<boolean> {
  const byChild = pending.get(store) ?? new Map<string, Promise<boolean>>();
  pending.set(store, byChild);
  const key = `${child.childId.toLowerCase()}|${gradePriorId(child)}`;
  const running = byChild.get(key);
  if (running) return running;
  const run = writeIfMissing(engine, store, graph, child).finally(() => byChild.delete(key));
  byChild.set(key, run);
  return run;
}

async function writeIfMissing(
  engine: Pick<typeof EngineModule, 'gradePriorPlacement'>,
  store: PlacementStore,
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
    engine.gradePriorPlacement({ graph, child, state, placementId: id }),
    { childId: child.childId },
  );
  return true;
}
