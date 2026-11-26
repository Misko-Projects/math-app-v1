// money.coins (03 §5.6): US coins and the dollar bill. Formats: numeral-pick, number-pad,
// coin-count, coin-pay, order. `mode`:
// - `identify` (MON.01): one coin (`coin`) drawn as a silent picture (a coins stimulus speaks
//   nothing on tap; coin-count and coin-pay pieces say "a dime, 10 cents", so identify never uses
//   them). numeral-pick offers the four values 1¢, 5¢, 10¢ and 25¢ (the same set for every coin);
//   number-pad asks the value in cents, under the picture (pictorial) or with the coin named in
//   the prompt and no picture (abstract: `coinVar` gives the prompt the coin's word).
// - `count` (MON.02, MON.04): a purse of `q` quarters, `d` dimes, `n` nickels and `p` pennies on
//   coin-count (`arrangement` sorted, biggest value first, or mixed); answer the total in cents.
// - `pay` (MON.04, MON.05, MON.06): coin-pay `cents` from a purse of the kinds in `kinds`
//   (letters q, d, n, p and $ for the dollar bill, each unlimited); any coins that make the amount
//   are right (`coins.total`). `runningTotal` shows the tray's total.
// - `compare` (MON.08): two purses on coin-count (`compareWith`), `a` cents on the left and `b` on
//   the right, never equal; which has more? Each purse is the fewest coins for its amount, except
//   with `conflict`, where the purse with less money is paid in dimes, nickels and pennies and so
//   has more coins than the other (counting coins instead of values picks it). On order (MON.08's
//   constructed practice): three purses `a`, `b`, `c` (distinct), fewest coins each, put least
//   money first; the abstract tier labels each card with its amount and draws no coins.
// - `dollars` (MON.06): coin-count with `bills` one-dollar bills and the coins `q, d, n, p`,
//   answered in dollars and cents ([d, c] on a `$ _ . _ _` pad); numeral-pick asks which of three
//   writings is right: `$d.cc` (right), `$dcc` (the dot left out) and `$d.cc¢` (both signs).
// - `ways` (PUZ.09, K02 slice 4e): ways to pay `cents` from the unlimited kinds in `kinds`. A way
//   is a set of coins: the same coins in another order are the same way. coin-pay `new-way`: the
//   ways of at most TRAY_NARROW_PIECES_MAX pieces, fewest pieces first (`waysList`); the first
//   `found` of them are listed as found and the child makes another one. number-pad: how many
//   ways there are (any number of pieces), with one coin of each kind pictured.
// MON.07 (make change) will add `change`.
//
// The coins of every item come from its params alone (counts or amounts), so the format features
// coin-count and coin-pay compute (03 §5.5) are a function of the params (03 §5.4).

