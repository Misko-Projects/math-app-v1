// A short room's two steps (#35, layout.ts planSteps): at 960 × 600 the widget's content box is
// 850 × 346 px (the 858 × 358 room less the root's padding). The parts' sizes are those measured
// in the pier: the bare problem ("43 − 35"), the problem with its answer box, an icon-only button.
import type { WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  DISK_FLOOR,
  padRowHeight,
  padRowWidth,
  pathStates,
  planCaps,
  planSteps,
  type StepsParts,
  stepsCaps,
  stepsHold,
  stepsTakeSize,
  stepsTraySize,
  U_FLOOR,
} from './layout';

type Config = WidgetConfigOf<'base-ten-trade'>;
const W = 850;
const H = 346;
const TWO_DIGIT: StepsParts = { bare: { w: 140, h: 60 }, card: { w: 262, h: 74 }, button: 64 };
/** Three-digit numbers: two more digits on each card. */
const THREE_DIGIT: StepsParts = { bare: { w: 190, h: 60 }, card: { w: 312, h: 74 }, button: 64 };

const hto = (v: number) => ({
  hundreds: Math.floor(v / 100),
  tens: Math.floor(v / 10) % 10,
  ones: v % 10,
});
const compute = (a: number, op: '+' | '-', b: number): Config => ({
  format: 'base-ten-trade',
  start: hto(a),
  operation: { op, operand: hto(b) },
  goal: 'compute',
  showAlgorithm: false,
  thenAsk: true,
});
const plan = (c: Config, parts = TWO_DIGIT) =>
  planSteps({
    age: 'g1-up',
    width: W,
    height: H,
    base: planCaps(c),
    path: pathStates(c),
    parts,
  });

describe('planSteps at 960 × 600', () => {
  it('the pad row: eleven 64 px keys 12 px apart fit the width, under a 266 px mat', () => {
    expect(padRowWidth('g1-up')).toBe(824);
    expect(padRowWidth('g1-up')).toBeLessThanOrEqual(W);
    expect(H - 12 - padRowHeight('g1-up')).toBe(266);
  });

  it('a two-digit mat has no Hundreds column; a reachable hundred keeps it', () => {
    expect(stepsCaps(planCaps(compute(49, '+', 49))).columns).toEqual(['tens', 'ones']);
    expect(stepsCaps(planCaps(compute(98, '-', 19))).columns).toEqual(['tens', 'ones']);
    expect(stepsCaps(planCaps(compute(95, '+', 7))).columns).toEqual(['hundreds', 'tens', 'ones']);
  });

  // The fullest items each template draws (MDA.03 b ≤ 79, so at most 7 tens wait in the tray;
  // MDA.12 a ≤ 99 with a ten split).
  it.each([
    ['MDA.08: 89 + 9', compute(89, '+', 9)],
    ['MDA.03: 19 + 79', compute(19, '+', 79)],
    ['MDA.03: 49 + 49', compute(49, '+', 49)],
    ['MDA.10: 98 − 9', compute(98, '-', 9)],
    ['MDA.12: 98 − 19', compute(98, '-', 19)],
    ['MDA.12: 99 − 89', compute(91, '-', 89)],
  ])('%s fits at 18 px or more', (_name, c) => {
    const p = plan(c);
    expect(p.over).toEqual({ w: 0, h: 0 });
    expect(p.fits).toBe(true);
    expect(p.unit).toBeGreaterThanOrEqual(U_FLOOR);
    expect(p.matW + 12 + p.sideW).toBeLessThanOrEqual(W);
  });

  it('the tightest: 7 tens and 9 ones waiting, 8 tens and 18 ones a take-away can hold', () => {
    // 2 holders (205 + 136) 12 apart, the tray's 15 px a side.
    expect(stepsTraySize(hto(79), 18, 'g1-up')).toEqual({ w: 383, h: 240 });
    expect(stepsTakeSize({ hundreds: 0, tens: 9, ones: 18 }, 18, 'g1-up')).toEqual({
      w: 371,
      h: 210,
    });
    const add = plan(compute(19, '+', 79));
    expect(add.sideW).toBe(383);
    expect(W - 12 - add.sideW).toBeGreaterThanOrEqual(449);
  });

  it('98 − 19: splits are offered only while every piece fits the mat and the take-away box', () => {
    // Review round 1 (#126): split after split on the fixed mat once overlapped the pad row.
    const c = compute(98, '-', 19);
    const p = plan(c);
    const base = planCaps(c);
    const hold = (tens: number, ones: number) =>
      stepsHold({ age: 'g1-up', plan: p, base, all: { hundreds: 0, tens, ones } });
    // The start and the expected split hold.
    expect(hold(9, 8)).toBe(true);
    expect(hold(8, 18)).toBe(true);
    // Splitting on: the last state that holds, and the first that does not.
    let tens = 9;
    let ones = 8;
    while (tens > 0 && hold(tens - 1, ones + 10)) {
      tens -= 1;
      ones += 10;
    }
    expect(tens).toBeGreaterThan(0);
    expect(hold(tens - 1, ones + 10)).toBe(false);
    console.info(`98 − 19 in steps: splits stop at ${tens} tens ${ones} ones`);
  });

  it('a three-column mat of disks does not fit: the report says by how much', () => {
    // MDA.05 / MDA.17 to come: three-digit compute with a column of 20 disks (two splits).
    // At the disks' floor (26 px) the mat is 634 × 208 px (three 166 px columns, two strips) and
    // the take-away box for what can be taken 480 px wide: 1126 px across an 850 px box, 276 px
    // too wide. (Under the mat instead it is 24 px too tall, and the answer step's side beside a
    // 634 px mat is 204 px wide for a 388 px row: 184 px short.) No bar is lowered: three
    // columns stay the usual, scrolling layout.
    const c = compute(990, '-', 15);
    const p = plan(c, THREE_DIGIT);
    expect(p.fits).toBe(false);
    expect(p.unit).toBe(DISK_FLOOR);
    expect(p.sideW).toBe(480);
    expect(p.over).toEqual({ w: 276, h: 0 });
  });
});
