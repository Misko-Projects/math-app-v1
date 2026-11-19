// The shared widget kit (U03): pictures, layouts and answer controls the math widgets compose.
// See ./README.md. Widgets import from here; workshops never do (they render WidgetHost).
export {
  CLOCK,
  ClockFace,
  type ClockFaceProps,
  ClockView,
  DigitalClock,
  faceTime,
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
export {
  applyPadKey,
  balancedRows,
  CheckButton,
  type CheckButtonProps,
  createSubmitGuard,
  NumberPadKeys,
  type NumberPadKeysProps,
  NumeralTray,
  type NumeralTrayProps,
  type PadKey,
  PickCard,
  type PickCardProps,
  padValue,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from './controls';
export {
  dicePattern,
  dotsLayout,
  type FrameOutline,
  groupIndexes,
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
export {
  type NumberLineMark,
  type NumberLineScale,
  NumberLineView,
  type NumberLineViewProps,
  numberLineScale,
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
export {
  BaseTenView,
  ExpressionView,
  FingersView,
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
