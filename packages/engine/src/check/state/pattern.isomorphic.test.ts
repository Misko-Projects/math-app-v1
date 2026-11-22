// pattern.isomorphic (03 §5.5 pattern-extend `translate`, 03 §5.7): table-driven, including the
// alternative valid end states (any one-to-one renaming of the units counts).
import { describe, expect, it } from 'vitest';
import { stateChecker } from './index';
import { isIsomorphic, patternIsomorphic } from './pattern.isomorphic';

const shell = { sprite: 'shell' };
const fish = { sprite: 'fish' };
const crab = { sprite: 'crab' };
const red = { sprite: 'circle', color: 'red' };
const blue = { sprite: 'square', color: 'blue' };
const yellow = { sprite: 'triangle', color: 'yellow' };

// A A B A A B
const source = [shell, shell, fish, shell, shell, fish];
const units = [red, blue, yellow];

const rows: [string, Record<string, unknown>, Record<string, unknown>, boolean][] = [
  ['the expected renaming', { source, units }, { tokens: [red, red, blue, red, red, blue] }, true],
  // Alternative valid end states: another one-to-one mapping.
  ['another renaming', { source, units }, { tokens: [blue, blue, red, blue, blue, red] }, true],
  [
    'the third unit',
    { source, units },
    { tokens: [yellow, yellow, red, yellow, yellow, red] },
    true,
  ],
  [
    'no units listed: any tokens',
    { source },
    { tokens: [crab, crab, fish, crab, crab, fish] },
    true,
  ],
  ['two source units merged', { source, units }, { tokens: [red, red, red, red, red, red] }, false],
  [
    'one source unit split',
    { source, units },
    { tokens: [red, blue, yellow, red, red, yellow] },
    false,
  ],
  [
    'inconsistent later repeat',
    { source, units },
    { tokens: [red, red, blue, red, red, yellow] },
    false,
  ],
  ['too short', { source, units }, { tokens: [red, red, blue, red, red] }, false],
  ['too long', { source, units }, { tokens: [red, red, blue, red, red, blue, red] }, false],
  [
    'a token outside the units',
    { source, units },
    { tokens: [crab, crab, blue, crab, crab, blue] },
    false,
  ],
  [
    'colour alone differs from a unit',
    { source, units },
    {
      tokens: [
        { sprite: 'circle', color: 'blue' },
        { sprite: 'circle', color: 'blue' },
        blue,
        { sprite: 'circle', color: 'blue' },
        { sprite: 'circle', color: 'blue' },
        blue,
      ],
    },
    false,
  ],
  ['no tokens', { source, units }, {}, false],
  ['malformed tokens', { source, units }, { tokens: [1, 2, 3, 4, 5, 6] }, false],
  ['malformed source', { source: 'AAB', units }, { tokens: [red, red, blue] }, false],
  [
    'malformed units',
    { source, units: 'abc' },
    { tokens: [red, red, blue, red, red, blue] },
    false,
  ],
  ['empty source', { source: [] }, { tokens: [] }, false],
];

describe('pattern.isomorphic', () => {
  it('is registered', () => {
    expect(stateChecker('pattern.isomorphic')).toBe(patternIsomorphic);
  });

  it.each(rows)('%s', (_name, target, value, want) => {
    expect(patternIsomorphic.check(target, value)).toBe(want);
  });

  it('number units rename too (1 2 1 2 → 5 7 5 7)', () => {
    const nums = [{ n: 1 }, { n: 2 }, { n: 1 }, { n: 2 }];
    expect(isIsomorphic(nums, [{ n: 5 }, { n: 7 }, { n: 5 }, { n: 7 }])).toBe(true);
    expect(isIsomorphic(nums, [{ n: 5 }, { n: 5 }, { n: 5 }, { n: 7 }])).toBe(false);
  });

  it('exempts a mutation that is still a valid renaming, and only that', () => {
    const target = { source: [shell, fish, shell, fish], units };
    const original = { tokens: [red, blue, red, blue] };
    expect(patternIsomorphic.exempt?.(target, original, { tokens: [blue, red, blue, red] })).toBe(
      true,
    );
    expect(patternIsomorphic.exempt?.(target, original, { tokens: [red, blue, red] })).toBe(false);
    expect(patternIsomorphic.exempt?.(target, original, { tokens: [red, red, red, blue] })).toBe(
      false,
    );
  });
});
