// The supported domain of array-build and area-tiles (U04 #13): one test per bound, the one
// source of each answer (FormatModel.answerIssues), and the undo of every op a child can do.

import type { AnswerSpec, WidgetAction, WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import {
  AREA_SIDE_MAX,
  AREA_WORK_H_MAX,
  AREA_WORK_W_MAX,
  areaAnswerIssues,
  areaAnswerMax,
  areaTiles,
  areaWorked,
  fillsBox,
  maskArea,
} from './area-tiles';
import {
  ARRAY_FOUND_MAX,
  ARRAY_SIDE_MAX,
  arrayAnswerIssues,
  arrayAnswerMax,
  arrayBuild,
} from './array-build';
import type { FormatModel } from './types';

type ArrayConfig = WidgetConfigOf<'array-build'>;
type AreaConfig = WidgetConfigOf<'area-tiles'>;

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

// biome-ignore lint/suspicious/noExplicitAny: the helper serves models of different formats.
const issues = (m: FormatModel<any, any>, c: unknown): string[] => {
  const r = m.configSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

const array: ArrayConfig = {
  format: 'array-build',
  maxRows: 5,
  maxCols: 5,
  mode: 'build-dims',
  rows: 3,
  cols: 4,
  orientationMatters: false,
  sprite: 'shell',
  gridShown: true,
};
const full = (w: number, h: number) => '1'.repeat(w * h);
const area: AreaConfig = {
  format: 'area-tiles',
  region: { w: 4, h: 3, mask: full(4, 3) },
  mode: 'tile',
  gridShown: true,
  sideLabels: false,
  unit: 'sq-units',
  decimalGrid: false,
};
/** An L: a 3 × 3 box without the last two squares of its top row (7 squares). */
const L = { w: 3, h: 3, mask: '100111111' };

describe('array-build: the supported domain', () => {
  it('accepts the largest board', () => {
    const c = { ...array, maxRows: ARRAY_SIDE_MAX, maxCols: ARRAY_SIDE_MAX, rows: 10, cols: 10 };
    expect(issues(arrayBuild, c)).toEqual([]);
  });

  it('refuses more rows than the board draws', () => {
    expect(issues(arrayBuild, { ...array, maxRows: ARRAY_SIDE_MAX + 1 })).toEqual([
      'maxRows: the board has at most 10 rows and columns (maxRows is 11)',
    ]);
  });

  it('refuses more columns than the board draws', () => {
    expect(issues(arrayBuild, { ...array, maxCols: ARRAY_SIDE_MAX + 1 })).toEqual([
      'maxCols: the board has at most 10 rows and columns (maxCols is 11)',
    ]);
  });

  it('refuses rows or columns that do not fit the board', () => {
    expect(issues(arrayBuild, { ...array, orientationMatters: true, rows: 6 })).toEqual([
      'rows: rows and cols must be set and fit within maxRows × maxCols',
    ]);
    expect(issues(arrayBuild, { ...array, mode: 'read', cols: 0 })).toHaveLength(1);
  });

  it('refuses a total no rectangle on the board has', () => {
    const c = { ...array, mode: 'build-total', total: 26 };
    expect(issues(arrayBuild, c)).toEqual(['total: no rectangle of that total fits the grid']);
    expect(issues(arrayBuild, { ...c, total: 25 })).toEqual([]);
  });

  const newWay = { ...array, maxRows: 10, maxCols: 10, mode: 'new-way', total: 24 } as const;

  it('lists at most two found rectangles', () => {
    expect(ARRAY_FOUND_MAX).toBe(2);
    expect(issues(arrayBuild, { ...newWay, found: [[3, 8]] })).toEqual([]);
    expect(
      issues(arrayBuild, {
        ...newWay,
        total: 36,
        maxRows: 10,
        found: [
          [4, 9],
          [6, 6],
          [9, 4],
        ],
      })[0],
    ).toBe('found: at most 2 found rectangles are listed (3 given)');
  });

  it('refuses a found rectangle of another total, or one off the board', () => {
    const msg = 'found: every found rectangle has 24 in all and fits the board';
    expect(issues(arrayBuild, { ...newWay, found: [[3, 7]] })).toEqual([msg]);
    expect(issues(arrayBuild, { ...newWay, found: [[2, 12]] })).toEqual([msg]);
  });

  it('refuses the same found rectangle twice, turned or not', () => {
    expect(
      issues(arrayBuild, {
        ...newWay,
        found: [
          [3, 8],
          [8, 3],
        ],
      }),
    ).toEqual(['found: a found rectangle is listed once (3 × 4 and 4 × 3 are the same)']);
  });

  it('refuses a new-way with nothing new left', () => {
    expect(
      issues(arrayBuild, {
        ...newWay,
        found: [
          [3, 8],
          [4, 6],
        ],
      }),
    ).toEqual(['found: no new rectangle is left']);
  });

  it('offers answers from the board, never from the answer', () => {
    expect(arrayAnswerMax({ maxRows: 4, maxCols: 5 })).toBe(20);
    expect(arrayAnswerMax({ maxRows: 5, maxCols: 5 })).toBe(100);
    // Every product on every board can be entered.
    for (let r = 1; r <= ARRAY_SIDE_MAX; r += 1) {
      for (let k = 1; k <= ARRAY_SIDE_MAX; k += 1) {
        expect(arrayAnswerMax({ maxRows: r, maxCols: k })).toBeGreaterThanOrEqual(r * k);
      }
    }
  });
});

describe('array-build: one source for the answer', () => {
  const dims = (target: Record<string, unknown>): AnswerSpec => ({
    kind: 'state',
    checker: 'array.dims',
    target,
  });
  const areaOf = (target: Record<string, unknown>): AnswerSpec => ({
    kind: 'state',
    checker: 'array.area',
    target,
  });

  it('read: the number is rows × cols', () => {
    const c = { ...array, mode: 'read' } as ArrayConfig;
    expect(arrayAnswerIssues(c, { kind: 'number', value: 12 })).toEqual([]);
    expect(arrayAnswerIssues(c, { kind: 'number', value: 7 })).toEqual([
      'the picture shows 12, the answer is 7',
    ]);
    expect(arrayAnswerIssues(c, dims({ rows: 3, cols: 4 }))).toEqual(['read answers a number']);
  });

  it('build-dims: the target is this array, with this orientation rule', () => {
    expect(arrayAnswerIssues(array, dims({ rows: 3, cols: 4 }))).toEqual([]);
    expect(arrayAnswerIssues(array, dims({ rows: 4, cols: 3 }))).toHaveLength(1);
    expect(
      arrayAnswerIssues(array, dims({ rows: 3, cols: 4, orientationMatters: true })),
    ).toEqual(['the target and the widget disagree on whether orientation matters']);
    expect(arrayAnswerIssues(array, dims({ rows: 3, cols: 4, requireSplit: true }))).toEqual([
      'requireSplit is set exactly for split',
    ]);
  });

  it('split: the target is this array and asks for the split', () => {
    const c = { ...array, mode: 'split' } as ArrayConfig;
    expect(arrayAnswerIssues(c, dims({ rows: 3, cols: 4, requireSplit: true }))).toEqual([]);
    expect(arrayAnswerIssues(c, dims({ rows: 3, cols: 4 }))).toHaveLength(1);
  });

  it('build-total and new-way: the target is this total and this found list', () => {
    const c = { ...array, mode: 'build-total', total: 12 } as ArrayConfig;
    expect(arrayAnswerIssues(c, areaOf({ total: 12 }))).toEqual([]);
    expect(arrayAnswerIssues(c, areaOf({ total: 10 }))).toHaveLength(1);
    expect(arrayAnswerIssues(c, areaOf({ total: 12, found: [[3, 4]] }))).toHaveLength(1);
    const n = { ...c, mode: 'new-way', found: [[3, 4]] } as ArrayConfig;
    expect(arrayAnswerIssues(n, areaOf({ total: 12, found: [[3, 4]] }))).toEqual([]);
    expect(arrayAnswerIssues(n, areaOf({ total: 12, found: [[2, 6]] }))).toHaveLength(1);
    expect(arrayAnswerIssues(n, dims({ rows: 3, cols: 4 }))).toEqual([
      'new-way answers array.area',
    ]);
  });

  it('rows and columns are not interchangeable where orientation matters', () => {
    const check = stateChecker('array.dims')?.check as NonNullable<ReturnType<typeof stateChecker>>["check"];
    const s = arrayBuild.apply(
      arrayBuild.initialState(array),
      act('drag-rect', { rows: 4, cols: 3 }),
    );
    const turned = (arrayBuild.toResponse(s) as { value: Record<string, unknown> }).value;
    expect(turned).toEqual({ rows: 4, cols: 3 });
    expect(check({ rows: 3, cols: 4 }, turned)).toBe(true);
    expect(check({ rows: 3, cols: 4, orientationMatters: true }, turned)).toBe(false);
  });
});

describe('array-build: every op a child can do has an undo', () => {
  const start = arrayBuild.initialState(array);

  it('a rectangle is dragged back smaller, down to an empty board', () => {
    const big = arrayBuild.apply(start, act('drag-rect', { rows: 3, cols: 4 }));
    const small = arrayBuild.apply(big, act('drag-rect', { rows: 2, cols: 4 }));
    expect([small.rows, small.cols]).toEqual([2, 4]);
    const none = arrayBuild.apply(small, act('drag-rect', { rows: 0, cols: 4 }));
    expect([none.rows, none.cols]).toEqual([0, 0]);
    expect(arrayBuild.toResponse(none)).toBeNull();
  });

  it('a rectangle never leaves the board', () => {
    const s = arrayBuild.apply(start, act('drag-rect', { rows: 99, cols: 99 }));
    expect([s.rows, s.cols]).toEqual([5, 5]);
  });

  it('a split line moves to any other gap, and never out of the array', () => {
    const c = { ...array, mode: 'split' } as ArrayConfig;
    let s = arrayBuild.apply(arrayBuild.initialState(c), act('split-at', { col: 3 }));
    s = arrayBuild.apply(s, act('split-at', { col: 1 }));
    expect(s.split).toBe(1);
    expect(arrayBuild.apply(s, act('split-at', { col: 4 })).split).toBe(1);
    expect(arrayBuild.apply(s, act('split-at', { col: 0 })).split).toBe(1);
  });
});

describe('area-tiles: the supported domain', () => {
  const region = (w: number, h: number) => ({ w, h, mask: full(w, h) });

  it('accepts the largest region to read and the largest to work on', () => {
    const read = { ...area, mode: 'count', region: region(AREA_SIDE_MAX, AREA_SIDE_MAX) };
    expect(issues(areaTiles, read)).toEqual([]);
    for (const mode of ['tile', 'decompose', 'partition'] as const) {
      expect(areaWorked(mode)).toBe(true);
      const c = { ...area, mode, region: region(AREA_WORK_W_MAX, AREA_WORK_H_MAX) };
      expect(issues(areaTiles, c)).toEqual([]);
    }
  });

  it('refuses a region to read wider or taller than ten', () => {
    expect(issues(areaTiles, { ...area, mode: 'count', region: region(11, 2) })).toEqual([
      'region.w: a region to count is at most 10 wide (it is 11)',
    ]);
    expect(issues(areaTiles, { ...area, mode: 'multiply', region: region(2, 11) })).toEqual([
      'region.h: a region to multiply is at most 10 tall (it is 11)',
    ]);
  });

  it('refuses a region to work on wider than ten or taller than six', () => {
    expect(issues(areaTiles, { ...area, region: region(11, 2) })).toEqual([
      'region.w: a region to tile is at most 10 wide (it is 11)',
    ]);
    for (const mode of ['tile', 'decompose', 'partition'] as const) {
      expect(issues(areaTiles, { ...area, mode, region: region(4, 7) })).toEqual([
        `region.h: a region to ${mode} is at most 6 tall (it is 7)`,
      ]);
    }
  });

  it('refuses a region in two pieces', () => {
    expect(issues(areaTiles, { ...area, region: { w: 3, h: 1, mask: '101' } })).toEqual([
      'region.mask: the region is one connected shape',
    ]);
  });

  it('refuses a region with an empty margin in its box', () => {
    expect(fillsBox(3, 2, '110110')).toBe(false);
    expect(issues(areaTiles, { ...area, region: { w: 3, h: 2, mask: '110110' } })).toEqual([
      'region.mask: the region touches every side of its w × h box',
    ]);
    expect(issues(areaTiles, { ...area, region: L })).toEqual([]);
  });

  it('labels side lengths on rectangles only', () => {
    expect(issues(areaTiles, { ...area, mode: 'count', sideLabels: true, region: L })).toEqual([
      'sideLabels: side lengths are labelled on rectangles only',
    ]);
    expect(issues(areaTiles, { ...area, mode: 'multiply', sideLabels: true })).toEqual([]);
  });

  it('the decimal grid is a counted 10 × 10', () => {
    const mask = '1'.repeat(47) + '0'.repeat(53);
    const c = { ...area, mode: 'count', decimalGrid: true, region: { w: 10, h: 10, mask } };
    expect(issues(areaTiles, c)).toEqual([]);
    expect(issues(areaTiles, { ...c, mode: 'multiply', region: region(10, 10) })).toEqual([
      'decimalGrid: the decimal grid is counted (mode count)',
    ]);
    expect(issues(areaTiles, { ...c, region: region(5, 5) })).toEqual([
      'decimalGrid: the decimal grid is 10 × 10',
    ]);
  });

  it('offers answers from the box, never from the answer', () => {
    expect(areaAnswerMax({ region: region(5, 4) })).toBe(20);
    expect(areaAnswerMax({ region: L })).toBe(20);
    expect(areaAnswerMax({ region: region(7, 3) })).toBe(100);
    expect(areaAnswerMax({ region: region(10, 10) })).toBe(100);
  });
});

describe('area-tiles: one source for the answer', () => {
  const cover = (target: Record<string, unknown>): AnswerSpec => ({
    kind: 'state',
    checker: 'tiles.cover',
    target,
  });

  it('count and multiply: the number is the area', () => {
    const c = { ...area, mode: 'count', region: L } as AreaConfig;
    expect(maskArea(L.mask)).toBe(7);
    expect(areaAnswerIssues(c, { kind: 'number', value: 7 })).toEqual([]);
    expect(areaAnswerIssues(c, { kind: 'number', value: 9 })).toEqual([
      'the area is 7, the answer is 9',
    ]);
  });

  it('tile: the target is this region and its area', () => {
    const mask = area.region.mask;
    expect(areaAnswerIssues(area, cover({ mask, value: 12 }))).toEqual([]);
    expect(areaAnswerIssues(area, cover({ mask, value: 10 }))).toHaveLength(1);
    expect(areaAnswerIssues(area, cover({ mask: '1'.repeat(11), value: 12 }))).toHaveLength(1);
    expect(areaAnswerIssues(area, cover({ mask, value: 12, decompose: true }))).toHaveLength(1);
  });

  it('decompose: the target is this region, its box and its area', () => {
    const c = { ...area, mode: 'decompose', region: L } as AreaConfig;
    const t = { mask: L.mask, w: 3, h: 3, value: 7, decompose: true };
    expect(areaAnswerIssues(c, cover(t))).toEqual([]);
    expect(areaAnswerIssues(c, cover({ ...t, w: 9, h: 1 }))).toEqual([
      'the target box is not the region box',
    ]);
    expect(areaAnswerIssues(c, cover({ ...t, decompose: undefined }))).toHaveLength(1);
  });

  it('partition: the target is the rows and columns as drawn', () => {
    const c = { ...area, mode: 'partition' } as AreaConfig;
    const dims = (target: Record<string, unknown>): AnswerSpec => ({
      kind: 'state',
      checker: 'array.dims',
      target,
    });
    expect(areaAnswerIssues(c, dims({ rows: 3, cols: 4, orientationMatters: true }))).toEqual([]);
    expect(areaAnswerIssues(c, dims({ rows: 3, cols: 4 }))).toEqual([
      'a partition is checked as drawn',
    ]);
    expect(areaAnswerIssues(c, dims({ rows: 4, cols: 3, orientationMatters: true }))).toHaveLength(
      1,
    );
  });

  it('a covered region answers; one tile short, one too many or a gap does not', () => {
    const check = stateChecker('tiles.cover')?.check as NonNullable<ReturnType<typeof stateChecker>>["check"];
    const target = { mask: L.mask, value: 7 };
    const c = { ...area, region: L } as AreaConfig;
    let s = areaTiles.initialState(c);
    for (const r of [0, 1, 2]) s = areaTiles.apply(s, act('fill-row', { r }));
    s = areaTiles.apply(s, act('answer', { value: 7 }));
    const done = (areaTiles.toResponse(s) as { value: Record<string, unknown> }).value;
    expect(done.tiles).toBe(L.mask);
    expect(check(target, done)).toBe(true);
    const short = areaTiles.apply(s, act('place-tile', { r: 2, c: 2, remove: true }));
    const gap = (areaTiles.toResponse(short) as { value: Record<string, unknown> }).value;
    expect(check(target, gap)).toBe(false);
  });
});

describe('area-tiles: every op a child can do has an undo', () => {
  const c = { ...area, region: L } as AreaConfig;

  it('a tile is taken back from where it lies; a cell holds one tile', () => {
    let s = areaTiles.apply(areaTiles.initialState(c), act('place-tile', { r: 1, c: 1 }));
    s = areaTiles.apply(s, act('place-tile', { r: 1, c: 1 }));
    expect(s.tiles.filter(Boolean)).toHaveLength(1);
    s = areaTiles.apply(s, act('place-tile', { r: 1, c: 1, remove: true }));
    expect(s.tiles.filter(Boolean)).toHaveLength(0);
  });

  it('no tile lands outside the region', () => {
    const start = areaTiles.initialState(c);
    expect(areaTiles.apply(start, act('place-tile', { r: 0, c: 2 }))).toBe(start);
    expect(areaTiles.apply(start, act('place-tile', { r: 5, c: 0 }))).toBe(start);
  });

  it('a split line drawn again is erased', () => {
    const d = { ...c, mode: 'decompose' } as AreaConfig;
    let s = areaTiles.apply(areaTiles.initialState(d), act('draw-split', { at: 1, dir: 'h' }));
    expect(s.splits).toEqual([{ dir: 'h', at: 1 }]);
    s = areaTiles.apply(s, act('draw-split', { at: 1, dir: 'h' }));
    expect(s.splits).toEqual([]);
  });
});
