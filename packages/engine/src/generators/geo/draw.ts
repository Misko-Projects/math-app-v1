// geo.draw (03 §5.6): draw or build a shape with given attributes (GEO.02, GEO.09). Formats:
// shape-compose (draw-on-grid with `tool: dots`, build-sticks with `tool: sticks`; checked by
// grid.polygon) and shape-sort (find every shape that has the attributes; select.exactSet).
//
// The requirement is `kind` (a shape name, or `any`), `sides` (0 = not required), `rightAngles`
// (−1 = not required) and `equalSides` (true = all sides equal is required). Until the shape-compose
// and shape-sort format models land, the generator emits their features itself.

import type { LessonStep, ResponseValue, ShapeKind, WidgetAction } from '@number-island/shared';
import {
  meetsRequire,
  type PolygonRequire,
  type Pt,
  polygonInfo,
} from '../../check/state/grid.polygon';
import { SC_GRID_COLS_MAX, SC_GRID_ROWS_MAX } from '../../formats/shape-compose';
import { asNum, asStr, correctFromAnswer, finish, pickVars, sampleAll } from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import { distinctKinds, NEAR_MISS, SHAPE_PROPS, shapeCard } from './shapes';

const KINDS = [
  'any',
  'triangle',
  'square',
  'rectangle',
  'rhombus',
  'trapezoid',
  'kite',
  'quadrilateral',
  'pentagon',
  'hexagon',
  'octagon',
] as const;

/** Lattice polygons the worked solution can draw (corners in drawing order, x right, y down). */
const EXAMPLES: Pt[][] = [
  // Ordered so a request gets its own shape first (a rectangle request draws a rectangle, not a
  // square, although a square is one too). The three-row shapes come first: K and G1 grids are
  // 3 rows high (wide grids: dot targets 80 px apart need the width, not the height).
  [
    [0, 0],
    [4, 0],
    [1, 2],
  ], // triangle, no square corner (3 rows)
  [
    [0, 0],
    [3, 0],
    [0, 2],
  ], // right triangle (3 rows)
  [
    [0, 0],
    [4, 0],
    [4, 2],
    [0, 2],
  ], // rectangle (3 rows)
  [
    [0, 0],
    [4, 0],
    [2, 2],
    [0, 2],
  ], // two square corners (3 rows)
  [
    [1, 0],
    [3, 0],
    [3, 2],
    [1, 2],
  ], // square (3 rows)
  [
    [1, 1],
    [2, 0],
    [4, 1],
    [2, 2],
  ], // kite (3 rows)
  [
    [1, 0],
    [3, 0],
    [4, 1],
    [2, 2],
    [0, 1],
  ], // pentagon (3 rows)
  [
    [1, 0],
    [3, 0],
    [4, 1],
    [3, 2],
    [1, 2],
    [0, 1],
  ], // hexagon (3 rows)
  [
    [0, 0],
    [4, 0],
    [2, 3],
  ], // triangle, no square corner
  [
    [0, 0],
    [3, 0],
    [0, 3],
  ], // right triangle
  [
    [0, 1],
    [4, 1],
    [4, 3],
    [0, 3],
  ], // rectangle
  [
    [0, 0],
    [4, 0],
    [3, 2],
    [1, 2],
  ], // trapezoid
  [
    [0, 0],
    [4, 0],
    [2, 3],
    [0, 3],
  ], // two square corners
  [
    [2, 0],
    [3, 1],
    [2, 4],
    [1, 1],
  ], // kite
  [
    [2, 0],
    [4, 1],
    [2, 2],
    [0, 1],
  ], // rhombus
  [
    [1, 1],
    [3, 1],
    [3, 3],
    [1, 3],
  ], // square
  [
    [2, 0],
    [4, 2],
    [3, 4],
    [1, 4],
    [0, 2],
  ], // pentagon
  [
    [1, 0],
    [3, 0],
    [4, 2],
    [3, 4],
    [1, 4],
    [0, 2],
  ], // hexagon
  [
    [1, 0],
    [3, 0],
    [4, 1],
    [4, 3],
    [3, 4],
    [1, 4],
    [0, 3],
    [0, 1],
  ], // octagon
];

/** The flat cards a find-all item draws from. */
const CARD_KINDS: ShapeKind[] = [
  'circle',
  'triangle',
  'square',
  'rectangle',
  'rhombus',
  'trapezoid',
  'pentagon',
  'hexagon',
];

export function requirementOf(p: Record<string, unknown>): PolygonRequire {
  const req: PolygonRequire = {};
  const kind = asStr(p.kind as string, 'any');
  if (kind !== 'any') req.kind = kind as ShapeKind;
  const sides = asNum(p.sides as number, 0);
  if (sides > 0) req.sides = sides;
  const ra = asNum(p.rightAngles as number, -1);
  if (ra >= 0) req.rightAngles = ra;
  if (p.equalSides === true) req.equalSides = true;
  return req;
}

