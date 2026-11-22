// coins.total and coins.fewest (03 §5.5 coin-pay, make-change; §5.7): any coins worth the cents,
// within the purse, not a way already found; coins.fewest also needs the fewest pieces the purse
// allows. Table-driven, with alternative valid end states and near misses.

import { describe, expect, it } from 'vitest';
import { canonicalKey, fewestPieces, parseTrayKey, trayKey, waysToPay } from '../../formats/money';
import { stateChecker } from './index';

type Rec = Record<string, unknown>;

const coins = (q: number, d: number, n: number, p: number, dollar?: number): Rec => ({
  coins: { quarter: q, dime: d, nickel: n, penny: p, ...(dollar === undefined ? {} : { dollar }) },
});

const T40 = { cents: 40 };
const SMALL_PURSE = { quarter: 1, dime: 3, nickel: 0, penny: 'unlimited' };

/** [case, target, value, expected] */
const TOTAL: [string, Rec, Rec, boolean][] = [
  ['quarter, dime and nickel make 40¢', T40, coins(1, 1, 1, 0), true],
  ['alternative: four dimes', T40, coins(0, 4, 0, 0), true],
  ['alternative: eight nickels', T40, coins(0, 0, 8, 0), true],
  ['alternative: forty pennies', T40, coins(0, 0, 0, 40), true],
  ['kinds left out of the response read as none', T40, { coins: { dime: 4 } }, true],
  ['one penny short', T40, coins(1, 1, 0, 4), false],
  ['one nickel over', T40, coins(1, 1, 2, 0), false],
  ['empty tray', T40, coins(0, 0, 0, 0), false],
  ['a dollar bill is 100¢', { cents: 125 }, coins(1, 0, 0, 0, 1), true],
  ['alternative: five quarters for 125¢', { cents: 125 }, coins(5, 0, 0, 0, 0), true],
  ['a negative count is not a tray', T40, coins(2, -1, 0, 0), false],
  ['a fractional count is not a tray', T40, coins(0, 4, 0, 0.5), false],
  ['an unknown coin kind is not a tray', T40, { coins: { dime: 4, doubloon: 0 } }, false],
  ['no coins field', T40, { quarter: 1, dime: 1, nickel: 1 }, false],
  ['coins as an array', T40, { coins: ['quarter', 'dime', 'nickel'] }, false],
  ['malformed target', { cents: 'forty' }, coins(1, 1, 1, 0), false],
  ['zero cents is never a target', { cents: 0 }, coins(0, 0, 0, 0), false],
  // Purse limits
  ['within the purse', { cents: 30, purse: SMALL_PURSE }, coins(0, 3, 0, 0), true],
  [
    'alternative within the purse: quarter and five pennies',
    { cents: 30, purse: SMALL_PURSE },
    coins(1, 0, 0, 5),
    true,
  ],
  ['a nickel the purse does not have', { cents: 30, purse: SMALL_PURSE }, coins(1, 0, 1, 0), false],
  ['more dimes than the purse holds', { cents: 40, purse: SMALL_PURSE }, coins(0, 4, 0, 0), false],
  [
    'a dollar bill from a purse with no bills',
    { cents: 100, purse: SMALL_PURSE },
    coins(0, 0, 0, 0, 1),
    false,
  ],
  // new-way (PUZ.09): the multiset must not be found already
  ['new way: not found yet', { cents: 30, found: ['q1d0n1p0', 'd3'] }, coins(0, 3, 0, 0), true],
  [
    'new way: already found',
    { cents: 30, found: ['q1d0n1p0', 'q0d3n0p0'] },
    coins(0, 3, 0, 0),
    false,
  ],
  [
    'new way: found keys with b0 still match',
    { cents: 30, found: ['b0q0d3n0p0'] },
    coins(0, 3, 0, 0),
    false,
  ],
  [
    'new way: the order coins went in does not make a new way',
    { cents: 30, found: ['q1d0n1p0'] },
    { coins: { nickel: 1, quarter: 1 } },
    false,
  ],
  ['new way: an empty found list', { cents: 30, found: [] }, coins(1, 0, 1, 0), true],
];

