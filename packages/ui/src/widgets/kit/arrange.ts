import { numeralCardPx, TRAY_PANEL_EDGES_PX, trayGrid } from './controls';

/**
 * Container-relative layout arithmetic (06 §1) for widgets made of one picture (`main`) and a few
 * controls beside it (`items`: a counter tray, the numeral answer, the actions). A widget measures
 * its room (`useWidgetRoom`), works out each part's size for the candidate layouts it allows, and
 * keeps the first one that fits: every size here is in CSS px, and targets never shrink.
 *
 * Arrangements (the root's flex direction, then the items' own):
 * - `row`: the picture and every item in one row.
 * - `side`: the picture, then the items in a column beside it (short, wide areas).
 * - `stack`: the picture on top, the items in a row below it.
 * - `column`: everything in one column (narrow, tall areas).
 */

export type Arrangement = 'row' | 'side' | 'stack' | 'column' | 'split';
export const ARRANGEMENTS: readonly Arrangement[] = ['row', 'side', 'stack', 'column'];
/**
 * With `split` too: the first item (the numeral answer) on the left; the picture and the other
 * items stacked beside it (an answer step in a short area, where the answer takes the height).
 */
export const ASK_ARRANGEMENTS: readonly Arrangement[] = [...ARRANGEMENTS, 'split'];

export interface Size {
  w: number;
  h: number;
}

const inRow = (parts: Size[], gap: number): Size => ({
  w: parts.reduce((a, p) => a + p.w, 0) + Math.max(0, parts.length - 1) * gap,
  h: Math.max(0, ...parts.map((p) => p.h)),
});
const inColumn = (parts: Size[], gap: number): Size => ({
  w: Math.max(0, ...parts.map((p) => p.w)),
  h: parts.reduce((a, p) => a + p.h, 0) + Math.max(0, parts.length - 1) * gap,
});

/** The box `main` plus `items` need in `arrangement`, `gap` px between parts (empty parts skipped). */
export function arrangedSize(
  arrangement: Arrangement,
  main: Size | null,
  items: readonly (Size | null)[],
  gap: number,
): Size {
  const list = items.filter((s): s is Size => s !== null && s.w > 0 && s.h > 0);
  if (arrangement === 'split') {
    const [first, ...rest] = list;
    const beside = inColumn([...(main ? [main] : []), ...rest], gap);
    return first ? inRow([first, beside], gap) : beside;
  }
  const itemsDir = arrangement === 'row' || arrangement === 'stack' ? inRow : inColumn;
  const parts = [...(main ? [main] : []), ...(list.length ? [itemsDir(list, gap)] : [])];
  return arrangement === 'row' || arrangement === 'side' ? inRow(parts, gap) : inColumn(parts, gap);
}

/** How far `size` overflows `room` (0 when it fits; sub-pixel slack for rounding). */
export function overflow(size: Size, room: Size): number {
  return Math.max(0, size.w - room.w - 0.5) + Math.max(0, size.h - room.h - 0.5);
}

/**
 * Picks the first candidate that fits `room`; when none does, the one that overflows least
 * (the widget then scrolls as little as it can, never shrinking a target).
 */
export function firstFit<T>(candidates: Iterable<T>, size: (c: T) => Size, room: Size): T | null {
  let best: T | null = null;
  let bestOver = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const over = overflow(size(c), room);
    if (over === 0) return c;
    if (over < bestOver) {
      best = c;
      bestOver = over;
    }
  }
  return best;
}

// ---------- answer controls (sizes match kit.css) ----------

/**
 * A numeral card's height: `.ni-pick` min-height (--target-min × 1.15), or its content when taller:
 * the 48 px numeral (line-height 1, 0.12 em top padding), 2 × 10 px padding, 2 × 3 px border.
 */
export const numeralCardH = (targetMin: number) => Math.max(targetMin * 1.15, 48 * 1.12 + 20 + 6);
/** One tray row: a card plus its bottom margin (--target-gap + the 6 px ledge). */
const trayRowPx = (targetMin: number, gap: number) => numeralCardH(targetMin) + gap + 6;
/** The tray panel's top and bottom padding (18 + 6) plus its 3 px borders. */
const TRAY_PANEL_EDGES_Y = 18 + 6 + 2 * 3;

/**
 * A NumeralTray of `n` cards (`digits` wide) given `columns` (its `columns` prop): the panel is
 * exactly `columns` cards wide and holds trayGrid(n, columns) rows. `columnGap` is the tray's
 * `--tray-gap` (default --target-gap); rows are always --target-gap + the ledge apart.
 */
export function numeralTraySize(
  n: number,
  digits: number,
  columns: number,
  targetMin: number,
  gap: number,
  columnGap: number = gap,
): Size {
  const card = numeralCardPx(digits, targetMin);
  const { rows } = trayGrid(n, columns);
  return {
    w: columns * card + (columns - 1) * columnGap + TRAY_PANEL_EDGES_PX + 1,
    h: rows * trayRowPx(targetMin, gap) + TRAY_PANEL_EDGES_Y,
  };
}

/** The tray widths worth trying for `n` cards, widest first: each distinct trayGrid column count. */
export function trayColumnChoices(n: number): number[] {
  const out: number[] = [];
  for (let cap = n; cap >= 1; cap--) {
    const { cols } = trayGrid(n, cap);
    if (!out.includes(cols)) out.push(cols);
  }
  return out;
}
