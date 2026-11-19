// groups.equal `{ groups, perGroup, value? }` (03 §5.5 equal-groups `build`): the non-empty
// containers number `groups` and each holds `perGroup`; the typed unknown matches `value` when the
// target names one. Empty containers do not count as groups.
import { askedValueOk, num, nums, type StateChecker } from './types';

export const groupsEqual: StateChecker = {
  id: 'groups.equal',
  check(target, value) {
    const groups = num(target.groups);
    const per = num(target.perGroup);
    const got = nums(value.groups);
    if (groups === undefined || per === undefined || !got) return false;
    if (!got.every((x) => Number.isInteger(x) && x >= 0)) return false;
    const filled = got.filter((x) => x > 0);
    if (filled.length !== groups || !filled.every((x) => x === per)) return false;
    return askedValueOk(target, value);
  },
};
