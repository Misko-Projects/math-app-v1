// MC.perceptual-size (03 §7.2): thinks the bigger-looking group has more. Answer: a compare item
// with `conflict` = 1, answered with the side that looks like more, which is the side drawn with
// bigger, spread-out objects (`sizeVaries`, compare.sets). Asked which has fewer, the same belief
// picks the side that looks like less. The rule predicts that response and matches exactly it; it
// returns null on items without the conflict cue, and when the buggy answer equals the correct one.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { bigLookingSide } from '../../generators/compare/shared';
import { type MisconceptionRule, sameResponse } from '../rules';

function predict(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const conflict = item.params.conflict;
  if (w.format !== 'compare' || (conflict !== true && conflict !== 1)) return null;
  if (w.ask !== 'more' && w.ask !== 'fewer') return null;
  const big = bigLookingSide(w);
  if (big === null || item.answer.kind !== 'choice') return null;
  const buggy = w.ask === 'more' ? big : big === 'left' ? 'right' : 'left';
  return buggy === item.answer.id ? null : { kind: 'choice', id: buggy };
}

export const perceptualSize: MisconceptionRule = {
  id: 'perceptualSize',
  kind: 'answer',
  predict,
  match(item, r) {
    const buggy = predict(item);
    return buggy !== null && sameResponse(buggy, r);
  },
};
