import { COIN_KINDS } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { pairRatio } from '../../art/core/contrast';
import { COIN_CENTS, COIN_CONTRAST_PAIRS, coinPx, moneyNameKey, moneyText } from './CoinArt';
import { coinsCentsOf, pictureQuarterPx } from './CoinsView';
import { applyBoxKey, padBoxValue } from './PadEntry';

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
        expect(pairRatio(p, l)).toBeGreaterThanOrEqual(p.min);
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