import type {
  CoinKind,
  LessonStep,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import {
  COIN_FOUND_MAX,
  COIN_SLOTS_MAX,
  PURSE_NARROW_UNITS_MAX,
  TRAY_NARROW_PIECES_MAX,
  TRAY_PIECES_MAX,
} from '@number-island/shared';
import {
  fewestPieces,
  PIECE_CENTS,
  type Purse,
  type Tray,
  trayKey,
  trayPieces,
  waysToPay,
} from '../../formats/money';
import { numberOptionId } from '../../formats/numeral-pick';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const MODES = ['identify', 'count', 'pay', 'compare', 'dollars', 'ways'] as const;
const COINS = ['penny', 'nickel', 'dime', 'quarter'] as const;
const ARRANGEMENTS = ['sorted', 'mixed'] as const;
/** Coins biggest value first (the sorted order, and the greedy order). */
const BIG_FIRST: readonly CoinKind[] = ['quarter', 'dime', 'nickel', 'penny'];
const VALUE: Readonly<Record<CoinKind, number>> = { penny: 1, nickel: 5, dime: 10, quarter: 25 };
const LETTER: Readonly<Record<string, CoinKind | 'dollar'>> = {
  q: 'quarter',
  d: 'dime',
  n: 'nickel',
  p: 'penny',
  $: 'dollar',
};

/** The most coins one counted purse shows (coin-count, one purse): it fits 960 × 600. */
export const COUNT_COINS_MAX = 10;
/** The most coins each of two compared purses shows (side by side). */
export const COMPARE_COINS_MAX = 6;
/** The most coins an order card's purse shows (three cards in a row). */
export const ORDER_COINS_MAX = 4;
/** The most a pay or count item asks for, in cents ($2.00). */
export const MONEY_COINS_CENTS_MAX = 200;
/** The most one-dollar bills a dollars item draws. */
export const BILLS_MAX = 1;

/** The fewest coins making `cents` (US coins: biggest first is fewest). */
export function fewestCoins(cents: number, kinds: readonly CoinKind[] = BIG_FIRST): CoinKind[] {
  const out: CoinKind[] = [];
  let left = cents;
  for (const k of BIG_FIRST) {
    if (!kinds.includes(k)) continue;
    while (left >= VALUE[k]) {
      out.push(k);
      left -= VALUE[k];
    }
  }
  return left === 0 ? out : [];
}

/** The coins of a purse given by counts, biggest value first. */
export function purseCoins(q: number, d: number, n: number, p: number): CoinKind[] {
  return [
    ...new Array<CoinKind>(q).fill('quarter'),
    ...new Array<CoinKind>(d).fill('dime'),
    ...new Array<CoinKind>(n).fill('nickel'),
    ...new Array<CoinKind>(p).fill('penny'),
  ];
}

export const centsOf = (coins: readonly CoinKind[]): number =>
  coins.reduce((s, c) => s + VALUE[c], 0);

/** The purse of a pay item: each kind in `kinds` (q, d, n, p, $), unlimited. */
export function payPurse(kinds: string): Purse {
  const purse: Purse = {};
  for (const ch of kinds) {
    const k = LETTER[ch];
    if (k) purse[k] = 'unlimited';
  }
  return purse;
}

/** The most ways a `ways` item asks a child to count (number-pad). */
export const WAYS_COUNT_MAX = 6;

/** The ways of a `ways` item on coin-pay: at most a narrow tray's pieces, fewest first, by key. */
export function waysList(cents: number, kinds: string): Tray[] {
  return waysToPay(cents, payPurse(kinds), 5000, TRAY_NARROW_PIECES_MAX).sort(
    (x, y) => trayPieces(x) - trayPieces(y) || trayKey(x).localeCompare(trayKey(y)),
  );
}

/** How many ways pay `cents` from the kinds (any number of pieces). */
export const waysCount = (cents: number, kinds: string): number =>
  waysToPay(cents, payPurse(kinds), 5000).length;

/** The two purses of a compare item: the fewest coins each, or the poorer in small coins. */
export function comparePurses(a: number, b: number, conflict: boolean): [CoinKind[], CoinKind[]] {
  const left = fewestCoins(a);
  const right = fewestCoins(b);
  if (!conflict) return [left, right];
  const small: CoinKind[] = ['dime', 'nickel', 'penny'];
  return a < b ? [fewestCoins(a, small), right] : [left, fewestCoins(b, small)];
}

/** The three writings of an amount (dollars items on numeral-pick): right, no dot, both signs. */
export function writings(cents: number): { id: string; label: string }[] {
  const d = Math.floor(cents / 100);
  const c = String(cents % 100).padStart(2, '0');
  return [
    { id: 'w-right', label: `$${d}.${c}` },
    { id: 'w-nodot', label: `$${d}${c}` },
    { id: 'w-both', label: `$${d}.${c}¢` },
  ];
}

const coinsPicture = (coins: CoinKind[], bills: number[] = []): StimulusSpec =>
  bills.length > 0 ? { kind: 'coins', coins, bills } : { kind: 'coins', coins };

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const ints = (p: ParamValues, ...names: string[]) => names.map((k) => asNum(p[k], 0));

export const moneyCoins: GeneratorDef = {
  id: 'money.coins',
  formats: ['numeral-pick', 'number-pad', 'coin-count', 'coin-pay', 'order'],
  params: {
    mode: {
      type: 'string',
      values: [...MODES],
      // Templates always set it; the choice lets every format build from defaults.
      default: { kind: 'choice', values: [...MODES] },
      doc: 'identify, count, pay, compare, dollars or ways (MON.07 will add change)',
    },
    coin: {
      type: 'string',
      values: [...COINS],
      default: { kind: 'choice', values: [...COINS] },
      doc: 'identify: the coin shown or named',
    },
    q: { type: 'int', default: { kind: 'const', value: 0 }, doc: 'count, dollars: quarters' },
    d: { type: 'int', default: { kind: 'const', value: 0 }, doc: 'count, dollars: dimes' },
    n: { type: 'int', default: { kind: 'const', value: 0 }, doc: 'count, dollars: nickels' },
    p: { type: 'int', default: { kind: 'const', value: 0 }, doc: 'count, dollars: pennies' },
    bills: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: `dollars: one-dollar bills (0–${BILLS_MAX})`,
    },
    arrangement: {
      type: 'string',
      values: [...ARRANGEMENTS],
      default: { kind: 'const', value: 'sorted' },
      doc: 'coin-count: coins biggest value first, or mixed',
    },
    cents: {
      type: 'int',
      default: { kind: 'int', min: 5, max: 95, step: 5 },
      doc: `pay: the amount to pay (1–${MONEY_COINS_CENTS_MAX}); dollars on numeral-pick: the amount`,
    },
    kinds: {
      type: 'string',
      default: { kind: 'const', value: 'qdnp' },
      doc: 'pay: the purse, letters q, d, n, p and $ (each unlimited)',
    },
    found: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 2 },
      doc: 'ways on coin-pay: ways already listed as found (1 to COIN_FOUND_MAX)',
    },
    runningTotal: {
      type: 'bool',
      default: { kind: 'const', value: true },
      doc: 'pay: the tray shows its total',
    },
    a: {
      type: 'int',
      default: { kind: 'int', min: 5, max: 60 },
      doc: 'compare: left purse, cents',
    },
    b: {
      type: 'int',
      default: { kind: 'int', min: 5, max: 60 },
      doc: 'compare: right purse, cents',
    },
    c: { type: 'int', default: { kind: 'int', min: 5, max: 60 }, doc: 'order: third purse, cents' },
    conflict: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'compare: the purse with less money has more coins',
    },
  },
  derived: ['value'],
  features: {
    kinds: { weight: 0.3, doc: 'ways: coin kinds in the purse − 2' },
    found: { weight: -0.2, doc: 'ways on coin-pay: ways listed as found − 1 (fewer left to try)' },
    waysOver3: { weight: 0.3, doc: 'ways on number-pad: ways to count − 3' },
    conflict: { weight: 0.5, doc: 'compare: the purse with less money has more coins' },
    'coin.confusable': {
      weight: 0.3,
      doc: 'identify: a nickel or a dime (the bigger coin is worth less)',
    },
  },
  narration: [
    'gen.money.coins.option',
    'gen.money.coins.look',
    'gen.money.coins.worth',
    'gen.money.coins.sort',
    'gen.money.coins.count-on',
    'gen.money.coins.total',
    'gen.money.coins.total-dollars',
    'gen.money.coins.drop',
    'gen.money.coins.paid',
    'gen.money.coins.count-purse',
    'gen.money.coins.compare-amounts',
    'gen.money.coins.more',
    'gen.money.coins.least-first',
    'gen.money.coins.next',
    'gen.money.coins.writing',
    'gen.money.coins.ways-big-first',
    'gen.money.coins.ways-count',
    'gen.money.coins.ways-look',
    'gen.money.coins.ways-new',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    const mode = asStr(p.mode);
    if (mode === 'identify') return { value: VALUE[asStr(p.coin) as CoinKind] ?? 0 };
    if (mode === 'count' || mode === 'dollars') {
      const [q, d, n, pn, bills] = ints(p, 'q', 'd', 'n', 'p', 'bills') as number[];
      const total =
        100 * (bills as number) +
        centsOf(purseCoins(q as number, d as number, n as number, pn as number));
      // A dollars writing pick (numeral-pick) draws no purse: its amount is `cents`.
      if (mode === 'dollars' && total === 0) return { value: asNum(p.cents) };
      return { value: total };
    }
    if (mode === 'pay') return { value: asNum(p.cents) };
    if (mode === 'ways') return { value: waysCount(asNum(p.cents), asStr(p.kinds)) };
    return { value: Math.max(asNum(p.a), asNum(p.b)) };
  },
  accepts(p, t) {
    const mode = asStr(p.mode);
    const f = t.format;
    const [q, d, n, pn, bills] = ints(p, 'q', 'd', 'n', 'p', 'bills') as number[];
    const counts = [q, d, n, pn, bills] as number[];
    if (counts.some((x) => !Number.isInteger(x) || x < 0)) return false;
    const coins = purseCoins(q as number, d as number, n as number, pn as number);
    switch (mode) {
      case 'identify':
        return (
          (f === 'numeral-pick' || f === 'number-pad') && COINS.includes(asStr(p.coin) as never)
        );
      case 'count':
        return (
          f === 'coin-count' &&
          bills === 0 &&
          coins.length >= 1 &&
          coins.length <= COUNT_COINS_MAX &&
          centsOf(coins) <= MONEY_COINS_CENTS_MAX
        );
      case 'dollars': {
        if (f === 'numeral-pick') {
          const cents = asNum(p.cents);
          return (
            coins.length === 0 &&
            bills === 0 &&
            Number.isInteger(cents) &&
            cents >= 1 &&
            cents <= MONEY_COINS_CENTS_MAX
          );
        }
        const total = 100 * (bills as number) + centsOf(coins);
        return (
          f === 'coin-count' &&
          (bills as number) <= BILLS_MAX &&
          coins.length >= 1 &&
          coins.length + 3 * (bills as number) <= COIN_SLOTS_MAX &&
          coins.length <= COUNT_COINS_MAX &&
          total <= MONEY_COINS_CENTS_MAX
        );
      }
      case 'ways': {
        const cents = asNum(p.cents);
        const kinds = asStr(p.kinds);
        if (!/^[qdnp]+$/.test(kinds) || new Set(kinds).size !== kinds.length) return false;
        if (kinds.length > PURSE_NARROW_UNITS_MAX) return false;
        if (!Number.isInteger(cents) || cents < 1 || cents > 100) return false;
        if (f === 'coin-pay') {
          // Something is listed as found, and at least one way is left to make.
          const found = asNum(p.found);
          return found >= 1 && found <= COIN_FOUND_MAX && waysList(cents, kinds).length > found;
        }
        if (f === 'number-pad') {
          const count = waysCount(cents, kinds);
          return count >= 2 && count <= WAYS_COUNT_MAX;
        }
        return false;
      }
      case 'pay': {
        const cents = asNum(p.cents);
        const purse = payPurse(asStr(p.kinds));
        if (f !== 'coin-pay' || Object.keys(purse).length === 0) return false;
        if (!Number.isInteger(cents) || cents < 1 || cents > MONEY_COINS_CENTS_MAX) return false;
        const fewest = fewestPieces(cents, purse);
        return fewest !== null && fewest <= TRAY_PIECES_MAX;
      }
      case 'compare': {
        const a = asNum(p.a);
        const b = asNum(p.b);
        if (![a, b].every((x) => Number.isInteger(x) && x >= 1 && x <= 99) || a === b) return false;
        if (f === 'coin-count') {
          const [l, r] = comparePurses(a, b, p.conflict === true);
          if (l.length === 0 || r.length === 0) return false;
          if (l.length > COMPARE_COINS_MAX || r.length > COMPARE_COINS_MAX) return false;
          // A conflict item's poorer purse really has more coins.
          if (p.conflict === true) return a < b ? l.length > r.length : r.length > l.length;
          return true;
        }
        if (f === 'order') {
          const c = asNum(p.c);
          if (!Number.isInteger(c) || c < 1 || c > 99 || c === a || c === b) return false;
          if (p.conflict === true) return false;
          // The abstract cards are labelled amounts and draw no coins.
          if (t.tier === 'abstract') return true;
          return [a, b, c].every((x) => fewestCoins(x).length <= ORDER_COINS_MAX);
        }
        return false;
      }
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const mode = asStr(params.mode);
    const value = asNum(params.value);
    const vars = pickVars(t, { cents: value, coin: asStr(params.coin) });
    const math: Record<string, number> = { conflict: 0, 'coin.confusable': 0 };
    let p: PartialOutput;
    if (mode === 'identify') {
      const coin = asStr(params.coin) as CoinKind;
      math['coin.confusable'] = coin === 'nickel' || coin === 'dime' ? 1 : 0;
      const abstract = t.tier === 'abstract';
      const stimulus: StimulusSpec = abstract ? { kind: 'none' } : coinsPicture([coin]);
      if (t.format === 'numeral-pick') {
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'numeral-pick',
            stimulus,
            options: [1, 5, 10, 25].map((v) => ({
              id: numberOptionId(v),
              label: `${v}¢`,
              speak: 'gen.money.coins.option',
              vars: { cents: v },
            })),
            layout: 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(value) },
        };
      } else {
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus,
            blanks: [{ id: 'x', maxDigits: 2 }],
            unit: 'cents',
          },
          answer: { kind: 'number', value },
        };
      }
      return finish(moneyCoins, ctx, p);
    }
    if (mode === 'count' || (mode === 'dollars' && t.format === 'coin-count')) {
      const [q, d, n, pn, bills] = ints(params, 'q', 'd', 'n', 'p', 'bills') as number[];
      const sorted = purseCoins(q as number, d as number, n as number, pn as number);
      const mixed = asStr(params.arrangement) === 'mixed';
      const coins = mixed ? rng.fork('layout').shuffle(sorted) : sorted;
      const dollars = mode === 'dollars';
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'coin-count',
          coins,
          bills: new Array<number>(bills as number).fill(1),
          arrangement: mixed ? 'mixed' : 'sorted',
          answerUnit: dollars ? 'dollars-cents' : 'cents',
        },
        answer: dollars
          ? { kind: 'numbers', values: [Math.floor(value / 100), value % 100], ordered: true }
          : { kind: 'number', value },
      };
      return finish(moneyCoins, ctx, p);
    }
    if (mode === 'dollars') {
      const shown = rng.fork('layout').shuffle(writings(value));
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'numeral-pick',
          stimulus: { kind: 'none' },
          options: shown.map((w) => ({ id: w.id, label: w.label })),
          layout: 'row',
        },
        answer: { kind: 'choice', id: 'w-right' },
      };
      return finish(moneyCoins, ctx, p);
    }
    if (mode === 'ways') {
      const cents = asNum(params.cents);
      const kinds = asStr(params.kinds);
      const purse = payPurse(kinds);
      const varsW = pickVars(t, { cents, n: value });
      if (t.format === 'number-pad') {
        const coins = BIG_FIRST.filter((k) => purse[k] !== undefined);
        p = {
          params,
          vars: varsW,
          math: { ...math, kinds: kinds.length - 2, waysOver3: Math.max(0, value - 3) },
          widget: {
            format: 'number-pad',
            stimulus: coinsPicture(coins),
            blanks: [{ id: 'x', maxDigits: 1 }],
          },
          answer: { kind: 'number', value },
        };
        return finish(moneyCoins, ctx, p);
      }
      const found = waysList(cents, kinds)
        .slice(0, asNum(params.found))
        .map((x) => trayKey(x));
      p = {
        params,
        vars: varsW,
        math: { ...math, kinds: kinds.length - 2, found: found.length - 1 },
        widget: {
          format: 'coin-pay',
          target: cents,
          purse,
          requireFewest: false,
          mode: 'new-way',
          found,
          showRunningTotal: true,
        },
        answer: { kind: 'state', checker: 'coins.total', target: { cents, purse, found } },
      };
      return finish(moneyCoins, ctx, p);
    }
    if (mode === 'pay') {
      const purse = payPurse(asStr(params.kinds));
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'coin-pay',
          target: value,
          purse,
          requireFewest: false,
          mode: 'pay',
          showRunningTotal: params.runningTotal !== false,
        },
        answer: { kind: 'state', checker: 'coins.total', target: { cents: value, purse } },
      };
      return finish(moneyCoins, ctx, p);
    }
    // compare
    const a = asNum(params.a);
    const b = asNum(params.b);
    const conflict = params.conflict === true;
    math.conflict = conflict ? 1 : 0;
    if (t.format === 'order') {
      const abstract = t.tier === 'abstract';
      const values = rng.fork('layout').shuffle([a, b, asNum(params.c)]);
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'order',
          items: values.map((v, i) =>
            abstract
              ? { id: `obj-${i}`, value: v, label: `${v}¢` }
              : { id: `obj-${i}`, value: v, stimulus: coinsPicture(fewestCoins(v)) },
          ),
          direction: 'asc',
        },
        answer: { kind: 'numbers', values: [...values].sort((x, y) => x - y), ordered: true },
      };
      return finish(moneyCoins, ctx, p);
    }
    const [left, right] = comparePurses(a, b, conflict);
    p = {
      params,
      vars,
      math,
      widget: {
        format: 'coin-count',
        coins: left,
        bills: [],
        arrangement: 'sorted',
        answerUnit: 'cents',
        compareWith: { coins: right, bills: [] },
      },
      answer: { kind: 'choice', id: a > b ? 'left' : 'right' },
    };
    return finish(moneyCoins, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    const w = out.widget;
    if (w.format !== 'coin-pay') return correctFromAnswer(a);
    if (w.mode === 'new-way') return { kind: 'state', value: { coins: newWay(out) } };
    return { kind: 'state', value: { coins: payTray(w.target, w.purse) } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    const value = asNum(out.params.value);
    if (w.format === 'numeral-pick' && a.kind === 'choice') {
      const writing = a.id === 'w-right';
      return [
        say(writing ? 'gen.money.coins.writing' : 'gen.money.coins.look', {}),
        say(
          writing ? 'gen.money.coins.total-dollars' : 'gen.money.coins.worth',
          { cents: value },
          { op: 'answer', args: { id: a.id } },
        ),
      ];
    }
    if (w.format === 'number-pad' && asStr(out.params.mode) === 'ways') {
      return [
        say('gen.money.coins.ways-big-first', {}, { op: 'show-stimulus' }),
        say('gen.money.coins.ways-count', { n: value }, { op: 'type', args: { blank: 'x', value } }),
      ];
    }
    if (w.format === 'number-pad') {
      // The abstract item names the coin and draws none: no picture to look at.
      if (w.stimulus.kind === 'none') {
        return [say('gen.money.coins.worth', { cents: value }, { op: 'answer', args: { value } })];
      }
      return [
        say('gen.money.coins.look', {}),
        say('gen.money.coins.worth', { cents: value }, { op: 'answer', args: { value } }),
      ];
    }
    if (w.format === 'coin-pay' && w.mode === 'new-way') {
      const tray = newWay(out);
      const pieces = PAY_ORDER.flatMap((k) => new Array<string>(tray[k] ?? 0).fill(k));
      return [
        say('gen.money.coins.ways-look', {}),
        ...pieces.map((coin, i) =>
          i < pieces.length - 1
            ? say('gen.money.coins.drop', {}, { op: 'drop', args: { coin } })
            : say('gen.money.coins.ways-new', { cents: w.target }, { op: 'drop', args: { coin } }),
        ),
      ];
    }
    if (w.format === 'coin-pay') {
      const tray = payTray(w.target, w.purse);
      const pieces = PAY_ORDER.flatMap((k) => new Array<string>(tray[k] ?? 0).fill(k));
      return pieces.map((coin, i) =>
        i < pieces.length - 1
          ? say('gen.money.coins.drop', {}, { op: 'drop', args: { coin } })
          : say('gen.money.coins.paid', { cents: w.target }, { op: 'drop', args: { coin } }),
      );
    }
    if (w.format === 'order' && a.kind === 'numbers') {
      const labelled = w.items.every((x) => x.label !== undefined);
      const steps: LessonStep[] = [
        say(labelled ? 'gen.money.coins.compare-amounts' : 'gen.money.coins.count-purse', {}),
      ];
      a.values.forEach((v, slot) => {
        const id = w.items.find((x) => x.value === v)?.id ?? 'obj-0';
        steps.push(
          say(
            slot === 0 ? 'gen.money.coins.least-first' : 'gen.money.coins.next',
            {},
            {
              op: 'drag',
              args: { id, slot },
            },
          ),
        );
      });
      return steps;
    }
    if (w.format !== 'coin-count') return [];
    if (w.compareWith && a.kind === 'choice') {
      return [
        say(
          'gen.money.coins.count-purse',
          {},
          {
            op: 'count-up',
            args: { index: w.coins.length - 1, side: 'left' },
          },
        ),
        say(
          'gen.money.coins.count-purse',
          {},
          {
            op: 'count-up',
            args: { index: w.compareWith.coins.length - 1, side: 'right' },
          },
        ),
        say('gen.money.coins.more', {}, { op: 'answer', args: { id: a.id } }),
      ];
    }
    const steps: LessonStep[] = [];
    if (w.arrangement === 'mixed')
      steps.push(say('gen.money.coins.sort', {}, { op: 'sort-coins' }));
    const pieces = w.bills.length + w.coins.length;
    for (let i = 0; i < pieces - 1; i += 1) {
      steps.push(say('gen.money.coins.count-on', {}, { op: 'count-up', args: { index: i } }));
    }
    const dollars = w.answerUnit === 'dollars-cents';
    steps.push(
      say(
        dollars ? 'gen.money.coins.total-dollars' : 'gen.money.coins.total',
        { cents: value },
        dollars
          ? { op: 'answer', args: { values: [Math.floor(value / 100), value % 100] } }
          : { op: 'answer', args: { value } },
      ),
    );
    return steps;
  },
};

