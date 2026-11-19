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
// - `answer {values: [a, b]}` names the fraction (`thenName`).

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

function cutRects(s: FractionCutState, dir: 'v' | 'h', at: number, only?: number) {
  const next = splitRects(s.rects, dir, at, only);
  return next.length === s.rects.length ? s : { ...s, rects: next };
}

function addRadii(s: FractionCutState, angles: readonly number[]): FractionCutState {
  let radii = s.radii;
  let sectors = s.sectors;
  for (const raw of angles) {
    const a = normAngle(raw);
    if (radii.some((r) => Math.abs(r - a) < 1e-6 || Math.abs(r - a) > 360 - 1e-6)) continue;
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
          return addRadii(s, a.args?.through === true ? [angle, angle + 180] : [angle]);
        }
        const dir = argString(a, 'dir');
        const raw = argNumber(a, 'at');
        if ((dir !== 'v' && dir !== 'h') || raw === undefined) return s;
        const at = snapAt(c, dir, raw);
        if (!(at > 0 && at < 1)) return s;
        const part = argNumber(a, 'part');
        if (part !== undefined && c.acceptNonCongruent) {
          if (!Number.isInteger(part) || part < 0 || part >= s.rects.length) return s;
          return cutRects(s, dir, at, part);
        }
        return cutRects(s, dir, at);
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
