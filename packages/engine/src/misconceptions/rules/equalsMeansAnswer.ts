// MC.equals-means-answer (03 §7.2), answer: reads "=" as "write the answer next", not as "the same
// as". On equality.eq items:
// - fill a two-sided form (a + b = c + _, a + b = _ + c): the child gives a op b, the left side's
//   answer (3 + 4 = □ + 5 → 7);
// - make-equal on a two-sided balance (the right pan holds c): the child puts a op b more on the
//   right pan, the answer of the left side, so the response adds lhs blocks there;
// - judge a true equation whose answer is not alone on the right (_ = a + b, or operations on both
//   sides): the child says false, because "the answer must come after the equal sign" (K01
//   reading: the both-sides form is judged the same way as the answer-on-the-left one).
// Items where the buggy answer equals the right one cannot discriminate: predict is null.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { equation, TWO_SIDED } from '../../generators/equality/model';
import { type MisconceptionRule, sameResponse } from '../rules';
import { askedNumbers, responseWith } from './asked';

function predict(item: GeneratedItem): ResponseValue | null {
  const eq = equation(item.params);
  const w = item.widget;
  const a = item.answer;
  if (
    a.kind === 'choice' &&
    (w.format === 'compare' || (w.format === 'balance' && w.mode === 'judge'))
  ) {
    const notCanonical = eq.form === '_=a+b' || TWO_SIDED.has(eq.form);
    return notCanonical && a.id === 'true' ? { kind: 'choice', id: 'false' } : null;
  }
  if (!TWO_SIDED.has(eq.form)) return null;
  if (a.kind === 'state' && w.format === 'balance' && w.mode === 'make-equal') {
    if (eq.form !== 'a+b=c+_') return null;
    const buggy: ResponseValue = { kind: 'state', value: { left: 0, right: eq.value } };
    const right: ResponseValue = { kind: 'state', value: { left: 0, right: eq.missing } };
    return sameResponse(buggy, right) ? null : buggy;
  }
  const asked = askedNumbers(item);
  if (asked?.length !== 1 || asked[0] !== eq.missing || eq.value === eq.missing) return null;
  return responseWith(item, [eq.value]);
}

export const equalsMeansAnswer: MisconceptionRule = {
  id: 'equalsMeansAnswer',
  kind: 'answer',
  predict,
  match(item, r) {
    const p = predict(item);
    return p !== null && sameResponse(p, r);
  },
};
