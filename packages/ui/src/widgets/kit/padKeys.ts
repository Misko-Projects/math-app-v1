import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import type { Size } from './arrange';

/**
 * The number pad's keys as a widget's layout plans them (number-pad, dot-flash). The keys never go
 * under the bars (06 §4: the age mode's minimum target, 12 px apart); in a short room they go from
 * --target-big to --target-min, then the pad turns from 3 × 4 to 4 × 3 (a K pad of 80 px keys is
 * 372 px tall, more than the smallest landscape area).
 */

export type PadShape = '3x4' | '4x3';

export interface PadKeysChoice {
  shape: PadShape;
  /** Keys of --target-min instead of --target-big (kit.css `.ni-pad[data-keys="compact"]`). */
  compact: boolean;
}

/** The keys to try, most roomy first. */
export const PAD_KEYS_CHOICES: readonly PadKeysChoice[] = [
  { shape: '3x4', compact: false },
  { shape: '3x4', compact: true },
  { shape: '4x3', compact: true },
];

/** The keys' box (kit.css `.ni-pad`; a compact key's row holds its 4 px ledge margin). */
export function padKeysSize(choice: PadKeysChoice, ageMode: AgeMode): Size {
  const k = choice.compact ? MIN_TARGET_PX[ageMode] : TARGET_PX[ageMode].big;
  const row = choice.compact ? k + 4 : k;
  const cols = choice.shape === '4x3' ? 4 : 3;
  const rows = 12 / cols;
  return { w: cols * k + (cols - 1) * TARGET_GAP_PX, h: rows * row + (rows - 1) * TARGET_GAP_PX };
}
