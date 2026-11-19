// 03 §6.3 format state models and 03 §5.5 configs, features and answer semantics for the U05
// money formats (#14): coin-pay, coin-count and make-change. Every state response is run through
// its 03 §5.7 checker (coins.total, coins.fewest), so the model and the checker agree. No money
// template exists yet (K02), so the configs are hand-made and spec-valid.

import {
  type AnswerSpec,
  FORMAT_SUPPORT,
  type ItemFormat,
  type StateCheckerId,
  type WidgetAction,
  type WidgetConfig,
  type WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { coinCount, runningTotal, shownPieces } from './coin-count';
import { coinPay } from './coin-pay';
import { formatModel } from './index';
import { countUpStops, crossesDollar, makeChange } from './make-change';
import { type FormatModel, type FormatState, UnsupportedOpError } from './types';

// biome-ignore lint/suspicious/noExplicitAny: the shared tables mix models of different formats.
type AnyModel = FormatModel<any, any>;

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

function play<F extends ItemFormat, S extends FormatState<F>>(
  m: FormatModel<F, S>,
  config: WidgetConfigOf<F>,
  ops: WidgetAction[],
): S {
  return ops.reduce((s, a) => m.apply(s, a), m.initialState(config));
}

function respond<F extends ItemFormat, S extends FormatState<F>>(
  m: FormatModel<F, S>,
  config: WidgetConfigOf<F>,
  ops: WidgetAction[],
) {
  return m.toResponse(play(m, config, ops));
}

function passes(
  id: StateCheckerId,
  target: Record<string, unknown>,
  r: ReturnType<AnyModel['toResponse']>,
): boolean {
  const c = stateChecker(id);
  if (!c) throw new Error(`no checker ${id}`);
  return r?.kind === 'state' && c.check(target, r.value);
}

function issuePaths(m: AnyModel, config: unknown): string[] {
  const r = m.configSchema.safeParse(config);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
}

const NO_ANSWER: AnswerSpec = { kind: 'number', value: 0 };
const drop = (coin: string, extra?: Record<string, unknown>) => act('drop', { coin, ...extra });

// ---------- configs ----------

/** Easiest coin-pay: pay 1¢ from a purse of pennies, running total shown. */
const payEasy: WidgetConfigOf<'coin-pay'> = {
  format: 'coin-pay',
  target: 1,
  purse: { penny: 'unlimited' },
  requireFewest: false,
  mode: 'pay',
  showRunningTotal: true,
};

/** MON.05-style: pay 40¢ from every coin kind. */
const pay40: WidgetConfigOf<'coin-pay'> = {
  format: 'coin-pay',
  target: 40,
  purse: { quarter: 2, dime: 4, nickel: 4, penny: 'unlimited' },
  requireFewest: false,
  mode: 'pay',
  showRunningTotal: true,
};

/** Fewest coins for 65¢, no running total. */
const payFewest: WidgetConfigOf<'coin-pay'> = {
  ...pay40,
  target: 65,
  purse: { quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited', penny: 'unlimited' },
  requireFewest: true,
  showRunningTotal: false,
};

/** MON.03-style: $1.35 with a dollar bill in the purse. */
const payDollar: WidgetConfigOf<'coin-pay'> = {
  format: 'coin-pay',
  target: 135,
  purse: { dollar: 1, quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited' },
  requireFewest: false,
  mode: 'pay',
  showRunningTotal: true,
};

/** PUZ.09-style: another way to make 30¢ (two ways found already). */
const newWay: WidgetConfigOf<'coin-pay'> = {
  format: 'coin-pay',
  target: 30,
  purse: { quarter: 1, dime: 3, nickel: 6, penny: 5 },
  requireFewest: false,
  mode: 'new-way',
  found: ['q1d0n1p0', 'q0d3n0p0'],
  showRunningTotal: true,
};

const countEasy: WidgetConfigOf<'coin-count'> = {
  format: 'coin-count',
  coins: ['penny', 'penny'],
  bills: [],
  arrangement: 'sorted',
  answerUnit: 'cents',
};

/** MON.02-style: a mix to count biggest first. */
const countMixed: WidgetConfigOf<'coin-count'> = {
  format: 'coin-count',
  coins: ['dime', 'penny', 'quarter', 'nickel', 'dime', 'penny'],
  bills: [],
  arrangement: 'mixed',
  answerUnit: 'cents',
};

/** MON.06-style: $1 bill and coins, written $1.35. */
const countDollars: WidgetConfigOf<'coin-count'> = {
  format: 'coin-count',
  coins: ['quarter', 'dime'],
  bills: [1],
  arrangement: 'sorted',
  answerUnit: 'dollars-cents',
};

/** MON.08-style: which purse has more? */
const countCompare: WidgetConfigOf<'coin-count'> = {
  format: 'coin-count',
  coins: ['quarter', 'nickel'],
  bills: [],
  arrangement: 'sorted',
  answerUnit: 'cents',
  compareWith: { coins: ['dime', 'dime', 'dime', 'penny'], bills: [] },
};

const changeEasy: WidgetConfigOf<'make-change'> = {
  format: 'make-change',
  price: 9,
  paid: 10,
  purse: { penny: 'unlimited' },
  countUpLine: true,
};

/** MON.07-style: paid $1 for 65¢; count up 70, 80, 90, 1 dollar. */
const change65: WidgetConfigOf<'make-change'> = {
  format: 'make-change',
  price: 65,
  paid: 100,
  purse: { quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited', penny: 'unlimited' },
  countUpLine: true,
};

/** Crosses a dollar: paid $2 for 85¢ (count up 90, 1 dollar, 2 dollars), no count-up line. */
const changeCross: WidgetConfigOf<'make-change'> = {
  format: 'make-change',
  price: 85,
  paid: 200,
  purse: { dollar: 'unlimited', quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited' },
  countUpLine: false,
};

// ---------- registry, ops ----------

const MODELS: [ItemFormat, AnyModel, WidgetConfig][] = [
  ['coin-pay', coinPay, pay40],
  ['coin-count', coinCount, countMixed],
  ['make-change', makeChange, change65],
];

describe('U05 money format models (03 §6.3)', () => {
  it.each(MODELS)('%s is registered and lists the 03 §5.5 features', (format, model) => {
    expect(formatModel(format)).toBe(model);
  });

  it.each(MODELS)('%s accepts every op its format lists', (format, model, config) => {
    let s = model.initialState(config);
    for (const op of FORMAT_SUPPORT[format].ops) s = model.apply(s, act(op));
    expect(s).toBeDefined();
  });

  it.each(MODELS)('%s throws UnsupportedOpError on an unknown op', (_f, model, config) => {
    expect(() => model.apply(model.initialState(config), act('juggle'))).toThrow(
      UnsupportedOpError,
    );
  });

  it.each(MODELS)('%s ignores malformed args without throwing', (format, model, config) => {
    const s0 = model.initialState(config);
    const junk = [{ coin: 7 }, { coin: 'doubloon' }, { index: 'x' }, { to: null }, { value: 'x' }];
    for (const op of [...FORMAT_SUPPORT[format].ops, 'answer']) {
      for (const args of junk) {
        const s = model.apply(s0, act(op, args));
        expect(model.toResponse(s)).toBeNull();
      }
    }
  });

  it.each(MODELS)('%s is pure: apply never mutates the state it gets', (format, model, config) => {
    const s0 = model.initialState(config);
    const before = JSON.stringify(s0);
    const args = { index: 0, coin: 'dime', to: 75, value: 5 };
    for (const op of FORMAT_SUPPORT[format].ops) model.apply(s0, act(op, args));
    expect(JSON.stringify(s0)).toBe(before);
  });
});

// ---------- coin-pay ----------

describe('coin-pay', () => {
  it('drops coins into the tray and answers the tray counts', () => {
    const r = respond(coinPay, pay40, [drop('quarter'), drop('dime'), drop('nickel')]);
    expect(r).toEqual({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 1, dime: 1, quarter: 1 } },
    });
    expect(passes('coins.total', { cents: 40, purse: pay40.purse }, r)).toBe(true);
    expect(passes('coins.fewest', { cents: 40, purse: pay40.purse }, r)).toBe(true);
  });

  it('alternative end state: four dimes also pay 40¢ (coins.total), but are not the fewest', () => {
    const r = respond(coinPay, pay40, [drop('dime'), drop('dime'), drop('dime'), drop('dime')]);
    expect(passes('coins.total', { cents: 40, purse: pay40.purse }, r)).toBe(true);
    expect(passes('coins.fewest', { cents: 40, purse: pay40.purse }, r)).toBe(false);
  });

  it('answers nothing while the tray is empty', () => {
    expect(respond(coinPay, pay40, [])).toBeNull();
    expect(respond(coinPay, pay40, [drop('dime'), drop('dime', { to: 'purse' })])).toBeNull();
  });

  it('never takes more of a kind than the purse holds, nor a kind it lacks', () => {
    const s = play(coinPay, pay40, [
      drop('quarter'),
      drop('quarter'),
      drop('quarter'),
      drop('dollar'),
    ]);
    expect(s.order).toEqual(['quarter', 'quarter']);
  });

  it('takes a piece back: the one at `index`, or the last of its kind', () => {
    const s = play(coinPay, pay40, [
      drop('dime'),
      drop('nickel'),
      drop('dime'),
      drop('dime', { to: 'purse', index: 0 }),
    ]);
    expect(s.order).toEqual(['nickel', 'dime']);
    const t = coinPay.apply(s, drop('dime', { to: 'purse' }));
    expect(t.order).toEqual(['nickel']);
    // A wrong index (a nickel is not a dime) falls back to the last dime.
    const u = coinPay.apply(s, drop('dime', { to: 'purse', index: 0 }));
    expect(u.order).toEqual(['nickel']);
    // Taking back a kind that is not in the tray does nothing.
    expect(coinPay.apply(s, drop('quarter', { to: 'purse' })).order).toEqual(['nickel', 'dime']);
  });

  it('count-up drops a coin and records the running total; without a coin it counts the tray', () => {
    const s = play(coinPay, pay40, [
      act('count-up', { coin: 'quarter' }),
      act('count-up', { coin: 'dime' }),
    ]);
    expect(s.counted).toBe(35);
    expect(s.order).toEqual(['quarter', 'dime']);
    const t = coinPay.apply(s, act('count-up'));
    expect(t.order).toEqual(s.order);
    expect(t.counted).toBe(35);
  });

  it('say-total is visual only', () => {
    const s = play(coinPay, pay40, [drop('dime'), act('say-total')]);
    expect(s.totalSaid).toBe(true);
    expect(s.order).toEqual(['dime']);
  });

  it('answer {coins} sets the whole tray, if the purse allows it', () => {
    const r = respond(coinPay, pay40, [drop('penny'), act('answer', { coins: { dime: 4 } })]);
    expect(r).toEqual({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 0, dime: 4, quarter: 0 } },
    });
    expect(respond(coinPay, pay40, [act('answer', { coins: { quarter: 3 } })])).toBeNull();
    expect(respond(coinPay, pay40, [act('answer', { coins: { dime: -1 } })])).toBeNull();
  });

  it('lists dollar bills in the response only when the purse has them', () => {
    const r = respond(coinPay, payDollar, [drop('dollar'), drop('quarter'), drop('dime')]);
    expect(r).toEqual({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 0, dime: 1, quarter: 1, dollar: 1 } },
    });
    expect(passes('coins.total', { cents: 135, purse: payDollar.purse }, r)).toBe(true);
    // Alternative: five quarters and a dime, no bill.
    const alt = respond(coinPay, payDollar, [act('answer', { coins: { quarter: 5, dime: 1 } })]);
    expect(passes('coins.total', { cents: 135, purse: payDollar.purse }, alt)).toBe(true);
    expect(passes('coins.fewest', { cents: 135, purse: payDollar.purse }, alt)).toBe(false);
    expect(passes('coins.fewest', { cents: 135, purse: payDollar.purse }, r)).toBe(true);
  });

  it('new-way: a way already found is rejected, a new one accepted (in any drop order)', () => {
    const target = { cents: 30, purse: newWay.purse, found: newWay.found };
    const repeat = respond(coinPay, newWay, [drop('nickel'), drop('quarter')]);
    expect(passes('coins.total', target, repeat)).toBe(false);
    const fresh = respond(coinPay, newWay, [
      drop('dime'),
      drop('dime'),
      drop('nickel'),
      drop('nickel'),
    ]);
    expect(passes('coins.total', target, fresh)).toBe(true);
    const alt = respond(coinPay, newWay, [
      drop('quarter'),
      ...Array.from({ length: 5 }, () => drop('penny')),
    ]);
    expect(passes('coins.total', target, alt)).toBe(true);
  });

  it('features: 0 for the easiest item, per 03 §5.5 otherwise', () => {
    expect(coinPay.featureValues(payEasy, NO_ANSWER)).toEqual({
      target: 0,
      kinds: 0,
      fewest: 0,
      'runningTotal.off': 0,
      dollars: 0,
    });
    expect(coinPay.featureValues(payFewest, NO_ANSWER)).toEqual({
      target: 64 / 25,
      kinds: 3,
      fewest: 1,
      'runningTotal.off': 1,
      dollars: 0,
    });
    expect(coinPay.featureValues(payDollar, NO_ANSWER).dollars).toBe(1);
    // Bills are not a coin kind (the `dollars` feature covers them).
    expect(coinPay.featureValues(payDollar, NO_ANSWER).kinds).toBe(2);
  });

  it('configSchema accepts spec-valid configs', () => {
    for (const c of [payEasy, pay40, payFewest, payDollar, newWay]) {
      expect(issuePaths(coinPay, c)).toEqual([]);
    }
  });

  it('configSchema rejects what the widget cannot answer', () => {
    expect(issuePaths(coinPay, { ...pay40, purse: {} })).toContain('purse');
    expect(issuePaths(coinPay, { ...pay40, purse: { quarter: 0 } })).toContain('purse');
    expect(issuePaths(coinPay, { ...pay40, target: 0 })).toContain('target');
    expect(issuePaths(coinPay, { ...pay40, target: 1001 })).toContain('target');
    // 3¢ from nickels and dimes cannot be paid exactly.
    expect(issuePaths(coinPay, { ...pay40, target: 3, purse: { nickel: 4, dime: 4 } })).toContain(
      'purse',
    );
    // Not enough pieces: 40¢ from one quarter and a dime.
    expect(issuePaths(coinPay, { ...pay40, purse: { quarter: 1, dime: 1 } })).toContain('purse');
    expect(issuePaths(coinPay, { ...pay40, found: [] })).toContain('found');
    expect(issuePaths(coinPay, { ...newWay, found: ['q1d1n0p0'] })).toContain('found.0');
    expect(issuePaths(coinPay, { ...newWay, found: ['nonsense'] })).toContain('found.0');
    // Every way to pay 30¢ from one quarter and one nickel is found.
    expect(
      issuePaths(coinPay, { ...newWay, purse: { quarter: 1, nickel: 1 }, found: ['q1d0n1p0'] }),
    ).toContain('found');
    // With requireFewest, the only fewest way (q + n) is found already.
    expect(issuePaths(coinPay, { ...newWay, requireFewest: true, found: ['q1d0n1p0'] })).toContain(
      'found',
    );
  });
});

