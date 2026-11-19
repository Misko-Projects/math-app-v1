// puzzle.satisfies `{ variant, rows, cols, cells, constraints }` (03 §5.5 puzzle-grid): every blank
// is filled and every constraint holds; any valid solution is correct.
//
// K01 implements the `shape-fill` variant (PUZ.03). `cells` lists the outline's cells as [r, c];
// the response is `{ fill: string[][] }` (rows × cols, '' outside the outline), each outline cell
// holding the palette piece that covers it. Pieces: `square` covers one cell, `rectangle` covers two
// side-by-side cells (either way round). Correct when every outline cell is filled and nothing
// else, the `rectangle` cells pair up into dominoes, and the pieces used are exactly the multiset of
// the `use-each` constraint. K01 also implements the number variants `number-path` (PUZ.01),
// `sum-triangle` (PUZ.02) and `all-ways` (CPS.06), below. The other variants (K02) add their rules
// here; until then they are rejected.
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

// ---------- number variants (K01: PUZ.01 number-path, PUZ.02 sum-triangle, CPS.06 all-ways) ----------
//
// Target `{ variant, rows, cols, cells, givens, constraints, palette, nonZero? }`: `cells` lists
// every cell of the puzzle as [r, c] (for number-path in path order), `givens` the shown numbers as
// [r, c, value]. The response is `{ fill: (number | '')[][] }` (rows × cols): every puzzle cell
// holds a whole number (a palette number when the palette is not empty), givens keep their value,
// and every other cell is ''. Constraints: `line-sum` (the cells add up to `sum`) and
// `adjacent-step` (each cell of `cells` is `step` more than the one before it). `all-ways` also
// needs the rows to be different ways (turn-arounds count once, 3 + 2 is 2 + 3) and, with
// `nonZero`, no zero part; with as many rows as there are ways, that means every way.

/** The number in a filled cell, or undefined when the cell holds anything else. */
function cellNumber(fill: unknown[], r: number, c: number): number | undefined {
  const row = fill[r];
  const v = Array.isArray(row) ? row[c] : undefined;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
}

const isCell = (x: unknown): x is Cell =>
  Array.isArray(x) && x.length === 2 && x.every((v) => Number.isInteger(v));

function checkNumbers(
  target: Readonly<Record<string, unknown>>,
  value: Readonly<Record<string, unknown>>,
): boolean {
  const rows = target.rows;
  const cols = target.cols;
  if (typeof rows !== 'number' || typeof cols !== 'number') return false;
  if (!Array.isArray(target.cells) || !Array.isArray(target.constraints)) return false;
  const cells = target.cells as unknown[];
  if (!cells.every(isCell)) return false;
  const inside = new Set((cells as Cell[]).map(([r, c]) => key(r, c)));
  const fill = value.fill;
  if (!Array.isArray(fill) || fill.length !== rows) return false;
  for (let r = 0; r < rows; r += 1) {
    const row = fill[r];
    if (!Array.isArray(row) || row.length !== cols) return false;
    for (let c = 0; c < cols; c += 1) {
      if (inside.has(key(r, c))) {
        if (cellNumber(fill, r, c) === undefined) return false;
      } else if (row[c] !== '') return false;
    }
  }
  const at = ([r, c]: Cell): number => cellNumber(fill, r, c) as number;
  const palette = Array.isArray(target.palette)
    ? (target.palette as unknown[]).filter((v): v is number => typeof v === 'number')
    : [];
  const givens = Array.isArray(target.givens) ? (target.givens as unknown[]) : [];
  const given = new Set<string>();
  for (const g of givens) {
    if (!Array.isArray(g) || g.length !== 3 || !g.every((v) => Number.isInteger(v))) return false;
    const [r, c, v] = g as [number, number, number];
    if (!inside.has(key(r, c)) || at([r, c]) !== v) return false;
    given.add(key(r, c));
  }
  if (palette.length > 0) {
    for (const cell of cells as Cell[]) {
      if (!given.has(key(cell[0], cell[1])) && !palette.includes(at(cell))) return false;
    }
  }
  for (const k of target.constraints as unknown[]) {
    const con = k as Record<string, unknown> | null;
    if (con?.kind === 'line-sum') {
      const line = con.cells;
      if (!Array.isArray(line) || !line.every(isCell) || typeof con.sum !== 'number') return false;
      if (!(line as Cell[]).every((cell) => inside.has(key(cell[0], cell[1])))) return false;
      if ((line as Cell[]).reduce((s, cell) => s + at(cell), 0) !== con.sum) return false;
    } else if (con?.kind === 'adjacent-step') {
      if (typeof con.step !== 'number') return false;
      for (let i = 1; i < cells.length; i += 1) {
        if (at(cells[i] as Cell) - at(cells[i - 1] as Cell) !== con.step) return false;
      }
    } else {
      return false;
    }
  }
  if (target.variant === 'all-ways') {
    const byRow = new Map<number, number[]>();
    for (const cell of cells as Cell[]) {
      const list = byRow.get(cell[0]) ?? [];
      list.push(at(cell));
      byRow.set(cell[0], list);
    }
    const ways = new Set<string>();
    for (const parts of byRow.values()) {
      if (target.nonZero === true && parts.some((p) => p === 0)) return false;
      ways.add([...parts].sort((a, b) => a - b).join('+'));
    }
    if (ways.size !== byRow.size) return false;
  }
  return true;
}

const NUMBER_VARIANTS = new Set(['number-path', 'sum-triangle', 'all-ways']);

export const puzzleSatisfies: StateChecker = {
  id: 'puzzle.satisfies',
  check(target, value) {
    if (target.variant === 'shape-fill') return checkShapeFill(target, value);
    if (typeof target.variant === 'string' && NUMBER_VARIANTS.has(target.variant)) {
      return checkNumbers(target, value);
    }
    return false;
  },
  // all-ways: the rows may come in any order and each way either way round, so a mutation that
  // still lists every way is a valid alternative.
  exempt: (target, _original, mutated) =>
    target.variant === 'all-ways' && puzzleSatisfies.check(target, mutated),
};
