// puzzle.satisfies `{ variant, rows, cols, cells, constraints }` (03 §5.5 puzzle-grid): every blank
// is filled and every constraint holds; any valid solution is correct.
//
// K01 implements the `shape-fill` variant (PUZ.03). `cells` lists the outline's cells as [r, c];
// the response is `{ fill: string[][] }` (rows × cols, '' outside the outline), each outline cell
// holding the palette piece that covers it. Pieces: `square` covers one cell, `rectangle` covers two
// side-by-side cells (either way round). Correct when every outline cell is filled and nothing
// else, the `rectangle` cells pair up into dominoes, and the pieces used are exactly the multiset of
// the `use-each` constraint. The other variants (PUZ.01, PUZ.02, K02) add their rules here; until
// then they are rejected.
import type { StateChecker } from './types';

export type Cell = [number, number];

/** Piece sizes (cells) on the shape-fill grid. */
export const GRID_PIECES: Record<string, number> = { square: 1, rectangle: 2 };

const key = (r: number, c: number) => `${r},${c}`;

/** Whether the cells can be paired into side-by-side dominoes. */
export function pairsUp(cells: Cell[]): boolean {
  const left = new Set(cells.map(([r, c]) => key(r, c)));
  const sorted = [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const go = (): boolean => {
    const first = sorted.find(([r, c]) => left.has(key(r, c)));
    if (!first) return true;
    const [r, c] = first;
    left.delete(key(r, c));
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const k = key(r + dr, c + dc);
      if (left.has(k)) {
        left.delete(k);
        if (go()) return true;
        left.add(k);
      }
    }
    left.add(key(r, c));
    return false;
  };
  return cells.length % 2 === 0 && go();
}

/**
 * Every distinct fill (as label grids, joined to strings) of `cells` with exactly `rects`
 * rectangles and squares for the rest, up to `cap`.
 */
export function shapeFills(
  cells: Cell[],
  rects: number,
  rows: number,
  cols: number,
  cap = 64,
): string[][][] {
  const inside = new Set(cells.map(([r, c]) => key(r, c)));
  const sorted = [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const grid: string[][] = Array.from({ length: rows }, () => new Array<string>(cols).fill(''));
  const seen = new Set<string>();
  const out: string[][][] = [];
  const go = (i: number, rectsLeft: number) => {
    if (out.length >= cap) return;
    while (i < sorted.length && grid[(sorted[i] as Cell)[0]]?.[(sorted[i] as Cell)[1]] !== '')
      i += 1;
    if (i === sorted.length) {
      if (rectsLeft !== 0) return;
      const sig = grid.map((row) => row.join('|')).join('/');
      if (!seen.has(sig)) {
        seen.add(sig);
        out.push(grid.map((row) => [...row]));
      }
      return;
    }
    const [r, c] = sorted[i] as Cell;
    const row = grid[r] as string[];
    row[c] = 'square';
    go(i + 1, rectsLeft);
    row[c] = '';
    if (rectsLeft > 0) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        const r2 = r + dr;
        const c2 = c + dc;
        if (inside.has(key(r2, c2)) && grid[r2]?.[c2] === '') {
          row[c] = 'rectangle';
          (grid[r2] as string[])[c2] = 'rectangle';
          go(i + 1, rectsLeft - 1);
          row[c] = '';
          (grid[r2] as string[])[c2] = '';
        }
      }
    }
  };
  go(0, rects);
  return out;
}

function checkShapeFill(
  target: Readonly<Record<string, unknown>>,
  value: Readonly<Record<string, unknown>>,
): boolean {
  const rows = target.rows;
  const cols = target.cols;
  if (typeof rows !== 'number' || typeof cols !== 'number') return false;
  if (!Array.isArray(target.cells) || !Array.isArray(target.constraints)) return false;
  const cells = target.cells as unknown[];
  if (!cells.every((x) => Array.isArray(x) && x.length === 2 && x.every(Number.isInteger)))
    return false;
  const inside = new Set((cells as Cell[]).map(([r, c]) => key(r, c)));
  const fill = value.fill;
  if (!Array.isArray(fill) || fill.length !== rows) return false;
  const used: Record<string, Cell[]> = {};
  for (let r = 0; r < rows; r += 1) {
    const row = fill[r];
    if (!Array.isArray(row) || row.length !== cols) return false;
    for (let c = 0; c < cols; c += 1) {
      const v = row[c];
      if (typeof v !== 'string') return false;
      if (!inside.has(key(r, c))) {
        if (v !== '') return false;
        continue;
      }
      if (!(v in GRID_PIECES)) return false;
      const list = used[v] ?? [];
      list.push([r, c]);
      used[v] = list;
    }
  }
  if (!pairsUp(used.rectangle ?? [])) return false;
  const counts: Record<string, number> = {
    square: (used.square ?? []).length,
    rectangle: (used.rectangle ?? []).length / 2,
  };
  for (const k of target.constraints as unknown[]) {
    const con = k as Record<string, unknown> | null;
    if (con?.kind !== 'use-each' || !Array.isArray(con.values)) return false;
    const want: Record<string, number> = {};
    for (const v of con.values) want[String(v)] = (want[String(v)] ?? 0) + 1;
    for (const piece of new Set([...Object.keys(want), ...Object.keys(counts)])) {
      if ((want[piece] ?? 0) !== (counts[piece] ?? 0)) return false;
    }
  }
  return true;
}

export const puzzleSatisfies: StateChecker = {
  id: 'puzzle.satisfies',
  check(target, value) {
    if (target.variant === 'shape-fill') return checkShapeFill(target, value);
    return false;
  },
};
