// 03 §5.5 puzzle-grid. A rows × cols grid; `cells` lists the puzzle's cells (given values, blanks
// and cage ids); every other position is outside the puzzle. The child fills blanks from the
// palette (`fill {r, c, value}`; an empty value clears a blank).
// Answers state `{ fill }` (`puzzle.satisfies`): a rows × cols grid holding each puzzle cell's value
// (given or filled) and '' outside the puzzle, once every blank is filled. Any valid solution is
// correct (03 §5.5).
// Variants checked by `puzzle.satisfies`: `shape-fill` (K01, PUZ.03) and the numeric grids:
// `cage-sum` (mini-KenKen, 3 × 3 and 4 × 4), `magic-square`, `missing-digit` and `sum-triangle`
// (cage sums, row/column uniqueness, line sums and use-each).
// `highlight-cage {id}` and `check-line {index}` are visual. The generic `answer {values}` fills
// the blanks in reading order.

import {
  type AnswerSpec,
  type PuzzleConstraint,
  puzzleGridConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { GRID_PIECES } from '../check/state/puzzle.satisfies';
import {
  argNumber,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'puzzle-grid'>;
export type PuzzleValue = number | string;

export interface PuzzleGridState extends FormatState<'puzzle-grid'> {
  /** rows × cols: a puzzle cell's value ('' while a blank is empty), '' outside the puzzle. */
  fill: PuzzleValue[][];
  highlightedCage: string | null;
  checkedLine: number | null;
}

/** Blank cells in reading order. */
export function puzzleBlanks(c: Config): { r: number; c: number }[] {
  return c.cells
    .filter((x) => x.blank)
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map(({ r, c: col }) => ({ r, c: col }));
}

// ---------- what the widget draws (U04, #13) ----------
//
// The puzzle-grid widget draws seven variants: the four K01 ships (`number-path`, `sum-triangle`,
// `all-ways`, `shape-fill`) and mini-KenKen (`cage-sum`), `magic-square` and the missing-number
// grid (`missing-digit`). Every size and number below is a bound of the schema, inside what the
// widget's layout fits in the smallest play area (packages/ui/src/widgets/puzzle-grid/layout.ts).
// The other variant names of the shared schema belong to later grades and are refused.

export const PUZZLE_VARIANTS = [
  'number-path',
  'sum-triangle',
  'all-ways',
  'shape-fill',
  'cage-sum',
  'magic-square',
  'missing-digit',
] as const;
export type PuzzleVariant = (typeof PUZZLE_VARIANTS)[number];

/** The grid sizes each variant is drawn at: [fewest, most] rows and columns. */
export const PUZZLE_GRID: Readonly<
  Record<PuzzleVariant, { rows: readonly [number, number]; cols: readonly [number, number] }>
> = {
  'number-path': { rows: [1, 3], cols: [2, 4] },
  'sum-triangle': { rows: [3, 3], cols: [5, 5] },
  'all-ways': { rows: [1, 5], cols: [2, 2] },
  'shape-fill': { rows: [1, 4], cols: [1, 4] },
  'cage-sum': { rows: [3, 4], cols: [3, 4] },
  'magic-square': { rows: [3, 3], cols: [3, 3] },
  'missing-digit': { rows: [1, 3], cols: [1, 4] },
};
/** Every number in a number puzzle (a given, a tray number, a sum) is a whole number up to this. */
export const PUZZLE_NUMBER_MAX = 99;
/** The tray holds at most this many cards. */
export const PUZZLE_PALETTE_MAX = 14;
/** A KenKen cage has at most this many cells (its label sits in one of them). */
export const PUZZLE_CAGE_CELLS_MAX = 4;
/** A number path counts on by a whole number up to this. */
export const PUZZLE_STEP_MAX = 10;

export type GridCell = readonly [number, number];

/** The six sum-triangle cells on the 3 × 5 grid, and its sides in `line-sum` order. */
export const TRIANGLE_CELLS: readonly GridCell[] = [
  [0, 2],
  [1, 1],
  [1, 3],
  [2, 0],
  [2, 2],
  [2, 4],
];
export const TRIANGLE_SIDES: readonly (readonly GridCell[])[] = [
  [
    [0, 2],
    [1, 1],
    [2, 0],
  ],
  [
    [0, 2],
    [1, 3],
    [2, 4],
  ],
  [
    [2, 0],
    [2, 2],
    [2, 4],
  ],
];

const cellKey = (r: number, c: number) => `${r},${c}`;
const isDrawn = (v: string): v is PuzzleVariant =>
  (PUZZLE_VARIANTS as readonly string[]).includes(v);
const wholeIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const sameCells = (a: readonly GridCell[], b: readonly GridCell[]) =>
  a.length === b.length && a.every(([r, c], i) => b[i]?.[0] === r && b[i]?.[1] === c);

/** A straight line of a grid that a sum can be printed at the end of. */
export type PuzzleLine =
  | { kind: 'row'; index: number }
  | { kind: 'col'; index: number }
  | { kind: 'diagonal' }
  | { kind: 'anti-diagonal' };

/**
 * The straight line a `line-sum` runs along: every puzzle cell of one row or one column (two or
 * more), or a whole diagonal of a square grid; undefined for any other set of cells.
 */
export function puzzleLine(
  c: Pick<Config, 'rows' | 'cols' | 'cells'>,
  line: readonly GridCell[],
): PuzzleLine | undefined {
  if (line.length < 2) return undefined;
  const keys = new Set(line.map(([r, col]) => cellKey(r, col)));
  if (keys.size !== line.length) return undefined;
  const all = (cells: { r: number; c: number }[]) =>
    cells.length === keys.size && cells.every((x) => keys.has(cellKey(x.r, x.c)));
  const [r0, c0] = line[0] as GridCell;
  if (all(c.cells.filter((x) => x.r === r0))) return { kind: 'row', index: r0 };
  if (all(c.cells.filter((x) => x.c === c0))) return { kind: 'col', index: c0 };
  if (c.rows !== c.cols || line.length !== c.rows) return undefined;
  if (all(c.cells.filter((x) => x.r === x.c))) return { kind: 'diagonal' };
  if (all(c.cells.filter((x) => x.r + x.c === c.rows - 1))) return { kind: 'anti-diagonal' };
  return undefined;
}

const NEXT_TO = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

/** Whether the cells hang together side by side. */
function connected(cells: readonly { r: number; c: number }[]): boolean {
  const left = new Set(cells.map((x) => cellKey(x.r, x.c)));
  const first = cells[0];
  if (!first) return false;
  const queue: [number, number][] = [[first.r, first.c]];
  left.delete(cellKey(first.r, first.c));
  while (queue.length > 0) {
    const [r, col] = queue.pop() as [number, number];
    for (const [dr, dc] of NEXT_TO) {
      if (left.delete(cellKey(r + dr, col + dc))) queue.push([r + dr, col + dc]);
    }
  }
  return left.size === 0;
}

interface DrawnIssue {
  path: (string | number)[];
  message: string;
}

/** The bounds of what the widget draws (the table in packages/engine/README.md). */
function drawnIssues(c: Config): DrawnIssue[] {
  const out: DrawnIssue[] = [];
  const add = (path: (string | number)[], message: string) => out.push({ path, message });
  if (!isDrawn(c.variant)) {
    add(['variant'], `the widget draws no ${c.variant} puzzle`);
    return out;
  }
  const size = PUZZLE_GRID[c.variant];
  if (c.rows < size.rows[0] || c.rows > size.rows[1]) {
    add(['rows'], `a ${c.variant} grid has ${size.rows[0]} to ${size.rows[1]} rows`);
  }
  if (c.cols < size.cols[0] || c.cols > size.cols[1]) {
    add(['cols'], `a ${c.variant} grid has ${size.cols[0]} to ${size.cols[1]} columns`);
  }
  if (c.palette.length > PUZZLE_PALETTE_MAX) {
    add(['palette'], `the tray holds at most ${PUZZLE_PALETTE_MAX} cards`);
  }
  if (new Set(c.palette).size !== c.palette.length) {
    add(['palette'], 'every tray card is different');
  }
  if (c.variant === 'shape-fill') {
    // The tray shows how many of each piece are left, so the puzzle lists its pieces once.
    if (c.constraints.filter((k) => k.kind === 'use-each').length !== 1) {
      add(['constraints'], 'a shape puzzle lists its pieces once');
    }
    if (!c.palette.every((v) => typeof v === 'string' && Object.hasOwn(GRID_PIECES, v))) {
      add(['palette'], 'the tray holds squares and rectangles');
    }
    return out;
  }

  const least = c.variant === 'all-ways' ? 1 : 0;
  if (!c.palette.every((v) => wholeIn(v, least, PUZZLE_NUMBER_MAX))) {
    add(['palette'], `tray numbers are whole numbers from ${least} to ${PUZZLE_NUMBER_MAX}`);
  }
  for (const [i, cell] of c.cells.entries()) {
    if (cell.given !== undefined && !wholeIn(cell.given, 0, PUZZLE_NUMBER_MAX)) {
      add(['cells', i], `a given is a whole number from 0 to ${PUZZLE_NUMBER_MAX}`);
    }
  }
  for (const [i, k] of c.constraints.entries()) {
    if ((k.kind === 'line-sum' || k.kind === 'cage-sum') && !wholeIn(k.sum, 0, PUZZLE_NUMBER_MAX)) {
      add(['constraints', i], `a sum is a whole number from 0 to ${PUZZLE_NUMBER_MAX}`);
    }
    if (k.kind === 'adjacent-step' && !wholeIn(k.step, 1, PUZZLE_STEP_MAX)) {
      add(['constraints', i], `a path counts on by a whole number from 1 to ${PUZZLE_STEP_MAX}`);
    }
  }
  const kinds = c.constraints.map((k) => k.kind);
  const count = (kind: PuzzleConstraint['kind']) => kinds.filter((k) => k === kind).length;
  const only = (...allowed: PuzzleConstraint['kind'][]) => {
    for (const [i, k] of kinds.entries()) {
      if (!allowed.includes(k)) add(['constraints', i], `a ${c.variant} puzzle has no ${k} rule`);
    }
  };
  const everyPosition = c.cells.length === c.rows * c.cols;

  switch (c.variant) {
    case 'number-path': {
      only('adjacent-step');
      if (count('adjacent-step') !== 1) add(['constraints'], 'a number path has one step rule');
      if (!everyPosition) add(['cells'], 'a number path has a cell at every position');
      // The path is drawn cell to cell, so each cell lies beside the one before it.
      for (const [i, cell] of c.cells.entries()) {
        const prev = c.cells[i - 1];
        if (prev && Math.abs(prev.r - cell.r) + Math.abs(prev.c - cell.c) !== 1) {
          add(['cells', i], 'a path cell lies beside the one before it');
        }
      }
      break;
    }
    case 'sum-triangle': {
      only('line-sum');
      const want = new Set(TRIANGLE_CELLS.map(([r, col]) => cellKey(r, col)));
      if (c.cells.length !== want.size || !c.cells.every((x) => want.has(cellKey(x.r, x.c)))) {
        add(['cells'], 'a sum triangle has three corners and three middles');
      }
      const sides = c.constraints.flatMap((k) => (k.kind === 'line-sum' ? [k.cells] : []));
      if (
        sides.length !== TRIANGLE_SIDES.length ||
        !sides.every((side, i) => sameCells(side, TRIANGLE_SIDES[i] ?? []))
      ) {
        add(['constraints'], 'a sum triangle has one sum for each side, in order');
      }
      break;
    }
    case 'all-ways': {
      only('line-sum');
      if (!everyPosition) add(['cells'], 'every row has two cells');
      if (!c.cells.every((x) => x.blank)) add(['cells'], 'every cell of a way is blank');
      const sums = c.constraints.flatMap((k) => (k.kind === 'line-sum' ? [k] : []));
      const rowByRow =
        sums.length === c.rows &&
        sums.every(
          (k, r) =>
            k.sum === sums[0]?.sum &&
            sameCells(k.cells, [
              [r, 0],
              [r, 1],
            ]),
        );
      if (!rowByRow) add(['constraints'], 'every row makes the same whole, row by row');
      break;
    }
    case 'cage-sum': {
      only('cage-sum', 'row-unique', 'col-unique');
      if (count('row-unique') !== 1 || count('col-unique') !== 1) {
        add(['constraints'], 'a KenKen has the row rule and the column rule');
      }
      const cages = new Map<string, { r: number; c: number }[]>();
      for (const [i, cell] of c.cells.entries()) {
        if (cell.cage === undefined) add(['cells', i], 'every KenKen cell is in a cage');
        else cages.set(cell.cage, [...(cages.get(cell.cage) ?? []), cell]);
      }
      for (const [cage, cells] of cages) {
        const sums = c.constraints.filter((k) => k.kind === 'cage-sum' && k.cage === cage);
        if (sums.length !== 1) add(['constraints'], `cage ${cage} has one sum`);
        if (cells.length > PUZZLE_CAGE_CELLS_MAX) {
          add(['cells'], `cage ${cage} has at most ${PUZZLE_CAGE_CELLS_MAX} cells`);
        }
        if (!connected(cells)) add(['cells'], `the cells of cage ${cage} touch`);
      }
      break;
    }
    case 'magic-square':
    case 'missing-digit': {
      only('line-sum', 'use-each');
      if (c.variant === 'magic-square' && !everyPosition) {
        add(['cells'], 'a magic square has a cell at every position');
      }
      const lines = new Set<string>();
      for (const [i, k] of c.constraints.entries()) {
        if (k.kind !== 'line-sum') continue;
        // Its sum is printed at the end of the line, so the line is one the widget can label.
        const line = puzzleLine(c, k.cells);
        const id = line ? `${line.kind}${'index' in line ? line.index : ''}` : '';
        if (!line) add(['constraints', i], 'a sum runs along a whole row, column or diagonal');
        else if (lines.has(id)) add(['constraints', i], 'a line has one sum');
        lines.add(id);
      }
      break;
    }
  }
  return out;
}

const configSchema = puzzleGridConfigSchema.superRefine((c, ctx) => {
  for (const issue of drawnIssues(c)) ctx.addIssue({ code: 'custom', ...issue });
  const seen = new Set<string>();
  for (const [i, cell] of c.cells.entries()) {
    const k = `${cell.r},${cell.c}`;
    if (cell.r < 0 || cell.c < 0 || cell.r >= c.rows || cell.c >= c.cols) {
      ctx.addIssue({ code: 'custom', path: ['cells', i], message: 'cell outside the grid' });
    }
    if (seen.has(k)) {
      ctx.addIssue({ code: 'custom', path: ['cells', i], message: 'duplicate cell' });
    }
    seen.add(k);
    if (cell.blank && cell.given !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['cells', i], message: 'a blank has no given value' });
    }
    if (!cell.blank && cell.given === undefined) {
      ctx.addIssue({ code: 'custom', path: ['cells', i], message: 'a cell is given or blank' });
    }
  }
  if (!c.cells.some((x) => x.blank)) {
    ctx.addIssue({ code: 'custom', path: ['cells'], message: 'a puzzle has a blank to fill' });
  }
  if (c.palette.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['palette'], message: 'the palette is empty' });
  }
  if (c.variant !== 'shape-fill' && !c.palette.every((v) => typeof v === 'number')) {
    ctx.addIssue({
      code: 'custom',
      path: ['palette'],
      message: 'number grids use number palettes',
    });
  }
  const cages = new Set(c.cells.flatMap((x) => (x.cage ? [x.cage] : [])));
  for (const [i, k] of c.constraints.entries()) {
    if (c.variant === 'cage-sum' && k.kind === 'cage-sum' && !cages.has(k.cage)) {
      ctx.addIssue({
        code: 'custom',
        path: ['constraints', i],
        message: 'no cell is in that cage',
      });
    }
    if (k.kind === 'line-sum' && k.cells.some(([r, col]) => !seen.has(`${r},${col}`))) {
      ctx.addIssue({
        code: 'custom',
        path: ['constraints', i],
        message: 'a line-sum names a cell outside the puzzle',
      });
    }
    // The number variants' rules are bounded by `drawnIssues`; a shape puzzle has its piece list.
    if (c.variant === 'shape-fill' && k.kind !== 'use-each') {
      ctx.addIssue({
        code: 'custom',
        path: ['constraints', i],
        message: `${k.kind} constraints are not checked for ${c.variant}`,
      });
    }
    if (c.variant !== 'shape-fill' && k.kind === 'use-each' && !numericUseEachFits(c, k.values)) {
      ctx.addIssue({
        code: 'custom',
        path: ['constraints', i],
        message:
          'use-each lists numbers for the blanks (from the palette) or for every cell (the givens plus palette numbers)',
      });
    }
    if (c.variant === 'shape-fill' && k.kind === 'use-each' && !shapeUseEachFits(c, k.values)) {
      ctx.addIssue({
        code: 'custom',
        path: ['constraints', i],
        message: 'the use-each pieces come from the palette and can tile the outline',
      });
    }
  }
  if (c.constraints.filter((k) => k.kind === 'use-each').length > 1) {
    ctx.addIssue({ code: 'custom', path: ['constraints'], message: 'one use-each list at most' });
  }
  if (c.variant === 'shape-fill') {
    // 03 §5.5: the cells are the outline's blank cells (K01 geo.compose emits no givens), so the
    // use-each feasibility check below can treat every cell as free.
    for (const [i, cell] of c.cells.entries()) {
      if (!cell.blank) {
        ctx.addIssue({
          code: 'custom',
          path: ['cells', i],
          message: 'shape-fill outline cells are blank',
        });
      }
    }
  }
  if (c.variant === 'cage-sum') {
    // Mini-KenKen: an n × n grid of the digits 1–n (puzzle.satisfies checks the same).
    const n = c.rows;
    const digit = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= n;
    if (c.cols !== n) {
      ctx.addIssue({ code: 'custom', path: ['cols'], message: 'a KenKen grid is square' });
    } else if (c.cells.length !== n * n) {
      // Every row and column holds each digit once, so every position is a puzzle cell.
      ctx.addIssue({
        code: 'custom',
        path: ['cells'],
        message: 'a KenKen grid has a cell at every position',
      });
    }
    if (!c.palette.every(digit)) {
      ctx.addIssue({ code: 'custom', path: ['palette'], message: 'KenKen digits are 1 to n' });
    }
    for (const [i, cell] of c.cells.entries()) {
      if (cell.given !== undefined && !digit(cell.given)) {
        ctx.addIssue({ code: 'custom', path: ['cells', i], message: 'KenKen digits are 1 to n' });
      }
    }
  }
});

