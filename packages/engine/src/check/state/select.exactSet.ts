// select.exactSet `{ values }` or `{ ids }`: exactly this set is selected (any order). `values`
// are numbers (hundred-chart cells, pattern positions); `ids` are card ids (shape-sort find-all,
// 03 §5.5).
import { nums, type StateChecker } from './types';

const strs = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined;

function sameSet<T>(want: T[], got: T[]): boolean {
  const a = new Set(want);
  const b = new Set(got);
  return got.length === b.size && a.size === b.size && [...a].every((x) => b.has(x));
}

export const selectExactSet: StateChecker = {
  id: 'select.exactSet',
  check(target, value) {
    if (target.ids !== undefined) {
      const want = strs(target.ids);
      const got = strs(value.ids);
      return want !== undefined && got !== undefined && sameSet(want, got);
    }
    const want = nums(target.values);
    const got = nums(value.values);
    if (!want || !got) return false;
    return sameSet(want, got);
  },
};
