// baseten.value `{ value, limits? }` (03 §5.5 base-ten-build `build`): ANY combination of pieces
// whose value is the target, so 34 built as 3 tens 4 ones or as 2 tens 14 ones are both right.
// `limits` (when set) caps how many of each piece the mat offers, which forces a trade.
// Response (K01, until the base-ten-build model lands): `{ thousands?, hundreds?, tens?, ones? }`,
// a missing kind is 0. Values are in units, or in hundredths when the widget's wholeIs is 'flat'
// (flat = 100, rod = 10, unit = 1 hundredth), so the arithmetic is the same.
import { num, type StateChecker } from './types';

export const PIECE_KINDS = ['thousands', 'hundreds', 'tens', 'ones'] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];
export const PIECE_VALUE: Record<PieceKind, number> = {
  thousands: 1000,
  hundreds: 100,
  tens: 10,
  ones: 1,
};

/** The piece counts of a state (missing kinds are 0); undefined when any count is not a count. */
export function piecesOf(
  value: Readonly<Record<string, unknown>>,
): Record<PieceKind, number> | undefined {
  const out = { thousands: 0, hundreds: 0, tens: 0, ones: 0 };
  for (const k of PIECE_KINDS) {
    if (value[k] === undefined) continue;
    const n = num(value[k]);
    if (n === undefined || !Number.isInteger(n) || n < 0) return undefined;
    out[k] = n;
  }
  return out;
}

export function piecesValue(p: Readonly<Record<PieceKind, number>>): number {
  return PIECE_KINDS.reduce((s, k) => s + p[k] * PIECE_VALUE[k], 0);
}

function withinLimits(p: Readonly<Record<PieceKind, number>>, limits: unknown): boolean {
  if (limits === null || typeof limits !== 'object') return true;
  const l = limits as Record<string, unknown>;
  return PIECE_KINDS.every((k) => {
    const cap = num(l[k]);
    return cap === undefined || p[k] <= cap;
  });
}

export const basetenValue: StateChecker = {
  id: 'baseten.value',
  check(target, value) {
    const want = num(target.value);
    const pieces = piecesOf(value);
    if (want === undefined || !pieces) return false;
    return piecesValue(pieces) === want && withinLimits(pieces, target.limits);
  },
  // A trade (one ten for ten ones, or back) keeps the value: an alternative, within the limits.
  exempt: (target, original, mutated) => {
    const a = piecesOf(original);
    const b = piecesOf(mutated);
    return (
      a !== undefined &&
      b !== undefined &&
      piecesValue(a) === piecesValue(b) &&
      basetenValue.check(target, mutated)
    );
  },
};
