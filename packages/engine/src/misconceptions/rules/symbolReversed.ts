// MC.symbol-reversed (03 §7.2), answer: places the mirror of the right relation symbol (writes
// 7 < 3 for "7 is greater than 3"). On a compare item with `ask: symbol`, the buggy answer is '>'
// for '<' and '<' for '>'. '=' has no mirror, so equal sides cannot discriminate: predict is null.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { type MisconceptionRule, sameResponse } from '../rules';

const MIRROR: Record<string, string> = { '<': '>', '>': '<' };

function predict(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  if (w.format !== 'compare' || w.ask !== 'symbol' || item.answer.kind !== 'choice') return null;
  const m = MIRROR[item.answer.id];
  return m ? { kind: 'choice', id: m } : null;
}

export const symbolReversed: MisconceptionRule = {
  id: 'symbolReversed',
  kind: 'answer',
  predict,
  match(item, r) {
    const p = predict(item);
    return p !== null && sameResponse(p, r);
  },
};
