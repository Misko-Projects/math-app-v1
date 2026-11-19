import { describe, expect, it } from 'vitest';
import { balancedRows, fivesCell, fivesGrid, itemGap, zoneCell, zoneGrid } from './fives';
import { entrySize } from './NumberEntry';
import {
  actionsSize,
  buildRoom,
  planAsk,
  roomBox,
  STEP_GAP,
  STEPPER_MAX,
  stepperSize,
  UNBOUNDED_H,
} from './twoStep';

/** The smallest widget area (906 × 373) inside its card, and the tablet's (1226 × 493). */
const MIN = { w: 852, h: 319 };
const TABLET = { w: 1172, h: 439 };
const BUTTON = { g1: { w: 76, h: 82 }, k: { w: 96, h: 102 } };

/** A picture that is legible from 120 × 120 px up; bigger boxes score higher. */
const picture = (box: { w: number; h: number }) =>
  box.w >= 120 && box.h >= 120 ? box.w * box.h : 0;

describe('two-step rooms', () => {
  it('plans in the measured room; a host that grows gets a fixed height', () => {
    expect(roomBox({ width: 852, height: 319 })).toEqual({ w: 852, h: 319 });
    expect(roomBox({ width: 700, height: Number.POSITIVE_INFINITY })).toEqual({
      w: 700,
      h: UNBOUNDED_H,
    });
    expect(roomBox(null).h).toBe(UNBOUNDED_H);
  });

  it('the build step has the room less the action column', () => {
    expect(buildRoom(MIN, BUTTON.g1)).toEqual({ w: 852 - STEP_GAP - 76, h: 319 });
  });

  it('actions in a row or a column', () => {
    expect(actionsSize(BUTTON.g1, 2, 'column')).toEqual({ w: 76, h: 2 * 82 + 16 });
    expect(actionsSize(BUTTON.g1, 2, 'row')).toEqual({ w: 2 * 76 + 24, h: 82 });
    expect(actionsSize(BUTTON.g1, 1, 'column')).toEqual(BUTTON.g1);
  });
});

describe('planAsk (the ask step: answer control, actions, the box left for the picture)', () => {
  const plan = (max: number, ageMode: 'k' | 'g1-up', room = MIN, actions: 1 | 2 = 2) =>
    planAsk({
      ageMode,
      max,
      button: ageMode === 'k' ? BUTTON.k : BUTTON.g1,
      actions,
      room,
      pictureScore: picture,
    });

  it('everything fits the smallest area for every answer range up to 99', () => {
    for (const max of [5, 10, 12, 20, 24, 60, 99]) {
      const p = plan(max, 'g1-up');
      expect(p.fits, `0 … ${max}`).toBe(true);
      expect(p.picture, `0 … ${max} keeps a legible picture`).not.toBeNull();
    }
  });

  it('prefers the numeral tray, then the pad, and never drops a legible picture for either', () => {
    expect(plan(10, 'g1-up').entry?.kind).toBe('tray');
    // 0 … 20 as a tray leaves no room for the picture in the smallest area: the pad does.
    const twenty = plan(20, 'g1-up');
    expect(twenty.picture).not.toBeNull();
    expect(plan(60, 'g1-up').entry?.kind).toBe('pad');
    expect(plan(20, 'g1-up', TABLET).entry?.kind).toBe('tray');
  });

  it('puts Back and Check under the entered number where the pad leaves no room beside it', () => {
    const p = plan(60, 'g1-up');
    expect(p.entry).toMatchObject({ kind: 'pad', padLayout: 'beside', compact: true });
    expect(p.act).toBe('aside');
    // The picture gets what is left of the width: more than a third of the room.
    expect(p.picture?.w ?? 0).toBeGreaterThan(MIN.w / 3);
    expect(p.picture?.h).toBe(MIN.h);
  });

  it('kindergarten sizes: the stepper where neither the tray nor the pad leaves a picture', () => {
    const p = plan(20, 'k');
    expect(p.fits).toBe(true);
    expect(p.stepper).toBe(true);
    expect(p.entry).toBeNull();
    expect(p.picture).not.toBeNull();
    // A small range still gets its numeral cards.
    const small = plan(6, 'k');
    expect(small.entry?.kind).toBe('tray');
    expect(small.stepper).toBe(false);
    expect(small.picture).not.toBeNull();
  });

  it('offers the stepper only up to STEPPER_MAX', () => {
    expect(STEPPER_MAX).toBe(20);
    expect(plan(60, 'k').stepper).toBe(false);
    expect(stepperSize('k')).toEqual({ w: 172, h: 192 });
    expect(stepperSize('g1-up')).toEqual({ w: 140, h: 176 });
  });

  it("plans round a widget's own answer control (two choice cards)", () => {
    const p = planAsk({
      ageMode: 'g1-up',
      max: 0,
      control: { w: 308, h: 148 },
      button: BUTTON.g1,
      actions: 1,
      room: MIN,
      pictureScore: picture,
    });
    expect(p.fits).toBe(true);
    expect(p.entry).toBeNull();
    expect(p.stepper).toBe(false);
    expect(p.picture).not.toBeNull();
  });

  it('with no legible picture anywhere the answer still fits (Back returns to the build)', () => {
    const p = planAsk({
      ageMode: 'g1-up',
      max: 10,
      button: BUTTON.g1,
      actions: 2,
      room: MIN,
      pictureScore: () => 0,
    });
    expect(p.fits).toBe(true);
    expect(p.picture).toBeNull();
  });

  it('reports the least overflowing plan when the room is too small for any answer', () => {
    const p = plan(60, 'g1-up', { w: 200, h: 150 });
    expect(p.fits).toBe(false);
    expect(p.picture).toBeNull();
  });

  it('the planned parts add up inside the room', () => {
    for (const max of [10, 24]) {
      const p = plan(max, 'g1-up');
      if (!p.entry || p.act === 'aside') continue;
      const e = entrySize(max, p.entry, 'g1-up');
      const a = actionsSize(BUTTON.g1, 2, p.act);
      const used = e.w + STEP_GAP + a.w + (p.arrangement === 'row' ? STEP_GAP : 0);
      expect(used + (p.arrangement === 'row' ? (p.picture?.w ?? 0) : 0)).toBeLessThanOrEqual(
        MIN.w + 0.5,
      );
    }
  });
});

