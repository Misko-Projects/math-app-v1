import type { AgeMode } from '../../tokens/tokens';
import { MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
import {
  ARRANGEMENTS,
  type Arrangement,
  ASK_ARRANGEMENTS,
  arrangedSize,
  type EntryLayout,
  entryGroups,
  entrySize,
  overflow,
  type Size,
} from '../kit';

/**
 * The tenframe-fill layout (06 §1: container-relative), as pure arithmetic over the widget's room.
 * Sizes match tenframe-fill.css; targets (cells, counters) are always the age mode's full target.
 *
 * The widget is a picture (the frames) plus items (the counter tray, the numeral answer, the
 * actions), arranged as the kit's `arrangedSize` allows. In preference order:
 * 1. everything at once, both frames in view;
 * 2. `steps`: first build (frames, tray, Next), then answer (a small picture of the frames, the
 *    numeral answer, Back and Check), when the answer doesn't fit beside the frames;
 * 3. `paged` (two frames only): one frame at full size and the other as a small frame button that
 *    brings it to the front, when two full-size frames don't fit (K at 960 × 600);
 * 4. paged and in steps.
 * Within each: the frames' normal chrome before the tight one, the most tray counters at once
 * (more appear as counters leave), then the arrangements and answer widths.
 */

export const LAYOUT_GAP = 24;
/** A frame's padding + border on each side: normal 14 + 4, tight 6 + 2 (tenframe-fill.css). */
export const FRAME_EDGE = { normal: 14 + 4, tight: 6 + 2 } as const;
/** Between two frames. */
export const FRAME_GAP = { normal: 18, tight: 6 } as const;
/** The counter tray's padding (12) + border (3) on each side. */
export const SUPPLY_EDGE = 12 + 3;
/** The small frame button (paged): pieces, their gap, its padding + border on each side. */
export const MINI_PIECE: Record<AgeMode, number> = { k: 32, 'g1-up': 32 };
export const MINI_GAP = 4;
export const MINI_EDGE = 6 + 3;
/** The answer step's picture: cell sizes to try, the cells' gap, padding + border a side. */
export const VIEW_CELLS = [48, 40, 32] as const;
export const VIEW_GAP = 4;
export const VIEW_EDGE = 4 + 3;
/** Between the buttons of the actions: in a row, and stacked (their 6 px ledge margin adds). */
export const ACT_GAP = 24;
export const ACT_GAP_Y = 16;

export type Chrome = keyof typeof FRAME_EDGE;

export interface BuildPlan {
  arrangement: Arrangement;
  chrome: Chrome;
  /** The counter tray's columns and rows (null: no tray). */
  supply: [number, number] | null;
  /** The answer beside the frames (null: no answer, or it waits for the answer step). */
  entry: EntryLayout | null;
}
export interface AskPlan {
  /**
   * The kit arrangements, or `split`: the answer on the left and, beside it, the picture with the
   * actions under it (short K areas, where the numeral tray takes the width).
   */
  arrangement: Arrangement;
  view: number;
  entry: EntryLayout;
  /** The actions (Back, Check) side by side or stacked. */
  act: ActDir;
}
export type ActDir = 'row' | 'column';
export interface Plan {
  paged: boolean;
  steps: boolean;
  build: BuildPlan;
  ask: AskPlan | null;
}

export interface PlanInput {
  ageMode: AgeMode;
  frames: number;
  /** Cells a frame: 5 or 10. */
  size: number;
  /** The tray's counters (0: no tray). */
  supply: number;
  /** The largest number the answer offers (null: no numeral answer). */
  askMax: number | null;
  /** One action button's size, as rendered. */
  button: Size;
}

const rowsOf = (size: number) => Math.max(1, Math.round(size / 5));

export function frameSize(t: number, rows: number, chrome: Chrome): Size {
  const e = 2 * FRAME_EDGE[chrome];
  const g = TARGET_GAP_PX;
  return { w: 5 * t + 4 * g + e, h: rows * t + (rows - 1) * g + e };
}

export function miniSize(ageMode: AgeMode, rows: number): Size {
  const m = MINI_PIECE[ageMode];
  return {
    w: 5 * m + 4 * MINI_GAP + 2 * MINI_EDGE,
    h: Math.max(MIN_TARGET_PX[ageMode], rows * m + (rows - 1) * MINI_GAP + 2 * MINI_EDGE),
  };
}

export function framesSize(input: PlanInput, chrome: Chrome, paged: boolean): Size {
  const t = MIN_TARGET_PX[input.ageMode];
  const rows = rowsOf(input.size);
  const f = frameSize(t, rows, chrome);
  if (paged) {
    const m = miniSize(input.ageMode, rows);
    return { w: Math.max(f.w, m.w), h: f.h + TARGET_GAP_PX + m.h };
  }
  const n = input.frames;
  return { w: f.w, h: n * f.h + (n - 1) * FRAME_GAP[chrome] };
}

export function viewSize(frames: number, size: number, v: number): Size {
  const rows = rowsOf(size);
  const w = 5 * v + 4 * VIEW_GAP + 2 * VIEW_EDGE;
  const h = rows * v + (rows - 1) * VIEW_GAP + 2 * VIEW_EDGE;
  return { w, h: frames * h + (frames - 1) * 8 };
}

export function supplySize(t: number, [cols, rows]: [number, number]): Size {
  const g = TARGET_GAP_PX;
  return {
    w: cols * t + (cols - 1) * g + 2 * SUPPLY_EDGE,
    h: rows * t + (rows - 1) * g + 2 * SUPPLY_EDGE,
  };
}

export const actSize = (button: Size, n: number, dir: ActDir = 'row'): Size =>
  dir === 'row'
    ? { w: n * button.w + (n - 1) * ACT_GAP, h: button.h }
    : { w: button.w, h: n * button.h + (n - 1) * ACT_GAP_Y };

/** Tray shapes (columns, rows; at most 5 × 5) that show `want` counters, the squarer first. */
function shapesFor(want: number): [number, number][] {
  const out: [number, number][] = [];
  for (let cols = 1; cols <= 5; cols++) {
    const rows = Math.ceil(want / cols);
    if (rows <= 5) out.push([cols, rows]);
  }
  return out.sort((a, b) => Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]) || b[0] - a[0]);
}

