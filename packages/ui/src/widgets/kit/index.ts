// The shared widget kit (U03): pictures, layouts and answer controls the math widgets compose.
// See ./README.md. Widgets import from here; workshops never do (they render WidgetHost).
export {
  applyPadKey,
  CheckButton,
  type CheckButtonProps,
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
export { type FlyOptions, flyFrom } from './motion';
export {
  type NumberLineMark,
  type NumberLineScale,
  NumberLineView,
  type NumberLineViewProps,
  numberLineScale,
  numberLineViewScale,
  stepsBetween,
} from './NumberLineView';
export { fitCell, ObjectSetView, type ObjectSetViewProps } from './ObjectSetView';
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
