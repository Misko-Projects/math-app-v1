// balance.equal (K01 balance make-equal convention): any blocks that make the pans level are
// correct, including adding to both pans; near misses and malformed values are rejected.

import { describe, expect, it } from 'vitest';
import { balanceEqual, blocksToBalance } from './balance.equal';
import { stateChecker } from './index';

type Rec = Record<string, unknown>;

const CASES: [string, Rec, Rec, boolean][] = [
  ['the light right pan gets the difference', { left: 7, right: 5 }, { left: 0, right: 2 }, true],
  ['the light left pan gets the difference', { left: 3, right: 8 }, { left: 5, right: 0 }, true],
  [
    'alternative: more on both pans, still level',
    { left: 7, right: 5 },
    { left: 1, right: 3 },
    true,
  ],
  ['already level, nothing added', { left: 4, right: 4 }, { left: 0, right: 0 }, true],
  ['one block too few', { left: 7, right: 5 }, { left: 0, right: 1 }, false],
  ['one block too many', { left: 7, right: 5 }, { left: 0, right: 3 }, false],
  ['blocks on the heavy pan', { left: 7, right: 5 }, { left: 2, right: 0 }, false],
  ['negative blocks', { left: 7, right: 5 }, { left: -2, right: 0 }, false],
  ['fractional blocks', { left: 7, right: 5 }, { left: 0, right: 2.5 }, false],
  ['missing pan', { left: 7, right: 5 }, { right: 2 }, false],
  ['malformed target', { left: 'seven', right: 5 }, { left: 0, right: 2 }, false],
  // Past 2^53 the sums round: 7 + MAX_SAFE_INTEGER and 5 + (MAX_SAFE_INTEGER + 1) are the same
  // float, although the pans differ by one block. Counts are bounded, so neither is accepted.
  [
    'a huge count that would round level',
    { left: 7, right: 5 },
    { left: Number.MAX_SAFE_INTEGER, right: Number.MAX_SAFE_INTEGER + 1 },
    false,
  ],
  [
    'level, but with counts past MAX_BLOCKS',
    { left: 7, right: 5 },
    { left: Number.MAX_SAFE_INTEGER - 2, right: Number.MAX_SAFE_INTEGER },
    false,
  ],
  ['a count over MAX_BLOCKS', { left: 7, right: 5 }, { left: 1000, right: 1002 }, false],
  ['MAX_BLOCKS itself is a count', { left: 0, right: 0 }, { left: 1000, right: 1000 }, true],
  ['a huge target pan', { left: Number.MAX_SAFE_INTEGER, right: 5 }, { left: 0, right: 0 }, false],
];

describe('balance.equal', () => {
  it('is registered', () => {
    expect(stateChecker('balance.equal')).toBe(balanceEqual);
  });

  it.each(CASES)('%s', (_name, target, value, want) => {
    expect(balanceEqual.check(target, value)).toBe(want);
  });

  it('blocksToBalance names the light pan and how many it needs', () => {
    expect(blocksToBalance({ left: 7, right: 5 })).toEqual({ side: 'right', count: 2 });
    expect(blocksToBalance({ left: 2, right: 9 })).toEqual({ side: 'left', count: 7 });
    expect(blocksToBalance({ left: 4, right: 4 })).toEqual({ side: null, count: 0 });
    expect(blocksToBalance({ left: 4 })).toBeNull();
  });
});
