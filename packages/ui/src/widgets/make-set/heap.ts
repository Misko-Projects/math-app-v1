/** make-set's heap layout: pure, so it is unit-tested (heap.test.ts). */

/**
 * Most objects in a heap row: 4 from G1; 3 in K, where the 80 px objects next to a two-frame
 * boat and the check button leave room for no more.
 */
export const HEAP_COLS = 4;
export const HEAP_COLS_K = 3;

/**
 * Balanced heap rows (at most `cap` each, longer rows first, lengths differing by at most one), so
 * no object ever hangs alone under the others: 10 → 4/3/3 (or 3/3/2/2 in K), 7 → 4/3, 5 → 3/2.
 */
export function heapRows(n: number, cap: number): number[] {
  if (n <= 0) return [];
  const most = Math.max(1, Math.floor(cap));
  const rows = Math.ceil(n / most);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
}

export interface HeapCell {
  row: number;
  /** First of the two half-width grid tracks the object spans (0-based, of `2 × cap`). */
  col: number;
}

/**
 * Where each heap object sits, in reading order, on a grid of `2 × cap` half-width tracks: an
 * object spans two, so a shorter row shifts by half an object and stays centred. One flat list (a
 * reflow never remounts an object, so focus survives).
 */
export function heapCells(n: number, cap: number): HeapCell[] {
  const most = Math.max(1, Math.floor(cap));
  const cells: HeapCell[] = [];
  heapRows(n, most).forEach((len, row) => {
    for (let j = 0; j < len; j++) cells.push({ row, col: most - len + 2 * j });
  });
  return cells;
}
