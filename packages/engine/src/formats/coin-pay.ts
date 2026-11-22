// 03 §5.5 coin-pay (concrete): drag coins (and dollar bills) from the purse into the tray to pay
// `target` cents. The response is the tray, `{ coins: { penny, nickel, dime, quarter, dollar? } }`
// (`dollar` only when the purse has bills), checked by `coins.total { cents, purse }` or, with
// `requireFewest`, `coins.fewest { cents, purse }`. `new-way` (PUZ.09) adds `found`: the multiset
// keys (`"q1d0n0p0"`, formats/money.ts) of the ways already found, which the tray must not repeat.
//
// Ops: `drop {coin, to?, index?}` puts one `coin` from the purse in the tray (`to: 'purse'` takes
// one back: the tray's `index`-th piece when given, else the last of that kind); `count-up {coin?}`
// drops one `coin` and says the new running total (no `coin`: counts the tray, biggest first);
// `say-total` says the tray's total; the generic `answer {coins}` sets the whole tray.

import {
  type AnswerSpec,
  COIN_FOUND_WAY_PIECES_MAX,
  coinPayConfigSchema,
  MONEY_CENTS_MAX,
  TRAY_PIECES_MAX,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  COIN_ORDER,
  canonicalKey,
  fewestPieces,
  fullTray,
  isPurseKind,
  PIECES_BIG_FIRST,
  type PurseKind,
  parseTrayKey,
  purseKinds,
  purseLimit,
  readTray,
  type Tray,
  trayCents,
  trayFitsPurse,
  trayKey,
  trayPieces,
  waysToPay,
} from './money';
import {
  argNumber,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'coin-pay'>;
type Purse = Config['purse'];

/** The most a coin item asks for: $10 (the tray has to show every piece). */
export const MAX_PAY_CENTS = MONEY_CENTS_MAX;
/**
 * The most pieces the tray holds (shared `TRAY_PIECES_MAX`): a drop into a full tray does nothing,
 * and a config whose answer needs more is refused, so the tray never has to draw a pile it cannot.
 */
export const MAX_TRAY_PIECES = TRAY_PIECES_MAX;

export interface CoinTrayState {
  /** The pieces in the tray, in the order they went in. */
  order: PurseKind[];
  /** The running total said by the last `count-up` (null before any). */
  counted: number | null;
  /** `say-total` was played. */
  totalSaid: boolean;
}

export interface CoinPayState extends FormatState<'coin-pay'>, CoinTrayState {}

/** The tray's counts, from the pieces in it. */
export function trayOf(order: readonly PurseKind[]): Tray {
  const t: Tray = {};
  for (const k of order) t[k] = (t[k] ?? 0) + 1;
  return t;
}

/**
 * One `drop`: a piece from the purse into the tray (when the purse still has one), or with
 * `to: 'purse'` back out of it. Shared with make-change.
 */
export function dropPiece(
  order: readonly PurseKind[],
  purse: Purse,
  coin: unknown,
  to: string | undefined,
  index: number | undefined,
): PurseKind[] {
  if (!isPurseKind(coin)) return [...order];
  if (to === 'purse') {
    let at = -1;
    if (index !== undefined && Number.isInteger(index) && order[index] === coin) at = index;
    else at = order.lastIndexOf(coin);
    if (at < 0) return [...order];
    return [...order.slice(0, at), ...order.slice(at + 1)];
  }
  const inTray = order.filter((k) => k === coin).length;
  if (inTray >= purseLimit(purse, coin) || order.length >= MAX_TRAY_PIECES) return [...order];
  return [...order, coin];
}

/** A tray from the generic `answer {coins}` op, in the purse's order, or null when it does not fit. */
export function answerOrder(coins: unknown, purse: Purse): PurseKind[] | null {
  const tray = readTray(coins);
  if (!tray || !trayFitsPurse(tray, purse) || trayPieces(tray) > MAX_TRAY_PIECES) return null;
  return PIECES_BIG_FIRST.flatMap((k) => Array.from({ length: tray[k] ?? 0 }, () => k));
}

/** The response tray: every coin kind, and `dollar` when the purse has bills. */
export function responseTray(order: readonly PurseKind[], purse: Purse): Tray {
  return fullTray(trayOf(order), purseLimit(purse, 'dollar') > 0);
}

/** Whether a tray answers the item (the checker's rule, used by the config's semantic check). */
function answers(tray: Tray, c: Config, found: ReadonlySet<string>, fewest: number | null) {
  if (found.has(trayKey(tray)) || trayPieces(tray) > MAX_TRAY_PIECES) return false;
  return !c.requireFewest || trayPieces(tray) === fewest;
}

const configSchema = coinPayConfigSchema.superRefine((c, ctx) => {
  if (purseKinds(c.purse).length === 0) {
    ctx.addIssue({ code: 'custom', path: ['purse'], message: 'the purse is empty' });
    return;
  }
  if (c.target < 1 || c.target > MAX_PAY_CENTS) {
    ctx.addIssue({ code: 'custom', path: ['target'], message: `pay 1–${MAX_PAY_CENTS}¢` });
    return;
  }
  if (c.mode !== 'new-way' && c.found !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['found'], message: 'found is for new-way only' });
  }
  const found = new Set<string>();
  for (const [i, key] of (c.found ?? []).entries()) {
    const t = parseTrayKey(key);
    if (!t || trayCents(t) !== c.target) {
      ctx.addIssue({
        code: 'custom',
        path: ['found', i],
        message: `"${key}" is not a way to pay ${c.target}¢`,
      });
    } else if (!trayFitsPurse(t, c.purse) || trayPieces(t) > MAX_TRAY_PIECES) {
      ctx.addIssue({
        code: 'custom',
        path: ['found', i],
        message: `"${key}" is not a way this purse and tray (${MAX_TRAY_PIECES} pieces) can pay`,
      });
    } else if (trayPieces(t) > COIN_FOUND_WAY_PIECES_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['found', i],
        message: `a found way lists at most ${COIN_FOUND_WAY_PIECES_MAX} pieces ("${key}" has ${trayPieces(t)})`,
      });
    } else if (found.has(canonicalKey(key) as string)) {
      ctx.addIssue({ code: 'custom', path: ['found', i], message: `"${key}" is listed twice` });
    } else found.add(canonicalKey(key) as string);
  }
  const fewest = fewestPieces(c.target, c.purse);
  if (fewest === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['purse'],
      message: `the purse cannot pay ${c.target}¢ exactly`,
    });
    return;
  }
  if (fewest > MAX_TRAY_PIECES) {
    ctx.addIssue({
      code: 'custom',
      path: ['purse'],
      message: `paying ${c.target}¢ takes ${fewest} pieces; the tray holds ${MAX_TRAY_PIECES}`,
    });
    return;
  }
  if (
    c.mode === 'new-way' &&
    !waysToPay(c.target, c.purse, 5000, MAX_TRAY_PIECES).some((t) => answers(t, c, found, fewest))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['found'],
      message: `every way of at most ${MAX_TRAY_PIECES} pieces is already found`,
    });
  }
});

