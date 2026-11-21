// puzzle.grid (03 §5.6, K01) and the puzzle.satisfies number variants: every format branch, the
// solution replay where the format has a model, brute-force uniqueness for the uniqueSolution
// puzzles, all-ways alternatives, and the bond.parts `gap` extension (CPS.06).

import type { ItemFormat, ItemTemplate, ParamValues, Representation } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { puzzleSatisfies } from '../../check/state/puzzle.satisfies';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { gapWays } from '../bond/parts';
import {
  BLANKS,
  pathOrder,
  pieceCells,
  puzzleGrid,
  solvesBySides,
  TRIANGLE,
  triangleOrder,
} from './grid';

let nextId = 0;
function tpl(
  generator: string,
  format: ItemFormat,
  tier: ItemTemplate['tier'] = 'pictorial',
  representation?: Representation,
  params: ItemTemplate['params'] = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `PUZ.01.t${nextId}`,
    skillId: 'PUZ.01',
    format,
    tier,
    ...(representation ? { representation } : {}),
    generator,
    params,
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

function build(t: ItemTemplate, params: ParamValues) {
  const item = generateItemFromParams(t, params);
  const model = formatModel(t.format);
  if (model) {
    const parsed = model.configSchema.safeParse(item.widget);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    const replayed = replaySteps(item, itemSolution(item, t));
    expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);
  }
  const ex = itemExampleCorrect(item, t);
  expect(checkResponse(item, ex).correct).toBe(true);
  return { item, ex, features: itemFeatures(item, t) };
}

type Fill = (number | '')[][];
const fillOf = (ex: ReturnType<typeof build>['ex']): Fill =>
  ex.kind === 'state' ? (ex.value.fill as Fill) : [];

/** Every assignment of `values` to the blank cells that the checker accepts. */
function solutions(
  target: Record<string, unknown>,
  fill: Fill,
  blanks: [number, number][],
  values: number[],
) {
  let count = 0;
  const g = fill.map((row) => [...row]);
  const go = (i: number) => {
    if (i === blanks.length) {
      if (puzzleSatisfies.check(target, { fill: g })) count += 1;
      return;
    }
    const [r, c] = blanks[i] as [number, number];
    for (const v of values) {
      (g[r] as (number | '')[])[c] = v;
      go(i + 1);
    }
  };
  go(0);
  return count;
}

describe('number-path (puzzle-grid)', () => {
  const t = tpl('puzzle.grid', 'puzzle-grid', 'pictorial', 'number-path', {
    variant: { kind: 'const', value: 'number-path' },
    rows: { kind: 'int', min: 2, max: 3 },
    cols: { kind: 'int', min: 3, max: 4 },
    start: { kind: 'int', min: 1, max: 80 },
    blanks: { kind: 'int', min: 3, max: 5 },
  });

  it('counts up by one along the path and has exactly one solution', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const item = generateItem(t, seed);
      const ex = itemExampleCorrect(item, t);
      expect(checkResponse(item, ex).correct).toBe(true);
      if (item.widget.format !== 'puzzle-grid' || item.answer.kind !== 'state') throw new Error();
      const path = item.answer.target.cells as [number, number][];
      const fill = fillOf(ex);
      for (let i = 1; i < path.length; i += 1) {
        const [r0, c0] = path[i - 1] as [number, number];
        const [r1, c1] = path[i] as [number, number];
        expect(Math.abs(r1 - r0) + Math.abs(c1 - c0)).toBe(1); // neighbours
        expect((fill[r1]?.[c1] as number) - (fill[r0]?.[c0] as number)).toBe(1);
      }
      // The path's numbers are fixed by any one cell, so trying every start finds every solution.
      let found = 0;
      for (let v = 0; v <= 100; v += 1) {
        const g: Fill = fill.map((row) => row.map(() => ''));
        path.forEach(([r, c], i) => {
          (g[r] as (number | '')[])[c] = v + i;
        });
        if (puzzleSatisfies.check(item.answer.target, { fill: g })) found += 1;
      }
      expect(found).toBe(1);
      expect(item.widget.cells.filter((c) => c.blank)).toHaveLength(item.params.blanks as number);
    }
  });

  it('fills each blank next to a known cell: on after a given, back before the first one', () => {
    expect(pathOrder([true, false, true, true])).toEqual([2, 3, 0]);
    expect(pathOrder([true, true, false])).toEqual([1, 0]);
    expect(() => pathOrder([true, true])).toThrow();
  });

  it('rejects a wrong number and a given changed', () => {
    const { item, ex } = build(t, {
      variant: 'number-path',
      rows: 2,
      cols: 3,
      start: 18,
      blanks: 3,
    });
    const fill = fillOf(ex);
    if (item.answer.kind !== 'state') throw new Error();
    const cells = item.answer.target.cells as [number, number][];
    const [r, c] = cells[0] as [number, number];
    const bad = fill.map((row) => [...row]);
    (bad[r] as (number | '')[])[c] = 17;
    expect(puzzleSatisfies.check(item.answer.target, { fill: bad })).toBe(false);
    expect(itemFeatures(item, t).crossDecade).toBe(1);
  });
});

