// 03 §5.7 state checkers and 03 §5.5 state equivalence: a checker accepts ANY end state that
// satisfies it, rejects near misses, and rejects malformed values without throwing.

import type { StateCheckerId } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from './index';
import { askedValueOk, isMoveOnly, partsOf, type StateChecker } from './types';

type Rec = Record<string, unknown>;

function checker(id: StateCheckerId): StateChecker {
  const c = stateChecker(id);
  if (!c) throw new Error(`no checker ${id}`);
  return c;
}

function exempt(id: StateCheckerId): NonNullable<StateChecker['exempt']> {
  const e = checker(id).exempt;
  if (!e) throw new Error(`checker ${id} has no exempt predicate`);
  return e;
}

/** Ten-frame frame of 10 cells starting with `xs`, the rest empty. */
const frame = (xs: number[]): number[] => [...xs, ...new Array<number>(10 - xs.length).fill(0)];
const FULL = frame(new Array<number>(10).fill(1));

/** [checker, case name, target, value, expected] */
type Case = [StateCheckerId, string, Rec, Rec, boolean];

const CORRECT_AND_ALTERNATIVES: Case[] = [
  // set.count
  ['set.count', 'exact count', { count: 5 }, { count: 5, removed: 0 }, true],
  ['set.count', 'hands 5 + 0', { count: 5 }, { count: 5, removed: 0, parts: [5, 0] }, true],
  [
    'set.count',
    'alternative: hands 3 + 2',
    { count: 5 },
    { count: 5, removed: 0, parts: [3, 2] },
    true,
  ],
  [
    'set.count',
    'groupsOf 10 with the ten bundled',
    { count: 12, groupsOf: 10 },
    { count: 12, bundles: 1 },
    true,
  ],
  [
    'set.count',
    'groupsOf 10 below ten (no bundle)',
    { count: 7, groupsOf: 10 },
    { count: 7, bundles: 0 },
    true,
  ],
  // tenframe.total
  ['tenframe.total', 'standard fill', { n: 4 }, { cells: [frame([1, 1, 1, 1])] }, true],
  [
    'tenframe.total',
    'alternative: counters in any cells',
    { n: 4 },
    { cells: [frame([0, 1, 0, 1, 0, 1, 0, 1])] },
    true,
  ],
  ['tenframe.total', 'alternative: both colours', { n: 4 }, { cells: [frame([2, 1, 2, 1])] }, true],
  [
    'tenframe.total',
    'alternative: across two frames',
    { n: 4 },
    { cells: [frame([1, 1]), frame([1, 1])] },
    true,
  ],
  [
    'tenframe.total',
    'standard fill required and held',
    { n: 4, requireStandardFill: true },
    { cells: [frame([1, 2, 1, 1])] },
    true,
  ],
  [
    'tenframe.total',
    'standard fill over two frames',
    { n: 13, requireStandardFill: true },
    { cells: [FULL, frame([1, 1, 1])] },
    true,
  ],
  [
    'tenframe.total',
    'with the asked value',
    { n: 4, value: 4 },
    { cells: [frame([1, 1, 1, 1])], value: 4 },
    true,
  ],
  ['tenframe.total', 'zero counters', { n: 0 }, { cells: [frame([])] }, true],
  // tenframe.makeTen
  [
    'tenframe.makeTen',
    'full frame and the rest',
    { total: 13 },
    { cells: [FULL, frame([1, 1, 1])] },
    true,
  ],
  [
    'tenframe.makeTen',
    'alternative: mixed colours, rest in any cells',
    { total: 13 },
    { cells: [frame([1, 1, 1, 1, 1, 1, 1, 1, 2, 2]), frame([0, 2, 0, 2, 0, 0, 0, 0, 0, 2])] },
    true,
  ],
  [
    'tenframe.makeTen',
    'with the asked value',
    { total: 13, value: 13 },
    { cells: [FULL, frame([1, 1, 1])], value: 13 },
    true,
  ],
  // bond.split
  ['bond.split', '1 + 4', { whole: 5 }, { parts: [1, 4] }, true],
  ['bond.split', 'alternative: 3 + 2', { whole: 5 }, { parts: [3, 2] }, true],
  ['bond.split', 'alternative: 5 + 0 without nonZero', { whole: 5 }, { parts: [5, 0] }, true],
  ['bond.split', 'nonZero split', { whole: 5, nonZero: true }, { parts: [4, 1] }, true],
  [
    'bond.split',
    'ten-frame colours 3 + 2',
    { whole: 5 },
    { cells: [frame([1, 2, 1, 2, 1])] },
    true,
  ],
  ['bond.split', 'rekenrek rows 2 + 3', { whole: 5 }, { rows: [2, 3] }, true],
  // bond.newWay
  ['bond.newWay', 'a split not found yet', { whole: 5, found: [[1, 4]] }, { parts: [2, 3] }, true],
  [
    'bond.newWay',
    'alternative: the same split turned around',
    { whole: 5, found: [[1, 4]] },
    { parts: [3, 2] },
    true,
  ],
  ['bond.newWay', 'alternative: 0 + 5', { whole: 5, found: [[1, 4]] }, { parts: [0, 5] }, true],
  ['bond.newWay', 'no found list: any split', { whole: 5 }, { parts: [1, 4] }, true],
  [
    'bond.newWay',
    'malformed found entries are ignored',
    { whole: 5, found: [[1, 4], 'x', [2]] },
    { parts: [2, 3] },
    true,
  ],
  // rekenrek.total
  ['rekenrek.total', 'top row only', { n: 7, rowRule: 'any' }, { rows: [7, 0] }, true],
  ['rekenrek.total', 'alternative: 5 + 2', { n: 7, rowRule: 'any' }, { rows: [5, 2] }, true],
  [
    'rekenrek.total',
    'alternative: bottom row only',
    { n: 7, rowRule: 'any' },
    { rows: [0, 7] },
    true,
  ],
  [
    'rekenrek.total',
    'fill-top-first: full top row, then bottom',
    { n: 13, rowRule: 'fill-top-first' },
    { rows: [10, 3] },
    true,
  ],
  [
    'rekenrek.total',
    'fill-top-first: top row only',
    { n: 7, rowRule: 'fill-top-first' },
    { rows: [7, 0] },
    true,
  ],
  [
    'rekenrek.total',
    'with the asked value',
    { n: 7, rowRule: 'any', value: 7 },
    { rows: [5, 2], value: 7 },
    true,
  ],
  // jumps.reach
  [
    'jumps.reach',
    'ones',
    { start: 3, target: 6, allowedJumps: [1, 2] },
    { jumps: [1, 1, 1] },
    true,
  ],
  [
    'jumps.reach',
    'alternative: 2 + 1',
    { start: 3, target: 6, allowedJumps: [1, 2] },
    { jumps: [2, 1] },
    true,
  ],
  [
    'jumps.reach',
    'alternative: 1 + 2',
    { start: 3, target: 6, allowedJumps: [1, 2] },
    { jumps: [1, 2] },
    true,
  ],
  [
    'jumps.reach',
    'back and forth with signed jumps',
    { start: 3, target: 4, allowedJumps: [1, -1] },
    { jumps: [1, 1, -1] },
    true,
  ],
  [
    'jumps.reach',
    'counting back',
    { start: 13, target: 8, allowedJumps: [-1, -2, -5] },
    { jumps: [-5] },
    true,
  ],
  [
    'jumps.reach',
    'alternative counting back',
    { start: 13, target: 8, allowedJumps: [-1, -2, -5] },
    { jumps: [-2, -2, -1] },
    true,
  ],
  [
    'jumps.reach',
    'with the asked value',
    { start: 3, target: 6, allowedJumps: [1, 2], value: 6 },
    { jumps: [2, 1], value: 6 },
    true,
  ],
  // select.exactSet
  ['select.exactSet', 'the set', { values: [5, 10, 15] }, { values: [5, 10, 15] }, true],
  [
    'select.exactSet',
    'alternative: any order',
    { values: [5, 10, 15] },
    { values: [15, 5, 10] },
    true,
  ],
  ['select.exactSet', 'the empty set', { values: [] }, { values: [] }, true],
];

