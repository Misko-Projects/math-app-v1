// 03 §5.7 state checkers for the U04 formats (#13): each accepts ANY end state that satisfies it
// (with at least one alternative valid end state), rejects near misses, and rejects malformed
// values without throwing.

import type { StateCheckerId } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from './index';
import type { StateChecker } from './types';

type Rec = Record<string, unknown>;

function checker(id: StateCheckerId): StateChecker {
  const c = stateChecker(id);
  if (!c) throw new Error(`no checker ${id}`);
  return c;
}

const mat = (hundreds: number, tens: number, ones: number, thousands = 0): Rec => ({
  thousands,
  hundreds,
  tens,
  ones,
});

const L = '110111'; // 3 × 2 L-shape (top-right cell missing)

/** [checker, case name, target, value, expected] */
type Case = [StateCheckerId, string, Rec, Rec, boolean];

const CASES: Case[] = [
  // baseten.value
  ['baseten.value', 'canonical 34', { value: 34 }, mat(0, 3, 4), true],
  ['baseten.value', 'alternative: 2 tens 14 ones', { value: 34 }, mat(0, 2, 14), true],
  ['baseten.value', 'alternative: 34 ones', { value: 34 }, mat(0, 0, 34), true],
  [
    'baseten.value',
    'thousands may be omitted',
    { value: 34 },
    { hundreds: 0, tens: 3, ones: 4 },
    true,
  ],
  ['baseten.value', 'with a thousand cube', { value: 1205 }, mat(2, 0, 5, 1), true],
  ['baseten.value', 'near miss: one ten short', { value: 34 }, mat(0, 2, 4), false],
  ['baseten.value', 'near miss: one extra one', { value: 34 }, mat(0, 3, 5), false],
  ['baseten.value', 'malformed: missing ones', { value: 34 }, { hundreds: 0, tens: 3 }, false],
  ['baseten.value', 'malformed: negative', { value: 34 }, mat(0, 4, -6), false],
  ['baseten.value', 'malformed: fraction', { value: 34 }, mat(0, 3.4, 0), false],
  ['baseten.value', 'malformed: no target', {}, mat(0, 3, 4), false],
  // baseten.exact
  ['baseten.exact', 'exactly 2 tens', { value: 34, exact: { tens: 2 } }, mat(0, 2, 14), true],
  [
    'baseten.exact',
    'alternative: free hundreds (none) and ones',
    { value: 134, exact: { tens: 2 } },
    mat(0, 2, 114),
    true,
  ],
  [
    'baseten.exact',
    'wrong count of the named kind',
    { value: 34, exact: { tens: 2 } },
    mat(0, 3, 4),
    false,
  ],
  [
    'baseten.exact',
    'right count, wrong value',
    { value: 34, exact: { tens: 2 } },
    mat(0, 2, 13),
    false,
  ],
  ['baseten.exact', 'malformed: no exact', { value: 34 }, mat(0, 2, 14), false],
  // trade.result
  ['trade.result', 'compute: canonical 42', { result: 42 }, mat(0, 4, 2), true],
  ['trade.result', 'alternative: untraded 3 tens 12 ones', { result: 42 }, mat(0, 3, 12), true],
  ['trade.result', 'near miss: one one short', { result: 42 }, mat(0, 4, 1), false],
  [
    'trade.result',
    'typed value matches',
    { result: 27, value: 27 },
    { ...mat(0, 2, 7), value: 27 },
    true,
  ],
  ['trade.result', 'typed value missing', { result: 27, value: 27 }, mat(0, 2, 7), false],
  [
    'trade.result',
    'typed value wrong',
    { result: 27, value: 27 },
    { ...mat(0, 2, 7), value: 37 },
    false,
  ],
  [
    'trade.result',
    'regroup-to: exact columns',
    { regroupTarget: { hundreds: 0, tens: 12, ones: 3 } },
    mat(0, 12, 3),
    true,
  ],
  [
    'trade.result',
    'regroup-to: same value, other columns',
    { regroupTarget: { hundreds: 0, tens: 12, ones: 3 } },
    mat(1, 2, 3),
    false,
  ],
  ['trade.result', 'malformed: no target', {}, mat(0, 4, 2), false],
  [
    'trade.result',
    'malformed: string column',
    { result: 42 },
    { hundreds: 0, tens: '4', ones: 2 },
    false,
  ],
  // array.dims
  ['array.dims', '3 × 4', { rows: 3, cols: 4 }, { rows: 3, cols: 4 }, true],
  ['array.dims', 'alternative: turned 4 × 3', { rows: 3, cols: 4 }, { rows: 4, cols: 3 }, true],
  [
    'array.dims',
    'turned, orientation matters',
    { rows: 3, cols: 4, orientationMatters: true },
    { rows: 4, cols: 3 },
    false,
  ],
  ['array.dims', 'near miss: one row more', { rows: 3, cols: 4 }, { rows: 4, cols: 4 }, false],
  [
    'array.dims',
    'split after column 1',
    { rows: 3, cols: 4, requireSplit: true },
    { rows: 3, cols: 4, split: 1, value: 12 },
    true,
  ],
  [
    'array.dims',
    'alternative: split after column 3',
    { rows: 3, cols: 4, requireSplit: true },
    { rows: 3, cols: 4, split: 3, value: 12 },
    true,
  ],
  [
    'array.dims',
    'split on the edge',
    { rows: 3, cols: 4, requireSplit: true },
    { rows: 3, cols: 4, split: 4, value: 12 },
    false,
  ],
  [
    'array.dims',
    'split with the wrong total',
    { rows: 3, cols: 4, requireSplit: true },
    { rows: 3, cols: 4, split: 2, value: 11 },
    false,
  ],
  ['array.dims', 'malformed: zero rows', { rows: 3, cols: 4 }, { rows: 0, cols: 4 }, false],
  ['array.dims', 'malformed: rows as a list', { rows: 3, cols: 4 }, { rows: [3], cols: 4 }, false],
  // array.area
  ['array.area', '3 × 4 for 12', { total: 12 }, { rows: 3, cols: 4 }, true],
  ['array.area', 'alternative: 2 × 6', { total: 12 }, { rows: 2, cols: 6 }, true],
  ['array.area', 'alternative: 1 × 12', { total: 12 }, { rows: 1, cols: 12 }, true],
  ['array.area', 'near miss: 3 × 5', { total: 12 }, { rows: 3, cols: 5 }, false],
  ['array.area', 'new-way: a new one', { total: 12, found: [[3, 4]] }, { rows: 2, cols: 6 }, true],
  [
    'array.area',
    'new-way: found, turned',
    { total: 12, found: [[3, 4]] },
    { rows: 4, cols: 3 },
    false,
  ],
  [
    'array.area',
    'malformed: found not pairs',
    { total: 12, found: [3, 4] },
    { rows: 2, cols: 6 },
    false,
  ],
  ['array.area', 'malformed: no rows', { total: 12 }, { cols: 12 }, false],
  // groups.equal
  [
    'groups.equal',
    '3 groups of 4',
    { groups: 3, perGroup: 4, value: 12 },
    { groups: [4, 4, 4], value: 12 },
    true,
  ],
  [
    'groups.equal',
    'alternative: an extra empty raft',
    { groups: 3, perGroup: 4, value: 12 },
    { groups: [4, 0, 4, 4], value: 12 },
    true,
  ],
  [
    'groups.equal',
    'unequal groups',
    { groups: 3, perGroup: 4, value: 12 },
    { groups: [5, 4, 3], value: 12 },
    false,
  ],
  [
    'groups.equal',
    'one group short',
    { groups: 3, perGroup: 4, value: 12 },
    { groups: [4, 4, 0], value: 12 },
    false,
  ],
  [
    'groups.equal',
    'wrong typed unknown',
    { groups: 3, perGroup: 4, value: 12 },
    { groups: [4, 4, 4], value: 11 },
    false,
  ],
  ['groups.equal', 'no typed unknown asked', { groups: 2, perGroup: 3 }, { groups: [3, 3] }, true],
  [
    'groups.equal',
    'malformed: groups not a list',
    { groups: 2, perGroup: 3 },
    { groups: 6 },
    false,
  ],
  // share.fair
  [
    'share.fair',
    '7 between 3, one left',
    { items: 7, recipients: 3, allowLeftover: true, value: 2 },
    { shares: [2, 2, 2], leftover: 1, value: 2 },
    true,
  ],
  [
    'share.fair',
    'alternative: the leftover asked for',
    { items: 7, recipients: 3, allowLeftover: true, value: 1 },
    { shares: [2, 2, 2], leftover: 1, value: 1 },
    true,
  ],
  [
    'share.fair',
    'unequal shares',
    { items: 7, recipients: 3, allowLeftover: true, value: 2 },
    { shares: [3, 2, 2], leftover: 0, value: 2 },
    false,
  ],
  [
    'share.fair',
    'someone could get one more',
    { items: 7, recipients: 3, allowLeftover: true, value: 1 },
    { shares: [1, 1, 1], leftover: 4, value: 1 },
    false,
  ],
  [
    'share.fair',
    'a leftover where none is allowed',
    { items: 7, recipients: 3, allowLeftover: false, value: 2 },
    { shares: [2, 2, 2], leftover: 1, value: 2 },
    false,
  ],
  [
    'share.fair',
    'items unaccounted for',
    { items: 7, recipients: 3, allowLeftover: true, value: 2 },
    { shares: [2, 2, 2], leftover: 0, value: 2 },
    false,
  ],
  [
    'share.fair',
    'malformed: wrong recipient count',
    { items: 6, recipients: 3, allowLeftover: false, value: 3 },
    { shares: [3, 3], leftover: 0, value: 3 },
    false,
  ],
  // tiles.cover
  ['tiles.cover', 'tile: the L covered', { mask: L, value: 5 }, { tiles: L, value: 5 }, true],
  [
    'tiles.cover',
    'tile: a cell missing',
    { mask: L, value: 5 },
    { tiles: '110110', value: 5 },
    false,
  ],
  [
    'tiles.cover',
    'tile: a tile outside',
    { mask: L, value: 5 },
    { tiles: '111111', value: 5 },
    false,
  ],
  ['tiles.cover', 'tile: wrong typed area', { mask: L, value: 5 }, { tiles: L, value: 6 }, false],
  [
    'tiles.cover',
    'decompose: vertical cut',
    { mask: L, w: 3, h: 2, decompose: true, value: 5 },
    { splits: [{ dir: 'v', at: 2 }], value: 5 },
    true,
  ],
  [
    'tiles.cover',
    'alternative: horizontal cut',
    { mask: L, w: 3, h: 2, decompose: true, value: 5 },
    { splits: [{ dir: 'h', at: 1 }], value: 5 },
    true,
  ],
  [
    'tiles.cover',
    'alternative: more cuts, all rectangles',
    { mask: L, w: 3, h: 2, decompose: true, value: 5 },
    {
      splits: [
        { dir: 'h', at: 1 },
        { dir: 'v', at: 1 },
      ],
      value: 5,
    },
    true,
  ],
  [
    'tiles.cover',
    'a cut that leaves an L',
    { mask: L, w: 3, h: 2, decompose: true, value: 5 },
    { splits: [{ dir: 'v', at: 1 }], value: 5 },
    false,
  ],
  [
    'tiles.cover',
    'no cut at all',
    { mask: '111111', w: 3, h: 2, decompose: true, value: 6 },
    { splits: [], value: 6 },
    false,
  ],
  [
    'tiles.cover',
    'malformed: a line off the grid',
    { mask: L, w: 3, h: 2, decompose: true, value: 5 },
    { splits: [{ dir: 'v', at: 3 }], value: 5 },
    false,
  ],
  ['tiles.cover', 'malformed: no mask', {}, { tiles: L }, false],
];

