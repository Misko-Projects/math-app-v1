/**
 * Pure layout for the equal-share widget (03 §5.5). Every countable thing (an item in the basket,
 * at a recipient or by the seagull) is drawn at ONE size `s` per item, chosen as large as the
 * widget area allows (never below MIN_ITEM_PX), so no region shows its items at a smaller scale.
 * Items never overlap: each sits in its own cell of a grid laid out in fives.
 */

/** Countable things are at least this big on screen (the 20 px floor of the quality bar). */
export const MIN_ITEM_PX = 20;
/** Gap between recipient cards (≥ the 12 px target gap). */
export const CARD_GAP = 20;
/** Gap between the recipients block and the bottom row, and inside the bottom row. */
export const ROW_GAP = 16;
/** A region's legend line (icon, plus the word from G1). */
export const LEGEND_H = 36;
/** Padding inside the basket and seagull cards. */
export const CARD_PAD = 12;

/** The gap between neighbouring items: wide enough that items never touch. */
export const itemGap = (s: number) => Math.max(4, Math.round(s * 0.16));
/** The extra space between two fives in a row of the basket. */
export const fiveGap = (s: number) => Math.max(8, Math.round(s * 0.4));

export interface Grid {
  cols: number;
  rows: number;
  w: number;
  h: number;
}

/** A grid of `n` cells in rows of `cols` (`cols` a multiple of 5, or ≤ 5), fives spaced apart. */
export function fivesGrid(n: number, cols: number, s: number): Grid {
  if (n <= 0) return { cols: 0, rows: 0, w: 0, h: 0 };
  const c = Math.max(1, Math.min(cols, n));
  const rows = Math.ceil(n / c);
  const g = itemGap(s);
  const fives = Math.ceil(c / 5);
  return {
    cols: c,
    rows,
    w: c * s + (c - 1) * g + (fives - 1) * (fiveGap(s) - g),
    h: rows * s + (rows - 1) * g,
  };
}

/** Where cell `k` of a fives grid with `cols` columns sits (px from the grid's top-left). */
export function fivesCell(k: number, cols: number, s: number): { x: number; y: number } {
  const g = itemGap(s);
  const col = k % cols;
  const row = Math.floor(k / cols);
  return {
    x: col * (s + g) + Math.floor(col / 5) * (fiveGap(s) - g),
    y: row * (s + g),
  };
}

/**
 * A drop zone's grid for `cap` items, in fives: rows of five (`upright: false`) or columns of five
 * (`upright: true`, for tall narrow cards).
 */
export function zoneGrid(cap: number, s: number, upright: boolean): Grid {
  const g = itemGap(s);
  const long = Math.min(5, cap);
  const short = Math.ceil(cap / 5);
  const cols = upright ? short : long;
  const rows = upright ? long : short;
  return { cols, rows, w: cols * s + (cols - 1) * g, h: rows * s + (rows - 1) * g };
}

/** Where item `k` of a drop zone sits: item 5 starts the second five. */
export function zoneCell(k: number, s: number, upright: boolean): { x: number; y: number } {
  const g = itemGap(s);
  const along = k % 5;
  const across = Math.floor(k / 5);
  const [col, row] = upright ? [across, along] : [along, across];
  return { x: col * (s + g), y: row * (s + g) };
}

/**
 * How many items one recipient's drop zone holds: room for a fair share rounded UP to a whole
 * five, and never fewer than ten (or all the items, if there are fewer). The zone is a plain mat
 * or plate with no slots drawn, so its size never shows the share: every share of up to ten gets
 * the same ten-item mat. A pre-dealt share (fair-or-not) only has to show its own counts.
 */
export function zoneCapacity(
  items: number,
  recipients: number,
  predealt?: readonly number[],
): number {
  if (predealt) return Math.max(1, ...predealt);
  const share = Math.ceil(Math.ceil(items / Math.max(1, recipients)) / 5) * 5;
  return Math.max(1, Math.min(items, Math.max(10, share)));
}

