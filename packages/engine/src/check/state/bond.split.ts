// bond.split `{ whole, nonZero }`: any two parts that sum to the whole (both > 0 when nonZero).
// Parts come from `parts`, ten-frame colours or rekenrek rows (see partsOf).
import { isMoveOnly, num, partsOf, type StateChecker } from './types';

export const bondSplit: StateChecker = {
  id: 'bond.split',
  check(target, value) {
    const whole = num(target.whole);
    const parts = partsOf(value);
    if (whole === undefined || !parts || parts.length !== 2) return false;
    const [a, b] = parts as [number, number];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;
    if (a + b !== whole) return false;
    return target.nonZero === true ? a > 0 && b > 0 : true;
  },
  // Moving one counter from one part to the other is another valid split when it stays valid.
  exempt: (target, original, mutated) =>
    isMoveOnly(original, mutated) && bondSplit.check(target, mutated),
};
