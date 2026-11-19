import type { WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { breakGhosts, bundleGhosts, gatherBox, moveGhosts, slices, transformFrom } from './fx';
import {
  answerPlaces,
  type Box,
  COL_PAD,
  digitsValue,
  extent,
  growCaps,
  itemUnit,
  lyingRods,
  naturalLayout,
  pathStates,
  placeDigits,
  placePieces,
  placeTaken,
  planCaps,
  planMat,
  stripWidth,
  U_FLOOR,
  U_MAX,
  U_MIN,
} from './layout';

type Config = WidgetConfigOf<'base-ten-trade'>;

const cfg = (over: Partial<Config>): Config => ({
  format: 'base-ten-trade',
  start: { hundreds: 0, tens: 2, ones: 7 },
  goal: 'compute',
  operation: { op: '+', operand: { hundreds: 0, tens: 1, ones: 5 } },
  showAlgorithm: false,
  thenAsk: false,
  ...over,
});

const overlaps = (boxes: readonly Box[]) =>
  boxes.some((a, i) =>
    boxes.some(
      (b, j) =>
        j > i &&
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 &&
        Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01,
    ),
  );

const inside = (b: Box, box: { w: number; h: number }) =>
  b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= box.w + 0.01 && b.y + b.h <= box.h + 0.01;

describe('planCaps', () => {
  it('plans the most pieces each column holds on the way to a sum', () => {
    const caps = planCaps(cfg({}));
    expect(caps.columns).toEqual(['hundreds', 'tens', 'ones']);
    // 7 + 5 = 12 ones before grouping; 2 + 1 + 1 tens after.
    expect(caps.mat).toEqual({ hundreds: 0, tens: 4, ones: 12 });
    expect(caps.tray).toEqual({ hundreds: 0, tens: 1, ones: 5 });
    expect(caps.taken).toBeNull();
    expect(caps.flatReachable).toBe(false);
  });

  it('borrows across zero for 304 − 128', () => {
    const caps = planCaps(
      cfg({
        start: { hundreds: 3, tens: 0, ones: 4 },
        operation: { op: '-', operand: { hundreds: 1, tens: 2, ones: 8 } },
      }),
    );
    expect(caps.mat).toEqual({ hundreds: 3, tens: 10, ones: 14 });
    expect(caps.taken).toEqual({ hundreds: 1, tens: 2, ones: 8 });
    expect(caps.tray).toBeNull();
    expect(caps.flatReachable).toBe(true);
  });

  it('cascades for 199 + 1 and keeps the larger of start and goal for regroup-to', () => {
    const cascade = planCaps(
      cfg({
        start: { hundreds: 1, tens: 9, ones: 9 },
        operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 1 } },
      }),
    );
    expect(cascade.mat).toEqual({ hundreds: 2, tens: 10, ones: 10 });
    const regroup = planCaps(
      cfg({
        goal: 'regroup-to',
        operation: undefined,
        start: { hundreds: 1, tens: 2, ones: 3 },
        regroupTarget: { hundreds: 0, tens: 12, ones: 3 },
      }),
    );
    expect(regroup.mat).toEqual({ hundreds: 1, tens: 12, ones: 3 });
  });
});

describe('layout', () => {
  it('lays ones in rows of five with a wider gap after each ten', () => {
    const boxes = naturalLayout('ones', 12, 10);
    expect(boxes[4]?.y).toBe(0);
    expect(boxes[5]?.x).toBe(0);
    const tenGapRow = (boxes[10]?.y ?? 0) - (boxes[5]?.y ?? 0);
    const rowStep = (boxes[5]?.y ?? 0) - (boxes[0]?.y ?? 0);
    expect(tenGapRow).toBeGreaterThan(rowStep);
  });

  it('keeps every piece inside its column, wrapping and then squeezing', () => {
    for (const n of [1, 9, 10, 14, 19, 25, 40]) {
      for (const kind of ['hundreds', 'tens', 'ones'] as const) {
        const box = { w: 180, h: 160 };
        const boxes = placePieces(kind, n, 12, box, 10);
        expect(boxes).toHaveLength(n);
        for (const b of boxes) expect(inside(b, box)).toBe(true);
      }
    }
  });

  it('puts the taken pieces side by side inside the nest', () => {
    const box = { w: 400, h: 90 };
    const taken = placeTaken({ hundreds: 1, tens: 2, ones: 8 }, 8, box);
    for (const c of ['hundreds', 'tens', 'ones'] as const) {
      for (const b of taken[c]) expect(inside(b, box)).toBe(true);
    }
    expect(taken.tens[0]?.x).toBeGreaterThan(taken.hundreds[0]?.x ?? 0);
    expect(taken.ones[0]?.x).toBeGreaterThan(taken.tens[1]?.x ?? 0);
  });
});

