// The shared widget kit (U03): pictures, layouts and answer controls the math widgets compose.
// See ./README.md. Widgets import from here; workshops never do (they render WidgetHost).
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
  type InviteHandPlacement,
  placeInviteHand,
  useInviteHand,
} from './inviteHand';

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
