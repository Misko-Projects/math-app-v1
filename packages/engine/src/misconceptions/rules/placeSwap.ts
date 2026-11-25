// MC.place-swap (03 §7.2), answer: builds or writes 34 as 43, the tens and ones swapped. It
// applies when the asked number v is 20–99, its ones digit is not 0 and differs from its tens
// digit, and r = reverse(v). A base-ten build answers with the value of the mat, so 4 tens and 3
// ones for 34 is the swap (10·v₀ + v₁). Teens are MC.teen-reversal's: 41 → 14 is both, and the
// higher priority wins. K02 (PV.15): a three-digit number swaps its tens and ones the same way,
// the hundreds staying put (345 → 354), when the ones are not 0 and differ from the tens.
//
// The asked number is read as MC.teen-reversal reads it (rules/asked.ts): a number, an `opt-<v>`
// pick, a base-ten build's value, the number place-value cards make, or a typed total.

import type { ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

/**
 * v (20–999) with its tens and ones swapped, when the ones digit is non-zero and differs from the
 * tens: reverse(v) for a two-digit number, and the hundreds unchanged for a three-digit one.
 */
export function placeSwapped(v: number): number | null {
  if (!Number.isInteger(v) || v < 20 || v > 999) return null;
  const hundreds = Math.floor(v / 100);
  const tens = Math.floor(v / 10) % 10;
  const ones = v % 10;
  if (ones === 0 || ones === tens) return null;
  return hundreds * 100 + ones * 10 + tens;
}

export const placeSwap: MisconceptionRule = {
  id: 'placeSwap',
  kind: 'answer',
  predict(item): ResponseValue | null {
    const values = askedNumbers(item);
    if (values?.length !== 1) return null;
    const r = placeSwapped(values[0] as number);
    return r === null ? null : responseWith(item, [r]);
  },
  match(item, r) {
    const values = askedNumbers(item);
    if (values?.length !== 1) return false;
    return rewritesAsked(item, r, (v, g) => placeSwapped(v) === g);
  },
};
