// Characters (05 §1, §5, §9; 07 §7; U02): Pip, Glim and the procedural Pebbling generator.
export { CHARACTER_CONTRAST_PAIRS } from './contrast';
export { GLIM_STATES, Glim, type GlimProps, type GlimState } from './Glim';
export { Pebbling, type PebblingProps } from './Pebbling';
export { PIP_POSES, Pip, type PipPose, type PipProps } from './Pip';
export {
  COIN_LOOK,
  COIN_VALUES,
  type CoinValue,
  CRITTER_H,
  CRITTER_W,
  clockHour,
  coinValue,
  effectiveFamily,
  fractionParts,
  hundredFrames,
  PALETTE_FILLS,
  type PaletteFills,
  PEBBLE_MARK,
  PEBBLING_FAMILIES,
  PEBBLING_PALETTES,
  PEBBLING_POSES,
  PEBBLING_SPECIES,
  type PebblingFamily,
  type PebblingPalette,
  type PebblingPose,
  type PebblingSpec,
  type PebblingSpecies,
  paletteOf,
  pebblingFromResident,
  speciesOf,
  TEN_FRAME,
  type TenFrameSlot,
  tenFrameSlots,
  tensLayout,
} from './pebbling';
