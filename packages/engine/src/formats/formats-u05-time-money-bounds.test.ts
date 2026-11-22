// The supported domain of the U05 time and money formats (#14), one test a bound: every numeric
// input a config can carry is refused outside what the widgets draw, with a message that names the
// bound, by the shared schema or by the format model (content-check runs both, V13). The bounds
// are exported constants, so the tests read the same numbers the layout does.

import {
  BILL_SLOTS,
  CLOCK_ELAPSED_MAX,
  CLOCK_READ_LABEL_MAX,
  CLOCK_READ_OPTIONS_MAX,
  COIN_FOUND_MAX,
  COIN_FOUND_WAY_PIECES_MAX,
  COIN_SLOTS_MAX,
  type CoinKind,
  MONEY_CENTS_MAX,
  PURSE_COUNT_MAX,
  stimulusSpecSchema,
  TRAY_PIECES_MAX,
  type WidgetAction,
  type WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { clockRead } from './clock-read';
import { clockSet } from './clock-set';
import { coinCount, MAX_COMPARE_SLOTS, MAX_COUNT_CENTS } from './coin-count';
import { coinPay, MAX_TRAY_PIECES } from './coin-pay';
import { makeChange } from './make-change';
import { fewestPieces, trayPieces, waysToPay } from './money';
import type { FormatModel } from './types';

// biome-ignore lint/suspicious/noExplicitAny: the helpers take models of different formats.
type AnyModel = FormatModel<any, any>;

/** The issues a config raises, as `path: message`. */
function issues(m: AnyModel, config: unknown): string[] {
  const r = m.configSchema.safeParse(config);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}
const ok = (m: AnyModel, config: unknown) => expect(issues(m, config)).toEqual([]);
/** Some issue sits at `path` or under it. */
const refused = (m: AnyModel, config: unknown, path: string) =>
  expect(issues(m, config).some((i) => i.startsWith(path + ':') || i.startsWith(path + '.'))).toBe(
    true,
  );

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

const set: WidgetConfigOf<'clock-set'> = {
  format: 'clock-set',
  target: { h: 3, m: 0 },
  start: { h: 12, m: 0 },
  precision: 60,
  showDigital: true,
  prompt: 'spoken',
};
const read: WidgetConfigOf<'clock-read'> = {
  format: 'clock-read',
  time: { h: 3, m: 30 },
  numerals: true,
  input: 'digital-pad',
};
const pay: WidgetConfigOf<'coin-pay'> = {
  format: 'coin-pay',
  target: 40,
  purse: { quarter: 2, dime: 4, nickel: 4, penny: 'unlimited' },
  requireFewest: false,
  mode: 'pay',
  showRunningTotal: true,
};
const count: WidgetConfigOf<'coin-count'> = {
  format: 'coin-count',
  coins: ['quarter', 'dime', 'penny'],
  bills: [],
  arrangement: 'sorted',
  answerUnit: 'cents',
};
const change: WidgetConfigOf<'make-change'> = {
  format: 'make-change',
  price: 65,
  paid: 100,
  purse: { quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited', penny: 'unlimited' },
  countUpLine: true,
};

describe('clock-set bounds', () => {
  it('accepts the base config', () => ok(clockSet, set));

  it.each([
    ['target', { h: 24, m: 0 }],
    ['target', { h: -1, m: 0 }],
    ['target', { h: 3, m: 60 }],
    ['target', { h: 3, m: -5 }],
    ['target', { h: 3.5, m: 0 }],
    ['start', { h: 24, m: 0 }],
    ['start', { h: 2, m: 60 }],
  ] as const)('refuses a %s outside h 0–23, m 0–59: %j', (key, time) => {
    refused(clockSet, { ...set, [key]: time }, key);
  });

  it('accepts the edges h 0, h 23 and m 59 (precision 1)', () => {
    ok(clockSet, { ...set, precision: 1, target: { h: 0, m: 59 }, start: { h: 23, m: 0 } });
  });

  it('refuses a precision that is not 60, 30, 15, 5 or 1', () => {
    refused(clockSet, { ...set, precision: 10 }, 'precision');
    refused(clockSet, { ...set, precision: 0 }, 'precision');
  });

  it('refuses a target or start the hand cannot snap to', () => {
    refused(clockSet, { ...set, precision: 30, target: { h: 3, m: 15 } }, 'target.m');
    refused(clockSet, { ...set, precision: 5, start: { h: 12, m: 1 } }, 'start.m');
  });

  const elapsed = (minutes: number, target = { h: 3, m: 30 }) => ({
    ...set,
    precision: 1 as const,
    prompt: 'elapsed' as const,
    target,
    start: { h: 12, m: 0 },
    elapsed: { from: { h: 3, m: 0 }, minutes },
  });
  it(`accepts elapsed minutes 1 to ${CLOCK_ELAPSED_MAX} and refuses 0, a fraction and 12 hours`, () => {
    ok(clockSet, elapsed(30));
    ok(clockSet, elapsed(1, { h: 3, m: 1 }));
    ok(clockSet, elapsed(CLOCK_ELAPSED_MAX, { h: 2, m: 59 }));
    refused(clockSet, elapsed(0, { h: 3, m: 0 }), 'elapsed.minutes');
    refused(clockSet, elapsed(-30), 'elapsed.minutes');
    refused(clockSet, elapsed(30.5), 'elapsed.minutes');
    // 12 hours later is the start time again on the face: not a question.
    refused(clockSet, elapsed(CLOCK_ELAPSED_MAX + 1, { h: 3, m: 0 }), 'elapsed.minutes');
    refused(clockSet, elapsed(1440 + 30), 'elapsed.minutes');
  });

  it('checks exactly what the hands snap to: no band between the model and clock.time', () => {
    const checker = stateChecker('clock.time');
    for (const precision of [60, 30, 15, 5, 1] as const) {
      const c = { ...set, precision, target: { h: 3, m: 0 }, start: { h: 12, m: 0 } };
      // Every minute a finger can leave the long hand at, at this precision.
      for (let raw = 0; raw < 60; raw += 0.25) {
        let s = clockSet.initialState(c);
        s = clockSet.apply(s, act('drag-hour', { to: 3 }));
        s = clockSet.apply(s, act('drag-minute', { to: raw }));
        const r = clockSet.toResponse(s);
        if (r?.kind !== 'state') throw new Error('no response');
        const { h, m } = r.value as { h: number; m: number };
        // The response is always a snapped time, and it is right exactly when it is the target.
        expect(m % precision).toBe(0);
        expect(checker?.check({ h: 3, m: 0 }, r.value)).toBe(h === 3 && m === 0);
      }
    }
  });
});

describe('clock-read bounds', () => {
  it('accepts the base config', () => ok(clockRead, read));

  it.each([
    { h: 24, m: 0 },
    { h: -1, m: 0 },
    { h: 3, m: 60 },
    { h: 3, m: -1 },
    { h: 3, m: 0.5 },
  ])('refuses a time outside h 0–23, m 0–59: %j', (time) =>
    refused(clockRead, { ...read, time }, 'time'),
  );

  const opts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `opt-${i + 1}`, label: `${i + 1}:00` }));
  it(`accepts 3 to ${CLOCK_READ_OPTIONS_MAX} options and refuses fewer or more`, () => {
    ok(clockRead, { ...read, input: 'pick', options: opts(3) });
    ok(clockRead, { ...read, input: 'pick', options: opts(CLOCK_READ_OPTIONS_MAX) });
    refused(clockRead, { ...read, input: 'pick', options: opts(2) }, 'options');
    refused(
      clockRead,
      { ...read, input: 'pick', options: opts(CLOCK_READ_OPTIONS_MAX + 1) },
      'options',
    );
  });

  it(`refuses an empty option label and one over ${CLOCK_READ_LABEL_MAX} characters`, () => {
    const three = opts(3);
    const withLabel = (label: string) => ({
      ...read,
      input: 'pick' as const,
      options: [{ id: 'opt-9', label }, ...three.slice(1)],
    });
    ok(clockRead, withLabel('x'.repeat(CLOCK_READ_LABEL_MAX)));
    refused(clockRead, withLabel(''), 'options.0.label');
    refused(clockRead, withLabel('x'.repeat(CLOCK_READ_LABEL_MAX + 1)), 'options.0.label');
  });
});

