// baseten.exact `{ value, exact }` (03 §5.5 base-ten-build `build-exact`): the mat is worth
// `value` AND holds exactly the counts `exact` names (34 with exactly 2 tens is 2 tens and 14
// ones). Kinds `exact` does not name are free.
import { PIECE_KINDS } from '../../formats/place-value';
import { basetenValue, matPieces } from './baseten.value';
import { num, type StateChecker } from './types';

export const basetenExact: StateChecker = {
  id: 'baseten.exact',
  check(target, value) {
    const exact = target.exact;
    if (exact === null || typeof exact !== 'object') return false;
    const mat = matPieces(value);
    if (!mat || !basetenValue.check(target, value)) return false;
    const want = exact as Record<string, unknown>;
    return PIECE_KINDS.every((k) => want[k] === undefined || num(want[k]) === mat[k]);
  },
};
