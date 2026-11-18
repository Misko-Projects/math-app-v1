// units.iterate `{ length, gapTolerance }` (03 §5.5 measure-length, iterate mode): copies of one
// unit laid end to end from the object's start, with no gap or overlap beyond the tolerance, as
// many units as the object is long, plus the typed count.
//
// Response shape (K01): `{ units, value }`. `units` lists where each laid unit starts, in unit
// lengths from the object's start (any order); `value` is the count the child typed. Units may sit
// slightly off a whole mark (a child's drag is not exact): each start may drift from the previous
// unit's end by at most `gapTolerance` (default 0.1 unit).
import { num, nums, type StateChecker } from './types';

export const DEFAULT_GAP_TOLERANCE = 0.1;

/** The unit starts in order, or undefined when the value has no well-formed `units` list. */
export function unitStarts(value: Readonly<Record<string, unknown>>): number[] | undefined {
  const starts = nums(value.units);
  return starts ? [...starts].sort((a, b) => a - b) : undefined;
}

/**
 * The largest gap (positive) or overlap (negative) between neighbouring units, including the space
 * between the object's start and the first unit, in unit lengths. 0 for a perfect layout.
 */
export function worstSpacing(starts: readonly number[]): number {
  let worst = 0;
  let end = 0;
  for (const s of starts) {
    const d = s - end;
    if (Math.abs(d) > Math.abs(worst)) worst = d;
    end = s + 1;
  }
  return worst;
}

export const unitsIterate: StateChecker = {
  id: 'units.iterate',
  check(target, value) {
    const length = num(target.length);
    const tol = num(target.gapTolerance) ?? DEFAULT_GAP_TOLERANCE;
    const starts = unitStarts(value);
    if (length === undefined || !starts || starts.length !== length) return false;
    if (Math.abs(worstSpacing(starts)) > tol + 1e-9) return false;
    // The typed count is part of the answer (03 §5.5: "plus the typed count").
    return num(value.value) === length;
  },
  // No exemption: the property test's near misses change the typed count, which is never valid.
};
