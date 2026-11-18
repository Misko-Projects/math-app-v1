// MC.unit-gaps (03 §7.2): leaves gaps or overlaps between units when measuring with copies of one
// unit. State: on a `units.iterate` item, the laid units (or the space before the first one) leave
// a gap or an overlap beyond the tolerance. There is no single buggy end state, so the rule has no
// `predict`; it matches the response it is given.

import { DEFAULT_GAP_TOLERANCE, unitStarts, worstSpacing } from '../../check/state/units.iterate';
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
    return Math.abs(worstSpacing(starts)) > tol + 1e-9;
  },
};
