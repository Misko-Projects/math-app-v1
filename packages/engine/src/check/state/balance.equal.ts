// balance.equal `{ left, right }` (03 §5.5 balance make-equal, K01 convention): `left` and `right`
// are what the two pans already hold (the value of each side's terms). The child adds unit blocks
// (or more of the pan's objects, one unit each) and responds `{ left, right }`, the blocks added to
// each pan. Any amount that balances is correct: left + added left = right + added right, so adding
// the same to both pans is an alternative too. Counts are whole and never negative.
import { num, type StateChecker } from './types';

const count = (v: unknown): number | undefined => {
  const n = num(v);
  return n !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined;
};

/** The blocks a pan still needs so the two pans balance, or null when the target is malformed. */
export function blocksToBalance(target: Readonly<Record<string, unknown>>): {
  side: 'left' | 'right' | null;
  count: number;
} | null {
  const left = num(target.left);
  const right = num(target.right);
  if (left === undefined || right === undefined) return null;
  if (left === right) return { side: null, count: 0 };
  return left < right
    ? { side: 'left', count: right - left }
    : { side: 'right', count: left - right };
}

export const balanceEqual: StateChecker = {
  id: 'balance.equal',
  check(target, value) {
    const left = num(target.left);
    const right = num(target.right);
    const addLeft = count(value.left);
    const addRight = count(value.right);
    if (left === undefined || right === undefined) return false;
    if (addLeft === undefined || addRight === undefined) return false;
    return left + addLeft === right + addRight;
  },
};
