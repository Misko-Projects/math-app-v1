// The shared widget kit (U03): pictures, layouts and answer controls the math widgets compose.
// See ./README.md. Widgets import from here; workshops never do (they render WidgetHost).

export { useActionSize } from './actionSize';
export {
  ARRANGEMENTS,
  type Arrangement,
  ASK_ARRANGEMENTS,
  arrangedSize,
  type Candidate,
  compactCardW,
  firstFit,
  INVITE_ROOM_PX,
  MAX_ZOOM,
  numeralCardH,
  numeralTraySize,
  overflow,
  pickByFill,
  type Size,
  trayColumnChoices,
  withInviteRoom,
  zoomed,
  zoomFor,
} from './arrange';
export {
  CategoryLabel,
  ChartView,
  type ChartViewProps,
  chartBox,
  useMeasuredBox,
} from './ChartView';
export {
  CLOCK,
  ClockFace,
  type ClockFaceProps,
  ClockView,
  clockHandAt,
  DigitalClock,
  faceTime,
  HAND_GRAB,
  polarPoint,
} from './ClockView';
export {
  BillArt,
  type BillArtProps,
  COIN_CENTS,
  COIN_CONTRAST_PAIRS,
  COIN_PAINT,
  CoinArt,
  type CoinArtProps,
  coinPx,
  coinRadius,
  type MoneyPiece,
  moneyNameKey,
  moneyText,
  useMoneySpeech,
} from './CoinArt';
export { CoinsView, type CoinsViewProps, coinsCentsOf, pictureQuarterPx } from './CoinsView';
export { type ChartGeometry, chartGeometry, type SlotGeometry } from './chartLayout';
export { useCommitBarrier } from './commit';
export {
  applyPadKey,
  CheckButton,
  type CheckButtonProps,
  createSubmitGuard,
  NumberPadKeys,
  type NumberPadKeysProps,
  NumeralTray,
  type NumeralTrayProps,
  numeralCardPx,
  type PadKey,
  PickCard,
  type PickCardProps,
  padValue,
  TRAY_PANEL_EDGES_PX,
  trayGrid,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from './controls';
export {
  cellToFit,
  countLayout,
  FitPicture,
  type FitPictureProps,
  fittedLineNumeralPx,
  LINE_BARE_PAD,
  naturalPictureSize,
  numberLineHeight,
  Scaled,
  tenFrameLayout,
  useSharedScale,
  wrapLine,
} from './FitPicture';
export { FractionEntry, type FractionEntryProps } from './FractionEntry';
export {
  CutLines,
  FracNumeral,
  FractionParts,
  FractionView,
  type FractionViewProps,
  WholeBase,
  WholeOutline,
} from './FractionView';
export { FLY_MS, useFlight } from './flight';
export {
  boxCutPaths,
  cutPaths,
  fitScale,
  GRID_CELL,
  type PartGeom,
  pictureGeoms,
  rectParts,
  type ShapeFrame,
  sectorParts,
  sectorPath,
  shapeFrame,
} from './fractionShapes';
export {
  DIAL_START,
  DIAL_SWEEP,
  dialAngle,
  GAUGE_UNIT,
  type GaugeSpec,
  GaugeView,
  type GaugeViewProps,
  gaugeLabels,
  gaugeTicks,
  levelY,
} from './GaugeView';
export {
  INVITE_GLYPH_SELECTOR,
  INVITE_HAND_PX,
  INVITE_TARGET_SELECTOR,
  type InviteHandDirection,
  type InviteHandPlacement,
  type InviteHandSide,
  placeInviteHand,
  useInviteHand,
} from './inviteHand';
export { useOncePerKeyPress } from './keyPress';
export {
  dicePattern,
  dotsLayout,
  type FrameOutline,
  groupIndexes,
  minObjectStep,
  type ObjectLayout,
  objectSetLayout,
  type PlacedObject,
} from './layout';
export {
  type BoardItem,
  type BoardTarget,
  MoneyBoard,
  type MoneyBoardProps,
  MoneyTag,
  PIECE_ORDER,
  pieceCents,
  purseLimits,
} from './MoneyBoard';
export { type FlyOptions, flyFrom } from './motion';
export {
  type EntryKind,
  type EntryLayout,
  entryChoices,
  entryGroups,
  entryKind,
  entrySize,
  entryValues,
  NumberEntry,
  type NumberEntryProps,
  nextPadKey,
  TRAY_MAX,
} from './NumberEntry';
export {
  type NumberLineMark,
  type NumberLineScale,
  NumberLineView,
  type NumberLineViewProps,
  numberLineScale,
  numberLineViewScale,
  numeralText,
  stepsBetween,
} from './NumberLineView';
export { fitCell, ObjectSetView, type ObjectSetViewProps } from './ObjectSetView';
export {
  applyBoxKey,
  type PadBox,
  PadBoxView,
  type PadBoxViewProps,
  padBoxValue,
  usePadEntry,
} from './PadEntry';
export { useWidgetRoom, type WidgetRoom } from './room';
export { isRoomy, ROOMY_HEIGHT_PX, ROOMY_WIDTH_PX, useRoomy } from './roomy';
export {
  countedParts,
  equalSideGroups,
  markFor,
  PIECE_SIDE,
  regularPolygon,
  type ShapeBox,
  type ShapeGeometry,
  type ShapeMark,
  ShapeSetView,
  ShapeView,
  type ShapeViewProps,
  shapeBox,
  shapeColor,
  shapeExtent,
  shapeGeometry,
  shapeSetUnit,
  squareCorners,
} from './ShapeView';
export { Stepper, type StepperProps } from './Stepper';
export {
  BaseTenView,
  ExpressionView,
  FingersView,
  HandArt,
  NumberBondView,
  RekenrekView,
  StimulusView,
  type StimulusViewProps,
  TenFrameView,
} from './StimulusView';
export {
  ObjectSprite,
  type ObjectSpriteProps,
  SPRITE_IDS,
  type SpriteTone,
  spriteNameKey,
} from './sprites';
export { STIMULUS_KINDS, type StimulusKind, stimulusDrawn } from './stimulusKinds';
