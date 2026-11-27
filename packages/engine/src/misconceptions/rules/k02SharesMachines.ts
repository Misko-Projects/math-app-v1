// K02 slice 4c-2 (#17) misconception rules: equal shares that look different (FRA.16) and
// input–output machines (ALG.09) (03 §7.2). All answer rules.
// - MC.equal-shares-look-alike: a grid cut into equal parts of different shapes (frac.shares
//   fair-or-not) judged not equal: the parts must look alike to be equal shares (or the longer
//   part looks bigger).
// - MC.share-counted-whole: "how many squares in each part?" answered with every square of the
//   grid.
// - MC.function-column-pattern: a missing output continued from the Out row as a pattern (the
//   last output plus the last output step) instead of the machine's rule; rows 0 and 1 have no
//   pattern before them, so their true output stands in.
// - MC.function-first-pair-double: on an item whose first pair also doubles (in = n), each asked
//   input doubled.
// - MC.function-backwards: an add machine run from Out to In: each asked input take away n.
// - MC.function-add-for-take: a take-away machine treated as adding: each asked input plus n.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { columnGuess, functionTable } from '../../generators/alg/function';
import { type MisconceptionRule, sameResponse } from '../rules';

const answerRule = (
  id: string,
  applies: (item: GeneratedItem) => boolean,
  predict: (item: GeneratedItem) => ResponseValue | null,
): MisconceptionRule => ({
  id,
  kind: 'answer',
  applies,
  predict,
  match(item, r) {
    const p = predict(item);
    return p !== null && sameResponse(p, r);
  },
});

const gridOf = (item: GeneratedItem) => {
  const w = item.widget;
  if (w.format !== 'number-pad' && w.format !== 'fraction-pick') return null;
  return w.stimulus?.kind === 'grid-parts' ? w.stimulus : null;
};

/** A judged grid whose parts are equal: the only item where "they must look alike" shows. */
const judgedEqual = (item: GeneratedItem) =>
  gridOf(item) !== null &&
  item.widget.format === 'fraction-pick' &&
  item.answer.kind === 'choice' &&
  item.answer.id === 'yes';

export const equalSharesLookAlike = answerRule('equalSharesLookAlike', judgedEqual, (item) => {
  const g = gridOf(item);
  const a = item.answer;
  if (!g || item.widget.format !== 'fraction-pick') return null;
  return a.kind === 'choice' && a.id === 'yes' ? { kind: 'choice', id: 'no' } : null;
});

const counted = (item: GeneratedItem) =>
  gridOf(item) !== null && item.widget.format === 'number-pad';

export const shareCountedWhole = answerRule('shareCountedWhole', counted, (item) => {
  const g = gridOf(item);
  if (!g || item.widget.format !== 'number-pad' || item.answer.kind !== 'number') return null;
  return { kind: 'number', value: g.cols * g.rows };
});

/** The machine's table behind a table item, or null. */
function tableOf(item: GeneratedItem) {
  if (item.widget.format !== 'pattern-extend' || item.widget.mode !== 'table') return null;
  return functionTable(item.params);
}

/** A buggy numbers answer from one value per asked row; null if one is not typeable or all match. */
function asked(item: GeneratedItem, value: (j: number) => number | null): ResponseValue | null {
  const t = tableOf(item);
  if (!t) return null;
  const values = t.asked.map(value);
  if (values.some((v) => v === null || v < 0 || v > 999)) return null;
  const right = t.asked.map((j) => t.outputs[j] as number);
  if (values.every((v, k) => v === right[k])) return null;
  return { kind: 'numbers', values: values as number[] };
}

const isTable = (item: GeneratedItem) => tableOf(item) !== null;
const tableWith = (op: 'add' | 'sub') => (item: GeneratedItem) => tableOf(item)?.op === op;
/** A table whose first pair also doubles (in = n). */
const lured = (item: GeneratedItem) => {
  const t = tableOf(item);
  return t !== null && t.op === 'add' && t.inputs[0] === t.n;
};

export const functionColumnPattern = answerRule('functionColumnPattern', isTable, (item) => {
  const t = tableOf(item);
  return t ? asked(item, (j) => columnGuess(t.outputs, j) ?? (t.outputs[j] as number)) : null;
});

export const functionFirstPairDouble = answerRule('functionFirstPairDouble', lured, (item) => {
  const t = tableOf(item);
  if (!t || t.op !== 'add' || t.inputs[0] !== t.n) return null;
  return asked(item, (j) => 2 * (t.inputs[j] as number));
});

export const functionBackwards = answerRule('functionBackwards', tableWith('add'), (item) => {
  const t = tableOf(item);
  return t && t.op === 'add' ? asked(item, (j) => (t.inputs[j] as number) - t.n) : null;
});

export const functionAddForTake = answerRule('functionAddForTake', tableWith('sub'), (item) => {
  const t = tableOf(item);
  return t && t.op === 'sub' ? asked(item, (j) => (t.inputs[j] as number) + t.n) : null;
});
