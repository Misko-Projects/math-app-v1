// baseten.value and baseten.exact (03 §5.5 base-ten-build, §5.7): the K01 place-value cases
// (teens, a hundred broken into tens) on U04's checkers and response shape. The U04 table
// (state-u04.test.ts) covers the general cases.

import { describe, expect, it } from 'vitest';
import { basetenExact } from './baseten.exact';
import { basetenValue } from './baseten.value';

type Rec = Record<string, unknown>;

const mat = (hundreds: number, tens: number, ones: number, thousands = 0): Rec => ({
  thousands,
  hundreds,
  tens,
  ones,
});

/** [case, target, value, expected] */
const VALUE_CASES: [string, Rec, Rec, boolean][] = [
  ['305 with a hundred broken into tens', { value: 305 }, mat(2, 10, 5), true],
  ['the teen reversal 41 for 14', { value: 14 }, mat(0, 4, 1), false],
  ['an empty mat', { value: 14 }, mat(0, 0, 0), false],
  ['malformed: a string count', { value: 34 }, { hundreds: 0, tens: '3', ones: 4 }, false],
  ['malformed target', { value: 'x' }, mat(0, 3, 4), false],
];

const EXACT_CASES: [string, Rec, Rec, boolean][] = [
  ['14 as one ten and 4 ones', { value: 14, exact: { tens: 1, ones: 4 } }, mat(0, 1, 4), true],
  ['14 as loose ones', { value: 14, exact: { tens: 1, ones: 4 } }, mat(0, 0, 14), false],
  ['the teen reversal', { value: 14, exact: { tens: 1, ones: 4 } }, mat(0, 4, 1), false],
  ['malformed target', { value: 14, exact: 'x' }, mat(0, 1, 4), false],
];

describe('baseten.value (K01 cases)', () => {
  it.each(VALUE_CASES)('%s', (_name, target, value, expected) => {
    expect(basetenValue.check(target, value)).toBe(expected);
  });
});

describe('baseten.exact (K01 cases)', () => {
  it.each(EXACT_CASES)('%s', (_name, target, value, expected) => {
    expect(basetenExact.check(target, value)).toBe(expected);
  });
});
