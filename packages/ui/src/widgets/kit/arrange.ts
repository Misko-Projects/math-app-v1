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

/**
 * Room a demo invite needs below its control at the bottom of the widget: Pip's hand hangs below
 * the control (kit `useInviteHand`), its tip just inside it: about 47 px of hand plus its 8 px bob
 * and 10 px edge, less the ~21 px a tray already has under its last row. Answer steps first look
 * for a layout that leaves this, so an invited card in the bottom row does not make it scroll.
 */
export const INVITE_ROOM_PX = 45;

/** `room` less the invite hand's room below the widget's content. */
export const withInviteRoom = (room: Size): Size => ({ w: room.w, h: room.h - INVITE_ROOM_PX });

/** The most a widget grows to use a big area (06 §2), and the scale every part is drawn at. */
export const MAX_ZOOM = 1.6;

/**
 * The largest zoom (1 … max) at which `sizeAt(zoom)` still fits `room`; 1 where the room is
 * unbounded (a story stage) or nothing larger fits.
 */
export function zoomFor(sizeAt: (zoom: number) => Size, room: Size, max = MAX_ZOOM): number {
  if (!Number.isFinite(room.w) || !Number.isFinite(room.h)) return 1;
  if (overflow(sizeAt(1), room) > 0) return 1;
  if (overflow(sizeAt(max), room) === 0) return max;
  let lo = 1;
  let hi = max;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (overflow(sizeAt(mid), room) === 0) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 100) / 100;
}

export interface Candidate<T> {
  item: T;
  /** Preference tier: a lower rank always wins when it fits. */
  rank: number;
  /** The candidate's box with every part drawn at `zoom` (gaps stay). */
  sizeAt: (zoom: number) => Size;
}

/**
 * Picks a layout: among the candidates that fit `room` at zoom 1, those of the best (lowest) rank
 * (candidates come in non-decreasing rank), and of those the one that, grown to fit `zoomRoom`,
 * covers the most of the room (06 §2: use the room; targets only ever grow). When none fits, the
 * one that overflows least, at zoom 1.
 */
export function pickByFill<T>(
  candidates: Iterable<Candidate<T>>,
  room: Size,
  zoomRoom: Size = room,
): { item: T; over: number; zoom: number } {
  let rank0: number | null = null;
  let best: { item: T; zoom: number; fill: number } | null = null;
  let least: { item: T; over: number } | null = null;
  const area = room.w * room.h;
  for (const c of candidates) {
    if (rank0 !== null && c.rank !== rank0) break;
    const over = overflow(c.sizeAt(1), room);
    if (over > 0) {
      if (!least || over < least.over) least = { item: c.item, over };
      continue;
    }
    rank0 = c.rank;
    const zoom = zoomFor(c.sizeAt, zoomRoom);
    const s = c.sizeAt(zoom);
    const fill = Number.isFinite(area) && area > 0 ? (s.w * s.h) / area : 0;
    if (!best || fill > best.fill + 1e-6) best = { item: c.item, zoom, fill };
  }
  if (best) return { item: best.item, over: 0, zoom: best.zoom };
  if (!least) throw new Error('no layout candidates');
  return { item: least.item, over: least.over, zoom: 1 };
}

/** A part's box drawn at `zoom`. */
export const zoomed = (s: Size | null, zoom: number): Size | null =>
  s ? { w: s.w * zoom, h: s.h * zoom } : null;

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
/**
 * A compact numeral card (NumberEntry `compact` tray, short areas): exactly the minimum target wide
 * and tall, or its content when taller (the 48 px numeral, 2 × 4 px padding, 2 × 3 px border).
 */
export const compactCardH = (targetMin: number) => Math.max(targetMin, 48 * 1.12 + 8 + 6);
/**
 * A compact card's width: the minimum target, or wide enough for its numerals (about 30 px a
 * digit at 48 px, plus 2 × 4 px padding and 2 × 3 px border): 80 in K, 74 for G1 two-digit cards.
 */
export const compactCardW = (digits: number, targetMin: number) =>
  Math.max(targetMin, Math.max(1, digits) * 30 + 14);
/**
 * The compact tray panel: 3 px top padding (a picked card's check badge may stand over the panel's top
 * edge, like a sticker), none below (the cards' own margin holds the ledge), 3 px borders.
 */
const COMPACT_PANEL_EDGES_Y = 3 + 0 + 2 * 3;
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
  compact = false,
): Size {
  const card = compact ? compactCardW(digits, targetMin) : numeralCardPx(digits, targetMin);
  const { rows } = trayGrid(n, columns);
  const row = compact ? compactCardH(targetMin) + gap + 6 : trayRowPx(targetMin, gap);
  return {
    w: columns * card + (columns - 1) * columnGap + TRAY_PANEL_EDGES_PX + 1,
    h: rows * row + (compact ? COMPACT_PANEL_EDGES_Y : TRAY_PANEL_EDGES_Y),
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
