/**
 * Countable things in fives (06 §2): pure grid arithmetic shared by the widgets that draw piles
 * and groups of one-size items (equal-share, equal-groups). Everything is in CSS px. Items never
 * touch: each sits in its own cell, `itemGap` apart, with a wider gap between two fives of a row.
 */

/**
 * A countable thing's cell is never smaller than this. Its picture is drawn `ITEM_DRAW_SCALE`
 * times the cell (the kit sprites leave a margin inside their box), so the smallest drawn object
 * is about 22 px wide: below that a child cannot count them (evidence review, PR #103).
 */
export const MIN_ITEM_PX = 26;
/**
 * How much larger than its cell a sprite is drawn (the widgets' CSS scales it by this). It stays
 * under 1 + the gap ratio of `itemGap` (0.16), so even a sprite that filled its whole box would
 * not touch its neighbour.
 */
export const ITEM_DRAW_SCALE = 1.15;

/** The gap between neighbouring items of size `s`. */
export const itemGap = (s: number) => Math.max(4, Math.round(s * 0.16));
/** The space between two fives in a row. */
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
 * A zone's grid for `cap` items, in fives: rows of five (`upright: false`) or columns of five
 * (`upright: true`, for tall narrow zones).
 */
export function zoneGrid(cap: number, s: number, upright: boolean): Grid {
  const g = itemGap(s);
  const long = Math.min(5, cap);
  const short = Math.ceil(cap / 5);
  const cols = upright ? short : long;
  const rows = upright ? long : short;
  return { cols, rows, w: cols * s + (cols - 1) * g, h: rows * s + (rows - 1) * g };
}

/** Where item `k` of a zone sits: item 5 starts the second five. */
export function zoneCell(k: number, s: number, upright: boolean): { x: number; y: number } {
  const g = itemGap(s);
  const along = k % 5;
  const across = Math.floor(k / 5);
  const [col, row] = upright ? [across, along] : [along, across];
  return { x: col * (s + g), y: row * (s + g) };
}

/** Rows of `n` cards split as evenly as possible, longest rows first. */
export function balancedRows(n: number, perRow: number): number[] {
  const rows = Math.ceil(n / Math.max(1, perRow));
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}
