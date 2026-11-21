// 03 §5.5 fraction-cut. The child cuts a whole (circle, rect, square, bar, loaf or a grid of
// cells) into parts and shades some of them; the response is `{ regions, shaded }` (+ `name`
// with `thenName`) for `fraction.cut` (engine README, "Sharing and fraction formats").
// - Guided cuts (`cutMode: 'guided'`): `cut {line}` cuts guided line `line` (`guidedLines` in
//   ./fraction-geometry: a circle's diameters or radii, a rect's cross for fourths, parallel
//   lines otherwise), numbered from 0. Cutting a line twice does nothing.
// - Free cuts (`cutMode: 'free'`) also take `cut {dir: 'v' | 'h', at}` (a full-length line at
//   `at` across the unit box, 0 < at < 1) on rectangle-like wholes, and `cut {angle}` (a radius
//   from the centre, degrees clockwise from 12 o'clock; `through: true` adds the diameter) on a
//   circle. A grid snaps every cut to its cell lines. With `acceptNonCongruent`, `cut {dir, at,
//   part}` cuts only part `part`, so equal areas of different shapes can be made (FRA.14, FRA.16);
//   without it, cuts always run the full length, so equal parts are always congruent (the
//   response holds areas only, so this is the widget rule the checker relies on).
// - `shade {part}` fills part `part` (reading order; a circle's sectors clockwise from 12
//   o'clock); `shade {part, off: true}` empties it. Cutting a filled part leaves both pieces
//   filled. `separate` and `stack-parts` toggle the exploded and stacked views (visual only).
// - `mend` takes one cut back where it is: `mend {line}` (a guided line), `mend {dir, at}` (the
//   straight cut at `at`: every two parts that meet along it and make a rectangle together join),
//   `mend {angle}` (that radius; `through: true` also the opposite one). A joined part is filled
//   only when every piece of it was. A guided line whose cut is gone can be cut again. A circle
//   mended down to one radius is whole again (the last radius, only a slit, goes too). `mend`
//   is what the child's touch on a cut sends; it is not an authored demo op (FORMAT_SUPPORT).
// - `answer {values: [a, b]}` names the fraction (`thenName`); a and b are whole numbers 0 to 99.
//
// Supported domain (the schema and `apply` enforce it): 2 to MAX_CUT_PARTS parts; `shade` at most
// `parts`; a grid of 1 to MAX_GRID_SIDE cells a side and at most 100 cells; a whole is never in
// more than MAX_CUT_PARTS parts (a cut that would make more does nothing); a free cut leaves no
// piece narrower than MIN_CUT_SPAN of the whole's side, or a sector under MIN_CUT_ANGLE degrees
// (both finer than any part `fraction.cut` accepts, so every checkable answer can be cut).

