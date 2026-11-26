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
  underTakeSize,
  workCardSize,
} from './layout';

type Config = WidgetConfigOf<'base-ten-trade'>;
const W = 850;
const H = 346;
const TWO_DIGIT: StepsParts = { bare: { w: 140, h: 60 }, card: { w: 262, h: 74 }, button: 64 };
/** Three-digit numbers: two more digits on each card. */
const THREE_DIGIT: StepsParts = { bare: { w: 190, h: 60 }, card: { w: 312, h: 74 }, button: 64 };
/** The column algorithm's card (workCardSize): four places for a sum, three for a difference. */
const algorithm = (places: number): StepsParts => ({
  bare: { w: 190, h: 60 },
  card: workCardSize(places, 'g1-up'),
  button: 64,
});

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

  // Three columns of disks (#35, planUnder): the tray or the take-away box under the mat; the
  // answer step's read-only columns without strips or headers, the card or algorithm beside them.
  it.each([
    ['MDA.17: 990 − 15', compute(990, '-', 15), THREE_DIGIT],
    ['MDA.05: 699 + 299', compute(699, '+', 299), THREE_DIGIT],
    ['MDA.18: 900 − 899', compute(900, '-', 899), THREE_DIGIT],
    ['MDA.07: 699 + 299, the algorithm', compute(699, '+', 299), algorithm(4)],
    ['MDA.21: 900 − 899, the algorithm', compute(900, '-', 899), algorithm(3)],
  ])('%s fits at the disks’ floor or more', (_name, c, parts) => {
    const p = plan(c, parts);
    expect(p.over).toEqual({ w: 0, h: 0 });
    expect(p.fits).toBe(true);
    expect(p.unit).toBeGreaterThanOrEqual(DISK_FLOOR);
    const under = p.under as NonNullable<typeof p.under>;
    // The pieces step: mat and side across, the box row under them.
    expect(p.matW + 12 + p.sideW).toBeLessThanOrEqual(W);
    expect(p.matH + 12 + p.boxH).toBe(H);
    // The answer step: read-only mat and side across; mat, buttons, pad row down.
    expect(under.matW + 12 + under.sideW).toBe(W);
    expect(under.matH + 12 + 70).toBeLessThanOrEqual(under.roomH);
    expect(under.roomH + 12 + padRowHeight('g1-up')).toBe(H);
  });

  it('three columns at 26 px: the measured sizes', () => {
    const p = plan(compute(990, '-', 115), THREE_DIGIT);
    expect(p.unit).toBe(DISK_FLOOR);
    // Three 166 px columns, two 64 px strips; a column of 20 disks under captioned buttons.
    expect(p.matH).toBe(208);
    expect(p.boxH).toBe(126);
    // Read-only: three 150 px columns (5 disks and READ_PAD), 20 disks tall; the side holds the
    // widest card, a four-place algorithm (366 × 226).
    expect(p.under).toMatchObject({ matW: 458, matH: 136, sideW: 380, roomH: 266 });
    expect(workCardSize(4, 'g1-up')).toEqual({ w: 366, h: 226 });
    expect(workCardSize(3, 'g1-up')).toEqual({ w: 290, h: 226 });
    // The fullest take-away box (8 hundreds, 18 tens, 19 ones taken: 999) and 2|9|9 waiting.
    expect(underTakeSize({ hundreds: 8, tens: 18, ones: 19 }, 26, 'g1-up')).toEqual({
      w: 778,
      h: 88,
    });
    expect(stepsTraySize(hto(299), 26, 'g1-up', true)).toEqual({ w: 483, h: 115 });
  });

  it('990 − 115: splits to 8 hundreds 17 tens 20 ones are offered; the box holds them all', () => {
    const c = compute(990, '-', 115);
    const p = plan(c, THREE_DIGIT);
    const base = planCaps(c);
    const hold = (h: number, t: number, o: number) =>
      stepsHold({ age: 'g1-up', plan: p, base, all: { hundreds: h, tens: t, ones: o } });
    expect(hold(9, 7, 20)).toBe(true);
    expect(hold(8, 17, 20)).toBe(true);
    expect(hold(8, 18, 19)).toBe(true);
  });
});
