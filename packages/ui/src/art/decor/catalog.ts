import { BEACH_DECOR } from './beach';
import { FESTIVAL_DECOR } from './festival';
import { GARDEN_DECOR } from './garden';
import type { DecorDef, DesignBox, Footprint } from './kit';
import { STAR_DECOR } from './stars';

/** Every decor id (05 §6), with GameData art id `decor/<id>`. */
export const DECOR_IDS = [
  'shell-bench',
  'flower-pot',
  'tulip-patch',
  'daisy-patch',
  'palm-tree',
  'beach-umbrella',
  'sandcastle',
  'picket-fence',
  'stepping-path',
  'rock-pile',
  'round-bush',
  'mailbox',
  'tide-pool',
  'driftwood-sign',
  'lamp-post',
  'flag-pole',
  'fountain',
  'bird-bath',
  'windmill',
  'garden-arch',
  'swing-bench',
  'kite-stand',
  'lantern-string',
  'bunting',
  'rainbow-arch',
  'paper-lanterns',
  'festival-drum',
  'shell-chime',
  'picnic-blanket',
  'star-balloon',
  'sea-glass-mosaic',
  'star-statue',
  'crystal-tower',
  'telescope',
  'moon-lamp',
] as const;

export type DecorId = (typeof DECOR_IDS)[number];

export const DECOR: Readonly<Record<DecorId, DecorDef>> = {
  ...GARDEN_DECOR,
  ...BEACH_DECOR,
  ...FESTIVAL_DECOR,
  ...STAR_DECOR,
};

/**
 * The design map (U02): each item's footprint in plots and its art box in scene units around the
 * anchor, the bottom-centre of the footprint box (one plot is 100 × 70, ISLAND_LAYOUT). Place an
 * item on `plot` at `decorAnchor(id, plot)`; its art covers `decorBox(id, plot)`.
 */
export const DECOR_DESIGN: Readonly<Record<DecorId, { footprint: Footprint; viewBox: DesignBox }>> =
  Object.fromEntries(
    DECOR_IDS.map((id) => [id, { footprint: DECOR[id].footprint, viewBox: DECOR[id].viewBox }]),
  ) as Record<DecorId, { footprint: Footprint; viewBox: DesignBox }>;