describe('planMat', () => {
  const stress = planCaps(
    cfg({
      start: { hundreds: 3, tens: 0, ones: 4 },
      operation: { op: '-', operand: { hundreds: 1, tens: 2, ones: 8 } },
    }),
  );

  it('picks the biggest unit that fits, smaller when space is tight', () => {
    const wide = planMat({ caps: stress, age: 'g1-up', width: 1100, height: 560 });
    const tight = planMat({ caps: stress, age: 'g1-up', width: 760, height: 470 });
    expect(wide.fits).toBe(true);
    expect(tight.fits).toBe(true);
    expect(wide.u).toBeLessThanOrEqual(U_MAX);
    expect(tight.u).toBeGreaterThanOrEqual(U_MIN);
    expect(tight.u).toBeLessThan(wide.u);
    expect(tight.matW).toBeLessThanOrEqual(760);
    expect(tight.totalH).toBeLessThanOrEqual(470);
  });

  it('gives K bigger trade strips and still fits, with a unit no bigger than G1', () => {
    expect(stripWidth('k')).toBeGreaterThan(stripWidth('g1-up'));
    const k = planMat({ caps: stress, age: 'k', width: 900, height: 420 });
    const g = planMat({ caps: stress, age: 'g1-up', width: 900, height: 420 });
    expect(k.fits).toBe(true);
    expect(k.u).toBeLessThanOrEqual(g.u);
  });

  it('fills the width at the one scale (U_MAX) when there are few pieces', () => {
    const few = planCaps(
      cfg({
        goal: 'regroup-to',
        operation: undefined,
        regroupTarget: { hundreds: 0, tens: 2, ones: 7 },
      }),
    );
    const p = planMat({ caps: few, age: 'k', width: 900, height: 520 });
    expect(p.matW).toBe(900);
    expect(p.u).toBe(U_MAX);
    expect(p.u).toBeLessThanOrEqual(U_MAX);
  });

  it('lays flats side by side or in rows, never piled', () => {
    const two = planCaps(
      cfg({
        start: { hundreds: 1, tens: 9, ones: 9 },
        operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 1 } },
      }),
    );
    const p = planMat({ caps: two, age: 'g1-up', width: 920, height: 520 });
    const box = { w: p.colW.hundreds - 2 * COL_PAD, h: p.bodyH - 2 * COL_PAD };
    const flats = placePieces('hundreds', 2, p.u, box, 2, p.flatsPerRow);
    expect(overlaps(flats)).toBe(false);
    for (const b of flats) expect(inside(b, box)).toBe(true);
  });

  it('grows the plan for pieces made off the expected path', () => {
    const grown = growCaps(
      stress,
      { hundreds: 0, tens: 30, ones: 4 },
      { hundreds: 0, tens: 0, ones: 0 },
    );
    expect(grown.mat.tens).toBe(30);
    const p = planMat({ caps: grown, age: 'g1-up', width: 840, height: 400 });
    const box = { w: p.colW.tens - 2 * COL_PAD, h: p.bodyH - 2 * COL_PAD };
    expect(overlaps(placePieces('tens', 30, p.u, box, 30, p.rodsPerRow))).toBe(false);
    expect(growCaps(stress, stress.mat, { hundreds: 1, tens: 2, ones: 8 })).toBe(stress);
  });

  it('has room for every planned piece in each column', () => {
    const p = planMat({ caps: stress, age: 'g1-up', width: 840, height: 400 });
    for (const c of stress.columns) {
      const box = { w: p.colW[c] - 2 * COL_PAD, h: p.bodyH - 2 * COL_PAD };
      const per = c === 'hundreds' ? p.flatsPerRow : p.rodsPerRow;
      const natural = extent(naturalLayout(c, stress.mat[c], p.u, per));
      expect(natural.w).toBeLessThanOrEqual(box.w);
      expect(natural.h).toBeLessThanOrEqual(box.h);
      expect(overlaps(placePieces(c, stress.mat[c], p.u, box, stress.mat[c], per))).toBe(false);
    }
  });
});