/** Takes `remove` out of the multiset `from`; undefined when some value of `remove` is missing. */
function without(
  from: readonly (number | string)[],
  remove: readonly (number | string)[],
): (number | string)[] | undefined {
  const left = [...from];
  for (const v of remove) {
    const i = left.indexOf(v);
    if (i < 0) return undefined;
    left.splice(i, 1);
  }
  return left;
}

/**
 * A numeric use-each list can be met: numbers, one per blank (each from the palette), or one per
 * puzzle cell (the givens among them, and the rest from the palette).
 */
function numericUseEachFits(c: Config, values: readonly (number | string)[]): boolean {
  if (!values.every((v) => typeof v === 'number')) return false;
  const blanks = c.cells.filter((x) => x.blank).length;
  if (values.length === blanks) return values.every((v) => c.palette.includes(v));
  if (values.length !== c.cells.length) return false;
  const givens = c.cells.flatMap((x) => (x.given === undefined ? [] : [x.given]));
  const rest = without(values, givens);
  return rest?.every((v) => c.palette.includes(v)) === true;
}

/**
 * A shape-fill use-each list can tile the outline: palette pieces only, their cells add up to the
 * outline's, and the outline holds that many disjoint side-by-side pairs for the rectangles
 * (squares cover any cells left over).
 */