describe('clock and coins pictures (StimulusSpec) bounds', () => {
  const parse = (s: unknown) => stimulusSpecSchema.safeParse(s).success;

  it('a clock picture is a time h 0–23, m 0–59', () => {
    expect(parse({ kind: 'clock', h: 0, m: 0, numerals: true })).toBe(true);
    expect(parse({ kind: 'clock', h: 23, m: 59, numerals: false })).toBe(true);
    expect(parse({ kind: 'clock', h: 24, m: 0, numerals: true })).toBe(false);
    expect(parse({ kind: 'clock', h: 3, m: 60, numerals: true })).toBe(false);
    expect(parse({ kind: 'clock', h: -1, m: 0, numerals: true })).toBe(false);
    expect(parse({ kind: 'clock', h: 3, m: -1, numerals: true })).toBe(false);
  });

  const pennies = (n: number): CoinKind[] => Array.from({ length: n }, () => 'penny');
  it(`a coins picture shows 1 to ${COIN_SLOTS_MAX} coin slots, bills of 1, 2, 5, 10 or 20`, () => {
    expect(parse({ kind: 'coins', coins: pennies(1) })).toBe(true);
    expect(parse({ kind: 'coins', coins: pennies(COIN_SLOTS_MAX) })).toBe(true);
    expect(parse({ kind: 'coins', coins: [] })).toBe(false);
    expect(parse({ kind: 'coins', coins: pennies(COIN_SLOTS_MAX + 1) })).toBe(false);
    expect(parse({ kind: 'coins', coins: [], bills: [20] })).toBe(true);
    expect(parse({ kind: 'coins', coins: [], bills: [3] })).toBe(false);
    expect(parse({ kind: 'coins', coins: [], bills: [0] })).toBe(false);
    // A bill takes BILL_SLOTS: the most bills alone, and one coin too many beside them.
    const most = COIN_SLOTS_MAX / BILL_SLOTS;
    expect(parse({ kind: 'coins', coins: [], bills: Array.from({ length: most }, () => 1) })).toBe(
      true,
    );
    expect(
      parse({ kind: 'coins', coins: pennies(1), bills: Array.from({ length: most }, () => 1) }),
    ).toBe(false);
  });
});

