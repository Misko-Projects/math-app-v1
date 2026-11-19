// coins.total `{ cents, purse?, found? }` (03 §5.5 coin-pay, make-change): any coins totalling
// `cents`. Response `{ coins: { penny, nickel, dime, quarter, dollar? } }`, the counts in the tray
// (U05 convention, engine README); a dollar bill is 100¢.
// - `purse` (optional): the pieces must come from it, within its counts.
// - `found` (coin-pay `new-way`, PUZ.09): multiset keys (`"q1d0n0p0"`, `formats/money.ts`) of the
//   ways already found; the tray's own key must not be one of them.
import {
  canonicalKey,
  type Purse,
  readPurse,
  readTray,
  type Tray,
  trayCents,
  trayFitsPurse,
  trayKey,
} from '../../formats/money';
import { num, type StateChecker } from './types';

/**
 * The tray a response pays with, when it is worth `target.cents`, fits the target's purse and is
 * not a way already found. Shared by coins.total and coins.fewest.
 */
export function paidTray(
  target: Readonly<Record<string, unknown>>,
  value: Readonly<Record<string, unknown>>,
): { tray: Tray; purse: Purse | undefined; cents: number } | null {
  const cents = num(target.cents);
  if (cents === undefined || !Number.isInteger(cents) || cents <= 0) return null;
  const tray = readTray(value.coins);
  if (!tray || trayCents(tray) !== cents) return null;
  let purse: Purse | undefined;
  if (target.purse !== undefined) {
    purse = readPurse(target.purse);
    if (!purse || !trayFitsPurse(tray, purse)) return null;
  }
  if (Array.isArray(target.found)) {
    const found = new Set(
      target.found.flatMap((k) => {
        const c = typeof k === 'string' ? canonicalKey(k) : null;
        return c ? [c] : [];
      }),
    );
    if (found.has(trayKey(tray))) return null;
  }
  return { tray, purse, cents };
}

export const coinsTotal: StateChecker = {
  id: 'coins.total',
  check: (target, value) => paidTray(target, value) !== null,
  // No exemption: one coin more or less always changes the total.
};