function shapeUseEachFits(c: Config, values: readonly (number | string)[]): boolean {
  if (!values.every((v) => typeof v === 'string' && c.palette.includes(v))) return false;
  if (!values.every((v) => Object.hasOwn(GRID_PIECES, v))) return false;
  const area = values.reduce<number>((n, v) => n + (GRID_PIECES[v as string] ?? 0), 0);
  if (area !== c.cells.length) return false;
  const rects = values.filter((v) => v === 'rectangle').length;
  return maxDominoes(c.cells) >= rects;
}

/** The most disjoint side-by-side cell pairs (a maximum matching on the checkerboard graph). */
function maxDominoes(cells: readonly { r: number; c: number }[]): number {
  return rectanglePairs(cells.map((x) => [x.r, x.c])).pairs.length;
}

/**
 * The cells paired into side-by-side rectangles, as many as can be (a maximum matching on the
 * checkerboard graph), and the cells left over. Every cell pairs up exactly when `alone` is empty,
 * which is the checker's `pairsUp`. The widget draws these pairs as the rectangles.
 */
export function rectanglePairs(list: readonly GridCell[]): {
  pairs: [GridCell, GridCell][];
  alone: GridCell[];
} {
  const cells = [...list].sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([r, c]) => ({ r, c }));
  const id = new Map(cells.map((x, i) => [`${x.r},${x.c}`, i]));
  const dark = cells.flatMap((x, i) => ((x.r + x.c) % 2 === 0 ? [i] : []));
  const next = (i: number) => {
    const { r, c } = cells[i] as { r: number; c: number };
    return [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ].flatMap(([a, b]) => {
      const j = id.get(`${a},${b}`);
      return j === undefined ? [] : [j];
    });
  };
  const partner = new Map<number, number>(); // light cell → its dark partner
  const augment = (i: number, seen: Set<number>): boolean => {
    for (const j of next(i)) {
      if (seen.has(j)) continue;
      seen.add(j);
      const k = partner.get(j);
      if (k === undefined || augment(k, seen)) {
        partner.set(j, i);
        return true;
      }
    }
    return false;
  };
  for (const i of dark) augment(i, new Set());
  const at = (i: number): GridCell => [
    (cells[i] as { r: number }).r,
    (cells[i] as { c: number }).c,
  ];
  const pairs = [...partner].map(([light, darkCell]): [GridCell, GridCell] =>
    light < darkCell ? [at(light), at(darkCell)] : [at(darkCell), at(light)],
  );
  pairs.sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]);
  const paired = new Set(pairs.flatMap(([a, b]) => [cellKey(a[0], a[1]), cellKey(b[0], b[1])]));
  return {
    pairs,
    alone: cells.filter((x) => !paired.has(cellKey(x.r, x.c))).map((x): GridCell => [x.r, x.c]),
  };
}

