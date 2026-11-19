// MC.fraction-bigger-denominator (03 §7.2): thinks a whole cut into more parts has the bigger
// parts (1/8 > 1/3). Answer, on frac.compare same-numerator items:
// - compare: picks the side cut into more parts;
// - order (biggest piece first): orders the wholes by how many parts they have, most first, which
//   is the right order reversed.
// The rule predicts that response and matches exactly it; null when both wholes are cut the same.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { type MisconceptionRule, sameResponse } from '../rules';

function predict(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const a = item.answer;
  if (w.format === 'compare' && a.kind === 'choice') {
    if (w.left.kind !== 'fraction' || w.right.kind !== 'fraction') return null;
    if (w.left.parts === w.right.parts) return null;
    return { kind: 'choice', id: w.left.parts > w.right.parts ? 'left' : 'right' };
  }
  if (w.format === 'order' && a.kind === 'numbers' && a.values.length > 1) {
    const reversed = [...a.values].reverse();
    return sameResponse(
      { kind: 'numbers', values: reversed },
      { kind: 'numbers', values: a.values },
    )
      ? null
      : { kind: 'numbers', values: reversed };
  }
  return null;
}

export const fractionBiggerDenominator: MisconceptionRule = {
  id: 'fractionBiggerDenominator',
  kind: 'answer',
  predict,
  match(item, r) {
    const buggy = predict(item);
    return buggy !== null && sameResponse(buggy, r);
  },
};
