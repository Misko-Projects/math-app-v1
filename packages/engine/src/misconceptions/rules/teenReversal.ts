// MC.teen-reversal (03 §7.2), answer: writes 13 as 31, or reads 41 as fourteen. The teen words say
// the ones first ("four-teen"), so the digits come out swapped. It applies when v or r is in 11–19,
// v has two different digits and r = reverse(v): v = 13 → 31, v = 41 → 14. Numbers whose reversal
// would start with 0 (20 → 02) or that read the same both ways (11) cannot discriminate.
//
// The asked number is the answer (a number, an `opt-<v>` pick, the typed landing of a one-hop jump).
// For a list answer (missing numbers) every reversible term is reversed in the prediction, and the
// list matches when every term that differs is the reversal of its asked term.

import type { ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

const teen = (n: number): boolean => n >= 11 && n <= 19;

/** reverse(v) when v or its reversal is a teen and the swap gives a different two-digit number. */
export function teenSwap(v: number): number | null {
  if (!Number.isInteger(v) || v < 10 || v > 99) return null;
  const tens = Math.floor(v / 10);
  const ones = v % 10;
  if (ones === 0 || ones === tens) return null;
  const r = ones * 10 + tens;
  return teen(v) || teen(r) ? r : null;
}

export const teenReversal: MisconceptionRule = {
  id: 'teenReversal',
  kind: 'answer',
  predict(item): ResponseValue | null {
    const values = askedNumbers(item);
    if (!values) return null;
    return responseWith(
      item,
      values.map((v) => teenSwap(v) ?? v),
    );
  },
  match: (item, r) => rewritesAsked(item, r, (v, g) => teenSwap(v) === g),
};
