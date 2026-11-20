// @number-island/engine: pure TypeScript (no DOM, React, Math.random or Date.now). E01 delivers
// the item core: seeded RNG, generator registry, item generation and targeting, checking,
// misconception matching, hint ladders and the fixture formats' state models. See README.md.
//
// This is the full entry. Loading it installs the item core that the learner model needs (02 §6a,
// #95). An app shell imports `@number-island/engine/shell` instead and loads this entry through a
// dynamic import, so generators, checkers and misconception rules stay out of its initial JS.

import './items/install';

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
// U04 (#13) format state types and the helpers their widgets render from.
export {
  type AreaTilesState,
  isRectangle,
  isRectPiece,
  maskArea,
  regionPieces,
  type Split,
} from './formats/area-tiles';
export { type ArrayBuildState, alreadyFound, rectanglesOf } from './formats/array-build';
export {
  type BalanceState,
  type BalanceTerm,
  balanceBlanks,
  balanceChoices,
  heavier,
  sideValue,
} from './formats/balance';
export { type BaseTenBuildState, traySupply } from './formats/base-ten-build';
export { type BaseTenTradeState, computeResult, htoValue } from './formats/base-ten-trade';
export { type EqualGroupsState, GROUP_CAPACITY, groupsUnknown } from './formats/equal-groups';
export { type EqualShareState, shareChoices } from './formats/equal-share';
export { blankIds, type ExpandedFormState } from './formats/expanded-form';
export {
  COLUMNS,
  type Column,
  canonicalPieces,
  type Hto,
  PIECE_KINDS,
  PIECE_VALUE,
  type PieceKind,
  type Pieces,
  piecesValue,
} from './formats/place-value';
export {
  type PuzzleGridState,
  type PuzzleValue,
  puzzleBlanks,
} from './formats/puzzle-grid';
export {
  answersSplit,
  SITUATION_PRIOR,
  type StoryProblemState,
} from './formats/story-problem';
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
export {
  type ItemCore,
  ItemCoreNotLoadedError,
  installItemCore,
  itemCore,
  itemCoreLoaded,
} from './item-core';
export { isConstructedTemplate, templateAnswerKind } from './items/answer-kind';
export { attemptDifficulty } from './items/attempt-difficulty';
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
export { ITEM_CORE_MARKS } from './items/install';
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
export * from './placement';
export * from './planner';
export { createRng, fnv1a32, type Rng } from './rng';
export * from './signals';
export { detectStrategies } from './strategies';
