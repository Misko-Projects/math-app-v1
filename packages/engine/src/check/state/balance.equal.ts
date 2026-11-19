// balance.equal `{ left, right }` (03 §5.5 balance make-equal, K01 convention): `left` and `right`
// are what the two pans already hold (the value of each side's terms). The child adds unit blocks
// (or more of the pan's objects, one unit each) and responds `{ left, right }`, the blocks added to
// each pan. Any amount that balances is correct: left + added left = right + added right, so adding
// the same to both pans is an alternative too. Counts and pan values are whole, never negative,
// and at most MAX_BLOCKS: past 2^53 a float sum rounds, so unequal pans could compare equal.
import { num, type StateChecker } from './types';

/** The most a pan holds or a child adds (far above any K–3 item, far below 2^53). */
export const MAX_BLOCKS = 1000;

const count = (v: unknown): number | undefined => {
  const n = num(v);
  return n !== undefined && Number.isSafeInteger(n) && n >= 0 && n <= MAX_BLOCKS ? n : undefined;
};

/**
 * The blocks a pan still needs so the two pans balance, or null when the target is one the checker
 * rejects (malformed, negative, fractional or past MAX_BLOCKS).
 */
export function blocksToBalance(target: Readonly<Record<string, unknown>>): {
  side: 'left' | 'right' | null;
  count: number;
} | null {
  const left = count(target.left);
  const right = count(target.right);
  if (left === undefined || right === undefined) return null;
  if (left === right) return { side: null, count: 0 };
  return left < right
    ? { side: 'left', count: right - left }
    : { side: 'right', count: left - right };
}

export const balanceEqual: StateChecker = {
  id: 'balance.equal',
  check(target, value) {
    const left = count(target.left);
    const right = count(target.right);
    const addLeft = count(value.left);
    const addRight = count(value.right);
    if (left === undefined || right === undefined) return false;
    if (addLeft === undefined || addRight === undefined) return false;
    return left + addLeft === right + addRight;
  },
};