describe('U04 state checkers (03 §5.7)', () => {
  it.each(CASES)('%s: %s', (id, _name, target, value, want) => {
    expect(checker(id).check(target, value)).toBe(want);
  });

  it.each([
    'baseten.value',
    'baseten.exact',
    'trade.result',
    'array.dims',
    'array.area',
    'groups.equal',
    'share.fair',
    'tiles.cover',
  ] as StateCheckerId[])('%s: never throws on junk', (id) => {
    for (const junk of [{}, { rows: null }, { groups: [null] }, { splits: [null] }, { tiles: 7 }]) {
      expect(checker(id).check({ value: 1, total: 1, mask: '1', w: 1, h: 1 }, junk)).toBe(false);
    }
  });

  it('every state case list has an alternative valid end state per checker', () => {
    const ids = new Set(CASES.map(([id]) => id));
    for (const id of ids) {
      const alt = CASES.filter(
        ([c, name, , , ok]) => c === id && ok && name.startsWith('alternative'),
      );
      // baseten.exact and trade.result regroup-to admit fewer alternatives, but every checker
      // here lists at least one.
      expect(alt.length, id).toBeGreaterThan(0);
    }
  });
});

describe('array.dims near-miss exemption', () => {
  const ex = checker('array.dims').exempt as NonNullable<StateChecker['exempt']>;
  const target = { rows: 3, cols: 4, requireSplit: true };
  const original = { rows: 3, cols: 4, split: 1, value: 12 };

  it('exempts moving the split line to another valid column', () => {
    expect(ex(target, original, { ...original, split: 2 })).toBe(true);
  });

  it('does not exempt a changed total or array, or a split off the array', () => {
    expect(ex(target, original, { ...original, value: 13 })).toBe(false);
    expect(ex(target, original, { ...original, rows: 4 })).toBe(false);
    expect(ex(target, original, { ...original, split: 4 })).toBe(false);
    expect(ex({ rows: 3, cols: 4 }, { rows: 3, cols: 4 }, { rows: 4, cols: 3 })).toBe(false);
  });
});
