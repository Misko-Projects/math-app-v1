// rekenrek.total `{ n, rowRule, value? }`: beads pushed left total n; `fill-top-first` needs a full
// top row before any bottom bead.
import { BEADS_PER_ROW } from '../../formats/rekenrek';
import { askedValueOk, isMoveOnly, num, nums, type StateChecker } from './types';

export const rekenrekTotal: StateChecker = {
  id: 'rekenrek.total',
  check(target, value) {
    const rows = nums(value.rows);
    const n = num(target.n);
    if (rows?.length !== 2 || n === undefined) return false;
    const [top, bottom] = rows as [number, number];
    const beads = (x: number) => Number.isInteger(x) && x >= 0 && x <= BEADS_PER_ROW;
    if (!beads(top) || !beads(bottom) || top + bottom !== n) return false;
    if (target.rowRule === 'fill-top-first' && bottom > 0 && top !== BEADS_PER_ROW) return false;
    return askedValueOk(target, value);
  },
  // Sliding one bead from one row to the other keeps the total: an alternative, as long as the
  // row rule still holds.
  exempt: (target, original, mutated) =>
    isMoveOnly(original, mutated) && rekenrekTotal.check(target, mutated),
};
