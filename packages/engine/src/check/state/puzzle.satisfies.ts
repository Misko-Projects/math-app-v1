// puzzle.satisfies `{ variant, rows, cols, cells, constraints }` (03 §5.5 puzzle-grid): every blank
// is filled and every constraint holds; any valid solution is correct.
//
// K01 implements the `shape-fill` variant (PUZ.03). `cells` lists the outline's cells as [r, c];
// the response is `{ fill: string[][] }` (rows × cols, '' outside the outline), each outline cell
// holding the palette piece that covers it. Pieces: `square` covers one cell, `rectangle` covers two
// side-by-side cells (either way round). Correct when every outline cell is filled and nothing
// else, the `rectangle` cells pair up into dominoes, and the pieces used are exactly the multiset of
// the `use-each` constraint.
//
// U04 (#13) adds the numeric variants (mini-KenKen `cage-sum`, `magic-square`, `missing-digit`,
// `sum-triangle` and other number grids); see `checkNumeric` below. `cells` there is the config's
// own cell list (`{ r, c, given?, blank?, cage? }`).
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
  // Maps, not plain objects: a label such as `constructor` must not find an inherited value.
  const used = new Map<string, Cell[]>();
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
      if (!Object.hasOwn(GRID_PIECES, v)) return false;
      const list = used.get(v) ?? [];
      list.push([r, c]);
      used.set(v, list);
    }
  }
  if (!pairsUp(used.get('rectangle') ?? [])) return false;
  const counts = new Map<string, number>([
    ['square', (used.get('square') ?? []).length],
    ['rectangle', (used.get('rectangle') ?? []).length / 2],
  ]);
  for (const k of target.constraints as unknown[]) {
    const con = k as Record<string, unknown> | null;
    if (con?.kind !== 'use-each' || !Array.isArray(con.values)) return false;
    const want = new Map<string, number>();
    for (const v of con.values) want.set(String(v), (want.get(String(v)) ?? 0) + 1);
    for (const piece of new Set([...want.keys(), ...counts.keys()])) {
      if ((want.get(piece) ?? 0) !== (counts.get(piece) ?? 0)) return false;
    }
  }
  return true;
}

interface PuzzleCell {
  r: number;
  c: number;
  given?: number | string;
  blank?: boolean;
  cage?: string;
}

const isCell = (x: unknown): x is PuzzleCell => {
  if (x === null || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return Number.isInteger(r.r) && Number.isInteger(r.c);
};

const sameMultiset = (a: readonly (number | string)[], b: readonly (number | string)[]) => {
  if (a.length !== b.length) return false;
  const count = new Map<string, number>();
  for (const v of a) count.set(`${typeof v}:${v}`, (count.get(`${typeof v}:${v}`) ?? 0) + 1);
  for (const v of b) {
    const k = `${typeof v}:${v}`;
    const n = count.get(k) ?? 0;
    if (n === 0) return false;
    count.set(k, n - 1);
  }
  return true;
};

/**
 * U04 (#13) numeric variants: `cage-sum` (mini-KenKen), `magic-square`, `missing-digit`,
 * `sum-triangle` and the other number grids. The target is `{ variant, rows, cols, cells,
 * constraints }` with the config's own `cells` (`{ r, c, given?, blank?, cage? }`); the response is
 * `{ fill }` as for shape-fill. Correct when every given cell keeps its value, every blank holds a
 * number, nothing sits outside the puzzle, and every constraint holds:
 * - `cage-sum`: the cage's cells add up to `sum`;
 * - `row-unique` / `col-unique`: no value repeats in a row / column of the puzzle;
 * - `line-sum`: the listed cells add up to `sum`;
 * - `use-each`: the blanks' values are exactly `values` (as a multiset), or, when `values` has one
 *   entry per puzzle cell, all the cells' values are.
 * Other constraint kinds (`adjacent-step`, `equation`, `clue`) are not checked yet and reject.
 */
function checkNumeric(
  target: Readonly<Record<string, unknown>>,
  value: Readonly<Record<string, unknown>>,
): boolean {
  const rows = target.rows;
  const cols = target.cols;
  if (typeof rows !== 'number' || typeof cols !== 'number') return false;
  if (!Array.isArray(target.cells) || !target.cells.every(isCell)) return false;
  if (!Array.isArray(target.constraints)) return false;
  const cells = target.cells as PuzzleCell[];
  const fill = value.fill;
  if (!Array.isArray(fill) || fill.length !== rows) return false;
  if (!fill.every((row) => Array.isArray(row) && row.length === cols)) return false;
  const grid = fill as unknown[][];
  const inside = new Map(cells.map((x) => [key(x.r, x.c), x]));
  // Nothing outside the puzzle.
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!inside.has(key(r, c)) && grid[r]?.[c] !== '') return false;
    }
  }
  const at = (r: number, c: number) => grid[r]?.[c];
  for (const cell of cells) {
    const v = at(cell.r, cell.c);
    if (cell.given !== undefined) {
      if (v !== cell.given) return false;
    } else if (typeof v !== 'number' || !Number.isFinite(v)) {
      return false;
    }
  }
  const num = (r: number, c: number): number | undefined => {
    const v = at(r, c);
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  const sum = (list: [number, number][]): number | undefined => {
    let total = 0;
    for (const [r, c] of list) {
      const v = num(r, c);
      if (v === undefined) return undefined;
      total += v;
    }
    return total;
  };
  const distinct = (list: PuzzleCell[]) => {
    const vals = list.map((x) => `${typeof at(x.r, x.c)}:${at(x.r, x.c)}`);
    return new Set(vals).size === vals.length;
  };
  for (const raw of target.constraints as unknown[]) {
    const k = raw as Record<string, unknown> | null;
    switch (k?.kind) {
      case 'cage-sum': {
        const members = cells
          .filter((x) => x.cage === k.cage)
          .map((x): [number, number] => [x.r, x.c]);
        if (members.length === 0 || sum(members) !== k.sum) return false;
        break;
      }
      case 'row-unique':
        for (let r = 0; r < rows; r += 1)
          if (!distinct(cells.filter((x) => x.r === r))) return false;
        break;
      case 'col-unique':
        for (let c = 0; c < cols; c += 1)
          if (!distinct(cells.filter((x) => x.c === c))) return false;
        break;
      case 'line-sum': {
        const list = k.cells;
        if (!Array.isArray(list) || !list.every((p) => Array.isArray(p) && p.length === 2)) {
          return false;
        }
        const pairs = list as [number, number][];
        if (!pairs.every(([r, c]) => inside.has(key(r, c)))) return false;
        if (sum(pairs) !== k.sum) return false;
        break;
      }
      case 'use-each': {
        if (!Array.isArray(k.values)) return false;
        const want = k.values as (number | string)[];
        const pool = want.length === cells.length ? cells : cells.filter((x) => x.blank);
        const got = pool.map((x) => at(x.r, x.c) as number | string);
        if (!sameMultiset(got, want)) return false;
        break;
      }
      default:
        return false;
    }
  }
  return true;
}

export const puzzleSatisfies: StateChecker = {
  id: 'puzzle.satisfies',
  check(target, value) {
    if (target.variant === 'shape-fill') return checkShapeFill(target, value);
    return checkNumeric(target, value);
  },
};
