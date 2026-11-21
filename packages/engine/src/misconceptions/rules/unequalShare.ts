// MC.unequal-share (03 §7.2): deals shares unequally, or keeps a leftover big enough for another
// round. State: on a `share.fair` item (equal-share `each`, `leftover`), the response's shares
// differ, or they are equal but what is left over (pile plus seagull) could go round again
// (leftover ≥ recipients). There is no single buggy end state, so the rule has no `predict`; it
// matches the response it is given.

import { num, nums } from '../../check/state/types';
import type { MisconceptionRule } from '../rules';

export const unequalShare: MisconceptionRule = {
  id: 'unequalShare',
  kind: 'state',
  match(item, r) {
    const a = item.answer;
    if (a.kind !== 'state' || a.checker !== 'share.fair' || r.kind !== 'state') return false;
    const shares = nums(r.value.shares);
    const leftover = num(r.value.leftover);
    const recipients = num(a.target.recipients);
    if (!shares || recipients === undefined || shares.length !== recipients) return false;
    if (!shares.every((x) => x === shares[0])) return true;
    return leftover !== undefined && leftover >= recipients;
  },
};
