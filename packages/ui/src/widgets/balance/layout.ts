// The balance's picture, as pure arithmetic (06 §1: the widget plans from its measured room).
//
// Two pans side by side on a beam. A pan shows its side's terms: groups of sprites in fives,
// number tiles (a numeral, the box, a letter) and operation signs, in one row when that fits and
// stacked otherwise. In `make-equal` a pan also has a zone over its terms for the units the child
// adds (they pile up from the pan), with room for all the pan can still take, so adding one moves
// and resizes nothing; and under each pan sit its two buttons (take one off, add one). Both pans
// use one sprite size, one tile size and one box.
//
// Everything is in CSS px. `planScale` keeps the largest picture that fits the box it is given
// (`fits: false` at the smallest otherwise); `planBalance` is the whole widget's plan for a room.

import {
  BALANCE_PAN_MAX,
  type BalanceTerm,
  balanceEntryMax,
  sideValue,
} from '@number-island/engine';
import type { WidgetConfigOf } from '@number-island/shared';
import { type AgeMode, TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import type { Size } from '../kit/arrange';
import { fivesGrid, MIN_ITEM_PX } from '../kit/fives';
import { type AskPlan, planAsk } from '../kit/twoStep';

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

/** A tile at its smallest: 32 px numerals (05 §11) with room round them. */
export const TILE_H = 56;
export const NUMERAL_PX = 32;
export const tileWidth = (chars: number) => 32 + 22 * Math.max(1, chars);
/** An operation sign's box at its smallest. */
export const OP_PX = 32;
/** Tiles and signs grow with the room, up to this many times their smallest size. */
export const TILE_ZOOM_MAX = 1.75;
/** Between the parts of a pan. */
export const PART_GAP = 10;
/** Between the two pans (wider where the stand shows between the two pairs of buttons). */
export const PAN_GAP = 24;
export const BUTTONS_PAN_GAP = 48;
/** A pan's tray under its contents, and the room inside the pan round them. */
export const TRAY_H = 14;
export const PAN_PAD = 8;
/** How far a pan moves down (the other up) when the beam tips. */
export const TILT_PX = 10;
/** The beam and the stand under the trays, when no buttons sit there. */
export const STAND_H = 48;
/** Under a button: its 6 px ledge, and the gap to the tray above it. */
const BUTTON_LEDGE = 6;
const BUTTON_GAP = 8;
/** The narrowest pan drawn. */
const PAN_MIN_W = 96;
/** The sizes tried, from the largest (1) to the smallest (0). */
const ZOOM_STEPS = 24;

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
  /** How large the picture is drawn: 0 (the smallest sprites and tiles) to 1 (the largest). */
  zoom: number;
  /** One sprite's cell. */
  s: number;
  /** Tiles and signs: this many times their smallest size. */
  tile: number;
  /** Sprites in a row of a group (5 or 10). */
  cols: number;
  /** Each pan's terms in one row, or stacked (a pan takes the row when it is narrow enough). */
  flow: Record<Side, 'row' | 'column'>;
  /** One pan's box (its contents and the room round them); both pans are this size. */
  pan: Size;
  /** The room under the trays: the stand, or the buttons. */
  base: number;
  /** Between the two pans. */
  gap: number;
  /** The whole picture. */
  width: number;
  height: number;
}

export type Side = 'left' | 'right';

interface Draw {
  s: number;
  tile: number;
  cols: number;
  flow: 'row' | 'column';
}

