import type { CoinKind } from '@number-island/shared';
import type { CSSProperties } from 'react';
import { pictureProps } from './a11y';
import { BillArt, COIN_CENTS, CoinArt } from './CoinArt';
import './money.css';

/**
 * A `coins` stimulus (03 §5.1 `{ kind: 'coins', coins, bills? }`): dollar bills first, then the
 * coins in the order given, every coin drawn to one scale (U05 #14). Static: one picture with the
 * generic "look at the picture" name, never the amount. `coinsCentsOf` is the amount the picture
 * shows (stories assert the two agree).
 */

export interface CoinsViewProps {
  coins: readonly CoinKind[];
  /** Dollar bills, in dollars. */
  bills?: readonly number[];
  label?: string;
  /** Box the picture fits in, in CSS px. */
  maxWidth?: number;
  maxHeight?: number;
}

/** The money a coins picture shows, in cents. */
export function coinsCentsOf(coins: readonly CoinKind[], bills: readonly number[] = []): number {
  return coins.reduce((a, c) => a + COIN_CENTS[c], 0) + bills.reduce((a, b) => a + 100 * b, 0);
}

/** The quarter's diameter for a picture of `n` pieces in a box (coins shrink as they crowd). */
export function pictureQuarterPx(n: number, maxWidth: number, maxHeight: number): number {
  const gap = 12;
  for (const q of [96, 84, 72, 60, 52]) {
    const perRow = Math.max(1, Math.floor((maxWidth - 56 + gap) / (q + 8 + gap)));
    const rows = Math.ceil(n / perRow);
    if (rows * (q + 12) + (rows - 1) * gap <= maxHeight - 40) return q;
  }
  return 44;
}

export function CoinsView({
  coins,
  bills = [],
  label,
  maxWidth = 720,
  maxHeight = 300,
}: CoinsViewProps) {
  const quarterPx = pictureQuarterPx(coins.length + bills.length * 2, maxWidth, maxHeight);
  const billH = Math.max(74, Math.round(quarterPx * 0.86));
  return (
    <div
      className="ni-coins"
      {...pictureProps(label)}
      data-cents={coinsCentsOf(coins, bills)}
      style={{ '--ni-coin-q': `${quarterPx}px` } as CSSProperties}
    >
      {bills.map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: bills are positional
        <BillArt key={`b${i}`} dollars={b} height={billH} />
      ))}
      {coins.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: coins are positional
        <CoinArt key={`c${i}`} kind={c} quarterPx={quarterPx} />
      ))}
    </div>
  );
}
