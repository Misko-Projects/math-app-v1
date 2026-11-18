// MC.count-all-instead (03 §7.2), process: counts both groups from 1 instead of counting on. The
// trace taps every one of the a + b counters, starting with the first addend. Counters are traced
// as `counter-<i>`: indexes 0 … a − 1 are the first addend, a … a + b − 1 the second. Correct
// answers can be tagged.

import type { MisconceptionRule } from '../rules';

const COUNTER = /^counter-(\d+)$/;

export const countAllInstead: MisconceptionRule = {
  id: 'countAllInstead',
  kind: 'process',
  match(item, _r, meta) {
    const { a, b, op } = item.params;
    if (op !== '+' || typeof a !== 'number' || typeof b !== 'number' || a <= 0) return false;
    const taps = (meta?.trace ?? [])
      .filter((e) => e.t === 'tap')
      .flatMap((e) => {
        const m = e.target.match(COUNTER);
        return m ? [Number(m[1])] : [];
      });
    if (taps.length === 0) return false;
    const first = taps[0] as number;
    if (first >= a) return false; // started on the second addend: counting on
    const distinct = new Set(taps.filter((i) => i < a + b));
    return distinct.size >= a + b;
  },
};
