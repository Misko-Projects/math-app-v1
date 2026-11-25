import { describe, expect, it } from 'vitest';
import { arrangedSize, overflow } from '../kit';
import { type BondInput, foundSize, LAYOUT_GAP, planBond, poolsBox } from './plan';

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
