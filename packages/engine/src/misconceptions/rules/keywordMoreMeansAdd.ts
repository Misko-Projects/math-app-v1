// MC.keyword-more-means-add (03 §7.2), answer: hears "more" (or any comparing words) and adds. On a
// story.addsub item whose situation is compare/difference-more, compare/difference-fewer,
// compare/bigger-fewer or compare/smaller-more, or whose words are inconsistent with its operation,
// when the right operation is − the buggy answer is a + b, the two numbers the story tells ("Pip
// has 3 more fish than crabs. Pip has 9 fish. How many crabs?" → 12). Items where a + b is the
// right answer cannot discriminate: predict is null.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { story } from '../../generators/story/model';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

const KEYWORD = new Set([
  'compare/difference-more',
  'compare/difference-fewer',
  'compare/bigger-fewer',
  'compare/smaller-more',
]);

/** A story whose words compare, or point to the other operation: the rule is about these only. */
export function keywordStory(item: GeneratedItem): boolean {
  if (typeof item.params.situation !== 'string') return false;
  const s = story(item.params);
  return KEYWORD.has(s.situation) || s.inconsistent;
}

/** The correct answer and the added one, or null when the rule does not apply. */
export function keywordAnswer(item: GeneratedItem): { v: number; r: number } | null {
  if (!keywordStory(item)) return null;
  const s = story(item.params);
  if (s.op !== '-') return null;
  const asked = askedNumbers(item);
  if (asked?.length !== 1 || asked[0] !== s.result) return null;
  const r = s.a + s.b;
  return r === s.result ? null : { v: s.result, r };
}

export const keywordMoreMeansAdd: MisconceptionRule = {
  id: 'keywordMoreMeansAdd',
  kind: 'answer',
  // Other stories (a start unknown, put together) never say a comparing word (V25 skips them).
  applies: keywordStory,
  predict(item): ResponseValue | null {
    const w = keywordAnswer(item);
    return w ? responseWith(item, [w.r]) : null;
  },
  match(item, r) {
    const w = keywordAnswer(item);
    if (!w) return false;
    return rewritesAsked(item, r, (v, g) => v === w.v && g === w.r);
  },
};
