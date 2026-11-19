import type { AgeMode } from '../../tokens/tokens';
import { MIN_TARGET_PX } from '../../tokens/tokens';
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
/** (Beads stay ≥ 32 px drawn, a slot less 3 px; where none fits, no picture: Back returns.) */
export const VIEW_BEADS = [44, 40, 35] as const;
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
  /** Every part drawn this much larger to use a big area: the rack step, the answer step. */
  zoom: number;
  askZoom: number;
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
  const handRoom = withInviteRoom(room);
  const sc = (x: Size | null, z: number) => zoomed(x, z);
  function* together(): Generator<Candidate<RackPlan>> {
    for (const [g, group] of entryGroups(input.askMax).entries()) {
      for (const bead of BEAD_WIDTHS) {
        for (const entry of group) {
          for (const arrangement of ARRANGEMENTS) {
            const e =
              entry && input.askMax !== null ? entrySize(input.askMax, entry, input.ageMode) : null;
            const item: RackPlan = {
              steps: false,
              bead,
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
                  sc(main(bead), z),
                  [sc(e, z), sc(act(input.button, 1, 'row'), z)],
                  LAYOUT_GAP,
                ),
            };
          }
        }
      }
    }
  }
  const all = pickByFill(together(), room, handRoom);
  if (all.over === 0 || input.askMax === null) return { ...all.item, zoom: all.zoom };
  function* rackStep(): Generator<Candidate<{ bead: number; arrangement: Arrangement }>> {
    for (const bead of BEAD_WIDTHS) {
      for (const arrangement of ARRANGEMENTS) {
        yield {
          item: { bead, arrangement },
          rank: 0,
          sizeAt: (z) =>
            arrangedSize(
              arrangement,
              sc(main(bead), z),
              [sc(act(input.button, 1, 'row'), z)],
              LAYOUT_GAP,
            ),
        };
      }
    }
  }
  const build = pickByFill(rackStep(), room, handRoom);
  // A legible picture (beads ≥ 32 px) with any answer control first; only then none.
  function* askStep(): Generator<Candidate<NonNullable<RackPlan['ask']>>> {
    for (const [p, beads] of [VIEW_BEADS, [0]].entries()) {
      for (const [g, group] of entryGroups(input.askMax).entries()) {
        for (const bead of beads) {
          for (const entry of group) {
            if (!entry) continue;
            for (const arrangement of ASK_ARRANGEMENTS) {
              for (const dir of ['row', 'column'] as const) {
                const e = entrySize(input.askMax ?? 0, entry, input.ageMode);
                const pic =
                  bead > 0 ? rackSize(bead, input.rows, Math.round(bead * 1.3), true) : null;
                yield {
                  item: { arrangement, bead, entry, act: dir },
                  rank: p * 10 + g,
                  sizeAt: (z) =>
                    arrangedSize(
                      arrangement,
                      sc(pic, z),
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
  }
  // Room for the invite hand below the answer's bottom row where a layout allows.
  const roomy = pickByFill(askStep(), handRoom, handRoom);
  const ask = roomy.over === 0 ? roomy : pickByFill(askStep(), room, handRoom);
  const plan: RackPlan = {
    steps: true,
    bead: build.item.bead,
    arrangement: build.item.arrangement,
    entry: null,
    ask: ask.item,
    zoom: build.zoom,
    askZoom: ask.zoom,
  };
  return build.over + ask.over <= all.over ? plan : { ...all.item, zoom: all.zoom };
}
