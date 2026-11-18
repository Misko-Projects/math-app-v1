// units.iterate (03 §5.5 measure-length iterate, §5.7): any layout of `length` units laid end to
// end from the start, each within the gap tolerance, plus the typed count. Table-driven, with
// alternative valid end states (order of laying, small drift) and near misses.

import { describe, expect, it } from 'vitest';
import { stateChecker } from './index';
import { unitStarts, unitsIterate, worstSpacing } from './units.iterate';

type Rec = Record<string, unknown>;

const T5 = { length: 5, gapTolerance: 0.1 };

/** [case, target, value, expected] */
const CASES: [string, Rec, Rec, boolean][] = [
  ['exact layout', T5, { units: [0, 1, 2, 3, 4], value: 5 }, true],
  ['alternative: laid in another order', T5, { units: [3, 0, 4, 1, 2], value: 5 }, true],
  [
    'alternative: small drift within the tolerance',
    T5,
    { units: [0.05, 1.1, 2.15, 3.1, 4.05], value: 5 },
    true,
  ],
  [
    'default tolerance when the target has none',
    { length: 3 },
    { units: [0, 1.08, 2], value: 3 },
    true,
  ],
  ['one-unit object', { length: 1, gapTolerance: 0.1 }, { units: [0], value: 1 }, true],
  ['gap between two units', T5, { units: [0, 1, 2.5, 3.5, 4.5], value: 5 }, false],
  ['overlap', T5, { units: [0, 0.6, 1.6, 2.6, 3.6], value: 5 }, false],
  ['gap before the first unit', T5, { units: [0.5, 1.5, 2.5, 3.5, 4.5], value: 5 }, false],
  ['one unit too few', T5, { units: [0, 1, 2, 3], value: 5 }, false],
  ['one unit too many', T5, { units: [0, 1, 2, 3, 4, 5], value: 5 }, false],
  ['typed count one more', T5, { units: [0, 1, 2, 3, 4], value: 6 }, false],
  ['typed count one less', T5, { units: [0, 1, 2, 3, 4], value: 4 }, false],
  ['no typed count', T5, { units: [0, 1, 2, 3, 4] }, false],
  ['malformed units', T5, { units: ['0', 1, 2, 3, 4], value: 5 }, false],
  ['no units', T5, { value: 5 }, false],
  ['malformed target', { length: 'five' }, { units: [0, 1, 2, 3, 4], value: 5 }, false],
];

describe('units.iterate', () => {
  it('is registered under its id', () => {
    expect(stateChecker('units.iterate')).toBe(unitsIterate);
    expect(unitsIterate.id).toBe('units.iterate');
  });

  it.each(CASES)('%s', (_name, target, value, expected) => {
    expect(unitsIterate.check(target, value)).toBe(expected);
  });

  it('declares no near-miss exemption (a changed count is never valid)', () => {
    expect(unitsIterate.exempt).toBeUndefined();
  });

  it('reports the worst gap (positive) or overlap (negative)', () => {
    expect(worstSpacing([0, 1, 2])).toBe(0);
    expect(worstSpacing([0, 1.5, 2.5])).toBeCloseTo(0.5);
    expect(worstSpacing([0, 0.7, 1.7])).toBeCloseTo(-0.3);
    expect(worstSpacing([0.4, 1.4])).toBeCloseTo(0.4);
    expect(unitStarts({ units: [2, 0, 1] })).toEqual([0, 1, 2]);
    expect(unitStarts({ units: 'x' })).toBeUndefined();
  });
});
