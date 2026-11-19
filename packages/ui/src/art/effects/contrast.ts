import type { ArtContrastPair } from '../core/contrast';

/**
 * The effects' meaningful marks and the backgrounds they play over, with their 06 §7 threshold
 * (effects.test.ts checks each by day and at sunset; same shape as core/contrast.ts). Confetti is
 * pure celebration and carries no meaning, so it has no row.
 */
export const EFFECT_CONTRAST_PAIRS: readonly ArtContrastPair[] = [
  { use: 'Sparkle glint outline (ink) on sand', fg: 'ink', bg: 'sand', min: 3 },
  { use: 'Sparkle glint outline (ink) on grass', fg: 'ink', bg: 'leaf-light', min: 3 },
  { use: 'Sparkle glint outline (ink) on a paper card', fg: 'ink', bg: 'paper', min: 3 },
  { use: 'Sparkle glint outline (ink) on the sky', fg: 'ink', bg: 'sky-light', min: 3 },
  { use: 'Splash droplets (foam) on the sea', fg: 'foam', bg: 'sea', min: 3 },
  {
    use: 'Splash droplet outline (sea-deep) on the foam crown',
    fg: 'sea-deep',
    bg: 'foam',
    min: 3,
  },
  {
    use: 'Firefly light (sunshine-light) on the dusk grove (ink)',
    fg: 'sunshine-light',
    bg: 'ink',
    min: 3,
  },
  {
    use: 'Firefly light (sunshine-light) on dark leaves',
    fg: 'sunshine-light',
    bg: 'leaf-dark',
    min: 3,
  },
];