const NEAR_MISSES: Case[] = [
  ['set.count', 'one fewer', { count: 5 }, { count: 4, removed: 0 }, false],
  ['set.count', 'one more', { count: 5 }, { count: 6, removed: 0 }, false],
  [
    'set.count',
    'groupsOf 10 without the bundle',
    { count: 12, groupsOf: 10 },
    { count: 12, bundles: 0 },
    false,
  ],
  [
    'set.count',
    'groupsOf 10 without bundles at all',
    { count: 12, groupsOf: 10 },
    { count: 12 },
    false,
  ],
  ['tenframe.total', 'one counter short', { n: 4 }, { cells: [frame([1, 1, 1])] }, false],
  ['tenframe.total', 'one counter over', { n: 4 }, { cells: [frame([1, 1, 1, 1, 1])] }, false],
  [
    'tenframe.total',
    'standard fill required: a gap',
    { n: 4, requireStandardFill: true },
    { cells: [frame([1, 0, 1, 1, 1])] },
    false,
  ],
  [
    'tenframe.total',
    'standard fill required: frame 1 before frame 0 is full',
    { n: 4, requireStandardFill: true },
    { cells: [frame([1, 1]), frame([1, 1])] },
    false,
  ],
  [
    'tenframe.total',
    'the asked value is missing',
    { n: 4, value: 4 },
    { cells: [frame([1, 1, 1, 1])] },
    false,
  ],
  [
    'tenframe.total',
    'the asked value is wrong',
    { n: 4, value: 4 },
    { cells: [frame([1, 1, 1, 1])], value: 5 },
    false,
  ],
  [
    'tenframe.makeTen',
    'frame 0 not full',
    { total: 13 },
    { cells: [frame([1, 1, 1, 1, 1, 1, 1, 1, 1]), frame([1, 1, 1, 1])] },
    false,
  ],
  [
    'tenframe.makeTen',
    'full frame, wrong total',
    { total: 13 },
    { cells: [FULL, frame([1, 1])] },
    false,
  ],
  [
    'tenframe.makeTen',
    'the asked value is wrong',
    { total: 13, value: 13 },
    { cells: [FULL, frame([1, 1, 1])], value: 3 },
    false,
  ],
  ['bond.split', 'parts sum to one less', { whole: 5 }, { parts: [2, 2] }, false],
  ['bond.split', 'parts sum to one more', { whole: 5 }, { parts: [3, 3] }, false],
  ['bond.split', 'three parts', { whole: 5 }, { parts: [1, 2, 2] }, false],
  ['bond.split', 'a zero part with nonZero', { whole: 5, nonZero: true }, { parts: [0, 5] }, false],
  [
    'bond.split',
    'ten-frame colours that do not add up',
    { whole: 5 },
    { cells: [frame([1, 2, 1, 2])] },
    false,
  ],
  ['bond.newWay', 'a found split', { whole: 5, found: [[1, 4]] }, { parts: [1, 4] }, false],
  [
    'bond.newWay',
    'a turn-around of a found split',
    { whole: 5, found: [[1, 4]] },
    { parts: [4, 1] },
    false,
  ],
  [
    'bond.newWay',
    'not a split of the whole',
    { whole: 5, found: [[1, 4]] },
    { parts: [2, 2] },
    false,
  ],
  ['rekenrek.total', 'one bead short', { n: 7, rowRule: 'any' }, { rows: [6, 0] }, false],
  ['rekenrek.total', 'one bead over', { n: 7, rowRule: 'any' }, { rows: [5, 3] }, false],
  [
    'rekenrek.total',
    'fill-top-first: bottom beads before the top row is full',
    { n: 13, rowRule: 'fill-top-first' },
    { rows: [8, 5] },
    false,
  ],
  [
    'rekenrek.total',
    'fill-top-first: 9 + 4',
    { n: 13, rowRule: 'fill-top-first' },
    { rows: [9, 4] },
    false,
  ],
  [
    'rekenrek.total',
    'fill-top-first: 5 + 2 for 7',
    { n: 7, rowRule: 'fill-top-first' },
    { rows: [5, 2] },
    false,
  ],
  [
    'rekenrek.total',
    'the asked value is missing',
    { n: 7, rowRule: 'any', value: 7 },
    { rows: [5, 2] },
    false,
  ],
  [
    'jumps.reach',
    'overshoots',
    { start: 3, target: 6, allowedJumps: [1, 2] },
    { jumps: [2, 2] },
    false,
  ],
  [
    'jumps.reach',
    'falls short',
    { start: 3, target: 6, allowedJumps: [1, 2] },
    { jumps: [1, 1] },
    false,
  ],
  [
    'jumps.reach',
    'a jump that is not allowed',
    { start: 3, target: 6, allowedJumps: [1, 2] },
    { jumps: [3] },
    false,
  ],
  ['jumps.reach', 'no jumps', { start: 3, target: 3, allowedJumps: [1] }, { jumps: [] }, false],
  [
    'jumps.reach',
    'the wrong direction',
    { start: 13, target: 8, allowedJumps: [-1, -2, -5] },
    { jumps: [5] },
    false,
  ],
  [
    'jumps.reach',
    'the asked value is missing',
    { start: 3, target: 6, allowedJumps: [1, 2], value: 6 },
    { jumps: [2, 1] },
    false,
  ],
  [
    'jumps.reach',
    'the asked value is wrong',
    { start: 3, target: 6, allowedJumps: [1, 2], value: 6 },
    { jumps: [2, 1], value: 3 },
    false,
  ],
  ['select.exactSet', 'one missing', { values: [5, 10, 15] }, { values: [5, 10] }, false],
  ['select.exactSet', 'one extra', { values: [5, 10, 15] }, { values: [5, 10, 15, 20] }, false],
  ['select.exactSet', 'a duplicate', { values: [5, 10, 15] }, { values: [5, 10, 10, 15] }, false],
  ['select.exactSet', 'one wrong', { values: [5, 10, 15] }, { values: [5, 10, 16] }, false],
];

