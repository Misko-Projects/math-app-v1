// The domain the puzzle-grid widget draws (U04, #13): one test per bound of the schema, the one
// source of the answer (`answerIssues`), the rule the widget marks (`puzzleUnmet`) against the
// checker, and what every shipped template promises about its solutions, over 500 seeds each.

import type { AnswerSpec, GeneratedItem, WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  PUZZLE_CAGE_CELLS_MAX,
  PUZZLE_GRID,
  PUZZLE_NUMBER_MAX,
  PUZZLE_PALETTE_MAX,
  PUZZLE_STEP_MAX,
  PUZZLE_VARIANTS,
  type PuzzleValue,
  puzzleAnswerIssues,
  puzzleBlanks,
  puzzleGrid,
  puzzleLine,
  puzzleUnmet,
  rectanglePairs,
} from '../src/formats/puzzle-grid';
import { matches } from '../src/items/check';
import { generateItem } from '../src/items/generate';
import { fixtureTemplate, loadFixture } from './fixture';

type Config = WidgetConfigOf<'puzzle-grid'>;

const fixture = loadFixture();
const SEEDS = 500;
/** The shipped templates of the format, with the variant each draws. */
const SHIPPED: Readonly<Record<string, Config['variant']>> = {
  'CPS.06.t3': 'all-ways',
  'PUZ.01.t1': 'number-path',
  'PUZ.02.t1': 'sum-triangle',
  'PUZ.02.t3': 'sum-triangle',
  'PUZ.03.t2': 'shape-fill',
};

const issues = (c: Config) => {
  const r = puzzleGrid.configSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};
const refused = (c: Config, path: string) =>
  expect(
    issues(c).some((i) => i.startsWith(`${path}:`)),
    `${path} in ${JSON.stringify(issues(c))}`,
  ).toBe(true);

function configOf(item: GeneratedItem): Config {
  if (item.widget.format !== 'puzzle-grid') throw new Error('not a puzzle grid');
  return item.widget;
}

/** A grid of givens (numbers) and blanks (null); `cages` gives each cell its cage id. */
function grid(
  variant: Config['variant'],
  values: (number | null)[][],
  extra: Partial<Config> = {},
  cages?: string[][],
): Config {
  return {
    format: 'puzzle-grid',
    variant,
    rows: values.length,
    cols: values[0]?.length ?? 0,
    cells: values.flatMap((row, r) =>
      row.map((v, c) => ({
        r,
        c,
        ...(v === null ? { blank: true } : { given: v }),
        ...(cages ? { cage: cages[r]?.[c] } : {}),
      })),
    ),
    constraints: [],
    palette: [1, 2, 3, 4],
    uniqueSolution: true,
    ...extra,
  };
}
const line = (cells: [number, number][], sum: number) => ({
  kind: 'line-sum' as const,
  cells,
  sum,
});
const rowLine = (r: number, n: number, sum: number) =>
  line(
    Array.from({ length: n }, (_, c): [number, number] => [r, c]),
    sum,
  );
const colLine = (c: number, n: number, sum: number) =>
  line(
    Array.from({ length: n }, (_, r): [number, number] => [r, c]),
    sum,
  );

const path = (values: (number | null)[][], extra: Partial<Config> = {}) =>
  grid('number-path', values, {
    constraints: [{ kind: 'adjacent-step', step: 1 }],
    palette: [1, 2, 3, 4, 5],
    ...extra,
  });

const KENKEN_CAGES = [
  ['a', 'a', 'b'],
  ['c', 'd', 'b'],
  ['c', 'd', 'e'],
];
/** A 3 × 3 mini-KenKen whose only solution is 1 2 3 / 2 3 1 / 3 1 2. */
const kenken = (extra: Partial<Config> = {}, cages = KENKEN_CAGES) =>
  grid(
    'cage-sum',
    [
      [null, null, null],
      [null, null, null],
      [null, null, 2],
    ],
    {
      palette: [1, 2, 3],
      constraints: [
        { kind: 'row-unique' },
        { kind: 'col-unique' },
        { kind: 'cage-sum', cage: 'a', sum: 3 },
        { kind: 'cage-sum', cage: 'b', sum: 4 },
        { kind: 'cage-sum', cage: 'c', sum: 5 },
        { kind: 'cage-sum', cage: 'd', sum: 4 },
        { kind: 'cage-sum', cage: 'e', sum: 2 },
      ],
      ...extra,
    },
    cages,
  );

