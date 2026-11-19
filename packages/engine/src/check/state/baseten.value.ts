// baseten.value `{ value }` (03 §5.5 base-ten-build): ANY pieces on the mat whose value is the
// target, so 34 may be 3 tens and 4 ones or 2 tens and 14 ones. Values are in ones (hundredths
// when the flat is the whole).
import { PIECE_KINDS, type Pieces, piecesValue } from '../../formats/place-value';
import { num, type StateChecker } from './types';

/**
 * The mat's piece counts, or undefined when a count is missing or not a whole number ≥ 0.
 * `thousands` may be omitted (0).
 */
export function matPieces(value: Readonly<Record<string, unknown>>): Pieces | undefined {
  const out: Pieces = { thousands: 0, hundreds: 0, tens: 0, ones: 0 };
  for (const k of PIECE_KINDS) {
    const v = value[k] === undefined && k === 'thousands' ? 0 : num(value[k]);
    if (v === undefined || !Number.isInteger(v) || v < 0) return undefined;
    out[k] = v;
  }
  return out;
}

export const basetenValue: StateChecker = {
  id: 'baseten.value',
  check(target, value) {
    const want = num(target.value);
    const mat = matPieces(value);
    return want !== undefined && mat !== undefined && piecesValue(mat) === want;
  },
};
