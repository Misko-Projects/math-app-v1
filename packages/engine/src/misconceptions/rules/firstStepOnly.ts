// MC.first-step-only (03 §7.2, #17 slice 4d), answer: on a two-step story (story.twostep) the
// child stops after the first step and gives its result: "50 shells, finds 20 more, gives away 15:
// how many now?" → 70. The first step's result is never told, and never the answer (the second
// change is at least 1), so every two-step item discriminates.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { twoStep } from '../../generators/story/twostep';
import type { MisconceptionRule } from '../rules';
import { responseWith, rewritesAsked } from './asked';

const isTwoStep = (item: GeneratedItem) => typeof item.params.ops === 'string';

export const firstStepOnly: MisconceptionRule = {
  id: 'firstStepOnly',
  kind: 'answer',
  applies: isTwoStep,
  predict(item): ResponseValue | null {
    if (!isTwoStep(item)) return null;
    return responseWith(item, [twoStep(item.params).r1]);
  },
  match(item, r) {
    if (!isTwoStep(item)) return false;
    const s = twoStep(item.params);
    return rewritesAsked(item, r, (v, g) => v === s.result && g === s.r1);
  },
};
