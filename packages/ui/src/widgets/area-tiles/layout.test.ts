import { describe, expect, it } from 'vitest';
import {
  type FitOptions,
  fitBoard,
  innerGridSegments,
  lanesFor,
  nextEmptyCell,
  outlineSegments,
  regionCells,
  rowsWithCells,
  sideOf,
  splitSegments,
} from './layout';

// An L: 3 wide, 3 tall, the top-right 2 × 2 cut away.
//   1 0 0
//   1 0 0
//   1 1 1
const L = { w: 3, h: 3, mask: '100100111' };
const rect = { w: 3, h: 2, mask: '111111' };

const total = (segs: { x1: number; y1: number; x2: number; y2: number }[]) =>
  segs.reduce((n, s) => n + Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1), 0);

describe('area-tiles layout', () => {
  it('lists region cells in reading order and the rows that have any', () => {
    expect(regionCells(L)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    expect(rowsWithCells({ w: 2, h: 3, mask: '110011' })).toEqual([0, 2]);
  });

  it('outlines a rectangle with four runs and an L with six', () => {
    const r = outlineSegments(rect, 10);
    expect(r).toHaveLength(4);
    expect(total(r)).toBe(2 * (30 + 20));
    const l = outlineSegments(L, 10);
    expect(l).toHaveLength(6);
    // The L's perimeter is the same as its 3 × 3 box's.
    expect(total(l)).toBe(120);
  });

  it('draws inner grid lines only between two region cells', () => {
    // A 3 × 2 rectangle: 1 horizontal run of 3 and 2 vertical runs of 2.
    expect(total(innerGridSegments(rect, 10))).toBe(30 + 2 * 20);
    // The L: 2 vertical unit edges in the bottom row, 2 horizontal in the left column.
    expect(total(innerGridSegments(L, 10))).toBe(40);
  });

  it('stops a split line at the notch of an L', () => {
    // After column 1: it only touches the bottom row.
    expect(splitSegments(L, 'v', 1, 10)).toEqual([{ x1: 10, y1: 20, x2: 10, y2: 30 }]);
    // After row 2 (above the full bottom row): only the left column is cut.
    expect(splitSegments(L, 'h', 2, 10)).toEqual([{ x1: 0, y1: 20, x2: 10, y2: 20 }]);
    expect(splitSegments(rect, 'h', 1, 10)).toEqual([{ x1: 0, y1: 10, x2: 30, y2: 10 }]);
  });

  it('staggers buttons into lanes when the pitch is shorter than a button and its gap', () => {
    expect(lanesFor(100, 64, 12)).toBe(1);
    expect(lanesFor(76, 64, 12)).toBe(1);
    expect(lanesFor(51, 64, 12)).toBe(2);
    expect(lanesFor(30, 80, 12)).toBe(4);
  });

  const base: FitOptions = {
    width: 820,
    height: 556,
    w: 7,
    h: 5,
    min: 28,
    max: 132,
    target: 64,
    gap: 12,
    tray: true,
    rowButtons: true,
    markers: false,
    labels: false,
    labelW: 0,
  };

  it('fits the 7 × 5 L to tile with the tray and row buttons, cells ≥ 28 px', () => {
    const l = fitBoard(base);
    expect(l.pitch).toBeGreaterThanOrEqual(28);
    expect(l.trayW + 20 + l.fieldW).toBeLessThanOrEqual(820);
    expect(l.fieldH).toBeLessThanOrEqual(556);
    // The stack tile is drawn at the cells' own scale.
    expect(l.stack).toBe(Math.max(l.pitch, 64));
    // A bigger pitch would not fit.
    const tooBig = fitBoard({ ...base, min: l.pitch + 1, max: l.pitch + 1 });
    expect(tooBig.trayW + 20 + tooBig.fieldW > 820 || tooBig.fieldH > 556).toBe(true);
  });

  it('fits a 10 × 10 decimal grid at ≥ 20 px and keeps row buttons ≥ 12 px apart', () => {
    const l = fitBoard({ ...base, w: 10, h: 10, min: 20 });
    expect(l.pitch).toBeGreaterThanOrEqual(20);
    expect(l.rowLanes * l.pitch).toBeGreaterThanOrEqual(64 + 12);
  });

  it('caps a tiny region at the largest pitch (chunky, not a poster)', () => {
    const l = fitBoard({ ...base, w: 3, h: 2, tray: false, rowButtons: false, max: 150 });
    expect(l.pitch).toBe(150);
  });

  it('finds the next empty cell, wrapping, or none', () => {
    const tiles = [true, false, false, false, false, false];
    expect(nextEmptyCell(rect, tiles, 0, 0)).toEqual([0, 1]);
    expect(nextEmptyCell(rect, [false, true, true, true, true, true], 1, 2)).toEqual([0, 0]);
    expect(nextEmptyCell(rect, new Array(6).fill(true), 0, 0)).toBeNull();
  });

  it('reads side ids', () => {
    expect(sideOf('top')).toBe('top');
    expect(sideOf('w')).toBe('top');
    expect(sideOf('left')).toBe('left');
    expect(sideOf('right')).toBe('left');
    expect(sideOf('middle')).toBeNull();
  });
});
