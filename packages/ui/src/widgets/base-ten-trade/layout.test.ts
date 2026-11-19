import type { WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { breakGhosts, bundleGhosts, gatherBox, moveGhosts, slices, transformFrom } from './fx';
import {
  type Box,
  extent,
  growCaps,
  naturalLayout,
  placePieces,
  placeTaken,
  planCaps,
  planMat,
  stripWidth,
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
    const tight = planMat({ caps: stress, age: 'g1-up', width: 640, height: 380 });
    expect(wide.fits).toBe(true);
    expect(tight.fits).toBe(true);
    expect(wide.u).toBeLessThanOrEqual(U_MAX);
    expect(tight.u).toBeGreaterThanOrEqual(U_MIN);
    expect(tight.u).toBeLessThan(wide.u);
    expect(tight.matW).toBeLessThanOrEqual(640);
    expect(tight.totalH).toBeLessThanOrEqual(380);
  });

  it('gives K bigger trade strips and still fits, with a unit no bigger than G1', () => {
    expect(stripWidth('k')).toBeGreaterThan(stripWidth('g1-up'));
    const k = planMat({ caps: stress, age: 'k', width: 900, height: 420 });
    const g = planMat({ caps: stress, age: 'g1-up', width: 900, height: 420 });
    expect(k.fits).toBe(true);
    expect(k.u).toBeLessThanOrEqual(g.u);
  });

  it('fills the width and uses a big unit when there are few pieces', () => {
    const few = planCaps(
      cfg({
        goal: 'regroup-to',
        operation: undefined,
        regroupTarget: { hundreds: 0, tens: 2, ones: 7 },
      }),
    );
    const p = planMat({ caps: few, age: 'k', width: 900, height: 520 });
    expect(p.matW).toBe(900);
    expect(p.u).toBeGreaterThanOrEqual(26);
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
    const box = { w: p.colW.hundreds - 20, h: p.bodyH - 20 };
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
    const box = { w: p.colW.tens - 20, h: p.bodyH - 20 };
    expect(overlaps(placePieces('tens', 30, p.u, box, 30, p.rodsPerRow))).toBe(false);
    expect(growCaps(stress, stress.mat, { hundreds: 1, tens: 2, ones: 8 })).toBe(stress);
  });

  it('has room for every planned piece in each column', () => {
    const p = planMat({ caps: stress, age: 'g1-up', width: 840, height: 400 });
    for (const c of stress.columns) {
      const box = { w: p.colW[c] - 20, h: p.bodyH - 20 };
      const per = c === 'hundreds' ? p.flatsPerRow : p.rodsPerRow;
      const natural = extent(naturalLayout(c, stress.mat[c], p.u, per));
      expect(natural.w).toBeLessThanOrEqual(box.w);
      expect(natural.h).toBeLessThanOrEqual(box.h);
      expect(overlaps(placePieces(c, stress.mat[c], p.u, box, stress.mat[c], per))).toBe(false);
    }
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
