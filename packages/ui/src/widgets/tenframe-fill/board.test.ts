import { describe, expect, it } from 'vitest';
import type { ConfigFor } from '../types';
import {
  applyOp,
  COLOR_A,
  COLOR_B,
  firstEmpty,
  initialBoard,
  placeCounter,
  prefilledLocked,
  removeCounter,
  responseFor,
  supplySize,
  total,
  trayColor,
} from './board';

const cfg = (over: Partial<ConfigFor<'tenframe-fill'>>): ConfigFor<'tenframe-fill'> => ({
  format: 'tenframe-fill',
  frames: 1,
  size: 10,
  prefilled: [],
  goal: 'show-n',
  n: 6,
  requireStandardFill: false,
  thenAsk: null,
  skin: 'frame',
  ...over,
});

const add63 = cfg({
  prefilled: [{ frame: 0, color: 'a', count: 6 }],
  goal: 'add',
  a: 6,
  b: 3,
  thenAsk: 'total',
});

describe('tenframe-fill board', () => {
  it('numbers prefilled counters first (counter-0 … a − 1), in reading order', () => {
    const b = initialBoard(add63);
    expect(b.cells[0]).toEqual([1, 1, 1, 1, 1, 1, 0, 0, 0, 0]);
    expect(b.ids[0]).toEqual([0, 1, 2, 3, 4, 5, null, null, null, null]);
  });

  it('the tray holds b counters of colour b for add, every free cell otherwise', () => {
    expect(supplySize(add63)).toBe(3);
    expect(trayColor(add63)).toBe(COLOR_B);
    expect(supplySize(cfg({ frames: 2 }))).toBe(20);
    expect(trayColor(cfg({}))).toBe(COLOR_A);
    expect(prefilledLocked(add63)).toBe(true);
    expect(prefilledLocked(cfg({ goal: 'subtract' }))).toBe(false);
  });

  it('places in any empty cell, or the next standard cell when that order is required', () => {
    const b = initialBoard(cfg({}));
    const free = placeCounter(b, { frame: 0, index: 7 }, 0, COLOR_A, false);
    expect(free.cells[0]?.[7]).toBe(COLOR_A);
    const std = placeCounter(b, { frame: 0, index: 7 }, 0, COLOR_A, true);
    expect(std.cells[0]?.[0]).toBe(COLOR_A);
    expect(std.cells[0]?.[7]).toBe(0);
    // An occupied cell takes nothing.
    expect(placeCounter(free, { frame: 0, index: 7 }, 1, COLOR_A, false)).toBe(free);
    expect(firstEmpty(std.cells)).toEqual({ frame: 0, index: 1 });
    expect(removeCounter(free, 0).cells[0]?.[7]).toBe(0);
  });

  it('demo ops go through the model and keep counter identities', () => {
    const b = initialBoard(add63);
    const placed = applyOp(
      add63,
      b,
      { op: 'place', args: { frame: 0, count: 3, color: 'b' } },
      [6, 7, 8],
    );
    expect(placed.board.cells[0]).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2, 0]);
    expect(placed.moves.map((m) => m.id)).toEqual([6, 7, 8]);
    expect(placed.moves.every((m) => m.from === 'tray')).toBe(true);

    const removed = applyOp(
      add63,
      placed.board,
      { op: 'remove', args: { frame: 0, count: 1 } },
      [],
    );
    expect(removed.moves).toEqual([{ id: 8, from: { frame: 0, index: 8 }, to: 'tray', color: 0 }]);
    expect(total(removed.board.cells)).toBe(8);
  });

  it('move-counters pairs the counters that leave a frame with the cells they land in', () => {
    const two = cfg({ frames: 2, prefilled: [{ frame: 0, color: 'a', count: 7 }] });
    const moved = applyOp(
      two,
      initialBoard(two),
      {
        op: 'move-counters',
        args: { fromFrame: 0, toFrame: 1, count: 2 },
      },
      [],
    );
    expect(moved.board.cells[0]?.filter(Boolean)).toHaveLength(5);
    expect(moved.board.cells[1]?.slice(0, 2)).toEqual([1, 1]);
    expect(moved.moves.map((m) => [m.id, m.to])).toEqual([
      [5, { frame: 1, index: 0 }],
      [6, { frame: 1, index: 1 }],
    ]);
  });

  it('responds { cells, value } through the model', () => {
    const b = initialBoard(add63);
    expect(responseFor(add63, b.cells, 9)).toEqual({
      kind: 'state',
      value: { cells: [[1, 1, 1, 1, 1, 1, 0, 0, 0, 0]], value: 9 },
    });
    expect(responseFor(add63, b.cells, null)).toEqual({
      kind: 'state',
      value: { cells: [[1, 1, 1, 1, 1, 1, 0, 0, 0, 0]] },
    });
  });
});