const PAY_ORDER = ['dollar', 'quarter', 'dime', 'nickel', 'penny'] as const;

/** The first way of a `new-way` item that is not listed as found. */
function newWay(out: GeneratorOutput): Record<string, number> {
  const p = out.params;
  const found = asNum(p.found);
  const way = waysList(asNum(p.cents), asStr(p.kinds))[found];
  if (!way) throw new Error('money.coins: no way left to find');
  const tray: Record<string, number> = {};
  for (const k of PAY_ORDER) if ((way[k] ?? 0) > 0) tray[k] = way[k] as number;
  return tray;
}

/** A tray that pays `cents` from the purse: the fewest pieces, biggest first (greedy over kinds). */
export function payTray(cents: number, purse: Purse): Record<string, number> {
  // Greedy is fewest for US coins with any subset of kinds that can pay at all, except a purse
  // without pennies or nickels; fall back to a search when greedy leaves a remainder.
  const kinds = PAY_ORDER.filter((k) => purse[k] !== undefined);
  const best = search(cents, kinds);
  if (!best) throw new Error(`money.coins: the purse cannot pay ${cents}¢`);
  return best;
}

function search(
  cents: number,
  kinds: readonly (typeof PAY_ORDER)[number][],
): Record<string, number> | null {
  if (cents === 0) return {};
  const [k, ...rest] = kinds;
  if (!k) return null;
  const v = PIECE_CENTS[k];
  for (let n = Math.floor(cents / v); n >= 0; n -= 1) {
    const r = search(cents - n * v, rest);
    if (r) return n > 0 ? { [k]: n, ...r } : r;
  }
  return null;
}