/**
 * The first example polygon that meets the requirement and fits a `cols` × `rows` dot grid
 * (`rows` defaults to `cols`: a square grid).
 */
export function examplePolygon(
  req: PolygonRequire,
  cols: number,
  rows: number = cols,
): Pt[] | undefined {
  return EXAMPLES.find((pts) => {
    const info = polygonInfo(pts);
    return info && pts.every(([x, y]) => x < cols && y < rows) && meetsRequire(info, req);
  });
}

/**
 * A dot grid's size from the params: `cols` and `rows`; either one missing or 0 takes `grid` (the
 * older square-grid param, kept for back-compat), else the wide grid every dot target fits:
 * 6 columns × 3 rows.
 */
export function gridOf(p: Record<string, unknown>): { cols: number; rows: number } {
  const grid = asNum(p.grid as number, 0);
  const cols = asNum(p.cols as number, 0);
  const rows = asNum(p.rows as number, 0);
  return {
    cols: cols > 0 ? cols : grid > 0 ? grid : SC_GRID_COLS_MAX,
    rows: rows > 0 ? rows : grid > 0 ? grid : SC_GRID_ROWS_MAX,
  };
}

/** A card meets the requirement (closed, and its kind's typical attributes match). */
function cardMeets(kind: ShapeKind, req: PolygonRequire): boolean {
  const pr = SHAPE_PROPS[kind];
  if (!pr.closed || pr.curved || pr.solid) return false;
  if (req.sides !== undefined && pr.sides !== req.sides) return false;
  if (req.rightAngles !== undefined && pr.rightAngles !== req.rightAngles) return false;
  if (req.equalSides !== undefined && pr.equalSides !== req.equalSides) return false;
  if (req.kind !== undefined && kind !== req.kind) return false;
  return true;
}

