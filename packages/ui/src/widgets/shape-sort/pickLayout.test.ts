// The find-all / odd-one-out card layout is sized against the widget's own width cap, so the
// cards and Check stay on one line group in any area (review round 2).
import { describe, expect, it } from 'vitest';
import { pickLayout, SORT_MAX_WIDTH } from './ShapeSortWidget';

describe('pickLayout', () => {
  const fits = (width: number, height: number, cards: number, kMode: boolean) => {
    const minT = kMode ? 80 : 64;
    const l = pickLayout({ width: Math.min(width, SORT_MAX_WIDTH), height, cards, kMode, minT });
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
