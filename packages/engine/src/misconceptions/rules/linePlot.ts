// Line plot reading (03 §7.2), on `data.lineplot` how-many reads (bar-graph-read, DAT.03):
// - MC.lineplot-position-as-count (`linePlotPositionAsCount`): answers the number under the stack
//   (the length) instead of how many Xs are above it: "how many planks are 16 inches long?" → 16;
// - MC.lineplot-wrong-stack (`linePlotWrongStack`): counts the Xs above a neighbouring mark, one
//   to the left or right of the asked one.
// Each returns null (and so never matches) when its buggy answer equals the correct one.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { type MisconceptionRule, sameResponse } from '../rules';

/** The asked mark (1-based), its value, every stack, and the correct count; null otherwise. */
function howMany(
  item: GeneratedItem,
): { at: number; value: number; stacks: number[]; correct: number } | null {
  const p = item.params;
  if (p.question !== 'how-many' || item.answer.kind !== 'number') return null;
  if (item.widget.format !== 'bar-graph-read' || item.widget.chart.kind !== 'line-plot')
    return null;
  const stacks = item.widget.chart.categories.map((c) => c.value);
  const at = Number(p.at ?? 1);
  const id = item.widget.question.categories[0];
  if (id === undefined) return null;
  return { at, value: Number(id), stacks, correct: item.answer.value };
}

function predictPosition(item: GeneratedItem): ResponseValue | null {
  const h = howMany(item);
  if (!h || h.value === h.correct) return null;
  return { kind: 'number', value: h.value };
}

/** The neighbouring stacks' counts that differ from the correct one (and from the length). */
function neighbourCounts(item: GeneratedItem): number[] {
  const h = howMany(item);
  if (!h) return [];
  return [h.stacks[h.at - 2], h.stacks[h.at]].filter(
    (n): n is number => n !== undefined && n !== h.correct && n !== h.value,
  );
}

export const linePlotPositionAsCount: MisconceptionRule = {
  id: 'linePlotPositionAsCount',
  kind: 'answer',
  applies: (item) => predictPosition(item) !== null,
  predict: predictPosition,
  match(item, r) {
    const buggy = predictPosition(item);
    return buggy !== null && sameResponse(buggy, r);
  },
};

export const linePlotWrongStack: MisconceptionRule = {
  id: 'linePlotWrongStack',
  kind: 'answer',
  applies: (item) => neighbourCounts(item).length > 0,
  predict: (item) => {
    const n = neighbourCounts(item)[0];
    return n === undefined ? null : { kind: 'number', value: n };
  },
  match: (item, r) => r.kind === 'number' && neighbourCounts(item).includes(r.value),
};