const magic = (extra: Partial<Config> = {}) =>
  grid(
    'magic-square',
    [
      [2, null, 6],
      [null, 5, null],
      [4, null, 8],
    ],
    {
      palette: [1, 3, 7, 9],
      constraints: [
        rowLine(0, 3, 15),
        rowLine(1, 3, 15),
        rowLine(2, 3, 15),
        colLine(0, 3, 15),
        colLine(1, 3, 15),
        colLine(2, 3, 15),
        line(
          [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
          15,
        ),
        line(
          [
            [0, 2],
            [1, 1],
            [2, 0],
          ],
          15,
        ),
        { kind: 'use-each', values: [1, 3, 7, 9] },
      ],
      ...extra,
    },
  );

const numberGrid = (extra: Partial<Config> = {}) =>
  grid(
    'missing-digit',
    [
      [3, null],
      [null, 4],
    ],
    {
      palette: [1, 2, 3, 4, 5],
      constraints: [rowLine(0, 2, 5), rowLine(1, 2, 5), colLine(0, 2, 4), colLine(1, 2, 6)],
      ...extra,
    },
  );

const ways = (rows: number, whole: number, extra: Partial<Config> = {}) =>
  grid(
    'all-ways',
    Array.from({ length: rows }, () => [null, null]),
    {
      palette: Array.from({ length: whole - 1 }, (_, i) => i + 1),
      constraints: Array.from({ length: rows }, (_, r) => rowLine(r, 2, whole)),
      uniqueSolution: false,
      ...extra,
    },
  );

const triangle = (extra: Partial<Config> = {}): Config => ({
  format: 'puzzle-grid',
  variant: 'sum-triangle',
  rows: 3,
  cols: 5,
  cells: [
    { r: 0, c: 2, given: 1 },
    { r: 1, c: 1, blank: true },
    { r: 1, c: 3, blank: true },
    { r: 2, c: 0, given: 2 },
    { r: 2, c: 2, given: 4 },
    { r: 2, c: 4, given: 3 },
  ],
  constraints: [
    line(
      [
        [0, 2],
        [1, 1],
        [2, 0],
      ],
      9,
    ),
    line(
      [
        [0, 2],
        [1, 3],
        [2, 4],
      ],
      9,
    ),
    line(
      [
        [2, 0],
        [2, 2],
        [2, 4],
      ],
      9,
    ),
  ],
  palette: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  uniqueSolution: true,
  ...extra,
});

const shapes = (extra: Partial<Config> = {}): Config => ({
  format: 'puzzle-grid',
  variant: 'shape-fill',
  rows: 2,
  cols: 2,
  cells: [
    { r: 0, c: 0, blank: true },
    { r: 0, c: 1, blank: true },
    { r: 1, c: 0, blank: true },
  ],
  constraints: [{ kind: 'use-each', values: ['rectangle', 'square'] }],
  palette: ['square', 'rectangle'],
  uniqueSolution: false,
  ...extra,
});

/** The fill of a state: the givens, and `values` in the blanks in reading order. */
function filled(c: Config, values: readonly PuzzleValue[]): PuzzleValue[][] {
  const s = puzzleGrid.apply(puzzleGrid.initialState(c), { op: 'answer', args: { values } });
  return s.fill;
}

/** The target `puzzle.satisfies` gets for the hand-made configs (the config's own cells). */
const targetOf = (c: Config): AnswerSpec => ({
  kind: 'state',
  checker: 'puzzle.satisfies',
  target: {
    variant: c.variant,
    rows: c.rows,
    cols: c.cols,
    cells: c.cells,
    constraints: c.constraints,
    palette: c.palette,
  },
});
const accepted = (answer: AnswerSpec, fill: PuzzleValue[][]) =>
  matches(answer, { kind: 'state', value: { fill } });

/** Every solution of a puzzle from its tray, up to `cap`, by filling the blanks in order. */
function solutions(c: Config, cap: number): PuzzleValue[][][] {
  const blanks = puzzleBlanks(c);
  const fill = puzzleGrid.initialState(c).fill.map((row) => [...row]);
  const out: PuzzleValue[][][] = [];
  const go = (i: number) => {
    if (out.length >= cap) return;
    const blank = blanks[i];
    if (!blank) {
      out.push(fill.map((row) => [...row]));
      return;
    }
    for (const v of c.palette) {
      (fill[blank.r] as PuzzleValue[])[blank.c] = v;
      if (puzzleUnmet(c, fill) === null) go(i + 1);
    }
    (fill[blank.r] as PuzzleValue[])[blank.c] = '';
  };
  go(0);
  return out;
}

/** A small seeded generator for the random fills (the tests never use Math.random). */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('puzzle-grid: the bounds of what the widget draws', () => {
  it('accepts every variant the widget draws', () => {
    for (const c of [
      path([[1, null, 3]]),
      triangle(),
      ways(2, 5),
      shapes(),
      kenken(),
      magic(),
      numberGrid(),
    ]) {
      expect(issues(c), c.variant).toEqual([]);
    }
    expect(PUZZLE_VARIANTS).toHaveLength(7);
  });

  it('refuses the variants of later grades, which it does not draw', () => {
    for (const variant of ['digit-cards', 'clues', 'coin-ways', 'rect-ways'] as const) {
      refused({ ...numberGrid(), variant }, 'variant');
    }
  });

  it('bounds the rows and columns of every variant', () => {
    for (const variant of PUZZLE_VARIANTS) {
      const size = PUZZLE_GRID[variant];
      const cell = (rows: number, cols: number) =>
        grid(
          variant,
          Array.from({ length: rows }, () => new Array<null>(cols).fill(null)),
        );
      refused(cell(size.rows[1] + 1, size.cols[1]), 'rows');
      refused(cell(size.rows[1], size.cols[1] + 1), 'cols');
      if (size.rows[0] > 1) refused(cell(size.rows[0] - 1, size.cols[0]), 'rows');
      if (size.cols[0] > 1) refused(cell(size.rows[0], size.cols[0] - 1), 'cols');
      expect(size.rows[1]).toBeLessThanOrEqual(5);
      expect(size.cols[1]).toBeLessThanOrEqual(5);
    }
  });

  it('bounds the tray: at most 14 cards, every one different', () => {
    const many = Array.from({ length: PUZZLE_PALETTE_MAX + 1 }, (_, i) => i);
    refused(path([[1, null, 3]], { palette: many }), 'palette');
    expect(issues(path([[1, null, 3]], { palette: many.slice(1) }))).toEqual([]);
    refused(path([[1, null, 3]], { palette: [2, 2] }), 'palette');
    refused(shapes({ palette: ['square', 'rectangle', 'square'] }), 'palette');
  });

  it('bounds every tray number: whole, 0 to 99 (1 to 99 for the ways to make a number)', () => {
    for (const bad of [PUZZLE_NUMBER_MAX + 1, -1, 1.5]) {
      refused(path([[1, null, 3]], { palette: [2, bad] }), 'palette');
    }
    expect(issues(path([[1, null, 3]], { palette: [0, 2, PUZZLE_NUMBER_MAX] }))).toEqual([]);
    refused(ways(2, 5, { palette: [0, 1, 2, 3, 4] }), 'palette');
    refused(numberGrid({ palette: ['square'] }), 'palette');
  });

  it('bounds every given: whole, 0 to 99', () => {
    for (const bad of [PUZZLE_NUMBER_MAX + 1, -1, 1.5]) {
      refused(path([[bad, null, 3]]), 'cells.0');
    }
    expect(issues(path([[PUZZLE_NUMBER_MAX - 1, null]], { palette: [99] }))).toEqual([]);
  });

  it('bounds every sum: whole, 0 to 99', () => {
    for (const bad of [PUZZLE_NUMBER_MAX + 1, -1, 4.5]) {
      refused(numberGrid({ constraints: [rowLine(0, 2, bad), rowLine(1, 2, 5)] }), 'constraints.0');
      const k = kenken();
      refused(
        {
          ...k,
          constraints: k.constraints.map((x) =>
            x.kind === 'cage-sum' && x.cage === 'a' ? { ...x, sum: bad } : x,
          ),
        },
        'constraints.2',
      );
    }
  });

  it('bounds the step of a number path: whole, 1 to 10, one rule, nothing else', () => {
    for (const bad of [0, PUZZLE_STEP_MAX + 1, 0.5, -1]) {
      refused(
        path([[1, null, 3]], { constraints: [{ kind: 'adjacent-step', step: bad }] }),
        'constraints.0',
      );
    }
    refused(path([[1, null, 3]], { constraints: [] }), 'constraints');
    refused(
      path([[1, null, 3]], {
        constraints: [{ kind: 'adjacent-step', step: 1 }, rowLine(0, 3, 6)],
      }),
      'constraints.1',
    );
  });

  it('a number path has a cell at every position, each beside the one before it', () => {
    const c = path([[1, null, 3]]);
    refused({ ...c, cells: c.cells.slice(0, 2) }, 'cells');
    // 1 → 3 → 2 in one row jumps over a cell.
    const jump = [c.cells[0], c.cells[2], c.cells[1]] as Config['cells'];
    refused({ ...c, cells: jump }, 'cells.1');
  });

  it('a sum triangle is the six cells and one sum for each side, in order', () => {
    const c = triangle();
    refused({ ...c, cells: c.cells.slice(0, 5) }, 'cells');
    refused({ ...c, constraints: c.constraints.slice(0, 2) }, 'constraints');
    refused(
      { ...c, constraints: [c.constraints[1], c.constraints[0], c.constraints[2]] as never },
      'constraints',
    );
    refused({ ...c, constraints: [...c.constraints, { kind: 'row-unique' }] }, 'constraints.3');
  });

  it('the ways to make a number: two blank cells a row, every row the same whole, at most 5 rows', () => {
    expect(issues(ways(5, 10))).toEqual([]);
    refused(ways(6, 12), 'rows');
    const c = ways(2, 5);
    refused({ ...c, cells: c.cells.slice(0, 3) }, 'cells');
    refused({ ...c, cells: [{ r: 0, c: 0, given: 1 }, ...c.cells.slice(1)] }, 'cells');
    refused({ ...c, constraints: [rowLine(0, 2, 5), rowLine(1, 2, 4)] }, 'constraints');
    refused({ ...c, constraints: [rowLine(1, 2, 5), rowLine(0, 2, 5)] }, 'constraints');
    refused({ ...c, constraints: [rowLine(0, 2, 5)] }, 'constraints');
  });

  it('a mini-KenKen is 3 × 3 or 4 × 4, with both rules, and every cell in a cage with one sum', () => {
    const c = kenken();
    refused({ ...c, constraints: c.constraints.slice(1) }, 'constraints');
    refused({ ...c, constraints: [...c.constraints, rowLine(0, 3, 6)] }, 'constraints.7');
    refused(
      { ...c, cells: c.cells.map((x, i) => (i === 0 ? { r: x.r, c: x.c, blank: true } : x)) },
      'cells.0',
    );
    refused(
      {
        ...c,
        constraints: c.constraints.filter((k) => !(k.kind === 'cage-sum' && k.cage === 'e')),
      },
      'constraints',
    );
    refused(
      { ...c, constraints: [...c.constraints, { kind: 'cage-sum', cage: 'e', sum: 2 }] },
      'constraints',
    );
  });

  it('a cage has at most 4 cells, and its cells touch', () => {
    const big = [
      ['a', 'a', 'a'],
      ['a', 'a', 'b'],
      ['c', 'c', 'b'],
    ];
    expect(PUZZLE_CAGE_CELLS_MAX).toBe(4);
    refused(kenken({}, big), 'cells');
    const apart = [
      ['a', 'b', 'a'],
      ['c', 'd', 'b'],
      ['c', 'd', 'e'],
    ];
    expect(issues(kenken({}, apart)).some((i) => i.includes('touch'))).toBe(true);
  });

  it('a 4 × 4 mini-KenKen is drawn too', () => {
    const cages = [
      ['a', 'a', 'b', 'b'],
      ['c', 'c', 'd', 'd'],
      ['e', 'e', 'f', 'f'],
      ['g', 'g', 'h', 'h'],
    ];
    const c = grid(
      'cage-sum',
      Array.from({ length: 4 }, () => [null, null, null, null]),
      {
        palette: [1, 2, 3, 4],
        constraints: [
          { kind: 'row-unique' },
          { kind: 'col-unique' },
          ...['a', 'd', 'e', 'h'].map((cage) => ({ kind: 'cage-sum' as const, cage, sum: 3 })),
          ...['b', 'c', 'f', 'g'].map((cage) => ({ kind: 'cage-sum' as const, cage, sum: 7 })),
        ],
        uniqueSolution: false,
      },
      cages,
    );
    expect(issues(c)).toEqual([]);
    const found = solutions(c, 50);
    expect(found.length).toBeGreaterThan(0);
    for (const fill of found) expect(accepted(targetOf(c), fill)).toBe(true);
  });

  it('a magic square and a number grid print each sum at the end of a whole line, once', () => {
    const c = numberGrid();
    // Half a row is not a line the widget can label.
    refused({ ...c, constraints: [line([[0, 0]], 3)] }, 'constraints.0');
    refused(
      {
        ...c,
        constraints: [
          line(
            [
              [0, 0],
              [1, 1],
            ],
            7,
          ),
          line(
            [
              [0, 1],
              [1, 0],
            ],
            7,
          ),
          line(
            [
              [1, 1],
              [0, 0],
            ],
            7,
          ),
        ],
      },
      'constraints.2',
    );
    refused({ ...c, constraints: [...c.constraints, { kind: 'row-unique' }] }, 'constraints.4');
    const m = magic();
    refused({ ...m, cells: m.cells.slice(0, 8) }, 'cells');
    expect(
      puzzleLine(m, [
        [0, 2],
        [1, 1],
        [2, 0],
      ]),
    ).toEqual({ kind: 'anti-diagonal' });
    expect(
      puzzleLine(m, [
        [2, 0],
        [2, 1],
        [2, 2],
      ]),
    ).toEqual({ kind: 'row', index: 2 });
    expect(
      puzzleLine(m, [
        [0, 1],
        [1, 1],
        [2, 1],
      ]),
    ).toEqual({ kind: 'col', index: 1 });
    expect(
      puzzleLine(m, [
        [0, 0],
        [1, 1],
      ]),
    ).toBeUndefined();
  });

  it('a shape puzzle lists its pieces once, and its tray holds squares and rectangles', () => {
    refused(shapes({ constraints: [] }), 'constraints');
    refused(shapes({ palette: ['square', 'rectangle', 'triangle'] }), 'palette');
    refused(shapes({ rows: 5, cells: [...shapes().cells, { r: 4, c: 0, blank: true }] }), 'rows');
  });
});

describe('puzzle-grid: the rule a fill leaves unmet (what the widget marks at the grid)', () => {
  it('a mini-KenKen: the row, the column or the cage', () => {
    const c = kenken();
    const mark = (values: number[]) => puzzleUnmet(c, filled(c, values));
    // Blanks in reading order; the given 2 is the last cell.
    expect(mark([1, 2, 3, 2, 3, 1, 3, 1])).toBeNull();
    expect(mark([1, 1, 3, 2, 3, 1, 3, 1])).toMatchObject({
      kind: 'row',
      cells: [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
    });
    // Every row holds, and the first column has 1 twice.
    expect(mark([1, 2, 3, 1, 3, 2, 3, 1])).toMatchObject({ kind: 'col', constraint: 1 });
    expect(accepted(targetOf(c), filled(c, [1, 2, 3, 2, 3, 1, 3, 1]))).toBe(true);
    expect(solutions(c, 5)).toHaveLength(1);
  });

  it('a cage whose numbers do not make its sum is marked when its rows and columns hold', () => {
    const cages = [
      ['a', 'a', 'b'],
      ['c', 'c', 'b'],
      ['d', 'd', 'e'],
    ];
    const c = grid(
      'cage-sum',
      [
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ],
      {
        palette: [1, 2, 3],
        constraints: [
          { kind: 'row-unique' },
          { kind: 'col-unique' },
          { kind: 'cage-sum', cage: 'a', sum: 3 },
          { kind: 'cage-sum', cage: 'b', sum: 4 },
          { kind: 'cage-sum', cage: 'c', sum: 5 },
          { kind: 'cage-sum', cage: 'd', sum: 4 },
          { kind: 'cage-sum', cage: 'e', sum: 2 },
        ],
        uniqueSolution: false,
      },
      cages,
    );
    expect(issues(c)).toEqual([]);
    // A Latin square whose first cage holds 2 + 3.
    expect(puzzleUnmet(c, filled(c, [2, 3, 1, 3, 1, 2, 1, 2, 3]))).toEqual({
      kind: 'cage',
      cells: [
        [0, 0],
        [0, 1],
      ],
      constraint: 2,
    });
    // A rule is read only where its cells are filled.
    expect(puzzleUnmet(c, filled(c, [2]))).toBeNull();
  });

  it('a magic square and a number grid: the line whose sum is off, and a number used twice', () => {
    const m = magic();
    expect(puzzleUnmet(m, filled(m, [7, 9, 1, 3]))).toBeNull();
    expect(accepted(targetOf(m), filled(m, [7, 9, 1, 3]))).toBe(true);
    expect(puzzleUnmet(m, filled(m, [9, 7, 1, 3]))).toMatchObject({ kind: 'line', constraint: 0 });
    expect(accepted(targetOf(m), filled(m, [9, 7, 1, 3]))).toBe(false);
    const cards = grid('missing-digit', [[null, null]], {
      palette: [1, 2],
      constraints: [{ kind: 'use-each', values: [1, 2] }],
    });
    expect(issues(cards)).toEqual([]);
    expect(puzzleUnmet(cards, filled(cards, [1, 1]))).toEqual({
      kind: 'pieces',
      cells: [
        [0, 0],
        [0, 1],
      ],
      constraint: 0,
    });
    expect(accepted(targetOf(cards), filled(cards, [1, 1]))).toBe(false);
    expect(puzzleUnmet(cards, filled(cards, [2, 1]))).toBeNull();
    const g = numberGrid();
    expect(puzzleUnmet(g, filled(g, [2, 1]))).toBeNull();
    expect(puzzleUnmet(g, filled(g, [2, 2]))).toMatchObject({
      kind: 'line',
      cells: [
        [1, 0],
        [1, 1],
      ],
    });
    expect(solutions(m, 5)).toHaveLength(1);
    expect(solutions(g, 5)).toHaveLength(1);
  });

  it('a path, a triangle side, a turn-around and the shape pieces', () => {
    const p = path([[1, null, null]]);
    expect(puzzleUnmet(p, filled(p, [2, 4]))).toEqual({
      kind: 'step',
      cells: [
        [0, 1],
        [0, 2],
      ],
      constraint: 0,
    });
    const t = triangle();
    expect(puzzleUnmet(t, filled(t, [6, 5]))).toBeNull();
    expect(puzzleUnmet(t, filled(t, [6, 4]))).toMatchObject({ kind: 'line', constraint: 1 });
    const w = ways(2, 5);
    expect(puzzleUnmet(w, filled(w, [1, 4, 4, 1]))).toEqual({
      kind: 'ways',
      cells: [
        [1, 0],
        [1, 1],
      ],
    });
    expect(puzzleUnmet(w, filled(w, [1, 4, 2, 3]))).toBeNull();
    const s = shapes();
    expect(puzzleUnmet(s, filled(s, ['rectangle', 'rectangle', 'square']))).toBeNull();
    expect(puzzleUnmet(s, filled(s, ['square', 'square', 'square']))?.kind).toBe('pieces');
    expect(puzzleUnmet(s, filled(s, ['rectangle', 'rectangle', 'rectangle']))?.kind).toBe('pieces');
    // Two rectangle halves that do not touch are no rectangle.
    const corner = shapes({
      constraints: [{ kind: 'use-each', values: ['rectangle', 'square'] }],
    });
    expect(puzzleUnmet(corner, filled(corner, ['square', 'rectangle', 'rectangle']))).toEqual({
      kind: 'pairs',
      cells: [
        [0, 1],
        [1, 0],
      ],
    });
  });

  it('pairs rectangle cells as the checker does: all of them, or the ones left alone', () => {
    expect(
      rectanglePairs([
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 2],
      ]),
    ).toEqual({
      pairs: [
        [
          [0, 0],
          [0, 1],
        ],
        [
          [1, 1],
          [1, 2],
        ],
      ],
      alone: [],
    });
    expect(
      rectanglePairs([
        [0, 0],
        [1, 1],
      ]).alone,
    ).toHaveLength(2);
    // Three in a row: one pair and one left over.
    const three = rectanglePairs([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(three.pairs).toHaveLength(1);
    expect(three.alone).toHaveLength(1);
  });
});

describe('puzzle-grid: the shipped templates (500 seeds each)', () => {
  it('there are five, and each draws the variant named here', () => {
    const shipped = fixture.templates.filter((t) => t.format === 'puzzle-grid').map((t) => t.id);
    expect(shipped.sort()).toEqual(Object.keys(SHIPPED).sort());
  });

  for (const [id, variant] of Object.entries(SHIPPED)) {
    describe(id, () => {
      const template = fixtureTemplate(id);
      const items = Array.from({ length: SEEDS }, (_, k) => generateItem(template, k + 1));

      it('every item is inside the bounds, and its answer is the config’s own puzzle', () => {
        for (const item of items) {
          const c = configOf(item);
          expect(c.variant).toBe(variant);
          expect(issues(c), `seed ${item.seed}`).toEqual([]);
          expect(puzzleAnswerIssues(c, item.answer), `seed ${item.seed}`).toEqual([]);
        }
      });

      it('is solvable; one solution where it promises one; else every solution is accepted', () => {
        for (const item of items) {
          const c = configOf(item);
          const found = solutions(c, 40);
          expect(found.length, `seed ${item.seed}`).toBeGreaterThan(0);
          if (c.uniqueSolution) expect(found, `seed ${item.seed}`).toHaveLength(1);
          else expect(found.length, `seed ${item.seed}`).toBeGreaterThan(1);
          for (const fill of found) {
            expect(accepted(item.answer, fill), `seed ${item.seed}`).toBe(true);
          }
        }
      });

      it('the rule the widget marks and the checker agree on random fills from the tray', () => {
        let wrong = 0;
        for (const item of items) {
          const c = configOf(item);
          const next = lcg(item.seed);
          const right = solutions(c, 1)[0] as PuzzleValue[][];
          for (let k = 0; k < 8; k += 1) {
            // A solution with some blanks changed: near misses as well as wild fills.
            const fill = right.map((row) => [...row]);
            for (const { r, c: col } of puzzleBlanks(c)) {
              if (next() < 0.3) {
                (fill[r] as PuzzleValue[])[col] = c.palette[
                  Math.floor(next() * c.palette.length)
                ] as PuzzleValue;
              }
            }
            const unmet = puzzleUnmet(c, fill);
            if (unmet) wrong += 1;
            expect(accepted(item.answer, fill), `seed ${item.seed} ${JSON.stringify(fill)}`).toBe(
              unmet === null,
            );
          }
        }
        // The fills are not all right: the comparison has wrong fills to agree on.
        expect(wrong).toBeGreaterThan(SEEDS);
      });
    });
  }

  it('a target that is not the config’s puzzle is an answer issue', () => {
    for (const id of Object.keys(SHIPPED)) {
      const item = generateItem(fixtureTemplate(id), 1);
      const c = configOf(item);
      if (item.answer.kind !== 'state') throw new Error('a puzzle answers a state');
      const target = item.answer.target;
      const withTarget = (t: Record<string, unknown>): AnswerSpec => ({
        kind: 'state',
        checker: 'puzzle.satisfies',
        target: t,
      });
      expect(puzzleAnswerIssues(c, withTarget({ ...target, rows: c.rows + 1 }))).not.toEqual([]);
      expect(puzzleAnswerIssues(c, withTarget({ ...target, constraints: [] }))).not.toEqual([]);
      expect(
        puzzleAnswerIssues(
          c,
          withTarget({ ...target, cells: (target.cells as unknown[]).slice(1) }),
        ),
      ).not.toEqual([]);
      if (c.variant !== 'shape-fill') {
        expect(puzzleAnswerIssues(c, withTarget({ ...target, palette: [1] }))).not.toEqual([]);
      }
      if (c.cells.some((x) => x.given !== undefined)) {
        expect(puzzleAnswerIssues(c, withTarget({ ...target, givens: [] }))).not.toEqual([]);
      }
      expect(puzzleAnswerIssues(c, { kind: 'number', value: 1 })).not.toEqual([]);
    }
    // The form of the cells is the one the checker reads for the variant (review of PR #117).
    const k = kenken();
    expect(puzzleAnswerIssues(k, targetOf(k))).toEqual([]);
    const asPairs: AnswerSpec = {
      kind: 'state',
      checker: 'puzzle.satisfies',
      target: {
        ...(targetOf(k) as { target: Record<string, unknown> }).target,
        cells: k.cells.map((x) => [x.r, x.c]),
        givens: [[2, 2, 2]],
      },
    };
    expect(puzzleAnswerIssues(k, asPairs)).not.toEqual([]);
    expect(accepted(asPairs, filled(k, [1, 2, 3, 2, 3, 1, 3, 1]))).toBe(false);
    const s = shapes();
    const asObjects: AnswerSpec = {
      kind: 'state',
      checker: 'puzzle.satisfies',
      target: {
        variant: s.variant,
        rows: s.rows,
        cols: s.cols,
        cells: s.cells,
        constraints: s.constraints,
      },
    };
    expect(puzzleAnswerIssues(s, asObjects)).not.toEqual([]);
    expect(accepted(asObjects, filled(s, ['rectangle', 'rectangle', 'square']))).toBe(false);
    // A number path's cells are the path: the same cells in another order are another puzzle.
    const item = generateItem(fixtureTemplate('PUZ.01.t1'), 1);
    if (item.answer.kind !== 'state') throw new Error('a puzzle answers a state');
    const cells = [...(item.answer.target.cells as unknown[])].reverse();
    expect(
      puzzleAnswerIssues(configOf(item), {
        kind: 'state',
        checker: 'puzzle.satisfies',
        target: { ...item.answer.target, cells },
      }),
    ).not.toEqual([]);
  });
});