describe('state checkers (03 §5.7)', () => {
  it.each(CORRECT_AND_ALTERNATIVES)('%s accepts %s', (id, _name, target, value, expected) => {
    expect(checker(id).check(target, value)).toBe(expected);
  });

  it.each(NEAR_MISSES)('%s rejects a near miss: %s', (id, _name, target, value, expected) => {
    expect(checker(id).check(target, value)).toBe(expected);
  });

  const MALFORMED: [StateCheckerId, Rec, Rec[]][] = [
    ['set.count', { count: 5 }, [{}, { count: '5' }, { count: Number.NaN }, { count: null }]],
    [
      'tenframe.total',
      { n: 4 },
      [
        {},
        { cells: 'xxxx' },
        { cells: [1, 1, 1, 1] },
        { cells: [[1, 1, 1, '1']] },
        { cells: null },
      ],
    ],
    [
      'tenframe.makeTen',
      { total: 10 },
      [{}, { cells: [] }, { cells: [FULL.map(String)] }, { cells: { 0: FULL } }],
    ],
    [
      'bond.split',
      { whole: 5 },
      [
        {},
        { parts: '1,4' },
        { parts: ['1', '4'] },
        { parts: [-1, 6] },
        { parts: [1.5, 3.5] },
        { parts: [5] },
      ],
    ],
    [
      'bond.newWay',
      { whole: 5, found: [] },
      [{}, { parts: ['2', '3'] }, { parts: [-1, 6] }, { parts: [2.5, 2.5] }],
    ],
    [
      'rekenrek.total',
      { n: 7, rowRule: 'any' },
      [{}, { rows: [7] }, { rows: ['7', 0] }, { rows: [7, 0, 0] }],
    ],
    [
      'jumps.reach',
      { start: 3, target: 6, allowedJumps: [1, 2] },
      [{}, { jumps: '111' }, { jumps: [1, '2'] }, { jumps: null }],
    ],
    ['select.exactSet', { values: [5] }, [{}, { values: '5' }, { values: ['5'] }, { values: 5 }]],
  ];
  it.each(MALFORMED)('%s rejects malformed values without throwing', (id, target, values) => {
    for (const v of values) {
      expect(() => checker(id).check(target, v), JSON.stringify(v)).not.toThrow();
      expect(checker(id).check(target, v), JSON.stringify(v)).toBe(false);
    }
  });

  const GOOD_VALUES: [StateCheckerId, Rec][] = [
    ['set.count', { count: 5 }],
    ['tenframe.total', { cells: [frame([1])] }],
    ['tenframe.makeTen', { cells: [FULL] }],
    ['bond.split', { parts: [2, 3] }],
    ['bond.newWay', { parts: [2, 3] }],
    ['rekenrek.total', { rows: [5, 0] }],
    ['jumps.reach', { jumps: [1] }],
    ['select.exactSet', { values: [5] }],
  ];
  it.each(GOOD_VALUES)('%s rejects a malformed or empty target without throwing', (id, value) => {
    for (const target of [
      {},
      { count: 'x', n: 'x', total: 'x', whole: 'x', start: 'x', values: 'x' },
    ]) {
      expect(() => checker(id).check(target, value)).not.toThrow();
      expect(checker(id).check(target, value)).toBe(false);
    }
  });

  // Regression: rows must be whole bead counts 0..10; a negative count that keeps the total right
  // (−1 + 8 = 7) was accepted.
  it('rekenrek.total rejects negative rows', () => {
    expect(checker('rekenrek.total').check({ n: 7, rowRule: 'any' }, { rows: [-1, 8] })).toBe(
      false,
    );
  });

  it('registers every E01 checker under its own id', () => {
    const ids: StateCheckerId[] = [
      'set.count',
      'tenframe.total',
      'tenframe.makeTen',
      'bond.split',
      'bond.newWay',
      'rekenrek.total',
      'jumps.reach',
      'select.exactSet',
    ];
    for (const id of ids) expect(stateChecker(id)?.id).toBe(id);
    expect(stateChecker('baseten.value')).toBeUndefined();
  });
});