describe('coin-pay bounds', () => {
  it('accepts the base config', () => ok(coinPay, pay));

  it(`pays 1¢ to ${MONEY_CENTS_MAX}¢`, () => {
    ok(coinPay, { ...pay, target: 1 });
    ok(coinPay, { ...pay, target: MONEY_CENTS_MAX, purse: { dollar: 10 } });
    refused(coinPay, { ...pay, target: 0 }, 'target');
    refused(coinPay, { ...pay, target: -5 }, 'target');
    refused(coinPay, { ...pay, target: 12.5 }, 'target');
    refused(
      coinPay,
      { ...pay, target: MONEY_CENTS_MAX + 1, purse: { dollar: 'unlimited' } },
      'target',
    );
  });

  it(`a purse lists at most ${PURSE_COUNT_MAX} of a kind by number`, () => {
    ok(coinPay, { ...pay, purse: { ...pay.purse, nickel: PURSE_COUNT_MAX } });
    refused(
      coinPay,
      { ...pay, purse: { ...pay.purse, nickel: PURSE_COUNT_MAX + 1 } },
      'purse.nickel',
    );
    refused(coinPay, { ...pay, purse: { ...pay.purse, nickel: -1 } }, 'purse.nickel');
    refused(coinPay, { ...pay, purse: { ...pay.purse, nickel: 1.5 } }, 'purse.nickel');
  });

  it(`refuses an amount the tray's ${TRAY_PIECES_MAX} pieces cannot pay`, () => {
    // Pennies alone: 12¢ is the most a full tray of them pays.
    ok(coinPay, { ...pay, target: TRAY_PIECES_MAX, purse: { penny: 'unlimited' } });
    refused(
      coinPay,
      { ...pay, target: TRAY_PIECES_MAX + 1, purse: { penny: 'unlimited' } },
      'purse',
    );
    expect(
      issues(coinPay, { ...pay, target: 30, purse: { penny: 'unlimited' } }).join(' '),
    ).toContain(`the tray holds ${TRAY_PIECES_MAX}`);
  });

  it('the tray never holds more than its bound, by drops or by an answer', () => {
    expect(MAX_TRAY_PIECES).toBe(TRAY_PIECES_MAX);
    const c = { ...pay, target: TRAY_PIECES_MAX, purse: { penny: 'unlimited' as const } };
    let s = coinPay.initialState(c);
    for (let i = 0; i < TRAY_PIECES_MAX + 5; i++)
      s = coinPay.apply(s, act('drop', { coin: 'penny' }));
    expect(s.order).toHaveLength(TRAY_PIECES_MAX);
    // A full tray still gives a piece back, and then takes one again.
    s = coinPay.apply(s, act('drop', { coin: 'penny', to: 'purse' }));
    expect(s.order).toHaveLength(TRAY_PIECES_MAX - 1);
    s = coinPay.apply(s, act('count-up', { coin: 'penny' }));
    s = coinPay.apply(s, act('count-up', { coin: 'penny' }));
    expect(s.order).toHaveLength(TRAY_PIECES_MAX);
    const before = coinPay.initialState(c);
    const after = coinPay.apply(before, act('answer', { coins: { penny: TRAY_PIECES_MAX + 1 } }));
    expect(after.order).toEqual([]);
  });

  it(`new-way lists at most ${COIN_FOUND_MAX} found ways, each one the purse and tray can pay`, () => {
    const c = {
      ...pay,
      target: 30,
      mode: 'new-way' as const,
      purse: { quarter: 1, dime: 3, nickel: 6, penny: 5 },
    };
    const ways = ['q1d0n1p0', 'q0d3n0p0', 'q0d2n2p0', 'q0d1n4p0', 'q0d0n6p0'];
    ok(coinPay, { ...c, found: ways.slice(0, COIN_FOUND_MAX) });
    refused(coinPay, { ...c, found: ways.slice(0, COIN_FOUND_MAX + 1) }, 'found');
    // Thirty pennies is a way to make 30¢, but not from this purse or in this tray.
    refused(coinPay, { ...c, found: ['q0d0n0p30'] }, 'found.0');
    refused(coinPay, { ...c, found: ['q0d3n0p0', 'q0d3n0p0'] }, 'found.1');
  });

  it(`a found way lists at most ${COIN_FOUND_WAY_PIECES_MAX} pieces`, () => {
    const c = {
      ...pay,
      target: 30,
      mode: 'new-way' as const,
      purse: { quarter: 1, dime: 3, nickel: 6, penny: 5 },
    };
    // Six nickels is the longest way a list shows; five nickels and five pennies is too long.
    ok(coinPay, { ...c, found: ['q0d0n6p0'] });
    refused(coinPay, { ...c, found: ['q0d0n5p5'] }, 'found.0');
    expect(issues(coinPay, { ...c, found: ['q0d0n5p5'] }).join(' ')).toContain(
      `at most ${COIN_FOUND_WAY_PIECES_MAX} pieces`,
    );
  });

  it('new-way refuses an item whose only ways left do not fit the tray', () => {
    // 20¢ from dimes and pennies: 2 dimes, a dime and 10 pennies (11 pieces), or 20 pennies.
    const c = {
      ...pay,
      target: 20,
      mode: 'new-way' as const,
      purse: { dime: 2, penny: 'unlimited' as const },
    };
    ok(coinPay, { ...c, found: ['q0d2n0p0'] });
    refused(coinPay, { ...c, found: ['q0d2n0p0', 'q0d1n0p10'] }, 'found');
  });

  it('every way listed for a small tray fits it, however many the purse has', () => {
    const purse = {
      quarter: 'unlimited',
      dime: 'unlimited',
      nickel: 'unlimited',
      penny: 'unlimited',
    } as const;
    const ways = waysToPay(100, purse, 5000, TRAY_PIECES_MAX);
    expect(ways.length).toBeGreaterThan(0);
    expect(ways.every((t) => trayPieces(t) <= TRAY_PIECES_MAX)).toBe(true);
    expect(ways.some((t) => trayPieces(t) === fewestPieces(100, purse))).toBe(true);
  });
});

