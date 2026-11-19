// baseten.exact `{ exact, value? }` (03 §5.5 base-ten-build `build-exact`): exactly the asked
// pieces, e.g. 34 with exactly 2 tens (and so 14 ones), or a teen as one ten and some ones. Kinds
// that `exact` does not name must be 0. Response shape as baseten.value. No near-miss exemption: a
// trade changes the piece counts, which is exactly what this checker rejects.
import { PIECE_KINDS, piecesOf, piecesValue } from './baseten.value';
import { num, type StateChecker } from './types';

export const basetenExact: StateChecker = {
  id: 'baseten.exact',
  check(target, value) {
    const pieces = piecesOf(value);
    const exact = target.exact;
    if (!pieces || exact === null || typeof exact !== 'object') return false;
    const want = exact as Record<string, unknown>;
    for (const k of PIECE_KINDS) {
      const n = want[k] === undefined ? 0 : num(want[k]);
      if (n === undefined || pieces[k] !== n) return false;
    }
    const v = num(target.value);
    return v === undefined || piecesValue(pieces) === v;
  },
};