describe('one scale per item', () => {
  // The 1280 × 800 widget area beside a side panel with the algorithm card (see the widget).
  const space = { age: 'g1-up', width: 866, height: 548 } as const;

  it('walks the expected path: borrow across zero, then take column by column', () => {
    const c = cfg({
      start: { hundreds: 3, tens: 0, ones: 4 },
      operation: { op: '-', operand: { hundreds: 1, tens: 2, ones: 8 } },
    });
    const path = pathStates(c);
    expect(path.map((s) => s.mat)).toEqual([
      { hundreds: 3, tens: 0, ones: 4 },
      { hundreds: 2, tens: 10, ones: 4 },
      { hundreds: 2, tens: 9, ones: 14 },
      { hundreds: 2, tens: 9, ones: 6 },
      { hundreds: 2, tens: 7, ones: 6 },
      { hundreds: 1, tens: 7, ones: 6 },
    ]);
    expect(path.at(-1)?.taken).toEqual({ hundreds: 1, tens: 2, ones: 8 });
    const add = pathStates(cfg({}));
    expect(add[0]?.pending).toEqual({ hundreds: 0, tens: 1, ones: 5 });
    expect(add.at(-1)).toEqual({
      mat: { hundreds: 0, tens: 4, ones: 2 },
      pending: null,
      taken: null,
    });
  });

  it('draws 20 px pieces for ordinary items and the heaviest too, once its algorithm states the problem', () => {
    const add = cfg({});
    expect(itemUnit({ ...space, base: planCaps(add), path: pathStates(add) })).toBe(U_MAX);
    const heavy = cfg({
      start: { hundreds: 3, tens: 0, ones: 4 },
      operation: { op: '-', operand: { hundreds: 1, tens: 2, ones: 8 } },
      showAlgorithm: true,
      thenAsk: true,
    });
    // No expression row (the algorithm card states the problem): the mat gets the full height.
    const tall = { ...space, height: 648 };
    expect(itemUnit({ ...tall, base: planCaps(heavy), path: pathStates(heavy) })).toBe(U_MAX);
    expect(U_FLOOR).toBeLessThan(U_MAX);
  });

  it('lays taken rods down in the nest (low and wide)', () => {
    const rods = lyingRods(2, 20);
    expect(rods[0]).toEqual({ x: 0, y: 0, w: 200, h: 20 });
    expect(overlaps(rods)).toBe(false);
  });

  it('reads the result row as one number, ones box first', () => {
    expect(digitsValue([null, null, null])).toBeNull();
    expect(digitsValue([null, 7, 6])).toBe(76);
    expect(digitsValue([1, 7, 6])).toBe(176);
    expect(digitsValue([1, null, 6])).toBeNull();
    expect(digitsValue([null, 7, null])).toBeNull();
    // Internal and trailing zeros, and zero itself.
    expect(digitsValue([3, 0, 4])).toBe(304);
    expect(digitsValue([1, 0, 0])).toBe(100);
    expect(digitsValue([null, null, 0])).toBe(0);
    expect(digitsValue([1, 0, 0, 0])).toBe(1000);
    expect(digitsValue([null, 1, 5, 0, 0])).toBe(1500);
  });

  it('every result from 0 to 999 can be written in the result row', () => {
    for (let v = 0; v <= 999; v++) {
      const row = placeDigits(v, 3).map((d) => (d === '' ? null : Number(d)));
      expect(digitsValue(row)).toBe(v);
    }
  });

  it('sizes the answer entry from the operands, never the result', () => {
    const plus = (s: number, o: number) =>
      answerPlaces(
        cfg({
          start: { hundreds: Math.floor(s / 100), tens: Math.floor(s / 10) % 10, ones: s % 10 },
          operation: {
            op: '+',
            operand: { hundreds: Math.floor(o / 100), tens: Math.floor(o / 10) % 10, ones: o % 10 },
          },
        }),
      );
    // 3-digit + 2-digit: 4 places whether the sum stays under 1000 or reaches it.
    expect(plus(123, 45)).toBe(4);
    expect(plus(990, 10)).toBe(4);
    expect(plus(500, 500)).toBe(4);
    // Two 2-digit addends: 3 places (the mat's three), with or without a carry into the hundreds.
    expect(plus(27, 15)).toBe(3);
    expect(plus(95, 5)).toBe(3);
    // 1200 + 300 (twelve hundreds on the mat): 5 places.
    expect(
      answerPlaces(
        cfg({
          start: { hundreds: 12, tens: 0, ones: 0 },
          operation: { op: '+', operand: { hundreds: 3, tens: 0, ones: 0 } },
        }),
      ),
    ).toBe(5);
    // `−`: as long as the start, at least 3.
    const minus = (h: number, t: number, o: number) =>
      answerPlaces(
        cfg({
          start: { hundreds: h, tens: t, ones: o },
          operation: { op: '-', operand: { hundreds: 0, tens: 1, ones: 5 } },
        }),
      );
    expect(minus(0, 4, 2)).toBe(3);
    expect(minus(3, 0, 4)).toBe(3);
    expect(minus(12, 0, 0)).toBe(4);
  });

  it('writes a number in place columns, highest first', () => {
    expect(placeDigits(1200, 4)).toEqual(['1', '2', '0', '0']);
    expect(placeDigits(27, 4)).toEqual(['', '', '2', '7']);
    expect(placeDigits(0, 3)).toEqual(['', '', '0']);
    expect(placeDigits(304, 3)).toEqual(['3', '0', '4']);
  });
});

