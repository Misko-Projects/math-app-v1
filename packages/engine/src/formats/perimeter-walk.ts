// 03 §5.5 perimeter-walk (grade 3: MEA.06, MEA.11, MEA.14). A fence around a shape; a Pebbling
// walks it side by side as the child taps each side. `polygon.sides` go clockwise from the top
// left corner; `null` is the side the child finds.
// - `rect`: [top, right, bottom, left]; opposite sides are equal.
// - `L`: six sides [W, h1, w2, h2, W − w2, h1 + h2]: across the top, down the right, in to the
//   notch, down again, back along the bottom, up the left side.
// - `poly`: any convex polygon, drawn with its corners on a circle (`polygonPoints`).
// - `total` answers the sum of the sides (`number`); `missing-side` the null side, from the given
//   `perimeter` (`number`); both are entered with `answer {value}`.
// - `design` (MEA.14): the child builds a rectangle on the grid (`answer {values: [w, h]}`);
//   answers state `{ w, h }` (`rect.perimeterArea`). `perimeter` and `area` are the constraints;
//   `polygon.sides`, when given, is the rectangle to compare with (`differentFrom`).
// Ops: `walk-side {index}` (the Pebbling walks that side), `add-label {index}` (its number shows),
// `trace` (the whole fence).

import {
  type AnswerSpec,
  perimeterWalkConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  argNumber,
  argNumbers,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'perimeter-walk'>;
export type Pt = [number, number];

export interface PerimeterWalkState extends FormatState<'perimeter-walk'> {
  /** Sides the Pebbling has walked, in order. */
  walked: number[];
  /** Sides whose number shows. */
  labelled: number[];
  value: number | null;
  /** design: the rectangle the child built. */
  size: { w: number; h: number } | null;
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * Every side's length, the missing one worked out: a rectangle's from its opposite side, an L's
 * from the sides that close it, any other shape's from the perimeter. Null when the config does
 * not say (design without a reference, a missing side with no perimeter).
 */
export function resolvedSides(c: Config): number[] | null {
  const s = c.polygon.sides;
  const gap = s.indexOf(null);
  if (gap < 0) return s.length > 0 ? (s as number[]) : null;
  if (s.indexOf(null, gap + 1) >= 0) return null;
  const out = [...s] as number[];
  const at = (i: number) => s[i] ?? null;
  let v: number | null = null;
  if (c.polygon.shape === 'rect' && s.length === 4) v = at((gap + 2) % 4);
  else if (c.polygon.shape === 'L' && s.length === 6) {
    // s0 = s2 + s4 and s5 = s1 + s3.
    // Every other side is known (one gap), so the closing pair always resolves.
    const k = (i: number) => at(i) ?? 0;
    const pick = [k(2) + k(4), k(5) - k(3), k(0) - k(4), k(5) - k(1), k(0) - k(2), k(1) + k(3)];
    v = pick[gap] ?? null;
  }
  if (v === null && c.perimeter !== undefined) {
    v = c.perimeter - sum(s.filter((x): x is number => x !== null));
  }
  if (v === null) return null;
  out[gap] = v;
  return out;
}

/**
 * The corners of a convex polygon with these sides, all on one circle (x right, y down), side 0
 * across the top. With radius R a side s subtends 2·asin(s / 2R). When the centre is inside, the
 * angles add up to a full turn; when it is outside (one long side), the other sides together
 * subtend the long side's angle, and the long side closes the polygon going back.
 */
export function cyclicPolygon(sides: readonly number[]): Pt[] {
  const longest = Math.max(...sides);
  const k = sides.indexOf(longest);
  const angle = (r: number, s: number) => 2 * Math.asin(Math.min(1, s / (2 * r)));
  const inside = sum(sides.map((s) => angle(longest / 2, s))) >= 2 * Math.PI;
  // f falls as r grows when the centre is inside and rises when it is outside: bisect its zero.
  const f = (r: number) =>
    inside
      ? sum(sides.map((s) => angle(r, s))) - 2 * Math.PI
      : sum(sides.map((s, i) => (i === k ? -angle(r, s) : angle(r, s))));
  let lo = longest / 2;
  let hi = sum(sides) * 2;
  // A narrow polygon's circle can be far larger than its perimeter ([999, 500, 500] has R ≈ 5592):
  // widen the bracket until it holds the root (f changes sign between lo and hi).
  for (let i = 0; i < 200 && f(hi) > 0 === inside; i += 1) hi *= 2;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0 === inside) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  const turns = sides.map((s, i) => (!inside && i === k ? -angle(r, s) : angle(r, s)));
  let theta = -Math.PI / 2 - (turns[0] as number) / 2;
  const pts: Pt[] = [];
  for (const t of turns) {
    pts.push([r * Math.cos(theta), r * Math.sin(theta)]);
    theta += t;
  }
  return normalise(pts);
}

/** Shifts points so the smallest x and y are 0. */
function normalise(pts: Pt[]): Pt[] {
  const minX = Math.min(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  return pts.map(([x, y]) => [x - minX, y - minY]);
}

/**
 * The corners of the fence in side units (x right, y down), clockwise from the top left, corner i
 * starting side i. Drawn to scale: every side is exactly its length.
 */
export function polygonPoints(c: Config): Pt[] | null {
  const s = resolvedSides(c);
  if (!s || s.some((x) => !(x > 0))) return null;
  if (c.polygon.shape === 'rect' && s.length === 4) {
    const [w, h] = s as [number, number];
    return [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ];
  }
  if (c.polygon.shape === 'L' && s.length === 6) {
    const [a, b, c2, d] = s as [number, number, number, number];
    return [
      [0, 0],
      [a, 0],
      [a, b],
      [a - c2, b],
      [a - c2, b + d],
      [0, b + d],
    ];
  }
  return cyclicPolygon(s);
}

const dist = (p: Pt, q: Pt): number => Math.hypot(q[0] - p[0], q[1] - p[1]);

/** Whether the drawn polygon's sides match the stated lengths (maths truth for the picture). */
export function sidesMatch(c: Config, pts: readonly Pt[], eps = 1e-6): boolean {
  const s = resolvedSides(c);
  if (!s || pts.length !== s.length) return false;
  return s.every(
    (len, i) => Math.abs(dist(pts[i] as Pt, pts[(i + 1) % pts.length] as Pt) - len) < eps,
  );
}

/** Every rectangle (w ≤ h first, then turned) meeting design constraints, up to `max` per side. */
export function designRectangles(c: Config, max = 50): { w: number; h: number }[] {
  const out: { w: number; h: number }[] = [];
  for (let w = 1; w <= max; w += 1) {
    for (let h = 1; h <= max; h += 1) {
      if (c.perimeter !== undefined && 2 * (w + h) !== c.perimeter) continue;
      if (c.area !== undefined && w * h !== c.area) continue;
      const ref = c.polygon.sides;
      if (ref.length === 4 && ((ref[0] === w && ref[1] === h) || (ref[0] === h && ref[1] === w)))
        continue;
      out.push({ w, h });
    }
  }
  return out;
}

/**
 * The supported domain, inside what the widget's stress stories draw at 906 × 373 (a 20 × 15
 * garden, an L with sides to 20); no K–1 template uses the format yet.
 */
/** Sides of a figure (an L has 6). */
export const PW_SIDES_MAX = 6;
/** A side's length in units. */
export const PW_SIDE_MAX = 20;
/** The largest perimeter: every side at its bound. */
export const PW_PERIMETER_MAX = PW_SIDES_MAX * PW_SIDE_MAX;
/** Design: the longest side of any rectangle a child may have to build (the grid's columns). */
export const PW_DESIGN_SIDE_MAX = 12;
/** Design: the target perimeter and area a grid of that size holds. */
export const PW_DESIGN_PERIMETER_MAX = 4 * PW_DESIGN_SIDE_MAX;
export const PW_DESIGN_AREA_MAX = 36;

/** Where a config leaves the supported domain: every number and every list has a bound. */
export function domainIssues(c: Config): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  const s = c.polygon.sides;
  if (s.length > PW_SIDES_MAX) {
    out.push({
      path: ['polygon', 'sides'],
      message: `a figure has at most ${PW_SIDES_MAX} sides; got ${s.length}`,
    });
  }
  const design = c.mode === 'design';
  const sideMax = design ? PW_DESIGN_SIDE_MAX : PW_SIDE_MAX;
  s.forEach((x, i) => {
    if (x !== null && !(x <= sideMax)) {
      out.push({
        path: ['polygon', 'sides', i],
        message: `a side is at most ${sideMax} units long; got ${x}`,
      });
    }
    if (x !== null && c.polygon.grid && !Number.isInteger(x)) {
      out.push({
        path: ['polygon', 'sides', i],
        message: `a side on the grid is a whole number of squares; got ${x}`,
      });
    }
  });
  const perimeterMax = design ? PW_DESIGN_PERIMETER_MAX : PW_PERIMETER_MAX;
  if (c.perimeter !== undefined && !(c.perimeter >= 1 && c.perimeter <= perimeterMax)) {
    out.push({
      path: ['perimeter'],
      message: `the perimeter is from 1 to ${perimeterMax}; got ${c.perimeter}`,
    });
  }
  if (c.area !== undefined) {
    if (!design) out.push({ path: ['area'], message: 'only design gives an area' });
    else if (!(Number.isInteger(c.area) && c.area >= 1 && c.area <= PW_DESIGN_AREA_MAX)) {
      out.push({
        path: ['area'],
        message: `the area is a whole number from 1 to ${PW_DESIGN_AREA_MAX}; got ${c.area}`,
      });
    }
  }
  return out;
}

const configSchema = perimeterWalkConfigSchema.superRefine((c, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  const domain = domainIssues(c);
  for (const d of domain) ctx.addIssue({ code: 'custom', ...d });
  if (domain.length > 0) return;
  const s = c.polygon.sides;
  const known = s.filter((x): x is number => x !== null);
  const nulls = s.length - known.length;
  if (known.some((x) => !(x > 0))) issue(['polygon', 'sides'], 'sides are positive');
  const count: Record<string, number | null> = { rect: 4, L: 6, poly: null };
  const want = count[c.polygon.shape];
  if (c.mode === 'design') {
    if (c.polygon.shape !== 'rect') issue(['polygon', 'shape'], 'design builds a rectangle');
    if (!(s.length === 0 || (s.length === 4 && nulls === 0))) {
      issue(['polygon', 'sides'], 'design compares with a whole rectangle, or none');
    }
    if (c.perimeter === undefined && c.area === undefined) {
      issue(['perimeter'], 'design needs a perimeter or an area');
    } else {
      const options = designRectangles(c);
      if (options.length === 0) issue(['perimeter'], 'no rectangle meets the constraints');
      else if (options.some((r) => Math.max(r.w, r.h) > PW_DESIGN_SIDE_MAX)) {
        issue(
          ['perimeter'],
          `every rectangle that meets the constraints is at most ${PW_DESIGN_SIDE_MAX} squares a side`,
        );
      }
    }
  } else {
    if (want !== null && s.length !== want) {
      issue(['polygon', 'sides'], `a ${c.polygon.shape} has ${want} sides`);
    }
    if (s.length < 3) issue(['polygon', 'sides'], 'three or more sides');
    if (c.mode === 'total' && nulls > 0) issue(['polygon', 'sides'], 'total shows every side');
    if (c.mode === 'missing-side') {
      if (nulls !== 1) issue(['polygon', 'sides'], 'exactly one side is missing');
      if (c.perimeter === undefined) issue(['perimeter'], 'missing-side gives the perimeter');
    }
    const r = resolvedSides(c);
    if (r) {
      if (r.some((x) => !(x > 0))) issue(['polygon', 'sides'], 'the missing side is positive');
      else if (c.perimeter !== undefined && sum(r) !== c.perimeter) {
        issue(['perimeter'], 'the sides add up to the perimeter');
      }
      if (c.polygon.shape === 'rect' && r.length === 4 && (r[0] !== r[2] || r[1] !== r[3])) {
        issue(['polygon', 'sides'], 'opposite sides of a rectangle are equal');
      }
      if (c.polygon.shape === 'L' && r.length === 6) {
        const [a, b, c2, d, e, f] = r as number[];
        if (a !== (c2 as number) + (e as number) || f !== (b as number) + (d as number)) {
          issue(['polygon', 'sides'], 'the L closes (W = w2 + bottom, left = h1 + h2)');
        }
      }
      if (c.polygon.shape === 'poly' && 2 * Math.max(...r) >= sum(r)) {
        issue(['polygon', 'sides'], 'each side is shorter than the others together');
      }
    }
  }
});

export const perimeterWalk: FormatModel<'perimeter-walk', PerimeterWalkState> = {
  format: 'perimeter-walk',
  configSchema,
  features: {
    sides: { weight: 0.15, doc: 'sides − 4' },
    missing: { weight: 0.7, doc: 'find a missing side from the perimeter' },
    'grid.off': { weight: 0.3, doc: 'no grid under the shape' },
    design: { weight: 0.6, doc: 'design a rectangle to fit a perimeter or area' },
    'side.over10': { weight: 0.2, doc: 'a side is longer than 10' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const known = c.polygon.sides.filter((x): x is number => x !== null);
    return {
      sides: c.mode === 'design' ? 0 : Math.max(0, c.polygon.sides.length - 4),
      missing: c.mode === 'missing-side' ? 1 : 0,
      'grid.off': c.polygon.grid ? 0 : 1,
      design: c.mode === 'design' ? 1 : 0,
      'side.over10': known.some((x) => x > 10) ? 1 : 0,
    };
  },
  initialState: (config) => ({ config, walked: [], labelled: [], value: null, size: null }),
  apply(s, a) {
    const n = s.config.polygon.sides.length;
    const index = argNumber(a, 'index');
    const valid = index !== undefined && Number.isInteger(index) && index >= 0 && index < n;
    switch (a.op) {
      case 'walk-side':
        if (!valid || s.walked.includes(index)) return s;
        return { ...s, walked: [...s.walked, index] };
      case 'add-label':
        if (!valid || s.labelled.includes(index)) return s;
        return { ...s, labelled: [...s.labelled, index] };
      case 'trace':
        return { ...s, walked: Array.from({ length: n }, (_, i) => i) };
      case 'answer': {
        if (s.config.mode === 'design') {
          const v = argNumbers(a, 'values');
          if (v?.length !== 2) return s;
          const [w, h] = v as [number, number];
          if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) return s;
          return { ...s, size: { w, h } };
        }
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('perimeter-walk', a.op);
    }
  },
  toResponse(s) {
    if (s.config.mode === 'design') {
      return s.size ? { kind: 'state', value: { w: s.size.w, h: s.size.h } } : null;
    }
    return s.value === null ? null : { kind: 'number', value: s.value };
  },
};
