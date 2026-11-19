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
    if (c.variant !== 'shape-fill' && k.kind === 'use-each') {
      // The values fill the blanks (or every cell, one value each), as numbers from the palette.
      const blanks = c.cells.filter((x) => x.blank).length;
      const fits = k.values.length === blanks || k.values.length === c.cells.length;
      const pool = k.values.length === blanks ? k.values : [];
      if (
        !fits ||
        !k.values.every((v) => typeof v === 'number') ||
        !pool.every((v) => c.palette.includes(v))
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['constraints', i],
          message: 'use-each lists numbers for the blanks or for every cell, from the palette',
        });
      }
    }
  }
});

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
