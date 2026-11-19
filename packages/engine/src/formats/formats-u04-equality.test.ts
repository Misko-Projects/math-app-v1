// 03 §6.3 state models, 03 §5.5 configs and answers, and 03 §5.7 checkers for the U04 equality
// and puzzle formats (#13): balance (+ balance.equal) and puzzle-grid (+ the numeric variants of
// puzzle.satisfies: mini-KenKen 3 × 3 and 4 × 4, magic square, missing-number grid).

import {
  FORMAT_SUPPORT,
  type ItemFormat,
  type WidgetAction,
  type WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { balance, balanceBlanks, heavier, sideValue } from './balance';
import { formatModel } from './index';
import { puzzleBlanks, puzzleGrid } from './puzzle-grid';
import { type FormatModel, type FormatState, UnsupportedOpError } from './types';

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

function play<F extends ItemFormat, S extends FormatState<F>>(
  m: FormatModel<F, S>,
  c: WidgetConfigOf<F>,
  ops: WidgetAction[],
): S {
  return ops.reduce((s, a) => m.apply(s, a), m.initialState(c));
}

// biome-ignore lint/suspicious/noExplicitAny: shared helper over both models.
const issuePaths = (m: FormatModel<any, any>, c: unknown) => {
  const r = m.configSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

const satisfies = (target: Record<string, unknown>, r: unknown) => {
  const res = r as { kind: string; value: Record<string, unknown> } | null;
  return (
    res?.kind === 'state' && stateChecker('puzzle.satisfies')?.check(target, res.value) === true
  );
};

// ---------- balance ----------

const judge: WidgetConfigOf<'balance'> = {
  format: 'balance',
  left: { terms: [{ n: 3 }, { op: '+' }, { n: 4 }] },
  right: { terms: [{ n: 7 }] },
  mode: 'judge',
  showTilt: true,
};

describe('balance', () => {
  it('is registered; the easiest config parses with every feature 0', () => {
    expect(formatModel('balance')).toBe(balance);
    const easy: WidgetConfigOf<'balance'> = {
      ...judge,
      left: { terms: [{ n: 0 }] },
      right: { terms: [{ n: 0 }] },
    };
    expect(issuePaths(balance, easy)).toEqual([]);
    expect(Object.values(balance.featureValues(easy, { kind: 'choice', id: 'true' }))).toEqual(
      new Array(7).fill(0),
    );
  });

  it('supports every listed op plus answer and throws on others', () => {
    const s = balance.initialState(judge);
    for (const op of [...FORMAT_SUPPORT.balance.ops, 'answer']) {
      expect(() => balance.apply(s, act(op))).not.toThrow();
    }
    expect(() => balance.apply(s, act('teleport'))).toThrow(UnsupportedOpError);
  });

  it('evaluates sides with × before + and −, objects by hidden weight', () => {
    expect(sideValue([{ n: 2 }, { op: '+' }, { n: 3 }, { op: '×' }, { n: 4 }])).toBe(14);
    expect(sideValue([{ n: 10 }, { op: '-' }, { n: 3 }, { op: '-' }, { n: 2 }])).toBe(5);
    expect(sideValue([{ object: 'shell', count: 3 }], { shell: 2 })).toBe(6);
    expect(sideValue([{ object: 'shell', count: 3 }])).toBeUndefined();
    expect(sideValue([{ n: 1 }, { n: 2 }])).toBeUndefined();
    expect(sideValue([{ blank: 'b' }, { op: '+' }, { n: 1 }], {}, { b: 4 })).toBe(5);
  });

  it('judge answers true/false as a choice', () => {
    expect(balance.toResponse(play(balance, judge, [act('tilt')]))).toBeNull();
    expect(balance.toResponse(play(balance, judge, [act('answer', { id: 'true' })]))).toEqual({
      kind: 'choice',
      id: 'true',
    });
  });

  it('which-heavier (MEA.16, as K01 builds it): pans hold the objects; placing them again is a no-op', () => {
    const c: WidgetConfigOf<'balance'> = {
      format: 'balance',
      left: { terms: [{ object: 'feather', count: 2 }] },
      right: { terms: [{ object: 'rock', count: 1 }] },
      mode: 'which-heavier',
      objectWeights: { feather: 1, rock: 8 },
      showTilt: true,
    };
    expect(issuePaths(balance, c)).toEqual([]);
    const s0 = balance.initialState(c);
    expect([s0.left, s0.right]).toEqual([c.left.terms, c.right.terms]);
    const s = play(balance, c, [
      act('place', { side: 'left', term: c.left.terms[0] }),
      act('place', { side: 'right', term: c.right.terms[0] }),
      act('tilt'),
      act('answer', { id: 'right' }),
    ]);
    expect(s.left).toEqual(c.left.terms);
    expect(s.shown).toBe('tilt');
    expect(balance.toResponse(s)).toEqual({ kind: 'choice', id: 'right' });
    expect(balance.featureValues(c, { kind: 'choice', id: 'right' })['objects.kinds']).toBe(1);
  });

  it('fill-blank answers the blanks left side first', () => {
    const c: WidgetConfigOf<'balance'> = {
      ...judge,
      mode: 'fill-blank',
      left: { terms: [{ n: 8 }, { op: '+' }, { n: 5 }] },
      right: { terms: [{ blank: 'x' }, { op: '+' }, { n: 6 }] },
    };
    expect(issuePaths(balance, c)).toEqual([]);
    expect(balanceBlanks(c)).toEqual(['x']);
    expect(balance.toResponse(play(balance, c, [act('answer', { value: 7 })]))).toEqual({
      kind: 'number',
      value: 7,
    });
    expect(balance.featureValues(c, { kind: 'number', value: 7 }).opsBothSides).toBe(1);
  });

  it('make-equal (K01 convention): responds the units added to each pan', () => {
    // 4 + 5 = 9 + _ on the pans (equality.eq leaves the blank off the right pan).
    const c: WidgetConfigOf<'balance'> = {
      ...judge,
      mode: 'make-equal',
      left: { terms: [{ n: 4 }, { op: '+' }, { n: 5 }] },
      right: { terms: [{ n: 6 }] },
    };
    expect(issuePaths(balance, c)).toEqual([]);
    const check = stateChecker('balance.equal');
    const target = { left: 9, right: 6 };
    const three = balance.toResponse(
      play(balance, c, [act('place', { side: 'right', term: { n: 1 }, count: 3 })]),
    );
    expect(three).toEqual({ kind: 'state', value: { left: 0, right: 3 } });
    // The pans still evaluate and now balance.
    const s3 = play(balance, c, [act('place', { side: 'right', term: { n: 1 }, count: 3 })]);
    expect(heavier(sideValue(s3.left), sideValue(s3.right))).toBe('same');
    // A huge count is clamped, never thrown.
    expect(() =>
      play(balance, c, [act('place', { side: 'right', term: { n: 1 }, count: 4294967296 })]),
    ).not.toThrow();
    expect(three?.kind === 'state' && check?.check(target, three.value)).toBe(true);
    // Alternative: one more on each pan also levels it.
    const both = balance.toResponse(
      play(balance, c, [
        act('place', { side: 'right', term: { n: 1 }, count: 4 }),
        act('place', { side: 'left', term: { n: 1 } }),
      ]),
    );
    expect(both?.kind === 'state' && check?.check(target, both.value)).toBe(true);
    const short = balance.toResponse(play(balance, c, []));
    expect(short).toEqual({ kind: 'state', value: { left: 0, right: 0 } });
    expect(short?.kind === 'state' && check?.check(target, short.value)).toBe(false);
  });

  it('make-equal with objects (compare.sets ALG.05): one unit per object', () => {
    const c: WidgetConfigOf<'balance'> = {
      format: 'balance',
      left: { terms: [{ object: 'shell', count: 5 }] },
      right: { terms: [{ object: 'shell', count: 2 }] },
      mode: 'make-equal',
      objectWeights: { shell: 1 },
      showTilt: true,
    };
    const s = play(balance, c, [
      act('place', { side: 'right', term: { object: 'shell', count: 1 }, count: 3 }),
    ]);
    // The added objects go on as one more term: 2 + 3 shells, still a value.
    expect(s.right).toEqual([
      { object: 'shell', count: 2 },
      { op: '+' },
      { object: 'shell', count: 3 },
    ]);
    expect(sideValue(s.right, { shell: 1 })).toBe(5);
    expect(balance.toResponse(s)).toEqual({ kind: 'state', value: { left: 0, right: 3 } });
  });

  it('fill-blank: a number placed on the blank pan fills the blank', () => {
    const c: WidgetConfigOf<'balance'> = {
      ...judge,
      mode: 'fill-blank',
      left: { terms: [{ n: 3 }, { op: '+' }, { n: 4 }] },
      right: { terms: [{ blank: 'x' }] },
    };
    expect(
      balance.toResponse(play(balance, c, [act('place', { side: 'right', term: { n: 7 } })])),
    ).toEqual({ kind: 'number', value: 7 });
    // A pan without a blank takes nothing.
    expect(
      balance.toResponse(play(balance, c, [act('place', { side: 'left', term: { n: 7 } })])),
    ).toBeNull();
  });

  it('rejects configs that contradict their mode', () => {
    expect(issuePaths(balance, { ...judge, mode: 'fill-blank' })).toEqual(['left']);
    expect(
      issuePaths(balance, { ...judge, left: { terms: [{ object: 'shell', count: 2 }] } }),
    ).toEqual(['objectWeights']);
    expect(issuePaths(balance, { ...judge, left: { terms: [{ n: 1 }, { n: 2 }] } })).toEqual([
      'left',
    ]);
  });
});

// ---------- puzzle-grid ----------

/** A rows × cols puzzle with every cell listed: `given` where the grid has a value, else blank. */
function grid(
  variant: WidgetConfigOf<'puzzle-grid'>['variant'],
  values: (number | null)[][],
  extra: Partial<WidgetConfigOf<'puzzle-grid'>> = {},
  cages?: string[][],
): WidgetConfigOf<'puzzle-grid'> {
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

const target = (c: WidgetConfigOf<'puzzle-grid'>) => ({
  variant: c.variant,
  rows: c.rows,
  cols: c.cols,
  cells: c.cells,
  constraints: c.constraints,
  palette: c.palette,
});

/** Fill every blank from a full solution grid. */
const solve = (c: WidgetConfigOf<'puzzle-grid'>, sol: number[][]) =>
  puzzleBlanks(c).map(({ r, c: col }) => act('fill', { r, c: col, value: sol[r]?.[col] }));

describe('puzzle-grid', () => {
  it('is registered and supports every listed op plus answer', () => {
    expect(formatModel('puzzle-grid')).toBe(puzzleGrid);
    const c = grid('missing-digit', [[1, null]], {
      constraints: [
        {
          kind: 'line-sum',
          cells: [
            [0, 0],
            [0, 1],
          ],
          sum: 3,
        },
      ],
    });
    const s = puzzleGrid.initialState(c);
    for (const op of [...FORMAT_SUPPORT['puzzle-grid'].ops, 'answer']) {
      expect(() => puzzleGrid.apply(s, act(op))).not.toThrow();
    }
    expect(() => puzzleGrid.apply(s, act('teleport'))).toThrow(UnsupportedOpError);
  });

  it('mini-KenKen 3 × 3: cages, rows and columns unique; any valid solution', () => {
    // Cages: a = (0,0)+(1,0) sum 3, b = (0,1)+(0,2) sum 5, c = (1,1)+(1,2)+(2,2) sum 6,
    // d = (2,0)+(2,1) sum 4. Two Latin squares satisfy them; both are correct.
    const cages = [
      ['a', 'b', 'b'],
      ['a', 'c', 'c'],
      ['d', 'd', 'c'],
    ];
    const c = grid(
      'cage-sum',
      [
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ],
      {
        constraints: [
          { kind: 'row-unique' },
          { kind: 'col-unique' },
          { kind: 'cage-sum', cage: 'a', sum: 3 },
          { kind: 'cage-sum', cage: 'b', sum: 5 },
          { kind: 'cage-sum', cage: 'c', sum: 6 },
          { kind: 'cage-sum', cage: 'd', sum: 4 },
        ],
        palette: [1, 2, 3],
        uniqueSolution: false,
      },
      cages,
    );
    expect(issuePaths(puzzleGrid, c)).toEqual([]);
    const sol = [
      [1, 2, 3],
      [2, 3, 1],
      [3, 1, 2],
    ];
    expect(puzzleGrid.toResponse(play(puzzleGrid, c, solve(c, sol).slice(1)))).toBeNull();
    expect(satisfies(target(c), puzzleGrid.toResponse(play(puzzleGrid, c, solve(c, sol))))).toBe(
      true,
    );
    const alt = [
      [2, 3, 1],
      [1, 2, 3],
      [3, 1, 2],
    ];
    expect(satisfies(target(c), puzzleGrid.toResponse(play(puzzleGrid, c, solve(c, alt))))).toBe(
      false,
    ); // cage b is 4 here: 3 + 1
    // Digits outside the palette keep the cage sums and distinctness but are not allowed.
    const outside = {
      kind: 'state',
      value: {
        fill: [
          [1, 0, 5],
          [2, 3, 1],
          [3, 1, 2],
        ],
      },
    };
    expect(satisfies(target(c), outside)).toBe(false);
    expect(
      puzzleGrid.apply(puzzleGrid.initialState(c), act('fill', { r: 0, c: 0, value: 7 }))
        .fill[0]?.[0],
    ).toBe('');
    const bad = sol.map((row) => [...row]);
    (bad[0] as number[])[0] = 2; // breaks cage a and column 0
    expect(satisfies(target(c), puzzleGrid.toResponse(play(puzzleGrid, c, solve(c, bad))))).toBe(
      false,
    );
  });

  it('mini-KenKen 4 × 4 with a given cell', () => {
    const sol = [
      [1, 2, 3, 4],
      [3, 4, 1, 2],
      [2, 1, 4, 3],
      [4, 3, 2, 1],
    ];
    const cages = [
      ['a', 'a', 'b', 'b'],
      ['c', 'c', 'd', 'd'],
      ['e', 'e', 'f', 'f'],
      ['g', 'g', 'h', 'h'],
    ];
    const values = sol.map((row, r) => row.map((v, c) => (r === 0 && c === 0 ? v : null)));
    const sums = new Map<string, number>();
    for (const [r, row] of cages.entries()) {
      for (const [c, id] of row.entries())
        sums.set(id, (sums.get(id) ?? 0) + (sol[r]?.[c] as number));
    }
    const c = grid(
      'cage-sum',
      values,
      {
        constraints: [
          { kind: 'row-unique' },
          { kind: 'col-unique' },
          ...[...sums].map(([cage, sum]) => ({ kind: 'cage-sum' as const, cage, sum })),
        ],
      },
      cages,
    );
    expect(issuePaths(puzzleGrid, c)).toEqual([]);
    expect(
      puzzleGrid.featureValues(c, { kind: 'state', checker: 'puzzle.satisfies', target: {} })[
        'size.4x4'
      ],
    ).toBe(1);
    expect(satisfies(target(c), puzzleGrid.toResponse(play(puzzleGrid, c, solve(c, sol))))).toBe(
      true,
    );
    // Alternative: swap rows 2 and 3 of columns... another Latin square with the same cage sums.
    const alt = [
      [1, 2, 4, 3],
      [3, 4, 2, 1],
      [2, 1, 3, 4],
      [4, 3, 1, 2],
    ];
    expect(satisfies(target(c), puzzleGrid.toResponse(play(puzzleGrid, c, solve(c, alt))))).toBe(
      true,
    );
    // Row 3 as [4, 3, 1, 2] keeps every cage sum and every row distinct, but columns 2 and 3 repeat.
    const colRepeat = sol.map((row) => [...row]);
    colRepeat[3] = [4, 3, 1, 2];
    expect(
      satisfies(target(c), puzzleGrid.toResponse(play(puzzleGrid, c, solve(c, colRepeat)))),
    ).toBe(false);
    // A given cell can't be changed.
    expect(
      puzzleGrid.apply(puzzleGrid.initialState(c), act('fill', { r: 0, c: 0, value: 4 }))
        .fill[0]?.[0],
    ).toBe(1);
  });

  it('magic square: rows, columns and diagonals add to 15 using 1–9 once', () => {
    const lines: [number, number][][] = [
      ...[0, 1, 2].map((r) => [0, 1, 2].map((c): [number, number] => [r, c])),
      ...[0, 1, 2].map((c) => [0, 1, 2].map((r): [number, number] => [r, c])),
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      [
        [0, 2],
        [1, 1],
        [2, 0],
      ],
    ];
    const sol = [
      [2, 7, 6],
      [9, 5, 1],
      [4, 3, 8],
    ];
    const c = grid(
      'magic-square',
      [
        [2, null, null],
        [null, 5, null],
        [null, null, 8],
      ],
      {
        constraints: [
          ...lines.map((cells) => ({ kind: 'line-sum' as const, cells, sum: 15 })),
          { kind: 'use-each', values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
        ],
        palette: [1, 2, 3, 4, 6, 7, 9],
      },
    );
    expect(issuePaths(puzzleGrid, c)).toEqual([]);
    expect(satisfies(target(c), puzzleGrid.toResponse(play(puzzleGrid, c, solve(c, sol))))).toBe(
      true,
    );
    // The mirror image (also magic, same givens on the diagonal) is accepted too.
    const mirror = [
      [2, 9, 4],
      [7, 5, 3],
      [6, 1, 8],
    ];
    expect(satisfies(target(c), puzzleGrid.toResponse(play(puzzleGrid, c, solve(c, mirror))))).toBe(
      true,
    );
    const swapped = sol.map((row) => [...row]);
    (swapped[0] as number[])[1] = 6;
    (swapped[0] as number[])[2] = 7;
    expect(
      satisfies(target(c), puzzleGrid.toResponse(play(puzzleGrid, c, solve(c, swapped)))),
    ).toBe(false);
  });

  it('missing-number grid: row and column sums, answered in reading order', () => {
    // 2 × 2 with row sums 5, 7 and column sums 4, 8.
    const c = grid(
      'missing-digit',
      [
        [1, null],
        [null, 4],
      ],
      {
        constraints: [
          {
            kind: 'line-sum',
            cells: [
              [0, 0],
              [0, 1],
            ],
            sum: 5,
          },
          {
            kind: 'line-sum',
            cells: [
              [1, 0],
              [1, 1],
            ],
            sum: 7,
          },
          {
            kind: 'line-sum',
            cells: [
              [0, 0],
              [1, 0],
            ],
            sum: 4,
          },
          {
            kind: 'line-sum',
            cells: [
              [0, 1],
              [1, 1],
            ],
            sum: 8,
          },
        ],
      },
    );
    const r = puzzleGrid.toResponse(play(puzzleGrid, c, [act('answer', { values: [4, 3] })]));
    expect(r).toEqual({
      kind: 'state',
      value: {
        fill: [
          [1, 4],
          [3, 4],
        ],
      },
    });
    expect(satisfies(target(c), r)).toBe(true);
    expect(
      satisfies(
        target(c),
        puzzleGrid.toResponse(play(puzzleGrid, c, [act('answer', { values: [4, 4] })])),
      ),
    ).toBe(false);
  });

  it('use-each over the blanks (digit cards)', () => {
    const c = grid('digit-cards', [[null, null]], {
      constraints: [{ kind: 'use-each', values: [3, 5] }],
      palette: [3, 5],
    });
    expect(
      satisfies(
        target(c),
        puzzleGrid.toResponse(play(puzzleGrid, c, [act('answer', { values: [5, 3] })])),
      ),
    ).toBe(true);
    expect(
      satisfies(
        target(c),
        puzzleGrid.toResponse(play(puzzleGrid, c, [act('answer', { values: [5, 5] })])),
      ),
    ).toBe(false);
  });

  it('shape-fill (K01) replays through the model: fill strings, empty outside', () => {
    const c: WidgetConfigOf<'puzzle-grid'> = {
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
      uniqueSolution: true,
    };
    expect(issuePaths(puzzleGrid, c)).toEqual([]);
    const r = puzzleGrid.toResponse(
      play(puzzleGrid, c, [
        act('fill', { r: 0, c: 0, value: 'rectangle' }),
        act('fill', { r: 0, c: 1, value: 'rectangle' }),
        act('fill', { r: 1, c: 0, value: 'square' }),
      ]),
    );
    expect(r).toEqual({
      kind: 'state',
      value: {
        fill: [
          ['rectangle', 'rectangle'],
          ['square', ''],
        ],
      },
    });
    expect(
      satisfies(
        {
          variant: 'shape-fill',
          rows: 2,
          cols: 2,
          cells: [
            [0, 0],
            [0, 1],
            [1, 0],
          ],
          constraints: c.constraints,
        },
        r,
      ),
    ).toBe(true);
  });

  it('rejects unsupported constraints, bad cells and cages that do not exist', () => {
    const base = grid('missing-digit', [[1, null]]);
    expect(
      issuePaths(puzzleGrid, { ...base, constraints: [{ kind: 'adjacent-step', step: 1 }] }),
    ).toEqual(['constraints.0']);
    expect(
      issuePaths(puzzleGrid, { ...base, constraints: [{ kind: 'cage-sum', cage: 'z', sum: 1 }] }),
    ).toEqual(['constraints.0']);
    expect(
      issuePaths(puzzleGrid, { ...base, cells: [...base.cells, { r: 3, c: 0, blank: true }] }),
    ).toEqual(['cells.2']);
    expect(issuePaths(puzzleGrid, { ...base, cells: [{ r: 0, c: 0, given: 1 }] })).toEqual([
      'cells',
    ]);
    // The checker refuses constraint kinds it can't evaluate.
    expect(
      satisfies(
        { ...target(base), constraints: [{ kind: 'clue', say: 'x', test: 'n > 1' }] },
        {
          kind: 'state',
          value: { fill: [[1, 2]] },
        },
      ),
    ).toBe(false);
  });
});
