// MC.wrong-operation (03 §7.2), answer: adds when the fact subtracts, or subtracts when it adds
// (9 − 4 → 13, 9 + 4 → 5). The two numbers shown are x and y (a and b; a and the result for a
// change unknown; b and the result for a start unknown). When the answer is x + y the buggy answer
// is |x − y| (x ≠ y), otherwise it is x + y. Items where both give the same number (a part is 0)
// cannot discriminate: predict is null and nothing matches.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

/** The correct answer and the other operation's answer on the two shown numbers. */
export function wrongOperationAnswer(item: GeneratedItem): { v: number; r: number } | null {
  const { a, b, op, result } = item.params;
  if (typeof a !== 'number' || typeof b !== 'number' || (op !== '+' && op !== '-')) return null;
  const res = typeof result === 'number' ? result : op === '-' ? a - b : a + b;
  const unknown = item.params.unknown ?? 'result';
  const [x, y, v] =
    unknown === 'change' ? [a, res, b] : unknown === 'start' ? [b, res, a] : [a, b, res];
  const r = v === x + y ? (x !== y ? Math.abs(x - y) : null) : x + y;
  if (r === null || r === v || r < 0) return null;
  return { v, r };
}

export const wrongOperation: MisconceptionRule = {
  id: 'wrongOperation',
  kind: 'answer',
  predict(item): ResponseValue | null {
    const w = wrongOperationAnswer(item);
    const values = askedNumbers(item);
    if (!w || values?.length !== 1 || values[0] !== w.v) return null;
    return responseWith(item, [w.r]);
  },
  match(item, r) {
    const w = wrongOperationAnswer(item);
    if (!w) return false;
    return rewritesAsked(item, r, (v, g) => v === w.v && g === w.r);
  },
};
