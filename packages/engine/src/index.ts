// @number-island/engine: pure TypeScript (no DOM, React, Math.random or Date.now). E01 delivers
// the item core: seeded RNG, generator registry, item generation and targeting, checking,
// misconception matching, hint ladders and the fixture formats' state models. See README.md.

export { type StateChecker, stateChecker } from './check/state';
export {
  type ContentBinding,
  initContent,
  resetContent,
  type TemplateStats,
} from './content/binding';
export { constraintHolds, ExprError } from './content/expr';
export { render } from './content/render';
export * from './folds';
export type { FormatModel, FormatState } from './formats';
export { formatFeatures, formatModel, formatModels, UnsupportedOpError } from './formats';
export {
  type BuildContext,
  GenerationError,
  type GeneratorDef,
  type GeneratorOutput,
  type ParamDecl,
  registry,
} from './generators';
export { inDomain, specDomain } from './generators/common';
export {
  generatorFeatures,
  generatorIdentifiers,
  generatorParams,
  generatorRegistered,
} from './hooks';
export { isConstructedTemplate, templateAnswerKind } from './items/answer-kind';
export { checkResponse, detectProcessMisconceptions, matches } from './items/check';
export { type DevEvent, setDevLogger } from './items/devlog';
export { difficulty, featureWeight, resolvedWeights } from './items/difficulty';
export {
  generateItem,
  generateItemFromParams,
  itemFeatures,
  itemKey,
  mergedSpec,
} from './items/generate';
export { buildHints } from './items/hints';
export { itemExampleCorrect, itemSolution, replaySteps } from './items/solution';
export * from './learner';
export {
  applicableMisconceptions,
  itemGenerator,
  type MisconceptionRule,
  misconceptionRule,
  registeredRuleIds,
} from './misconceptions';
export { DAY_MS, type EngineParams, PARAMS } from './params';
export * from './planner';
export { createRng, fnv1a32, type Rng } from './rng';
export * from './signals';
