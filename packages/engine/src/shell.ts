// @number-island/engine/shell: what an app needs at startup (02 §6a, #95): the skill graph, the
// event folds, the learner model, the seeded RNG and the engine parameters. It imports no
// generator, state checker, misconception rule or format model, so a bundler keeps those out of
// the initial JS. Everything here is also exported by the full entry, `@number-island/engine`.
//
// The learner model needs the item core (`item-core.ts`): load the full entry, for example with
// `await import('@number-island/engine')`, before folding learner state or building a model.

export * from './folds';
export {
  type ItemCore,
  ItemCoreNotLoadedError,
  itemCoreLoaded,
} from './item-core';
export * from './learner';
export { DAY_MS, type EngineParams, PARAMS } from './params';
export { createRng, fnv1a32, type Rng } from './rng';
export * from './signals';
