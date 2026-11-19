// 03 §5.5 make-change (concrete, MON.07): the shopper paid `paid` cents for something that costs
// `price`; the child gives the change from the purse by counting up from the price. The response
// is the change given, `{ coins: { penny, nickel, dime, quarter, dollar? } }` (as coin-pay),
// checked by `coins.total { cents: paid − price, purse }`.
//
// Ops: `drop {coin, to?, index?}` as coin-pay; `count-up {to}` gives the one piece that counts up
// from where the count is now (price + change so far) to `to` (nothing when no single piece of the
// purse does); the generic `answer {coins}` sets the whole change. `countUpLine` draws an open
// number line from the price to the amount paid with one hop per piece given, in the order given.

import {
  type AnswerSpec,
  makeChangeConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  answerOrder,
  type CoinTrayState,
  dropPiece,
  MAX_PAY_CENTS,
  responseTray,
  trayOf,
} from './coin-pay';
import { canPay, PIECE_CENTS, PIECES_BIG_FIRST, purseKinds, trayCents } from './money';
import {
  argNumber,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'make-change'>;

export interface MakeChangeState extends FormatState<'make-change'>, CoinTrayState {}

/** The change owed. */
export const changeOwed = (c: Pick<Config, 'price' | 'paid'>): number => c.paid - c.price;

/** Whether counting up from `price` to `paid` passes a whole dollar on the way. */
export function crossesDollar(price: number, paid: number): boolean {
  const next = (Math.floor(price / 100) + 1) * 100;
  return next < paid;
}

/** Where the count-up stands: the price plus the change given so far, after each piece. */
export function countUpStops(price: number, order: readonly string[]): number[] {
  const out: number[] = [];
  let at = price;
  for (const k of order) {
    at += PIECE_CENTS[k as keyof typeof PIECE_CENTS] ?? 0;
    out.push(at);
  }
  return out;
}

const configSchema = makeChangeConfigSchema.superRefine((c, ctx) => {
  if (c.price < 1) {
    ctx.addIssue({ code: 'custom', path: ['price'], message: 'the price is at least 1¢' });
  }
  if (c.paid <= c.price || c.paid > MAX_PAY_CENTS) {
    ctx.addIssue({
      code: 'custom',
      path: ['paid'],
      message: `the shopper pays more than the price, at most ${MAX_PAY_CENTS}¢`,
    });
    return;
  }
  if (purseKinds(c.purse).length === 0) {
    ctx.addIssue({ code: 'custom', path: ['purse'], message: 'the purse is empty' });
  } else if (!canPay(changeOwed(c), c.purse)) {
    ctx.addIssue({
      code: 'custom',
      path: ['purse'],
      message: `the purse cannot make ${changeOwed(c)}¢ of change`,
    });
  }
});

export const makeChange: FormatModel<'make-change', MakeChangeState> = {
  format: 'make-change',
  configSchema,
  features: {
    change: { weight: 0.4, doc: '(change − 1) / 25: per 25¢ of change above 1¢' },
    crossDollar: { weight: 0.5, doc: 'counting up from the price passes a whole dollar' },
    'countUpLine.off': { weight: 0.3, doc: 'no count-up number line' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    return {
      change: Math.max(0, changeOwed(c) - 1) / 25,
      crossDollar: crossesDollar(c.price, c.paid) ? 1 : 0,
      'countUpLine.off': c.countUpLine ? 0 : 1,
    };
  },
  initialState: (config) => ({ config, order: [], counted: null, totalSaid: false }),
  apply(s, a) {
    const purse = s.config.purse;
    switch (a.op) {
      case 'drop':
        return {
          ...s,
          order: dropPiece(s.order, purse, a.args?.coin, argString(a, 'to'), argNumber(a, 'index')),
        };
      case 'count-up': {
        const to = argNumber(a, 'to');
        if (to === undefined) return s;
        const step = to - (s.config.price + trayCents(trayOf(s.order)));
        const coin = PIECES_BIG_FIRST.find((k) => PIECE_CENTS[k] === step);
        if (!coin) return s;
        const order = dropPiece(s.order, purse, coin, 'tray', undefined);
        if (order.length === s.order.length) return s;
        return { ...s, order, counted: to };
      }
      case 'answer': {
        const order = answerOrder(a.args?.coins, purse);
        return order ? { ...s, order } : s;
      }
      default:
        throw new UnsupportedOpError('make-change', a.op);
    }
  },
  toResponse(s) {
    if (s.order.length === 0) return null;
    return { kind: 'state', value: { coins: responseTray(s.order, s.config.purse) } };
  },
};