const step = (
  key: string,
  vars: Record<string, string | number>,
  action?: WidgetAction,
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const geoDraw: GeneratorDef = {
  id: 'geo.draw',
  formats: ['shape-compose', 'shape-sort'],
  params: {
    kind: {
      type: 'string',
      values: [...KINDS],
      default: { kind: 'const', value: 'any' },
      doc: 'required shape name, or any',
    },
    sides: {
      type: 'int',
      default: { kind: 'const', value: 3 },
      doc: 'required sides (0 = not required)',
    },
    rightAngles: {
      type: 'int',
      default: { kind: 'const', value: -1 },
      doc: 'required square corners (−1 = not required)',
    },
    equalSides: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'true: every side must be the same length',
    },
    tool: {
      type: 'string',
      values: ['dots', 'sticks'],
      default: { kind: 'const', value: 'dots' },
      doc: 'shape-compose: draw on a dot grid, or build with sticks and corners',
    },
    grid: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'older square-grid size (0 = none: 6 × 3); `cols` / `rows` override it (a square grid of 4 or more rows is refused: see `rows`)',
    },
    cols: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'dots per row (3–6; 0 = `grid`). Grids are wide (3 rows × 6) so every dot is a full target',
    },
    rows: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'dots per column (3: all the smallest widget area holds at full target size; 0 = `grid`)',
    },
    cards: { type: 'int', default: { kind: 'const', value: 5 }, doc: 'shape-sort: cards shown' },
    hits: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: 'shape-sort: cards that meet the requirement',
    },
    nearMiss: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'shape-sort: add a near miss (an open figure among triangles)',
    },
  },
  features: {
    'require.count': {
      weight: 0.3,
      doc: 'shape-compose format feature (03 §5.5): stated requirements − 1',
    },
    'sides.over3': { weight: 0.2, doc: 'per required side above 3' },
    rightAngles: { weight: 0.3, doc: 'the shape needs square corners' },
    equalSides: { weight: 0.3, doc: 'the shape needs equal sides' },
    cards: { weight: 0.1, doc: 'shape-sort format feature: card count − 4' },
    nearMiss: { weight: 0.6, doc: 'shape-sort format feature: a near-miss non-example is shown' },
  },
  narration: [
    'gen.geo.draw.start',
    'gen.geo.draw.next',
    'gen.geo.draw.close',
    'gen.geo.draw.look',
    'gen.geo.draw.fits',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const req = requirementOf(p);
    if (Object.keys(req).length === 0) return false;
    const { cols, rows } = gridOf(p);
    // The shape-compose model's supported grid (every dot a full touch target): 3–6 × 3. The
    // shape-sort cards are drawn from examples on the same grid.
    if (cols < 3 || cols > SC_GRID_COLS_MAX || rows < 3 || rows > SC_GRID_ROWS_MAX) return false;
    if (t.format === 'shape-sort') {
      const cards = asNum(p.cards, 5);
      const hits = asNum(p.hits, 2);
      return (
        hits >= 1 &&
        cards - hits >= 2 &&
        CARD_KINDS.some((k) => cardMeets(k, req)) &&
        CARD_KINDS.some((k) => !cardMeets(k, req))
      );
    }
    return examplePolygon(req, cols, rows) !== undefined;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const req = requirementOf(params);
    const kind = (req.kind ?? 'triangle') as ShapeKind;
    // Effective attributes (a named kind implies its own) for the difficulty features.
    const implied = req.kind ? SHAPE_PROPS[req.kind] : undefined;
    const sides = req.sides ?? implied?.sides ?? 3;
    const math: Record<string, number> = {
      'require.count': Math.max(0, Object.keys(req).length - 1),
      'sides.over3': Math.max(0, sides - 3),
      rightAngles: (req.rightAngles ?? implied?.rightAngles ?? 0) > 0 ? 1 : 0,
      equalSides: req.equalSides || (implied?.equalSides && sides === 4) ? 1 : 0,
    };
    const vars = pickVars(t, { kind, one: 1, sides, ra: req.rightAngles ?? 0 });
    if (t.format === 'shape-compose') {
      const { cols, rows } = gridOf(params);
      const sticks = params.tool === 'sticks';
      const example = examplePolygon(req, cols, rows) as Pt[];
      return finish(geoDraw, ctx, {
        params,
        vars,
        widget: {
          format: 'shape-compose',
          mode: sticks ? 'build-sticks' : 'draw-on-grid',
          ...(sticks
            ? {
                pieces: [
                  { id: 'stick', kind: 'stick' as const, count: 2 * example.length + 2 },
                  { id: 'corner', kind: 'corner' as const, count: example.length + 2 },
                ],
              }
            : {}),
          showOutlineLines: false,
          grid: { cols, rows },
          require: req,
          rotationStep: 90,
        },
        answer: {
          kind: 'state',
          checker: 'grid.polygon',
          target: { require: req, grid: { cols, rows } },
        },
        math,
        highlight: [{ op: 'draw-edge', args: { from: example[0], to: example[1] } }],
      });
    }
    if (t.format === 'shape-sort') {
      const cards = asNum(params.cards, 5);
      const hits = asNum(params.hits, 2);
      const c = rng.fork('cards');
      const style = { blocks: false, nonPrototypical: false };
      const yes = CARD_KINDS.filter((k) => cardMeets(k, req));
      const no = CARD_KINDS.filter(
        (k) => !cardMeets(k, req) && yes.every((y) => distinctKinds(y, k)),
      );
      const noPool = no.length > 0 ? no : CARD_KINDS.filter((k) => !cardMeets(k, req));
      const kinds: { k: ShapeKind; hit: boolean; miss: boolean }[] = [];
      for (let i = 0; i < hits; i += 1) kinds.push({ k: c.pick(yes), hit: true, miss: false });
      const miss = NEAR_MISS[yes[0] as ShapeKind];
      if (params.nearMiss === true && miss && !cardMeets(miss, req))
        kinds.push({ k: miss, hit: false, miss: true });
      while (kinds.length < cards) kinds.push({ k: c.pick(noPool), hit: false, miss: false });
      const order = rng.fork('layout').shuffle(kinds);
      const cardList = order.map((x, i) => ({
        id: `c${i}`,
        card: shapeCard(`c${i}`, x.k, style, c),
      }));
      const ids = cardList.filter((_, i) => order[i]?.hit).map((x) => x.id);
      math.cards = Math.max(0, cards - 4);
      math.nearMiss = order.some((x) => x.miss) ? 1 : 0;
      return finish(geoDraw, ctx, {
        params,
        vars,
        widget: { format: 'shape-sort', cards: cardList, bins: null, mode: 'find-all' },
        answer: { kind: 'state', checker: 'select.exactSet', target: { ids } },
        math,
      });
    }
    throw new Error(`geo.draw cannot build ${t.format}`);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    if (a.checker === 'select.exactSet')
      return { kind: 'state', value: { ids: [...(a.target.ids as string[])] } };
    const g = a.target.grid as { cols: number; rows: number };
    return {
      kind: 'state',
      value: { points: examplePolygon(a.target.require as PolygonRequire, g.cols, g.rows) ?? [] },
    };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    if (w.format === 'shape-sort' && a.kind === 'state') {
      const ids = a.target.ids as string[];
      return [
        step('gen.geo.draw.look', {}),
        ...ids.map((id) => step('gen.geo.draw.fits', {}, { op: 'drag-card', args: { id } })),
      ];
    }
    if (w.format === 'shape-compose' && a.kind === 'state') {
      const g = a.target.grid as { cols: number; rows: number };
      const pts = examplePolygon(a.target.require as PolygonRequire, g.cols, g.rows) ?? [];
      return pts.map((from, i) => {
        const to = pts[(i + 1) % pts.length] as Pt;
        const key =
          i === 0
            ? 'gen.geo.draw.start'
            : i === pts.length - 1
              ? 'gen.geo.draw.close'
              : 'gen.geo.draw.next';
        return step(key, {}, { op: 'draw-edge', args: { from, to } });
      });
    }
    return [];
  },
};
