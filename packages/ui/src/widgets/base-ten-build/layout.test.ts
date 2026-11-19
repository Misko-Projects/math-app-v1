import { describe, expect, it } from 'vitest';
import {
  bundleHalf,
  bundleOffset,
  clampInto,
  columnWidth,
  larger,
  matLayout,
  onesFrame,
  pieceBox,
  smaller,
  U_MAX,
  U_MIN,
} from './layout';

const counts = (thousands = 0, hundreds = 0, tens = 0, ones = 0) => ({
  thousands,
  hundreds,
  tens,
  ones,
});

// The 1280 × 800 widget area: the mat's columns get about 800 px, the pieces 420 px of height.
const tablet = { width: 800, height: 420, columnGap: 16 };
const twoButtons = (k: string) => (k === 'tens' || k === 'hundreds' ? 236 : 112);

describe('larger / smaller', () => {
  it('steps through the kinds', () => {
    expect(larger('ones')).toBe('tens');
    expect(larger('thousands')).toBeUndefined();
    expect(smaller('tens')).toBe('ones');
    expect(smaller('ones')).toBeUndefined();
  });
});

describe('pieceBox', () => {
  it('keeps a rod ten units tall and at least 32 px wide to grab', () => {
    expect(pieceBox('tens', 10)).toEqual({ w: 32, h: 100 });
    expect(pieceBox('tens', 34)).toEqual({ w: 34, h: 340 });
    expect(pieceBox('hundreds', 12)).toEqual({ w: 120, h: 120 });
    expect(pieceBox('ones', 20)).toEqual({ w: 20, h: 20 });
  });
});

describe('columnWidth', () => {
  it('wraps ones into frames of ten that stack while they fit', () => {
    const f = onesFrame(20);
    // 34 ones: four frames; 420 px holds them all in one stack.
    expect(columnWidth('ones', 34, 20, 420)).toBe(f.w);
    // Only two frames per stack in 100 px: two stacks side by side.
    expect(columnWidth('ones', 34, 20, 100)).toBe(2 * f.w + 12);
  });
  it('is null when one piece is taller than the board', () => {
    expect(columnWidth('tens', 1, 50, 420)).toBeNull();
  });
  it('wraps flats into rows', () => {
    // 9 flats of 130 px in 420 px: three rows of three.
    expect(columnWidth('hundreds', 9, 13, 420)).toBe(3 * 130 + 2 * 8);
  });
});

describe('matLayout', () => {
  it('draws a small build at the largest unit', () => {
    const l = matLayout({
      kinds: ['tens', 'ones'],
      counts: counts(0, 0, 3, 4),
      controlsWidth: () => 112,
      ...tablet,
    });
    expect(l.u).toBe(U_MAX);
    expect(l.fits).toBe(true);
  });

  it('shrinks the pieces for 999 and still fits the width', () => {
    const l = matLayout({
      kinds: ['hundreds', 'tens', 'ones'],
      counts: counts(0, 9, 9, 9),
      controlsWidth: twoButtons,
      ...tablet,
    });
    expect(l.fits).toBe(true);
    expect(l.u).toBeLessThan(U_MAX);
    expect(l.u).toBeGreaterThanOrEqual(12);
    const total = l.columns.reduce((a, c) => a + c.width, 0) + 2 * tablet.columnGap;
    expect(total).toBeLessThanOrEqual(tablet.width);
  });

  it('fits a cube, flats, rods and units (1234)', () => {
    const l = matLayout({
      kinds: ['thousands', 'hundreds', 'tens', 'ones'],
      counts: counts(1, 2, 3, 4),
      controlsWidth: twoButtons,
      ...tablet,
    });
    expect(l.fits).toBe(true);
    expect(l.columns.map((c) => c.kind)).toEqual(['thousands', 'hundreds', 'tens', 'ones']);
  });

  it('never makes a column narrower than its trade buttons', () => {
    const l = matLayout({
      kinds: ['tens', 'ones'],
      counts: counts(0, 0, 0, 0),
      controlsWidth: () => 236,
      ...tablet,
    });
    for (const c of l.columns) expect(c.width).toBeGreaterThanOrEqual(236);
  });

  it('only gets smaller as pieces are added', () => {
    let last = U_MAX;
    for (let ones = 0; ones <= 60; ones += 5) {
      const { u } = matLayout({
        kinds: ['tens', 'ones'],
        counts: counts(0, 0, 9, ones),
        controlsWidth: () => 112,
        ...tablet,
      });
      expect(u).toBeLessThanOrEqual(last);
      expect(u).toBeGreaterThanOrEqual(U_MIN);
      last = u;
    }
  });

  it('reports a config beyond any authored item as not fitting', () => {
    const l = matLayout({
      kinds: ['hundreds', 'tens', 'ones'],
      counts: counts(0, 400, 0, 0),
      controlsWidth: () => 0,
      ...tablet,
    });
    expect(l.fits).toBe(false);
    expect(l.u).toBe(U_MIN);
  });
});

describe('bundles', () => {
  it('lines ten units up as a rod and ten rods side by side as a flat', () => {
    const units = Array.from({ length: 10 }, (_, j) => bundleOffset('ones', j, 10));
    expect(units.map((p) => p.x)).toEqual(Array(10).fill(0));
    expect(units[9]?.y).toBeCloseTo(-(units[0]?.y ?? 0));
    expect((units[1]?.y ?? 0) - (units[0]?.y ?? 0)).toBe(10);
    const rods = Array.from({ length: 10 }, (_, j) => bundleOffset('tens', j, 10));
    expect(rods.map((p) => p.y)).toEqual(Array(10).fill(0));
    expect((rods[1]?.x ?? 0) - (rods[0]?.x ?? 0)).toBe(10);
  });

  it('keeps a bundle inside the board', () => {
    const box = { left: 0, top: 0, right: 400, bottom: 400 };
    const half = bundleHalf('ones', 30);
    expect(clampInto({ x: 200, y: 20 }, half, box)).toEqual({ x: 200, y: 150 });
    expect(clampInto({ x: 200, y: 200 }, half, box)).toEqual({ x: 200, y: 200 });
    // Larger than the box: centred.
    expect(clampInto({ x: 0, y: 0 }, { x: 300, y: 300 }, box)).toEqual({ x: 200, y: 200 });
  });
});