describe('fives (grids of countable things)', () => {
  it('rows of five with a wider gap between two fives', () => {
    const s = 30;
    const g = itemGap(s);
    const ten = fivesGrid(10, 10, s);
    expect(ten.rows).toBe(1);
    expect(ten.w).toBeGreaterThan(10 * s + 9 * g);
    expect(fivesCell(5, 10, s).x - fivesCell(4, 10, s).x).toBeGreaterThan(s + g);
    expect(fivesCell(1, 10, s).x - fivesCell(0, 10, s).x).toBe(s + g);
    expect(fivesGrid(0, 5, s)).toEqual({ cols: 0, rows: 0, w: 0, h: 0 });
    expect(fivesGrid(7, 5, s)).toMatchObject({ cols: 5, rows: 2 });
  });

  it('cells never touch: neighbours are at least a gap apart', () => {
    for (const s of [20, 28, 44, 80]) {
      const g = itemGap(s);
      expect(g).toBeGreaterThanOrEqual(4);
      for (let k = 1; k < 15; k += 1) {
        const a = zoneCell(k - 1, s, false);
        const b = zoneCell(k, s, false);
        const apart = a.y !== b.y || b.x - a.x >= s + g;
        expect(apart).toBe(true);
      }
    }
  });

  it('a zone holds its capacity in rows or in columns of five', () => {
    expect(zoneGrid(10, 20, false)).toMatchObject({ cols: 5, rows: 2 });
    expect(zoneGrid(10, 20, true)).toMatchObject({ cols: 2, rows: 5 });
    expect(zoneGrid(15, 20, false)).toMatchObject({ cols: 5, rows: 3 });
    expect(zoneGrid(3, 20, false)).toMatchObject({ cols: 3, rows: 1 });
    expect(zoneCell(5, 20, false)).toEqual({ x: 0, y: 24 });
    expect(zoneCell(5, 20, true)).toEqual({ x: 24, y: 0 });
  });

  it('balances rows of cards', () => {
    expect(balancedRows(6, 3)).toEqual([3, 3]);
    expect(balancedRows(5, 3)).toEqual([3, 2]);
    expect(balancedRows(4, 4)).toEqual([4]);
    expect(balancedRows(1, 3)).toEqual([1]);
  });
});
