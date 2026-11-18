import type { AgeMode } from '../../tokens/tokens';
import { MIN_TARGET_PX } from '../../tokens/tokens';
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
import { ROW_SLOTS } from './beads';

/**
 * The rekenrek layout (06 §1: container-relative), pure arithmetic over the widget's room; sizes
 * match rekenrek.css. The rack is the picture; the numeral answer and the actions are its items.
 * Each wire is ONE slider target (--target-min + 8 px tall, 16 px apart), so the beads' width can
 * follow the room while every target stays full size. In preference order: everything at once
 * (the widest beads that fit), else (a number asked after sliding) the rack with Next, then the
 * answer step: a small picture of the rack, the numeral answer, Back and Check.
 */

export const LAYOUT_GAP = 24;
/** Bead widths to try (px): the K design width (0.78 × 80) down to compact. */
export const BEAD_WIDTHS = [62, 56, 50, 44, 38, 32] as const;
/** The answer step's small rack. */
export const VIEW_BEADS = [30, 26, 22, 18, 15] as const;
/** The frame (16 / 26 px padding, 4 px border) and the wires' panel (10 / 14 px, 3 px border). */
export const RACK_EDGE = { x: 26 + 4 + 14 + 3, y: 16 + 4 + 10 + 3 } as const;
export const ROW_GAP = 16;
/** The answer step's small rack: frame 6 / 8 px + 3 px border, panel 4 / 6 px + 2 px, wires 6 apart. */
export const SMALL_EDGE = { x: 8 + 3 + 6 + 2, y: 6 + 3 + 4 + 2 } as const;
export const SMALL_ROW_GAP = 6;
export const ACT_GAP = 24;
export const ACT_GAP_Y = 16;

export type ActDir = 'row' | 'column';

export interface RackPlan {
  steps: boolean;
  bead: number;
  arrangement: Arrangement;
  entry: EntryLayout | null;
  ask: { arrangement: Arrangement; bead: number; entry: EntryLayout; act: ActDir } | null;
}

export interface RackInput {
  ageMode: AgeMode;
  rows: number;
  /** `read`: the rack is a static picture (its wires are not targets). */
  still: boolean;
  /** The answer's largest number (null: no numeral answer). */
  askMax: number | null;
  button: Size;
}

/** A wire's height: a full target (+ 8 px) when it is a slider, else the bead's own height. */
export const rowHeight = (bead: number, ageMode: AgeMode, still: boolean) =>
  still ? Math.round(bead * 1.3) : MIN_TARGET_PX[ageMode] + 8;

export function rackSize(bead: number, rows: number, rowH: number, small = false): Size {
  const edge = small ? SMALL_EDGE : RACK_EDGE;
  const gap = small ? SMALL_ROW_GAP : ROW_GAP;
  return {
    w: ROW_SLOTS * bead + 2 * edge.x,
    h: rows * rowH + (rows - 1) * gap + 2 * edge.y,
  };
}

const act = (button: Size, n: number, dir: ActDir): Size =>
  dir === 'row'
    ? { w: n * button.w + (n - 1) * ACT_GAP, h: button.h }
    : { w: button.w, h: n * button.h + (n - 1) * ACT_GAP_Y };

export function planRack(input: RackInput, room: Size): RackPlan {
  const main = (bead: number) =>
    rackSize(bead, input.rows, rowHeight(bead, input.ageMode, input.still));
  let best: { plan: RackPlan; over: number } | null = null;
  const consider = (plan: RackPlan, size: Size) => {
    const over = overflow(size, room);
    if (!best || over < best.over) best = { plan, over };
    return over === 0;
  };
  for (const group of entryGroups(input.askMax)) {
    for (const bead of BEAD_WIDTHS) {
      for (const entry of group) {
        for (const arrangement of ARRANGEMENTS) {
          const e =
            entry && input.askMax !== null ? entrySize(input.askMax, entry, input.ageMode) : null;
          const size = arrangedSize(
            arrangement,
            main(bead),
            [e, act(input.button, 1, 'row')],
            LAYOUT_GAP,
          );
          if (consider({ steps: false, bead, arrangement, entry, ask: null }, size)) {
            return (best as unknown as { plan: RackPlan }).plan;
          }
        }
      }
    }
  }
  const b = best as unknown as { plan: RackPlan; over: number };
  if (input.askMax === null) return b.plan;
  let build: { bead: number; arrangement: Arrangement; over: number } | null = null;
  for (const bead of BEAD_WIDTHS) {
    for (const arrangement of ARRANGEMENTS) {
      const over = overflow(
        arrangedSize(arrangement, main(bead), [act(input.button, 1, 'row')], LAYOUT_GAP),
        room,
      );
      if (!build || over < build.over) build = { bead, arrangement, over };
    }
    if (build?.over === 0) break;
  }
  let ask: { a: NonNullable<RackPlan['ask']>; over: number } | null = null;
  outer: for (const group of entryGroups(input.askMax)) {
    for (const bead of VIEW_BEADS) {
      for (const entry of group) {
        if (!entry) continue;
        for (const arrangement of ASK_ARRANGEMENTS) {
          for (const dir of ['row', 'column'] as const) {
            const size = arrangedSize(
              arrangement,
              rackSize(bead, input.rows, Math.round(bead * 1.3), true),
              [entrySize(input.askMax, entry, input.ageMode), act(input.button, 2, dir)],
              LAYOUT_GAP,
            );
            const over = overflow(size, room);
            if (!ask || over < ask.over) ask = { a: { arrangement, bead, entry, act: dir }, over };
            if (over === 0) break outer;
          }
        }
      }
    }
  }
  if (!build || !ask) return b.plan;
  const plan: RackPlan = {
    steps: true,
    bead: build.bead,
    arrangement: build.arrangement,
    entry: null,
    ask: ask.a,
  };
  return build.over + ask.over <= b.over ? plan : b.plan;
}
