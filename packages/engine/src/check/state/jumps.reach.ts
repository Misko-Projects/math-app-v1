// jumps.reach `{ start, target, allowedJumps, value? }`: any sequence of allowed signed jumps from
// start that lands on target (strategy freedom), plus the entered value when the item asks for one.
import { askedValueOk, num, nums, type StateChecker } from './types';

export const jumpsReach: StateChecker = {
  id: 'jumps.reach',
  check(target, value) {
    const start = num(target.start);
    const goal = num(target.target);
    const allowed = nums(target.allowedJumps);
    const jumps = nums(value.jumps);
    if (start === undefined || goal === undefined || !allowed || !jumps || jumps.length === 0) {
      return false;
    }
    if (!jumps.every((j) => allowed.includes(j))) return false;
    if (start + jumps.reduce((a, b) => a + b, 0) !== goal) return false;
    return askedValueOk(target, value);
  },
};
