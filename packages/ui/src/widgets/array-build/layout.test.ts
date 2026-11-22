import { ARRAY_SIDE_MAX, arrayAnswerMax } from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { buildRoom } from '../kit/twoStep';
import {
  type ArrayMode,
  type ArrayShape,
  askPlanFor,
  columnX,
  cornerPath,
  MIN_PITCH,
  picturePlan,
  SPLIT_SPACE,
  splitX,
  spriteBox,
  workPlan,
} from './layout';

/** The smallest widget area (906 × 373) inside its card: 3 px border and 24 px padding a side. */
const ROOM = { w: 852, h: 319 };
/** The tablet's widget area (1226 × 493) inside its card. */
const TABLET = { w: 1172, h: 439 };
/** The compact action button as measured (kit `useActionSize`: the 6 px ledge is included). */
const BUTTON = { 'g1-up': { w: 76, h: 82 }, k: { w: 96, h: 102 } } as const;
const AGES = ['g1-up', 'k'] as const;
const BUILD: ArrayMode[] = ['build-dims', 'build-total', 'new-way'];

describe('array-build layout in the smallest area (906 × 373)', () => {
  it('a cell of the smallest pitch holds a countable sprite', () => {
    expect(spriteBox(MIN_PITCH)).toBeGreaterThanOrEqual(26);
  });

  it('fits every board of the supported domain with its pad, at both sizes', () => {
    for (const ageMode of AGES) {
      const room = buildRoom(ROOM, BUTTON[ageMode]);
      for (const mode of BUILD) {
        for (let maxRows = 1; maxRows <= ARRAY_SIDE_MAX; maxRows += 1) {
          for (let maxCols = 1; maxCols <= ARRAY_SIDE_MAX; maxCols += 1) {
            const what = `${mode} ${maxRows} × ${maxCols} ${ageMode}`;
            const p = workPlan({ mode, maxRows, maxCols }, room, ageMode);
            expect(p.fits, what).toBe(true);
            expect(p.cell, what).toBeGreaterThanOrEqual(MIN_PITCH);
            // The board is one target for a finger.
            expect(Math.min(p.board.w, p.board.h), what).toBeGreaterThanOrEqual(
              MIN_TARGET_PX[ageMode],
            );
          }
        }
      }
    }
  });

  it('fits every array to split with its pad, at both sizes', () => {
    for (const ageMode of AGES) {
      const room = buildRoom(ROOM, BUTTON[ageMode]);
      for (let rows = 1; rows <= ARRAY_SIDE_MAX; rows += 1) {
        for (let cols = 2; cols <= ARRAY_SIDE_MAX; cols += 1) {
          const c: ArrayShape = { mode: 'split', maxRows: 10, maxCols: 10, rows, cols };
          expect(workPlan(c, room, ageMode).fits, `split ${rows} × ${cols} ${ageMode}`).toBe(true);
        }
      }
    }
  });

  it('the ask step shows every array beside every answer control, at both sizes', () => {
    for (const ageMode of AGES) {
      for (const mode of ['read', 'split'] as const) {
        for (let rows = 1; rows <= ARRAY_SIDE_MAX; rows += 1) {
          for (let cols = mode === 'split' ? 2 : 1; cols <= ARRAY_SIDE_MAX; cols += 1) {
            // The smallest and the largest board this array can sit on: both answer ranges.
            for (const board of [
              { maxRows: rows, maxCols: cols },
              { maxRows: ARRAY_SIDE_MAX, maxCols: ARRAY_SIDE_MAX },
            ]) {
              // The kit's number pad at kindergarten size does not fit this area (a known kit
              // limit); kindergarten sizes are checked where the tray or the stepper answers.
              if (ageMode === 'k' && arrayAnswerMax(board) > 20) continue;
              const c: ArrayShape = { mode, ...board, rows, cols };
              const what = `${mode} ${rows} × ${cols} of ${board.maxRows} × ${board.maxCols} ${ageMode}`;
              const plan = askPlanFor(c, arrayAnswerMax(board), ROOM, BUTTON[ageMode], ageMode);
              expect(plan.fits, what).toBe(true);
              expect(plan.picture, what).not.toBeNull();
              const pic = picturePlan(c, plan.picture as { w: number; h: number }, ageMode);
              expect(pic.fits, what).toBe(true);
              expect(pic.cell, what).toBeGreaterThanOrEqual(MIN_PITCH);
            }
          }
        }
      }
    }
  });

  it('uses the tablet room: a small array is drawn larger there', () => {
    const c: ArrayShape = { mode: 'build-dims', maxRows: 5, maxCols: 5 };
    const small = workPlan(c, buildRoom(ROOM, BUTTON['g1-up']), 'g1-up');
    const large = workPlan(c, buildRoom(TABLET, BUTTON['g1-up']), 'g1-up');
    expect(large.cell).toBeGreaterThan(small.cell);
    expect(large.fits).toBe(true);
  });

  it('says so when a board cannot fit (a room far too small)', () => {
    const p = workPlan({ mode: 'build-dims', maxRows: 10, maxCols: 10 }, { w: 300, h: 200 }, 'k');
    expect(p.fits).toBe(false);
    expect(p.cell).toBe(MIN_PITCH);
  });
});

describe('array-build geometry', () => {
  it('a split pulls the columns after it apart; the line stands in the gap', () => {
    expect(columnX(2, 40, null)).toBe(80);
    expect(columnX(1, 40, 2)).toBe(40);
    expect(columnX(2, 40, 2)).toBe(80 + SPLIT_SPACE);
    expect(splitX(2, 40)).toBe(80 + SPLIT_SPACE / 2);
  });

  it('the demo drags the rectangle out one cell at a time', () => {
    expect(cornerPath({ rows: 0, cols: 0 }, { rows: 2, cols: 3 })).toEqual([
      { rows: 1, cols: 1 },
      { rows: 2, cols: 2 },
      { rows: 2, cols: 3 },
    ]);
    expect(cornerPath({ rows: 3, cols: 3 }, { rows: 1, cols: 3 }).at(-1)).toEqual({
      rows: 1,
      cols: 3,
    });
  });
});
