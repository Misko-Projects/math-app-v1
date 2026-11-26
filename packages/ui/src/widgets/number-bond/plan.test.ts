import { describe, expect, it } from 'vitest';
import { arrangedSize, overflow } from '../kit';
import {
  type BondInput,
  FOUND_PER_ROW_PILE,
  foundSize,
  LAYOUT_GAP,
  PILE_CELL,
  PILE_GAP,
  planBond,
  poolsBox,
} from './plan';

// CPS.06's first worked example as every build ships it (03 §6.1: the template's median item):
// whole 5 in counters, one way found, no numeral answer. The room is the Practice Pier's workshop
// area for a lesson step at 960 × 600.
const whole5: BondInput = {
  ageMode: 'g1-up',
  concrete: true,
  blank: null,
  caps: [5, 5, 5],
  found: 1,
  biggest: 5,
  askMax: null,
  button: { w: 181, h: 64 },
};
const SHORT = { w: 858, h: 358 };

const sizeOf = (input: BondInput, room: { w: number; h: number }) => {
  const plan = planBond(input, room);
  const main = poolsBox(input, plan.edge, plan.fold).size;
  const z = (s: { w: number; h: number } | null) =>
    s ? { w: s.w * plan.zoom, h: s.h * plan.zoom } : null;
  return {
    plan,
    size: arrangedSize(
      plan.arrangement,
      z(main),
      [z(foundSize(input.found)), z(input.button)],
      LAYOUT_GAP,
    ),
  };
};

describe('planBond: the parts folded where one row of counters is too wide', () => {
  it('fits whole 5 with a found way at 960 × 600: folded parts, the found way and Check beside', () => {
    const { plan, size } = sizeOf(whole5, SHORT);
    expect(plan).toMatchObject({ fold: true, arrangement: 'side', steps: false });
    expect(overflow(size, SHORT)).toBe(0);
    // Nothing is drawn smaller to get there.
    expect(plan.zoom).toBeGreaterThanOrEqual(1);
  });

  it('one row of counters a part is 804 px wide: nothing fits beside it in that area', () => {
    expect(poolsBox(whole5).size).toEqual({ w: 804, h: 212 });
    expect(poolsBox(whole5, undefined, true).size.w).toBeLessThan(540);
  });

  it('keeps one row a part wherever that fits', () => {
    expect(planBond(whole5, { w: 1178, h: 558 }).fold).toBe(false);
    expect(planBond({ ...whole5, found: 0 }, SHORT).fold).toBe(false);
    expect(
      planBond(whole5, { w: Number.POSITIVE_INFINITY, h: Number.POSITIVE_INFINITY }).fold,
    ).toBe(false);
  });

  it('never folds the pictorial bond (it has no pools)', () => {
    const plan = planBond({ ...whole5, concrete: false, askMax: 5 }, { w: 300, h: 200 });
    expect(plan.fold).toBe(false);
  });
});

// #35: CPS.06.t1 (new-way, all the ways) at 960 × 600: a whole of 6 to 10 in counters, every pool
// as big as the whole, and every way but one found. Neither the flat nor the folded bond fits; the
// piles do (34 px counters, a pool is one target), the found ways two a row beside them.
const newWay = (whole: number): BondInput => ({
  ...whole5,
  caps: [whole, whole, whole],
  found: Math.floor(whole / 2) - 1,
  biggest: whole,
});

describe('planBond: piles where nothing else fits (#35)', () => {
  it.each([6, 7, 8, 9, 10])('whole %i fits the short area as piles', (whole) => {
    const input = newWay(whole);
    const plan = planBond(input, SHORT);
    expect(plan.pile).toBe(true);
    const size = arrangedSize(
      plan.arrangement,
      poolsBox(input, plan.edge, false, true).size,
      [foundSize(input.found, FOUND_PER_ROW_PILE), input.button],
      LAYOUT_GAP,
    );
    expect(overflow(size, SHORT)).toBe(0);
    expect(plan.zoom).toBeGreaterThanOrEqual(1);
  });

  it('whole 10: the bond 432 × 226, four found ways two a row 395 × 350', () => {
    const input = newWay(10);
    expect(poolsBox(input, 11, false, true).size).toEqual({ w: 432, h: 226 });
    const found = foundSize(4, FOUND_PER_ROW_PILE);
    expect(Math.ceil(found?.w ?? 0)).toBe(395);
    expect(found?.h).toBe(350);
    // Counters stay countable: 34 px cells 3 px apart (drawn 28 px inside them), never overlapping.
    expect(PILE_CELL - 2 * 3).toBeGreaterThanOrEqual(22);
    expect(PILE_GAP).toBeGreaterThan(0);
    // The parts' count badges sit on their pools' corners, over no counter and clear of the whole.
    const l = poolsBox(input, 11, false, true);
    for (const p of ['part-0', 'part-1'] as const) {
      const b = l.badges[p];
      expect(b.y + b.h).toBeLessThanOrEqual(l.pools[p].y);
      expect(b.y).toBeGreaterThanOrEqual(0);
      const w = l.pools.whole;
      expect(b.x + b.w <= w.x || b.x >= w.x + w.w).toBe(true);
    }
  });

  it('never piles where the bond fits otherwise, nor a bond that asks a number', () => {
    expect(planBond(whole5, SHORT).pile).toBe(false);
    expect(planBond(newWay(10), { w: 2000, h: 1200 }).pile).toBe(false);
    expect(planBond({ ...newWay(10), blank: 'whole', askMax: 10 }, SHORT).pile).toBe(false);
  });
});
