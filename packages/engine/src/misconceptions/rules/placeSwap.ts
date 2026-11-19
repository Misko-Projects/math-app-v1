// MC.place-swap (03 §7.2), answer: builds or writes 34 as 43, the tens and ones swapped. It
// applies when the asked number v is 20–99, its ones digit is not 0 and differs from its tens
// digit, and r = reverse(v). A base-ten build answers with the value of the mat, so 4 tens and 3
// ones for 34 is the swap (10·v₀ + v₁). Teens are MC.teen-reversal's: 41 → 14 is both, and the
// higher priority wins.
//
// The asked number is read as MC.teen-reversal reads it (rules/asked.ts): a number, an `opt-<v>`
// pick, a base-ten build's value, the number place-value cards make, or a typed total.

import type { ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

/** reverse(v) for a two-digit v ≥ 20 whose ones digit is non-zero and differs from its tens. */
export function placeSwapped(v: number): number | null {
  if (!Number.isInteger(v) || v < 20 || v > 99) return null;
  const tens = Math.floor(v / 10);
  const ones = v % 10;
  if (ones === 0 || ones === tens) return null;
  return ones * 10 + tens;
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
