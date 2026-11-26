// MC.dollar-as-one (03 §7.2, #17 slice 4d), answer: mixes dollars and cents. On a money story
// that starts with "one dollar" and spends some cents (story.addsub, market-stall, `dollar: 1`),
// the child takes the dollar as 1 instead of 100 cents and answers the difference of the two told
// numbers: "has one dollar, buys an apple for 35 cents" → 34 instead of 65.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { responseWith, rewritesAsked } from './asked';

const isDollarStory = (item: GeneratedItem) =>
  item.params.dollar === 1 && typeof item.params.b === 'number';

/** The answer with the dollar read as 1: the price less one. */
const buggy = (item: GeneratedItem) => (item.params.b as number) - 1;

export const dollarAsOne: MisconceptionRule = {
  id: 'dollarAsOne',
  kind: 'answer',
  applies: isDollarStory,
  predict(item): ResponseValue | null {
    return isDollarStory(item) ? responseWith(item, [buggy(item)]) : null;
  },
  match(item, r) {
    if (!isDollarStory(item)) return false;
    const want = 100 - (item.params.b as number);
    return rewritesAsked(item, r, (v, g) => v === want && g === buggy(item));
  },
};
