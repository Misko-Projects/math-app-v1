import { describe, expect, it } from 'vitest';
import {
  bundleHalf,
  bundleOffset,
  clampInto,
  columnWidth,
  larger,
  type MatLayoutInput,
  matLayout,
  onesFrame,
  pieceBox,
  smaller,
  U_FLOOR,
  UNIT_G1,
  UNIT_K,
  unitCandidates,
} from './layout';

const counts = (thousands = 0, hundreds = 0, tens = 0, ones = 0) => ({
  thousands,
  hundreds,
  tens,
  ones,
});

// The widget's constants at 1280 × 800 (BaseTenBuildWidget): 1146 px wide, 606 px for pieces.
const WORDS: Record<string, string> = {
  thousands: 'Thousands',
  hundreds: 'Hundreds',
  tens: 'Tens',
  ones: 'Ones',
};
const tablet = (k = false): Omit<MatLayoutInput, 'kinds' | 'counts'> => ({
  units: unitCandidates(k),
  width: 1146,
  height: 606,
  gutter: (k ? 80 : 64) + 8,
  columnPad: 4,
  frame: 5,
  gap: 12,
  sideMin: k ? 150 : 160,
  sideMax: 260,
  headerWidth: (kind) => (k ? 52 : 40 + 11 * (WORDS[kind] ?? '').length),
});

describe('larger / smaller', () => {
  it('steps through the kinds', () => {
    expect(larger('ones')).toBe('tens');
    expect(larger('thousands')).toBeUndefined();
    expect(smaller('tens')).toBe('ones');
    expect(smaller('ones')).toBeUndefined();
  });
});

describe('pieceBox', () => {
  it('keeps true scale (a rod is ten units) with a grab-sized rod hit box', () => {
    expect(pieceBox('tens', 20)).toEqual({ w: 28, h: 200 });
    expect(pieceBox('tens', 28)).toEqual({ w: 36, h: 280 });
    expect(pieceBox('hundreds', 20)).toEqual({ w: 200, h: 200 });
    expect(pieceBox('ones', 20)).toEqual({ w: 20, h: 20 });
  });
});

describe('columnWidth', () => {
  it('wraps ones into frames of ten that stack while they fit', () => {
    const f = onesFrame(20);
    expect(columnWidth('ones', 34, 20, 606)).toBe(f.w);
    expect(columnWidth('ones', 34, 20, 100)).toBe(2 * f.w + 12);
    // Upright frames (two columns of five) are narrow.
    expect(columnWidth('ones', 9, 20, 606, 'v')).toBe(onesFrame(20, 'v').w);
  });
  it('is null when one piece is taller than the mat', () => {
    expect(columnWidth('tens', 1, 70, 606)).toBeNull();
  });
  it('puts nine flats in a 3 × 3 grid at 20 px', () => {
    expect(columnWidth('hundreds', 9, 20, 606)).toBe(3 * 200 + 2 * 3);
  });
});

describe('matLayout', () => {
  it('draws every G1 item at the one 20 px unit', () => {
    const l = matLayout({ kinds: ['tens', 'ones'], counts: counts(0, 0, 3, 4), ...tablet() });
    expect(l.u).toBe(UNIT_G1);
    expect(l.fits).toBe(true);
  });

  it('draws K bigger when it fits', () => {
    const l = matLayout({ kinds: ['tens', 'ones'], counts: counts(0, 0, 1, 3), ...tablet(true) });
    expect(l.u).toBe(UNIT_K);
  });

  it('fits 999 at 20 px beside the side panel', () => {
    const l = matLayout({
      kinds: ['hundreds', 'tens', 'ones'],
      counts: counts(0, 9, 9, 9),
      ...tablet(),
    });
    expect(l.u).toBe(20);
    expect(l.matWidth + 12 + l.sideWidth).toBeLessThanOrEqual(1146);
    expect(l.sideWidth).toBeGreaterThanOrEqual(160);
  });

  it('fits 1234 at 20 px', () => {
    const l = matLayout({
      kinds: ['thousands', 'hundreds', 'tens', 'ones'],
      counts: counts(1, 2, 3, 4),
      ...tablet(),
    });
    expect(l.u).toBe(20);
    expect(l.columns.map((c) => c.kind)).toEqual(['thousands', 'hundreds', 'tens', 'ones']);
  });

  it('never makes a column narrower than its header', () => {
    const l = matLayout({ kinds: ['hundreds', 'tens'], counts: counts(), ...tablet() });
    for (const c of l.columns) expect(c.width).toBeGreaterThanOrEqual(40 + 11 * 4 + 8);
  });

  it('reports content beyond any authored item as not fitting', () => {
    const l = matLayout({
      kinds: ['hundreds', 'tens', 'ones'],
      counts: counts(0, 400, 0, 0),
      ...tablet(),
    });
    expect(l.fits).toBe(false);
    expect(l.u).toBeLessThan(U_FLOOR);
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
    expect(clampInto({ x: 0, y: 0 }, { x: 300, y: 300 }, box)).toEqual({ x: 200, y: 200 });
  });
});
