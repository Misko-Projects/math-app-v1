/**
 * Pure geometry for the area-tiles widget (03 §5.5). Everything is in CSS px, measured from the
 * top-left of the region's bounding box (its first cell), one cell pitch `p` per grid square.
 * The mask is row-major '1'/'0', like the engine's (`packages/engine/src/formats/area-tiles.ts`).
 */

import type { AgeMode } from '../../tokens/tokens';
import type { Size } from '../kit/arrange';
import { planWork, type WorkPlan } from '../kit/gridWork';
import { type AskPlan, planAsk } from '../kit/twoStep';

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

// ---------- the plans (kit gridWork, kit twoStep) ----------

export type AreaMode = 'tile' | 'count' | 'multiply' | 'decompose' | 'partition';

export interface AreaShape {
  mode: AreaMode;
  region: Region;
  sideLabels: boolean;
}

/** Whether the child works on the region (lays tiles or draws lines). */
export const worked = (mode: AreaMode): boolean =>
  mode === 'tile' || mode === 'decompose' || mode === 'partition';

/** A unit square to read is never drawn smaller than this; one to work on, than WORK_CELL. */
export const MIN_CELL = 26;
export const MIN_WORK_CELL = 40;
export const MAX_CELL: Readonly<Record<AgeMode, number>> = { k: 144, 'g1-up': 144 };
/** The outline's room round the squares, each side. */
export const FRAME = 4;
/** The side-length labels: a row above the region and a column left of it. */
export const LABEL = { top: 48, left: 60 } as const;

const extraFor = (c: AreaShape): Size => ({
  w: 2 * FRAME + (c.sideLabels ? LABEL.left : 0),
  h: 2 * FRAME + (c.sideLabels ? LABEL.top : 0),
});

/** The step with the region and its pad (`room` is the kit's `buildRoom`). */
export function workPlan(c: AreaShape, room: Size, ageMode: AgeMode): WorkPlan {
  return planWork({
    room,
    ageMode,
    pad: { cols: 3, rows: 2 },
    head: false,
    cols: c.region.w,
    rows: c.region.h,
    extra: extraFor(c),
    minCell: MIN_WORK_CELL,
    maxCell: MAX_CELL[ageMode],
  });
}

/** The ask step's picture of the region in `box`: no pad, nothing to touch. */
export function picturePlan(c: AreaShape, box: Size, ageMode: AgeMode): WorkPlan {
  return planWork({
    room: box,
    ageMode,
    pad: { cols: 0, rows: 0 },
    head: false,
    cols: c.region.w,
    rows: c.region.h,
    extra: extraFor(c),
    minCell: MIN_CELL,
    maxCell: MAX_CELL[ageMode],
  });
}

/** The ask step: the answer control at full size, and the region as large as the rest allows. */
export function askPlanFor(
  c: AreaShape,
  max: number,
  room: Size,
  button: Size,
  ageMode: AgeMode,
): AskPlan {
  return planAsk({
    ageMode,
    max,
    button,
    actions: worked(c.mode) ? 2 : 1,
    room,
    pictureScore: (box) => {
      const p = picturePlan(c, box, ageMode);
      return p.fits ? p.cell : 0;
    },
  });
}

// ---------- the cursors the pad's arrows move ----------

export type Dir = 'up' | 'down' | 'left' | 'right';
const STEP: Record<Dir, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

/** The next region cell from (r, c) in a direction (past any notch); null at the region's end. */
export function nextCell(region: Region, r: number, c: number, dir: Dir): [number, number] | null {
  const [dr, dc] = STEP[dir];
  for (let k = 1; k < Math.max(region.w, region.h); k += 1) {
    const rr = r + dr * k;
    const cc = c + dc * k;
    if (rr < 0 || cc < 0 || rr >= region.h || cc >= region.w) return null;
    if (inRegion(region, rr, cc)) return [rr, cc];
  }
  return null;
}

export interface Line {
  dir: 'v' | 'h';
  at: number;
}

/** Whether the region has a line there (1 … w − 1 down, 1 … h − 1 across) that cuts it. */
export function lineCuts(region: Region, line: Line): boolean {
  return splitSegments(region, line.dir, line.at, 1).length > 0;
}

/** Every line that cuts the region. */
export function cutLines(region: Region): Line[] {
  const out: Line[] = [];
  for (let at = 1; at < region.w; at += 1) out.push({ dir: 'v', at });
  for (let at = 1; at < region.h; at += 1) out.push({ dir: 'h', at });
  return out.filter((l) => lineCuts(region, l));
}

/** Where the line cursor starts: the middle up-and-down line, else the middle one across. */
export function firstLine(region: Region): Line | null {
  const lines = cutLines(region);
  const pick = (dir: 'v' | 'h') => {
    const own = lines.filter((l) => l.dir === dir);
    return own[Math.floor((own.length - 1) / 2)] ?? null;
  };
  return pick('v') ?? pick('h');
}

/**
 * The line cursor after an arrow: left and right step through the up-and-down lines, up and down
 * through the lines across. From a line of the other kind the cursor turns to the nearest line of
 * the arrow's kind (`last` remembers where each kind was). Null: there is no such line.
 */
export function nextLine(
  region: Region,
  cur: Line,
  dir: Dir,
  last: { v: number | null; h: number | null },
): Line | null {
  const kind = dir === 'left' || dir === 'right' ? 'v' : 'h';
  const own = cutLines(region)
    .filter((l) => l.dir === kind)
    .map((l) => l.at);
  if (own.length === 0) return null;
  if (cur.dir !== kind) {
    const want = last[kind] ?? own[Math.floor((own.length - 1) / 2)];
    return { dir: kind, at: own.includes(want as number) ? (want as number) : (own[0] as number) };
  }
  const step = dir === 'left' || dir === 'up' ? -1 : 1;
  const i = own.indexOf(cur.at) + step;
  return i < 0 || i >= own.length ? null : { dir: kind, at: own[i] as number };
}

/**
 * The line a finger drew: a stroke that runs more down than across draws the up-and-down line
 * nearest to its middle, and the other way round. Null when the region has no such line.
 */
export function lineFromStroke(
  region: Region,
  from: { x: number; y: number },
  to: { x: number; y: number },
  cell: number,
): Line | null {
  const down = Math.abs(to.y - from.y) >= Math.abs(to.x - from.x);
  const lines = cutLines(region).filter((l) => l.dir === (down ? 'v' : 'h'));
  if (lines.length === 0) return null;
  const mid = down ? (from.x + to.x) / 2 : (from.y + to.y) / 2;
  let best = lines[0] as Line;
  for (const l of lines) {
    if (Math.abs(l.at * cell - mid) < Math.abs(best.at * cell - mid)) best = l;
  }
  return best;
}

/** The line nearest to a point (either kind). Null when the region has none. */
export function lineNear(region: Region, p: { x: number; y: number }, cell: number): Line | null {
  let best: { line: Line; d: number } | null = null;
  for (const line of cutLines(region)) {
    const d = Math.abs(line.at * cell - (line.dir === 'v' ? p.x : p.y));
    if (!best || d < best.d) best = { line, d };
  }
  return best?.line ?? null;
}

/** How many squares each row of the region has (top to bottom). */
export function rowCounts(region: Region): number[] {
  const out: number[] = [];
  for (let r = 0; r < region.h; r += 1) {
    out.push(region.mask.slice(r * region.w, (r + 1) * region.w).split('1').length - 1);
  }
  return out;
}
