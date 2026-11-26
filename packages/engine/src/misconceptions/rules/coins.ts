// The money misconceptions (03 §7.2), on money.coins items:
// - MC.coins-as-ones: counts every coin as 1¢. On a coin-count purse answered in cents, r = the
//   number of pieces (≠ the value); on a compare, the purse with more pieces (when it has less
//   money).
// - MC.coin-value-by-size: thinks the bigger nickel is worth more than the dime. The value with
//   dime = 5¢ and nickel = 10¢ (≠ the value): on an identify item (the pad, or the 5¢ / 10¢ option),
//   on a coin-count purse in cents, and on a compare whose answer that swap turns round.
// Null whenever the buggy answer equals the right one.

import type { CoinKind, GeneratedItem, ResponseValue } from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
import { type MisconceptionRule, sameResponse } from '../rules';

const VALUE: Readonly<Record<CoinKind, number>> = { penny: 1, nickel: 5, dime: 10, quarter: 25 };
const SWAPPED: Readonly<Record<CoinKind, number>> = { penny: 1, nickel: 10, dime: 5, quarter: 25 };

const sum = (coins: readonly CoinKind[], v: Readonly<Record<CoinKind, number>>) =>
  coins.reduce((s, c) => s + v[c], 0);

function compareChoice(left: number, right: number, item: GeneratedItem): ResponseValue | null {
  const a = item.answer;
  if (a.kind !== 'choice' || left === right) return null;
  const id = left > right ? 'left' : 'right';
  return id === a.id ? null : { kind: 'choice', id };
}

function asOnes(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const a = item.answer;
  if (w.format !== 'coin-count') return null;
  if (w.compareWith) {
    return compareChoice(
      w.coins.length + w.bills.length,
      w.compareWith.coins.length + w.compareWith.bills.length,
      item,
    );
  }
  if (a.kind !== 'number') return null;
  const n = w.coins.length + w.bills.length;
  return n === a.value ? null : { kind: 'number', value: n };
}

function bySize(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const a = item.answer;
  if ((w.format === 'numeral-pick' || w.format === 'number-pad') && w.stimulus.kind === 'coins') {
    const coin = w.stimulus.coins[0];
    if (w.stimulus.coins.length !== 1 || !coin || SWAPPED[coin] === VALUE[coin]) return null;
    const v = SWAPPED[coin];
    if (w.format === 'number-pad') return { kind: 'number', value: v };
    return w.options.some((o) => o.id === numberOptionId(v))
      ? { kind: 'choice', id: numberOptionId(v) }
      : null;
  }
  if (w.format === 'number-pad' && w.stimulus.kind === 'none' && a.kind === 'number') {
    // The abstract identify item names the coin: its value is the answer.
    const v = a.value === 5 ? 10 : a.value === 10 ? 5 : null;
    return v === null ? null : { kind: 'number', value: v };
  }
  if (w.format !== 'coin-count') return null;
  if (w.compareWith) {
    return compareChoice(sum(w.coins, SWAPPED), sum(w.compareWith.coins, SWAPPED), item);
  }
  if (a.kind !== 'number') return null;
  const v = sum(w.coins, SWAPPED) + 100 * w.bills.reduce((s, b) => s + b, 0);
  return v === a.value ? null : { kind: 'number', value: v };
}

export const coinsAsOnes: MisconceptionRule = {
  id: 'coinsAsOnes',
  kind: 'answer',
  predict: asOnes,
  match: (item, r) => {
    const p = asOnes(item);
    return p !== null && sameResponse(p, r);
  },
};

export const coinValueBySize: MisconceptionRule = {
  id: 'coinValueBySize',
  kind: 'answer',
  predict: bySize,
  match: (item, r) => {
    const p = bySize(item);
    return p !== null && sameResponse(p, r);
  },
};