import {
  type AnswerSpec,
  fractionCutConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  type CutShape,
  type GuidedLine,
  gridStrips,
  guidedLines,
  normAngle,
  type RectPart,
  rectArea,
  type SectorPart,
  sectorArea,
  sectorAt,
  sectorsOf,
  sortRects,
  splitRects,
} from './fraction-geometry';
import {
  argNumber,
  argNumbers,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'fraction-cut'>;

export interface CutRect extends RectPart {
  shaded: boolean;
}
export interface CutSector extends SectorPart {
  shaded: boolean;
}

export interface FractionCutState extends FormatState<'fraction-cut'> {
  /** Rectangle-like wholes: the parts, in reading order (empty for a circle). */
  rects: CutRect[];
  /** Circles: the radii cut so far, degrees clockwise from 12 o'clock (empty otherwise). */
  radii: number[];
  /** Circles: the sectors, clockwise from 12 o'clock (one whole sector before two radii). */
  sectors: CutSector[];
  /** Guided line indices cut, in the order cut. */
  linesCut: number[];
  separated: boolean;
  stacked: boolean;
  /** The typed name [a, b] (`thenName`), or null. */
  name: [number, number] | null;
}

/** Most parts a whole is cut into (layout and narration limit). */
export const MAX_CUT_PARTS = 12;
/** Most cells along one side of a grid (a cell stays a finger wide in the smallest area). */
export const MAX_GRID_SIDE = 12;
/**
 * The narrowest piece a free cut may leave, as a share of the whole's side. A twelfth less the
 * checker's 3 % of area is 0.053 of the whole, so every part `fraction.cut` accepts is wider.
 */
export const MIN_CUT_SPAN = 1 / 24;
/** The narrowest sector a free radius may leave, in degrees (MIN_CUT_SPAN of a turn). */
export const MIN_CUT_ANGLE = 15;
/** The largest number a typed name holds (two digits on the pad). */
export const MAX_NAME_NUMBER = 99;

const isCircle = (c: Config) => c.shape === 'circle';

/** The config's guided lines (03 §5.5; their count is `cutLines` in generators/frac/partition.ts). */
export const cutGuides = (c: Config): GuidedLine[] => guidedLines(c.shape, c.parts, c.gridSize);

/** Each part's share of the whole, in part order. */
export function cutShares(s: FractionCutState): number[] {
  return isCircle(s.config) ? s.sectors.map(sectorArea) : s.rects.map(rectArea);
}

/** How many parts the whole is in now. */
export const partCount = (s: FractionCutState): number =>
  isCircle(s.config) ? s.sectors.length : s.rects.length;

/** Indices of the filled parts. */
export function shadedParts(s: FractionCutState): number[] {
  const parts: { shaded: boolean }[] = isCircle(s.config) ? s.sectors : s.rects;
  return parts.flatMap((p, i) => (p.shaded ? [i] : []));
}

const configSchema = fractionCutConfigSchema.superRefine((c, ctx) => {
  if (c.parts < 2 || c.parts > MAX_CUT_PARTS) {
    ctx.addIssue({
      code: 'custom',
      path: ['parts'],
      message: `a whole is cut into 2 to ${MAX_CUT_PARTS} parts`,
    });
  }
  if (c.shade !== undefined && c.shade > c.parts) {
    ctx.addIssue({ code: 'custom', path: ['shade'], message: 'shade at most every part' });
  }
  if (c.thenName && !(c.shade !== undefined && c.shade >= 1)) {
    ctx.addIssue({
      code: 'custom',
      path: ['thenName'],
      message: 'naming the fraction needs parts to shade',
    });
  }
  if ((c.shape === 'grid') !== (c.gridSize !== undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['gridSize'],
      message: 'a grid has a gridSize, and only a grid has one',
    });
  }
  if (c.shape === 'grid' && c.gridSize) {
    const [cols, rows] = c.gridSize;
    if (cols > MAX_GRID_SIDE || rows > MAX_GRID_SIDE) {
      ctx.addIssue({
        code: 'custom',
        path: ['gridSize'],
        message: `a grid has at most ${MAX_GRID_SIDE} cells a side`,
      });
    }
    if (cols * rows > 100) {
      ctx.addIssue({ code: 'custom', path: ['gridSize'], message: 'at most 100 cells' });
    }
    if ((cols * rows) % c.parts !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['gridSize'],
        message: 'the cells must share equally into the parts',
      });
    }
    if (c.cutMode === 'guided' && gridStrips(c.parts, c.gridSize) === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['gridSize'],
        message: 'guided grid cuts need the columns or rows to divide into the parts',
      });
    }
  }
});

const EPS = 1e-9;
const sameAngle = (r: number, a: number) => Math.abs(r - a) < 1e-6 || Math.abs(r - a) > 360 - 1e-6;

/** A free cut at `at` would leave a piece of some part it crosses narrower than MIN_CUT_SPAN. */
function leavesSliver(rects: readonly CutRect[], dir: 'v' | 'h', at: number, only?: number) {
  return rects.some((r, i) => {
    if (only !== undefined && i !== only) return false;
    const [lo, hi] = dir === 'v' ? [r.x0, r.x1] : [r.y0, r.y1];
    if (!(lo + EPS < at && at < hi - EPS)) return false;
    return at - lo < MIN_CUT_SPAN - EPS || hi - at < MIN_CUT_SPAN - EPS;
  });
}

function cutRects(s: FractionCutState, dir: 'v' | 'h', at: number, only?: number) {
  const next = splitRects(s.rects, dir, at, only);
  // Never more than MAX_CUT_PARTS parts: a cut that would make more does nothing.
  if (next.length === s.rects.length || next.length > MAX_CUT_PARTS) return s;
  return { ...s, rects: next };
}

/**
 * Joins every two parts that meet along the line at `at` and make a rectangle together. The
 * joined part is filled only when both pieces were.
 */
function mendRects(s: FractionCutState, dir: 'v' | 'h', at: number): FractionCutState {
  const partner = new Map<number, number>();
  const taken = new Set<number>();
  s.rects.forEach((a, i) => {
    if (taken.has(i) || Math.abs((dir === 'v' ? a.x1 : a.y1) - at) >= EPS) return;
    const j = s.rects.findIndex(
      (b, k) =>
        k !== i &&
        !taken.has(k) &&
        Math.abs((dir === 'v' ? b.x0 : b.y0) - at) < EPS &&
        (dir === 'v'
          ? Math.abs(b.y0 - a.y0) < EPS && Math.abs(b.y1 - a.y1) < EPS
          : Math.abs(b.x0 - a.x0) < EPS && Math.abs(b.x1 - a.x1) < EPS),
    );
    if (j < 0) return;
    partner.set(i, j);
    taken.add(i);
    taken.add(j);
  });
  if (partner.size === 0) return s;
  const rects = s.rects.flatMap((a, i) => {
    const j = partner.get(i);
    if (j === undefined) return taken.has(i) ? [] : [a];
    const b = s.rects[j] as CutRect;
    return [{ ...a, ...(dir === 'v' ? { x1: b.x1 } : { y1: b.y1 }), shaded: a.shaded && b.shaded }];
  });
  return { ...s, rects: sortRects(rects) };
}

