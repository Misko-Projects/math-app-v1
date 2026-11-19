import type { Plot } from '@number-island/shared';
import { ISLAND_LAYOUT, type Point, plotBox } from '../island/geometry';

/**
 * Building ids (05 §4, §6; the GameData `art` id is `building/<id>`): the 13 workshops and the
 * Practice Pier, the Storehouse, the four homes and the three shared projects.
 */
export const BUILDING_IDS = [
  'road-crew',
  'lantern-grove',
  'ten-boat-dock',
  'treasure-beach',
  'brick-factory',
  'garden-terraces',
  'bakery',
  'market',
  'clock-tower',
  'builders-yard',
  'weigh-station',
  'rhythm-orchard',
  'puzzle-tower',
  'practice-pier',
  'storehouse',
  'shell-cottage',
  'driftwood-hut',
  'burrow-house',
  'reef-house',
  'lighthouse',
  'east-bridge',
  'festival-stage',
] as const;

export type BuildingArtId = (typeof BUILDING_IDS)[number];

export interface BuildingDesign {
  /** Footprint in plots [w, h], as in GameData `buildings[].footprint`. */
  footprint: readonly [number, number];
  /** How far the art rises above its anchor (the bottom-centre of the footprint), in scene units. */
  rise: number;
  /**
   * How far the art reaches below its anchor: the contact shadow, or for coast buildings the water
   * inlet that runs out past the beach into the sea (place these on coast plots).
   */
  below: number;
  /** The art's viewBox in scene units, with the anchor at 0,0. */
  viewBox: { x: number; y: number; w: number; h: number };
}

/**
 * Room left and right of the footprint (flags, eaves) and below it (the contact shadow; `water` for
 * the inlet of a coast building).
 */
export const BUILDING_PAD = { side: 10, bottom: 12, water: 36 } as const;

function design(
  footprint: readonly [number, number],
  rise: number,
  below: number = BUILDING_PAD.bottom,
): BuildingDesign {
  const w = footprint[0] * ISLAND_LAYOUT.cellW;
  return {
    footprint,
    rise,
    below,
    viewBox: {
      x: -w / 2 - BUILDING_PAD.side,
      y: -rise,
      w: w + 2 * BUILDING_PAD.side,
      h: rise + below,
    },
  };
}

/** Buildings whose art opens onto the sea (a water inlet): they belong on coast plots. */
export const COAST_BUILDINGS: readonly BuildingArtId[] = [
  'ten-boat-dock',
  'practice-pier',
  'clock-tower',
  'east-bridge',
];

/**
 * The design map (U02): every building's footprint (matching GameData) and its art box. All
 * buildings share one scale (scene units: one plot is 100 × 70), one outline weight and one light
 * direction, so they sit together on the island without resizing.
 */
export const BUILDING_DESIGN: Readonly<Record<BuildingArtId, BuildingDesign>> = {
  'road-crew': design([2, 1], 184),
  'lantern-grove': design([2, 2], 216),
  'ten-boat-dock': design([3, 1], 166, BUILDING_PAD.water),
  'treasure-beach': design([2, 1], 164),
  'brick-factory': design([2, 2], 172),
  'garden-terraces': design([2, 2], 170),
  bakery: design([2, 1], 146),
  market: design([2, 1], 158),
  'clock-tower': design([1, 2], 300, BUILDING_PAD.water),
  'builders-yard': design([2, 2], 156),
  'weigh-station': design([2, 1], 220),
  'rhythm-orchard': design([2, 2], 160),
  'puzzle-tower': design([1, 2], 306),
  'practice-pier': design([2, 1], 122, BUILDING_PAD.water),
  storehouse: design([2, 2], 164),
  'shell-cottage': design([1, 1], 148),
  'driftwood-hut': design([1, 1], 148),
  'burrow-house': design([1, 1], 148),
  'reef-house': design([1, 1], 148),
  lighthouse: design([2, 2], 290),
  'east-bridge': design([3, 1], 112, BUILDING_PAD.water),
  'festival-stage': design([2, 2], 220),
};

/** The anchor (bottom-centre) of a footprint placed with its top-left plot at `plot`. */
export function buildingAnchor(plot: Plot, footprint: readonly [number, number]): Point {
  const b = plotBox(plot, footprint);
  return { x: b.x + b.w / 2, y: b.y + b.h };
}
