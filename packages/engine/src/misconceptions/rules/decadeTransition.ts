// MC.decade-transition (03 §7.2), answer: at a decade the child keeps the decade name of the number
// before. Counting on, 29 → "20" (r = v − 10, for v a multiple of 10, v ≥ 20); counting back,
// 40 → "49" (r = v + 10, for v ending in 9, v ≥ 19). Counting on also matches "twenty-ten" written
// as 210 (concat(v ÷ 10 − 1, 10)) and, at hundreds from 200, r = v − 100 (199 → "100"). `predict`
// names the v ∓ 10 form, the one a pick can offer, as offByOneCounting predicts one of its two.
//
// Counting by ones only (`step` 1 or absent): counting by tens passes a decade on every term. The
// asked number is the answer (a number, an `opt-<v>` pick, the typed landing of a one-hop jump); for
// a list answer (missing numbers) every decade term is rewritten in the prediction, and the list
// matches when every term that differs is a decade term given in one of its buggy forms.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

const countsByOnes = (item: GeneratedItem): boolean =>
  item.params.step === undefined || item.params.step === 1;

const backward = (item: GeneratedItem): boolean => item.params.dir === -1;

/** The predicted buggy number for asked term v, or null when v is not a decade transition. */
export function decadeSlip(v: number, back: boolean): number | null {
  if (!Number.isInteger(v)) return null;
  if (back) return v >= 19 && v % 10 === 9 ? v + 10 : null;
  return v >= 20 && v % 10 === 0 ? v - 10 : null;
}

/** Every buggy form of asked term v, the predicted one first. */
export function decadeSlips(v: number, back: boolean): number[] {
  const first = decadeSlip(v, back);
  if (first === null) return [];
  if (back) return [first];
  const out = [first, Number(`${v / 10 - 1}10`)];
  if (v >= 200 && v % 100 === 0) out.push(v - 100);
  return out;
}

export const decadeTransition: MisconceptionRule = {
  id: 'decadeTransition',
  kind: 'answer',
  predict(item): ResponseValue | null {
    if (!countsByOnes(item)) return null;
    const values = askedNumbers(item);
    if (!values) return null;
    const back = backward(item);
    return responseWith(
      item,
      values.map((v) => decadeSlip(v, back) ?? v),
    );
  },
  match(item, r) {
    if (!countsByOnes(item)) return false;
    const back = backward(item);
    return rewritesAsked(item, r, (v, g) => decadeSlips(v, back).includes(g));
  },
};
