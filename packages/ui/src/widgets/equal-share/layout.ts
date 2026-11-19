/**
 * Pure layout for the equal-share widget (03 §5.5; 06 §1: container-relative). Every countable
 * thing (an item in the basket, at a recipient or by the seagull) is drawn at ONE size `s` per
 * item, chosen as large as the room allows (never below MIN_ITEM_PX), so no region shows its
 * items at a smaller scale. Items never overlap: each sits in its own cell of a grid in fives.
 *
 * Items are pictures. What a child touches is always a full target (06 §4): the take-one spot in
 * the basket, a whole recipient card (drop target), a recipient's mat or plate (the handle that
 * takes its last item back), the buttons and the seagull.
 */

import { balancedRows, fivesGrid, type Grid, itemGap, MIN_ITEM_PX, zoneGrid } from '../kit/fives';

export { fivesCell, MIN_ITEM_PX, zoneCell } from '../kit/fives';

/** Gap between recipient cards (≥ the 12 px target gap). */
export const CARD_GAP = 16;
/** Gap between the parts (basket, recipients, seagull), and inside the basket and the nest. */
export const ROW_GAP = 12;
/** Padding inside the basket and seagull cards (their 3 px border is inside it). */
export const CARD_PAD = 12;

export interface Chrome {
  /** The age mode's minimum target (80 K, 64 G1+). */
  target: number;
  /** The "take one" spot in the basket (a round target with the next item on it). */
  spot: number;
  /** The round "one to each" button with its 6 px ledge. */
  dealW: number;
  dealH: number;
  /** The seagull on its post (a button: it is given what is left). */
  birdW: number;
  birdH: number;
  /**
   * The line a limit note is written on, with the space under it. The build step keeps the same
   * strip under its row for the demonstration hand (kit `useInviteHand` hangs it below a
   * control), so neither a note nor an invite ever moves the row, and the row stays centred.
   */
  note: number;
}

/** The fixed-size parts per age mode (TARGET_PX: K 80/88, G1+ 64/72). */
export function chromeFor(ageMode: 'k' | 'g1-up'): Chrome {
  return ageMode === 'k'
    ? { target: 80, spot: 96, dealW: 88, dealH: 94, birdW: 96, birdH: 112, note: 40 }
    : { target: 64, spot: 80, dealW: 72, dealH: 78, birdW: 80, birdH: 93, note: 36 };
}

/** The static picture's small seagull (the ask step; nothing to touch). */
export const PICTURE_BIRD = { w: 55, h: 64 } as const;

export interface LayoutInput {
  recipients: number;
  kind: 'pebbling' | 'plate';
  /** Items one drop zone holds (the engine's `shareCapacity`). */
  cap: number;
  /** The most items the basket shows (0: no basket). */
  pileMax: number;
  /**
   * `deal`: the child deals (take-one spot, "one to each", the seagull as a button, a line for
   * limit notes). `picture`: nothing to touch (a pre-dealt share, or the ask step's picture).
   */
  mode: 'deal' | 'picture';
  /** The most items the seagull can hold (0: no seagull). */
  seagullMax: number;
  width: number;
  height: number;
  maxItem: number;
  chrome: Chrome;
}

export type BasketShape = 'side' | 'under';
/** All parts in one row, or the recipients above the basket and the seagull. */
export type Flow = 'row' | 'stack';

export interface Layout {
  s: number;
  g: number;
  flow: Flow;
  zone: Grid & { w: number; h: number; padX: number; padY: number; upright: boolean };
  card: { w: number; h: number; figure: number };
  spot: number;
  rows: number[];
  pile: Grid;
  basket: { w: number; h: number; shape: BasketShape };
  /** The seagull's items (a row of up to `seagullMax`), at least a target tall and wide. */
  gull: Grid & { boxW: number; boxH: number };
  nest: { w: number; h: number };
  note: number;
  width: number;
  height: number;
  fits: boolean;
}

/** The padding round a zone's items (a plate's rim is wider than a pebbling's mat). */
export const zonePad = (kind: LayoutInput['kind'], s: number) =>
  kind === 'plate' ? Math.max(10, Math.round(s * 0.36)) : Math.max(10, Math.round(s * 0.28));

/** A pebbling's height above its mat. */
export const figureSize = (zoneW: number) => Math.max(64, Math.min(150, Math.round(zoneW * 0.42)));
/** How much of a pebbling sits behind its mat (its feet). */
export const FIGURE_TUCK = 0.14;

interface Shape {
  flow: Flow;
  perRow: number;
  upright: boolean;
  basket: BasketShape;
}

