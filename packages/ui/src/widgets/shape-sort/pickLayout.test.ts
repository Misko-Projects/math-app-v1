// The shape-sort layouts are sized against the widget's own width cap, so the cards and Check
// stay together in any area (review round 2). The layout functions apply the cap themselves:
// these tests hand them the area's real width, as the widget does (review round 3).
import { describe, expect, it } from 'vitest';
import { pickLayout, SORT_MAX_WIDTH, sortSizes } from './ShapeSortWidget';

describe('sortSizes', () => {
  it('bins never add up to more than the capped width, however wide the area', () => {
    for (const width of [852, 1226, 1600, 2400]) {
      const s = sortSizes({
        width,
        height: 340,
        compact: true,
        kMode: true,
        minT: 80,
        tray: 0,
        bins: [9, 0, 0],
      });
      const total = s.binWidths.reduce((n, w) => n + w, 0) + 2 * 12;
      expect(total, `${width}`).toBeLessThanOrEqual(Math.min(width, SORT_MAX_WIDTH));
    }
  });
});

describe('pickLayout', () => {
  const fits = (width: number, height: number, cards: number, kMode: boolean) => {
    const minT = kMode ? 80 : 64;
    const l = pickLayout({ width, height, cards, kMode, minT });
    const checkW = kMode ? 120 : 210;
    const rows = Math.ceil(cards / l.perRow);
    const outer = l.size + 16;
    return {
      l,
      // The card block, the 40 px gap, Check and the root's padding fit the capped width.
      wide: l.width + 40 + checkW + 24 <= Math.min(width, SORT_MAX_WIDTH),
      tall: rows * outer + (rows - 1) * 24 + 32 + 16 <= height,
      target: outer >= minT,
    };
  };

  it('six K cards in a 1600 × 340 area fit beside Check (the widget is capped at 1180)', () => {
    const r = fits(1600, 340, 6, true);
    expect(r).toMatchObject({ wide: true, tall: true, target: true });
    expect(r.l.perRow).toBe(6);
  });

  it('fits every supported count at the tablet, smallest and a very wide area, both sizes', () => {
    for (const [w, h] of [
      [1226, 493],
      [906 - 54, 319],
      [1600, 340],
      [2400, 900],
    ] as const) {
      for (const kMode of [true, false]) {
        for (let cards = 2; cards <= 7; cards += 1) {
          expect(fits(w, h, cards, kMode), `${w}x${h} ${cards} ${kMode}`).toMatchObject({
            wide: true,
            tall: true,
            target: true,
          });
        }
      }
    }
  });
});
