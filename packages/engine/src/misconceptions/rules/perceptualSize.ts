// MC.perceptual-size (03 §7.2): thinks the bigger-looking group has more. Answer: a compare item
// with `conflict` = 1, answered with the side that looks like more, which is the side drawn with
// bigger, spread-out objects (`sizeVaries`, compare.sets). Asked which has fewer, the same belief
// picks the side that looks like less. On a compare.sets order item with `conflict` = 1 the belief
// orders the groups by their looks: big and spread out looks most, a plain line next, bunched in
// rows least. The rule predicts that response and matches exactly it; it returns null on items
// without the conflict cue, and when the buggy answer equals the correct one.

import type { GeneratedItem, ResponseValue, StimulusSpec } from '@number-island/shared';
import { bigLookingSide } from '../../generators/compare/shared';
import { type MisconceptionRule, sameResponse } from '../rules';

/** How much a group looks like (2 big and spread out, 1 a plain line, 0 bunched); null: no group. */
function looksLike(s: StimulusSpec | undefined): number | null {
  if (s?.kind !== 'objects') return null;
  if (s.set.sizeVaries === true) return 2;
  return s.set.layout === 'array' ? 0 : 1;
}

function predictOrder(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  if (w.format !== 'order' || item.answer.kind !== 'numbers') return null;
  const looks = w.items.map((i) => ({ value: i.value, look: looksLike(i.stimulus) }));
  if (looks.some((l) => l.look === null)) return null;
  const sign = w.direction === 'desc' ? -1 : 1;
  const values = [...looks]
    .sort((x, y) => sign * ((x.look as number) - (y.look as number)))
    .map((l) => l.value);
  const buggy: ResponseValue = { kind: 'numbers', values };
  return sameResponse(buggy, { kind: 'numbers', values: item.answer.values }) ? null : buggy;
}

function predict(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const conflict = item.params.conflict;
  if (conflict !== true && conflict !== 1) return null;
  if (w.format === 'order') return predictOrder(item);
  if (w.format !== 'compare') return null;
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