// ---------- near-miss exemptions (03 §9.4 step 5) ----------

/** [checker, case name, target, original, mutated, exempt] */
type ExemptCase = [StateCheckerId, string, Rec, Rec, Rec, boolean];

const EXEMPT_CASES: ExemptCase[] = [
  [
    'set.count',
    'moving a finger to the other hand',
    { count: 5 },
    { count: 5, parts: [5, 0] },
    { count: 5, parts: [4, 1] },
    true,
  ],
  [
    'set.count',
    'adding a finger',
    { count: 5 },
    { count: 5, parts: [5, 0] },
    { count: 6, parts: [5, 1] },
    false,
  ],
  [
    'set.count',
    'removing an object (no parts)',
    { count: 5 },
    { count: 5, removed: 0 },
    { count: 4, removed: 0 },
    false,
  ],
  [
    'set.count',
    'a move that leaves a negative hand',
    { count: 5 },
    { count: 5, parts: [5, 0] },
    { count: 5, parts: [6, -1] },
    false,
  ],
  [
    'bond.split',
    'moving one counter across',
    { whole: 5 },
    { parts: [2, 3] },
    { parts: [1, 4] },
    true,
  ],
  [
    'bond.split',
    'moving a ten-frame counter to the other colour',
    { whole: 5 },
    { cells: [frame([1, 1, 2, 2, 2])] },
    { cells: [frame([1, 1, 1, 2, 2])] },
    true,
  ],
  ['bond.split', 'adding a counter', { whole: 5 }, { parts: [2, 3] }, { parts: [3, 3] }, false],
  ['bond.split', 'removing a counter', { whole: 5 }, { parts: [2, 3] }, { parts: [2, 2] }, false],
  [
    'bond.split',
    'a move that produces a negative part',
    { whole: 5 },
    { parts: [0, 5] },
    { parts: [-1, 6] },
    false,
  ],
  [
    'bond.newWay',
    'moving to another new split',
    { whole: 5, found: [[0, 5]] },
    { parts: [2, 3] },
    { parts: [1, 4] },
    true,
  ],
  [
    'bond.newWay',
    'moving onto a found split',
    { whole: 5, found: [[1, 4]] },
    { parts: [2, 3] },
    { parts: [1, 4] },
    false,
  ],
  [
    'bond.newWay',
    'moving onto a turn-around of a found split',
    { whole: 5, found: [[4, 1]] },
    { parts: [2, 3] },
    { parts: [1, 4] },
    false,
  ],
  [
    'bond.newWay',
    'adding a counter',
    { whole: 5, found: [[1, 4]] },
    { parts: [2, 3] },
    { parts: [2, 4] },
    false,
  ],
  [
    'bond.newWay',
    'a move that produces a negative part',
    { whole: 5, found: [[1, 4]] },
    { parts: [0, 5] },
    { parts: [-1, 6] },
    false,
  ],
  [
    'rekenrek.total',
    'sliding a bead to the other row',
    { n: 7, rowRule: 'any' },
    { rows: [5, 2] },
    { rows: [4, 3] },
    true,
  ],
  [
    'rekenrek.total',
    'adding a bead',
    { n: 7, rowRule: 'any' },
    { rows: [5, 2] },
    { rows: [5, 3] },
    false,
  ],
  [
    'rekenrek.total',
    'a move that produces a negative row',
    { n: 7, rowRule: 'any' },
    { rows: [0, 7] },
    { rows: [-1, 8] },
    false,
  ],
  [
    'rekenrek.total',
    'a move that breaks fill-top-first',
    { n: 13, rowRule: 'fill-top-first' },
    { rows: [10, 3] },
    { rows: [9, 4] },
    false,
  ],
  [
    'rekenrek.total',
    'a move that also changes the value',
    { n: 7, rowRule: 'any', value: 7 },
    { rows: [5, 2], value: 7 },
    { rows: [4, 3], value: 8 },
    false,
  ],
];

