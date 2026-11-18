// tenframe.makeTen `{ total, value? }`: frame 0 is full and the total is right.
import { askedValueOk, cellGrid, num, type StateChecker } from './types';

export const tenframeMakeTen: StateChecker = {
  id: 'tenframe.makeTen',
  check(target, value) {
    const cells = cellGrid(value.cells);
    const total = num(target.total);
    if (!cells || total === undefined || cells.length === 0) return false;
    if ((cells[0] as number[]).some((x) => x === 0)) return false;
    if (cells.flat().filter((x) => x !== 0).length !== total) return false;
    return askedValueOk(target, value);
  },
};