// ---------- the rules, read from the config (one source for the widget and the checker) ----------

/** The rule a fill does not meet, and the cells to look at again. */
export interface PuzzleMark {
  kind: 'row' | 'col' | 'cage' | 'line' | 'step' | 'ways' | 'pieces' | 'pairs';
  cells: GridCell[];
  /** The index of the constraint in `config.constraints` (none for `ways` and `pairs`). */
  constraint?: number;
}

/**
 * The first rule of the puzzle that `fill` does not meet, or null when it meets them all. A rule
 * is read only where its cells are filled, so on a fill with every blank filled from the tray
 * null means exactly what `puzzle.satisfies` accepts (`answerIssues` holds the checker's target
 * to this config; a property test holds the two readings together on every shipped template).
 * The widget shows the mark at the grid after a Check that left a rule unmet.
 */
export function puzzleUnmet(
  c: Config,
  fill: readonly (readonly PuzzleValue[])[],
): PuzzleMark | null {
  const at = (r: number, col: number): PuzzleValue => fill[r]?.[col] ?? '';
  const filled = (cells: readonly GridCell[]) => cells.every(([r, col]) => at(r, col) !== '');
  const total = (cells: readonly GridCell[]) =>
    cells.reduce((n, [r, col]) => n + (at(r, col) as number), 0);
  const cellsOf = (list: readonly { r: number; c: number }[]): GridCell[] =>
    list.map((x) => [x.r, x.c]);
  const repeats = (cells: readonly GridCell[]) => {
    const values = cells.map(([r, col]) => at(r, col)).filter((v) => v !== '');
    return new Set(values).size !== values.length;
  };

  for (const [constraint, k] of c.constraints.entries()) {
    switch (k.kind) {
      case 'row-unique':
      case 'col-unique': {
        const row = k.kind === 'row-unique';
        for (let i = 0; i < (row ? c.rows : c.cols); i += 1) {
          const line = cellsOf(c.cells.filter((x) => (row ? x.r : x.c) === i));
          if (repeats(line)) return { kind: row ? 'row' : 'col', cells: line, constraint };
        }
        break;
      }
      case 'cage-sum': {
        const cage = cellsOf(c.cells.filter((x) => x.cage === k.cage));
        if (filled(cage) && total(cage) !== k.sum) return { kind: 'cage', cells: cage, constraint };
        break;
      }
      case 'line-sum': {
        const line = k.cells.map(([r, col]): GridCell => [r, col]);
        if (filled(line) && total(line) !== k.sum) return { kind: 'line', cells: line, constraint };
        break;
      }
      case 'adjacent-step': {
        const path = cellsOf(c.cells);
        for (const [i, cell] of path.entries()) {
          const prev = path[i - 1];
          if (!prev || !filled([prev, cell])) continue;
          if ((at(cell[0], cell[1]) as number) - (at(prev[0], prev[1]) as number) !== k.step) {
            return { kind: 'step', cells: [prev, cell], constraint };
          }
        }
        break;
      }
      case 'use-each': {
        const pool =
          c.variant === 'shape-fill' || k.values.length === c.cells.length
            ? c.cells
            : c.cells.filter((x) => x.blank);
        const held = pool.map((x) => at(x.r, x.c)).filter((v) => v !== '');
        // Too many of a listed value, or a value the list does not have at all.
        for (const value of new Set([...k.values, ...held])) {
          // A rectangle is one piece on two cells.
          const each = c.variant === 'shape-fill' ? (GRID_PIECES[String(value)] ?? 1) : 1;
          const have = k.values.filter((v) => v === value).length * each;
          const holding = cellsOf(pool.filter((x) => at(x.r, x.c) === value));
          if (holding.length > have) return { kind: 'pieces', cells: holding, constraint };
        }
        break;
      }
      default:
        break;
    }
  }
  if (c.variant === 'all-ways') {
    // Every row is a different way; a turn-around (3 + 2 after 2 + 3) is the same way.
    const ways = new Set<string>();
    for (let r = 0; r < c.rows; r += 1) {
      const row = cellsOf(c.cells.filter((x) => x.r === r));
      if (!filled(row)) continue;
      const way = row
        .map(([rr, col]) => at(rr, col) as number)
        .sort((a, b) => a - b)
        .join('+');
      if (ways.has(way)) return { kind: 'ways', cells: row };
      ways.add(way);
    }
  }
  if (c.variant === 'shape-fill' && filled(cellsOf(c.cells))) {
    const { alone } = rectanglePairs(cellsOf(c.cells.filter((x) => at(x.r, x.c) === 'rectangle')));
    if (alone.length > 0) return { kind: 'pairs', cells: alone };
  }
  return null;
}

