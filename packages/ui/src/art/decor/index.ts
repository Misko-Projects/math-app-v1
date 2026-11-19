import type { ItemArt } from '../core/types';
import { DECOR_IDS, type DecorId } from './catalog';
import { decorArtComponent } from './DecorArt';

// Decor (05 §6; U02): flowers, lamps, flags, paths, fountains… Keyed by GameData art id
// `decor/<id>`.
export const decorArt: Readonly<Record<DecorId, ItemArt>> = Object.fromEntries(
  DECOR_IDS.map((id) => [id, decorArtComponent(id)]),
) as Record<DecorId, ItemArt>;

export { DECOR, DECOR_DESIGN, DECOR_IDS, type DecorId } from './catalog';
export { DECOR_CONTRAST_PAIRS } from './contrast';
export {
  DecorPiece,
  type DecorPieceProps,
  DecorSvg,
  type DecorSvgProps,
  DecorTile,
  type DecorTileProps,
  decorAnchor,
  decorBox,
} from './DecorArt';
export {
  DECOR_GROUPS,
  type DecorDef,
  type DecorGroup,
  type DesignBox,
  type Footprint,
  groundY,
} from './kit';
