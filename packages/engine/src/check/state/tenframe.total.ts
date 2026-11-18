// tenframe.total `{ n, requireStandardFill?, value? }`: the frames hold n counters in any cells, or
// in the standard order (each frame filled from the top-left, frame 0 before frame 1) when required.
import { askedValueOk, cellGrid, num, type StateChecker } from './types';

export function filledInStandardOrder(cells: number[][]): boolean {
  const flat = cells.flat();
  const firstEmpty = flat.indexOf(0);
  return firstEmpty < 0 || flat.slice(firstEmpty).every((x) => x === 0);
}

export const tenframeTotal: StateChecker = {
  id: 'tenframe.total',
  check(target, value) {
    const cells = cellGrid(value.cells);
    const n = num(target.n);
    if (!cells || n === undefined) return false;
    const total = cells.flat().filter((x) => x !== 0).length;
    if (total !== n) return false;
    if (target.requireStandardFill === true && !filledInStandardOrder(cells)) return false;
    return askedValueOk(target, value);
  },
};
