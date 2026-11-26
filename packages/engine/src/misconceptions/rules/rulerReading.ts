// Ruler reading (03 §7.2), on `mea.length` `read` items (measure-length, number-pad, numeral-pick):
// - MC.ruler-count-ticks (`rulerCountTicks`): counts the marks, not the spaces: an object from 0
//   that is 5 long read as 6 (offset = 0, the answer one precision step more);
// - MC.ruler-read-end (`rulerReadEnd`): reads the number at the end, forgetting the object does not
//   start at 0: from 2 to 7 read as 7 (offset ≠ 0, the answer plus the offset).
// Each predicts that response and matches exactly it. A numeral-pick item predicts the option of
// that number (whole numbers only: fractional readings use the pad).

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
import { type MisconceptionRule, sameResponse } from '../rules';

/** The reading of a `read` item and its ruler start, or null for any other item. */
function reading(item: GeneratedItem): { value: number; offset: number; step: number } | null {
  if (item.params.mode !== 'read') return null;
  const a = item.answer;
  const offset = Number(item.params.offset ?? 0);
  const step = 1 / Number(item.params.precision ?? 1);
  if (a.kind === 'number') return { value: a.value, offset, step };
  if (a.kind === 'choice' && item.widget.format === 'numeral-pick') {
    const m = /^opt-(\d+)$/.exec(a.id);
    return m ? { value: Number(m[1]), offset, step } : null;
  }
  return null;
}

/** The response that answers `n` on this item's format. */
function respond(item: GeneratedItem, n: number): ResponseValue | null {
  if (item.answer.kind === 'number') return { kind: 'number', value: n };
  return Number.isInteger(n) ? { kind: 'choice', id: numberOptionId(n) } : null;
}

function predictTicks(item: GeneratedItem): ResponseValue | null {
  const r = reading(item);
  if (!r || r.offset !== 0) return null;
  return respond(item, r.value + r.step);
}

function predictEnd(item: GeneratedItem): ResponseValue | null {
  const r = reading(item);
  if (!r || r.offset === 0) return null;
  return respond(item, r.value + r.offset);
}

export const rulerCountTicks: MisconceptionRule = {
  id: 'rulerCountTicks',
  kind: 'answer',
  // Only a ruler read from 0 (laid units and objects that start further on are other rules').
  applies: (item) => reading(item)?.offset === 0,
  predict: predictTicks,
  match(item, r) {
    const buggy = predictTicks(item);
    return buggy !== null && sameResponse(buggy, r);
  },
};

export const rulerReadEnd: MisconceptionRule = {
  id: 'rulerReadEnd',
  kind: 'answer',
  // Only an object that does not start at the ruler's 0.
  applies: (item) => {
    const r = reading(item);
    return r !== null && r.offset !== 0;
  },
  predict: predictEnd,
  match(item, r) {
    const buggy = predictEnd(item);
    return buggy !== null && sameResponse(buggy, r);
  },
};