/** Rows of `n` cards split as evenly as possible, longest rows first. */
export function balancedRows(n: number, perRow: number): number[] {
  const rows = Math.ceil(n / Math.max(1, perRow));
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

export interface Chrome {
  /** The age mode's minimum target (80 K, 64 G1+). */
  target: number;
  /** The "take one" spot in the basket (a target-sized hit area). */
  spot: number;
  /** The "one to each" button with its caption beside it (G1+). */
  dealW: number;
  dealH: number;
  /** The seagull's button with its caption or reason beside it. */
  giveW: number;
  giveH: number;
  /** The seagull on its post. */
  birdW: number;
  birdH: number;
  /** Whether regions draw a legend line. */
  legend: boolean;
}

/**
 * The fixed-size parts per age mode (TARGET_PX: K 80/88, G1+ 64/72). A round icon button is
 * --target-icon across plus its 6 px ledge. From G1 its caption (up to three short lines,
 * CAPTION_W wide) sits beside it. The seagull's button also has its reason icon (REASON_PX) beside
 * it, in every age mode.
 */
export const CAPTION_W = 150;
export const REASON_PX = { k: 44, 'g1-up': 40 } as const;
export const BESIDE_GAP = 12;
export function chromeFor(ageMode: 'k' | 'g1-up'): Chrome {
  return ageMode === 'k'
    ? {
        target: 80,
        spot: 100,
        dealW: 88,
        dealH: 94,
        giveW: 88 + BESIDE_GAP + REASON_PX.k,
        giveH: 94,
        birdW: 112,
        birdH: 128,
        legend: true,
      }
    : {
        target: 64,
        spot: 84,
        dealW: 72 + BESIDE_GAP + CAPTION_W,
        dealH: 78,
        giveW: 72 + BESIDE_GAP + REASON_PX['g1-up'] + BESIDE_GAP + CAPTION_W,
        giveH: 78,
        birdW: 96,
        birdH: 112,
        legend: true,
      };
}

export interface LayoutInput {
  recipients: number;
  kind: 'pebbling' | 'plate';
  /** Items one drop zone holds (zoneCapacity). */
  cap: number;
  /** The most items the basket can ever hold (0: no basket). */
  pileMax: number;
  /** The child deals: a take-one spot and the "one to each" button sit in the basket. */
  dealing: boolean;
  /** The seagull's corner, and the most items it can be given. */
  seagull: boolean;
  seagullMax: number;
  width: number;
  height: number;
  maxItem: number;
  chrome: Chrome;
}

export interface Layout {
  s: number;
  g: number;
  zone: Grid & { pad: number; upright: boolean };
  card: { w: number; h: number; figure: number };
  spot: number;
  rows: number[];
  pile: Grid;
  basket: { w: number; h: number; shape: BasketShape };
  bird: Grid;
  nest: { w: number; h: number; shape: NestShape };
  width: number;
  height: number;
  fits: boolean;
}

/** The padding round a zone's items (a plate's rim is wider than a pebbling's mat). */
export const zonePad = (kind: LayoutInput['kind'], s: number) =>
  kind === 'plate' ? Math.max(16, Math.round(s * 0.42)) : Math.max(10, Math.round(s * 0.28));

/** A pebbling's height above its mat. */
export const figureSize = (zoneW: number) => Math.max(72, Math.min(150, Math.round(zoneW * 0.42)));
/** How much of a pebbling sits behind its mat (its feet). */
export const FIGURE_TUCK = 0.14;

/** The take-one spot: the age mode's spot, or more when an item is bigger than that. */
export const spotSize = (chrome: Chrome, s: number) => Math.max(chrome.spot, s + 20);

/** Where the basket's controls go: beside the pile (a column), or under it (a row). */
export type BasketShape = 'side' | 'under';
/** Where the seagull's button goes: beside the bird, or under it. */
export type NestShape = 'wide' | 'tall';

interface Shape {
  perRow: number;
  upright: boolean;
  basket: BasketShape;
  nest: NestShape;
}

function layoutAt(input: LayoutInput, s: number, shape: Shape): Layout {
  const { chrome } = input;
  const g = itemGap(s);
  const zg = zoneGrid(input.cap, s, shape.upright);
  const pad = zonePad(input.kind, s);
  const zone = { ...zg, w: zg.w + 2 * pad, h: zg.h + 2 * pad, pad, upright: shape.upright };
  const figure = input.kind === 'pebbling' ? figureSize(zone.w) : 0;
  const card = {
    w: Math.max(zone.w, figure, Math.round(chrome.target * 1.1)),
    h: Math.max(zone.h + Math.round(figure * (1 - FIGURE_TUCK)), chrome.target),
    figure,
  };
  const rows = balancedRows(input.recipients, shape.perRow);
  const widest = Math.max(...rows);
  const legend = chrome.legend ? LEGEND_H : 0;
  const recW = widest * card.w + (widest - 1) * CARD_GAP;
  const recH = legend + rows.length * card.h + (rows.length - 1) * CARD_GAP;

  // The seagull's corner: the bird on its post with its button (and the reason) beside or under
  // it, and the items it is given in a row of fives below.
  const birdCols = Math.min(5, Math.max(1, input.seagullMax));
  const bird = input.seagull ? fivesGrid(input.seagullMax, birdCols, s) : fivesGrid(0, 1, s);
  const below = bird.h > 0 ? ROW_GAP + bird.h : 0;
  const wide = shape.nest === 'wide';
  const nest = input.seagull
    ? {
        w:
          2 * CARD_PAD +
          Math.max(
            wide ? chrome.birdW + ROW_GAP + chrome.giveW : Math.max(chrome.birdW, chrome.giveW),
            bird.w,
          ),
        h:
          2 * CARD_PAD +
          (wide ? Math.max(chrome.birdH, chrome.giveH) : chrome.birdH + ROW_GAP + chrome.giveH) +
          below,
      }
    : { w: 0, h: 0 };

  // The basket: the take-one spot and the "one to each" button, beside the rest of the pile (one
  // above the other) or under it (side by side). The pile takes the width the seagull leaves, in
  // as few rows of fives as fit.
  const spot = spotSize(chrome, s);
  const dealing = input.dealing;
  const side = shape.basket === 'side';
  const ctrlW = dealing ? (side ? Math.max(spot, chrome.dealW) : spot + ROW_GAP + chrome.dealW) : 0;
  const ctrlH = dealing ? (side ? spot + ROW_GAP + chrome.dealH : Math.max(spot, chrome.dealH)) : 0;
  const loose = dealing ? Math.max(0, input.pileMax - 1) : input.pileMax;
  const room =
    input.width -
    (input.seagull ? nest.w + ROW_GAP : 0) -
    2 * CARD_PAD -
    (side && dealing ? ctrlW + ROW_GAP : 0);
  let pile = fivesGrid(loose, Math.min(5, loose), s);
  for (let cols = 10; cols < loose + 5; cols += 5) {
    const wider = fivesGrid(loose, cols, s);
    if (wider.w > room) break;
    pile = wider;
  }
  const pileW = Math.max(pile.w, dealing ? 0 : s);
  const pileH = Math.max(pile.h, s);
  const hasBasket = input.pileMax > 0 || dealing;
  const basket = !hasBasket
    ? { w: 0, h: 0 }
    : side
      ? {
          w: 2 * CARD_PAD + (dealing ? ctrlW + ROW_GAP : 0) + pileW,
          h: 2 * CARD_PAD + Math.max(ctrlH, pileH),
        }
      : {
          w: 2 * CARD_PAD + Math.max(ctrlW, pileW),
          h: 2 * CARD_PAD + pileH + (dealing ? ROW_GAP + ctrlH : 0),
        };
  const bottomW = basket.w + (input.seagull ? (basket.w > 0 ? ROW_GAP : 0) + nest.w : 0);
  const bottomH = hasBasket || input.seagull ? legend + Math.max(basket.h, nest.h) : 0;

  const width = Math.max(recW, bottomW);
  const height = recH + (bottomH > 0 ? ROW_GAP + bottomH : 0);
  return {
    s,
    g,
    zone,
    card,
    spot,
    rows,
    pile,
    basket: { ...basket, shape: shape.basket },
    bird,
    nest: { ...nest, shape: shape.nest },
    width,
    height,
    fits: width <= input.width && height <= input.height,
  };
}

/**
 * The biggest item size at which everything fits the widget area. At each size it tries the
 * basket's and the seagull's controls beside and under, and fewer cards a row; the first that
 * fits wins (the most cards a row, so the fewest rows). Zones lie in rows of five (a wide mat in
 * front of each recipient) unless columns of five let the items grow by a sixth or more. If
 * nothing fits even at the 20 px floor, the shortest floor layout is returned with `fits: false`.
 */
export function shareLayout(input: LayoutInput): Layout {
  const flat = bestLayout(input, false);
  if (input.cap <= 5 || !flat.fits) {
    const upright = input.cap > 5 ? bestLayout(input, true) : flat;
    if (!flat.fits) return upright.fits || upright.height < flat.height ? upright : flat;
    return flat;
  }
  const upright = bestLayout(input, true);
  return upright.fits && upright.s >= flat.s * (7 / 6) ? upright : flat;
}

function bestLayout(input: LayoutInput, upright: boolean): Layout {
  const max = Math.max(MIN_ITEM_PX, Math.floor(input.maxItem));
  const shapes: Shape[] = [];
  for (let perRow = input.recipients; perRow >= 1; perRow -= 1) {
    for (const basket of ['side', 'under'] as const) {
      for (const nest of ['wide', 'tall'] as const) shapes.push({ perRow, upright, basket, nest });
    }
  }
  let fallback: Layout | null = null;
  for (let s = max; s >= MIN_ITEM_PX; s -= 1) {
    for (const shape of shapes) {
      const l = layoutAt(input, s, shape);
      if (l.fits) return l;
      if (s === MIN_ITEM_PX && (!fallback || l.height < fallback.height)) fallback = l;
    }
  }
  return fallback ?? layoutAt(input, MIN_ITEM_PX, shapes[0] as Shape);
}
