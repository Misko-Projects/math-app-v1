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
  PURSE_NARROW_UNITS_MAX,
  stimulusSpecSchema,
  TRAY_NARROW_PIECES_MAX,
  TRAY_PIECES_MAX,
  type WidgetAction,
  type WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { AMPM_SCENES, clockRead, isDaylight } from './clock-read';
import { clockSet } from './clock-set';
import { coinCount, MAX_COMPARE_SLOTS, MAX_COUNT_CENTS } from './coin-count';
import { coinPay, MAX_TRAY_PIECES, payTrayCapacity } from './coin-pay';
import { changeTrayCapacity, countUpPath, makeChange } from './make-change';
import { fewestPieces, purseUnits, trayPieces, waysToPay } from './money';
import { misplacedTimeMoneyPictures } from './pictures';
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

describe('clock-set: every op answers a time the hands can show (PR #101 review 1)', () => {
  it.each([60, 30, 15, 5] as const)(
    'the generic answer op refuses a minute off the %i-minute grid',
    (precision) => {
      const c = { ...set, precision, target: { h: 3, m: 0 }, start: { h: 12, m: 0 } };
      const start = clockSet.initialState(c);
      for (const args of [{ h: 3, m: 7 }, { values: [3, 7] }, { h: 3, m: 59 }]) {
        const s = clockSet.apply(start, act('answer', args));
        // Nothing moves and nothing is answered.
        expect(s.t).toBe(start.t);
        expect(clockSet.toResponse(s)).toBeNull();
      }
      const on = clockSet.apply(start, act('answer', { h: 3, m: 0 }));
      expect(clockSet.toResponse(on)).toEqual({ kind: 'state', value: { h: 3, m: 0 } });
    },
  );

  it('whatever ops are replayed, the response minute is on the precision grid', () => {
    for (const precision of [60, 30, 15, 5, 1] as const) {
      const c = { ...set, precision, target: { h: 3, m: 0 }, start: { h: 12, m: 0 } };
      let s = clockSet.initialState(c);
      const ops = [
        act('answer', { h: 4, m: 13 }),
        act('drag-minute', { to: 22.4 }),
        act('answer', { values: [9, 41] }),
        act('drag-hour', { to: 7 }),
        act('answer', { h: 23, m: 1 }),
        act('drag-minute', { to: 58, dir: 'ccw' }),
      ];
      for (const op of ops) {
        s = clockSet.apply(s, op);
        const r = clockSet.toResponse(s);
        if (r?.kind === 'state') expect((r.value as { m: number }).m % precision).toBe(0);
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

describe('clock-read a.m. / p.m.: the scene is the clue (PR #101 reviews 1 and 2)', () => {
  const ampm = (scene: string, h: number, isPm: boolean) => ({
    ...read,
    time: { h, m: 0 },
    input: 'pick' as const,
    ampm: { scene, isPm },
  });

  it('every scene happens in one half of the day, so naming it answers a.m. or p.m.', () => {
    for (const [scene, hours] of Object.entries(AMPM_SCENES)) {
      expect(hours.from, scene).toBeLessThanOrEqual(hours.to);
      // Never across noon or midnight.
      expect(hours.from >= 12, scene).toBe(hours.to >= 12);
    }
    expect(Object.keys(AMPM_SCENES)).toEqual([
      'wake-up',
      'breakfast',
      'lunch',
      'dinner',
      'bedtime',
    ]);
  });

  it('accepts a daily event at a time it happens, with the half of the day it is in', () => {
    ok(clockRead, ampm('breakfast', 7, false));
    ok(clockRead, ampm('wake-up', 5, false));
    ok(clockRead, ampm('lunch', 12, true));
    ok(clockRead, ampm('dinner', 17, true));
    ok(clockRead, ampm('bedtime', 19, true));
  });

  it('refuses a scene that is not a daily event, a wrong half of the day, and an hour the event does not happen at', () => {
    refused(clockRead, ampm('beach', 7, false), 'ampm.scene');
    refused(clockRead, ampm('breakfast', 7, true), 'ampm.isPm');
    refused(clockRead, ampm('dinner', 17, false), 'ampm.isPm');
    // 5 in the afternoon is not breakfast time, and 5 in the morning is not dinner time: the two
    // 5:00s (the case a sky alone cannot settle) are told apart by what is happening.
    refused(clockRead, ampm('breakfast', 17, true), 'ampm.scene');
    refused(clockRead, ampm('dinner', 5, false), 'ampm.scene');
    ok(clockRead, ampm('wake-up', 5, false));
  });

  it('the sky drawn beside the scene differs between the two times of day of any face time', () => {
    for (let h = 0; h < 12; h++) expect(isDaylight(h)).not.toBe(isDaylight(h + 12));
    expect(isDaylight(7)).toBe(true);
    expect(isDaylight(19)).toBe(false);
  });
});

describe('a clock or coins stimulus is not shown in any format yet (PR #101 reviews 1 and 2)', () => {
  const clock = { kind: 'clock', h: 3, m: 0, numerals: true };
  const coins = { kind: 'coins', coins: ['penny', 'dime'] };

  it("a format's own picture is reported too: no layout is proven to hold one", () => {
    expect(
      misplacedTimeMoneyPictures({ widget: { format: 'number-pad', stimulus: clock } }),
    ).toEqual(['widget.stimulus']);
    expect(
      misplacedTimeMoneyPictures({ widget: { format: 'numeral-pick', stimulus: clock } }),
    ).toEqual(['widget.stimulus']);
    expect(
      misplacedTimeMoneyPictures({ widget: { format: 'number-pad', stimulus: coins } }),
    ).toEqual(['widget.stimulus']);
  });

  it('a choice card, a compare side, an order card and a hint overlay are reported with their paths', () => {
    expect(
      misplacedTimeMoneyPictures({
        widget: {
          format: 'numeral-pick',
          options: [
            { id: 'a', stimulus: clock },
            { id: 'b', stimulus: clock },
          ],
        },
      }),
    ).toEqual(['widget.options.0.stimulus', 'widget.options.1.stimulus']);
    expect(
      misplacedTimeMoneyPictures({
        widget: { format: 'compare', left: coins, right: coins, ask: 'more' },
      }),
    ).toEqual(['widget.left', 'widget.right']);
    expect(
      misplacedTimeMoneyPictures({
        widget: { format: 'order', items: [{ id: 'a', stimulus: clock }] },
      }),
    ).toEqual(['widget.items.0.stimulus']);
    expect(
      misplacedTimeMoneyPictures({ widget: { format: 'number-pad' }, hints: [{ overlay: coins }] }),
    ).toEqual(['hints.0.overlay']);
  });

  it('the clock and coin formats, which draw their own clock and coins, carry no such picture', () => {
    expect(misplacedTimeMoneyPictures({ widget: set })).toEqual([]);
    expect(misplacedTimeMoneyPictures({ widget: count })).toEqual([]);
    expect(misplacedTimeMoneyPictures({ widget: pay })).toEqual([]);
    expect(misplacedTimeMoneyPictures({ widget: change })).toEqual([]);
    expect(misplacedTimeMoneyPictures({ widget: { ...read, time: { h: 3, m: 0 } } })).toEqual([]);
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

  it(`a new-way purse is one row: at most ${PURSE_NARROW_UNITS_MAX} stack units (the bill is 2)`, () => {
    const c = { ...pay, target: 130, mode: 'new-way' as const };
    expect(purseUnits({ dollar: 1, quarter: 2, dime: 3 })).toBe(4);
    expect(purseUnits({ dollar: 1, quarter: 2, dime: 3, nickel: 0 })).toBe(4);
    ok(coinPay, { ...c, purse: { dollar: 1, quarter: 2, dime: 3 } });
    ok(coinPay, { ...c, target: 40, purse: { quarter: 1, dime: 3, nickel: 6, penny: 5 } });
    refused(coinPay, { ...c, purse: { dollar: 1, quarter: 2, dime: 3, nickel: 2 } }, 'purse');
    // Paying (no list of ways beside the purse) has the room for the bill and all four coins.
    ok(coinPay, {
      ...c,
      mode: 'pay',
      purse: { dollar: 1, quarter: 2, dime: 3, nickel: 2, penny: 5 },
    });
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
    // A dime and four nickels is the longest way a list shows; six nickels is too long.
    ok(coinPay, { ...c, found: ['q0d1n4p0'] });
    refused(coinPay, { ...c, found: ['q0d0n6p0'] }, 'found.0');
    refused(coinPay, { ...c, found: ['q0d0n5p5'] }, 'found.0');
    expect(COIN_FOUND_WAY_PIECES_MAX).toBeLessThanOrEqual(TRAY_NARROW_PIECES_MAX);
  });

  it(`a new-way tray holds ${TRAY_NARROW_PIECES_MAX} pieces (one row beside the ways found)`, () => {
    expect(payTrayCapacity({ mode: 'new-way' })).toBe(TRAY_NARROW_PIECES_MAX);
    expect(payTrayCapacity({ mode: 'pay' })).toBe(TRAY_PIECES_MAX);
    // 20¢ from dimes and pennies: 2 dimes, a dime and 10 pennies (11 pieces), or 20 pennies.
    const c = {
      ...pay,
      target: 20,
      mode: 'new-way' as const,
      purse: { dime: 2, penny: 'unlimited' as const },
    };
    ok(coinPay, c);
    // Once the two dimes are found, every way left is too long for the tray.
    refused(coinPay, { ...c, found: ['q0d2n0p0'] }, 'found');
    // An amount whose shortest way is too long is refused outright.
    refused(
      coinPay,
      { ...c, target: TRAY_NARROW_PIECES_MAX + 1, purse: { penny: 'unlimited' } },
      'purse',
    );
    ok(coinPay, { ...c, target: TRAY_NARROW_PIECES_MAX, purse: { penny: 'unlimited' } });
    // Drops stop at the tray's size.
    let st = coinPay.initialState({ ...c, target: 6, purse: { penny: 'unlimited' } });
    for (let i = 0; i < 9; i++) st = coinPay.apply(st, act('drop', { coin: 'penny' }));
    expect(st.order).toHaveLength(TRAY_NARROW_PIECES_MAX);
    const before = coinPay.initialState({ ...c, target: 6, purse: { penny: 'unlimited' } });
    expect(coinPay.apply(before, act('answer', { coins: { penny: 7 } })).order).toEqual([]);
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

  it(`refuses change the tray's ${TRAY_NARROW_PIECES_MAX} pieces (one hop each) cannot make, with or without the line`, () => {
    const pennies = { penny: 'unlimited' as const };
    for (const countUpLine of [true, false]) {
      expect(changeTrayCapacity({ countUpLine })).toBe(TRAY_NARROW_PIECES_MAX);
      const cap = TRAY_NARROW_PIECES_MAX;
      ok(makeChange, { ...change, countUpLine, price: 100 - cap, paid: 100, purse: pennies });
      refused(
        makeChange,
        { ...change, countUpLine, price: 100 - cap - 1, paid: 100, purse: pennies },
        'purse',
      );
    }
    refused(makeChange, { ...change, purse: { dime: 'unlimited' } }, 'purse');
    refused(makeChange, { ...change, purse: {} }, 'purse');
  });

  it(`the purse is one row, at most ${PURSE_NARROW_UNITS_MAX} stack units (the bill is 2), with or without the line`, () => {
    const bills = { ...change, price: 85, paid: 200 };
    const billAndThree = { dollar: 2, quarter: 12, dime: 12, nickel: 12 };
    const everything = { dollar: 12, quarter: 12, dime: 12, nickel: 12, penny: 12 };
    for (const countUpLine of [true, false]) {
      ok(makeChange, {
        ...bills,
        countUpLine,
        purse: { dollar: 2, dime: 'unlimited', nickel: 'unlimited' },
      });
      ok(makeChange, {
        ...change,
        countUpLine,
        purse: { quarter: 12, dime: 12, nickel: 12, penny: 12 },
      });
      refused(makeChange, { ...bills, countUpLine, purse: billAndThree }, 'purse');
      refused(makeChange, { ...change, countUpLine, price: 75, purse: everything }, 'purse');
    }
    // PR #101 review 2: the accepted no-line board with twelve pieces of change (six bills and
    // two each of three coins) is refused now, for its purse and for its change.
    const big = { ...change, countUpLine: false, price: 320, paid: 1000 };
    refused(makeChange, { ...big, purse: billAndThree }, 'purse');
    refused(makeChange, { ...big, purse: { dollar: 12, quarter: 12 } }, 'purse');
  });

  it('the count-up an item teaches: smallest pieces first to each next step', () => {
    const all = {
      quarter: 'unlimited',
      dime: 'unlimited',
      nickel: 'unlimited',
      penny: 'unlimited',
    } as const;
    expect(countUpPath({ price: 65, paid: 100, purse: all })).toEqual([
      'nickel',
      'dime',
      'dime',
      'dime',
    ]);
    expect(countUpPath({ price: 35, paid: 100, purse: all })).toEqual([
      'nickel',
      'dime',
      'quarter',
      'quarter',
    ]);
    expect(countUpPath({ price: 34, paid: 100, purse: all })).toEqual([
      'penny',
      'nickel',
      'dime',
      'quarter',
      'quarter',
    ]);
    expect(countUpPath({ price: 85, paid: 200, purse: { dollar: 2, dime: 3, nickel: 3 } })).toEqual(
      ['nickel', 'dime', 'dollar'],
    );
    // The purse runs out, or has no piece for the next step: no count-up.
    expect(countUpPath({ price: 65, paid: 100, purse: { dime: 'unlimited' } })).toBeNull();
    expect(countUpPath({ price: 96, paid: 100, purse: { penny: 3, nickel: 1 } })).toBeNull();
    // It never passes the amount paid.
    expect(countUpPath({ price: 99, paid: 100, purse: { dollar: 1, penny: 5 } })).toEqual([
      'penny',
    ]);
  });

  it('refuses an item whose taught count-up does not fit the tray, though its fewest pieces do (no dead ends)', () => {
    const all = {
      quarter: 'unlimited',
      dime: 'unlimited',
      nickel: 'unlimited',
      penny: 'unlimited',
    } as const;
    const issuesOf = (price: number) => {
      const r = makeChange.configSchema.safeParse({ ...change, price, purse: all });
      return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    };
    // 73¢ paid with $1.00: two pennies to 75¢, then a quarter. Three pieces: accepted.
    expect(issuesOf(73)).toEqual([]);
    // 20¢: a nickel to 25¢, then three quarters. Four pieces: accepted.
    expect(issuesOf(20)).toEqual([]);
    // 26¢: even the fewest pieces (2 quarters, 2 dimes, 4 pennies) are over the tray.
    expect(issuesOf(26).join(' ')).toContain('the tray holds');
    // 10¢: the fewest pieces fit (3 quarters, a dime, a nickel: 5), but counting up is four dimes
    // to 50¢ and two quarters, 6 pieces: refused for the count-up, which is the path taught.
    const path = countUpPath({ price: 10, paid: 100, purse: all }) as string[];
    expect(path).toEqual(['dime', 'dime', 'dime', 'dime', 'quarter', 'quarter']);
    expect(path.length).toBeGreaterThan(changeTrayCapacity());
    expect(issuesOf(10).some((i) => i.startsWith('price:') && i.includes('counting up'))).toBe(
      true,
    );
    // Every accepted item can be finished by its count-up inside the tray.
    for (let price = 1; price < 100; price++) {
      const config = { ...change, price, purse: all };
      if (!makeChange.configSchema.safeParse(config).success) continue;
      const steps = countUpPath(config) as string[];
      expect(steps.length, `${price}¢`).toBeLessThanOrEqual(changeTrayCapacity());
      let st = makeChange.initialState(config);
      let at = price;
      for (const k of steps) {
        at += { penny: 1, nickel: 5, dime: 10, quarter: 25, dollar: 100 }[k] as number;
        st = makeChange.apply(st, act('count-up', { to: at }));
      }
      expect(st.order, `${price}¢`).toHaveLength(steps.length);
      expect(st.counted).toBe(100);
    }
  });

  it('the count-up never takes more hops than the tray holds', () => {
    for (const countUpLine of [true, false]) {
      const cap = changeTrayCapacity({ countUpLine });
      const c = {
        ...change,
        countUpLine,
        price: 100 - cap,
        paid: 100,
        purse: { penny: 'unlimited' as const },
      };
      let s = makeChange.initialState(c);
      for (let i = 1; i <= cap + 4; i++)
        s = makeChange.apply(s, act('count-up', { to: c.price + i }));
      expect(s.order).toHaveLength(cap);
      expect(s.counted).toBe(100);
      // A drop into the full tray does nothing; one back makes room again.
      s = makeChange.apply(s, act('drop', { coin: 'penny' }));
      expect(s.order).toHaveLength(cap);
      s = makeChange.apply(s, act('drop', { coin: 'penny', to: 'purse' }));
      s = makeChange.apply(s, act('drop', { coin: 'penny' }));
      expect(s.order).toHaveLength(cap);
    }
  });
});
