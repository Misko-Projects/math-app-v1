import type { AgeMode } from '../../tokens/tokens';
import { MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
import {
  ARRANGEMENTS,
  type Arrangement,
  arrangedSize,
  type EntryLayout,
  entryGroups,
  entrySize,
  overflow,
  type Size,
} from '../kit';
import { poolColumns } from './bond';

/**
 * The number-bond layout (06 §1: container-relative), pure arithmetic over the widget's room;
 * sizes match number-bond.css. The bond is the picture; the numeral answer and the actions are
 * its items. In preference order:
 * 1. everything at once (the bond's circles as large as fit, down to a full target);
 * 2. `steps`: the bond with Next, then the answer step (the numeral answer with Back and Check,
 *    and a small static bond when it fits), when the answer doesn't fit beside the bond.
 */

export const LAYOUT_GAP = 24;
/** Around the bond's circles (their shadow and focus ring). */
export const BOND_PAD = 8;
/** The bond's shape in circle diameters: parts 0.9 c apart, legs 0.5 c tall. */
export const BOND_W = 2.9;
export const BOND_H = 2.5;
/** The ways already found (new-way): small bonds of this circle, in a panel. */
export const FOUND_C = 56;
export const FOUND_PANEL = 12 + 3;
/** A pool of counters (concrete): padding + border a side; the numeral badge's size. */
export const POOL_EDGE = 12 + 3;
export const BADGE = 52;
export const POOL_LEGS = 40;
export const ACT_GAP = 24;
export const ACT_GAP_Y = 16;

export type ActDir = 'row' | 'column';

export interface BondPlan {
  steps: boolean;
  /** The bond's circle diameter (pictorial). */
  c: number;
  arrangement: Arrangement;
  /** The answer beside the bond (null: none, or it waits for the answer step). */
  entry: EntryLayout | null;
  ask: { arrangement: Arrangement; mini: boolean; entry: EntryLayout; act: ActDir } | null;
}

export interface BondInput {
  ageMode: AgeMode;
  concrete: boolean;
  /** Pools' capacities (concrete): whole, part 0, part 1. */
  caps: [number, number, number];
  /** The ways already found (new-way). */
  found: number;
  /** The largest number shown in a circle (its digits size the circle). */
  biggest: number;
  /** The answer's largest number (null: no numeral answer). */
  askMax: number | null;
  button: Size;
}

export const bondSize = (c: number): Size => ({
  w: BOND_W * c + 2 * BOND_PAD,
  h: BOND_H * c + 2 * BOND_PAD,
});

/** The smallest circle whose numeral stays ≥ 32 px (number-bond.css: 0.45 c, 0.32 c for 3 digits). */
export const minCircle = (biggest: number, ageMode: AgeMode) =>
  Math.max(MIN_TARGET_PX[ageMode], String(biggest).length >= 3 ? 100 : 72);

/** The numeral's font size in a circle of `c` px. */
export const circleFont = (c: number, biggest: number) =>
  Math.min(72, Math.round(c * (String(biggest).length >= 3 ? 0.32 : 0.45)));

export function poolSize(t: number, cap: number): Size {
  const cols = poolColumns(cap);
  const rows = Math.max(1, Math.ceil(cap / cols));
  const g = TARGET_GAP_PX;
  return {
    w: cols * t + (cols - 1) * g + 2 * POOL_EDGE,
    h: rows * t + (rows - 1) * g + 2 * POOL_EDGE,
  };
}

/** The concrete bond: the whole's pool on top, the parts' pools below, badges half outside. */
export function poolsBox(input: BondInput): { size: Size; whole: Size; part: Size } {
  const t = MIN_TARGET_PX[input.ageMode];
  const whole = poolSize(t, input.caps[0]);
  const part = poolSize(t, Math.max(input.caps[1], input.caps[2]));
  return {
    whole,
    part,
    size: {
      w: Math.max(whole.w, 2 * part.w + POOL_LEGS),
      h: whole.h + POOL_LEGS + part.h + BADGE,
    },
  };
}

/** The ways already found: small bonds side by side in a panel. */
export function foundSize(n: number): Size | null {
  if (n <= 0) return null;
  const b = bondSize(FOUND_C);
  return { w: n * b.w + (n - 1) * 8 + 2 * FOUND_PANEL, h: b.h + 2 * FOUND_PANEL };
}

const act = (button: Size, n: number, dir: ActDir): Size =>
  dir === 'row'
    ? { w: n * button.w + (n - 1) * ACT_GAP, h: button.h }
    : { w: button.w, h: n * button.h + (n - 1) * ACT_GAP_Y };

function circles(input: BondInput): number[] {
  const t = MIN_TARGET_PX[input.ageMode];
  const min = minCircle(input.biggest, input.ageMode);
  return [...new Set([1.9 * t, 1.6 * t, 1.35 * t, min].map((c) => Math.max(min, Math.round(c))))];
}

const mainSize = (input: BondInput, c: number) =>
  input.concrete ? poolsBox(input).size : bondSize(c);

export const miniC = (biggest: number) => (String(biggest).length >= 3 ? 100 : 64);

/** The layout for `room` (Infinity height: the host grows with the widget). */
export function planBond(input: BondInput, room: Size): BondPlan {
  const found = foundSize(input.found);
  let best: { plan: BondPlan; over: number } | null = null;
  const consider = (plan: BondPlan, size: Size) => {
    const over = overflow(size, room);
    if (!best || over < best.over) best = { plan, over };
    return over === 0;
  };
  // 1. Everything at once.
  for (const group of entryGroups(input.askMax)) {
    for (const c of circles(input)) {
      for (const entry of group) {
        for (const arrangement of ARRANGEMENTS) {
          const size = arrangedSize(
            arrangement,
            mainSize(input, c),
            [
              found,
              entry && input.askMax !== null ? entrySize(input.askMax, entry, input.ageMode) : null,
              act(input.button, 1, 'row'),
            ],
            LAYOUT_GAP,
          );
          if (consider({ steps: false, c, arrangement, entry, ask: null }, size)) {
            return (best as unknown as { plan: BondPlan }).plan;
          }
        }
      }
    }
  }
  if (input.askMax === null) return (best as unknown as { plan: BondPlan }).plan;
  // 2. Steps: the bond, then the answer.
  let build: { c: number; arrangement: Arrangement; over: number } | null = null;
  for (const c of circles(input)) {
    for (const arrangement of ARRANGEMENTS) {
      const over = overflow(
        arrangedSize(
          arrangement,
          mainSize(input, c),
          [found, act(input.button, 1, 'row')],
          LAYOUT_GAP,
        ),
        room,
      );
      if (!build || over < build.over) build = { c, arrangement, over };
      if (over === 0) break;
    }
    if (build?.over === 0) break;
  }
  let ask: { a: NonNullable<BondPlan['ask']>; over: number } | null = null;
  const mini = bondSize(miniC(input.biggest));
  outer: for (const group of entryGroups(input.askMax)) {
    for (const withMini of [true, false]) {
      for (const entry of group) {
        if (!entry) continue;
        for (const arrangement of ARRANGEMENTS) {
          for (const dir of ['row', 'column'] as const) {
            const size = arrangedSize(
              arrangement,
              withMini ? mini : null,
              [entrySize(input.askMax, entry, input.ageMode), act(input.button, 2, dir)],
              LAYOUT_GAP,
            );
            const over = overflow(size, room);
            if (!ask || over < ask.over)
              ask = { a: { arrangement, mini: withMini, entry, act: dir }, over };
            if (over === 0) break outer;
          }
        }
      }
    }
  }
  if (!build || !ask) return (best as unknown as { plan: BondPlan }).plan;
  const plan: BondPlan = {
    steps: true,
    c: build.c,
    arrangement: build.arrangement,
    entry: null,
    ask: ask.a,
  };
  const over = build.over + ask.over;
  const b = best as unknown as { plan: BondPlan; over: number };
  return over <= b.over ? plan : b.plan;
}
