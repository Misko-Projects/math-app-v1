import { describe, expect, it } from 'vitest';
import { isRoomy, ROOMY_HEIGHT_PX, ROOMY_WIDTH_PX } from './roomy';

describe('isRoomy (U05 #14)', () => {
  it('is the tablet area and up: wide enough on a tall enough screen', () => {
    // 1280 × 800: the area's content box is 1172 px wide.
    expect(isRoomy(1172, 800)).toBe(true);
    expect(isRoomy(ROOMY_WIDTH_PX, ROOMY_HEIGHT_PX)).toBe(true);
  });

  it('is never the smallest landscape area, nor a wide but short screen', () => {
    // 960 × 600: the area's content box is 852 px wide.
    expect(isRoomy(852, 600)).toBe(false);
    // The 906 px area shown inside a tablet-sized window (a story) is still not roomy.
    expect(isRoomy(852, 800)).toBe(false);
    expect(isRoomy(1318, 600)).toBe(false);
    expect(isRoomy(ROOMY_WIDTH_PX - 1, 900)).toBe(false);
    expect(isRoomy(1400, ROOMY_HEIGHT_PX - 1)).toBe(false);
  });
});