describe('number-path (hundred-chart piece)', () => {
  it('cuts a piece out of the chart; the child fills it in reading order', () => {
    const t = tpl('puzzle.grid', 'hundred-chart', 'pictorial', 'hundred-chart');
    const { item, features } = build(t, { variant: 'number-path', piece: 'plus', at: 23 });
    expect(item.widget).toMatchObject({ mode: 'fill', hidden: [24, 33, 34, 35, 44] });
    expect(item.answer).toEqual({ kind: 'numbers', values: [24, 33, 34, 35, 44], ordered: true });
    expect(features).toMatchObject({ hidden: 5, 'rows.over1': 1 });
    expect(pieceCells('bar', 29)).toBeNull(); // would wrap past the row end
    expect(pieceCells('column', 85)).toBeNull(); // would run past 99
  });
});

describe('sum-triangle', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  it.each(Object.keys(BLANKS))('%s solves one side at a time, with one solution', (blankSet) => {
    expect(solvesBySides(BLANKS[blankSet] ?? [])).toBe(true);
    const t = tpl('puzzle.grid', 'puzzle-grid', 'pictorial', 'number-bond');
    const { item, ex } = build(t, { variant: 'sum-triangle', a: 2, b: 3, c: 4, sum: 10, blankSet });
    if (item.widget.format !== 'puzzle-grid' || item.answer.kind !== 'state') throw new Error();
    const blanks = item.widget.cells
      .filter((c) => c.blank)
      .map((c) => [c.r, c.c] as [number, number]);
    const fill = fillOf(ex).map((row) => [...row]);
    for (const [r, c] of blanks) (fill[r] as (number | '')[])[c] = 0;
    expect(solutions(item.answer.target, fill, blanks, values)).toBe(1);
  });

  it.each(Object.keys(BLANKS))('%s: the solution names each side before its fill', (blankSet) => {
    const t = tpl('puzzle.grid', 'puzzle-grid', 'pictorial', 'number-bond');
    const { item } = build(t, { variant: 'sum-triangle', a: 2, b: 3, c: 4, sum: 10, blankSet });
    const order = triangleOrder(BLANKS[blankSet] ?? []);
    const steps = itemSolution(item, t);
    expect(steps.map((s) => s.action?.op)).toEqual(order.flatMap(() => ['check-line', 'fill']));
    order.forEach(({ side, spot }, k) => {
      expect(steps[2 * k]?.action?.args).toEqual({ index: side });
      const [r, c] = TRIANGLE[spot];
      expect(steps[2 * k + 1]?.action?.args).toMatchObject({ r, c });
    });
  });

  it('rejects draws whose middles leave 1–9, and a set two sides cannot solve', () => {
    const t = tpl('puzzle.grid', 'puzzle-grid');
    expect(
      puzzleGrid.accepts?.(
        { variant: 'sum-triangle', a: 6, b: 6, c: 1, sum: 12, blankSet: 'middles' },
        t,
      ),
    ).toBe(false);
    expect(solvesBySides(['T', 'BL', 'BR'])).toBe(false);
  });

  it('one side as a number bond: the corners are one part', () => {
    const t = tpl('puzzle.grid', 'number-bond', 'pictorial', 'number-bond');
    const { item } = build(t, { variant: 'sum-triangle', a: 2, b: 3, c: 4, sum: 10 });
    expect(item.widget).toMatchObject({ whole: 10, parts: [5, null], mode: 'missing-part' });
    expect(item.answer).toEqual({ kind: 'number', value: 5 });
  });
});

