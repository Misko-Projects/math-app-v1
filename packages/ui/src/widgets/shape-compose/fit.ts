// Snapping for shape-compose fill-outline (pure; unit-tested in fit.test.ts). Geometry is the
// engine's (check/state/pieces.ts): x right, y up, one unit = one block side.
import {
  FILL_TOLERANCE,
  overlapArea,
  type Placement,
  placeCorners,
  polygonArea,
  type Vec,
} from '@number-island/engine';

export interface Fit {
  at: Vec;
  rot: number;
  /** The placed piece's centre (vertex average). */
  centre: Vec;
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;
const centreOf = (pts: readonly Vec[]): Vec => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];

/**
 * Every place a piece (`kind`, turned `rot`) fits: one of its corners on a corner of the outline or
 * of a placed piece, lying inside the outline (at most 2 % outside) and not overlapping a placed
 * piece (at most 2 % of the smaller one), the compose.fill limits. A piece only goes where a real
 * block could: it never overlaps another or hangs over the edge.
 */
export function fits(
  outline: readonly Vec[],
  placed: readonly Placement[],
  kind: string,
  rot: number,
): Fit[] {
  const shape = placeCorners({ kind, at: [0, 0], rot });
  if (!shape) return [];
  const a = polygonArea(shape);
  const placedPolys = placed.map((p) => placeCorners(p) ?? []);
  const anchors: Vec[] = [...outline, ...placedPolys.flat()];
  const seen = new Set<string>();
  const out: Fit[] = [];
  for (const anchor of anchors) {
    for (const corner of shape) {
      const at: Vec = [round(anchor[0] - corner[0]), round(anchor[1] - corner[1])];
      const key = `${at[0]},${at[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const poly = shape.map(([x, y]) => [x + at[0], y + at[1]] as Vec);
      const inside = overlapArea([...outline], poly);
      if (a - inside > FILL_TOLERANCE * a) continue;
      const clash = placedPolys.some(
        (q) => overlapArea(q, poly) > FILL_TOLERANCE * Math.min(a, polygonArea(q)),
      );
      if (clash) continue;
      out.push({ at, rot, centre: centreOf(poly) });
    }
  }
  return out;
}

/** The fit whose centre is nearest `point` (within `reach` units), or null. */
export function nearestFit(candidates: readonly Fit[], point: Vec, reach: number): Fit | null {
  let best: Fit | null = null;
  let d = reach;
  for (const f of candidates) {
    const dist = Math.hypot(f.centre[0] - point[0], f.centre[1] - point[1]);
    if (dist <= d) {
      best = f;
      d = dist;
    }
  }
  return best;
}

/** The outline's bounding box (units). */
export function bounds(points: readonly Vec[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Whether a point lies inside a polygon (ray casting; a point on an edge counts as inside). */
export function insidePolygon(at: Vec, polygon: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i] as Vec;
    const [xj, yj] = polygon[j] as Vec;
    const cross = (xj - xi) * (at[1] - yi) - (yj - yi) * (at[0] - xi);
    const within =
      Math.min(xi, xj) - 1e-9 <= at[0] &&
      at[0] <= Math.max(xi, xj) + 1e-9 &&
      Math.min(yi, yj) - 1e-9 <= at[1] &&
      at[1] <= Math.max(yi, yj) + 1e-9;
    if (Math.abs(cross) < 1e-9 && within) return true;
    if (yi > at[1] !== yj > at[1] && at[0] < ((xj - xi) * (at[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