describe('exempt predicates', () => {
  it.each(EXEMPT_CASES)('%s: %s', (id, _name, target, original, mutated, expected) => {
    expect(exempt(id)(target, original, mutated)).toBe(expected);
  });

  it('only the free-distribution checkers define one', () => {
    const withExempt: StateCheckerId[] = [
      'set.count',
      'bond.split',
      'bond.newWay',
      'rekenrek.total',
    ];
    for (const id of withExempt) expect(typeof checker(id).exempt, id).toBe('function');
    for (const id of [
      'tenframe.total',
      'tenframe.makeTen',
      'jumps.reach',
      'select.exactSet',
    ] as const) {
      expect(checker(id).exempt, id).toBeUndefined();
    }
  });

  // Regression: the exemption covers only moves the checker accepts. With nonZero, a move from
  // 1 + 4 to 0 + 5 was exempt, so the property test skipped a real near miss.
  it('bond.split: a move to a zero part is not exempt when nonZero', () => {
    expect(
      exempt('bond.split')({ whole: 5, nonZero: true }, { parts: [1, 4] }, { parts: [0, 5] }),
    ).toBe(false);
  });
});

// ---------- helpers (./types) ----------

describe('isMoveOnly', () => {
  it.each([
    ['parts moved, same total', { parts: [2, 3] }, { parts: [1, 4] }, true],
    ['parts and count kept', { count: 5, parts: [5, 0] }, { count: 5, parts: [3, 2] }, true],
    ['rows moved', { rows: [5, 2] }, { rows: [6, 1] }, true],
    ['ten-frame colours swapped', { cells: [frame([1, 2])] }, { cells: [frame([2, 1])] }, true],
    ['no parts, same count', { count: 4, removed: 0 }, { count: 4, removed: 0 }, true],
    ['total changed', { parts: [2, 3] }, { parts: [2, 4] }, false],
    ['count changed', { count: 5, parts: [5, 0] }, { count: 6, parts: [5, 1] }, false],
    ['value changed', { rows: [5, 2], value: 7 }, { rows: [4, 3], value: 8 }, false],
    ['a negative part', { parts: [0, 5] }, { parts: [-1, 6] }, false],
    ['parts appear', { count: 5 }, { count: 5, parts: [5, 0] }, false],
    ['no parts, count changed', { count: 4 }, { count: 5 }, false],
    ['no parts and no count', { values: [1] }, { values: [1] }, false],
  ] as const)('%s → %s', (_name, original, mutated, expected) => {
    expect(isMoveOnly(original, mutated)).toBe(expected);
  });
});

