// Place-value disks on the base-ten-trade mat (03 §5.5, K02): with hundreds in play every piece is
// a disk of one size, labelled with its value, five a row. The mat of a regroup has the widget's
// whole width ("check" ends the problem row), so the disks are as large as the room allows.
import type { Hto } from '@number-island/engine';
import type { WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { breakGhosts, bundleGhosts } from './fx';
import {
  type Box,
  COL_PAD,
  chooseSide,
  DISK_FLOOR,
  DISK_MAX,
  DISK_MIN,
  extent,
  itemFit,
  naturalLayout,
  nestInner,
  pathStates,
  placePieces,
  placeTaken,
  planCaps,
  planMat,
  ROOT_PAD_Y,
  ROW_GAP,
  sideLayout,
  sideWidth,
  spacing,
  stateCaps,
  U_FLOOR,
  U_MAX,
  unitRange,
} from './layout';

type Config = WidgetConfigOf<'base-ten-trade'>;

const hto = (hundreds: number, tens: number, ones: number): Hto => ({ hundreds, tens, ones });
const regroup = (start: Hto, regroupTarget: Hto): Config => ({
  format: 'base-ten-trade',
  start,
  goal: 'regroup-to',
  regroupTarget,
  showAlgorithm: false,
  thenAsk: false,
});
const compute = (op: '+' | '-', start: Hto, operand: Hto): Config => ({
  format: 'base-ten-trade',
  start,
  goal: 'compute',
  operation: { op, operand },
  showAlgorithm: false,
  thenAsk: true,
});

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const anyOverlap = (boxes: readonly Box[]) =>
  boxes.some((a, i) => boxes.some((b, j) => j > i && overlap(a, b)));

/** The Practice Pier's room (the widget's box), at the two supported viewports. */
const ROOMS = [
  ['960 × 600', { w: 858, h: 358 }],
  ['1280 × 800', { w: 1178, h: 558 }],
] as const;
/** The widget's side padding (base-ten-trade.css: 4 px each side). */
const PAD_X = 8;

/** A regroup of disks in a room: the side layout the widget takes, and the item's fit. */
function regroupFit(c: Config, room: { w: number; h: number }) {
  const base = planCaps(c);
  const path = pathStates(c);
  const { side, width } = chooseSide({
    checkInRow: true,
    age: 'g1-up',
    goal: 'regroup-to',
    showWork: false,
    thenAsk: false,
    answerInWork: false,
    places: 3,
    budget: room.h,
    contentW: room.w - PAD_X,
    parts: { pad: 0, check: 150, card: 0 },
    base,
    path,
  });
  return {
    base,
    path,
    side,
    width,
    fit: itemFit({ age: 'g1-up', width, height: side.spaceH, base, path }),
  };
}

describe('which mats draw disks', () => {
  it('a mat with hundreds in play, and no other', () => {
    expect(planCaps(regroup(hto(2, 5, 3), hto(1, 15, 3))).disks).toBe(true);
    expect(planCaps(regroup(hto(0, 10, 0), hto(1, 0, 0))).disks).toBe(true);
    expect(planCaps(compute('+', hto(0, 5, 7), hto(0, 6, 8))).disks).toBe(true);
    expect(planCaps(regroup(hto(0, 3, 4), hto(0, 2, 14))).disks).toBeUndefined();
    expect(planCaps(compute('+', hto(0, 3, 7), hto(0, 2, 5))).disks).toBeUndefined();
  });

  it('a disk is DISK_MAX wide when the room allows, never under DISK_MIN', () => {
    expect(unitRange(true)).toEqual({ max: DISK_MAX, floor: DISK_FLOOR, min: DISK_MIN });
    expect(unitRange()).toEqual({ max: U_MAX, floor: U_FLOOR, min: 8 });
    expect(unitRange(undefined)).toEqual(unitRange(false));
  });
});

describe('disks in a column', () => {
  it.each(['hundreds', 'tens', 'ones'] as const)(
    '%s: one size, five a row, a gap after ten',
    (kind) => {
      const u = 40;
      const boxes = naturalLayout(kind, 19, u, 10, true);
      expect(boxes).toHaveLength(19);
      for (const b of boxes) expect([b.w, b.h]).toEqual([u, u]);
      expect(anyOverlap(boxes)).toBe(false);
      // Rows of five: the sixth starts the second row, under the first.
      expect(boxes[5]?.x).toBe(boxes[0]?.x);
      expect(boxes[4]?.y).toBe(boxes[0]?.y);
      const s = spacing(u, true);
      expect((boxes[1]?.x ?? 0) - (boxes[0]?.x ?? 0)).toBe(u + s.unit);
      // The second ten sits a little apart from the first.
      const rowStep = (boxes[5]?.y ?? 0) - (boxes[0]?.y ?? 0);
      expect((boxes[10]?.y ?? 0) - (boxes[5]?.y ?? 0)).toBe(rowStep + s.ten);
      expect(extent(boxes).w).toBe(5 * u + 4 * s.unit);
    },
  );

  it('proportional pieces are unchanged without the flag', () => {
    expect(naturalLayout('tens', 3, 20)).toEqual(naturalLayout('tens', 3, 20, 10, false));
    expect(naturalLayout('tens', 1, 20)[0]).toMatchObject({ w: 20, h: 200 });
    expect(naturalLayout('hundreds', 1, 20)[0]).toMatchObject({ w: 200, h: 200 });
  });

  it('places them inside the column, the planned block centred', () => {
    const box = { w: 220, h: 200 };
    const boxes = placePieces('tens', 12, 40, box, 19, 10, true);
    expect(anyOverlap(boxes)).toBe(false);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(box.w);
      expect(b.y + b.h).toBeLessThanOrEqual(box.h);
    }
  });
});

