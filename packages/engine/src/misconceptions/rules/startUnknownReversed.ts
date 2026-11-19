// MC.start-unknown-reversed (03 §7.2), answer: with the start unknown, does the operation it shows
// on the two known numbers (? − 3 = 5 → 2; ? + 3 = 8 → 11). Where v = x + y the buggy answer is
// |x − y|, and where v = |x − y| it is x + y, for the two numbers x and y the item shows:
// - equality.eq `_+b=c` (and `_-b=c`): b and the result;
// - addsub.facts with `unknown: start`: b and the result;
// - story.addsub add-to/start and take-from/start: the two numbers the story tells.
// Items where both give the same number cannot discriminate: predict is null.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { equation } from '../../generators/equality/model';
import { story } from '../../generators/story/model';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

/** The two shown numbers of a start-unknown item, or null when the start is not unknown. */
function shownPair(item: GeneratedItem): [number, number] | null {
  const p = item.params;
  if (typeof p.situation === 'string') {
    const s = story(p);
    return s.situation === 'add-to/start' || s.situation === 'take-from/start' ? [s.a, s.b] : null;
  }
  if (typeof p.form === 'string') {
    const eq = equation(p);
    return eq.form === '_+b=c' ? [eq.shown[0] as number, eq.shown[1] as number] : null;
  }
  if (p.unknown === 'start' && typeof p.b === 'number' && typeof p.result === 'number') {
    return [p.b, p.result];
  }
  return null;
}

/** The correct start and the reversed-operation answer. */
export function reversedStart(item: GeneratedItem): { v: number; r: number } | null {
  const pair = shownPair(item);
  const asked = askedNumbers(item);
  if (!pair || asked?.length !== 1) return null;
  const [x, y] = pair;
  const v = asked[0] as number;
  const r = v === x + y ? Math.abs(x - y) : v === Math.abs(x - y) ? x + y : null;
  return r === null || r === v ? null : { v, r };
}

export const startUnknownReversed: MisconceptionRule = {
  id: 'startUnknownReversed',
  kind: 'answer',
  // Only start-unknown items (V25 skips the others of the same skills and generators).
  applies: (item) => shownPair(item) !== null,
  predict(item): ResponseValue | null {
    const w = reversedStart(item);
    return w ? responseWith(item, [w.r]) : null;
  },
  match(item, r) {
    const w = reversedStart(item);
    if (!w) return false;
    return rewritesAsked(item, r, (v, g) => v === w.v && g === w.r);
  },
};
