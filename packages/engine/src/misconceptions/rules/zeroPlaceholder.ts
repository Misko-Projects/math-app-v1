// MC.zero-placeholder (03 §7.2), answer: leaves out the zero that holds a place, so 305 becomes
// 35. It applies when the asked number v has an internal zero and r is v with its internal zeros
// removed. A trailing zero is not internal: 340 written as 34 is another slip.
//
// The asked number is read as MC.place-swap reads it (rules/asked.ts): a number, an `opt-<v>`
// pick, a base-ten build's value (305 built as 3 tens 5 ones), or the number place-value cards make.

import type { ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

/** v with its internal zeros removed (305 → 35, 1005 → 15), or null when v has none. */
export function withoutInternalZeros(v: number): number | null {
  if (!Number.isInteger(v) || v < 100) return null;
  const s = String(v);
  const trailing = s.length - s.replace(/0+$/, '').length;
  const head = s.slice(0, s.length - trailing);
  if (!head.includes('0')) return null;
  return Number(head.replaceAll('0', '') + '0'.repeat(trailing));
}

export const zeroPlaceholder: MisconceptionRule = {
  id: 'zeroPlaceholder',
  kind: 'answer',
  predict(item): ResponseValue | null {
    const values = askedNumbers(item);
    if (values?.length !== 1) return null;
    const r = withoutInternalZeros(values[0] as number);
    return r === null ? null : responseWith(item, [r]);
  },
  match(item, r) {
    const values = askedNumbers(item);
    if (values?.length !== 1) return false;
    return rewritesAsked(item, r, (v, g) => withoutInternalZeros(v) === g);
  },
};
