import { describe, expect, it } from 'vitest';
import {
  CHROME,
  contentSize,
  evenRows,
  gridLayout,
  looseGrid,
  pileLayout,
  rodCell,
  splitCount,
  stripSize,
  stripWidth,
} from './layout';

describe('splitCount', () => {
  it('keeps up to ten loose without rods on offer', () => {
    expect(splitCount(7, false)).toEqual({ rods: 0, loose: 7 });
    expect(splitCount(10, false)).toEqual({ rods: 0, loose: 10 });
  });
  it('bundles tens once a container holds more than ten', () => {
    expect(splitCount(12, false)).toEqual({ rods: 1, loose: 2 });
    expect(splitCount(40, false)).toEqual({ rods: 4, loose: 0 });
  });
  it('shows every full ten as a rod when rods are on offer (MUL.11)', () => {
    expect(splitCount(10, true)).toEqual({ rods: 1, loose: 0 });
    expect(splitCount(30, true)).toEqual({ rods: 3, loose: 0 });
    expect(splitCount(9, true)).toEqual({ rods: 0, loose: 9 });
  });
  it('never goes negative', () => {
    expect(splitCount(-3, false)).toEqual({ rods: 0, loose: 0 });
  });
});

describe('looseGrid', () => {
  it('lays sprites out in rows of five', () => {
    expect(looseGrid(0)).toEqual({ cols: 0, rows: 0 });
    expect(looseGrid(3)).toEqual({ cols: 3, rows: 1 });
    expect(looseGrid(7)).toEqual({ cols: 5, rows: 2 });
    expect(looseGrid(10)).toEqual({ cols: 5, rows: 2 });
  });
});

describe('evenRows', () => {
  it('splits slots into even rows, earlier rows first', () => {
    expect(evenRows(10, 4)).toEqual([3, 3, 2, 2]);
    expect(evenRows(3, 1)).toEqual([3]);
    expect(evenRows(2, 5)).toEqual([1, 1]);
  });
});

describe('gridLayout', () => {
  const base = { gap: 16, maxSprite: 80, minSprite: 12 };
  it('fits 10 groups of 10 in the read picture', () => {
    const l = gridLayout({
      ...base,
      slots: 10,
      cap: { rods: 0, loose: 10 },
      width: 820,
      height: 480,
    });
    expect(l.fits).toBe(true);
    const perRow = Math.max(...l.rows);
    expect(perRow * l.box.w + (perRow - 1) * 16).toBeLessThanOrEqual(820);
    expect(l.rows.length * l.box.h + (l.rows.length - 1) * 16).toBeLessThanOrEqual(480);
    expect(l.rows.reduce((a, b) => a + b, 0)).toBe(10);
    expect(l.s).toBeGreaterThanOrEqual(24);
  });
  it('scales chunky sprites up for a small K item, in one row when it nearly fits', () => {
    const l = gridLayout({
      ...base,
      maxSprite: 96,
      slots: 3,
      cap: { rods: 0, loose: 2 },
      width: 760,
      height: 440,
    });
    expect(l.s).toBeGreaterThanOrEqual(80);
    expect(l.rows).toEqual([3]);
  });
  it('caps the sprite size', () => {
    const l = gridLayout({
      ...base,
      slots: 1,
      cap: { rods: 0, loose: 1 },
      width: 900,
      height: 500,
    });
    expect(l.s).toBe(80);
  });
  it('always leaves the contents room inside the container rim', () => {
    const l = gridLayout({
      ...base,
      slots: 4,
      cap: { rods: 3, loose: 0 },
      width: 800,
      height: 460,
    });
    const c = contentSize({ rods: 3, loose: 0 }, l.s);
    expect(l.box.w).toBeGreaterThanOrEqual(c.w + 2 * CHROME.x);
    expect(l.box.h).toBeGreaterThanOrEqual(c.h + CHROME.top + CHROME.bottom);
  });
  it('respects a minimum box (room for the add button)', () => {
    const l = gridLayout({
      ...base,
      slots: 8,
      cap: { rods: 0, loose: 1 },
      width: 800,
      height: 440,
      minBox: { w: 140, h: 150 },
    });
    expect(l.box.w).toBeGreaterThanOrEqual(140);
    expect(l.box.h).toBeGreaterThanOrEqual(150);
    expect(l.fits).toBe(true);
  });
  it('reports a config that cannot fit', () => {
    const l = gridLayout({
      ...base,
      slots: 40,
      cap: { rods: 9, loose: 9 },
      width: 300,
      height: 200,
    });
    expect(l.fits).toBe(false);
  });
});

describe('pileLayout', () => {
  it('puts the pile in strips of ten and fits the box', () => {
    const p = pileLayout(42, 480, 80);
    expect(p.strips).toEqual([10, 10, 10, 10, 2]);
    const columns = Math.ceil(p.strips.length / p.perColumn);
    expect(columns * stripSize(p.s).w + (columns - 1) * 12).toBeLessThanOrEqual(480);
    expect(p.h).toBeLessThanOrEqual(80);
    expect(p.s).toBeGreaterThanOrEqual(20);
  });
  it('never draws a sprite under 20 px: a big pile grows taller instead', () => {
    const p = pileLayout(120, 480, 80);
    expect(p.s).toBe(20);
    expect(p.h).toBeGreaterThan(80);
    const columns = Math.ceil(p.strips.length / p.perColumn);
    expect(columns * stripSize(20).w + (columns - 1) * 12).toBeLessThanOrEqual(480);
  });
  it('keeps rod cells countable (≥ 20 px)', () => {
    expect(rodCell(24)).toBe(20);
    expect(rodCell(80)).toBe(34);
  });
  it('draws a small pile big', () => {
    const p = pileLayout(6, 420, 80);
    expect(p.strips).toEqual([6]);
    expect(p.s).toBe(34);
    expect(stripWidth(6, p.s)).toBeLessThanOrEqual(420);
  });
  it('is empty when nothing is left', () => {
    expect(pileLayout(0, 300, 80).strips).toEqual([]);
  });
});