describe('all-ways', () => {
  it('a row for every way; any order and turn-arounds are fine, a repeat is not', () => {
    const t = tpl('puzzle.grid', 'puzzle-grid', 'pictorial', 'number-bond');
    const { item, ex, features } = build(t, { variant: 'all-ways', whole: 6 });
    if (item.answer.kind !== 'state') throw new Error();
    const target = item.answer.target;
    expect(fillOf(ex)).toEqual([
      [1, 5],
      [2, 4],
      [3, 3],
    ]);
    expect(features).toMatchObject({ blanks: 6, multipleSolutions: 1 });
    const ok = {
      fill: [
        [3, 3],
        [4, 2],
        [5, 1],
      ],
    };
    expect(puzzleSatisfies.check(target, ok)).toBe(true);
    expect(puzzleSatisfies.exempt?.(target, ex.kind === 'state' ? ex.value : {}, ok)).toBe(true);
    expect(
      puzzleSatisfies.check(target, {
        fill: [
          [1, 5],
          [5, 1],
          [3, 3],
        ],
      }),
    ).toBe(false);
    expect(
      puzzleSatisfies.check(target, {
        fill: [
          [0, 6],
          [2, 4],
          [3, 3],
        ],
      }),
    ).toBe(false);
    expect(
      puzzleSatisfies.check(target, {
        fill: [
          [1, 5],
          [2, 4],
          [3, 4],
        ],
      }),
    ).toBe(false);
  });

  it('order: every way as two groups, ordered by the first group', () => {
    const t = tpl('puzzle.grid', 'order', 'pictorial', 'objects');
    const { item, features } = build(t, { variant: 'all-ways', whole: 5 });
    if (item.widget.format !== 'order') throw new Error();
    expect(item.widget.items).toHaveLength(4);
    expect(item.answer).toEqual({ kind: 'numbers', values: [1, 2, 3, 4], ordered: true });
    expect(features.items).toBe(1);
  });
});

describe('bond.parts gap (CPS.06)', () => {
  it('shows every way but one, in order; only the missing way is accepted', () => {
    expect(gapWays(10, 3)).toEqual([
      [1, 9],
      [2, 8],
      [4, 6],
      [5, 5],
    ]);
    const t = tpl('bond.parts', 'number-bond', 'concrete');
    const item = generateItemFromParams(t, { whole: 10, unknown: 'new-way', gap: 3 });
    expect(item.widget).toMatchObject({ mode: 'new-way', found: gapWays(10, 3) });
    const ex = itemExampleCorrect(item, t);
    expect(ex).toEqual({ kind: 'state', value: { parts: [3, 7] } });
    const replayed = replaySteps(item, itemSolution(item, t));
    expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);
    expect(checkResponse(item, { kind: 'state', value: { parts: [7, 3] } }).correct).toBe(true);
    expect(checkResponse(item, { kind: 'state', value: { parts: [4, 6] } }).correct).toBe(false);
  });

  it('rejects a gap past the middle or with found ways', () => {
    const t = tpl('bond.parts', 'number-bond', 'concrete');
    expect(() => generateItemFromParams(t, { whole: 6, unknown: 'new-way', gap: 4 })).toThrow();
    expect(() =>
      generateItemFromParams(t, { whole: 6, unknown: 'new-way', gap: 1, found: 1 }),
    ).toThrow();
  });
});
