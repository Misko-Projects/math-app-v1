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

/** The constraint kinds `puzzle.satisfies` evaluates for the numeric variants. */
export const NUMERIC_CONSTRAINTS: readonly PuzzleConstraint['kind'][] = [
  'cage-sum',
  'row-unique',
  'col-unique',
  'line-sum',
  'use-each',
];

/** Blank cells in reading order. */
export function puzzleBlanks(c: Config): { r: number; c: number }[] {
  return c.cells
    .filter((x) => x.blank)
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map(({ r, c: col }) => ({ r, c: col }));
}

const configSchema = puzzleGridConfigSchema.superRefine((c, ctx) => {
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
    if (k.kind === 'cage-sum' && !cages.has(k.cage)) {
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
    if (
      c.variant === 'shape-fill' ? k.kind !== 'use-each' : !NUMERIC_CONSTRAINTS.includes(k.kind)
    ) {
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
  if (c.variant !== 'shape-fill') {
    for (const [i, cell] of c.cells.entries()) {
      if (cell.given !== undefined && typeof cell.given !== 'number') {
        ctx.addIssue({
          code: 'custom',
          path: ['cells', i],
          message: 'number grids have number givens',
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
  let pairs = 0;
  for (const i of dark) if (augment(i, new Set())) pairs += 1;
  return pairs;
}

export const puzzleGrid: FormatModel<'puzzle-grid', PuzzleGridState> = {
  format: 'puzzle-grid',
  configSchema,
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