describe('partsOf', () => {
  it.each([
    ['explicit parts', { parts: [2, 3] }, [2, 3]],
    [
      'two ten-frames: the counters in each frame',
      {
        cells: [
          [1, 2, 0, 1],
          [2, 0, 0, 0],
        ],
      },
      [3, 1],
    ],
    ['one ten-frame: colour counts (a, b)', { cells: [[1, 2, 0, 1, 2, 2]] }, [2, 3]],
    ['ten-frame without colour b', { cells: [frame([1, 1, 1])] }, [3, 0]],
    ['rekenrek rows', { rows: [4, 3] }, [4, 3]],
    ['parts win over cells and rows', { parts: [1, 1], cells: [frame([2])], rows: [9, 9] }, [1, 1]],
    ['cells win over rows', { cells: [frame([2])], rows: [9, 9] }, [0, 1]],
    ['nothing to read', { count: 5 }, undefined],
    ['non-numeric parts are not parts', { parts: ['1', '2'] }, undefined],
  ] as const)('%s', (_name, value, expected) => {
    expect(partsOf(value)).toEqual(expected);
  });
});

describe('askedValueOk', () => {
  it.each([
    ['nothing asked, nothing entered', {}, {}, true],
    ['nothing asked, a value entered', {}, { value: 3 }, true],
    ['asked and right', { value: 7 }, { value: 7 }, true],
    ['asked and wrong', { value: 7 }, { value: 8 }, false],
    ['asked and missing', { value: 7 }, {}, false],
    ['asked, entered as a string', { value: 7 }, { value: '7' }, false],
  ] as const)('%s', (_name, target, value, expected) => {
    expect(askedValueOk(target, value)).toBe(expected);
  });
});
