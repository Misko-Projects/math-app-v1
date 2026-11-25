// @number-island/engine: pure TypeScript (no DOM, React, Math.random or Date.now). E01 delivers
// the item core: seeded RNG, generator registry, item generation and targeting, checking,
// misconception matching, hint ladders and the fixture formats' state models. See README.md.
//
// This is the full entry. Loading it installs the item core that the learner model needs (02 §6a,
// #95). An app shell imports `@number-island/engine/shell` instead and loads this entry through a
// dynamic import, so generators, checkers and misconception rules stay out of its initial JS.

import './items/install';

export { type StateChecker, stateChecker } from './check/state';
// U05 (#14) measurement and geometry: format state types and the geometry their widgets draw.
export { inRelation } from './check/state/compose.relative';
export {
  area as polygonArea,
  FILL_TOLERANCE,
  overlapArea,
  PIECE_CORNERS,
  PIECE_SYMMETRY,
  type Placement,
  placeCorners,
  type Vec,
} from './check/state/pieces';
export { ruleMatches } from './check/state/sort.byRule';
export {
  type ContentBinding,
  initContent,
  resetContent,
  type TemplateStats,
} from './content/binding';
export { constraintHolds, ExprError } from './content/expr';
export { render, renderForms } from './content/render';
export * from './folds';
export type { FormatModel, FormatState } from './formats';
export { formatFeatures, formatModel, formatModels, UnsupportedOpError } from './formats';
// U04 (#13) format state types and the helpers their widgets render from.
export {
  AREA_SIDE_MAX,
  AREA_WORK_H_MAX,
  AREA_WORK_W_MAX,
  type AreaTilesState,
  areaAnswerIssues,
  areaAnswerMax,
  areaWorked,
  fillsBox,
  isRectangle,
  isRectPiece,
  maskArea,
  regionPieces,
  type Split,
} from './formats/area-tiles';
export {
  ARRAY_FOUND_MAX,
  ARRAY_SIDE_MAX,
  type ArrayBuildState,
  alreadyFound,
  arrayAnswerIssues,
  arrayAnswerMax,
  rectanglesOf,
} from './formats/array-build';
export {
  BALANCE_N_MAX,
  BALANCE_PAN_MAX,
  BALANCE_PAN_OBJECTS_MAX,
  BALANCE_VALUES_MAX,
  BALANCE_WEIGHT_MAX,
  type BalanceState,
  type BalanceTerm,
  balanceAnswerIssues,
  balanceBlanks,
  balanceChoices,
  balanceEntryMax,
  balanceValues,
  heavier,
  sideValue,
} from './formats/balance';
export {
  BUILD_BAR_MAX,
  BUILD_DATA_TALLY_MAX,
  BUILD_LINE_POSITIONS_MAX,
  BUILD_PICTURES_MAX,
  GRAPH_ANSWER_MAX,
  GRAPH_BAR_ROWS_MAX,
  GRAPH_BAR_STEPS_MAX,
  GRAPH_COLUMNS_MAX,
  GRAPH_LABEL_CHARS_MAX,
  GRAPH_LINE_POSITIONS_MAX,
  GRAPH_LINE_STACK_MAX,
  GRAPH_PICTURES_MAX,
  GRAPH_ROWS_MAX,
  GRAPH_TALLY_MAX,
  GRAPH_VERTICAL_TOP_MAX,
  graphLabelIssues,
} from './formats/bar-graph';
export {
  type BarGraphBuildState,
  BUILD_DATA_MEASUREMENTS_MAX,
  BUILD_DATA_OBJECTS_MAX,
  barGraphBuildAnswerIssues,
  buildTargets,
} from './formats/bar-graph-build';
export {
  asksCategory,
  type BarGraphReadState,
  barGraphReadAnswer,
  barGraphReadAnswerIssues,
  readAnswerMax,
} from './formats/bar-graph-read';
export { type BaseTenBuildState, traySupply } from './formats/base-ten-build';
export {
  type BaseTenTradeState,
  computeResult,
  htoValue,
  TRADE_ADD_OPERAND_HUNDREDS_MAX,
  TRADE_ADD_START_HUNDREDS_MAX,
  TRADE_ALL_ONES_MAX,
  TRADE_COLUMN_MAX,
  TRADE_REGROUP_COLUMN_MAX,
  TRADE_TAKE_COUNT_MAX,
  TRADE_VALUE_MAX,
} from './formats/base-ten-trade';
// U05 (#14) picture geometry the kit draws `fraction` and `chart` stimuli from.
export {
  axisTicks,
  axisTop,
  type ChartSlot,
  chartSlots,
  linePositions,
  positionId,
  slotValues,
  symbolParts,
  tallyGroups,
} from './formats/chart';
// U05 (#14) time
export {
  clockText,
  hourAngle,
  minuteAngle,
  onFace,
  snapTime,
  timeOf,
  turnMinuteHand,
} from './formats/clock';
export {
  AMPM_SCENES,
  type AmPmScene,
  type ClockReadState,
  isAmPmScene,
  isDaylight,
  isHourPick,
  readChoiceIds,
} from './formats/clock-read';
export type { ClockHand, ClockSetState } from './formats/clock-set';
// U05 (#14) money
export { coinAnswerIssues, coinAnswerSpec } from './formats/coin-answer';
export {
  type CoinCountState,
  type CountPiece,
  type CountSide,
  runningTotal,
  shownPieces,
} from './formats/coin-count';
export {
  type CoinPayState,
  payTrayCapacity,
  trayAnswers,
  trayOf,
} from './formats/coin-pay';
export {
  CL_END_MAX,
  CL_LENGTH_MAX,
  CL_OBJECTS_MAX,
  CL_OFFSET_MAX,
  type CompareLengthState,
  closeness,
  startOf,
} from './formats/compare-length';
export {
  type EqualGroupsState,
  GROUP_CAPACITY,
  GROUPS_MAX,
  GROUPS_PILE_MAX,
  GROUPS_PILE_MAX_MANY,
  GROUPS_PILE_WIDE,
  groupsAnswerMax,
  groupsPileMax,
  groupsPlaces,
  groupsSupply,
  groupsUnknown,
} from './formats/equal-groups';
export {
  type EqualShareState,
  SHARE_ITEMS_MAX,
  SHARE_RECIPIENTS_MAX,
  SHARE_ZONE_MAX,
  SHARE_ZONE_MAX_MANY,
  shareCapacity,
  shareChoices,
  sharesEqual,
  shareZoneMax,
} from './formats/equal-share';
export {
  blankIds,
  EF_BLANKS_MAX,
  EF_CARD_MAX,
  EF_CARDS_MAX,
  EF_TARGET_MAX,
  EF_TOKENS_MAX,
  EF_WORD_OPTIONS_MAX,
  type ExpandedFormState,
} from './formats/expanded-form';
// U05 (#14) fraction format states.
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
  fractionLineTicks,
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
export { PATTERN_SHOWN_MAX, patternGiven } from './formats/hundred-chart';
export {
  changeOwed,
  changeTrayCapacity,
  countUpPath,
  countUpStops,
  type MakeChangeState,
} from './formats/make-change';
export {
  isNonStandard,
  type LaidUnit,
  type LengthUnit,
  lengthIn,
  type MeasureLengthState,
  ML_LAID_MAX,
  ML_LENGTH_MAX,
  ML_OFFSET_MAX,
  ML_OPTION_MAX,
  ML_OPTIONS_MAX,
  objectUnits,
  SIXTEENTHS,
  UNIT_SIZE,
} from './formats/measure-length';
export {
  PIECE_CENTS,
  type Purse,
  type PurseKind,
  parseTrayKey,
  purseLimit,
  type Tray,
  trayCents,
  trayKey,
} from './formats/money';
export {
  lineLabels,
  lineSteps,
  lineTicks,
  type NumberLinePlaceState,
  snapPlacement,
} from './formats/number-line-place';
export {
  blankIndexes,
  coreValues,
  MAX_TILES,
  PATTERN_BLANKS_MAX,
  PATTERN_COLORS,
  PATTERN_LENGTH_MAX,
  PATTERN_NUMBER_MAX,
  PATTERN_SHAPES,
  PATTERN_TABLE_ROWS_MAX,
  PATTERN_TRANSLATE_LENGTH_MAX,
  PATTERN_TYPED_LENGTH_MAX,
  PATTERN_UNITS_MAX,
  type PatternExtendState,
  patternAnswerIssues,
  smallestPeriod,
  tableBlanks,
  tokenFamily,
  tokenNumber,
} from './formats/pattern-extend';
export {
  designRectangles,
  type PerimeterWalkState,
  PW_DESIGN_AREA_MAX,
  PW_DESIGN_PERIMETER_MAX,
  PW_DESIGN_SIDE_MAX,
  PW_PERIMETER_MAX,
  PW_SIDE_MAX,
  PW_SIDES_MAX,
  polygonPoints,
  resolvedSides,
  sidesMatch,
} from './formats/perimeter-walk';
export {
  COLUMNS,
  type Column,
  canonicalPieces,
  DISK_COLUMN_MAX,
  type Hto,
  PIECE_KINDS,
  PIECE_VALUE,
  type PieceKind,
  type Pieces,
  piecesValue,
} from './formats/place-value';
export {
  type GridCell,
  PUZZLE_CAGE_CELLS_MAX,
  PUZZLE_GRID,
  PUZZLE_NUMBER_MAX,
  PUZZLE_PALETTE_MAX,
  PUZZLE_STEP_MAX,
  PUZZLE_VARIANTS,
  type PuzzleGridState,
  type PuzzleLine,
  type PuzzleMark,
  type PuzzleValue,
  type PuzzleVariant,
  puzzleAnswerIssues,
  puzzleBlanks,
  puzzleLine,
  puzzleUnmet,
  rectanglePairs,
  TRIANGLE_CELLS,
  TRIANGLE_SIDES,
} from './formats/puzzle-grid';
export {
  drawingPoints,
  type PlacedPiece,
  pieceCentre,
  SC_ANCHORS_MAX,
  SC_GRID_COLS_MAX,
  SC_GRID_ROWS_MAX,
  SC_OUTLINE_EXTENT_MAX,
  SC_OUTLINE_POINTS_MAX,
  SC_PIECE_KINDS_MAX,
  SC_PIECES_MAX,
  SC_REQUIRE_MAX,
  SC_STICKS_MAX,
  SCENE_SIZE,
  type ShapeComposeState,
  stickCount,
  turnAboutCentre,
} from './formats/shape-compose';
export {
  isShapeCard,
  type ShapeSortState,
  SS_BINS_MAX,
  SS_CARDS_MAX,
  SS_NUMBER_MAX,
  SS_PICK_CARDS_MAX,
  SS_ROTATION_MAX,
  SS_RULE_VALUE_MAX,
  SS_SCALE_MAX,
  SS_SCALE_MIN,
  sortCardProps,
  TRAY,
} from './formats/shape-sort';
export {
  answersSplit,
  SITUATION_PRIOR,
  STORY_BAR_PARTS_MAX,
  STORY_COLOUR_LINES_OF_A_WHOLE,
  STORY_COLOURS,
  STORY_COUNTERS_MAX,
  STORY_DIGITS_MAX,
  STORY_LINE_COLOURS,
  STORY_LINES_MAX,
  STORY_SCENE_GROUPS_MAX,
  STORY_SCENE_ROWS_MAX,
  STORY_SCENE_TOTAL_MAX,
  type StoryColour,
  type StoryProblemState,
  storyAnswerIssues,
  storyEntryMax,
  storySceneColours,
  storySceneRows,
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
export { ANCHOR_SIZE, pointFor } from './generators/geo/position';
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