// ---------- coin-count ----------

describe('coin-count', () => {
  it('cents: answers the typed number', () => {
    expect(respond(coinCount, countMixed, [act('answer', { value: 51 })])).toEqual({
      kind: 'number',
      value: 51,
    });
    expect(respond(coinCount, countMixed, [])).toBeNull();
  });

  it('dollars-cents: answers [dollars, cents]; a cents value converts', () => {
    expect(respond(coinCount, countDollars, [act('answer', { values: [1, 35] })])).toEqual({
      kind: 'numbers',
      values: [1, 35],
    });
    expect(respond(coinCount, countDollars, [act('answer', { value: 135 })])).toEqual({
      kind: 'numbers',
      values: [1, 35],
    });
    expect(respond(coinCount, countDollars, [act('answer', { values: [1] })])).toBeNull();
  });

  it('compareWith: answers left, right or same, nothing else', () => {
    expect(respond(coinCount, countCompare, [act('answer', { id: 'same' })])).toEqual({
      kind: 'choice',
      id: 'same',
    });
    expect(respond(coinCount, countCompare, [act('answer', { id: 'middle' })])).toBeNull();
    expect(respond(coinCount, countCompare, [act('answer', { value: 30 })])).toBeNull();
  });

  it('pieces are drawn bills first, then coins; sort-coins puts the biggest first', () => {
    expect(shownPieces(countDollars, 'left', false).map((p) => p.id)).toEqual([
      'bill-0',
      'coin-0',
      'coin-1',
    ]);
    const sorted = shownPieces(countMixed, 'left', true);
    expect(sorted.map((p) => p.cents)).toEqual([25, 10, 10, 5, 1, 1]);
    // Stable: the two dimes keep their order.
    expect(sorted.map((p) => p.id)).toEqual([
      'coin-2',
      'coin-0',
      'coin-4',
      'coin-3',
      'coin-1',
      'coin-5',
    ]);
    expect(shownPieces(countCompare, 'right', false).map((p) => p.id)[0]).toBe('r-coin-0');
  });

  it('count-up {index}: the running total is the sum of the pieces counted so far', () => {
    const s = play(coinCount, countMixed, [act('sort-coins'), act('count-up', { index: 2 })]);
    expect(s.counted.left).toBe(2);
    expect(runningTotal(shownPieces(s.config, 'left', s.sorted), s.counted.left)).toBe(45);
    // The last piece's running total is the purse's total.
    const all = coinCount.apply(s, act('count-up', { index: 5 }));
    expect(runningTotal(shownPieces(all.config, 'left', all.sorted), all.counted.left)).toBe(52);
    // Out of range or not whole: ignored.
    expect(coinCount.apply(s, act('count-up', { index: 6 })).counted.left).toBe(2);
    expect(coinCount.apply(s, act('count-up', { index: 1.5 })).counted.left).toBe(2);
    // The right purse counts on its own.
    const r = play(coinCount, countCompare, [act('count-up', { index: 3, side: 'right' })]);
    expect(r.counted).toEqual({ left: -1, right: 3 });
  });

  it('sort-coins restarts the count; say-running records the value said', () => {
    const s = play(coinCount, countMixed, [
      act('count-up', { index: 1 }),
      act('sort-coins'),
      act('say-running', { value: 25 }),
    ]);
    expect(s.counted.left).toBe(-1);
    expect(s.sorted).toBe(true);
    expect(s.said).toBe(25);
  });

  it('features: 0 for the easiest item, per 03 §5.5 otherwise', () => {
    expect(coinCount.featureValues(countEasy, NO_ANSWER)).toEqual({
      coins: 0,
      kinds: 0,
      mixed: 0,
      quarters: 0,
      over100: 0,
    });
    expect(coinCount.featureValues(countMixed, NO_ANSWER)).toEqual({
      coins: 3,
      kinds: 3,
      mixed: 1,
      quarters: 1,
      over100: 0,
    });
    // A bill is one more kind; $1.35 is over a dollar.
    expect(coinCount.featureValues(countDollars, NO_ANSWER)).toEqual({
      coins: 0,
      kinds: 2,
      mixed: 0,
      quarters: 1,
      over100: 1,
    });
    // Both purses count.
    expect(coinCount.featureValues(countCompare, NO_ANSWER).coins).toBe(3);
  });

  it('configSchema accepts spec-valid configs and rejects the rest', () => {
    for (const c of [countEasy, countMixed, countDollars, countCompare]) {
      expect(issuePaths(coinCount, c)).toEqual([]);
    }
    expect(issuePaths(coinCount, { ...countEasy, coins: [] })).toContain('coins');
    expect(issuePaths(coinCount, { ...countEasy, bills: [3] })).toContain('bills.0');
    expect(issuePaths(coinCount, { ...countMixed, arrangement: 'sorted' })).toContain('coins');
    expect(
      issuePaths(coinCount, { ...countEasy, coins: Array.from({ length: 21 }, () => 'penny') }),
    ).toContain('coins');
    expect(
      issuePaths(coinCount, { ...countCompare, compareWith: { coins: [], bills: [] } }),
    ).toContain('compareWith.coins');
  });
});