const sameJson = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return (
    ka.length === kb.length &&
    ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
};

/**
 * Why an item's answer is not the one this config asks for (FormatModel.answerIssues): the
 * answer is `puzzle.satisfies`, and its target is this config's own puzzle: the same variant,
 * size, cells (a number path in path order), givens, rules and tray. The widget reads the rules
 * from the config (`puzzleUnmet`), so its mark and the checker never disagree.
 */
export function puzzleAnswerIssues(c: Config, answer: AnswerSpec): string[] {
  if (answer.kind !== 'state' || answer.checker !== 'puzzle.satisfies') {
    return ['a puzzle grid is checked by puzzle.satisfies'];
  }
  const t = answer.target as Readonly<Record<string, unknown>>;
  const out: string[] = [];
  for (const key of ['variant', 'rows', 'cols'] as const) {
    if (t[key] !== c[key]) out.push(`the target's ${key} is not the config's`);
  }
  if (!sameJson(t.constraints, c.constraints)) out.push("the target's rules are not the config's");
  const cells = Array.isArray(t.cells) ? (t.cells as unknown[]) : [];
  // The checker reads [r, c] cells for a shape puzzle and K01's three number variants, and the
  // config's own cells for the others: a target in the other form would reject every grid.
  const pairs = cells.length > 0 && Array.isArray(cells[0]);
  const wantsPairs = ['shape-fill', 'number-path', 'sum-triangle', 'all-ways'].includes(c.variant);
  if (pairs && !wantsPairs) out.push(`a ${c.variant} target lists the config's own cells`);
  if (!pairs && c.variant === 'shape-fill')
    out.push('a shape-fill target lists its cells as [r, c]');
  if (pairs) {
    // K01's form: cells as [r, c] (a number path in path order), givens as [r, c, value].
    const own = c.cells.map((x) => [x.r, x.c]);
    const sorted = (list: unknown[]) => [...list].map((x) => JSON.stringify(x)).sort();
    const inOrder = c.variant === 'number-path';
    if (inOrder ? !sameJson(cells, own) : !sameJson(sorted(cells), sorted(own))) {
      out.push("the target's cells are not the config's");
    }
    if (c.variant !== 'shape-fill') {
      const givens = c.cells.flatMap((x) => (x.given === undefined ? [] : [[x.r, x.c, x.given]]));
      const theirs = Array.isArray(t.givens) ? (t.givens as unknown[]) : [];
      if (!sameJson(sorted(theirs), sorted(givens))) {
        out.push("the target's givens are not the config's");
      }
    }
  } else if (!sameJson(cells, c.cells)) {
    out.push("the target's cells are not the config's");
  }
  // A shape-fill target has no tray: its pieces are the checker's own.
  if (c.variant !== 'shape-fill' && !sameJson(t.palette, c.palette)) {
    out.push("the target's tray is not the config's");
  }
  return out;
}