describe('coin-count bounds', () => {
  it('accepts the base config', () => ok(coinCount, count));

  const pennies = (n: number): CoinKind[] => Array.from({ length: n }, () => 'penny');
  it(`one purse shows 1 to ${COIN_SLOTS_MAX} coin slots`, () => {
    ok(coinCount, { ...count, coins: pennies(COIN_SLOTS_MAX) });
    refused(coinCount, { ...count, coins: pennies(COIN_SLOTS_MAX + 1) }, 'coins');
    refused(coinCount, { ...count, coins: [] }, 'coins');
    ok(coinCount, { ...count, coins: pennies(COIN_SLOTS_MAX - BILL_SLOTS), bills: [1] });
    refused(
      coinCount,
      { ...count, coins: pennies(COIN_SLOTS_MAX - BILL_SLOTS + 1), bills: [1] },
      'coins',
    );
  });

  it(`two purses show at most ${MAX_COMPARE_SLOTS} slots each`, () => {
    const side = (n: number) => ({ coins: pennies(n), bills: [] });
    ok(coinCount, {
      ...count,
      coins: pennies(MAX_COMPARE_SLOTS),
      compareWith: side(MAX_COMPARE_SLOTS),
    });
    refused(
      coinCount,
      { ...count, coins: pennies(MAX_COMPARE_SLOTS + 1), compareWith: side(1) },
      'coins',
    );
    refused(
      coinCount,
      { ...count, coins: pennies(1), compareWith: side(MAX_COMPARE_SLOTS + 1) },
      'compareWith.coins',
    );
    refused(coinCount, { ...count, coins: pennies(1), compareWith: side(0) }, 'compareWith.coins');
  });

  it('bills are 1, 2, 5, 10 or 20 dollars', () => {
    for (const b of [1, 2, 5, 10, 20]) ok(coinCount, { ...count, bills: [b] });
    for (const b of [0, 3, 50, 100, 1.5, -1])
      refused(coinCount, { ...count, bills: [b] }, 'bills.0');
  });

  it(`a purse never holds more than the pad can answer (${MAX_COUNT_CENTS}¢)`, () => {
    // The slot bound keeps every purse under it: the richest purse is four 20-dollar bills.
    const richest = { ...count, coins: [], bills: [20, 20, 20, 20] };
    ok(coinCount, richest);
    expect(20 * 100 * (COIN_SLOTS_MAX / BILL_SLOTS)).toBeLessThanOrEqual(MAX_COUNT_CENTS);
    refused(coinCount, { ...count, coins: [], bills: [20, 20, 20, 20, 20] }, 'bills');
  });
});

