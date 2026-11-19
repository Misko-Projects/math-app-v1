import { describe, expect, it } from 'vitest';
import { HEAP_COLS, HEAP_COLS_K, heapCells, heapRows } from './heap';

describe('make-set heap layout (no lone object under the others)', () => {
  it('balances rows, longer rows first', () => {
    expect(heapRows(10, HEAP_COLS)).toEqual([4, 3, 3]);
    expect(heapRows(10, HEAP_COLS_K)).toEqual([3, 3, 2, 2]);
    expect(heapRows(7, HEAP_COLS_K)).toEqual([3, 2, 2]);
    expect(heapRows(7, HEAP_COLS)).toEqual([4, 3]);
    expect(heapRows(12, HEAP_COLS)).toEqual([4, 4, 4]);
    expect(heapRows(1, HEAP_COLS)).toEqual([1]);
    expect(heapRows(0, HEAP_COLS)).toEqual([]);
  });

  it('keeps every row within one of the others and within the cap', () => {
    for (let n = 1; n <= 40; n++) {
      for (const cap of [1, 2, 3, 4, 5]) {
        const rows = heapRows(n, cap);
        expect(rows.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.max(...rows)).toBeLessThanOrEqual(cap);
        expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1);
        // At the caps the heap uses (3, 4), no row is ever a single object.
        if (n > 1 && cap >= 3) expect(Math.min(...rows)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('centres short rows by half an object on the half-track grid', () => {
    // 7 at 3 a row: 3 / 2 / 2; the rows of 2 start one half-track in.
    expect(heapCells(7, 3)).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 2 },
      { row: 0, col: 4 },
      { row: 1, col: 1 },
      { row: 1, col: 3 },
      { row: 2, col: 1 },
      { row: 2, col: 3 },
    ]);
    for (let n = 1; n <= 20; n++) {
      for (const c of heapCells(n, 4)) {
        expect(c.col).toBeGreaterThanOrEqual(0);
        expect(c.col + 2).toBeLessThanOrEqual(8);
      }
    }
  });
});
