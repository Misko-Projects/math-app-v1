// rect.perimeterArea (03 §5.5 perimeter-walk design, MEA.14): table tests, with alternative valid
// end states (any rectangle meeting the constraints, in either orientation).
import { describe, expect, it } from 'vitest';
import { stateChecker } from './index';
import { rectPerimeterArea, sameRect } from './rect.perimeterArea';

const T = (target: Record<string, unknown>, value: Record<string, unknown>) =>
  rectPerimeterArea.check(target, value);

describe('rect.perimeterArea', () => {
  it('is registered', () => {
    expect(stateChecker('rect.perimeterArea')).toBe(rectPerimeterArea);
  });

  it.each([
    // [target, response, correct]
    [{ perimeter: 12 }, { w: 4, h: 2 }, true],
    [{ perimeter: 12 }, { w: 5, h: 1 }, true], // another rectangle with perimeter 12
    [{ perimeter: 12 }, { w: 3, h: 3 }, true], // a square is a rectangle
    [{ perimeter: 12 }, { w: 4, h: 3 }, false],
    [{ area: 12 }, { w: 3, h: 4 }, true],
    [{ area: 12 }, { w: 12, h: 1 }, true],
    [{ area: 12 }, { w: 5, h: 2 }, false],
    [{ perimeter: 16, area: 15 }, { w: 5, h: 3 }, true],
    [{ perimeter: 16, area: 15 }, { w: 3, h: 5 }, true], // turned
    [{ perimeter: 16, area: 15 }, { w: 6, h: 2 }, false], // right perimeter, wrong area
    // Same area, different perimeter than a 6 × 2.
    [{ area: 12, differentFrom: { w: 6, h: 2 } }, { w: 4, h: 3 }, true],
    [{ area: 12, differentFrom: { w: 6, h: 2 } }, { w: 6, h: 2 }, false],
    [{ area: 12, differentFrom: { w: 6, h: 2 } }, { w: 2, h: 6 }, false], // the same one turned
    // Same perimeter, different area than a 4 × 2.
    [{ perimeter: 12, differentFrom: { w: 4, h: 2 } }, { w: 5, h: 1 }, true],
    [{ perimeter: 12, differentFrom: { w: 4, h: 2 } }, { w: 2, h: 4 }, false],
  ])('%j with %j → %s', (target, value, want) => {
    expect(T(target, value)).toBe(want);
  });

  it.each([
    [{}, { w: 4, h: 2 }], // no constraint
    [{ perimeter: 12 }, { w: 4.5, h: 1.5 }], // not whole grid units
    [{ perimeter: 12 }, { w: 6, h: 0 }],
    [{ perimeter: 12 }, { w: '4', h: 2 }],
    [{ perimeter: 12 }, { sides: [4, 2] }],
    [
      { area: 12, differentFrom: 'x' },
      { w: 4, h: 3 },
    ],
  ])('rejects malformed %j / %j', (target, value) => {
    expect(T(target, value as Record<string, unknown>)).toBe(false);
  });

  it('exempts a turned rectangle (it is the same answer)', () => {
    const target = { perimeter: 12 };
    expect(rectPerimeterArea.exempt?.(target, { w: 4, h: 2 }, { w: 2, h: 4 })).toBe(true);
    expect(rectPerimeterArea.exempt?.(target, { w: 4, h: 2 }, { w: 5, h: 2 })).toBe(false);
    expect(sameRect({ w: 1, h: 2 }, { w: 2, h: 1 })).toBe(true);
  });
});
