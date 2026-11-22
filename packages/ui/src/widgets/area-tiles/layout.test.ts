import {
  AREA_SIDE_MAX,
  AREA_WORK_H_MAX,
  AREA_WORK_W_MAX,
  areaAnswerMax,
} from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { buildRoom } from '../kit/twoStep';
import {
  type AreaShape,
  askPlanFor,
  cutLines,
  firstLine,
  innerGridSegments,
  lineFromStroke,
  lineNear,
  MIN_CELL,
  MIN_WORK_CELL,
  nextCell,
  nextLine,
  outlineSegments,
  picturePlan,
  regionCells,
  rowCounts,
  splitSegments,
  workPlan,
} from './layout';

/** The smallest widget area (906 × 373) inside its card: 3 px border and 24 px padding a side. */
const ROOM = { w: 852, h: 319 };
/** The compact action button as measured (kit `useActionSize`: the 6 px ledge is included). */
const BUTTON = { 'g1-up': { w: 76, h: 82 }, k: { w: 96, h: 102 } } as const;
const AGES = ['g1-up', 'k'] as const;

const rect = (w: number, h: number) => ({ w, h, mask: '1'.repeat(w * h) });
/** An L: a 4 × 3 box without the last two squares of its top row. */
const L = { w: 4, h: 3, mask: '110011111111' };

describe('area-tiles layout in the smallest area (906 × 373)', () => {
  it('fits every region a child works on, with its pad, at both sizes', () => {
    for (const ageMode of AGES) {
      const room = buildRoom(ROOM, BUTTON[ageMode]);
      for (const mode of ['tile', 'decompose', 'partition'] as const) {
        for (let w = 1; w <= AREA_WORK_W_MAX; w += 1) {
          for (let h = 1; h <= AREA_WORK_H_MAX; h += 1) {
            const what = `${mode} ${w} × ${h} ${ageMode}`;
            const p = workPlan({ mode, region: rect(w, h), sideLabels: false }, room, ageMode);
            expect(p.fits, what).toBe(true);
            expect(p.cell, what).toBeGreaterThanOrEqual(MIN_WORK_CELL);
            expect(Math.min(p.board.w, p.board.h), what).toBeGreaterThanOrEqual(
              MIN_TARGET_PX[ageMode],
            );
          }
        }
      }
    }
  });

  it('the ask step shows every region beside every answer control, labels or not', () => {
    for (const ageMode of AGES) {
      for (const mode of ['count', 'multiply', 'tile', 'decompose'] as const) {
        const read = mode === 'count' || mode === 'multiply';
        const wMax = read ? AREA_SIDE_MAX : AREA_WORK_W_MAX;
        const hMax = read ? AREA_SIDE_MAX : AREA_WORK_H_MAX;
        for (let w = 1; w <= wMax; w += 1) {
          for (let h = 1; h <= hMax; h += 1) {
            const max = areaAnswerMax({ region: rect(w, h) });
            // The kit's number pad at kindergarten size does not fit this area (a known kit
            // limit); kindergarten sizes are checked where the tray or the stepper answers.
            if (ageMode === 'k' && max > 20) continue;
            for (const sideLabels of [false, true]) {
              const c: AreaShape = { mode, region: rect(w, h), sideLabels };
              const what = `${mode} ${w} × ${h} labels ${sideLabels} ${ageMode}`;
              const plan = askPlanFor(c, max, ROOM, BUTTON[ageMode], ageMode);
              expect(plan.fits, what).toBe(true);
              expect(plan.picture, what).not.toBeNull();
              const pic = picturePlan(c, plan.picture as { w: number; h: number }, ageMode);
              expect(pic.fits, what).toBe(true);
              expect(pic.cell, what).toBeGreaterThanOrEqual(MIN_CELL);
            }
          }
        }
      }
    }
  });

  it('says so when a region cannot fit (a room far too small)', () => {
    const c: AreaShape = { mode: 'tile', region: rect(10, 6), sideLabels: false };
    expect(workPlan(c, { w: 400, h: 200 }, 'g1-up').fits).toBe(false);
  });
});

describe('area-tiles geometry', () => {
  it('lists the cells and the squares in each row', () => {
    expect(regionCells(L)).toHaveLength(10);
    expect(rowCounts(L)).toEqual([2, 4, 4]);
  });

  it('outlines an L with six sides, and grids only its inside', () => {
    expect(outlineSegments(L, 10)).toHaveLength(6);
    // Inside lines: across after rows 1 and 2 (the first only under the two top squares), and
    // down after columns 1, 2 and 3.
    expect(innerGridSegments(rect(2, 2), 10)).toHaveLength(2);
    expect(innerGridSegments(L, 10).length).toBeGreaterThanOrEqual(5);
  });

  it('a split line shows only where it cuts the region', () => {
    expect(splitSegments(L, 'v', 2, 10)).toEqual([{ x1: 20, y1: 10, x2: 20, y2: 30 }]);
    expect(splitSegments(L, 'h', 1, 10)).toEqual([{ x1: 0, y1: 10, x2: 20, y2: 10 }]);
  });

  it('the cell cursor steps over a notch and stops at the region’s end', () => {
    expect(nextCell(L, 1, 1, 'right')).toEqual([1, 2]);
    expect(nextCell(L, 0, 1, 'right')).toBeNull();
    expect(nextCell(L, 0, 0, 'left')).toBeNull();
    expect(nextCell(L, 1, 3, 'up')).toBeNull();
    // Over a gap: a U's two arms.
    const U = { w: 3, h: 2, mask: '101111' };
    expect(nextCell(U, 0, 0, 'right')).toEqual([0, 2]);
  });

  it('the line cursor walks the lines of one kind and turns to the other', () => {
    expect(cutLines(L)).toHaveLength(5);
    expect(cutLines(rect(1, 3))).toEqual([
      { dir: 'h', at: 1 },
      { dir: 'h', at: 2 },
    ]);
    expect(firstLine(L)).toEqual({ dir: 'v', at: 2 });
    expect(firstLine(rect(1, 3))).toEqual({ dir: 'h', at: 1 });
    expect(firstLine(rect(1, 1))).toBeNull();
    const none = { v: null, h: null };
    expect(nextLine(L, { dir: 'v', at: 2 }, 'right', none)).toEqual({ dir: 'v', at: 3 });
    expect(nextLine(L, { dir: 'v', at: 3 }, 'right', none)).toBeNull();
    expect(nextLine(L, { dir: 'v', at: 2 }, 'down', none)).toEqual({ dir: 'h', at: 1 });
    expect(nextLine(L, { dir: 'h', at: 1 }, 'left', { v: 3, h: 1 })).toEqual({ dir: 'v', at: 3 });
    expect(nextLine(rect(1, 3), { dir: 'h', at: 1 }, 'left', none)).toBeNull();
  });

  it('a finger’s stroke draws the nearest line of its direction', () => {
    const down = lineFromStroke(L, { x: 58, y: 10 }, { x: 66, y: 110 }, 40);
    expect(down).toEqual({ dir: 'v', at: 2 });
    const across = lineFromStroke(L, { x: 5, y: 70 }, { x: 150, y: 86 }, 40);
    expect(across).toEqual({ dir: 'h', at: 2 });
    expect(lineFromStroke(rect(1, 3), { x: 5, y: 0 }, { x: 8, y: 90 }, 40)).toBeNull();
    expect(lineNear(L, { x: 118, y: 60 }, 40)).toEqual({ dir: 'v', at: 3 });
    expect(lineNear(rect(1, 1), { x: 1, y: 1 }, 40)).toBeNull();
  });
});
