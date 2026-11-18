// MC.bigger-unit-more (03 §7.2): thinks a bigger unit gives a bigger count. Answer:
// - a `two-units` measurement (numbers `[in unit, in altUnit]`) answered with the two counts
//   swapped, so the bigger unit gets the larger count;
// - a `two-units` compare item ("which unit do we need more / fewer of?") that picks the bigger unit
//   as needed more times (or the smaller one as needed fewer times).
// The rule predicts that response and matches exactly it; it returns null when the buggy answer
// equals the correct one (equal counts, a "same" answer).

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { type MisconceptionRule, sameResponse } from '../rules';

function predict(item: GeneratedItem): ResponseValue | null {
  if (item.params.mode !== 'two-units') return null;
  const a = item.answer;
  if (item.widget.format === 'measure-length' && a.kind === 'numbers' && a.values.length === 2) {
    const [n, m] = a.values as [number, number];
    return n !== m ? { kind: 'numbers', values: [m, n] } : null;
  }
  if (item.widget.format === 'compare' && a.kind === 'choice') {
    if (a.id === 'left') return { kind: 'choice', id: 'right' };
    if (a.id === 'right') return { kind: 'choice', id: 'left' };
  }
  return null;
}

export const biggerUnitMore: MisconceptionRule = {
  id: 'biggerUnitMore',
  kind: 'answer',
  predict,
  match(item, r) {
    const buggy = predict(item);
    return buggy !== null && sameResponse(buggy, r);
  },
};
