import {
  COIN_KINDS,
  PURSE_NARROW_UNITS_MAX,
  TRAY_NARROW_PIECES_MAX,
  TRAY_PIECES_MAX,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { contrastRatio, type Lighting, litColor, type PaletteColor } from '../../tokens/tokens';
import { COIN_CENTS, COIN_CONTRAST_PAIRS, coinPx, moneyNameKey, moneyText } from './CoinArt';
import { coinsCentsOf, pictureQuarterPx } from './CoinsView';
import {
  MAX_PILE_ROWS,
  MIN_PILE_STEP_PX,
  type PileSpec,
  pileRows,
  pileSteps,
  pileWidth,
} from './moneyLayout';
import { applyBoxKey, padBoxValue } from './PadEntry';

/** An sRGB colour-mix of two lit palette colours, as the browser computes it. */
function mixHex(a: PaletteColor, pct: number, b: PaletteColor, l: Lighting): string {
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const [ha, hb] = [litColor(a, l), litColor(b, l)];
  const out = [0, 1, 2].map((i) => Math.round((ch(ha, i) * pct + ch(hb, i) * (100 - pct)) / 100));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** A money pair's ratio in the felt palette the money art is drawn in (slice 4b). */
function feltRatio(p: (typeof COIN_CONTRAST_PAIRS)[number], l: Lighting): number {
  const fg = typeof p.fg === 'string' ? litColor(p.fg, l) : mixHex(p.fg.a, p.fg.pct, p.fg.b, l);
  return contrastRatio(fg, litColor(p.bg, l));
}

describe('coin art (U05 #14)', () => {
  it('draws the coins at true relative sizes: dime < penny < nickel < quarter', () => {
    const d = (k: (typeof COIN_KINDS)[number]) => coinPx(k, 88);
    expect(d('quarter')).toBe(88);
    expect(d('dime')).toBeLessThan(d('penny'));
    expect(d('penny')).toBeLessThan(d('nickel'));
    expect(d('nickel')).toBeLessThan(d('quarter'));
    // Within 5% of the real diameters' ratios to the quarter (17.91, 19.05, 21.21, 24.26 mm).
    const real = { dime: 17.91, penny: 19.05, nickel: 21.21, quarter: 24.26 };
    for (const k of COIN_KINDS) {
      expect(Math.abs(d(k) / 88 - real[k] / real.quarter)).toBeLessThan(0.05);
    }
  });

  it('knows every coin’s value and spoken name', () => {
    expect(COIN_CENTS).toEqual({ penny: 1, nickel: 5, dime: 10, quarter: 25 });
    expect(moneyNameKey('quarter')).toBe('ui.money.quarter');
    expect(moneyNameKey('dollar')).toBe('ui.money.bill');
  });

  it('prints amounts as 03 §8.4 displays them', () => {
    expect(moneyText(0)).toBe('0¢');
    expect(moneyText(40)).toBe('40¢');
    expect(moneyText(100)).toBe('$1.00');
    expect(moneyText(135)).toBe('$1.35');
    expect(moneyText(205)).toBe('$2.05');
  });

  it('a coins picture shows exactly its coins and bills', () => {
    expect(coinsCentsOf(['quarter', 'dime', 'nickel', 'penny'])).toBe(41);
    expect(coinsCentsOf(['quarter'], [1, 5])).toBe(625);
    expect(pictureQuarterPx(3, 720, 300)).toBe(96);
    expect(pictureQuarterPx(30, 400, 200)).toBeLessThan(96);
  });

  for (const p of COIN_CONTRAST_PAIRS) {
    for (const l of ['day', 'sunset'] as const) {
      it(`${p.use} (${l}) ≥ ${p.min}:1`, () => {
        expect(feltRatio(p, l)).toBeGreaterThanOrEqual(p.min);
      });
    }
  }
});

describe('typed pad boxes', () => {
  const cents = { id: 'cents', maxDigits: 2, exactDigits: true };
  const dollars = { id: 'dollars', maxDigits: 3 };
  it('keeps leading zeros in exact boxes and counts them filled only when full', () => {
    expect(applyBoxKey('', '0', cents)).toBe('0');
    expect(applyBoxKey('0', '5', cents)).toBe('05');
    expect(applyBoxKey('05', '7', cents)).toBe('05');
    expect(padBoxValue('0', cents)).toBeNull();
    expect(padBoxValue('05', cents)).toBe(5);
    expect(applyBoxKey('05', 'back', cents)).toBe('0');
  });
  it('plain boxes drop a leading zero and ignore the decimal key', () => {
    expect(applyBoxKey('0', '7', dollars)).toBe('7');
    expect(applyBoxKey('1', '.', dollars)).toBe('1');
    expect(padBoxValue('', dollars)).toBeNull();
    expect(padBoxValue('12', dollars)).toBe(12);
  });
});

describe('tray piles (U05 #14)', () => {
  // Piece boxes at grade 1 and up: coins in 64 px boxes (K: 80), the bill 167 px wide.
  const BILL_W = 167;
  /** Every way to split `total` pieces over the five kinds (dollar first). */
  function* splits(total: number, kinds = 5): Generator<number[]> {
    if (kinds === 1) {
      yield [total];
      return;
    }
    for (let n = 0; n <= total; n++)
      for (const rest of splits(total - n, kinds - 1)) yield [n, ...rest];
  }
  const pilesOf = (counts: number[], coinW: number): PileSpec[] =>
    counts
      .map((n, i): PileSpec => ({ n, w: i === 0 ? BILL_W : coinW, bill: i === 0 }))
      .filter((p) => p.n > 0);

  it('fits every tray of up to TRAY_PIECES_MAX pieces in two rows, each piece showing', () => {
    // The narrowest trays the widgets give the piles: coin-pay at 906 × 373 (grade 1 up and K).
    for (const [avail, coinW] of [
      [417, 64],
      [417, 80],
    ] as const) {
      for (let total = 1; total <= TRAY_PIECES_MAX; total++) {
        for (const counts of splits(total)) {
          const piles = pilesOf(counts, coinW);
          const steps = pileSteps(piles, avail);
          const widths = piles.map((p, i) => pileWidth(p, steps[i] as number));
          expect(pileRows(widths, avail), JSON.stringify(counts)).toBeLessThanOrEqual(
            MAX_PILE_ROWS,
          );
          for (const [i, p] of piles.entries()) {
            if (p.n > 1) expect(steps[i]).toBeGreaterThanOrEqual(MIN_PILE_STEP_PX);
            expect(widths[i]).toBeLessThanOrEqual(avail);
          }
        }
      }
    }
  });

  /** The tray's width beside the count-up line at 906 × 373: 852 − 24 − 360 − 24 − 36. */
  const NARROW_TRAY_PX = 408;
  /** The lean of a purse stack (MoneyBoard `STACK_LIFT_PX`) and the gap between stacks. */
  const STACK_LIFT_PX = 6;

  it('fits every narrow-board purse (PURSE_NARROW_UNITS_MAX units) in one row at both target sizes', () => {
    for (const coinW of [64, 80]) {
      const billW = 167;
      const row = (bill: boolean, coins: number) =>
        (bill ? billW + STACK_LIFT_PX : 0) +
        coins * (coinW + STACK_LIFT_PX) +
        (coins + (bill ? 1 : 0) - 1) * 20;
      // Four coin kinds; the bill (2 units) and two coin kinds.
      expect(row(false, PURSE_NARROW_UNITS_MAX)).toBeLessThanOrEqual(NARROW_TRAY_PX);
      expect(row(true, PURSE_NARROW_UNITS_MAX - 2)).toBeLessThanOrEqual(NARROW_TRAY_PX);
    }
  });

  it('fits every narrow-board tray (TRAY_NARROW_PIECES_MAX pieces, PURSE_NARROW_UNITS_MAX kinds) in one row', () => {
    // The narrow boards' purses: four coin kinds, or the bill and two coin kinds. The tray is as
    // wide as it is beside the count-up line at 906 × 373 (408 px), at both target sizes.
    for (const coinW of [64, 80]) {
      const billW = coinW === 80 ? 175 : 167;
      for (let total = 1; total <= TRAY_NARROW_PIECES_MAX; total++) {
        for (const counts of splits(total)) {
          const [bills = 0, ...coins] = counts;
          const kinds = coins.filter((n) => n > 0).length + (bills > 0 ? 2 : 0);
          if (kinds > PURSE_NARROW_UNITS_MAX) continue;
          const piles = counts
            .map((n, i): PileSpec => ({ n, w: i === 0 ? billW : coinW, bill: i === 0 }))
            .filter((p) => p.n > 0);
          const steps = pileSteps(piles, NARROW_TRAY_PX, 1);
          const widths = piles.map((p, i) => pileWidth(p, steps[i] as number));
          expect(pileRows(widths, NARROW_TRAY_PX), `${coinW}: ${JSON.stringify(counts)}`).toBe(1);
          for (const [i, p] of piles.entries()) {
            if (p.n > 1) expect(steps[i]).toBeGreaterThanOrEqual(MIN_PILE_STEP_PX);
          }
        }
      }
    }
  });

  it('gives a pile all the room it wants when the tray is wide or not measured yet', () => {
    const piles: PileSpec[] = [{ n: 3, w: 64 }];
    expect(pileSteps(piles, 0)).toEqual([64 * 0.42]);
    expect(pileSteps(piles, 800)).toEqual([64 * 0.42]);
    expect(pileSteps([{ n: 1, w: 64 }], 800)).toEqual([0]);
  });
});
