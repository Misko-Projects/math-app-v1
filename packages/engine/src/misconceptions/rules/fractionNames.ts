// Grade 3 fraction misconceptions (03 §7.2, K02 slice 5a: FRA.03, FRA.09, FRA.13).
// - MC.fraction-part-to-part: names a picture's shaded parts against its unshaded ones, 3 of 8
//   shaded → [3, 5], or names the unshaded parts → [5, 8]. On frac.partition `name` items.
// - MC.fraction-swapped: puts the number of parts on top, 3 of 8 shaded → [8, 3].
// - MC.fraction-compare-tops: on a same-numerator comparison of wholes cut differently, calls
//   the two fractions equal because the top numbers match (`same` or `=`).
// Each predicts one response and is null when that response is the right answer (half shaded:
// the unshaded parts name the same fraction), so no right answer is ever claimed.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { type MisconceptionRule, sameResponse } from '../rules';

/** The [num, den] a name item asks for, or null. */
function named(item: GeneratedItem): [number, number] | null {
  const w = item.widget;
  const a = item.answer;
  if (w.format !== 'fraction-pick' || w.mode !== 'name') return null;
  if (a.kind !== 'numbers' || a.values.length !== 2) return null;
  return [a.values[0] as number, a.values[1] as number];
}

function guard(item: GeneratedItem, values: number[]): ResponseValue | null {
  const a = item.answer;
  const r: ResponseValue = { kind: 'numbers', values };
  if (a.kind === 'numbers' && sameResponse(r, { kind: 'numbers', values: a.values })) return null;
  return r;
}

function rule(id: string, predicts: (item: GeneratedItem) => ResponseValue[]): MisconceptionRule {
  return {
    id,
    kind: 'answer',
    predict: (item) => predicts(item)[0] ?? null,
    match: (item, r) => predicts(item).some((p) => sameResponse(p, r)),
  };
}

export const fractionPartToPart = rule('fractionPartToPart', (item) => {
  const f = named(item);
  if (!f) return [];
  const [num, den] = f;
  // A story names one part only (no unshaded parts drawn), so both forms apply to pictures and
  // stories alike: the eaten parts against the rest, or the rest named.
  return [guard(item, [num, den - num]), guard(item, [den - num, den])].filter(
    (r): r is ResponseValue => r !== null,
  );
});

export const fractionSwapped = rule('fractionSwapped', (item) => {
  const f = named(item);
  if (!f) return [];
  const r = guard(item, [f[1], f[0]]);
  return r ? [r] : [];
});

export const fractionCompareTops = rule('fractionCompareTops', (item) => {
  const w = item.widget;
  // Grade 3 comparisons in symbols only (FRA.13): FRA.08's one part of each whole has no tops.
  if (w.format !== 'compare' || item.params.kind !== 'sameNum' || item.answer.kind !== 'choice') {
    return [];
  }
  if (item.params.symbols !== true) return [];

  if (item.answer.id === 'same' || item.answer.id === '=') return [];
  return [{ kind: 'choice', id: w.ask === 'symbol' ? '=' : 'same' }];
});
