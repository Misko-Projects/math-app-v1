/**
 * Pure geometry for the array-build widget (03 §5.5). Everything is in CSS px, measured from the
 * top-left of the array's first cell. One cell pitch `p` holds one sprite drawn at SPRITE_FILL of
 * the pitch, so sprites never touch or overlap.
 */

/** A sprite fills this share of its cell; the rest is the gap between neighbours. */
export const SPRITE_FILL = 0.84;

export interface Dims {
  rows: number;
  cols: number;
}

export interface FitOptions {
  /** Room the array may use (after gutters), in px. */
  width: number;
  height: number;
  rows: number;
  cols: number;
  /** Smallest and largest pitch. The largest keeps a tiny array from turning into posters. */
  min: number;
  max: number;
}

/** The largest whole-pixel cell pitch that fits `rows × cols` cells in the box, clamped. */
export function fitPitch({ width, height, rows, cols, min, max }: FitOptions): number {
  const r = Math.max(1, rows);
  const c = Math.max(1, cols);
  const p = Math.floor(Math.min(width / c, height / r));
  return Math.max(min, Math.min(max, p));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The rectangle a corner drag makes: the corner moves with the finger (`dx`, `dy` from where the
 * drag started) and snaps to the nearest grid line. A drag always makes at least 1 × 1.
 */
export function rectFromDrag(start: Dims, dx: number, dy: number, pitch: number, max: Dims): Dims {
  const cols = Math.round((start.cols * pitch + dx) / pitch);
  const rows = Math.round((start.rows * pitch + dy) / pitch);
  return { rows: clamp(rows, 1, max.rows), cols: clamp(cols, 1, max.cols) };
}

/** Arrow keys move the corner one cell; from an empty board the first press makes 1 × 1. */
export function rectFromKey(current: Dims, key: string, max: Dims): Dims | null {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(key)) return null;
  if (current.rows === 0 || current.cols === 0) return { rows: 1, cols: 1 };
  const dc = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  const dr = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
  return {
    rows: clamp(current.rows + dr, 1, max.rows),
    cols: clamp(current.cols + dc, 1, max.cols),
  };
}

/** The rectangle that reaches cell (r, c) (0-based) from the top-left. */
export function rectToCell(r: number, c: number, max: Dims): Dims {
  return { rows: clamp(r + 1, 1, max.rows), cols: clamp(c + 1, 1, max.cols) };
}

/**
 * Left edge of column `c` when a split after column `split` opens a gap of `space` px. Columns
 * after the split move right by `space`; with no split the space waits at the right end.
 */
export function columnX(c: number, pitch: number, split: number | null, space: number): number {
  return c * pitch + (split !== null && c >= split ? space : 0);
}

/** Where the split line stands when it sits after column `at` (the middle of the opened gap). */
export function splitX(at: number, pitch: number, space: number): number {
  return at * pitch + space / 2;
}

/** The gap (1 … cols − 1) nearest to x, for a dragged split line. */
export function nearestGap(x: number, pitch: number, cols: number, space: number): number {
  return clamp(Math.round((x - space / 2) / pitch), 1, Math.max(1, cols - 1));
}

/** Arrow keys move the split line; from its home at the right edge, Left enters the array. */
export function splitFromKey(current: number | null, key: string, cols: number): number | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  if (current === null) return key === 'ArrowLeft' ? cols - 1 : null;
  const next = clamp(current + (key === 'ArrowLeft' ? -1 : 1), 1, cols - 1);
  return next === current ? null : next;
}

/** Thumbnail dot pitch so the longer side of an r × c rectangle fits `box` px (2–10 px). */
export function thumbPitch(r: number, c: number, box: number): number {
  return clamp(Math.floor(box / Math.max(r, c, 1)), 2, 10);
}

/** Intermediate rectangles for the demo's corner animation: one step per cell of the longer move. */
export function cornerPath(from: Dims, to: Dims): Dims[] {
  const start = from.rows === 0 || from.cols === 0 ? { rows: 1, cols: 1 } : from;
  const steps = Math.max(1, Math.abs(to.rows - start.rows), Math.abs(to.cols - start.cols));
  const out: Dims[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const f = i / steps;
    out.push({
      rows: Math.round(start.rows + (to.rows - start.rows) * f),
      cols: Math.round(start.cols + (to.cols - start.cols) * f),
    });
  }
  if (start !== from) out.unshift(start);
  return out;
}
