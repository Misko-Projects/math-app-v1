import { type FormatState, formatModel } from '@number-island/engine';
import type { ResponseValue } from '@number-island/shared';
import type { ConfigFor } from '../types';

/**
 * Pure bead logic for the rekenrek widget: which bead a tap lands on, what a tap or a slide does
 * to a row, and the response through the engine model (`{ rows, value? }`, or a number for `read`).
 */

type Config = ConfigFor<'rekenrek'>;
type State = FormatState<'rekenrek'>;

export const BEADS = 10;
/** Empty wire between the two groups, in bead widths: a row is BEADS + GAP beads long. */
export const GAP = 4;
export const ROW_SLOTS = BEADS + GAP;

function model() {
  const m = formatModel('rekenrek');
  if (!m) throw new Error('rekenrek has no format model');
  return m;
}

/** Where bead `i` sits (in bead widths from the left end) when `count` beads are pushed left. */
export const beadSlot = (i: number, count: number) => (i < count ? i : GAP + i);

/**
 * The bead under a point `p` bead widths from the row's left end. A point on the empty wire picks
 * the nearer end bead of the two groups.
 */
export function beadAt(p: number, count: number): number {
  const x = Math.max(0, Math.min(ROW_SLOTS - 0.001, p));
  if (x < count) return Math.floor(x);
  if (x >= GAP + count) return Math.min(BEADS - 1, Math.floor(x) - GAP);
  if (count === 0) return 0;
  if (count === BEADS) return BEADS - 1;
  return x - count < GAP + count - x ? count - 1 : count;
}

/**
 * Tapping bead `k` (0-based from the left): a bead on the right slides left together with every
 * bead between it and the left group (k + 1 pushed); a bead on the left goes back right together
 * with every bead to its right (k pushed). The standard rekenrek move.
 */
export const tapBead = (k: number, count: number) => (k < count ? k : k + 1);

export const clampBeads = (n: number) => Math.max(0, Math.min(BEADS, Math.trunc(n)));

/** The response through the model: rows (plus `value` when asked), or the number for `read`. */
export function responseFor(
  config: Config,
  rows: readonly [number, number],
  value: number | null,
): ResponseValue | null {
  // The model's state keeps `rows` (the same field its response reports).
  const withRows = { ...model().initialState(config), rows: [rows[0], rows[1]] };
  let s: State = withRows;
  if (value !== null) s = model().apply(s, { op: 'answer', args: { value } });
  return model().toResponse(s);
}

/** A number is entered after the beads (`thenAsk`), or is the whole answer (`read`). */
export const asksNumber = (config: Config) => config.mode === 'read' || config.thenAsk !== null;
