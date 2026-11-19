// 03 §5.5 coin-count (pictorial): how much money is in the purse? Dollar bills (`bills`, in
// dollars) and coins are drawn, bills first, then the coins in config order (`sorted` configs list
// them biggest first). `cents` answers `number` (cents); `dollars-cents` answers `numbers`
// `[dollars, cents]` from a fixed `$ _ . _ _` pad; `compareWith` (MON.08) draws a second purse on
// the right and answers `choice` `left` | `right` | `same`.
//
// Pieces have ids `bill-<i>` and `coin-<i>` (config index) on the left, `r-bill-<i>` and
// `r-coin-<i>` on the right. Ops: `sort-coins` (biggest first, bills before coins), `count-up
// {index, side?}` (counts the pieces up to the `index`-th in the order shown: the running total is
// their sum), `say-running {value}`, and the generic `answer {value}`, `{values}` or `{id}`.

import {
  type AnswerSpec,
  type CoinKind,
  coinCountConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { MAX_PAY_CENTS } from './coin-pay';
import { COIN_ORDER, coinsCents, PIECE_CENTS } from './money';
import {
  argNumber,
  argNumbers,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'coin-count'>;

/** Bill values a purse can show, in dollars. */
export const BILL_VALUES: readonly number[] = [1, 2, 5, 10, 20];

/**
 * Room in one purse, in coin slots: the widget draws every piece as its own tap target (≥ 64 px)
 * beside the number pad at the smallest landscape area, and a bill takes three coin slots.
 */
export const MAX_COUNT_SLOTS = 12;
/**
 * Room in each of two purses side by side (`compareWith`): two rows of coins (or two bills) a
 * purse, with the choices under them, fit the smallest landscape area.
 */
export const MAX_COMPARE_SLOTS = 6;
export const BILL_SLOTS = 3;

/** The coin slots a purse takes. */
export const purseSlots = (side: { coins: readonly unknown[]; bills: readonly unknown[] }) =>
  side.coins.length + BILL_SLOTS * side.bills.length;

export type CountSide = 'left' | 'right';

/** One piece as drawn: a bill (value in dollars) or a coin, with its id. */
export type CountPiece =
  | { id: string; kind: 'bill'; dollars: number; cents: number }
  | { id: string; kind: 'coin'; coin: CoinKind; cents: number };

export interface CoinCountState extends FormatState<'coin-count'> {
  sorted: boolean;
  /** The last piece counted on each side (index in the order shown), −1 for none. */
  counted: Record<CountSide, number>;
  /** The running total `say-running` said last. */
  said: number | null;
  value: number | null;
  values: number[] | null;
  choice: string | null;
}

/** The pieces of one side in config order: bills first, then coins. */
export function sidePieces(coins: readonly CoinKind[], bills: readonly number[], side: CountSide) {
  const pre = side === 'right' ? 'r-' : '';
  const out: CountPiece[] = [
    ...bills.map(
      (dollars, i): CountPiece => ({
        id: `${pre}bill-${i}`,
        kind: 'bill',
        dollars,
        cents: dollars * 100,
      }),
    ),
    ...coins.map(
      (coin, i): CountPiece => ({
        id: `${pre}coin-${i}`,
        kind: 'coin',
        coin,
        cents: PIECE_CENTS[coin],
      }),
    ),
  ];
  return out;
}

/** The pieces in the order shown: config order, or biggest first once sorted (stable). */
export function shownPieces(
  c: Pick<Config, 'coins' | 'bills' | 'compareWith'>,
  side: CountSide,
  sorted: boolean,
): CountPiece[] {
  const src = side === 'right' ? c.compareWith : c;
  if (!src) return [];
  const pieces = sidePieces(src.coins, src.bills, side);
  return sorted ? [...pieces].sort((a, b) => b.cents - a.cents) : pieces;
}

/** The money on one side, in cents. */
export function sideCents(coins: readonly CoinKind[], bills: readonly number[]): number {
  return coinsCents(coins) + bills.reduce((a, b) => a + b * 100, 0);
}

/** The running total after counting the first `index + 1` pieces shown. */
export function runningTotal(pieces: readonly CountPiece[], index: number): number {
  return pieces.slice(0, index + 1).reduce((a, p) => a + p.cents, 0);
}

const isSortedBigFirst = (coins: readonly CoinKind[]) =>
  coins.every((c, i) => i === 0 || PIECE_CENTS[coins[i - 1] as CoinKind] >= PIECE_CENTS[c]);

const configSchema = coinCountConfigSchema.superRefine((c, ctx) => {
  const sides: [string, { coins: CoinKind[]; bills: number[] }, number][] = [
    ['', c, c.compareWith ? MAX_COMPARE_SLOTS : MAX_COUNT_SLOTS],
  ];
  if (c.compareWith) sides.push(['compareWith.', c.compareWith, MAX_COMPARE_SLOTS]);
  for (const [path, side, max] of sides) {
    const at = (k: string) => (path ? ['compareWith', k] : [k]);
    if (side.coins.length + side.bills.length === 0) {
      ctx.addIssue({ code: 'custom', path: at('coins'), message: 'the purse is empty' });
    }
    if (purseSlots(side) > max) {
      ctx.addIssue({
        code: 'custom',
        path: at('coins'),
        message: `at most ${max} coins a purse (a bill takes ${BILL_SLOTS})`,
      });
    }
    side.bills.forEach((b, i) => {
      if (!BILL_VALUES.includes(b)) {
        ctx.addIssue({
          code: 'custom',
          path: [...at('bills'), i],
          message: `bills are ${BILL_VALUES.join(', ')} dollars`,
        });
      }
    });
    if (sideCents(side.coins, side.bills) > MAX_PAY_CENTS * 10) {
      ctx.addIssue({ code: 'custom', path: at('coins'), message: 'at most $100' });
    }
    if (c.arrangement === 'sorted' && !isSortedBigFirst(side.coins)) {
      ctx.addIssue({
        code: 'custom',
        path: at('coins'),
        message: 'a sorted purse lists its coins biggest value first',
      });
    }
  }
});

const emptyCounted = (): Record<CountSide, number> => ({ left: -1, right: -1 });

export const coinCount: FormatModel<'coin-count', CoinCountState> = {
  format: 'coin-count',
  configSchema,
  features: {
    coins: { weight: 0.1, doc: 'coins shown − 3 (both purses)' },
    kinds: { weight: 0.3, doc: 'kinds shown − 1 (each coin kind; bills are one kind)' },
    mixed: { weight: 0.4, doc: 'the coins are mixed, not sorted biggest first' },
    quarters: { weight: 0.4, doc: 'a quarter is shown' },
    over100: { weight: 0.5, doc: 'a purse holds more than a dollar' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const all = [...c.coins, ...(c.compareWith?.coins ?? [])];
    const hasBills = c.bills.length > 0 || (c.compareWith?.bills.length ?? 0) > 0;
    const kinds = COIN_ORDER.filter((k) => all.includes(k)).length + (hasBills ? 1 : 0);
    const most = Math.max(
      sideCents(c.coins, c.bills),
      c.compareWith ? sideCents(c.compareWith.coins, c.compareWith.bills) : 0,
    );
    return {
      coins: Math.max(0, all.length - 3),
      kinds: Math.max(0, kinds - 1),
      mixed: c.arrangement === 'mixed' ? 1 : 0,
      quarters: all.includes('quarter') ? 1 : 0,
      over100: most > 100 ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    sorted: false,
    counted: emptyCounted(),
    said: null,
    value: null,
    values: null,
    choice: null,
  }),
  apply(s, a) {
    switch (a.op) {
      case 'sort-coins':
        // The count starts again in the new order.
        return { ...s, sorted: true, counted: emptyCounted() };
      case 'count-up': {
        const side: CountSide = argString(a, 'side') === 'right' ? 'right' : 'left';
        const index = argNumber(a, 'index');
        const n = shownPieces(s.config, side, s.sorted).length;
        if (index === undefined || !Number.isInteger(index) || index < 0 || index >= n) return s;
        return { ...s, counted: { ...s.counted, [side]: index } };
      }
      case 'say-running': {
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, said: v };
      }
      case 'answer': {
        const id = argString(a, 'id');
        if (s.config.compareWith) {
          return id === 'left' || id === 'right' || id === 'same' ? { ...s, choice: id } : s;
        }
        if (s.config.answerUnit === 'dollars-cents') {
          const vs = argNumbers(a, 'values');
          if (vs && vs.length === 2) return { ...s, values: [...vs] };
          const v = argNumber(a, 'value');
          if (v !== undefined && Number.isInteger(v) && v >= 0) {
            return { ...s, values: [Math.floor(v / 100), v % 100] };
          }
          return s;
        }
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('coin-count', a.op);
    }
  },
  toResponse(s) {
    if (s.config.compareWith) return s.choice === null ? null : { kind: 'choice', id: s.choice };
    if (s.config.answerUnit === 'dollars-cents') {
      return s.values === null ? null : { kind: 'numbers', values: [...s.values] };
    }
    return s.value === null ? null : { kind: 'number', value: s.value };
  },
};