describe('a regroup of disks: "check" in the problem row, no side panel', () => {
  it('the mat has the whole width and the height under the goal', () => {
    const s = sideLayout({
      checkInRow: true,
      age: 'g1-up',
      goal: 'regroup-to',
      showWork: false,
      thenAsk: false,
      answerInWork: false,
      places: 3,
      budget: 358,
    });
    expect(s).toMatchObject({ checkInRow: true, showProblemRow: true, sideH: 0, problemH: 92 });
    expect(s.spaceH).toBe(358 - 2 * ROOT_PAD_Y - 92 - ROW_GAP);
    expect(sideWidth(s, { pad: 232, check: 150, card: 0 })).toBe(0);
    const c = regroup(hto(2, 5, 3), hto(1, 15, 3));
    expect(regroupFit(c, { w: 858, h: 358 }).width).toBe(850);
  });

  // The fullest mats the shipped templates generate (pv.regroup, three places): a hundred as ten
  // tens beside nine tens (PV.16), a ten as ten ones beside nine ones (PV.15, PV.16, PV.24), and
  // ten tens made into the ninth hundred (PV.04, PV.14).
  const FULLEST: [string, Config][] = [
    ['989 as 8 hundreds 19 tens 9 ones', regroup(hto(9, 9, 9), hto(8, 19, 9))],
    ['8 hundreds 19 tens 9 ones as 989', regroup(hto(8, 19, 9), hto(9, 9, 9))],
    ['999 as 9 hundreds 8 tens 19 ones', regroup(hto(9, 9, 9), hto(9, 8, 19))],
    ['9 hundreds 8 tens 19 ones as 999', regroup(hto(9, 8, 19), hto(9, 9, 9))],
    ['900 as 8 hundreds 10 tens', regroup(hto(9, 0, 0), hto(8, 10, 0))],
    ['100 as 10 tens', regroup(hto(1, 0, 0), hto(0, 10, 0))],
  ];

  describe.each(ROOMS)('in the pier at %s', (name, room) => {
    it.each(FULLEST)('%s fits, every disk apart, at one size through the trade', (_n, c) => {
      const { base, path, width, side, fit } = regroupFit(c, room);
      expect(fit.fits).toBe(true);
      expect(fit.unit).toBeGreaterThanOrEqual(name === '960 × 600' ? 34 : DISK_MAX);
      for (const s of path) {
        const plan = planMat({
          age: 'g1-up',
          width,
          height: side.spaceH,
          caps: [base, stateCaps(base, s.mat, s.pending, s.taken)],
          unit: fit.unit,
        });
        expect(plan.fits).toBe(true);
        expect(plan.u).toBe(fit.unit);
        expect(plan.matW).toBeLessThanOrEqual(width);
        expect(plan.totalH).toBeLessThanOrEqual(side.spaceH);
        for (const col of ['hundreds', 'tens', 'ones'] as const) {
          const inner = { w: plan.colW[col] - 2 * COL_PAD, h: plan.bodyH - 2 * COL_PAD };
          const boxes = placePieces(col, s.mat[col], plan.u, inner, plan.caps.mat[col], 10, true);
          expect(boxes).toHaveLength(s.mat[col]);
          expect(anyOverlap(boxes)).toBe(false);
          for (const b of boxes) {
            expect(b.x).toBeGreaterThanOrEqual(0);
            expect(b.x + b.w).toBeLessThanOrEqual(inner.w + 0.01);
            expect(b.y + b.h).toBeLessThanOrEqual(inner.h + 0.01);
          }
        }
      }
    });
  });

  it('a mat with two rows of disks at most draws them larger than one with four', () => {
    const room = { w: 858, h: 358 };
    const two = regroupFit(regroup(hto(9, 0, 0), hto(8, 10, 0)), room).fit.unit;
    const four = regroupFit(regroup(hto(9, 9, 9), hto(8, 19, 9)), room).fit.unit;
    expect(two).toBeGreaterThan(four);
    expect(two).toBeGreaterThanOrEqual(38);
  });
});

