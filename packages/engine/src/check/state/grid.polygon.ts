// grid.polygon `{ require: { sides?, rightAngles?, equalSides?, kind? }, grid?: { cols, rows } }`
// (03 §5.5 shape-compose, draw-on-grid and build-sticks; GEO.02, GEO.09). Response
// `{ points: [x, y][] }`: the shape's corners in drawing order on the dot grid (integer dots,
// 0 … cols − 1 by 0 … rows − 1); the last side closes back to the first point. In build-sticks the
// points are where the sticks meet. Repeated points and corners on a straight line are merged, so a
// side made of two sticks is one side. Correct when the result is a closed, simple polygon (no
// crossing sides) that has every required attribute:
// - sides: the number of sides; rightAngles: square corners (inside angle 90°);
// - equalSides: true = all sides the same length, false = not all the same;
// - kind: triangle, quadrilateral, pentagon, hexagon, octagon by sides; square (4 equal sides, 4
//   square corners); rectangle (4 square corners, so a square is one too); rhombus (4 equal sides,
//   so a square is one too); kite (two pairs of equal sides next to each other); trapezoid (exactly
//   one pair of parallel sides).
// Any polygon with those attributes is correct (state equivalence).
import type { ShapeKind } from '@number-island/shared';
import { num, type StateChecker } from './types';

export type Pt = [number, number];

export interface PolygonRequire {
  sides?: number;
  rightAngles?: number;
  equalSides?: boolean;
  kind?: ShapeKind;
}

export interface PolygonInfo {
  points: Pt[];
  sides: number;
  rightAngles: number;
  equalSides: boolean;
  parallelPairs: number;
  kinds: ShapeKind[];
}

const cross = (o: Pt, a: Pt, b: Pt): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const len2 = (a: Pt, b: Pt): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Twice the signed area (positive = counterclockwise in x-right, y-up axes). */
export function area2(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i += 1) {
    const a = p[i] as Pt;
    const b = p[(i + 1) % p.length] as Pt;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}

/** Drops repeated points and corners on a straight line (a side drawn in two strokes). */
export function simplify(points: Pt[]): Pt[] {
  const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
  let p: Pt[] = [];
  for (const x of points) {
    const last = p[p.length - 1];
    if (!last || !same(last, x)) p.push(x);
  }
  while (p.length > 1 && same(p[0] as Pt, p[p.length - 1] as Pt)) p.pop();
  for (let changed = true; changed && p.length >= 3; ) {
    changed = false;
    for (let i = 0; i < p.length; i += 1) {
      const a = p[(i - 1 + p.length) % p.length] as Pt;
      const b = p[i] as Pt;
      const c = p[(i + 1) % p.length] as Pt;
      // Collinear and going on in the same direction (not doubling back).
      if (
        cross(a, b, c) === 0 &&
        (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0
      ) {
        p = [...p.slice(0, i), ...p.slice(i + 1)];
        changed = true;
        break;
      }
    }
  }
  return p;
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
    return true;
  const on = (p: Pt, q: Pt, r: Pt) =>
    cross(p, q, r) === 0 &&
    Math.min(p[0], q[0]) <= r[0] &&
    r[0] <= Math.max(p[0], q[0]) &&
    Math.min(p[1], q[1]) <= r[1] &&
    r[1] <= Math.max(p[1], q[1]);
  return on(c, d, a) || on(c, d, b) || on(a, b, c) || on(a, b, d);
}

/** A closed simple polygon's attributes, or null when the points do not make one. */
export function polygonInfo(raw: Pt[]): PolygonInfo | null {
  const p = simplify(raw);
  const n = p.length;
  if (n < 3 || area2(p) === 0) return null;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // neighbouring sides share a corner
      if (segmentsCross(p[i] as Pt, p[(i + 1) % n] as Pt, p[j] as Pt, p[(j + 1) % n] as Pt))
        return null;
    }
  }
  // Every point appears once (no figure-eight through one dot).
  if (new Set(p.map((x) => `${x[0]},${x[1]}`)).size !== n) return null;
  const orient = Math.sign(area2(p));
  let rightAngles = 0;
  for (let i = 0; i < n; i += 1) {
    const a = p[(i - 1 + n) % n] as Pt;
    const b = p[i] as Pt;
    const c = p[(i + 1) % n] as Pt;
    const dot = (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]);
    if (dot === 0 && Math.sign(cross(a, b, c)) === orient) rightAngles += 1;
  }
  const lens = p.map((x, i) => len2(x, p[(i + 1) % n] as Pt));
  const equalSides = lens.every((l) => l === lens[0]);
  const dir = (i: number): Pt => {
    const a = p[i % n] as Pt;
    const b = p[(i + 1) % n] as Pt;
    return [b[0] - a[0], b[1] - a[1]];
  };
  let parallelPairs = 0;
  if (n === 4) {
    for (const [i, j] of [
      [0, 2],
      [1, 3],
    ] as const) {
      const u = dir(i);
      const v = dir(j);
      if (u[0] * v[1] - u[1] * v[0] === 0) parallelPairs += 1;
    }
  }
  const kinds: ShapeKind[] = [];
  const byCount: Partial<Record<number, ShapeKind>> = {
    3: 'triangle',
    4: 'quadrilateral',
    5: 'pentagon',
    6: 'hexagon',
    8: 'octagon',
  };
  if (byCount[n]) kinds.push(byCount[n] as ShapeKind);
  if (n === 4) {
    const [a, b, c, d] = lens as [number, number, number, number];
    if (rightAngles === 4) kinds.push('rectangle');
    if (equalSides) kinds.push('rhombus');
    if (rightAngles === 4 && equalSides) kinds.push('square');
    if (parallelPairs === 1) kinds.push('trapezoid');
    if ((a === b && c === d) || (b === c && d === a)) kinds.push('kite');
  }
  return { points: p, sides: n, rightAngles, equalSides, parallelPairs, kinds };
}

export function meetsRequire(info: PolygonInfo, req: PolygonRequire): boolean {
  if (req.sides !== undefined && info.sides !== req.sides) return false;
  if (req.rightAngles !== undefined && info.rightAngles !== req.rightAngles) return false;
  if (req.equalSides !== undefined && info.equalSides !== req.equalSides) return false;
  if (req.kind !== undefined && !info.kinds.includes(req.kind)) return false;
  return true;
}

const points = (v: unknown): Pt[] | undefined =>
  Array.isArray(v) &&
  v.every((x) => Array.isArray(x) && x.length === 2 && x.every((c) => Number.isInteger(c)))
    ? (v as Pt[])
    : undefined;

export const gridPolygon: StateChecker = {
  id: 'grid.polygon',
  check(target, value) {
    const req = target.require;
    if (!req || typeof req !== 'object' || Array.isArray(req)) return false;
    const pts = points(value.points);
    if (!pts) return false;
    const grid = target.grid as Record<string, unknown> | undefined;
    if (grid && typeof grid === 'object') {
      const cols = num(grid.cols);
      const rows = num(grid.rows);
      if (cols === undefined || rows === undefined) return false;
      if (pts.some(([x, y]) => x < 0 || y < 0 || x >= cols || y >= rows)) return false;
    }
    const info = polygonInfo(pts);
    return info !== null && meetsRequire(info, req as PolygonRequire);
  },
};
