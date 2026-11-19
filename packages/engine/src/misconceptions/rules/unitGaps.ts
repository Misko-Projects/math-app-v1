// MC.unit-gaps (03 §7.2): leaves gaps or overlaps between units when measuring with copies of one
// unit. State: on a `units.iterate` item, the laid units (or the space before the first one) leave
// a gap or an overlap beyond the tolerance, or, with as many units as the object is long, small gaps
// or overlaps add up so the last unit ends past or short of the object's end. There is no single
// buggy end state, so the rule has no `predict`; it matches the response it is given.

import {
  DEFAULT_GAP_TOLERANCE,
  endSpacing,
  unitStarts,
  worstSpacing,
} from '../../check/state/units.iterate';
import type { MisconceptionRule } from '../rules';

export const unitGaps: MisconceptionRule = {
  id: 'unitGaps',
  kind: 'state',
  match(item, r) {
    const a = item.answer;
    if (a.kind !== 'state' || a.checker !== 'units.iterate' || r.kind !== 'state') return false;
    const starts = unitStarts(r.value);
    if (!starts || starts.length === 0) return false;
    const tol =
      typeof a.target.gapTolerance === 'number' ? a.target.gapTolerance : DEFAULT_GAP_TOLERANCE;
    if (Math.abs(worstSpacing(starts)) > tol + 1e-9) return true;
    // A wrong count is not this misconception; the right count that misses the end is.
    const length = a.target.length;
    return (
      typeof length === 'number' &&
      starts.length === length &&
      Math.abs(endSpacing(starts, length)) > tol + 1e-9
    );
  },
};
