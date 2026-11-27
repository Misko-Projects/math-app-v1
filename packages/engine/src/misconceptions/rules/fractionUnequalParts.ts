// MC.fraction-unequal-parts (03 §7.2): calls unequal pieces halves or fourths, or an unequal share
// fair. Answer, on the frac.partition and div.share items of FRA.01 and FRA.07:
// - a fair-or-not item (equal-share or fraction-pick) whose parts or shares are not equal,
//   answered `yes`;
// - a fraction-pick pick-picture item asking for halves or fourths, answered with the picture of
//   the same number of parts that are not equal;
// - state: a `fraction.cut` with the right number of regions but unequal areas, or a
//   `fraction.partition` with the right number of marks that are not evenly spaced;
// - an unfair pre-dealt share to make fair (`share.fair` with `predealt`) left as it was dealt;
// - the number-pad "how many must move to make it fair" item answered 0.
// `predict` gives one such response (a cut moving half a part from the first region to the second,
// a partition with the first mark moved 0.4 of a part); `match` accepts every response of the kind
// described. Null when the item cannot show it (a fair share, an "unequal" pick item).

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { coversWhole, equalRegions } from '../../check/state/fraction.cut';
import {
  innerCuts,
  PARTITION_TOLERANCE,
  partitionPoints,
} from '../../check/state/fraction.partition';
import { nums } from '../../check/state/types';
import { type MisconceptionRule, sameResponse } from '../rules';

/** Equal regions, except that half a part moves from the first region to the second. */
export function unequalRegions(parts: number): number[] {
  const r = new Array<number>(parts).fill(1 / parts);
  r[0] = 1.5 / parts;
  r[1] = 0.5 / parts;
  return r;
}

/** The marks of an even partition with the first one moved 0.4 of a part. */
export function unequalCuts(den: number, max: number): number[] {
  const cuts = partitionPoints(den, max);
  cuts[0] = (cuts[0] as number) + 0.4 / den;
  return cuts;
}

function predict(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const a = item.answer;
  if (w.format === 'equal-share' && w.ask === 'fair-or-not') {
    return a.kind === 'choice' && a.id === 'no' ? { kind: 'choice', id: 'yes' } : null;
  }
  if (w.format === 'fraction-pick' && w.mode === 'fair-or-not') {
    return a.kind === 'choice' && a.id === 'no' ? { kind: 'choice', id: 'yes' } : null;
  }
  if (w.format === 'fraction-pick' && w.mode === 'pick-picture' && a.kind === 'choice') {
    const answer = w.options?.find((o) => o.id === a.id)?.stimulus;
    if (answer?.kind !== 'fraction' || !answer.equalParts) return null;
    const lookalike = w.options?.find(
      (o) =>
        o.stimulus?.kind === 'fraction' &&
        !o.stimulus.equalParts &&
        o.stimulus.parts === answer.parts,
    );
    return lookalike ? { kind: 'choice', id: lookalike.id } : null;
  }
  if (a.kind === 'state' && a.checker === 'fraction.cut') {
    const parts = a.target.parts as number;
    const shade = typeof a.target.shade === 'number' ? a.target.shade : 0;
    return {
      kind: 'state',
      value: { regions: unequalRegions(parts), shaded: Array.from({ length: shade }, (_, i) => i) },
    };
  }
  if (a.kind === 'state' && a.checker === 'fraction.partition') {
    const max = typeof a.target.max === 'number' ? a.target.max : 1;
    return { kind: 'state', value: { cuts: unequalCuts(a.target.denominator as number, max) } };
  }
  if (w.format === 'equal-share' && w.predealt && a.kind === 'state') {
    const predealt = w.predealt;
    if (predealt.every((x) => x === predealt[0])) return null;
    const dealt = predealt.reduce((s, x) => s + x, 0);
    return {
      kind: 'state',
      value: { shares: [...predealt], leftover: w.items - dealt, value: predealt[0] as number },
    };
  }
  if (w.format === 'number-pad' && item.params.ask === 'moves' && a.kind === 'number') {
    return a.value !== 0 ? { kind: 'number', value: 0 } : null;
  }
  return null;
}

export const fractionUnequalParts: MisconceptionRule = {
  id: 'fractionUnequalParts',
  kind: 'answer',
  // A grid's "how many squares in each part?" (FRA.16) has equal parts: nothing to call fair.
  applies: (item) =>
    item.widget.format !== 'number-pad' || item.widget.stimulus.kind !== 'grid-parts',
  predict,
  match(item, r) {
    const a = item.answer;
    const w = item.widget;
    if (r.kind === 'state' && a.kind === 'state') {
      if (a.checker === 'fraction.cut') {
        const regions = nums(r.value.regions);
        const parts = a.target.parts as number;
        return (
          regions !== undefined &&
          regions.length === parts &&
          coversWhole(regions) &&
          !equalRegions(regions, parts)
        );
      }
      if (a.checker === 'fraction.partition') {
        const cuts = nums(r.value.cuts);
        const den = a.target.denominator as number;
        const max = typeof a.target.max === 'number' ? a.target.max : 1;
        if (!cuts) return false;
        const inner = innerCuts(cuts, max);
        const want = partitionPoints(den, max);
        return (
          inner.length === want.length &&
          want.some((p, i) => Math.abs((inner[i] as number) - p) > PARTITION_TOLERANCE + 1e-9)
        );
      }
      if (w.format === 'equal-share' && w.predealt) {
        const shares = nums(r.value.shares);
        const predealt = w.predealt;
        return (
          shares !== undefined &&
          !predealt.every((x) => x === predealt[0]) &&
          shares.length === predealt.length &&
          shares.every((x, i) => x === predealt[i])
        );
      }
    }
    const buggy = predict(item);
    return buggy !== null && sameResponse(buggy, r);
  },
};
