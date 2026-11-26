// The rounding model shared by pv.round and its misconception rules (03 §5.6, §7.2).

/** n rounded to the nearest `place`, halfway up. */
export function roundTo(n: number, place: number): number {
  return Math.floor((n + place / 2) / place) * place;
}

/** The parts of an item: the benchmarks below and above n, the midpoint and the result. */
export function roundParts(p: Record<string, unknown>): {
  n: number;
  place: number;
  b0: number;
  b1: number;
  mid: number;
  result: number;
} {
  const n = typeof p.n === 'number' ? p.n : 0;
  const place = typeof p.place === 'number' ? p.place : 10;
  const b0 = Math.floor(n / place) * place;
  return { n, place, b0, b1: b0 + place, mid: b0 + place / 2, result: roundTo(n, place) };
}