/** A part's box as drawn (the widget draws tiles and signs with these). */
export const partSize = (p: PanPart, d: Draw): Size => {
  switch (p.kind) {
    case 'objects': {
      const g = fivesGrid(p.n, d.cols, d.s);
      return { w: g.w, h: g.h };
    }
    case 'zone': {
      const g = fivesGrid(p.cap, d.cols, d.s);
      return { w: g.w, h: g.h };
    }
    case 'tile':
      return { w: Math.round(tileWidth(p.chars) * d.tile), h: Math.round(TILE_H * d.tile) };
    case 'op':
      return { w: Math.round(OP_PX * d.tile), h: Math.round(OP_PX * d.tile) };
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
export function panContentSize(parts: readonly PanPart[], d: Draw): Size {
  const terms = along(
    parts.filter((p) => p.kind !== 'zone').map((p) => partSize(p, d)),
    d.flow,
  );
  const zones = parts.filter((p) => p.kind === 'zone').map((p) => partSize(p, d));
  return along([...zones, terms], 'column');
}

/** The room under the trays. */
export function baseHeight(ageMode: AgeMode, buttons: boolean): number {
  return buttons ? BUTTON_GAP + TARGET_PX[ageMode].icon + BUTTON_LEDGE : STAND_H;
}

function sized(input: ScaleInput, zoom: number, cols: number): ScaleLayout {
  const draw = (flow: 'row' | 'column'): Draw => ({
    s: Math.round(MIN_ITEM_PX + (Math.max(MIN_ITEM_PX, input.maxItem) - MIN_ITEM_PX) * zoom),
    tile: 1 + (TILE_ZOOM_MAX - 1) * zoom,
    cols,
    flow,
  });
  const gap = input.buttons ? BUTTONS_PAN_GAP : PAN_GAP;
  // A pan reads as one line where the line fits its half of the box; else its terms are stacked.
  const half = (input.w - gap) / 2 - 2 * PAN_PAD;
  const flowOf = (parts: readonly PanPart[]): 'row' | 'column' =>
    panContentSize(parts, draw('row')).w <= half ? 'row' : 'column';
  const flow = { left: flowOf(input.left), right: flowOf(input.right) };
  const d = draw('row');
  const l = panContentSize(input.left, draw(flow.left));
  const r = panContentSize(input.right, draw(flow.right));
  const buttonsW = input.buttons ? 2 * TARGET_PX[input.ageMode].icon + TARGET_GAP_PX : 0;
  const pan: Size = {
    w: Math.max(l.w + 2 * PAN_PAD, r.w + 2 * PAN_PAD, buttonsW, PAN_MIN_W),
    h: Math.max(l.h, r.h, TILE_H) + PAN_PAD,
  };
  const base = baseHeight(input.ageMode, input.buttons);
  const width = 2 * pan.w + gap;
  const height = TILT_PX + pan.h + TRAY_H + TILT_PX + base;
  return {
    fits: width <= input.w && height <= input.h,
    zoom,
    s: d.s,
    tile: d.tile,
    cols,
    flow,
    pan,
    base,
    gap,
    width,
    height,
  };
}

/** The picture for a box: the largest that fits, rows of ten before rows of five. */
export function planScale(input: ScaleInput): ScaleLayout {
  let best: ScaleLayout | null = null;
  for (const cols of [10, 5]) {
    for (let i = ZOOM_STEPS; i >= 0; i -= 1) {
      const l = sized(input, i / ZOOM_STEPS, cols);
      if (!l.fits) continue;
      if (!best || l.zoom > best.zoom) best = l;
      break;
    }
  }
  return best ?? sized(input, 0, 5);
}

/** A choice card (kit `PickCard`, balance.css): its box with the ledge under it. */
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

// ---------- the whole widget's plan ----------

type Config = WidgetConfigOf<'balance'>;

/** The largest sprite cell: a few things to weigh are drawn big, countable groups smaller. */
export const ITEM_MAX = 80;
export const BIG_ITEM_MAX = 128;
/** A pan with this many things at most is "a few". */
const FEW = 3;

const digits = (n: number) => String(Math.abs(Math.trunc(n))).length;

/** `make-equal`: how many units a pan can still take (it holds BALANCE_PAN_MAX in all). */
export function panRoom(config: Config, side: Side): number {
  const weighs = sideValue(config[side].terms, config.objectWeights ?? {}) ?? 0;
  return Math.max(0, BALANCE_PAN_MAX - weighs);
}

/** What a pan shows: `terms` (the item's, or the model state's), and the zone in `make-equal`. */
export function panParts(
  config: Config,
  side: Side,
  terms: readonly BalanceTerm[] = config[side].terms,
): PanPart[] {
  const boxChars = digits(balanceEntryMax(config));
  const parts: PanPart[] = terms.map((x): PanPart => {
    if ('object' in x) return { kind: 'objects', n: x.count };
    if ('op' in x) return { kind: 'op' };
    if ('n' in x) return { kind: 'tile', chars: digits(x.n) };
    if ('blank' in x) return { kind: 'tile', chars: boxChars };
    return { kind: 'tile', chars: 1 };
  });
  if (config.mode === 'make-equal') parts.push({ kind: 'zone', cap: panRoom(config, side) });
  return parts;
}

/** How many choice cards a mode has (0: none). */
export const choiceCount = (mode: Config['mode']): number =>
  mode === 'judge' ? 2 : mode === 'which-heavier' ? 3 : 0;

export interface BalancePlan {
  /** The answer control, the actions and the picture's box (kit `planAsk`). */
  ask: AskPlan;
  /** The choice cards in a column beside the balance, or in a row under it. */
  cards: 'row' | 'column';
  scale: ScaleLayout;
  /** Whether everything fits the room. */
  fits: boolean;
}

/**
 * The widget's plan for a room: the answer control and Check at full size, the balance in what is
 * left. Choice cards stand in a column beside the balance unless a row under it leaves the
 * picture more room. A room nothing fits still gets the balance, at its smallest (`fits: false`).
 */
export function planBalance(input: {
  config: Config;
  left: readonly PanPart[];
  right: readonly PanPart[];
  room: Size;
  /** One action button, as measured (kit `useActionSize`). */
  button: Size;
  ageMode: AgeMode;
}): BalancePlan {
  const { config, left, right, room, button, ageMode } = input;
  const drawn = (parts: readonly PanPart[]) =>
    parts.reduce((n, p) => n + (p.kind === 'objects' ? p.n : p.kind === 'zone' ? p.cap : 0), 0);
  const maxItem = Math.max(drawn(left), drawn(right)) <= FEW ? BIG_ITEM_MAX : ITEM_MAX;
  const making = config.mode === 'make-equal';
  const scaleFor = (size: Size) =>
    planScale({ w: size.w, h: size.h, left, right, ageMode, buttons: making, maxItem });
  /** Above 0 only when the picture fits; larger is a larger picture. */
  const score = (size: Size | null) => {
    if (!size) return 0;
    const l = scaleFor(size);
    return l.fits ? 1 + l.zoom : 0;
  };
  const planWith = (control: Size | undefined): AskPlan =>
    planAsk({
      ageMode,
      max: balanceEntryMax(config),
      control,
      button,
      actions: 1,
      room,
      pictureScore: score,
    });
  const n = choiceCount(config.mode);
  let ask: AskPlan;
  let cards: 'row' | 'column' = 'column';
  if (n > 0) {
    const column = planWith(cardsSize(ageMode, n, 'column'));
    const row = planWith(cardsSize(ageMode, n, 'row'));
    cards = score(row.picture) > score(column.picture) ? 'row' : 'column';
    ask = cards === 'row' ? row : column;
  } else {
    // `make-equal` has no answer control: the buttons are under the pans.
    ask = planWith(making ? { w: 0, h: 0 } : undefined);
  }
  const scale = scaleFor(ask.picture ?? { w: 0, h: 0 });
  return { ask, cards, scale, fits: ask.fits && ask.picture !== null && scale.fits };
}
