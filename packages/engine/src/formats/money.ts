// Money helpers shared by the coin formats (coin-pay, coin-count, make-change) and the coins.*
// state checkers (03 §5.5, U05 #14).
//
// - A purse (`CoinPayConfig['purse']`) lists the pieces a child may use: a count each, or
//   'unlimited'. A kind the purse does not list (or lists with 0) is not available.
// - A tray is the pieces the child paid with: `{ penny, nickel, dime, quarter, dollar? }` counts.
//   This is the coin-pay and make-change response value `{ coins: tray }` (engine README).
// - The multiset key of a tray (coin-pay `new-way`, 03 §5.5) is `q<n>d<n>n<n>p<n>`, quarters
//   first, with `b<n>` in front when it holds dollar bills: `"q1d0n0p0"`, `"b1q0d2n0p0"`.

import type { CoinKind } from '@number-island/shared';

/** A piece a purse can hold: the four coins and the dollar bill (03 §5.5 coin-pay). */
export type PurseKind = CoinKind | 'dollar';

export type Purse = Partial<Record<PurseKind, number | 'unlimited'>>;

/** Counts of each piece (missing kinds are 0). */
export type Tray = Partial<Record<PurseKind, number>>;

/** Cents per piece. */
export const PIECE_CENTS: Readonly<Record<PurseKind, number>> = {
  penny: 1,
  nickel: 5,
  dime: 10,
  quarter: 25,
  dollar: 100,
};

/** The coins, smallest value first. */
export const COIN_ORDER: readonly CoinKind[] = ['penny', 'nickel', 'dime', 'quarter'];

/** Every piece, biggest value first (how a child counts a mix, MON.02). */
export const PIECES_BIG_FIRST: readonly PurseKind[] = [
  'dollar',
  'quarter',
  'dime',
  'nickel',
  'penny',
];

export const isPurseKind = (v: unknown): v is PurseKind =>
  typeof v === 'string' && Object.hasOwn(PIECE_CENTS, v);

/** Cents of a list of coins. */
export function coinsCents(coins: readonly CoinKind[]): number {
  return coins.reduce((a, c) => a + PIECE_CENTS[c], 0);
}

/** Cents of a tray. */
export function trayCents(tray: Tray): number {
  let sum = 0;
  for (const k of PIECES_BIG_FIRST) sum += (tray[k] ?? 0) * PIECE_CENTS[k];
  return sum;
}

/** Pieces in a tray. */
export function trayPieces(tray: Tray): number {
  return PIECES_BIG_FIRST.reduce((a, k) => a + (tray[k] ?? 0), 0);
}

/** How many of a kind the purse allows (Infinity for 'unlimited', 0 when not listed). */
export function purseLimit(purse: Purse, kind: PurseKind): number {
  const v = purse[kind];
  if (v === 'unlimited') return Number.POSITIVE_INFINITY;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0;
}

/** The kinds a purse makes available, biggest value first. */
export function purseKinds(purse: Purse): PurseKind[] {
  return PIECES_BIG_FIRST.filter((k) => purseLimit(purse, k) > 0);
}

/** The purse every coin kind is unlimited in (no dollar bills): the checkers' default. */
export const ALL_COINS: Purse = {
  penny: 'unlimited',
  nickel: 'unlimited',
  dime: 'unlimited',
  quarter: 'unlimited',
};

/**
 * Reads a tray from a response value: every count a whole number ≥ 0, no unknown kinds.
 * Returns undefined for anything else (a malformed response is never correct).
 */
export function readTray(v: unknown): Tray | undefined {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Tray = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (!isPurseKind(k)) return undefined;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return undefined;
    out[k] = n;
  }
  return out;
}

/** Reads a purse from a checker target (unknown kinds or bad counts → undefined). */
export function readPurse(v: unknown): Purse | undefined {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Purse = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (!isPurseKind(k)) return undefined;
    if (n === 'unlimited') out[k] = n;
    else if (typeof n === 'number' && Number.isInteger(n) && n >= 0) out[k] = n;
    else return undefined;
  }
  return out;
}

