// Piece geometry for shape-compose fill-outline (03 §5.5) and the compose.fill checker.
// Coordinates: x right, y up, one unit = one pattern-block side. A piece is placed with
// `{ kind, at: [x, y], rot }`: its canonical corners (corner 0 at the origin) are turned `rot`
// degrees counterclockwise about the origin, then moved so corner 0 is at `at`.
//
// Pieces: the pattern blocks (triangle, square, rhombus, trapezoid, hexagon; the triangle is
// equilateral and the rhombus is the 60° one) and the 2 × 1 rectangle of the `shapes` kit.

export type Vec = [number, number];

const H = Math.sqrt(3) / 2;

export const PIECE_CORNERS: Record<string, Vec[]> = {
  triangle: [
    [0, 0],
    [1, 0],
    [0.5, H],
  ],
  square: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ],
  rhombus: [
    [0, 0],
    [1, 0],
    [1.5, H],
    [0.5, H],
  ],
  trapezoid: [
    [0, 0],
    [2, 0],
    [1.5, H],
    [0.5, H],
  ],
  hexagon: [
    [0, 0],
    [1, 0],
    [1.5, H],
    [1, 2 * H],
    [0, 2 * H],
    [-0.5, H],
  ],
  rectangle: [
    [0, 0],
    [2, 0],
    [2, 1],
    [0, 1],
  ],
};

/** The smallest turn (degrees) that maps the piece onto itself. */
export const PIECE_SYMMETRY: Record<string, number> = {
  triangle: 120,
  square: 90,
  rhombus: 180,
  trapezoid: 360,
  hexagon: 60,
  rectangle: 180,
};

export interface Placement {
  kind: string;
  at: Vec;
  rot: number;
}

export function placeCorners(p: Placement): Vec[] | undefined {
  // Own keys only: a kind such as `constructor` is no piece.
  if (!Object.hasOwn(PIECE_CORNERS, p.kind)) return undefined;
  const corners = PIECE_CORNERS[p.kind] as Vec[];
  const a = (p.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return corners.map(([x, y]) => [p.at[0] + x * c - y * s, p.at[1] + x * s + y * c]);
}

export function signedArea(p: Vec[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i += 1) {
    const a = p[i] as Vec;
    const b = p[(i + 1) % p.length] as Vec;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export const area = (p: Vec[]): number => Math.abs(signedArea(p));

/**
 * Sutherland–Hodgman: the part of `subject` (any simple polygon) inside the convex polygon `clip`.
 * The area of the result is the area of the intersection.
 */
export function clipConvex(subject: Vec[], clip: Vec[]): Vec[] {
  const ccw = signedArea(clip) >= 0 ? clip : [...clip].reverse();
  let out = subject;
  for (let i = 0; i < ccw.length && out.length > 0; i += 1) {
    const a = ccw[i] as Vec;
    const b = ccw[(i + 1) % ccw.length] as Vec;
    const side = (p: Vec) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j += 1) {
      const p = input[j] as Vec;
      const q = input[(j + 1) % input.length] as Vec;
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return out;
}

export const overlapArea = (subject: Vec[], convex: Vec[]): number =>
  area(clipConvex(subject, convex));

/** Share of the outline a placement may leave uncovered, and of a piece that may overlap (03 §5.5). */
export const FILL_TOLERANCE = 0.02;

/**
 * Whether the placements cover the outline (03 §5.5 compose.fill): every piece inside it (at most 2%
 * of the piece outside), no overlap (all pairwise overlaps together at most 2% of the outline, and
 * each at most 2% of the smaller piece), and at most 2% of the outline uncovered.
 *
 * Coverage is the area of the union of the pieces inside the outline, not the sum of the pieces'
 * areas: pieces that each poke a little outside or overlap a little can add up to the outline's
 * area while leaving part of it bare. The union inside the outline is bounded below by
 * inclusion–exclusion, Σ |piece ∩ outline| − Σ |piece ∩ piece ∩ outline|, which is exact when no
 * three pieces share a point and otherwise only errs towards "not covered" (so a layout it accepts
 * is truly covered). Only the overlap inside the outline counts against coverage: overlap outside
 * it was never in Σ |piece ∩ outline|. The overlap limits read the whole overlap.
 */
export function coversOutline(outline: Vec[], placed: Placement[]): boolean {
  const polys: Vec[][] = [];
  for (const p of placed) {
    const corners = placeCorners(p);
    if (!corners) return false;
    polys.push(corners);
  }
  const whole = area(outline);
  if (whole <= 0) return false;
  let inside = 0;
  // piece ∩ outline. The outline may be concave, so it is the subject clipped by the convex
  // piece; the result can have zero-width seams but its area is the intersection's.
  const within: Vec[][] = [];
  for (const poly of polys) {
    const a = area(poly);
    const part = clipConvex(outline, poly);
    const w = area(part);
    if (a - w > FILL_TOLERANCE * a) return false;
    within.push(part);
    inside += w;
  }
  let overlap = 0;
  let overlapInside = 0;
  for (let i = 0; i < polys.length; i += 1) {
    for (let j = i + 1; j < polys.length; j += 1) {
      const a = polys[i] as Vec[];
      const b = polys[j] as Vec[];
      const o = overlapArea(a, b);
      if (o > FILL_TOLERANCE * Math.min(area(a), area(b))) return false;
      overlap += o;
      overlapInside += overlapArea(within[i] as Vec[], b);
    }
  }
  if (overlap > FILL_TOLERANCE * whole) return false;
  return inside - overlapInside >= (1 - FILL_TOLERANCE) * whole;
}
