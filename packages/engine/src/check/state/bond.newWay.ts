// bond.newWay `{ whole, found }`: a valid split not already found. Turn-around pairs (3 + 2 and
// 2 + 3) count as one way (03 §5.5 judgment call).
import { isMoveOnly, num, nums, partsOf, type StateChecker } from './types';

const key = (a: number, b: number): string => `${Math.min(a, b)}+${Math.max(a, b)}`;

export const bondNewWay: StateChecker = {
  id: 'bond.newWay',
  check(target, value) {
    const whole = num(target.whole);
    const parts = partsOf(value);
    if (whole === undefined || !parts || parts.length !== 2) return false;
    const [a, b] = parts as [number, number];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a + b !== whole) {
      return false;
    }
    const found = Array.isArray(target.found) ? target.found : [];
    const seen = new Set(
      found.flatMap((p) => {
        const pair = nums(p);
        return pair && pair.length === 2 ? [key(pair[0] as number, pair[1] as number)] : [];
      }),
    );
    return !seen.has(key(a, b));
  },
  // A move to another split is a new way too, unless that split was already found.
  exempt: (target, original, mutated) =>
    isMoveOnly(original, mutated) && bondNewWay.check(target, mutated),
};