/** Whether every piece of the tray is one the purse has, within its count. */
export function trayFitsPurse(tray: Tray, purse: Purse): boolean {
  return PIECES_BIG_FIRST.every((k) => (tray[k] ?? 0) <= purseLimit(purse, k));
}

/** The multiset key of a tray (03 §5.5 coin-pay new-way): `q1d0n0p0`, `b1q0d2n0p0`. */
export function trayKey(tray: Tray): string {
  const n = (k: PurseKind) => tray[k] ?? 0;
  const coins = `q${n('quarter')}d${n('dime')}n${n('nickel')}p${n('penny')}`;
  return n('dollar') > 0 ? `b${n('dollar')}${coins}` : coins;
}

/** The tray a multiset key stands for, or null when it is not a key. */
export function parseTrayKey(key: string): Tray | null {
  const m = /^(?:b(\d+))?q(\d+)d(\d+)n(\d+)p(\d+)$/.exec(key);
  if (!m) return null;
  return {
    dollar: Number(m[1] ?? 0),
    quarter: Number(m[2]),
    dime: Number(m[3]),
    nickel: Number(m[4]),
    penny: Number(m[5]),
  };
}

/** A key in canonical form (`b0` dropped), or null when it is not a key. */
export function canonicalKey(key: string): string | null {
  const t = parseTrayKey(key);
  return t ? trayKey(t) : null;
}

/** A tray with every coin kind listed (and `dollar` when `withDollar`): the response shape. */
export function fullTray(tray: Tray, withDollar: boolean): Tray {
  const out: Tray = {
    penny: tray.penny ?? 0,
    nickel: tray.nickel ?? 0,
    dime: tray.dime ?? 0,
    quarter: tray.quarter ?? 0,
  };
  if (withDollar) out.dollar = tray.dollar ?? 0;
  return out;
}

/**
 * The fewest pieces the purse can pay `cents` with, or null when it cannot pay it exactly.
 * Bounded by the purse's counts (a bounded change-making table, so 30¢ from one quarter, three
 * dimes and no nickels is three dimes, not a quarter and a nickel).
 */
export function fewestPieces(cents: number, purse: Purse): number | null {
  if (!Number.isInteger(cents) || cents < 0) return null;
  const INF = Number.POSITIVE_INFINITY;
  let best: number[] = new Array<number>(cents + 1).fill(INF);
  best[0] = 0;
  for (const k of purseKinds(purse)) {
    const v = PIECE_CENTS[k];
    const limit = Math.min(purseLimit(purse, k), Math.floor(cents / v));
    const next = [...best];
    // Bounded knapsack, one kind at a time: use 1 … limit of this piece.
    for (let total = 0; total <= cents; total += 1) {
      for (let n = 1; n <= limit && n * v <= total; n += 1) {
        const before = best[total - n * v] as number;
        if (before + n < (next[total] as number)) next[total] = before + n;
      }
    }
    best = next;
  }
  const r = best[cents] as number;
  return r === INF ? null : r;
}

/** Whether the purse can pay `cents` exactly. */
export const canPay = (cents: number, purse: Purse): boolean => fewestPieces(cents, purse) !== null;

/**
 * Every tray from the purse worth exactly `cents` (biggest pieces decided first), up to `max`
 * trays, never one of more than `maxPieces` pieces (so a small tray's ways are all listed, however
 * many the purse has). Used to check that a new-way item still has a way that is not found yet.
 */
export function waysToPay(
  cents: number,
  purse: Purse,
  max = 5000,
  maxPieces = Number.POSITIVE_INFINITY,
): Tray[] {
  const kinds = purseKinds(purse);
  const out: Tray[] = [];
  const walk = (i: number, left: number, tray: Tray, pieces = 0) => {
    if (out.length >= max) return;
    if (left === 0) {
      out.push({ ...tray });
      return;
    }
    const k = kinds[i];
    if (k === undefined) return;
    const v = PIECE_CENTS[k];
    const most = Math.min(purseLimit(purse, k), Math.floor(left / v), maxPieces - pieces);
    for (let n = most; n >= 0; n -= 1) {
      tray[k] = n;
      walk(i + 1, left - n * v, tray, pieces + n);
    }
    delete tray[k];
  };
  if (Number.isInteger(cents) && cents > 0) walk(0, cents, {});
  return out;
}
