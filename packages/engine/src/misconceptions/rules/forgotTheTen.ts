// MC.forgot-the-ten (03 §7.2), answer: makes the ten, then drops it, so 8 + 5 → 3 and 10 + 7 → 7.
// It applies when the asked number v ≥ 11, and r = v − 10. The asked number is the answer (a
// number, an `opt-<v>` pick, or the total typed after filling frames, sliding beads or jumping).
// Items whose answer is below 11 cannot discriminate: predict is null and nothing matches.

import type { ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

/** v − 10 when v is at least 11 (a ten and some ones), else null. */
export function droppedTen(v: number): number | null {
  return Number.isInteger(v) && v >= 11 ? v - 10 : null;
}

export const forgotTheTen: MisconceptionRule = {
  id: 'forgotTheTen',
  kind: 'answer',
  predict(item): ResponseValue | null {
    const values = askedNumbers(item);
    if (values?.length !== 1) return null;
    const r = droppedTen(values[0] as number);
    return r === null ? null : responseWith(item, [r]);
  },
  match(item, r) {
    const values = askedNumbers(item);
    if (values?.length !== 1) return false;
    return rewritesAsked(item, r, (v, g) => droppedTen(v) === g);
  },
};
