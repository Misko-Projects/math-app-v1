// 03 §5.6 money.coins: per mode, fixed params → answer and widget; the bounds over the whole param
// range (every accepted item is a valid config, its example answer is correct and its worked
// solution replays to a correct response); the compare conflict and the writing pick.

import type { ItemFormat, ItemTemplate, ParamValues } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { GenerationError } from '../types';
import {
  COMPARE_COINS_MAX,
  COUNT_COINS_MAX,
  centsOf,
  comparePurses,
  fewestCoins,
  MONEY_COINS_CENTS_MAX,
  moneyCoins,
  ORDER_COINS_MAX,
  writings,
} from './coins';

let nextId = 0;
function tpl(format: ItemFormat, over: Partial<ItemTemplate> = {}): ItemTemplate {
  nextId += 1;
  return {
    id: `T.money.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: format === 'coin-pay' ? 'concrete' : 'pictorial',
    generator: 'money.coins',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
    ...over,
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

const build = (t: ItemTemplate, params: ParamValues) => generateItemFromParams(t, params);

/** Valid config, correct example answer, and a solution that replays to a correct response. */
function expectSound(t: ItemTemplate, params: ParamValues) {
  const item = build(t, params);
  const parsed = formatModel(t.format)?.configSchema.safeParse(item.widget);
  expect(
    parsed?.success,
    `${JSON.stringify(params)} ${JSON.stringify(parsed?.error?.issues)}`,
  ).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const replayed = replaySteps(item, itemSolution(item, t));
  expect(replayed && checkResponse(item, replayed).correct, JSON.stringify(params)).toBe(true);
  return item;
}

const accepts = (t: ItemTemplate, p: ParamValues) =>
  moneyCoins.accepts?.({ ...p, ...moneyCoins.derive(p) }, t) ?? true;

describe('money.coins identify (MON.01)', () => {
  const pick = tpl('numeral-pick', { params: { mode: { kind: 'const', value: 'identify' } } });
  const pad = tpl('number-pad', { params: { mode: { kind: 'const', value: 'identify' } } });
  const named = tpl('number-pad', {
    tier: 'abstract',
    params: { mode: { kind: 'const', value: 'identify' } },
  });

  it('offers the same four values for every coin, under a silent coin picture', () => {
    for (const coin of ['penny', 'nickel', 'dime', 'quarter']) {
      const item = expectSound(pick, { mode: 'identify', coin });
      if (item.widget.format !== 'numeral-pick') throw new Error('numeral-pick');
      expect(item.widget.stimulus).toEqual({ kind: 'coins', coins: [coin] });
      expect(item.widget.options.map((o) => o.label)).toEqual(['1¢', '5¢', '10¢', '25¢']);
    }
  });

  it('asks the value on the pad, with the picture or (abstract) with none', () => {
    const item = expectSound(pad, { mode: 'identify', coin: 'nickel' });
    expect(item.answer).toEqual({ kind: 'number', value: 5 });
    expect(item.widget).toMatchObject({ stimulus: { kind: 'coins', coins: ['nickel'] } });
    const abs = expectSound(named, { mode: 'identify', coin: 'quarter' });
    expect(abs.widget).toMatchObject({ stimulus: { kind: 'none' } });
    expect(abs.answer).toEqual({ kind: 'number', value: 25 });
  });
});

describe('money.coins count (MON.02, MON.04)', () => {
  const count = tpl('coin-count');
  it('totals the purse in cents; sorted lists biggest first, mixed shuffles', () => {
    const item = expectSound(count, { mode: 'count', q: 1, d: 2, n: 1, p: 3 });
    expect(item.answer).toEqual({ kind: 'number', value: 53 });
    expect(item.widget).toMatchObject({
      coins: ['quarter', 'dime', 'dime', 'nickel', 'penny', 'penny', 'penny'],
      arrangement: 'sorted',
    });
    expectSound(count, { mode: 'count', q: 2, d: 1, n: 2, p: 4, arrangement: 'mixed' });
  });

  it('bounds: 1 to COUNT_COINS_MAX coins, at most MONEY_COINS_CENTS_MAX; every accepted purse is sound', () => {
    let accepted = 0;
    for (let q = 0; q <= 8; q += 1)
      for (let d = 0; d <= COUNT_COINS_MAX; d += 1)
        for (let n = 0; n <= COUNT_COINS_MAX; n += 1)
          for (let p = 0; p <= COUNT_COINS_MAX; p += 1) {
            const params = { mode: 'count', q, d, n, p };
            const total = q + d + n + p;
            const ok = total >= 1 && total <= COUNT_COINS_MAX && centsOf(fewestCoins(0)) === 0;
            const cents = 25 * q + 10 * d + 5 * n + p;
            expect(accepts(count, params)).toBe(ok && cents <= MONEY_COINS_CENTS_MAX);
            if (accepts(count, params) && (q + d + n + p) % 3 === 0) {
              expectSound(count, params);
              accepted += 1;
            }
          }
    expect(accepted).toBeGreaterThan(100);
    expect(() => build(count, { mode: 'count', q: 0, d: 0, n: 0, p: 0 })).toThrow(GenerationError);
  });
});

describe('money.coins pay (MON.04–MON.06)', () => {
  const pay = tpl('coin-pay');
  it('pays any way the purse allows; the worked tray is the fewest pieces', () => {
    const item = expectSound(pay, { mode: 'pay', cents: 40, kinds: 'qdnp' });
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'coins.total',
      target: {
        cents: 40,
        purse: { quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited', penny: 'unlimited' },
      },
    });
    expectSound(pay, { mode: 'pay', cents: 135, kinds: '$qd', runningTotal: false });
  });

  it('bounds: every amount 1–MONEY_COINS_CENTS_MAX a purse can pay in a tray is sound', () => {
    for (const kinds of ['qdnp', 'd', 'n', 'p', 'q', 'qd', '$qdn', 'dn']) {
      for (let cents = 1; cents <= MONEY_COINS_CENTS_MAX; cents += 1) {
        const params = { mode: 'pay', cents, kinds };
        if (accepts(pay, params)) expectSound(pay, params);
      }
    }
    expect(() => build(pay, { mode: 'pay', cents: 13, kinds: 'dn' })).toThrow(GenerationError);
    expect(() => build(pay, { mode: 'pay', cents: 13, kinds: 'p' })).toThrow(GenerationError);
    expect(() => build(pay, { mode: 'pay', cents: 201, kinds: 'qdnp' })).toThrow(GenerationError);
  });
});

describe('money.coins compare (MON.08)', () => {
  const cmp = tpl('coin-count', { params: { mode: { kind: 'const', value: 'compare' } } });
  const order = tpl('order', { params: { mode: { kind: 'const', value: 'compare' } } });
  const labels = tpl('order', {
    tier: 'abstract',
    params: { mode: { kind: 'const', value: 'compare' } },
  });

  it('never draws equal purses; with conflict the poorer purse has more coins', () => {
    expect(() => build(cmp, { mode: 'compare', a: 30, b: 30 })).toThrow(GenerationError);
    for (let a = 1; a <= 99; a += 1)
      for (let b = 1; b <= 99; b += 1)
        for (const conflict of [false, true]) {
          const params = { mode: 'compare', a, b, conflict };
          if (!accepts(cmp, params)) continue;
          const item = expectSound(cmp, params);
          expect(item.answer).toEqual({ kind: 'choice', id: a > b ? 'left' : 'right' });
          const [l, r] = comparePurses(a, b, conflict);
          expect(centsOf(l)).toBe(a);
          expect(centsOf(r)).toBe(b);
          expect(Math.max(l.length, r.length)).toBeLessThanOrEqual(COMPARE_COINS_MAX);
          if (conflict) expect(a < b ? l.length > r.length : r.length > l.length).toBe(true);
        }
  });

  it('orders three distinct purses least first; the abstract cards are labelled amounts', () => {
    const item = expectSound(order, { mode: 'compare', a: 40, b: 15, c: 26 });
    expect(item.answer).toEqual({ kind: 'numbers', values: [15, 26, 40], ordered: true });
    const abs = expectSound(labels, { mode: 'compare', a: 40, b: 15, c: 26 });
    if (abs.widget.format !== 'order') throw new Error('order');
    expect(abs.widget.items.map((i) => i.label).sort()).toEqual(['15¢', '26¢', '40¢']);
    expect(() => build(order, { mode: 'compare', a: 40, b: 15, c: 40 })).toThrow(GenerationError);
    for (const v of [1, 41, 99]) {
      expect(accepts(order, { mode: 'compare', a: v, b: 2, c: 3 })).toBe(
        fewestCoins(v).length <= ORDER_COINS_MAX,
      );
    }
  });
});

describe('money.coins dollars (MON.06)', () => {
  const count = tpl('coin-count', { params: { mode: { kind: 'const', value: 'dollars' } } });
  const write = tpl('numeral-pick', { params: { mode: { kind: 'const', value: 'dollars' } } });
  it('answers dollars and cents; a bill and coins over a dollar, coins alone under one', () => {
    const item = expectSound(count, { mode: 'dollars', bills: 1, q: 1, d: 1 });
    expect(item.answer).toEqual({ kind: 'numbers', values: [1, 35], ordered: true });
    expect(item.widget).toMatchObject({ bills: [1], answerUnit: 'dollars-cents' });
    const under = expectSound(count, { mode: 'dollars', q: 3, d: 2 });
    expect(under.answer).toEqual({ kind: 'numbers', values: [0, 95], ordered: true });
  });

  it('the writing pick: the right one, the dot left out, and both signs', () => {
    expect(writings(125).map((w) => w.label)).toEqual(['$1.25', '$125', '$1.25¢']);
    expect(writings(45).map((w) => w.label)).toEqual(['$0.45', '$045', '$0.45¢']);
    const item = expectSound(write, { mode: 'dollars', cents: 105 });
    expect(item.answer).toEqual({ kind: 'choice', id: 'w-right' });
  });
});
