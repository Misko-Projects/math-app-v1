/**
 * Pure geometry for the area-tiles widget (03 §5.5). Everything is in CSS px, measured from the
 * top-left of the region's bounding box (its first cell), one cell pitch `p` per grid square.
 * The mask is row-major '1'/'0', like the engine's (`packages/engine/src/formats/area-tiles.ts`).
 */

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Region {
  w: number;
  h: number;
  mask: string;
}

/** Whether cell (r, c) is part of the region (outside the box is never). */
export function inRegion({ w, h, mask }: Region, r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < h && c < w && mask[r * w + c] === '1';
}

/** The region's cells in reading order, as [r, c]. */
export function regionCells(region: Region): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < region.h; r += 1) {
    for (let c = 0; c < region.w; c += 1) if (inRegion(region, r, c)) out.push([r, c]);
  }
  return out;
}

/** Rows that hold at least one region cell. */
export function rowsWithCells(region: Region): number[] {
  const out: number[] = [];
  for (let r = 0; r < region.h; r += 1) {
    for (let c = 0; c < region.w; c += 1) {
      if (inRegion(region, r, c)) {
        out.push(r);
        break;
      }
    }
  }
  return out;
}

/**
 * Unit edges joined into maximal straight runs. `horizontal(k, i)` says whether the unit edge on
 * horizontal line k (y = k·p) between x = i·p and (i + 1)·p is drawn; `vertical(k, i)` likewise
 * for the vertical line x = k·p between y = i·p and (i + 1)·p.
 */
function joinRuns(
  region: Region,
  p: number,
  horizontal: (k: number, i: number) => boolean,
  vertical: (k: number, i: number) => boolean,
): Segment[] {
  const out: Segment[] = [];
  for (let k = 0; k <= region.h; k += 1) {
    let start = -1;
    for (let i = 0; i <= region.w; i += 1) {
      const on = i < region.w && horizontal(k, i);
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        out.push({ x1: start * p, y1: k * p, x2: i * p, y2: k * p });
        start = -1;
      }
    }
  }
  for (let k = 0; k <= region.w; k += 1) {
    let start = -1;
    for (let i = 0; i <= region.h; i += 1) {
      const on = i < region.h && vertical(k, i);
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        out.push({ x1: k * p, y1: start * p, x2: k * p, y2: i * p });
        start = -1;
      }
    }
  }
  return out;
}

/** The region's outline: every edge between a region cell and a non-region cell (or the box). */
export function outlineSegments(region: Region, p: number): Segment[] {
  const at = (r: number, c: number) => inRegion(region, r, c);
  return joinRuns(
    region,
    p,
    (k, i) => at(k - 1, i) !== at(k, i),
    (k, i) => at(i, k - 1) !== at(i, k),
  );
}

/** Grid lines inside the region: every edge between two region cells. */
export function innerGridSegments(region: Region, p: number): Segment[] {
  const at = (r: number, c: number) => inRegion(region, r, c);
  return joinRuns(
    region,
    p,
    (k, i) => at(k - 1, i) && at(k, i),
    (k, i) => at(i, k - 1) && at(i, k),
  );
}

/** Every inner grid line of the whole w × h box (the decimal grid's hundredths). */
export function boxGridSegments(w: number, h: number, p: number): Segment[] {
  const out: Segment[] = [];
  for (let c = 1; c < w; c += 1) out.push({ x1: c * p, y1: 0, x2: c * p, y2: h * p });
  for (let r = 1; r < h; r += 1) out.push({ x1: 0, y1: r * p, x2: w * p, y2: r * p });
  return out;
}

/**
 * Where a full-length split line shows: `dir` 'v' after column `at` (x = at·p) or 'h' after row
 * `at` (y = at·p), drawn only where it cuts the region: along edges with region cells on both sides
 * (an L's line stops at its notch, and never runs along the outline).
 */
export function splitSegments(region: Region, dir: 'v' | 'h', at: number, p: number): Segment[] {
  const touch = (r: number, c: number) => inRegion(region, r, c);
  return joinRuns(
    region,
    p,
    (k, i) => dir === 'h' && k === at && touch(k - 1, i) && touch(k, i),
    (k, i) => dir === 'v' && k === at && touch(i, k - 1) && touch(i, k),
  );
}

/** How many staggered lanes a line of `size` px buttons, one per `pitch`, needs to keep `gap`. */
export function lanesFor(pitch: number, size: number, gap: number): number {
  return Math.max(1, Math.ceil((size + gap) / Math.max(1, pitch)));
}

/** The width of `lanes` staggered lanes of `size` px buttons, `gap` apart, plus the lead gap. */
export function laneBand(lanes: number, size: number, gap: number): number {
  return gap + lanes * size + (lanes - 1) * gap;
}

