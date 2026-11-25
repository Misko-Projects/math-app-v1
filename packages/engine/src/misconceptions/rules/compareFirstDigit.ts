// MC.compare-first-digit (03 §7.2), answer: compares numbers by their first digits and not by how
// many digits they have, so 89 is greater than 102 because 8 is greater than 1. It applies when
// the compared numbers have different digit counts:
// - compare (compare.numbers, `a` against `b`): r takes the shorter number as the greater one
//   (the other side for more and fewer, the mirrored sign for symbol);
// - order: r is the cards in the order of their numerals read digit by digit (102, 89, 95 for
//   smallest first), when that differs from the right order.
// Numbers of one length cannot discriminate: predict is null.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { digitCount } from '../../formats/types';
import { type MisconceptionRule, sameResponse } from '../rules';

const OTHER: Record<string, string> = { left: 'right', right: 'left', '<': '>', '>': '<' };

/** The values in the order their numerals sort digit by digit ("102" before "89"). */
export function firstDigitOrder(values: readonly number[], desc: boolean): number[] {
  const out = [...values].sort((x, y) => (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0));
  return desc ? out.reverse() : out;
}

function predict(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const a = item.answer;
  if (w.format === 'compare' && a.kind === 'choice') {
    const x = item.params.a;
    const y = item.params.b;
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    if (digitCount(x) === digitCount(y)) return null;
    const id = OTHER[a.id];
    return id ? { kind: 'choice', id } : null;
  }
  if (w.format === 'order' && a.kind === 'numbers') {
    const values = w.items.map((i) => i.value);
    if (new Set(values.map(digitCount)).size < 2) return null;
    const slip = firstDigitOrder(values, w.direction === 'desc');
    return slip.every((v, i) => v === a.values[i]) ? null : { kind: 'numbers', values: slip };
  }
  return null;
}

export const compareFirstDigit: MisconceptionRule = {
  id: 'compareFirstDigit',
  kind: 'answer',
  // A number put on a line (PV.17) compares nothing by its digits.
  applies: (item) => item.widget.format === 'compare' || item.widget.format === 'order',
  predict,
  match(item, r) {
    const p = predict(item);
    return p !== null && sameResponse(p, r);
  },
};
