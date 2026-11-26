// MC.round-down-always and MC.round-wrong-place (03 §7.2), answer rules on pv.round items (params
// `n` and `place`). The asked number is the answer (typed, or an `opt-<v>` pick).
// - roundDownAlways: the digit right of the rounding place is ≥ 5 (n rounds up) and r is n cut
//   down to that place (47 → 40, 350 → 300).
// - roundWrongPlace: r is n rounded to the next smaller place, and that is not the answer (347 to
//   the nearest hundred → 350). Rounding to a ten has no smaller place to slip to.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { roundParts, roundTo } from '../../generators/pv/round-model';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

function parts(item: GeneratedItem): ReturnType<typeof roundParts> | null {
  const { n, place } = item.params;
  if (typeof n !== 'number' || typeof place !== 'number') return null;
  const values = askedNumbers(item);
  const p = roundParts(item.params);
  return values?.length === 1 && values[0] === p.result ? p : null;
}

/** The buggy answer of rounding down by habit, or null when n rounds down anyway. */
export function roundedDown(item: GeneratedItem): number | null {
  const p = parts(item);
  return p && p.result === p.b1 ? p.b0 : null;
}

/** n rounded to the next smaller place, or null when that is the answer or there is none. */
export function roundedWrongPlace(item: GeneratedItem): number | null {
  const p = parts(item);
  if (!p || p.place < 100) return null;
  const r = roundTo(p.n, p.place / 10);
  return r !== p.result ? r : null;
}

function ruleOf(id: string, slip: (item: GeneratedItem) => number | null): MisconceptionRule {
  return {
    id,
    kind: 'answer',
    predict(item): ResponseValue | null {
      const r = slip(item);
      return r === null ? null : responseWith(item, [r]);
    },
    match(item, r) {
      const s = slip(item);
      return s !== null && rewritesAsked(item, r, (_v, g) => g === s);
    },
  };
}

export const roundDownAlways = ruleOf('roundDownAlways', roundedDown);
export const roundWrongPlace = ruleOf('roundWrongPlace', roundedWrongPlace);
