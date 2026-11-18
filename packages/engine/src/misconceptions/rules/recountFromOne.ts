// MC.recount-from-one (03 §7.2), process: asked "how many?" right after counting, the child counts
// the whole set again instead of saying the last number counted. Tap-count `how-many` items only:
// once every object (`obj-0` … `obj-<n − 1>`) has been tapped, a new tap sequence (at least two
// more taps, all on objects that are already marked) starts before the answer. A single stray tap
// is not a recount. Correct answers can be tagged: the count is right, the cardinal idea is not
// there yet. It has no `predict`: the response itself is usually the right count.

import type { MisconceptionRule } from '../rules';

const OBJ = /^obj-(\d+)$/;

/** Taps needed after the first full pass before it counts as a recount. */
const MIN_RECOUNT_TAPS = 2;

export const recountFromOne: MisconceptionRule = {
  id: 'recountFromOne',
  kind: 'process',
  match(item, _r, meta) {
    const w = item.widget;
    if (w.format !== 'tap-count' || w.mode !== 'how-many') return false;
    const n = w.set.count;
    if (n < 2) return false;
    const taps = (meta?.trace ?? [])
      .filter((e) => e.t === 'tap')
      .flatMap((e) => {
        const m = e.target.match(OBJ);
        const i = m ? Number(m[1]) : -1;
        return i >= 0 && i < n ? [i] : [];
      });
    // After the first full pass, count the DISTINCT objects tapped again: tapping one object
    // several times is fidgeting, not a second counting pass.
    const seen = new Set<number>();
    const again = new Set<number>();
    for (const i of taps) {
      if (seen.size === n) again.add(i);
      else seen.add(i);
    }
    return again.size >= MIN_RECOUNT_TAPS;
  },
};
