// array.area `{ total, found? }` (03 §5.5 array-build `build-total`, `new-way`): ANY rectangle of
// that area. With `found` (PUZ.08) it must be one not found yet; 3 × 4 and 4 × 3 are the same
// rectangle.
import { alreadyFound } from '../../formats/array-build';
import { num, type StateChecker } from './types';

const isPair = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length === 2 && x.every((v) => num(v) !== undefined);

export const arrayArea: StateChecker = {
  id: 'array.area',
  check(target, value) {
    const total = num(target.total);
    const r = num(value.rows);
    const c = num(value.cols);
    if (total === undefined || r === undefined || c === undefined) return false;
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 1 || c < 1) return false;
    if (r * c !== total) return false;
    if (target.found === undefined) return true;
    if (!Array.isArray(target.found) || !target.found.every(isPair)) return false;
    return !alreadyFound(target.found, r, c);
  },
};
