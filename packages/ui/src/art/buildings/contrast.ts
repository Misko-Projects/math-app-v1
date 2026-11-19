import type { ArtContrastPair } from '../core/contrast';

/**
 * The meaningful mark/background pairs the buildings draw (06 §7), checked by day and at sunset in
 * buildings.test.ts with `pairRatio`. Buildings carry no numerals; the clock face is the one
 * math-relevant mark (W9 reads it), so it is held to the 4.5:1 numeral bar.
 */
export const BUILDING_CONTRAST_PAIRS: readonly ArtContrastPair[] = [
  { use: 'Clock tick marks and hands on the clock face', fg: 'ink', bg: 'cloud', min: 4.5 },
  {
    use: 'Ten-Boat seat outlines on the hull (count the ten seats)',
    fg: 'ink',
    bg: 'coral',
    min: 3,
  },
  { use: 'Ten-Boat seat outlines on the seat cushion', fg: 'ink', bg: 'cloud', min: 3 },
  { use: 'Window frame on a paper wall', fg: 'wood-deep', bg: 'paper', min: 3 },
  { use: 'Window frame on a sand wall', fg: 'wood-deep', bg: 'sand', min: 3 },
  { use: 'Window frame on a pebble wall or porthole ring', fg: 'wood-deep', bg: 'pebble', min: 3 },
  { use: 'Lit window frame on its sunset glow', fg: 'wood-deep', bg: 'sunshine-light', min: 3 },
  { use: 'Barn window trim on the red Storehouse wall', fg: 'paper', bg: 'coral-deep', min: 3 },
  { use: 'Door outline on a paper wall', fg: 'wood-deep', bg: 'paper', min: 3 },
  { use: 'Lantern outline on its sunset glow', fg: 'ink', bg: 'sunshine-light', min: 3 },
  { use: 'Lantern outline on a leafy canopy', fg: 'ink', bg: 'leaf-light', min: 3 },
  { use: 'Puzzle Tower star outline on the sky', fg: 'ink', bg: 'sky', min: 3 },
];