describe('fx', () => {
  const rod: Box = { x: 100, y: 50, w: 10, h: 100 };

  it('cuts a rod into ten units and a flat into ten rods', () => {
    expect(slices(rod)[3]).toEqual({ x: 100, y: 80, w: 10, h: 10 });
    expect(slices({ x: 0, y: 0, w: 100, h: 100 })[2]).toEqual({ x: 20, y: 0, w: 10, h: 100 });
  });

  it('draws a ghost over its start with a translate (and scale only when sizes differ)', () => {
    expect(transformFrom({ x: 10, y: 20, w: 5, h: 5 }, { x: 0, y: 0, w: 5, h: 5 })).toBe(
      'translate(10px, 20px)',
    );
    expect(transformFrom({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 5, h: 5 })).toContain(
      'scale(2, 2)',
    );
  });

  it('breaks one piece into ten ghosts that end at their places, within 600–900 ms', () => {
    const dests = Array.from({ length: 10 }, (_, i) => ({ x: 300 + i * 12, y: 60, w: 10, h: 10 }));
    const ghosts = breakGhosts('tens', 'ones', rod, dests);
    expect(ghosts).toHaveLength(11);
    for (const g of ghosts.slice(1)) {
      expect(g.keyframes.at(-1)?.transform).toBe('translate(0px, 0px)');
      expect(g.delay + g.duration).toBeGreaterThanOrEqual(600);
      expect(g.delay + g.duration).toBeLessThanOrEqual(900);
      for (const k of g.keyframes) {
        expect(Object.keys(k).every((p) => ['transform', 'opacity', 'offset'].includes(p))).toBe(
          true,
        );
      }
    }
  });

  it('bundles ten ghosts into the new piece, gathered inside the bounds', () => {
    const units = Array.from({ length: 10 }, (_, i) => ({
      x: 300 + (i % 5) * 12,
      y: 60 + Math.floor(i / 5) * 12,
      w: 10,
      h: 10,
    }));
    const bounds = { x: 0, y: 0, w: 1000, h: 600 };
    const g = gatherBox(units, 'tens', bounds);
    expect(g).toMatchObject({ w: 10, h: 100 });
    expect(g.y).toBeGreaterThanOrEqual(0);
    const ghosts = bundleGhosts('ones', 'tens', units, rod, bounds);
    expect(ghosts).toHaveLength(11);
    expect(ghosts.at(-1)?.kind).toBe('tens');
    expect(ghosts.at(-1)?.keyframes.at(-1)?.opacity).toBe(1);
  });

  it('moves pieces one after another', () => {
    const ghosts = moveGhosts('ones', [rod, rod], [rod, rod]);
    expect(ghosts[1]?.delay).toBeGreaterThan(ghosts[0]?.delay ?? 0);
  });
});
