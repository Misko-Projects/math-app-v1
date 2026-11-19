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
