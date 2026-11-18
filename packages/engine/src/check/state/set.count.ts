// set.count `{ count, groupsOf? }`: the container holds exactly `count`; with groupsOf 10 every full
// ten is bundled (CNT.19).
import { isMoveOnly, num, type StateChecker } from './types';

export const setCount: StateChecker = {
  id: 'set.count',
  check(target, value) {
    const want = num(target.count);
    if (want === undefined || num(value.count) !== want) return false;
    if (target.groupsOf === 10) return num(value.bundles) === Math.floor(want / 10);
    return true;
  },
  // Moving a piece between sub-parts (one hand to the other) keeps the count: an alternative.
  exempt: (target, original, mutated) =>
    isMoveOnly(original, mutated) && setCount.check(target, mutated),
};
