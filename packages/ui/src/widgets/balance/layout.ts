// The balance's picture, as pure arithmetic (06 §1: the widget plans from its measured room).
//
// Two pans side by side on a beam. A pan shows its side's terms: groups of sprites in fives,
// number tiles (a numeral, the box, a letter) and operation signs, in one row when that fits and
// stacked otherwise. In `make-equal` a pan also has a zone over its terms for the units the child
// adds (they pile up from the pan), with room for all the pan can still take, so adding one moves
// and resizes nothing; and under each pan sit
// its two buttons (take one off, add one). Both pans use one sprite size and one box.
//
// Everything is in CSS px. `planScale` keeps the largest sprite at which the picture fits the
// box it is given (`fits: false` at the smallest sprite otherwise).

import { type AgeMode, TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import type { Size } from '../kit/arrange';
import { fivesGrid, MIN_ITEM_PX } from '../kit/fives';

export { fivesCell, MIN_ITEM_PX } from '../kit/fives';

/** What a pan shows, in reading order. */
export type PanPart =
  /** A group of `n` sprites. */
  | { kind: 'objects'; n: number }
  /** A tile of `chars` characters at numeral size (a number, the box, a letter). */
  | { kind: 'tile'; chars: number }
  | { kind: 'op' }
  /** `make-equal`: room for `cap` units the child may add (always over the terms). */
  | { kind: 'zone'; cap: number };

/** A tile: 32 px numerals (05 §11) with room round them. */
export const TILE_H = 56;
export const tileWidth = (chars: number) => 32 + 22 * Math.max(1, chars);
/** An operation sign's box. */
export const OP_PX = 32;
/** Between the parts of a pan. */
export const PART_GAP = 10;
/** Between the two pans (wider where the stand shows between the two pairs of buttons). */
export const PAN_GAP = 24;
export const BUTTONS_PAN_GAP = 48;
/** `make-equal`: the line over the pans that says why nothing happened (24 px text). */
export const NOTE_H = 34;
/** A pan's tray under its contents, and the room inside the pan round them. */
export const TRAY_H = 14;
export const PAN_PAD = 8;
/** How far a pan moves down (the other up) when the beam tips. */
export const TILT_PX = 10;
/** The beam and the stand under the trays, when no buttons sit there. */
export const STAND_H = 48;
/** Under a button: its 6 px ledge, and the gap to the tray above it. */
const BUTTON_LEDGE = 6;
const BUTTON_GAP = 10;
/** The narrowest pan drawn. */
const PAN_MIN_W = 96;

export interface ScaleInput {
  /** The box the picture may use. */
  w: number;
  h: number;
  left: readonly PanPart[];
  right: readonly PanPart[];
  ageMode: AgeMode;
  /** `make-equal`: two buttons under each pan. */
  buttons: boolean;
  /** The largest sprite cell (a few big things, or many small ones). */
  maxItem: number;
}

export interface ScaleLayout {
  fits: boolean;
  /** One sprite's cell. */
  s: number;
  /** Sprites in a row of a group (5 or 10). */
  cols: number;
  /** A pan's terms in one row, or stacked. */
  flow: 'row' | 'column';
  /** One pan's box (its contents and the room round them); both pans are this size. */
  pan: Size;
  /** The room under the trays: the stand, or the buttons. */
  base: number;
  /** Between the two pans. */
  gap: number;
  /** The note line over the pans (0: none). */
  note: number;
  /** The whole picture. */
  width: number;
  height: number;
}

const partSize = (p: PanPart, s: number, cols: number): Size => {
  switch (p.kind) {
    case 'objects': {
      const g = fivesGrid(p.n, cols, s);
      return { w: g.w, h: g.h };
    }
    case 'zone': {
      const g = fivesGrid(p.cap, cols, s);
      return { w: g.w, h: g.h };
    }
    case 'tile':
      return { w: tileWidth(p.chars), h: TILE_H };
    case 'op':
      return { w: OP_PX, h: OP_PX };
  }
};

const along = (sizes: readonly Size[], flow: 'row' | 'column'): Size => {
  const real = sizes.filter((x) => x.w > 0 && x.h > 0);
  if (real.length === 0) return { w: 0, h: 0 };
  const gaps = (real.length - 1) * PART_GAP;
  return flow === 'row'
    ? { w: real.reduce((a, x) => a + x.w, gaps), h: Math.max(...real.map((x) => x.h)) }
    : { w: Math.max(...real.map((x) => x.w)), h: real.reduce((a, x) => a + x.h, gaps) };
};

/** A pan's contents: its terms along the flow, with the zone over them. */
export function panContentSize(
  parts: readonly PanPart[],
  s: number,
  cols: number,
  flow: 'row' | 'column',
): Size {
  const terms = along(
    parts.filter((p) => p.kind !== 'zone').map((p) => partSize(p, s, cols)),
    flow,
  );
  const zones = parts.filter((p) => p.kind === 'zone').map((p) => partSize(p, s, cols));
  return along([terms, ...zones], 'column');
}

/** The room under the trays. */
export function baseHeight(ageMode: AgeMode, buttons: boolean): number {
  return buttons ? BUTTON_GAP + TARGET_PX[ageMode].icon + BUTTON_LEDGE : STAND_H;
}

function sized(input: ScaleInput, s: number, cols: number, flow: 'row' | 'column'): ScaleLayout {
  const l = panContentSize(input.left, s, cols, flow);
  const r = panContentSize(input.right, s, cols, flow);
  const buttonsW = input.buttons ? 2 * TARGET_PX[input.ageMode].icon + TARGET_GAP_PX : 0;
  const pan: Size = {
    w: Math.max(l.w + 2 * PAN_PAD, r.w + 2 * PAN_PAD, buttonsW, PAN_MIN_W),
    h: Math.max(l.h, r.h, TILE_H) + PAN_PAD,
  };
  const base = baseHeight(input.ageMode, input.buttons);
  const gap = input.buttons ? BUTTONS_PAN_GAP : PAN_GAP;
  const note = input.buttons ? NOTE_H : 0;
  const width = 2 * pan.w + gap;
  const height = note + TILT_PX + pan.h + TRAY_H + TILT_PX + base;
  return {
    fits: width <= input.w && height <= input.h,
    s,
    cols,
    flow,
    pan,
    base,
    gap,
    note,
    width,
    height,
  };
}

const hasSprites = (parts: readonly PanPart[]) =>
  parts.some((p) => (p.kind === 'objects' && p.n > 0) || (p.kind === 'zone' && p.cap > 0));

/**
 * The picture for a box: the largest sprite that fits, the terms in a row before a stack, rows
 * of ten before rows of five. Without sprites the size is fixed, so it fits or it does not.
 */
export function planScale(input: ScaleInput): ScaleLayout {
  const sprites = hasSprites(input.left) || hasSprites(input.right);
  const top = Math.max(MIN_ITEM_PX, Math.floor(input.maxItem));
  let best: ScaleLayout | null = null;
  for (const flow of ['row', 'column'] as const) {
    for (const cols of [10, 5]) {
      for (let s = top; s >= MIN_ITEM_PX; s -= 2) {
        const l = sized(input, s, cols, flow);
        if (l.fits) {
          if (!best || l.s > best.s) best = l;
          break;
        }
        if (!sprites) break;
      }
      if (!sprites) break;
    }
  }
  return best ?? sized(input, MIN_ITEM_PX, 5, 'column');
}

/** A choice card (kit `PickCard`): its box with the ledge under it. */
export function cardSize(ageMode: AgeMode): Size {
  const side = Math.ceil(TARGET_PX[ageMode].min * 1.15);
  return { w: Math.max(side, 104), h: Math.max(side, 88) + 6 };
}

/** `n` choice cards in a column or a row, the target gap apart. */
export function cardsSize(ageMode: AgeMode, n: number, dir: 'row' | 'column'): Size {
  const c = cardSize(ageMode);
  return dir === 'row'
    ? { w: n * c.w + (n - 1) * TARGET_GAP_PX, h: c.h }
    : { w: c.w, h: n * c.h + (n - 1) * TARGET_GAP_PX };
}