// ---------- make-change ----------

describe('make-change', () => {
  it('gives change by counting up; answers the change, checked by coins.total', () => {
    const r = respond(makeChange, change65, [
      act('count-up', { to: 70 }),
      act('count-up', { to: 80 }),
      act('count-up', { to: 90 }),
      act('count-up', { to: 100 }),
    ]);
    expect(r).toEqual({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 1, dime: 3, quarter: 0 } },
    });
    expect(passes('coins.total', { cents: 35, purse: change65.purse }, r)).toBe(true);
  });

  it('alternative end state: a dime and a quarter are 35¢ too', () => {
    const r = respond(makeChange, change65, [drop('dime'), drop('quarter')]);
    expect(passes('coins.total', { cents: 35, purse: change65.purse }, r)).toBe(true);
    const short = respond(makeChange, change65, [drop('quarter'), drop('nickel')]);
    expect(passes('coins.total', { cents: 35, purse: change65.purse }, short)).toBe(false);
  });

  it('count-up {to} gives nothing when no single piece makes the step', () => {
    const s = play(makeChange, change65, [act('count-up', { to: 72 })]);
    expect(s.order).toEqual([]);
    expect(play(makeChange, change65, [act('count-up', { to: 69 })]).order).toEqual([]);
    // 65 → 90 is a quarter.
    expect(play(makeChange, change65, [act('count-up', { to: 90 })]).order).toEqual(['quarter']);
    // A dollar step needs a bill in the purse.
    expect(
      play(makeChange, changeCross, [
        act('count-up', { to: 90 }),
        act('count-up', { to: 100 }),
        act('count-up', { to: 200 }),
      ]).order,
    ).toEqual(['nickel', 'dime', 'dollar']);
  });

  it('countUpStops are the running count from the price, one per piece in order', () => {
    expect(countUpStops(65, ['nickel', 'dime', 'dime', 'dime'])).toEqual([70, 80, 90, 100]);
  });

  it('features: 0 for the easiest item, per 03 §5.5 otherwise', () => {
    expect(makeChange.featureValues(changeEasy, NO_ANSWER)).toEqual({
      change: 0,
      crossDollar: 0,
      'countUpLine.off': 0,
    });
    expect(makeChange.featureValues(change65, NO_ANSWER)).toEqual({
      change: 34 / 25,
      crossDollar: 0,
      'countUpLine.off': 0,
    });
    expect(makeChange.featureValues(changeCross, NO_ANSWER)).toEqual({
      change: 114 / 25,
      crossDollar: 1,
      'countUpLine.off': 1,
    });
    expect(crossesDollar(65, 100)).toBe(false);
    expect(crossesDollar(165, 200)).toBe(false);
    expect(crossesDollar(95, 105)).toBe(true);
  });

  it('configSchema accepts spec-valid configs and rejects the rest', () => {
    for (const c of [changeEasy, change65, changeCross])
      expect(issuePaths(makeChange, c)).toEqual([]);
    expect(issuePaths(makeChange, { ...change65, paid: 65 })).toContain('paid');
    expect(issuePaths(makeChange, { ...change65, paid: 60 })).toContain('paid');
    expect(issuePaths(makeChange, { ...change65, price: 0 })).toContain('price');
    expect(issuePaths(makeChange, { ...change65, purse: { quarter: 1 } })).toContain('purse');
    expect(issuePaths(makeChange, { ...change65, purse: {} })).toContain('purse');
  });
});
