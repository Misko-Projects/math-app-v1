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
export { type BaseTenBuildState, traySupply } from './formats/base-ten-build';
export { type BaseTenTradeState, computeResult, htoValue } from './formats/base-ten-trade';
export { type EqualGroupsState, GROUP_CAPACITY, groupsUnknown } from './formats/equal-groups';
export { type EqualShareState, shareChoices } from './formats/equal-share';
export { blankIds, type ExpandedFormState } from './formats/expanded-form';
// U05 (#14) fraction format states and the geometry their widgets draw from.
export {
  type CutRect,
  type CutSector,
  cutGuides,
  cutShares,
  type FractionCutState,
  MAX_CUT_PARTS,
  partCount,
  shadedParts,
} from './formats/fraction-cut';
export * from './formats/fraction-geometry';
export {
  type FractionLineState,
  lineTicks,
  MAX_LINE_DENOMINATOR,
  targetValue,
} from './formats/fraction-line';
export {
  FAIR_CHOICES,
  type FractionPickState,
  labelFraction,
  MIN_PICK_OPTIONS,
  nameInputOf,
  pickChoices,
  usesOptions,
} from './formats/fraction-pick';
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
export * from './placement';
export * from './planner';
export { createRng, fnv1a32, type Rng } from './rng';
export * from './signals';
export { detectStrategies } from './strategies';