describe('make-change bounds', () => {
  it('accepts the base config', () => ok(makeChange, change));

  it(`the price is 1¢ or more and the shopper pays more, at most ${MONEY_CENTS_MAX}¢`, () => {
    ok(makeChange, { ...change, price: 1, paid: 2 });
    ok(makeChange, { ...change, price: MONEY_CENTS_MAX - 1, paid: MONEY_CENTS_MAX });
    refused(makeChange, { ...change, price: 0 }, 'price');
    refused(makeChange, { ...change, price: 65.5 }, 'price');
    refused(makeChange, { ...change, paid: 65 }, 'paid');
    refused(makeChange, { ...change, paid: 50 }, 'paid');
    refused(makeChange, { ...change, paid: MONEY_CENTS_MAX + 1 }, 'paid');
  });

  it(`refuses change the tray's ${TRAY_PIECES_MAX} pieces (one hop each) cannot make`, () => {
    const pennies = { penny: 'unlimited' as const };
    ok(makeChange, { ...change, price: 100 - TRAY_PIECES_MAX, paid: 100, purse: pennies });
    refused(
      makeChange,
      { ...change, price: 100 - TRAY_PIECES_MAX - 1, paid: 100, purse: pennies },
      'purse',
    );
    refused(makeChange, { ...change, purse: { dime: 'unlimited' } }, 'purse');
    refused(makeChange, { ...change, purse: {} }, 'purse');
  });

  it('the count-up never takes more hops than the tray holds', () => {
    const c = {
      ...change,
      price: 100 - TRAY_PIECES_MAX,
      paid: 100,
      purse: { penny: 'unlimited' as const },
    };
    let s = makeChange.initialState(c);
    for (let i = 1; i <= TRAY_PIECES_MAX + 4; i++) {
      s = makeChange.apply(s, act('count-up', { to: c.price + Math.min(i, TRAY_PIECES_MAX + 4) }));
    }
    expect(s.order).toHaveLength(TRAY_PIECES_MAX);
    expect(s.counted).toBe(100);
  });
});
