// select.exactSet `{ values }`: exactly this set of values is selected (any order).
import { nums, type StateChecker } from './types';

export const selectExactSet: StateChecker = {
  id: 'select.exactSet',
  check(target, value) {
    const want = nums(target.values);
    const got = nums(value.values);
    if (!want || !got) return false;
    const a = new Set(want);
    const b = new Set(got);
    return got.length === b.size && a.size === b.size && [...a].every((x) => b.has(x));
  },
};
