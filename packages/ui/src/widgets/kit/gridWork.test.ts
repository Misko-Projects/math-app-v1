import { describe, expect, it } from 'vitest';
import { MIN_TARGET_PX, TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import {
  cellAt,
  lineAt,
  NOTE_LINE_H,
  NOTE_LINES,
  PANEL_GAP,
  PANEL_HEAD_H,
  padBox,
  panelBox,
  planWork,
  type WorkInput,
} from './gridWork';
import { buildRoom, STEP_GAP } from './twoStep';

/** The smallest widget area (906 × 373) inside its card. */
const ROOM = { w: 852, h: 319 };
const BUTTON = { 'g1-up': { w: 76, h: 82 }, k: { w: 96, h: 102 } } as const;

const input = (over: Partial<WorkInput> = {}): WorkInput => ({
  room: buildRoom(ROOM, BUTTON['g1-up']),
  ageMode: 'g1-up',
  pad: { cols: 3, rows: 2 },
  head: false,
  cols: 5,
  rows: 5,
  extra: { w: 8, h: 8 },
  minCell: 31,
  maxCell: 93,
  ...over,
});

describe('gridWork: the pad and the panel', () => {
  it('pad buttons are full targets, the target gap apart, with room for the ledge', () => {
    for (const ageMode of ['g1-up', 'k'] as const) {
      const t = TARGET_PX[ageMode].icon;
      expect(t).toBeGreaterThanOrEqual(MIN_TARGET_PX[ageMode]);
      const one = padBox(ageMode, 1, 1);
      const pad = padBox(ageMode, 3, 2);
      expect(pad.w).toBe(3 * t + 2 * TARGET_GAP_PX);
      // The second row starts the target gap below the first row's 6 px ledge.
      expect(pad.h - one.h).toBe(t + TARGET_GAP_PX + 6);
    }
  });

  it('the panel holds the head line, the pad and two note lines', () => {
    const pad = padBox('g1-up', 2, 1);
    const plain = panelBox(pad, false);
    expect(plain.w).toBe(pad.w);
    expect(plain.h).toBe(pad.h + PANEL_GAP + NOTE_LINES * NOTE_LINE_H);
    expect(panelBox(pad, true).h - plain.h).toBe(PANEL_HEAD_H + PANEL_GAP);
    expect(panelBox(padBox('k', 3, 2), false).w).toBe(padBox('k', 3, 2).w);
  });

  it('every panel fits the smallest area, at both sizes, head line or not', () => {
    for (const ageMode of ['g1-up', 'k'] as const) {
      for (const head of [false, true]) {
        expect(panelBox(padBox(ageMode, 3, 2), head).h).toBeLessThanOrEqual(ROOM.h);
      }
    }
  });
});

describe('gridWork: planWork', () => {
  it('gives the grid the largest whole cell that fits beside the panel', () => {
    const p = planWork(input());
    expect(p.fits).toBe(true);
    // The height binds: (319 − 8) / 5.
    expect(p.cell).toBe(62);
    expect(p.board).toEqual({ w: 5 * 62 + 8, h: 5 * 62 + 8 });
    expect(p.width).toBe(p.panel.w + STEP_GAP + p.board.w);
    expect(p.height).toBeLessThanOrEqual(ROOM.h);
  });

  it('never draws a cell larger than maxCell, and keeps the surface a full target', () => {
    const p = planWork(input({ cols: 1, rows: 1, maxCell: 40 }));
    expect(p.cell).toBe(40);
    expect(p.board).toEqual({ w: 64, h: 64 });
    expect(planWork(input({ cols: 1, rows: 1, maxCell: 40, ageMode: 'k' })).board.w).toBe(80);
  });

  it('a picture has no panel and no target floor', () => {
    const p = planWork(input({ pad: { cols: 0, rows: 0 }, cols: 1, rows: 1, maxCell: 40 }));
    expect(p.panel).toEqual({ w: 0, h: 0 });
    expect(p.board).toEqual({ w: 48, h: 48 });
    expect(p.width).toBe(48);
  });

  it('reports a grid that cannot fit, at the smallest cell', () => {
    const p = planWork(input({ cols: 30, rows: 12 }));
    expect(p.fits).toBe(false);
    expect(p.cell).toBe(31);
    // The width alone can fail too.
    expect(planWork(input({ cols: 30, rows: 1 })).fits).toBe(false);
  });
});

describe('gridWork: where a finger is', () => {
  it('cellAt clamps a point into the grid', () => {
    expect(cellAt(0, 30, 5)).toBe(0);
    expect(cellAt(29.9, 30, 5)).toBe(0);
    expect(cellAt(30, 30, 5)).toBe(1);
    expect(cellAt(-400, 30, 5)).toBe(0);
    expect(cellAt(9999, 30, 5)).toBe(4);
  });

  it('lineAt picks the nearest inner line, never an edge', () => {
    expect(lineAt(0, 30, 5)).toBe(1);
    expect(lineAt(44, 30, 5)).toBe(1);
    expect(lineAt(46, 30, 5)).toBe(2);
    expect(lineAt(9999, 30, 5)).toBe(4);
  });
});
