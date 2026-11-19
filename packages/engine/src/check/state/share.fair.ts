// share.fair `{ items, recipients, allowLeftover, value? }` (03 §5.5 equal-share `each`,
// `leftover`): every recipient holds the same count, the shares and the leftover account for every
// item, the leftover is smaller than the number of recipients (nobody could get one more), and it
// is 0 unless leftovers are allowed. The typed `value` matches when the target names one.
import { askedValueOk, num, nums, type StateChecker } from './types';

export const shareFair: StateChecker = {
  id: 'share.fair',
  check(target, value) {
    const items = num(target.items);
    const recipients = num(target.recipients);
    const shares = nums(value.shares);
    const leftover = num(value.leftover);
    if (items === undefined || recipients === undefined || !shares || leftover === undefined) {
      return false;
    }
    if (shares.length !== recipients) return false;
    if (![...shares, leftover].every((x) => Number.isInteger(x) && x >= 0)) return false;
    const each = shares[0] as number;
    if (!shares.every((x) => x === each)) return false;
    if (each * recipients + leftover !== items) return false;
    if (leftover >= recipients) return false;
    if (leftover > 0 && target.allowLeftover !== true) return false;
    return askedValueOk(target, value);
  },
};
