// 02 §4.3 projections: island, inventory, collection and weekly goals (the learner fold is in
// ../learner). Each has `initX`, the incremental `applyXEvent` and the full `foldX`; folding the
// events one by one in ts/id order equals the full fold.

export {
  applyCollectionEvent,
  type EngineCollectionState,
  foldCollection,
  initCollection,
} from './collection';
export {
  applyGoalsEvent,
  DEFAULT_WEEKLY_GOAL,
  type EngineWeeklyGoalState,
  foldGoals,
  type GoalSettings,
  initGoals,
} from './goals';
export { applyInventoryEvent, foldInventory, initInventory } from './inventory';
export {
  applyIslandEvent,
  type EngineIslandState,
  foldIsland,
  initIsland,
  islandFacts,
} from './island';
export { compareEvents, eventTime, isEvent, sameId, sortEvents } from './order';
export { childKey, tombstonedChildren, withoutDeletedChildren } from './tombstones';
export { evaluateUnlock, type UnlockFacts } from './unlock';