describe('adding and taking away with disks (no shipped template yet)', () => {
  it('the tray and the nest hold disks in their rows of five, none overlapping', () => {
    const add = planCaps(compute('+', hto(4, 7, 8), hto(2, 6, 5)));
    expect(add.disks).toBe(true);
    const plan = planMat({ age: 'g1-up', width: 960, height: 520, caps: add });
    expect(plan.fits).toBe(true);
    expect(plan.u).toBeGreaterThanOrEqual(DISK_FLOOR);
    expect(plan.trayH).toBeGreaterThan(0);
    const taken = hto(3, 9, 9);
    const inner = nestInner(960, 220);
    const placed = placeTaken(taken, 30, inner, 64, true);
    const all = [...placed.hundreds, ...placed.tens, ...placed.ones];
    expect(all).toHaveLength(21);
    expect(anyOverlap(all)).toBe(false);
    for (const b of all) expect([b.w, b.h]).toEqual([30, 30]);
  });
});

describe('a trade of disks moves whole disks', () => {
  const box = (x: number, y: number): Box => ({ x, y, w: 40, h: 40 });
  const source = box(100, 100);
  const tens = Array.from({ length: 10 }, (_, j) =>
    box(300 + (j % 5) * 44, 100 + Math.floor(j / 5) * 44),
  );
  const scaled = (g: { keyframes: Keyframe[] }) =>
    g.keyframes.some((k) => String(k.transform ?? '').includes('scale'));

  it('split: ten disks leave the one that goes, none squeezed into a slice', () => {
    const ghosts = breakGhosts('hundreds', 'tens', source, tens, 840, true);
    expect(ghosts).toHaveLength(11);
    expect(ghosts.some(scaled)).toBe(false);
    // Proportional pieces are still cut into ten parts.
    expect(breakGhosts('tens', 'ones', { x: 0, y: 0, w: 20, h: 200 }, tens).some(scaled)).toBe(
      true,
    );
  });

  it('group: ten disks slide onto one spot and one disk leaves it', () => {
    const bounds = { x: 0, y: 0, w: 800, h: 400 };
    const ghosts = bundleGhosts('tens', 'hundreds', tens, source, bounds, 840, true);
    expect(ghosts).toHaveLength(11);
    expect(ghosts.some(scaled)).toBe(false);
    const spots = new Set(ghosts.slice(0, 10).map((g) => `${g.rect.x},${g.rect.y},${g.rect.w}`));
    expect(spots.size).toBe(1);
  });
});
