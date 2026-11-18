// MC.off-by-one-counting (03 §7.2), process: skips an object or counts one twice (7 objects → 6 or
// 8). With a tap trace, it matches when an object (`obj-<i>`) was tapped twice or never, and
// r = v ± 1. Without a tap trace (a picture-only item, or a make-a-set item, whose trace is drags),
// it matches r = v ± 1 when v ≥ 4. On make-set items r is the container's count.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { numberOptionId, responseNumber } from '../../formats/numeral-pick';
import type { MisconceptionRule } from '../rules';

const OBJ = /^obj-(\d+)$/;

/** The count a counting item asks for (how many, or make a set of n), or null. */
function countAnswer(item: GeneratedItem): number | null {
  const mode = item.params.mode;
  if (mode !== undefined && mode !== 'how-many' && mode !== 'make') return null;
  const n = item.params.n;
  return typeof n === 'number' ? n : null;
}

function responseCount(r: ResponseValue): number | null {
  if (r.kind === 'state') return typeof r.value.count === 'number' ? r.value.count : null;
  return responseNumber(r);
}

export const offByOneCounting: MisconceptionRule = {
  id: 'offByOneCounting',
  kind: 'process',
  predict(item): ResponseValue | null {
    const v = countAnswer(item);
    if (v === null || v < 4) return null;
    const r = v - 1; // skipping an object is the more common slip
    if (item.answer.kind === 'number') return { kind: 'number', value: r };
    if (item.answer.kind === 'choice' && item.widget.format === 'numeral-pick') {
      return { kind: 'choice', id: numberOptionId(r) };
    }
    if (item.answer.kind === 'state' && item.widget.format === 'make-set') {
      return { kind: 'state', value: { count: r, removed: 0 } };
    }
    return null;
  },
  match(item, r, meta) {
    const v = countAnswer(item);
    const got = responseCount(r);
    if (v === null || got === null || Math.abs(got - v) !== 1) return false;
    const taps = (meta?.trace ?? [])
      .filter((e) => e.t === 'tap')
      .flatMap((e) => {
        const m = e.target.match(OBJ);
        return m ? [Number(m[1])] : [];
      });
    if (taps.length === 0) return v >= 4;
    const seen = new Set<number>();
    let doubled = false;
    for (const i of taps) {
      if (seen.has(i)) doubled = true;
      seen.add(i);
    }
    let untapped = false;
    for (let i = 0; i < v; i += 1) if (!seen.has(i)) untapped = true;
    return doubled || untapped;
  },
};