function layoutAt(input: LayoutInput, s: number, shape: Shape): Layout {
  const { chrome } = input;
  const deal = input.mode === 'deal';
  const g = itemGap(s);
  const zg = zoneGrid(input.cap, s, shape.upright);
  const pad = zonePad(input.kind, s);
  // The mat or plate is the handle that takes an item back: never smaller than a target.
  const zoneW = Math.max(zg.w + 2 * pad, deal ? chrome.target : 0);
  const zoneH = Math.max(zg.h + 2 * pad, deal ? chrome.target : 0);
  const zone = {
    ...zg,
    w: zoneW,
    h: zoneH,
    padX: (zoneW - zg.w) / 2,
    padY: (zoneH - zg.h) / 2,
    upright: shape.upright,
  };
  const figure = input.kind === 'pebbling' ? figureSize(zone.w) : 0;
  const card = {
    w: Math.max(zone.w, figure),
    h: zone.h + Math.round(figure * (1 - FIGURE_TUCK)),
    figure,
  };
  const rows = balancedRows(input.recipients, shape.perRow);
  const widest = Math.max(...rows);
  const recW = widest * card.w + (widest - 1) * CARD_GAP;
  const recH = rows.length * card.h + (rows.length - 1) * CARD_GAP;

  // The seagull's corner: the bird, and under it the items it was given (a full target in `deal`:
  // touching them takes them back).
  const hasNest = input.seagullMax > 0;
  const bird = deal ? { w: chrome.birdW, h: chrome.birdH } : PICTURE_BIRD;
  const gullGrid = hasNest ? fivesGrid(input.seagullMax, input.seagullMax, s) : fivesGrid(0, 1, s);
  const gull = {
    ...gullGrid,
    boxW: hasNest ? Math.max(gullGrid.w, deal ? chrome.target : 0) : 0,
    boxH: hasNest ? Math.max(gullGrid.h, deal ? chrome.target : 0) : 0,
  };
  const nest = hasNest
    ? {
        w: 2 * CARD_PAD + Math.max(bird.w, gull.boxW),
        h: 2 * CARD_PAD + bird.h + ROW_GAP + gull.boxH,
      }
    : { w: 0, h: 0 };

  // The basket: the take-one spot and the "one to each" button, beside the rest of the pile (one
  // above the other) or under it (side by side), and the pile in rows of five.
  const spot = Math.max(chrome.spot, s + 16);
  const side = shape.basket === 'side';
  const ctrlW = deal ? (side ? Math.max(spot, chrome.dealW) : spot + ROW_GAP + chrome.dealW) : 0;
  const ctrlH = deal ? (side ? spot + ROW_GAP + chrome.dealH : Math.max(spot, chrome.dealH)) : 0;
  const loose = deal ? Math.max(0, input.pileMax - 1) : input.pileMax;
  const pile = fivesGrid(loose, Math.min(5, loose), s);
  const hasBasket = input.pileMax > 0 || deal;
  const between = pile.w > 0 && ctrlW > 0 ? ROW_GAP : 0;
  const basket = !hasBasket
    ? { w: 0, h: 0 }
    : side
      ? { w: 2 * CARD_PAD + ctrlW + between + pile.w, h: 2 * CARD_PAD + Math.max(ctrlH, pile.h) }
      : { w: 2 * CARD_PAD + Math.max(ctrlW, pile.w), h: 2 * CARD_PAD + pile.h + between + ctrlH };

  const parts = [basket, { w: recW, h: recH }, nest].filter((p) => p.w > 0);
  const note = deal ? chrome.note : 0;
  let width: number;
  let height: number;
  if (shape.flow === 'row') {
    width = parts.reduce((a, p) => a + p.w, 0) + (parts.length - 1) * ROW_GAP;
    height = 2 * note + Math.max(...parts.map((p) => p.h));
  } else {
    const bottom = [basket, nest].filter((p) => p.w > 0);
    const bottomW = bottom.reduce((a, p) => a + p.w, 0) + Math.max(0, bottom.length - 1) * ROW_GAP;
    const bottomH = Math.max(0, ...bottom.map((p) => p.h));
    width = Math.max(recW, bottomW);
    height = 2 * note + recH + (bottomH > 0 ? ROW_GAP + bottomH : 0);
  }
  return {
    s,
    g,
    flow: shape.flow,
    zone,
    card,
    spot,
    rows,
    pile,
    basket: { ...basket, shape: shape.basket },
    gull,
    nest,
    note,
    width,
    height,
    fits: width <= input.width && height <= input.height,
  };
}

/**
 * The biggest item size at which everything fits the room. At each size it tries one row before
 * the stacked flow, zones in rows of five before columns of five, and the basket's controls
 * beside its pile before under it; the first that fits wins. If nothing fits even at the 20 px
 * floor, the layout that overflows least is returned with `fits: false`.
 */
export function shareLayout(input: LayoutInput): Layout {
  const max = Math.max(MIN_ITEM_PX, Math.floor(input.maxItem));
  const shapes: Shape[] = [];
  for (const flow of ['row', 'stack'] as const) {
    for (const upright of input.cap > 1 ? [false, true] : [false]) {
      for (const basket of ['side', 'under'] as const) {
        const perRows = flow === 'row' ? [input.recipients] : [input.recipients, 2];
        for (const perRow of new Set(perRows)) shapes.push({ flow, perRow, upright, basket });
      }
    }
  }
  let fallback: { layout: Layout; over: number } | null = null;
  for (let s = max; s >= MIN_ITEM_PX; s -= 1) {
    for (const shape of shapes) {
      const l = layoutAt(input, s, shape);
      if (l.fits) return l;
      if (s === MIN_ITEM_PX) {
        const over = Math.max(0, l.width - input.width) + Math.max(0, l.height - input.height);
        if (!fallback || over < fallback.over) fallback = { layout: l, over };
      }
    }
  }
  return (fallback as { layout: Layout }).layout;
}
