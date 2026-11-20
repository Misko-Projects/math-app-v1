import { describe, expect, it } from 'vitest';
import { wrapLine } from './FitPicture';
import { objectSetLayout } from './layout';

const line = (count: number) =>
  objectSetLayout({ count, sprite: 'dot', layout: 'line', layoutSeed: 1 });

/** The objects per row, top row first, in reading order. */
function rows(count: number): number[] {
  const wrapped = wrapLine(line(count), 5);
  const ys = [...new Set(wrapped.objects.map((o) => o.y))].sort((a, b) => a - b);
  return ys.map((y) => wrapped.objects.filter((o) => o.y === y).length);
}

describe('wrapLine (rows of five, the first row filled first)', () => {
  it.each([
    [1, [1]],
    [2, [2]],
    [3, [3]],
    [4, [4]],
    [5, [5]],
    [6, [5, 1]],
    [7, [5, 2]],
    [8, [5, 3]],
    [9, [5, 4]],
    [10, [5, 5]],
  ])('%i objects → rows %j', (count, expected) => {
    expect(rows(count)).toEqual(expected);
  });

  it('keeps reading order: object i is still obj-<i>, left to right then the next row', () => {
    const wrapped = wrapLine(line(7), 5);
    const order = [...wrapped.objects].sort((a, b) => a.y - b.y || a.x - b.x).map((o) => o.index);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Both rows start at the same left edge, spacing unchanged.
    const first = wrapped.objects.filter((o) => o.index === 0 || o.index === 5);
    expect(first[0]?.x).toBeCloseTo(first[1]?.x ?? Number.NaN);
  });
});
