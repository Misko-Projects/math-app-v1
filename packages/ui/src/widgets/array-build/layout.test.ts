import { describe, expect, it } from 'vitest';
import {
  columnX,
  cornerPath,
  fitPitch,
  nearestGap,
  rectFromDrag,
  rectFromKey,
  rectToCell,
  splitFromKey,
  splitX,
  thumbPitch,
} from './layout';

const max = { rows: 6, cols: 8 };

describe('fitPitch', () => {
  it('fits the tighter side and rounds down', () => {
    expect(fitPitch({ width: 700, height: 500, rows: 10, cols: 10, min: 30, max: 140 })).toBe(50);
    expect(fitPitch({ width: 700, height: 900, rows: 10, cols: 10, min: 30, max: 140 })).toBe(70);
  });
  it('clamps to min and max', () => {
    expect(fitPitch({ width: 900, height: 900, rows: 2, cols: 3, min: 30, max: 140 })).toBe(140);
    expect(fitPitch({ width: 100, height: 100, rows: 10, cols: 10, min: 30, max: 140 })).toBe(30);
  });
});

describe('rectFromDrag', () => {
  it('moves the corner with the finger and snaps to the nearest line', () => {
    expect(rectFromDrag({ rows: 0, cols: 0 }, 4 * 60 + 20, 3 * 60 - 25, 60, max)).toEqual({
      rows: 3,
      cols: 4,
    });
    expect(rectFromDrag({ rows: 3, cols: 4 }, -60, 31, 60, max)).toEqual({ rows: 4, cols: 3 });
  });
  it('always makes at least 1 × 1 and stays on the board', () => {
    expect(rectFromDrag({ rows: 2, cols: 2 }, -500, -500, 60, max)).toEqual({ rows: 1, cols: 1 });
    expect(rectFromDrag({ rows: 2, cols: 2 }, 5000, 5000, 60, max)).toEqual(max);
  });
});

describe('rectFromKey', () => {
  it('starts at 1 × 1 from an empty board', () => {
    expect(rectFromKey({ rows: 0, cols: 0 }, 'ArrowRight', max)).toEqual({ rows: 1, cols: 1 });
  });
  it('moves one cell per press, clamped', () => {
    expect(rectFromKey({ rows: 2, cols: 2 }, 'ArrowRight', max)).toEqual({ rows: 2, cols: 3 });
    expect(rectFromKey({ rows: 2, cols: 2 }, 'ArrowDown', max)).toEqual({ rows: 3, cols: 2 });
    expect(rectFromKey({ rows: 1, cols: 1 }, 'ArrowUp', max)).toEqual({ rows: 1, cols: 1 });
    expect(rectFromKey({ rows: 6, cols: 8 }, 'ArrowRight', max)).toEqual({ rows: 6, cols: 8 });
  });
  it('ignores other keys', () => {
    expect(rectFromKey({ rows: 2, cols: 2 }, 'a', max)).toBeNull();
  });
});

describe('rectToCell', () => {
  it('reaches the tapped cell', () => {
    expect(rectToCell(2, 3, max)).toEqual({ rows: 3, cols: 4 });
    expect(rectToCell(0, 0, max)).toEqual({ rows: 1, cols: 1 });
  });
});

describe('split geometry', () => {
  it('opens a gap after the split column', () => {
    expect(columnX(2, 60, 3, 20)).toBe(120);
    expect(columnX(3, 60, 3, 20)).toBe(200);
    expect(columnX(3, 60, null, 20)).toBe(180);
    expect(splitX(3, 60, 20)).toBe(190);
  });
  it('finds the nearest gap, inside 1 … cols − 1', () => {
    expect(nearestGap(splitX(4, 60, 20), 60, 9, 20)).toBe(4);
    expect(nearestGap(splitX(4, 60, 20) + 25, 60, 9, 20)).toBe(4);
    expect(nearestGap(splitX(4, 60, 20) + 35, 60, 9, 20)).toBe(5);
    expect(nearestGap(-100, 60, 9, 20)).toBe(1);
    expect(nearestGap(9999, 60, 9, 20)).toBe(8);
  });
  it('moves the split line with arrow keys', () => {
    expect(splitFromKey(null, 'ArrowLeft', 9)).toBe(8);
    expect(splitFromKey(null, 'ArrowRight', 9)).toBeNull();
    expect(splitFromKey(4, 'ArrowLeft', 9)).toBe(3);
    expect(splitFromKey(4, 'ArrowRight', 9)).toBe(5);
    expect(splitFromKey(1, 'ArrowLeft', 9)).toBeNull();
    expect(splitFromKey(8, 'ArrowRight', 9)).toBeNull();
    expect(splitFromKey(4, 'Enter', 9)).toBeNull();
  });
});

describe('thumbPitch', () => {
  it('fits the longer side', () => {
    expect(thumbPitch(3, 8, 64)).toBe(8);
    expect(thumbPitch(2, 12, 64)).toBe(5);
    expect(thumbPitch(1, 1, 64)).toBe(10);
  });
});

describe('cornerPath', () => {
  it('grows one cell at a time from 1 × 1', () => {
    expect(cornerPath({ rows: 0, cols: 0 }, { rows: 3, cols: 4 })).toEqual([
      { rows: 1, cols: 1 },
      { rows: 2, cols: 2 },
      { rows: 2, cols: 3 },
      { rows: 3, cols: 4 },
    ]);
  });
  it('ends on the target', () => {
    const path = cornerPath({ rows: 5, cols: 2 }, { rows: 2, cols: 6 });
    expect(path.at(-1)).toEqual({ rows: 2, cols: 6 });
  });
});
