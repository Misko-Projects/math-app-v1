import type { ArtContrastPair } from '../core/contrast';

/**
 * The meaningful marks decor draws on the island (frames you read as "a lamp", painted signs, the
 * lit state), with their 06 §7 threshold. decor.test.ts checks each by day and at sunset; same shape
 * as core/contrast.ts. Decor is not math-relevant, so only these marks carry a threshold.
 */
export const DECOR_CONTRAST_PAIRS: readonly ArtContrastPair[] = [
  {
    use: 'Lamp post, moon lamp and lantern frames (ink) on grass',
    fg: 'ink',
    bg: 'leaf-light',
    min: 3,
  },
  { use: 'Lamp post, moon lamp and lantern frames (ink) on sand', fg: 'ink', bg: 'sand', min: 3 },
  {
    use: 'Lit lamp frame on its own glow (ink on sunshine-light)',
    fg: 'ink',
    bg: 'sunshine-light',
    min: 3,
  },
  { use: 'Flag, pennant and kite-string lines (ink) on the sky', fg: 'ink', bg: 'sky', min: 3 },
  { use: 'Driftwood sign arrows and shell (ink on the board)', fg: 'ink', bg: 'pebble', min: 3 },
  {
    use: 'Fence, rock and pedestal outlines (ink-soft) on sand',
    fg: 'ink-soft',
    bg: 'sand',
    min: 3,
  },
  {
    use: 'Sandcastle and tide-pool outlines (wood-deep) on sand',
    fg: 'wood-deep',
    bg: 'sand',
    min: 3,
  },
  {
    use: 'Festival drum star (coral-deep outline on sunshine-light)',
    fg: 'coral-deep',
    bg: 'sunshine-light',
    min: 3,
  },
];