/** Takes radii away; a sector that joins is filled only when every piece of it was. */
function mendRadii(s: FractionCutState, angles: readonly number[]): FractionCutState {
  const gone = angles.map(normAngle);
  let radii = s.radii.filter((r) => !gone.some((a) => sameAngle(r, a)));
  if (radii.length === s.radii.length) return s;
  // One radius left is only a slit in a whole circle: it goes too, so nothing unseen is left
  // behind for the next cut to meet (PR #100 review, s_1319069ce1c7).
  if (radii.length < 2) radii = [];
  const sectors = sectorsOf(radii).map((p) => {
    // The old sectors inside the new one (their middles lie in it).
    const inside = s.sectors.filter((q) => {
      const mid = (q.a0 + q.a1) / 2;
      return [mid - 360, mid, mid + 360].some((m) => m > p.a0 - 1e-6 && m < p.a1 + 1e-6);
    });
    return { ...p, shaded: inside.length > 0 && inside.every((q) => q.shaded) };
  });
  return { ...s, radii, sectors };
}

/** Whether a guided line's cut is still in the whole. */
function lineIsCut(s: FractionCutState, g: GuidedLine): boolean {
  if (g.kind === 'radii') {
    return g.angles.every((a) => s.radii.some((r) => sameAngle(r, normAngle(a))));
  }
  return s.rects.some((r) => Math.abs((g.kind === 'v' ? r.x0 : r.y0) - g.at) < EPS);
}

function addRadii(s: FractionCutState, angles: readonly number[], minAngle = 0): FractionCutState {
  let radii = s.radii;
  let sectors = s.sectors;
  for (const raw of angles) {
    const a = normAngle(raw);
    if (radii.some((r) => sameAngle(r, a))) continue;
    // Never more than MAX_CUT_PARTS sectors, and (free cuts) none thinner than `minAngle`.
    if (radii.length >= MAX_CUT_PARTS) continue;
    if (
      minAngle > 0 &&
      radii.some((r) => Math.min(Math.abs(r - a), 360 - Math.abs(r - a)) < minAngle - 1e-6)
    ) {
      continue;
    }
    const wasWhole = radii.length < 2;
    const shadedWhole = sectors[0]?.shaded ?? false;
    radii = [...radii, a].sort((x, y) => x - y);
    if (wasWhole) {
      sectors = sectorsOf(radii).map((p) => ({ ...p, shaded: shadedWhole }));
    } else {
      // Split the sector the new radius falls in; both pieces keep its fill.
      const at = sectorAt(sectors, a);
      const old = sectors[at] as CutSector;
      sectors = sectorsOf(radii).map((p) => {
        const keep = sectors.find(
          (q) => Math.abs(q.a0 - p.a0) < 1e-6 && Math.abs(q.a1 - p.a1) < 1e-6,
        );
        return { ...p, shaded: keep ? keep.shaded : old.shaded };
      });
    }
  }
  return radii === s.radii ? s : { ...s, radii, sectors };
}

function applyLine(s: FractionCutState, line: GuidedLine): FractionCutState {
  if (line.kind === 'radii') return addRadii(s, line.angles);
  return cutRects(s, line.kind, line.at);
}

/** Snaps a free cut position to the grid's cell lines (a grid), or keeps it (any other whole). */
function snapAt(c: Config, dir: 'v' | 'h', at: number): number {
  if (c.shape !== 'grid' || !c.gridSize) return at;
  const n = dir === 'v' ? c.gridSize[0] : c.gridSize[1];
  return Math.round(at * n) / n;
}

