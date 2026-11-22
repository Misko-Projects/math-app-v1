/**
 * Pure layout for the array-build widget (03 §5.5; 06 §1: container-relative). The array is a
 * grid of square cells of one pitch `p`; each cell holds one sprite in a box of `spriteBox(p)`,
 * drawn at the kit's ITEM_DRAW_SCALE, so neighbours never touch. A cell is never under MIN_PITCH:
 * the drawn sprite is then at least 22 px wide (kit MIN_ITEM_PX).
 *
 * The cells are a picture. What a child touches is the work pad's buttons and the board as one
 * surface (kit gridWork).
 */

import type { AgeMode } from '../../tokens/tokens';
import type { Size } from '../kit/arrange';
import { MIN_ITEM_PX } from '../kit/fives';
import { planWork, type WorkPlan } from '../kit/gridWork';
import { type AskPlan, planAsk } from '../kit/twoStep';

/** A sprite's box is this share of its cell. */
export const SPRITE_SHARE = 0.86;
export const spriteBox = (p: number): number => Math.floor(p * SPRITE_SHARE);
/** The smallest cell: its sprite box is the kit's smallest countable item (26 px). */
export const MIN_PITCH = Math.ceil(MIN_ITEM_PX / SPRITE_SHARE);
/** The largest cell: a tiny array does not turn into posters. */
export const MAX_PITCH: Readonly<Record<AgeMode, number>> = { k: 112, 'g1-up': 93 };
/** The board's border and padding, each side. */
export const FRAME = 4;
/** How far a split pulls the two parts of the array apart. */
export const SPLIT_SPACE = 18;

export type ArrayMode = 'build-dims' | 'build-total' | 'read' | 'split' | 'new-way';

export interface ArrayShape {
  mode: ArrayMode;
  maxRows: number;
  maxCols: number;
  rows?: number;
  cols?: number;
}

/** Whether the child builds the rectangle (the board shows every cell it may use). */
export const builds = (mode: ArrayMode): boolean =>
  mode === 'build-dims' || mode === 'build-total' || mode === 'new-way';

/** The cells the board draws: the whole board to build on, else the array as given. */
export function boardCells(c: ArrayShape): { rows: number; cols: number } {
  return builds(c.mode)
    ? { rows: c.maxRows, cols: c.maxCols }
    : { rows: c.rows ?? 1, cols: c.cols ?? 1 };
}

/** The work pad: four arrows to build (an inverted T), two to move the split line. */
export function padFor(mode: ArrayMode): { cols: number; rows: number } {
  if (builds(mode)) return { cols: 3, rows: 2 };
  return mode === 'split' ? { cols: 2, rows: 1 } : { cols: 0, rows: 0 };
}

const extraFor = (mode: ArrayMode): Size => ({
  w: 2 * FRAME + (mode === 'split' ? SPLIT_SPACE : 0),
  h: 2 * FRAME,
});

/** The step with the board and its pad (the build step; `room` is the kit's `buildRoom`). */
export function workPlan(c: ArrayShape, room: Size, ageMode: AgeMode): WorkPlan {
  const cells = boardCells(c);
  return planWork({
    room,
    ageMode,
    pad: padFor(c.mode),
    head: c.mode === 'new-way',
    cols: cells.cols,
    rows: cells.rows,
    extra: extraFor(c.mode),
    minCell: MIN_PITCH,
    maxCell: MAX_PITCH[ageMode],
  });
}

/** The ask step's picture of the array in `box`: no pad, nothing to touch. */
export function picturePlan(c: ArrayShape, box: Size, ageMode: AgeMode): WorkPlan {
  const cells = boardCells(c);
  return planWork({
    room: box,
    ageMode,
    pad: { cols: 0, rows: 0 },
    head: false,
    cols: cells.cols,
    rows: cells.rows,
    extra: extraFor(c.mode),
    minCell: MIN_PITCH,
    maxCell: MAX_PITCH[ageMode],
  });
}

/** The ask step: the answer control at full size, and the array as large as the rest allows. */
export function askPlanFor(
  c: ArrayShape,
  max: number,
  room: Size,
  button: Size,
  ageMode: AgeMode,
): AskPlan {
  return planAsk({
    ageMode,
    max,
    button,
    actions: c.mode === 'read' ? 1 : 2,
    room,
    pictureScore: (box) => {
      const p = picturePlan(c, box, ageMode);
      return p.fits ? p.cell : 0;
    },
  });
}

/**
 * Left edge of column `c` when a split after column `split` opens a gap of SPLIT_SPACE. Columns
 * after the split move right; with no split the space waits at the right end.
 */
export function columnX(c: number, pitch: number, split: number | null): number {
  return c * pitch + (split !== null && c >= split ? SPLIT_SPACE : 0);
}

/** Where the split line stands when it sits after column `at` (the middle of the opened gap). */
export function splitX(at: number, pitch: number): number {
  return at * pitch + SPLIT_SPACE / 2;
}

export interface Dims {
  rows: number;
  cols: number;
}

/** Intermediate rectangles for the demo's drag: one step per cell of the longer move. */
export function cornerPath(from: Dims, to: Dims): Dims[] {
  const start = from.rows === 0 || from.cols === 0 ? { rows: 1, cols: 1 } : from;
  const steps = Math.max(1, Math.abs(to.rows - start.rows), Math.abs(to.cols - start.cols));
  const out: Dims[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const f = i / steps;
    out.push({
      rows: Math.round(start.rows + (to.rows - start.rows) * f),
      cols: Math.round(start.cols + (to.cols - start.cols) * f),
    });
  }
  if (start !== from) out.unshift(start);
  return out;
}
