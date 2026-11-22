import { describe, expect, it } from 'vitest';
import { countUpScale, LABEL_SEP_PX, LINE_PX } from './CountUpLine';

describe('countUpScale (make-change, U05 #14)', () => {
  it('draws the right count from the price mark to the paid mark, the whole line', () => {
    const s = countUpScale(65, 100, ['quarter', 'dime']);
    expect(s.x(100) - s.x(65)).toBeCloseTo(LINE_PX);
    expect(s.off(100)).toBe(false);
    // One scale: a hop is as long as its piece is worth.
    expect((s.x(90) - s.x(65)) / 25).toBeCloseTo((s.x(100) - s.x(90)) / 10);
  });

  it('never brings the paid mark within LABEL_SEP_PX of the price, whatever is given', () => {
    for (const [price, paid] of [
      [99, 100],
      [999, 1000],
      [1, 2],
      [65, 100],
      [35, 100],
      [1, 1000],
    ] as const) {
      for (const given of [
        [],
        ['penny'],
        ['dollar'],
        ['dollar', 'dollar', 'dollar'],
        Array.from({ length: 12 }, () => 'dollar' as const),
        Array.from({ length: 12 }, () => 'quarter' as const),
      ] as const) {
        const s = countUpScale(price, paid, given);
        expect(s.x(paid) - s.x(price)).toBeGreaterThanOrEqual(LABEL_SEP_PX - 1e-6);
        expect(s.x(paid) - s.x(price)).toBeLessThanOrEqual(LINE_PX + 1e-6);
      }
    }
  });

  it('marks change past the end of the line as off it, and draws it no further than the end', () => {
    const s = countUpScale(99, 100, ['dollar']);
    expect(s.off(199)).toBe(true);
    expect(s.off(100)).toBe(false);
    expect(s.x(199)).toBeCloseTo(s.x(99) + LINE_PX);
    // A modest overshoot still fits, to scale (65¢ → $1.15 with $1.00 paid).
    const t = countUpScale(65, 100, ['quarter', 'quarter']);
    expect(t.off(115)).toBe(false);
    expect((t.x(115) - t.x(65)) / 50).toBeCloseTo((t.x(100) - t.x(65)) / 35);
  });
});