export const fractionCut: FormatModel<'fraction-cut', FractionCutState> = {
  format: 'fraction-cut',
  configSchema,
  features: {
    'parts.hard': { weight: 0.4, doc: 'parts odd or more than 4' },
    'shape.circle': { weight: 0.3, doc: 'a circle' },
    'cut.free': { weight: 0.5, doc: 'free cuts (no guide lines)' },
    'shade.nonUnit': { weight: 0.3, doc: 'more than one part to shade' },
    nonCongruent: { weight: 0.5, doc: 'equal areas of different shapes count' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    return {
      'parts.hard': c.parts % 2 === 1 || c.parts > 4 ? 1 : 0,
      'shape.circle': c.shape === 'circle' ? 1 : 0,
      'cut.free': c.cutMode === 'free' ? 1 : 0,
      'shade.nonUnit': (c.shade ?? 0) > 1 ? 1 : 0,
      nonCongruent: c.acceptNonCongruent ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    rects: isCircle(config) ? [] : [{ x0: 0, y0: 0, x1: 1, y1: 1, shaded: false }],
    radii: [],
    sectors: isCircle(config) ? [{ a0: 0, a1: 360, shaded: false }] : [],
    linesCut: [],
    separated: false,
    stacked: false,
    name: null,
  }),
  apply(s, a) {
    const c = s.config;
    switch (a.op) {
      case 'cut': {
        const line = argNumber(a, 'line');
        if (line !== undefined) {
          const guides = cutGuides(c);
          const g = guides[line];
          if (!Number.isInteger(line) || !g || s.linesCut.includes(line)) return s;
          return { ...applyLine(s, g), linesCut: [...s.linesCut, line] };
        }
        if (c.cutMode !== 'free') return s;
        if (isCircle(c)) {
          const angle = argNumber(a, 'angle');
          if (angle === undefined) return s;
          return addRadii(
            s,
            a.args?.through === true ? [angle, angle + 180] : [angle],
            MIN_CUT_ANGLE,
          );
        }
        const dir = argString(a, 'dir');
        const raw = argNumber(a, 'at');
        if ((dir !== 'v' && dir !== 'h') || raw === undefined) return s;
        const at = snapAt(c, dir, raw);
        if (!(at > 0 && at < 1)) return s;
        const part = argNumber(a, 'part');
        if (part !== undefined && c.acceptNonCongruent) {
          if (!Number.isInteger(part) || part < 0 || part >= s.rects.length) return s;
          if (leavesSliver(s.rects, dir, at, part)) return s;
          return cutRects(s, dir, at, part);
        }
        if (leavesSliver(s.rects, dir, at)) return s;
        return cutRects(s, dir, at);
      }
      case 'mend': {
        const guides = cutGuides(c);
        const line = argNumber(a, 'line');
        let next = s;
        if (line !== undefined) {
          const g = guides[line];
          if (!Number.isInteger(line) || !g || !s.linesCut.includes(line)) return s;
          next = g.kind === 'radii' ? mendRadii(s, g.angles) : mendRects(s, g.kind, g.at);
        } else if (isCircle(c)) {
          const angle = argNumber(a, 'angle');
          if (angle === undefined) return s;
          next = mendRadii(s, a.args?.through === true ? [angle, angle + 180] : [angle]);
        } else {
          const dir = argString(a, 'dir');
          const at = argNumber(a, 'at');
          if ((dir !== 'v' && dir !== 'h') || at === undefined) return s;
          next = mendRects(s, dir, at);
        }
        if (next === s) return s;
        // A guided line whose cut is gone can be cut again.
        const after = next;
        const linesCut = after.linesCut.filter((i) => {
          const g = guides[i];
          return g !== undefined && lineIsCut(after, g);
        });
        return { ...after, linesCut };
      }
      case 'shade': {
        const part = argNumber(a, 'part');
        const on = a.args?.off !== true;
        if (part === undefined || !Number.isInteger(part) || part < 0 || part >= partCount(s)) {
          return s;
        }
        if (isCircle(c)) {
          if ((s.sectors[part] as CutSector).shaded === on) return s;
          return {
            ...s,
            sectors: s.sectors.map((p, i) => (i === part ? { ...p, shaded: on } : p)),
          };
        }
        if ((s.rects[part] as CutRect).shaded === on) return s;
        return { ...s, rects: s.rects.map((p, i) => (i === part ? { ...p, shaded: on } : p)) };
      }
      case 'separate':
        return { ...s, separated: !s.separated, stacked: false };
      case 'stack-parts':
        return { ...s, stacked: !s.stacked, separated: false };
      case 'answer': {
        const v = argNumbers(a, 'values');
        if (v?.length !== 2) return s;
        if (!v.every((x) => Number.isInteger(x) && x >= 0 && x <= MAX_NAME_NUMBER)) return s;
        return { ...s, name: [v[0] as number, v[1] as number] };
      }
      default:
        throw new UnsupportedOpError('fraction-cut', a.op);
    }
  },
  toResponse(s) {
    // Nothing to check until the whole is cut (and, with thenName, the fraction is named).
    if (partCount(s) < 2) return null;
    if (s.config.thenName && s.name === null) return null;
    return {
      kind: 'state',
      value: {
        regions: cutShares(s),
        shaded: shadedParts(s),
        ...(s.config.thenName && s.name ? { name: [...s.name] } : {}),
      },
    };
  },
};

/** Whether a shape is drawn as a unit box (everything but the circle). */
export const isRectLike = (shape: CutShape): boolean => shape !== 'circle';
