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
 * Coverage is the exact area of the union of the pieces inside the outline (`unionInside`), not the
 * sum of the pieces' areas: pieces that each poke a little outside or overlap a little can add up
 * to the outline's area while leaving part of it bare. The overlap limits read the whole overlap.
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
  for (const poly of polys) {
    // piece ∩ outline. The outline may be concave, so it is the subject clipped by the convex
    // piece; the result can have zero-width seams but its area is the intersection's.
    const a = area(poly);
    if (a - area(clipConvex(outline, poly)) > FILL_TOLERANCE * a) return false;
  }
  let overlap = 0;
  for (let i = 0; i < polys.length; i += 1) {
    for (let j = i + 1; j < polys.length; j += 1) {
      const a = polys[i] as Vec[];
      const b = polys[j] as Vec[];
      const o = overlapArea(a, b);
      if (o > FILL_TOLERANCE * Math.min(area(a), area(b))) return false;
      overlap += o;
    }
  }
  if (overlap > FILL_TOLERANCE * whole) return false;
  return unionInside(outline, polys) >= (1 - FILL_TOLERANCE) * whole;
}

/**
 * The exact area of (p1 ∪ … ∪ pn) ∩ outline for convex pieces, by inclusion–exclusion over every
 * non-empty subset S: Σ (−1)^(|S|+1) |outline ∩ ⋂S|. Clipping the outline by each convex piece of S
 * in turn gives outline ∩ ⋂S (Sutherland–Hodgman keeps the area right for a concave subject). A
 * subset whose intersection is already empty is skipped together with all its supersets, so the
 * work follows the pieces that really overlap: a tiling (neighbours share only edges) tries each
 * pair once and goes no deeper, O(n²) clips for n pieces. `coversOutline` rejects heavy overlap
 * before calling this.
 */
export function unionInside(outline: Vec[], pieces: readonly Vec[][]): number {
  let total = 0;
  const visit = (from: number, clipped: Vec[], size: number): void => {
    for (let k = from; k < pieces.length; k += 1) {
      const next = clipConvex(clipped, pieces[k] as Vec[]);
      const a = area(next);
      if (a <= 1e-12) continue;
      total += size % 2 === 0 ? a : -a;
      visit(k + 1, next, size + 1);
    }
  };
  visit(0, outline, 0);
  return total;
}