const FEWEST: [string, Rec, Rec, boolean][] = [
  ['40¢ fewest is quarter, dime, nickel', T40, coins(1, 1, 1, 0), true],
  ['four dimes are 40¢ but not the fewest', T40, coins(0, 4, 0, 0), false],
  ['a penny short', T40, coins(1, 1, 0, 4), false],
  // US coins have one fewest way for every amount and purse we draw (a brute-force search found no
  // tie), so the alternatives here are other ways to write the same end state.
  [
    'alternative: the same tray with kinds left out and a zero dollar count',
    T40,
    { coins: { nickel: 1, dime: 1, quarter: 1, dollar: 0 } },
    true,
  ],
  [
    'only kinds the purse lists count: 30¢ from dimes and nickels is three dimes',
    { cents: 30, purse: { dime: 'unlimited', nickel: 'unlimited' } },
    coins(0, 3, 0, 0),
    true,
  ],
  [
    'the purse decides the fewest: no nickels, one quarter → three dimes',
    { cents: 30, purse: SMALL_PURSE },
    coins(0, 3, 0, 0),
    true,
  ],
  [
    'quarter and five pennies pay 30¢ from that purse, but with more pieces',
    { cents: 30, purse: SMALL_PURSE },
    coins(1, 0, 0, 5),
    false,
  ],
  [
    'with dollar bills, $1.25 is a bill and a quarter',
    { cents: 125, purse: { dollar: 2, quarter: 'unlimited' } },
    coins(1, 0, 0, 0, 1),
    true,
  ],
  [
    'five quarters are $1.25 but not the fewest when there is a bill',
    { cents: 125, purse: { dollar: 2, quarter: 'unlimited' } },
    coins(5, 0, 0, 0, 0),
    false,
  ],
  [
    'without a purse there are no bills: five quarters is the fewest for 125¢',
    { cents: 125 },
    coins(5, 0, 0, 0),
    true,
  ],
  ['fewest, but already found', { cents: 40, found: ['q1d1n1p0'] }, coins(1, 1, 1, 0), false],
];

describe('coins.total (03 §5.5 coin-pay, make-change)', () => {
  const c = stateChecker('coins.total');
  it('is registered', () => expect(c?.id).toBe('coins.total'));
  it.each(TOTAL)('%s', (_name, target, value, expected) => {
    expect(c?.check(target, value)).toBe(expected);
  });
});

describe('coins.fewest (03 §5.5 coin-pay requireFewest)', () => {
  const c = stateChecker('coins.fewest');
  it('is registered', () => expect(c?.id).toBe('coins.fewest'));
  it.each(FEWEST)('%s', (_name, target, value, expected) => {
    expect(c?.check(target, value)).toBe(expected);
  });
});

describe('money helpers', () => {
  it('fewestPieces is the bounded change-making minimum', () => {
    const all = {
      penny: 'unlimited',
      nickel: 'unlimited',
      dime: 'unlimited',
      quarter: 'unlimited',
    };
    expect(fewestPieces(41, all as never)).toBe(4); // q d n p
    expect(fewestPieces(99, all as never)).toBe(9); // 3q 2d 4p
    expect(fewestPieces(30, { quarter: 1, dime: 3 })).toBe(3);
    expect(fewestPieces(30, { quarter: 1, dime: 2 })).toBeNull();
    expect(fewestPieces(0, {})).toBe(0);
  });
  it('trayKey and parseTrayKey round-trip; b0 is dropped', () => {
    expect(trayKey({ quarter: 1 })).toBe('q1d0n0p0');
    expect(trayKey({ dollar: 2, dime: 3 })).toBe('b2q0d3n0p0');
    expect(parseTrayKey('b2q0d3n0p0')).toEqual({
      dollar: 2,
      quarter: 0,
      dime: 3,
      nickel: 0,
      penny: 0,
    });
    expect(canonicalKey('b0q1d0n0p0')).toBe('q1d0n0p0');
    expect(parseTrayKey('q1d0')).toBeNull();
  });
  it('waysToPay lists every way once (30¢ from all coins: 18 ways)', () => {
    const all = {
      penny: 'unlimited',
      nickel: 'unlimited',
      dime: 'unlimited',
      quarter: 'unlimited',
    };
    const ways = waysToPay(30, all as never);
    expect(ways).toHaveLength(18);
    expect(new Set(ways.map(trayKey)).size).toBe(18);
  });
});
