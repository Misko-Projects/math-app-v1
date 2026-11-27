// MC.fraction-bigger-denominator (03 §7.2): thinks a whole cut into more parts has the bigger
// parts (1/8 > 1/3). Answer, on frac.compare same-numerator items:
// - compare: picks the side cut into more parts;
// - order (biggest piece first): orders the wholes by how many parts they have, most first, which
//   is the right order reversed.
// The rule predicts that response and matches exactly it; null when both wholes are cut the same.
// K02 slice 5a (FRA.13): same-numerator items with more than one part shaded, and the symbols
// tier (a/b ? a/c): the buggy symbol says the fraction with the bigger bottom number is bigger.
// Same-denominator items (FRA.06) are never its items: their parts are all one size.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { type MisconceptionRule, sameResponse } from '../rules';

function predict(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const a = item.answer;
  if (item.params.kind === 'sameDen') return null;
  if (w.format === 'compare' && a.kind === 'choice' && w.ask === 'symbol') {
    const den = (s: typeof w.left) => {
      const tok = s.kind === 'expression' && s.expr.tokens.length === 1 ? s.expr.tokens[0] : null;
      return tok?.t === 'frac' && typeof tok.b === 'number' ? tok.b : null;
    };
    const l = den(w.left);
    const r = den(w.right);
    if (l === null || r === null || l === r) return null;
    return { kind: 'choice', id: l > r ? '>' : '<' };
  }
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
