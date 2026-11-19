// baseten.value and baseten.exact (03 §5.5 base-ten-build, §5.7): table tests with alternative
// valid end states, near misses, malformed values, and baseten.value's trade exemption.

import { describe, expect, it } from 'vitest';
import { basetenExact } from './baseten.exact';
import { basetenValue, piecesOf, piecesValue } from './baseten.value';
import { stateChecker } from './index';

type Rec = Record<string, unknown>;

/** [case, target, value, expected] */
const VALUE_CASES: [string, Rec, Rec, boolean][] = [
  ['34 as 3 tens 4 ones', { value: 34 }, { tens: 3, ones: 4 }, true],
  ['alternative: 34 as 2 tens 14 ones', { value: 34 }, { tens: 2, ones: 14 }, true],
  ['alternative: 34 as 34 ones', { value: 34 }, { ones: 34 }, true],
  ['alternative: explicit zero hundreds', { value: 34 }, { hundreds: 0, tens: 3, ones: 4 }, true],
  ['305 with a hundred broken into tens', { value: 305 }, { hundreds: 2, tens: 10, ones: 5 }, true],
  ['1,204 with thousands', { value: 1204 }, { thousands: 1, hundreds: 2, ones: 4 }, true],
  ['near miss: one ten too many', { value: 34 }, { tens: 4, ones: 4 }, false],
  ['near miss: one one too few', { value: 34 }, { tens: 3, ones: 3 }, false],
  ['the teen reversal 41 for 14', { value: 14 }, { tens: 4, ones: 1 }, false],
  ['empty mat', { value: 14 }, {}, false],
  [
    'limits: the trade the mat forces',
    { value: 34, limits: { tens: 2 } },
    { tens: 2, ones: 14 },
    true,
  ],
  [
    'limits: more tens than offered',
    { value: 34, limits: { tens: 2 } },
    { tens: 3, ones: 4 },
    false,
  ],
  ['malformed: negative ones', { value: 34 }, { tens: 4, ones: -6 }, false],
  ['malformed: fractional pieces', { value: 34 }, { tens: 3.4 }, false],
  ['malformed: a string count', { value: 34 }, { tens: '3', ones: 4 }, false],
  ['malformed target', { value: 'x' }, { tens: 3, ones: 4 }, false],
];

const EXACT_CASES: [string, Rec, Rec, boolean][] = [
  [
    '14 as one ten and 4 ones',
    { exact: { tens: 1, ones: 4 }, value: 14 },
    { tens: 1, ones: 4 },
    true,
  ],
  [
    'alternative: explicit zero hundreds',
    { exact: { tens: 1, ones: 4 }, value: 14 },
    { hundreds: 0, tens: 1, ones: 4 },
    true,
  ],
  [
    '34 with exactly 2 tens',
    { exact: { tens: 2, ones: 14 }, value: 34 },
    { tens: 2, ones: 14 },
    true,
  ],
  [
    'the canonical build is not the asked one',
    { exact: { tens: 2, ones: 14 }, value: 34 },
    { tens: 3, ones: 4 },
    false,
  ],
  ['14 as loose ones', { exact: { tens: 1, ones: 4 }, value: 14 }, { ones: 14 }, false],
  [
    'a kind the target does not name must be 0',
    { exact: { tens: 1, ones: 4 } },
    { hundreds: 1, tens: 1, ones: 4 },
    false,
  ],
  ['the teen reversal', { exact: { tens: 1, ones: 4 }, value: 14 }, { tens: 4, ones: 1 }, false],
  ['malformed target', { exact: 'x' }, { tens: 1, ones: 4 }, false],
  ['malformed value', { exact: { tens: 1, ones: 4 } }, { tens: -1, ones: 4 }, false],
];

describe('baseten.value', () => {
  it('is registered', () => expect(stateChecker('baseten.value')).toBe(basetenValue));
  it.each(VALUE_CASES)('%s', (_name, target, value, expected) => {
    expect(basetenValue.check(target, value)).toBe(expected);
  });

  it.each<[string, Rec, Rec, Rec, boolean]>([
    ['a trade keeps the value', { value: 34 }, { tens: 3, ones: 4 }, { tens: 2, ones: 14 }, true],
    [
      'fusing ten ones back keeps the value',
      { value: 34 },
      { tens: 2, ones: 14 },
      { tens: 3, ones: 4 },
      true,
    ],
    [
      'adding a piece is a near miss',
      { value: 34 },
      { tens: 3, ones: 4 },
      { tens: 3, ones: 5 },
      false,
    ],
    [
      'a trade the limits forbid is a near miss',
      { value: 34, limits: { tens: 2 } },
      { tens: 2, ones: 14 },
      { tens: 3, ones: 4 },
      false,
    ],
  ])('exempt: %s', (_name, target, original, mutated, expected) => {
    expect(basetenValue.exempt?.(target, original, mutated)).toBe(expected);
  });
});

describe('baseten.exact', () => {
  it('is registered and has no exemption (a trade changes the counts)', () => {
    expect(stateChecker('baseten.exact')).toBe(basetenExact);
    expect(basetenExact.exempt).toBeUndefined();
  });
  it.each(EXACT_CASES)('%s', (_name, target, value, expected) => {
    expect(basetenExact.check(target, value)).toBe(expected);
  });
});

describe('piecesOf / piecesValue', () => {
  it('reads missing kinds as 0 and values the pieces', () => {
    const p = piecesOf({ tens: 2, ones: 14 });
    expect(p).toEqual({ thousands: 0, hundreds: 0, tens: 2, ones: 14 });
    expect(piecesValue(p as NonNullable<typeof p>)).toBe(34);
  });
  it('rejects counts that are not whole and non-negative', () => {
    expect(piecesOf({ tens: -1 })).toBeUndefined();
    expect(piecesOf({ ones: 0.5 })).toBeUndefined();
  });
});
