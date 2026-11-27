import type { ArtContrastPair } from '../core/contrast';
import { COIN_LOOK, COIN_VALUES, PALETTE_FILLS, PEBBLE_MARK, PEBBLING_PALETTES } from './pebbling';

/**
 * Every meaningful mark the characters draw, against what it sits on (06 §7): pebbles and the
 * fraction shell on each palette's pebble bed, eyes, Glim's screen, the clock face and the coins.
 * characters.test.ts checks every row by day and at sunset with pairRatio. Lit and empty pebbles
 * also differ by shape (a filled stone vs a hollow ring), so the count never rests on colour.
 */
export const CHARACTER_CONTRAST_PAIRS: readonly ArtContrastPair[] = [
  ...PEBBLING_PALETTES.flatMap((p): ArtContrastPair[] => {
    const bed = PALETTE_FILLS[p].belly;
    return [
      { use: `Lit pebble on the ${p} pebble bed`, fg: PEBBLE_MARK.lit, bg: bed, min: 3 },
      { use: `Empty socket ring on the ${p} pebble bed`, fg: PEBBLE_MARK.empty, bg: bed, min: 3 },
      { use: `Half-Crab spokes on the ${p} shell`, fg: PEBBLE_MARK.empty, bg: bed, min: 3 },
    ];
  }),
  { use: 'Pebbling pupil (ink on the eye white)', fg: 'ink', bg: 'cloud', min: 3 },
  // Between two filled Half-Crab parts the spoke's light core is the boundary (review
  // s_eab7ff900e77 #3): it must stand out from the filled fill and from the filled edge.
  {
    use: 'Half-Crab spoke core between filled parts',
    fg: PEBBLE_MARK.spokeCore,
    bg: PEBBLE_MARK.lit,
    min: 3,
  },
  {
    use: 'Half-Crab spoke core against a filled part’s edge',
    fg: PEBBLE_MARK.spokeCore,
    bg: PEBBLE_MARK.litEdge,
    min: 3,
  },
  { use: 'Glim light-bar eyes and voice bars on its screen', fg: 'shallows', bg: 'ink', min: 3 },
  { use: 'Glim screen against its lantern glass', fg: 'ink', bg: 'sunshine-light', min: 3 },
  { use: 'Clockfish hands and hour ticks (ink on the face)', fg: 'ink', bg: 'paper', min: 3 },
  { use: 'Clockfish minute ticks (ink-soft on the face)', fg: 'ink-soft', bg: 'paper', min: 3 },
  ...[...new Set(COIN_VALUES.map((v) => COIN_LOOK[v].face))].flatMap((face): ArtContrastPair[] => [
    { use: `Coin value numeral (ink on ${face})`, fg: 'ink', bg: face, min: 4.5 },
    { use: `Coin rim pattern (ink-soft on ${face})`, fg: 'ink-soft', bg: face, min: 3 },
  ]),
];