export interface FitOptions {
  /** Room for the board's contents (tray + field), in px. */
  width: number;
  /** Room for the field (bands included), in px. */
  height: number;
  w: number;
  h: number;
  /** Smallest and largest pitch. */
  min: number;
  max: number;
  /** The age mode's hit-target size and the gap between targets (06 §4). */
  target: number;
  gap: number;
  /** The tile tray stands left of the field (tile mode). */
  tray: boolean;
  /** "Fill this row" buttons right of the region (tile mode). */
  rowButtons: boolean;
  /** Gap markers below (column lines) and right of (row lines) the region. */
  markers: boolean;
  /** Side-length labels above and left of the region; `labelW` is the left label's width. */
  labels: boolean;
  labelW: number;
}

export interface BoardLayout {
  pitch: number;
  /** The tray's width (0 without one); the stack tile is drawn at `stack` px. */
  trayW: number;
  stack: number;
  /** Staggered lanes for the row buttons and the column / row gap markers. */
  rowLanes: number;
  vLanes: number;
  hLanes: number;
  /** The region's top-left inside the field. */
  gridLeft: number;
  gridTop: number;
  fieldW: number;
  fieldH: number;
}

/** The space between the tray and the field. */
export const TRAY_GAP = 20;
/** The tray's padding and border, both sides. */
export const TRAY_EDGES = 28;

/** The layout at one pitch (no fitting). */
export function layoutAt(o: FitOptions, p: number): BoardLayout {
  const stack = o.tray ? Math.max(p, o.target) : 0;
  const trayW = o.tray ? stack + TRAY_EDGES : 0;
  const rowLanes = o.rowButtons ? lanesFor(p, o.target, o.gap) : 0;
  const vLanes = o.markers ? lanesFor(p, o.target, o.gap) : 0;
  const hLanes = vLanes;
  // Buttons centred on rows or lines may stand out past the region when cells are small: pad
  // the field so they stay inside it.
  const rowPad = o.rowButtons ? Math.max(0, Math.ceil((o.target - p) / 2)) : 0;
  const linePad = o.markers ? Math.max(0, Math.ceil(o.target / 2 - p)) : 0;
  const gridLeft = (o.labels ? o.labelW + o.gap : 0) + linePad;
  const gridTop = (o.labels ? o.target + o.gap : 0) + Math.max(rowPad, linePad);
  const right = o.rowButtons
    ? laneBand(rowLanes, o.target, o.gap)
    : o.markers
      ? laneBand(hLanes, o.target, o.gap)
      : 0;
  const bottom = o.markers ? laneBand(vLanes, o.target, o.gap) : 0;
  return {
    pitch: p,
    trayW,
    stack,
    rowLanes,
    vLanes,
    hLanes,
    gridLeft,
    gridTop,
    fieldW: gridLeft + o.w * p + right,
    fieldH: gridTop + o.h * p + Math.max(bottom, rowPad),
  };
}

/** The largest whole-pixel pitch whose layout fits the room (or the smallest allowed). */
export function fitBoard(o: FitOptions): BoardLayout {
  for (let p = Math.floor(o.max); p > o.min; p -= 1) {
    const l = layoutAt(o, p);
    const width = l.fieldW + (o.tray ? l.trayW + TRAY_GAP : 0);
    // The tray box (stack, the tiles peeking under it, padding) plus its label line above.
    const trayH = o.tray ? l.stack + TRAY_EDGES + 24 + 36 : 0;
    if (width <= o.width && l.fieldH <= o.height && trayH <= o.height) return l;
  }
  return layoutAt(o, o.min);
}

/** The next empty region cell after (r, c) in reading order, wrapping round; null if none. */
export function nextEmptyCell(
  region: Region,
  tiles: readonly boolean[],
  r: number,
  c: number,
): [number, number] | null {
  const cells = regionCells(region);
  const start = cells.findIndex(([cr, cc]) => cr === r && cc === c);
  for (let i = 1; i <= cells.length; i += 1) {
    const cell = cells[(start + i) % cells.length] as [number, number];
    if (!tiles[cell[0] * region.w + cell[1]]) return cell;
  }
  return null;
}

/** A side id from `label-side {side}`: the width side ('top') or the height side ('left'). */
export function sideOf(side: unknown): 'top' | 'left' | null {
  const s = String(side ?? '').toLowerCase();
  if (['top', 'bottom', 'w', 'width', 'cols'].includes(s)) return 'top';
  if (['left', 'right', 'h', 'height', 'rows'].includes(s)) return 'left';
  return null;
}
