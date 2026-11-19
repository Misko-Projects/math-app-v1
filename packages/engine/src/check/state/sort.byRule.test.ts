// sort.byRule and select.exactSet `{ ids }` (03 §5.5 shape-sort, §5.7): table tests with
// alternative valid end states and malformed values.

import { describe, expect, it } from 'vitest';
import { selectExactSet } from './select.exactSet';
import { ruleMatches, sortByRule } from './sort.byRule';

type Rec = Record<string, unknown>;

const square = { shape: 'square', sides: 4, corners: 4, rightAngles: 4, equalSides: true };
const rect = { shape: 'rectangle', sides: 4, corners: 4, rightAngles: 4, equalSides: false };
const rhombus = { shape: 'rhombus', sides: 4, corners: 4, rightAngles: 0, equalSides: true };
const circle = { shape: 'circle', sides: 0, corners: 0, rightAngles: 0, equalSides: false };

// "Four square corners" and "all sides equal": a square fits both bins; a circle fits none.
const OVERLAP = {
  cards: [
    { id: 'c0', props: square },
    { id: 'c1', props: rect },
    { id: 'c2', props: rhombus },
    { id: 'c3', props: circle },
  ],
  bins: [
    { id: 'b0', rule: { prop: 'rightAngles', op: '==', value: 4 } },
    { id: 'b1', rule: { prop: 'equalSides', op: '==', value: true } },
  ],
};

const CASES: [string, Rec, Rec, boolean][] = [
  ['every card in its bin', OVERLAP, { bins: { b0: ['c0', 'c1'], b1: ['c2'] } }, true],
  [
    'alternative: the square in the other bin',
    OVERLAP,
    { bins: { b0: ['c1'], b1: ['c0', 'c2'] } },
    true,
  ],
  [
    'alternative: bins listed in any order',
    OVERLAP,
    { bins: { b1: ['c2', 'c0'], b0: ['c1'] } },
    true,
  ],
  ['a card in a bin it does not fit', OVERLAP, { bins: { b0: ['c0', 'c1', 'c2'], b1: [] } }, false],
  ['a fitting card left in the tray', OVERLAP, { bins: { b0: ['c0'], b1: ['c2'] } }, false],
  ['the circle put in a bin', OVERLAP, { bins: { b0: ['c0', 'c1', 'c3'], b1: ['c2'] } }, false],
  ['one card in two bins', OVERLAP, { bins: { b0: ['c0', 'c1'], b1: ['c0', 'c2'] } }, false],
  ['an unknown bin', OVERLAP, { bins: { b0: ['c0', 'c1'], b1: ['c2'], b9: [] } }, false],
  ['an unknown card', OVERLAP, { bins: { b0: ['c0', 'c1', 'c9'], b1: ['c2'] } }, false],
];

describe('sort.byRule', () => {
  it.each(CASES)('%s', (_name, target, value, expected) => {
    expect(sortByRule.check(target, value)).toBe(expected);
  });

  it('rejects malformed values and targets without throwing', () => {
    for (const v of [
      {},
      { bins: [] },
      { bins: { b0: 'c0' } },
      { bins: { b0: [1] } },
      { bins: null },
    ]) {
      expect(sortByRule.check(OVERLAP, v as Rec)).toBe(false);
    }
    for (const t of [
      {},
      { cards: 'x', bins: [] },
      { cards: [], bins: [] },
      { cards: [{}], bins: [{}] },
    ]) {
      expect(sortByRule.check(t, { bins: {} })).toBe(false);
    }
  });

  it('evaluates all / any / in / >= / <= rules', () => {
    expect(
      ruleMatches(
        {
          all: [
            { prop: 'sides', op: '>=', value: 4 },
            { prop: 'equalSides', op: '==', value: true },
          ],
        },
        square,
      ),
    ).toBe(true);
    expect(
      ruleMatches({ any: [{ prop: 'shape', op: 'in', value: ['circle', 'oval'] }] }, circle),
    ).toBe(true);
    expect(ruleMatches({ prop: 'sides', op: '<=', value: 3 }, rect)).toBe(false);
    expect(ruleMatches({ prop: 'shape', op: 'in', value: 'square' }, square)).toBe(false);
  });
});

describe('select.exactSet with card ids', () => {
  const target = { ids: ['c0', 'c3'] };
  it.each([
    ['the set', { ids: ['c0', 'c3'] }, true],
    ['alternative: any order', { ids: ['c3', 'c0'] }, true],
    ['one missing', { ids: ['c0'] }, false],
    ['one extra', { ids: ['c0', 'c3', 'c1'] }, false],
    ['a duplicate', { ids: ['c0', 'c3', 'c3'] }, false],
    ['numbers instead of ids', { values: [0, 3] }, false],
    ['malformed', { ids: 'c0,c3' }, false],
  ] as [string, Rec, boolean][])('%s', (_name, value, expected) => {
    expect(selectExactSet.check(target, value)).toBe(expected);
  });
});
