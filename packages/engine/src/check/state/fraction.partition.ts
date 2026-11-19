// fraction.partition `{ denominator, max }` (03 §5.5 fraction-line `partition`). K01 response shape
// (engine README): `{ cuts: number[] }`, the marks the child placed, in units from 0 (any order).
// The wholes 0, 1, … max are drawn already, so a mark on a whole is ignored. Correct when the other
// marks split every whole into `denominator` equal intervals: they match the points k/denominator
// strictly between 0 and max that are not wholes one to one, each within PARTITION_TOLERANCE (2% of
// the unit length).
import { nums, type StateChecker } from './types';

export const PARTITION_TOLERANCE = 0.02;

/** The marks a partition into `denominator` parts per whole needs (wholes excluded). */
export function partitionPoints(denominator: number, max: number): number[] {
  const out: number[] = [];
  for (let k = 1; k < denominator * max; k += 1)
    if (k % denominator !== 0) out.push(k / denominator);
  return out;
}

const onWhole = (x: number, max: number): boolean =>
  Math.abs(x - Math.round(x)) <= PARTITION_TOLERANCE && Math.round(x) >= 0 && Math.round(x) <= max;

/** The child's marks without those on a whole, sorted. */
export function innerCuts(cuts: readonly number[], max: number): number[] {
  return cuts.filter((x) => !onWhole(x, max)).sort((a, b) => a - b);
}

export const fractionPartition: StateChecker = {
  id: 'fraction.partition',
  check(target, value) {
    const den = target.denominator;
    const max = typeof target.max === 'number' ? target.max : 1;
    const cuts = nums(value.cuts);
    if (typeof den !== 'number' || den < 1 || !cuts) return false;
    if (cuts.some((x) => x <= 0 || x >= max)) return false;
    const inner = innerCuts(cuts, max);
    const want = partitionPoints(den, max);
    if (inner.length !== want.length) return false;
    return want.every((p, i) => Math.abs((inner[i] as number) - p) <= PARTITION_TOLERANCE + 1e-9);
  },
};