export const coinPay: FormatModel<'coin-pay', CoinPayState> = {
  format: 'coin-pay',
  configSchema,
  features: {
    target: { weight: 0.3, doc: '(target − 1) / 25: per 25¢ above 1¢' },
    kinds: { weight: 0.3, doc: 'coin kinds the purse has − 1' },
    fewest: { weight: 0.5, doc: 'pay with the fewest coins (requireFewest)' },
    'runningTotal.off': { weight: 0.4, doc: 'no running total under the tray' },
    dollars: { weight: 0.4, doc: 'the amount is a dollar or more' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const coinKinds = COIN_ORDER.filter((k) => purseLimit(c.purse, k) > 0).length;
    return {
      target: Math.max(0, c.target - 1) / 25,
      kinds: Math.max(0, coinKinds - 1),
      fewest: c.requireFewest ? 1 : 0,
      'runningTotal.off': c.showRunningTotal ? 0 : 1,
      dollars: c.target >= 100 ? 1 : 0,
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
        const coin = a.args?.coin;
        const order =
          coin === undefined ? s.order : dropPiece(s.order, purse, coin, 'tray', undefined);
        return { ...s, order, counted: trayCents(trayOf(order)) };
      }
      case 'say-total':
        return { ...s, totalSaid: true };
      case 'answer': {
        const order = answerOrder(a.args?.coins, purse);
        return order ? { ...s, order } : s;
      }
      default:
        throw new UnsupportedOpError('coin-pay', a.op);
    }
  },
  toResponse(s) {
    if (s.order.length === 0) return null;
    return { kind: 'state', value: { coins: responseTray(s.order, s.config.purse) } };
  },
};