export function buildSize(input: PlanInput, paged: boolean, b: BuildPlan): Size {
  const t = MIN_TARGET_PX[input.ageMode];
  const main = framesSize(input, b.chrome, paged);
  const supply = b.supply ? supplySize(t, b.supply) : null;
  const entry =
    b.entry && input.askMax !== null ? entrySize(input.askMax, b.entry, input.ageMode) : null;
  const act = actSize(input.button, 1);
  return arrangedSize(b.arrangement, main, [supply, entry, act], LAYOUT_GAP);
}

export function askSize(input: PlanInput, a: AskPlan): Size {
  const main = a.view > 0 ? viewSize(input.frames, input.size, a.view) : null;
  const entry = entrySize(input.askMax ?? 0, a.entry, input.ageMode);
  const act = actSize(input.button, 2, a.act);
  return arrangedSize(a.arrangement, main, [entry, act], LAYOUT_GAP);
}

function* buildCandidates(input: PlanInput, steps: boolean): Generator<BuildPlan> {
  const need = Math.min(input.supply, 10);
  const tiers = need > 0 ? [...new Set([need, Math.min(need, 6), Math.min(need, 3), 1])] : [0];
  const groups = steps ? [[null]] : entryGroups(input.askMax);
  for (const entries of groups) {
    for (const want of tiers) {
      for (const chrome of ['normal', 'tight'] as const) {
        const shapes = want > 0 ? shapesFor(want) : [null];
        for (const supply of shapes) {
          for (const arrangement of ARRANGEMENTS) {
            for (const entry of entries) yield { arrangement, chrome, supply, entry };
          }
        }
      }
    }
  }
}

function bestOf<T>(
  items: Iterable<T>,
  size: (x: T) => Size,
  room: Size,
): { item: T; over: number } {
  let best: { item: T; over: number } | null = null;
  for (const item of items) {
    const over = overflow(size(item), room);
    if (over === 0) return { item, over };
    if (!best || over < best.over) best = { item, over };
  }
  if (!best) throw new Error('no layout candidates');
  return best;
}

function bestAsk(input: PlanInput, room: Size): { item: AskPlan; over: number } {
  const max = input.askMax ?? 0;
  function* all(): Generator<AskPlan> {
    // The picture only where its counters stay ≥ 32 px; else none (Back returns to it).
    for (const group of entryGroups(max))
      for (const view of [...VIEW_CELLS, 0])
        for (const entry of group)
          for (const arrangement of ASK_ARRANGEMENTS)
            for (const act of ['row', 'column'] as const)
              if (entry) yield { arrangement, view, entry, act };
  }
  return bestOf(all(), (a) => askSize(input, a), room);
}

/** The layout for `room` (Infinity height: the host grows with the widget). */
export function planFor(input: PlanInput, room: Size): Plan {
  const pagings = input.frames === 2 ? [false, true] : [false];
  const stepping = input.askMax !== null ? [false, true] : [false];
  let best: { plan: Plan; over: number } | null = null;
  for (const paged of pagings) {
    for (const steps of stepping) {
      const ask = steps ? bestAsk(input, room) : null;
      const build = bestOf(buildCandidates(input, steps), (b) => buildSize(input, paged, b), room);
      const over = build.over + (ask?.over ?? 0);
      const plan: Plan = { paged, steps, build: build.item, ask: ask?.item ?? null };
      if (over === 0) return plan;
      if (!best || over < best.over) best = { plan, over };
    }
  }
  return (best as { plan: Plan }).plan;
}
