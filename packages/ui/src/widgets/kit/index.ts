// The shared widget kit (U03): pictures, layouts and answer controls the math widgets compose.
// See ./README.md. Widgets import from here; workshops never do (they render WidgetHost).
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
  dicePattern,
  dotsLayout,
  type FrameOutline,
  groupIndexes,
  type ObjectLayout,
  objectSetLayout,
  type PlacedObject,
} from './layout';
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
  countedParts,
  equalSideGroups,
  markFor,
  regularPolygon,
  type ShapeGeometry,
  type ShapeMark,
  ShapeSetView,
  ShapeView,
  type ShapeViewProps,
  shapeColor,
  shapeExtent,
  shapeGeometry,
  squareCorners,
} from './ShapeView';
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
