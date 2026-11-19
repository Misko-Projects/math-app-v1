// Place-value helpers shared by the base-ten formats (03 §5.5 base-ten-build, base-ten-trade,
// expanded-form) and their state checkers.

/** Base-ten piece kinds, largest first. `ones` are units, `tens` rods, `hundreds` flats. */
export const PIECE_KINDS = ['thousands', 'hundreds', 'tens', 'ones'] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

/** Columns of the place-value mat (base-ten-trade). */
export const COLUMNS = ['hundreds', 'tens', 'ones'] as const;
export type Column = (typeof COLUMNS)[number];

export const PIECE_VALUE: Record<PieceKind, number> = {
  thousands: 1000,
  hundreds: 100,
  tens: 10,
  ones: 1,
};

export type Pieces = Record<PieceKind, number>;
export type Hto = Record<Column, number>;

const ALIASES: Record<string, PieceKind> = {
  thousands: 'thousands',
  thousand: 'thousands',
  cube: 'thousands',
  hundreds: 'hundreds',
  hundred: 'hundreds',
  flat: 'hundreds',
  tens: 'tens',
  ten: 'tens',
  rod: 'tens',
  ones: 'ones',
  one: 'ones',
  unit: 'ones',
};

/** The piece kind an op argument names (`tens`, `ten` or `rod`), or undefined. */
export function pieceKind(v: unknown): PieceKind | undefined {
  return typeof v === 'string' ? ALIASES[v] : undefined;
}

/** The mat column an op argument names, or undefined (the mat has no thousands column). */
export function column(v: unknown): Column | undefined {
  const k = pieceKind(v);
  return k === 'thousands' ? undefined : k;
}

/** The next larger kind (ten of `k` fuse into one of it), or undefined for thousands. */
export function largerKind(k: PieceKind): PieceKind | undefined {
  const i = PIECE_KINDS.indexOf(k);
  return i > 0 ? PIECE_KINDS[i - 1] : undefined;
}

/** The next smaller kind (one of `k` splits into ten of it), or undefined for ones. */
export function smallerKind(k: PieceKind): PieceKind | undefined {
  const i = PIECE_KINDS.indexOf(k);
  return i < PIECE_KINDS.length - 1 ? PIECE_KINDS[i + 1] : undefined;
}

export const emptyPieces = (): Pieces => ({ thousands: 0, hundreds: 0, tens: 0, ones: 0 });

/** The value of a set of pieces, in ones (hundredths when the flat is the whole). */
export function piecesValue(p: Partial<Record<PieceKind, number>>): number {
  return PIECE_KINDS.reduce((a, k) => a + (p[k] ?? 0) * PIECE_VALUE[k], 0);
}

/** The canonical pieces of a value (no more than nine of any kind below thousands). */
export function canonicalPieces(value: number): Pieces {
  const v = Math.max(0, Math.trunc(value));
  return {
    thousands: Math.floor(v / 1000),
    hundreds: Math.floor(v / 100) % 10,
    tens: Math.floor(v / 10) % 10,
    ones: v % 10,
  };
}

/** Whether a non-negative integer has a zero digit strictly between its first and last digits. */
export function hasInternalZero(n: number): boolean {
  const s = String(Math.abs(Math.trunc(n)));
  return s.length > 2 && s.slice(1, -1).includes('0');
}

/** Whether `n` is one non-zero digit followed by zeros (3, 40, 500): a canonical place value. */
export function isPlaceValue(n: number): boolean {
  if (!Number.isInteger(n) || n <= 0) return false;
  return /^[1-9]0*$/.test(String(n));
}
