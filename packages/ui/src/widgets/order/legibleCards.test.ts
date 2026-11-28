// Order cards under the counted bar (05 §11; legibility slice 2, Refs #34): which bar a card's
// picture holds, and the tight plates a legible plan draws groups on.
import { describe, expect, it } from 'vitest';
import { countLayout } from '../kit';
import { BAR_COUNTED, countedBarOf, tightPlates } from './OrderWidget';

describe('countedBarOf', () => {
  it('22 px for a plain set, 20 px for ten-frame counters, 16 px for sizes that vary on purpose', () => {
    expect(countedBarOf(undefined)).toBe(BAR_COUNTED);
    expect(
      countedBarOf({
        kind: 'objects',
        set: { count: 4, sprite: 'shell', layout: 'line', layoutSeed: 1 },
      }),
    ).toBe(22);
    expect(countedBarOf({ kind: 'ten-frame', frames: 2, filled: [10, 4] })).toBe(20);
    expect(
      countedBarOf({
        kind: 'objects',
        set: { count: 4, sprite: 'leaf', layout: 'line', sizeVaries: true, layoutSeed: 1 },
      }),
    ).toBe(16);
  });
});

describe('tightPlates', () => {
  const groups = (a: number, b: number) =>
    countLayout({
      kind: 'objects',
      set: { count: a + b, sprite: 'shell', layout: 'groups', groups: [a, b], layoutSeed: 1 },
    });

  it.each([
    [1, 6],
    [2, 5],
    [3, 4],
    [6, 1],
  ])('%i + %i: at most two rows a group, left group first, every object on its plate', (a, b) => {
    const base = groups(a, b);
    if (!base) throw new Error('no layout');
    const t = tightPlates(base);
    expect(t.objects).toHaveLength(a + b);
    expect(t.frames).toHaveLength(2);
    const [left, right] = t.frames;
    if (!left || !right) throw new Error('no plates');
    expect(left.x + left.cols).toBeLessThan(right.x);
    // Two rows of objects at most: the picture is at most 2.4 cells tall.
    expect(t.height).toBeLessThanOrEqual(2.4);
    // At most four columns of objects across both plates (the widest split of 7).
    expect(t.width).toBeLessThanOrEqual(5.2);
    for (const o of t.objects) {
      const plate = o.group === 0 ? left : right;
      expect(o.x).toBeGreaterThanOrEqual(plate.x);
      expect(o.x + o.scale).toBeLessThanOrEqual(plate.x + plate.cols + 1e-9);
      expect(o.y + o.scale).toBeLessThanOrEqual(plate.rows + 1e-9);
    }
    // Object order and indexes are kept.
    expect(t.objects.map((o) => o.index)).toEqual(base.objects.map((o) => o.index));
  });

  it('keeps a layout with distractors as it is (they stay off the plates)', () => {
    const base = countLayout({
      kind: 'objects',
      set: {
        count: 5,
        sprite: 'shell',
        layout: 'groups',
        groups: [2, 3],
        distractors: { count: 2, sprite: 'leaf' },
        layoutSeed: 1,
      },
    });
    if (!base) throw new Error('no layout');
    expect(base.objects.some((o) => o.kind === 'distractor')).toBe(true);
    expect(tightPlates(base)).toBe(base);
  });
});
