import type { AgeMode } from '../../tokens/tokens';
import { MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
import {
  ARRANGEMENTS,
  type Arrangement,
  ASK_ARRANGEMENTS,
  arrangedSize,
  type Candidate,
  type EntryLayout,
  entryGroups,
  entrySize,
  pickByFill,
  type Size,
  withInviteRoom,
  zoomed,
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
/** Wider bonds (longer legs) to try where the area is wide: the parts further apart. */
export const BOND_SPREADS = [2.9, 3.6, 4.4] as const;
export const BOND_H = 2.5;
/** The ways already found (new-way): small bonds of this circle, in a panel. */
export const FOUND_C = 56;
export const FOUND_PANEL = 12 + 3;
/** A pool of counters (concrete): padding (8) + border (3) a side; a shown number's badge. */
export const POOL_EDGE = 8 + 3;
export const BADGE = 52;
/** The legs' band between the whole's pool and the parts' pools, and between the two parts. */
export const POOL_LEGS = 40;
export const PART_GAP = 24;
export const ACT_GAP = 24;
export const ACT_GAP_Y = 16;

export type ActDir = 'row' | 'column';

export interface BondPlan {
  steps: boolean;
  /** The bond's circle diameter (pictorial) and its width in diameters. */
  c: number;
  spread: number;
  arrangement: Arrangement;
  /** The answer beside the bond (null: none, or it waits for the answer step). */
  entry: EntryLayout | null;
  ask: { arrangement: Arrangement; mini: boolean; entry: EntryLayout; act: ActDir } | null;
  /** Every part drawn this much larger to use a big area: the bond step, the answer step. */
  zoom: number;
  askZoom: number;
}

export interface BondInput {
  ageMode: AgeMode;
  concrete: boolean;
  /** Concrete: the slot whose number is asked (its badge is a full-size blank button). */
  blank: 'whole' | 'part-0' | 'part-1' | null;
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

export const bondSize = (c: number, spread: number = BOND_W): Size => ({
  w: spread * c + 2 * BOND_PAD,
  h: BOND_H * c + 2 * BOND_PAD,
});

/** The smallest circle whose numeral stays ≥ 32 px (0.5 c, 0.32 c for 3 digits). */
export const minCircle = (biggest: number, ageMode: AgeMode) =>
  Math.max(MIN_TARGET_PX[ageMode], String(biggest).length >= 3 ? 100 : 64);

/** The numeral's font size in a circle of `c` px. */
export const circleFont = (c: number, biggest: number) =>
  Math.min(72, Math.round(c * (String(biggest).length >= 3 ? 0.32 : 0.5)));

export function poolSize(t: number, cap: number): Size {
  const cols = poolColumns(cap);
  const rows = Math.max(1, Math.ceil(cap / cols));
  const g = TARGET_GAP_PX;
  return {
    w: cols * t + (cols - 1) * g + 2 * POOL_EDGE,
    h: rows * t + (rows - 1) * g + 2 * POOL_EDGE,
  };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PoolsLayout {
  size: Size;
  pools: Record<'whole' | 'part-0' | 'part-1', Box>;
  badges: Record<'whole' | 'part-0' | 'part-1', Box>;
}

/**
 * The concrete bond, compact enough for a short area: the whole's pool on top, centred, with its
 * badge beside it (right); the parts' pools below at the two ends, their badges on their outer
 * top corners (a blank part's badge, a full-size button, stands clear above its pool). A blank
 * badge is a full target (--target-min) at least 12 px from every pool.
 */
export function poolsBox(input: BondInput): PoolsLayout {
  const t = MIN_TARGET_PX[input.ageMode];
  const whole = poolSize(t, input.caps[0]);
  const part = poolSize(t, Math.max(input.caps[1], input.caps[2]));
  const size = (slot: 'whole' | 'part-0' | 'part-1') => (input.blank === slot ? t : BADGE);
  const gap = TARGET_GAP_PX;
  const partBlank = input.blank === 'part-0' || input.blank === 'part-1';
  const legs = partBlank ? t + 2 * gap : POOL_LEGS;
  const w = Math.max(whole.w + 2 * (gap + size('whole')), 2 * part.w + PART_GAP);
  const h = whole.h + legs + part.h;
  const wholeX = (w - whole.w) / 2;
  const partY = whole.h + legs;
  const pools = {
    whole: { x: wholeX, y: 0, ...{ w: whole.w, h: whole.h } },
    'part-0': { x: 0, y: partY, w: part.w, h: part.h },
    'part-1': { x: w - part.w, y: partY, w: part.w, h: part.h },
  };
  const bw = size('whole');
  const partBadge = (slot: 'part-0' | 'part-1', x: number): Box => {
    const s = size(slot);
    const y = input.blank === slot ? partY - gap - s : partY - s / 2;
    return { x, y, w: s, h: s };
  };
  return {
    size: { w, h },
    pools,
    badges: {
      whole: { x: wholeX + whole.w + gap, y: (whole.h - bw) / 2, w: bw, h: bw },
      'part-0': partBadge('part-0', 0),
      'part-1': partBadge('part-1', w - size('part-1')),
    },
  };
}

/**
 * The concrete bond drawn `z` times as large, in real lengths (the widget draws it with no CSS
 * `zoom`: counters are dragged there, and the drag code moves them by viewport pointer deltas).
 */
export function scalePools(l: PoolsLayout, z: number): PoolsLayout {
  const box = (b: Box): Box => ({ x: b.x * z, y: b.y * z, w: b.w * z, h: b.h * z });
  const all = (r: PoolsLayout['pools']) => ({
    whole: box(r.whole),
    'part-0': box(r['part-0']),
    'part-1': box(r['part-1']),
  });
  return { size: { w: l.size.w * z, h: l.size.h * z }, pools: all(l.pools), badges: all(l.badges) };
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

const mainSize = (input: BondInput, c: number, spread: number) =>
  input.concrete ? poolsBox(input).size : bondSize(c, spread);

export const miniC = (biggest: number) => (String(biggest).length >= 3 ? 100 : 64);

/** The layout for `room` (Infinity height: the host grows with the widget). */
export function planBond(input: BondInput, room: Size): BondPlan {
  const found = foundSize(input.found);
  const handRoom = withInviteRoom(room);
  const spreads: readonly number[] = input.concrete ? [BOND_W] : BOND_SPREADS;
  const sc = (x: Size | null, z: number) => zoomed(x, z);
  // 1. Everything at once.
  function* together(): Generator<Candidate<BondPlan>> {
    for (const [g, group] of entryGroups(input.askMax).entries()) {
      for (const c of circles(input)) {
        for (const spread of spreads) {
          for (const entry of group) {
            for (const arrangement of ARRANGEMENTS) {
              const e =
                entry && input.askMax !== null
                  ? entrySize(input.askMax, entry, input.ageMode)
                  : null;
              const item: BondPlan = {
                steps: false,
                c,
                spread,
                arrangement,
                entry,
                ask: null,
                zoom: 1,
                askZoom: 1,
              };
              yield {
                item,
                rank: g,
                sizeAt: (z) =>
                  arrangedSize(
                    arrangement,
                    sc(mainSize(input, c, spread), z),
                    [sc(found, z), sc(e, z), sc(act(input.button, 1, 'row'), z)],
                    LAYOUT_GAP,
                  ),
              };
            }
          }
        }
      }
    }
  }
  const all = pickByFill(together(), room, handRoom);
  if (all.over === 0 || input.askMax === null) return { ...all.item, zoom: all.zoom };
  // 2. Steps: the bond, then the answer. The concrete bond's blank badge opens the answer step
  // itself: no Next beside it.
  const next = input.concrete && input.blank ? null : act(input.button, 1, 'row');
  function* bondStep(): Generator<
    Candidate<{ c: number; spread: number; arrangement: Arrangement }>
  > {
    for (const c of circles(input)) {
      for (const spread of spreads)
        for (const arrangement of ARRANGEMENTS) {
          yield {
            item: { c, spread, arrangement },
            rank: 0,
            sizeAt: (z) =>
              arrangedSize(
                arrangement,
                sc(mainSize(input, c, spread), z),
                [sc(found, z), sc(next, z)],
                LAYOUT_GAP,
              ),
          };
        }
    }
  }
  const build = pickByFill(bondStep(), room, handRoom);
  const mini = bondSize(miniC(input.biggest));
  // The bond (it is the question, numerals ≥ 32 px) with any answer control first; only then none.
  function* askStep(): Generator<Candidate<NonNullable<BondPlan['ask']>>> {
    for (const [m, withMini] of [true, false].entries()) {
      for (const [g, group] of entryGroups(input.askMax).entries()) {
        for (const entry of group) {
          if (!entry) continue;
          for (const arrangement of ASK_ARRANGEMENTS) {
            for (const dir of ['row', 'column'] as const) {
              const e = entrySize(input.askMax ?? 0, entry, input.ageMode);
              yield {
                item: { arrangement, mini: withMini, entry, act: dir },
                rank: m * 10 + g,
                sizeAt: (z) =>
                  arrangedSize(
                    arrangement,
                    withMini ? sc(mini, z) : null,
                    [sc(e, z), sc(act(input.button, 2, dir), z)],
                    LAYOUT_GAP,
                  ),
              };
            }
          }
        }
      }
    }
  }
  // Room for the invite hand below the answer's bottom row where a layout allows.
  const roomy = pickByFill(askStep(), handRoom, handRoom);
  const ask = roomy.over === 0 ? roomy : pickByFill(askStep(), room, handRoom);
  const plan: BondPlan = {
    steps: true,
    c: build.item.c,
    spread: build.item.spread,
    arrangement: build.item.arrangement,
    entry: null,
    ask: ask.item,
    zoom: build.zoom,
    askZoom: ask.zoom,
  };
  return build.over + ask.over <= all.over ? plan : { ...all.item, zoom: all.zoom };
}
