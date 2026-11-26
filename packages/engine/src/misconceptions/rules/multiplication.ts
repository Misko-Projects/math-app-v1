// K02 slice 3a multiplication rules (03 §7.2), on mul.groups items whose total is asked
// (`unknown: total`): v = groups × perGroup.
// - MC.add-instead-of-multiply (addInsteadOfMultiply): 4 groups of 3 → 7, r = groups + perGroup.
//   Items where that equals v (2 groups of 2) cannot discriminate.
// - MC.skip-count-slip (skipCountSlip): one group too few or too many, r ∈ {v ± groups,
//   v ± perGroup} \ {v}, r > 0; predict is one group too few (v − perGroup).

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

/** groups, perGroup and the total of an item that asks the total, else null. */
function totalItem(item: GeneratedItem): { g: number; p: number; v: number } | null {
  const { groups, perGroup, unknown } = item.params;
  if (typeof groups !== 'number' || typeof perGroup !== 'number') return null;
  if ((unknown ?? 'total') !== 'total') return null;
  const v = groups * perGroup;
  const asked = askedNumbers(item);
  if (asked?.length !== 1 || asked[0] !== v) return null;
  return { g: groups, p: perGroup, v };
}

export const addInsteadOfMultiply: MisconceptionRule = {
  id: 'addInsteadOfMultiply',
  kind: 'answer',
  applies: (item) => totalItem(item) !== null,
  predict(item): ResponseValue | null {
    const t = totalItem(item);
    if (!t || t.g + t.p === t.v) return null;
    return responseWith(item, [t.g + t.p]);
  },
  match(item, r) {
    const t = totalItem(item);
    if (!t || t.g + t.p === t.v) return false;
    return rewritesAsked(item, r, (v, given) => v === t.v && given === t.g + t.p);
  },
};

/** The totals one group too few or too many gives. */
function slips(t: { g: number; p: number; v: number }): number[] {
  return [t.v - t.p, t.v + t.p, t.v - t.g, t.v + t.g].filter((x) => x > 0 && x !== t.v);
}

export const skipCountSlip: MisconceptionRule = {
  id: 'skipCountSlip',
  kind: 'answer',
  applies: (item) => totalItem(item) !== null,
  predict(item): ResponseValue | null {
    const t = totalItem(item);
    if (!t || t.v - t.p <= 0) return null;
    return responseWith(item, [t.v - t.p]);
  },
  match(item, r) {
    const t = totalItem(item);
    if (!t) return false;
    const s = slips(t);
    return rewritesAsked(item, r, (v, given) => v === t.v && s.includes(given));
  },
};
