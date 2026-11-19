// Fraction picture geometry (03 §5.5 fraction-cut, fraction-pick; the `fraction` StimulusSpec).
// Pure and exact: the fraction-cut model computes its response areas from these regions, and the
// UI draws exactly these regions, so a picture can never disagree with its numbers.
//
// Coordinates. A rectangle-like whole (rect, square, bar, loaf, grid) is the unit box [0, 1]²,
// x right and y down; the UI scales it to the shape's pixel box, and scaling keeps area shares.
// A circle's regions are sectors in degrees, clockwise from 12 o'clock (as the Half-Crab's
// FractionShell draws them). Region order is reading order: top to bottom, then left to right; a
// circle's sectors clockwise from 12 o'clock.

export type CutShape = 'circle' | 'rect' | 'square' | 'bar' | 'loaf' | 'grid';
export type PictureShape = 'circle' | 'rect' | 'bar' | 'loaf';

/** An axis-aligned part of a rectangle-like whole, in unit-box coordinates. */
export interface RectPart {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A sector of a circle: from `a0` to `a1` degrees clockwise from 12 o'clock (a0 < a1 ≤ a0 + 360). */
export interface SectorPart {
  a0: number;
  a1: number;
}

/**
 * A guided cut line (03 §5.5 "guided cuts snap to symmetric lines"): a full-length vertical (`v`,
 * at x) or horizontal (`h`, at y) line across a rectangle-like whole, or the radii a circle cut adds
 * (two for a diameter, one for a radius).
 */
export type GuidedLine =
  | { kind: 'v'; at: number }
  | { kind: 'h'; at: number }
  | { kind: 'radii'; angles: number[] };

const EPS = 1e-9;

/** Normalises an angle to [0, 360). */
export function normAngle(a: number): number {
  const r = a % 360;
  const n = r < 0 ? r + 360 : r;
  return Math.abs(n - 360) < EPS ? 0 : n;
}

/** Whether a grid of `cols × rows` cells can be cut into `parts` equal strips along cell lines. */
export function gridStrips(parts: number, gridSize: readonly [number, number]): 'v' | 'h' | null {
  const [cols, rows] = gridSize;
  if (cols % parts === 0) return 'v';
  if (rows % parts === 0) return 'h';
  return null;
}

/**
 * The guided cut lines for `parts` equal parts, numbered from 0 (the solution's `cut {line}`
 * indices; their count is `cutLines` in generators/frac/partition.ts). A circle: diameters for an
 * even count, radii for an odd one, from 12 o'clock. A rect or square in fourths: the cross
 * (vertical, then horizontal). A grid: strips along cell lines. Anything else: parallel vertical
 * lines (a strip, a loaf's slices).
 */
export function guidedLines(
  shape: CutShape,
  parts: number,
  gridSize?: readonly [number, number],
): GuidedLine[] {
  if (parts < 2) return [];
  if (shape === 'circle') {
    const step = 360 / parts;
    if (parts % 2 === 0) {
      return Array.from({ length: parts / 2 }, (_, i) => ({
        kind: 'radii' as const,
        angles: [i * step, i * step + 180],
      }));
    }
    return Array.from({ length: parts }, (_, i) => ({
      kind: 'radii' as const,
      angles: [i * step],
    }));
  }
  if ((shape === 'rect' || shape === 'square') && parts === 4) {
    return [
      { kind: 'v', at: 0.5 },
      { kind: 'h', at: 0.5 },
    ];
  }
  const dir = shape === 'grid' && gridSize ? (gridStrips(parts, gridSize) ?? 'v') : 'v';
  return Array.from({ length: parts - 1 }, (_, i) => ({ kind: dir, at: (i + 1) / parts }));
}

// ---------- rectangle-like wholes ----------

export const rectArea = (r: RectPart): number => (r.x1 - r.x0) * (r.y1 - r.y0);

/** Reading order: top to bottom, then left to right. */
export function sortRects<T extends RectPart>(rs: readonly T[]): T[] {
  return [...rs].sort((a, b) => (Math.abs(a.y0 - b.y0) > EPS ? a.y0 - b.y0 : a.x0 - b.x0));
}

/**
 * Splits every part the line crosses (or only `only`, a part index, for a cut inside one part).
 * Each new part keeps the rest of its part's fields (a shaded part's halves stay shaded).
 */
export function splitRects<T extends RectPart>(
  rs: readonly T[],
  dir: 'v' | 'h',
  at: number,
  only?: number,
): T[] {
  const out: T[] = [];
  rs.forEach((r, i) => {
    if (only !== undefined && i !== only) {
      out.push(r);
      return;
    }
    if (dir === 'v' && r.x0 + EPS < at && at < r.x1 - EPS) {
      out.push({ ...r, x1: at }, { ...r, x0: at });
    } else if (dir === 'h' && r.y0 + EPS < at && at < r.y1 - EPS) {
      out.push({ ...r, y1: at }, { ...r, y0: at });
    } else {
      out.push(r);
    }
  });
  return sortRects(out);
}

/** The index of the part that holds a point (x, y) of the unit box, or -1. */
export function rectAt(rs: readonly RectPart[], x: number, y: number): number {
  return rs.findIndex((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
}

// ---------- circles ----------

export const sectorArea = (s: SectorPart): number => (s.a1 - s.a0) / 360;

/**
 * The sectors a set of radii cut a circle into, clockwise from 12 o'clock. Fewer than two radii
 * leave the circle whole (one radius is only a slit).
 */
export function sectorsOf(radii: readonly number[]): SectorPart[] {
  // Exact angles (no rounding, so k·360/n stays exact); radii within 1e-6° are one radius.
  const rs: number[] = [];
  for (const a of radii.map(normAngle).sort((x, y) => x - y)) {
    if (rs.length === 0 || a - (rs[rs.length - 1] as number) > 1e-6) rs.push(a);
  }
  if (rs.length > 1 && (rs[0] as number) + 360 - (rs[rs.length - 1] as number) <= 1e-6) rs.pop();
  if (rs.length < 2) {
    const a0 = rs[0] ?? 0;
    return [{ a0, a1: a0 + 360 }];
  }
  const first = rs[0] as number;
  return rs.map((a0, i) => ({ a0, a1: i + 1 < rs.length ? (rs[i + 1] as number) : first + 360 }));
}

/** The index of the sector that holds an angle (clockwise from 12 o'clock), or -1. */
export function sectorAt(ss: readonly SectorPart[], angle: number): number {
  const a = normAngle(angle);
  return ss.findIndex((s) => (a >= s.a0 && a < s.a1) || (a + 360 >= s.a0 && a + 360 < s.a1));
}

// ---------- the static pictures (StimulusSpec `fraction`) ----------

/**
 * Relative sizes for parts that are not equal. Every prefix of two or more holds a part at least
 * 1.8 times another, so an unequal picture always looks unequal.
 */
export const UNEQUAL_WEIGHTS = [1.8, 1, 1.4, 0.6, 1.2, 0.8, 1.6, 0.7, 1.1, 0.9, 1.5, 0.65] as const;

/** Cumulative boundaries (0 < b < 1) of `parts` shares in the given weights. */
function boundaries(weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < weights.length - 1; i += 1) {
    acc += weights[i] as number;
    out.push(acc / total);
  }
  return out;
}

function unequalWeights(parts: number): number[] {
  return Array.from(
    { length: parts },
    (_, i) => UNEQUAL_WEIGHTS[i % UNEQUAL_WEIGHTS.length] as number,
  );
}

/** A circle's chord split: the line x = `offset` (unit radius, centre 0), left piece first. */
export interface ChordSplit {
  offset: number;
}

/** The off-centre chord used for two unequal "halves" of a circle (x = 0.42 of the radius). */
export const UNEQUAL_CHORD: ChordSplit = { offset: 0.42 };

/** Area share of the part of a unit circle left of the chord x = d (−1 < d < 1). */
export function chordLeftShare(d: number): number {
  // The segment right of x = d has area acos(d) − d·√(1 − d²); the disc has π.
  const right = Math.acos(d) - d * Math.sqrt(1 - d * d);
  return 1 - right / Math.PI;
}

export type FractionPicture =
  | { shape: 'circle'; kind: 'sectors'; sectors: SectorPart[] }
  | { shape: 'circle'; kind: 'chord'; chord: ChordSplit }
  | { shape: 'rect' | 'bar' | 'loaf'; kind: 'rects'; rects: RectPart[] };

/**
 * The parts of a `fraction` picture (03 §5.1). Equal parts are the guided cut of the whole, so
 * they are exactly equal by construction; parts that are not equal use UNEQUAL_WEIGHTS (a rect in
 * fourths: an off-centre cross; a circle in two: an off-centre chord), so they are visibly unequal
 * and there are still exactly `parts` of them. Parts are in reading order (circle: clockwise
 * from 12 o'clock); the first `shaded` are the filled ones.
 */
export function fractionPicture(
  shape: PictureShape,
  parts: number,
  equalParts: boolean,
): FractionPicture {
  const n = Math.max(1, Math.floor(parts));
  if (shape === 'circle') {
    if (n === 1) return { shape, kind: 'sectors', sectors: [{ a0: 0, a1: 360 }] };
    if (equalParts) {
      const step = 360 / n;
      return {
        shape,
        kind: 'sectors',
        sectors: Array.from({ length: n }, (_, i) => ({ a0: i * step, a1: (i + 1) * step })),
      };
    }
    if (n === 2) return { shape, kind: 'chord', chord: UNEQUAL_CHORD };
    const cuts = [0, ...boundaries(unequalWeights(n)).map((b) => b * 360)];
    return { shape, kind: 'sectors', sectors: sectorsOf(cuts) };
  }
  const whole: RectPart[] = [{ x0: 0, y0: 0, x1: 1, y1: 1 }];
  if (n === 1) return { shape, kind: 'rects', rects: whole };
  if (equalParts) {
    let rs = whole;
    for (const l of guidedLines(shape, n)) {
      if (l.kind !== 'radii') rs = splitRects(rs, l.kind, l.at);
    }
    return { shape, kind: 'rects', rects: rs };
  }
  if (shape === 'rect' && n === 4) {
    // An off-centre cross: four parts, every one a different size.
    return { shape, kind: 'rects', rects: splitRects(splitRects(whole, 'v', 0.36), 'h', 0.4) };
  }
  let rs = whole;
  for (const b of boundaries(unequalWeights(n))) rs = splitRects(rs, 'v', b);
  return { shape, kind: 'rects', rects: rs };
}

/** Each part's share of the whole's area, in part order (the chord split: left piece, right piece). */
export function pictureShares(p: FractionPicture): number[] {
  if (p.kind === 'sectors') return p.sectors.map(sectorArea);
  if (p.kind === 'chord') {
    const left = chordLeftShare(p.chord.offset);
    return [left, 1 - left];
  }
  return p.rects.map(rectArea);
}
