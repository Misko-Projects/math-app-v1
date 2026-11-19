// MC.equals-add-all (03 §7.2), answer: adds every number shown, whatever the signs and where the
// blank is (3 + 4 = □ + 5 → 12; 8 + □ = 11 → 19). On equality.eq items the child fills the blank
// (a number, or a numeric pick) with the sum of the numbers written in the equation. Items where
// that sum is the right answer (a + b = _) cannot discriminate: predict is null.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { equation } from '../../generators/equality/model';
import { type MisconceptionRule, sameResponse } from '../rules';
import { askedNumbers, responseWith } from './asked';

function predict(item: GeneratedItem): ResponseValue | null {
  const eq = equation(item.params);
  if (eq.form === 'between' || item.answer.kind === 'state') return null;
  if (item.widget.format === 'compare' || item.widget.format === 'balance') {
    if (item.widget.format === 'compare' || item.widget.mode !== 'fill-blank') return null;
  }
  const asked = askedNumbers(item);
  if (asked?.length !== 1 || asked[0] !== eq.missing) return null;
  const sum = eq.shown.reduce((x, y) => x + y, 0);
  return sum === eq.missing ? null : responseWith(item, [sum]);
}

export const equalsAddAll: MisconceptionRule = {
  id: 'equalsAddAll',
  kind: 'answer',
  predict,
  match(item, r) {
    const p = predict(item);
    return p !== null && sameResponse(p, r);
  },
};
