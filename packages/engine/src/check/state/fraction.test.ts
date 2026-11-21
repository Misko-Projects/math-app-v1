// K01 fraction state checkers (03 §5.7): fraction.cut and fraction.partition accept every valid end
// state (any shaded part, marks in any order, a mark on a whole), reject near misses, and reject
// malformed values without throwing.

import { describe, expect, it } from 'vitest';
import { FRACTION_AREA_TOLERANCE, fractionCut } from './fraction.cut';
import { fractionPartition, partitionPoints } from './fraction.partition';

type Rec = Record<string, unknown>;

const CUT: [string, Rec, Rec, boolean][] = [
  [
    'fourths, the first shaded',
    { parts: 4, shade: 1 },
    { regions: [0.25, 0.25, 0.25, 0.25], shaded: [0] },
    true,
  ],
  [
    'alternative: the third part shaded',
    { parts: 4, shade: 1 },
    { regions: [0.25, 0.25, 0.25, 0.25], shaded: [2] },
    true,
  ],
  [
    'alternative: a hand cut within 3%',
    { parts: 2, shade: 1 },
    { regions: [0.52, 0.48], shaded: [1] },
    true,
  ],
  [
    'no shading asked',
    { parts: 3, shade: 0 },
    { regions: [1 / 3, 1 / 3, 1 / 3], shaded: [] },
    true,
  ],
  ['shaded omitted when none is asked', { parts: 2 }, { regions: [0.5, 0.5] }, true],
  ['parts not the same size', { parts: 2, shade: 1 }, { regions: [0.6, 0.4], shaded: [0] }, false],
  ['too few parts', { parts: 4, shade: 1 }, { regions: [0.5, 0.5], shaded: [0] }, false],
  [
    'too many shaded',
    { parts: 4, shade: 1 },
    { regions: [0.25, 0.25, 0.25, 0.25], shaded: [0, 1] },
    false,
  ],
  [
    'nothing shaded',
    { parts: 4, shade: 1 },
    { regions: [0.25, 0.25, 0.25, 0.25], shaded: [] },
    false,
  ],
  [
    'one part shaded twice',
    { parts: 4, shade: 2 },
    { regions: [0.25, 0.25, 0.25, 0.25], shaded: [1, 1] },
    false,
  ],
  [
    'shaded index off the shape',
    { parts: 2, shade: 1 },
    { regions: [0.5, 0.5], shaded: [2] },
    false,
  ],
  [
    'regions do not make the whole',
    { parts: 2, shade: 0 },
    { regions: [0.5, 0.4], shaded: [] },
    false,
  ],
  ['malformed regions', { parts: 2, shade: 0 }, { regions: 'half' }, false],
  [
    'thenName asks for the name',
    { parts: 4, shade: 3, thenName: true },
    { regions: [0.25, 0.25, 0.25, 0.25], shaded: [0, 1, 2], name: [3, 4] },
    true,
  ],
  [
    'thenName with the parts swapped',
    { parts: 4, shade: 3, thenName: true },
    { regions: [0.25, 0.25, 0.25, 0.25], shaded: [0, 1, 2], name: [3, 1] },
    false,
  ],
];

const PARTITION: [string, Rec, Rec, boolean][] = [
  ['halves', { denominator: 2, max: 1 }, { cuts: [0.5] }, true],
  [
    'alternative: fourths marked in any order',
    { denominator: 4, max: 1 },
    { cuts: [0.75, 0.25, 0.5] },
    true,
  ],
  [
    'alternative: within 2% of the unit',
    { denominator: 4, max: 1 },
    { cuts: [0.26, 0.49, 0.76] },
    true,
  ],
  [
    'alternative: a mark on a whole is ignored',
    { denominator: 2, max: 2 },
    { cuts: [0.5, 1, 1.5] },
    true,
  ],
  ['two wholes in halves', { denominator: 2, max: 2 }, { cuts: [0.5, 1.5] }, true],
  [
    'alternative: a mark within 2% of a whole inside the strip is ignored',
    { denominator: 2, max: 2 },
    { cuts: [0.5, 1.01, 1.5] },
    true,
  ],
  // The ends of the strip absorb no mark: a mark next to an end cuts off a sliver, one part too
  // many (PR #84 review, s_d74b2eb5991e).
  ['an extra mark next to the start', { denominator: 2, max: 1 }, { cuts: [0.01, 0.5] }, false],
  ['an extra mark next to the end', { denominator: 2, max: 1 }, { cuts: [0.5, 0.99] }, false],
  [
    'an extra mark next to the end of two wholes',
    { denominator: 2, max: 2 },
    { cuts: [0.5, 1.5, 1.99] },
    false,
  ],
  ['a mark missing', { denominator: 4, max: 1 }, { cuts: [0.25, 0.5] }, false],
  ['marks not evenly spaced', { denominator: 4, max: 1 }, { cuts: [0.3, 0.5, 0.75] }, false],
  ['an extra mark', { denominator: 2, max: 1 }, { cuts: [0.5, 0.25] }, false],
  ['a mark off the strip', { denominator: 2, max: 1 }, { cuts: [0.5, 1.2] }, false],
  ['malformed cuts', { denominator: 2, max: 1 }, { cuts: [null] }, false],
];

describe('fraction.cut (03 §5.5 fraction-cut)', () => {
  for (const [name, target, value, want] of CUT) {
    it(name, () => expect(fractionCut.check(target, value)).toBe(want));
  }
  it('uses 3% of the whole as the area tolerance', () => {
    expect(FRACTION_AREA_TOLERANCE).toBe(0.03);
    expect(fractionCut.check({ parts: 2, shade: 0 }, { regions: [0.54, 0.46], shaded: [] })).toBe(
      false,
    );
  });
  it('exempts shading another part, not shading more', () => {
    const target = { parts: 4, shade: 1 };
    const original = { regions: [0.25, 0.25, 0.25, 0.25], shaded: [0] };
    expect(fractionCut.exempt?.(target, original, { ...original, shaded: [3] })).toBe(true);
    expect(fractionCut.exempt?.(target, original, { ...original, shaded: [0, 3] })).toBe(false);
    expect(
      fractionCut.exempt?.(target, original, { regions: [0.35, 0.15, 0.25, 0.25], shaded: [0] }),
    ).toBe(false);
  });
});

describe('fraction.partition (03 §5.5 fraction-line partition)', () => {
  for (const [name, target, value, want] of PARTITION) {
    it(name, () => expect(fractionPartition.check(target, value)).toBe(want));
  }
  it('lists the marks a partition needs, without the wholes', () => {
    expect(partitionPoints(4, 1)).toEqual([0.25, 0.5, 0.75]);
    expect(partitionPoints(2, 2)).toEqual([0.5, 1.5]);
  });
});