export const puzzleGrid: FormatModel<'puzzle-grid', PuzzleGridState> = {
  format: 'puzzle-grid',
  configSchema,
  answerIssues: puzzleAnswerIssues,
  features: {
    blanks: { weight: 0.2, doc: 'blanks − 1' },
    constraints: { weight: 0.15, doc: 'constraints − 1' },
    'size.4x4': { weight: 0.6, doc: 'the grid is 4 × 4 or larger' },
    'ops.subtract': { weight: 0.4, doc: 'a constraint subtracts (an equation with −)' },
    multipleSolutions: { weight: -0.3, doc: 'more than one solution' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const subtract = c.constraints.some(
      (k) => k.kind === 'equation' && k.expr.tokens.some((t) => t.t === 'op' && t.v === '-'),
    );
    return {
      blanks: Math.max(0, c.cells.filter((x) => x.blank).length - 1),
      constraints: Math.max(0, c.constraints.length - 1),
      'size.4x4': Math.min(c.rows, c.cols) >= 4 ? 1 : 0,
      'ops.subtract': subtract ? 1 : 0,
      multipleSolutions: c.uniqueSolution ? 0 : 1,
    };
  },
  initialState(config) {
    const fill: PuzzleValue[][] = Array.from({ length: config.rows }, () =>
      new Array<PuzzleValue>(config.cols).fill(''),
    );
    for (const cell of config.cells) {
      const row = fill[cell.r];
      if (row && cell.given !== undefined) row[cell.c] = cell.given;
    }
    return { config, fill, highlightedCage: null, checkedLine: null };
  },
  apply(s, a) {
    switch (a.op) {
      case 'fill': {
        const r = argNumber(a, 'r');
        const col = argNumber(a, 'c');
        const raw = a.args?.value;
        const cell = s.config.cells.find((x) => x.r === r && x.c === col);
        if (!cell?.blank || r === undefined || col === undefined) return s;
        let v: PuzzleValue = '';
        if (typeof raw === 'number' || typeof raw === 'string') {
          // Only palette values go in a blank ('' clears it).
          if (raw !== '' && !s.config.palette.includes(raw)) return s;
          v = raw;
        } else if (raw !== undefined && raw !== null) return s;
        const fill = s.fill.map((row) => [...row]);
        (fill[r] as PuzzleValue[])[col] = v;
        return { ...s, fill };
      }
      case 'highlight-cage':
        return { ...s, highlightedCage: argString(a, 'id') ?? null };
      case 'check-line': {
        const i = argNumber(a, 'index');
        return { ...s, checkedLine: i === undefined ? null : i };
      }
      case 'answer': {
        const values = a.args?.values;
        if (!Array.isArray(values)) return s;
        const fill = s.fill.map((row) => [...row]);
        puzzleBlanks(s.config).forEach(({ r, c: col }, i) => {
          const v = values[i];
          (fill[r] as PuzzleValue[])[col] = typeof v === 'number' || typeof v === 'string' ? v : '';
        });
        return { ...s, fill };
      }
      default:
        throw new UnsupportedOpError('puzzle-grid', a.op);
    }
  },
  toResponse(s) {
    if (puzzleBlanks(s.config).some(({ r, c }) => s.fill[r]?.[c] === '')) return null;
    return { kind: 'state', value: { fill: s.fill.map((row) => [...row]) } };
  },
};
