// geo.compose (03 §5.6): put shapes together to fill an outline (GEO.10, GEO.11, PUZ.03).
// Formats: shape-compose (fill-outline, compose.fill), numeral-pick (which two pieces make this
// shape, or how many of a piece), number-pad (how many of a piece, typed: the constructed-answer
// form of `how-many`, 04 §7a) and puzzle-grid (shape-fill: cover a grid outline with the listed
// squares and rectangles, puzzle.satisfies).
//
// The outline comes from ./outlines.ts (mirrored in packages/content/outlines.yaml). Until the
// shape-compose and puzzle-grid format models land, the generator emits their features itself.

import type { LessonStep, ResponseValue, ShapeKind, WidgetAction } from '@number-island/shared';
import {
  area,
  PIECE_CORNERS,
  PIECE_SYMMETRY,
  type Placement,
  placeCorners,
  type Vec,
} from '../../check/state/pieces';
import { type Cell, shapeFills } from '../../check/state/puzzle.satisfies';
import { numberOptionId } from '../../formats/numeral-pick';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  numberOptions,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import { gridCells, OUTLINE_IDS, type Outline, outline } from './outlines';
import { SHAPE_PROPS } from './shapes';

const KIT_PIECES: Record<string, string[]> = {
  'pattern-blocks': ['triangle', 'square', 'rhombus', 'trapezoid', 'hexagon'],
  shapes: ['square', 'rectangle', 'triangle'],
};

/** Pieces in the outline's reference tiling, with counts, in first-use order. */
function tilingCounts(o: Outline): { kind: string; count: number }[] {
  const out: { kind: string; count: number }[] = [];
  for (const p of o.tiling) {
    const e = out.find((x) => x.kind === p.kind);
    if (e) e.count += 1;
    else out.push({ kind: p.kind, count: 1 });
  }
  return out;
}

const needsTurn = (p: Placement): boolean =>
  ((p.rot % (PIECE_SYMMETRY[p.kind] ?? 360)) + 360) % (PIECE_SYMMETRY[p.kind] ?? 360) !== 0;

const pieceArea = (kind: string): number => area(placeCorners({ kind, at: [0, 0], rot: 0 }) ?? []);

/** Side lengths of a polygon, shortest first. */
const sideLengths = (p: readonly Vec[]): number[] =>
  p
    .map((a, i) => {
      const b = p[(i + 1) % p.length] as Vec;
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    })
    .sort((x, y) => x - y);

/**
 * The area of the target card a numeral-pick item shows: the outline's named shape drawn as its
 * piece at `resultScale`. This is all the child sees of the outline (a ShapeCard has a kind and a
 * scale, not the outline's corners), so the distractor filter reads it, not the outline.
 */
const cardArea = (o: Outline): number =>
  o.result === undefined ? 0 : pieceArea(o.result) * (o.resultScale ?? 1) ** 2;

/**
 * Whether the target card (kind and scale) draws exactly this outline: the same side lengths and
 * area as the kind's piece at `resultScale`. Numeral-pick only uses such outlines, so two outlines
 * with one card are the same shape and never ask for different pairs. A 3 × 1 rectangle is not the
 * card's 2 × 1 rectangle at any scale, so `long-rectangle` is shape-compose only.
 */
export function drawsAsCard(o: Outline): boolean {
  if (o.result === undefined || !Object.hasOwn(PIECE_CORNERS, o.result)) return false;
  const s = o.resultScale ?? 1;
  const card = sideLengths(PIECE_CORNERS[o.result] as Vec[]).map((x) => x * s);
  const own = sideLengths(o.points);
  return (
    card.length === own.length &&
    card.every((x, i) => Math.abs(x - (own[i] as number)) < 1e-6) &&
    Math.abs(area(o.points) - cardArea(o)) < 1e-6
  );
}

/** Numeral-pick `how-many`: the outline is a named shape tiled by one kind of piece. */
const uniform = (o: Outline): boolean => o.result !== undefined && tilingCounts(o).length === 1;

/** Shape-fill puzzle: the grid outline's cells, how many rectangles, and every valid fill. */
function puzzleOf(o: Outline, pieces: number) {
  const cells = gridCells(o);
  const rows = Math.max(...cells.map((c) => c[0])) + 1;
  const cols = Math.max(...cells.map((c) => c[1])) + 1;
  // pieces 0 (the default): one rectangle, squares for the rest.
  const rects = cells.length - (pieces > 0 ? pieces : cells.length - 1);
  const fills =
    rects >= 1 && rects * 2 <= cells.length ? shapeFills(cells, rects, rows, cols, 64) : [];
  return { cells, rows, cols, rects, fills };
}

const step = (
  key: string,
  vars: Record<string, string | number>,
  action?: WidgetAction,
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const pieceId = (kind: string) => `p-${kind}`;

export const geoCompose: GeneratorDef = {
  id: 'geo.compose',
  formats: ['shape-compose', 'numeral-pick', 'number-pad', 'puzzle-grid'],
  params: {
    outline: {
      type: 'string',
      values: OUTLINE_IDS,
      default: { kind: 'choice', values: OUTLINE_IDS },
      doc: 'outline id (packages/content/outlines.yaml); outlines the format cannot use are redrawn',
    },
    ask: {
      type: 'string',
      values: ['which', 'how-many'],
      default: { kind: 'const', value: 'which' },
      doc: 'numeral-pick: which pieces make the shape, or how many of one piece',
    },
    linesHidden: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'shape-compose: hide the guide lines inside the outline',
    },
    extra: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'shape-compose: also offer a piece the outline does not need',
    },
    pieces: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'puzzle-grid: pieces to use, squares and rectangles together (0: one rectangle, squares for the rest)',
    },
  },
  derived: ['count'],
  features: {
    pieces: { weight: 0.3, doc: 'shape-compose format feature (03 §5.5): pieces needed − 2' },
    rotations: { weight: 0.3, doc: 'shape-compose format feature: pieces that must be turned' },
    'outline.linesHidden': { weight: 0.6, doc: 'shape-compose format feature: no guide lines' },
    extra: { weight: 0.3, doc: 'an unneeded piece is offered' },
    blanks: { weight: 0.2, doc: 'puzzle-grid format feature: blank cells − 4' },
    multipleSolutions: { weight: -0.3, doc: 'puzzle-grid format feature: more than one way works' },
    rects: { weight: 0.3, doc: 'puzzle-grid: rectangles to fit − 1' },
  },
  narration: [
    'gen.geo.compose.look',
    'gen.geo.compose.place',
    'gen.geo.compose.turn',
    'gen.geo.compose.pieces-are',
    'gen.geo.compose.count',
    'gen.geo.compose.grid-rect',
    'gen.geo.compose.grid-next',
    'gen.geo.compose.grid-square',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    const o = outline(asStr(p.outline));
    if (!o) return { count: 0 };
    if (o.kit !== 'grid') return { count: o.tiling.length };
    const pz = puzzleOf(o, asNum(p.pieces));
    return { count: pz.cells.length - pz.rects };
  },
  accepts(p, t) {
    const o = outline(asStr(p.outline));
    if (!o) return false;
    if (t.format === 'puzzle-grid') {
      if (o.kit !== 'grid') return false;
      // At least one rectangle and one square, and some way to fit them.
      const pz = puzzleOf(o, asNum(p.pieces));
      return pz.cells.length - 2 * pz.rects >= 1 && pz.fills.length > 0;
    }
    if (o.kit === 'grid') return false;
    if (t.representation === 'pattern-blocks' && o.kit !== 'pattern-blocks') return false;
    if (t.format === 'numeral-pick' || t.format === 'number-pad') {
      // The child sees only the target card, so the card must be the outline itself.
      if (!drawsAsCard(o)) return false;
      // number-pad always asks how many of the one piece the shape is made of.
      if (p.ask === 'how-many' || t.format === 'number-pad') return uniform(o);
      return o.result !== undefined && o.tiling.length === 2;
    }
    return true;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const o = outline(asStr(params.outline)) as Outline;
    const counts = tilingCounts(o);
    const rotations = o.tiling.filter(needsTurn).length;
    if (t.format === 'shape-compose') {
      const offered = counts.map((c) => ({
        id: pieceId(c.kind),
        kind: c.kind as ShapeKind,
        count: c.count,
      }));
      const kit = KIT_PIECES[o.kit] ?? [];
      const spare = rng.fork('extra').pick(kit.filter((k) => !counts.some((c) => c.kind === k)));
      const extra = params.extra === true && spare !== undefined;
      if (extra) offered.push({ id: pieceId(spare), kind: spare as ShapeKind, count: 2 });
      const first = o.tiling[0] as Placement;
      return finish(geoCompose, ctx, {
        params,
        vars: pickVars(t, { piece: first.kind, many: 2 }),
        widget: {
          format: 'shape-compose',
          mode: 'fill-outline',
          pieces: offered,
          outline: { points: o.points.map((p) => [p[0], p[1]] as [number, number]) },
          showOutlineLines: params.linesHidden !== true,
          rotationStep: o.kit === 'pattern-blocks' ? 60 : 90,
        },
        answer: {
          kind: 'state',
          checker: 'compose.fill',
          target: {
            outline: o.points.map((p) => [p[0], p[1]]),
            pieces: offered.map((x) => ({ kind: x.kind, count: x.count })),
          },
        },
        math: {
          pieces: Math.max(0, o.tiling.length - 2),
          rotations,
          'outline.linesHidden': params.linesHidden === true ? 1 : 0,
          extra: extra ? 1 : 0,
        },
        highlight: [
          { op: 'drag-piece', args: { id: pieceId(first.kind), to: first.at, rot: first.rot } },
        ],
      });
    }
    if (t.format === 'numeral-pick' || t.format === 'number-pad') {
      const result = o.result as ShapeKind;
      const stimulus = {
        kind: 'shape' as const,
        shapes: [
          {
            id: 'whole',
            shape: result,
            props: { ...SHAPE_PROPS[result] },
            rotationDeg: 0,
            scale: o.resultScale ?? 1,
            color: 'tan',
          },
        ],
      };
      const math = {
        pieces: Math.max(0, o.tiling.length - 2),
        rotations,
        'outline.linesHidden': 0,
        extra: 0,
      };
      if (t.format === 'number-pad') {
        const piece = counts[0]?.kind ?? 'triangle';
        return finish(geoCompose, ctx, {
          params,
          vars: pickVars(t, { piece, whole: result, one: 1, many: 2 }),
          widget: {
            format: 'number-pad',
            stimulus,
            blanks: [{ id: 'n', maxDigits: String(o.tiling.length).length }],
            unit: null,
          },
          answer: { kind: 'number', value: o.tiling.length },
          math,
        });
      }
      if (params.ask === 'how-many') {
        const piece = counts[0]?.kind ?? 'triangle';
        const n = o.tiling.length;
        const opts = numberOptions(t, params, n, rng, 1);
        return finish(geoCompose, ctx, {
          params,
          vars: pickVars(t, { piece, whole: result, one: 1, many: 2 }),
          widget: { format: 'numeral-pick', stimulus, options: opts.options, layout: 'row' },
          answer: { kind: 'choice', id: numberOptionId(n) },
          math,
        });
      }
      // which: the right pair and two pairs whose area cannot fill the shape the card shows. Every
      // numeral-pick outline with this card has the card's area, so a distractor is never the
      // right pair of another outline drawn the same way.
      const whole = cardArea(o);
      const kit = KIT_PIECES[o.kit] ?? [];
      const right = o.tiling.map((p) => p.kind).sort();
      const pairs: string[][] = [];
      for (let i = 0; i < kit.length; i += 1) {
        for (let j = i; j < kit.length; j += 1) {
          const pair = [kit[i] as string, kit[j] as string].sort();
          if (Math.abs(pieceArea(pair[0] as string) + pieceArea(pair[1] as string) - whole) > 1e-6)
            pairs.push(pair);
        }
      }
      const layout = rng.fork('layout');
      const wrong = layout.shuffle(pairs).slice(0, 2);
      const card = (kind: string, i: number) => ({
        id: `piece-${i}`,
        shape: kind as ShapeKind,
        props: { ...SHAPE_PROPS[kind as ShapeKind] },
        rotationDeg: 0,
        scale: 1,
        color: 'tan',
      });
      const pairId = (pair: string[]) => `pair-${pair.join('-')}`;
      const options = layout.shuffle([right, ...wrong]).map((pair) => ({
        id: pairId(pair),
        stimulus: { kind: 'shape' as const, shapes: pair.map(card) },
      }));
      return finish(geoCompose, ctx, {
        params,
        vars: pickVars(t, { whole: result, one: 1, many: 2 }),
        widget: { format: 'numeral-pick', stimulus, options, layout: 'row' },
        answer: { kind: 'choice', id: pairId(right) },
        math,
      });
    }
    if (t.format === 'puzzle-grid') {
      const pz = puzzleOf(o, asNum(params.pieces));
      const use = [
        ...new Array<string>(pz.rects).fill('rectangle'),
        ...new Array<string>(pz.cells.length - 2 * pz.rects).fill('square'),
      ];
      return finish(geoCompose, ctx, {
        params,
        vars: pickVars(t, {
          rects: pz.rects,
          squares: pz.cells.length - 2 * pz.rects,
          rk: 'rectangle',
          sk: 'square',
        }),
        widget: {
          format: 'puzzle-grid',
          variant: 'shape-fill',
          rows: pz.rows,
          cols: pz.cols,
          cells: pz.cells.map(([r, c]) => ({ r, c, blank: true })),
          constraints: [{ kind: 'use-each', values: use }],
          palette: ['square', 'rectangle'],
          uniqueSolution: pz.fills.length === 1,
        },
        answer: {
          kind: 'state',
          checker: 'puzzle.satisfies',
          target: {
            variant: 'shape-fill',
            rows: pz.rows,
            cols: pz.cols,
            cells: pz.cells,
            constraints: [{ kind: 'use-each', values: use }],
          },
        },
        math: {
          blanks: Math.max(0, pz.cells.length - 4),
          multipleSolutions: pz.fills.length > 1 ? 1 : 0,
          rects: Math.max(0, pz.rects - 1),
        },
      });
    }
    throw new Error(`geo.compose cannot build ${t.format}`);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    const o = outline(asStr(out.params.outline)) as Outline;
    if (a.checker === 'puzzle.satisfies') {
      const pz = puzzleOf(o, asNum(out.params.pieces));
      return { kind: 'state', value: { fill: pz.fills[0] ?? [] } };
    }
    return {
      kind: 'state',
      value: { pieces: o.tiling.map((p) => ({ kind: p.kind, at: [...p.at], rot: p.rot })) },
    };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    const o = outline(asStr(out.params.outline)) as Outline;
    if (w.format === 'shape-compose') {
      return [
        step('gen.geo.compose.look', {}),
        ...o.tiling.map((p) =>
          step(
            needsTurn(p) ? 'gen.geo.compose.turn' : 'gen.geo.compose.place',
            {},
            {
              op: 'drag-piece',
              args: { id: pieceId(p.kind), to: [...p.at], rot: p.rot },
            },
          ),
        ),
      ];
    }
    if (w.format === 'number-pad' && a.kind === 'number') {
      const piece = o.tiling[0]?.kind ?? 'triangle';
      // The first step only shows the shape: the worked-step hint (level 4) plays it.
      return [
        step('gen.geo.compose.look', {}, { op: 'show-stimulus' }),
        step(
          'gen.geo.compose.count',
          { n: a.value, piece, many: 2 },
          { op: 'type', args: { blank: 'n', value: a.value } },
        ),
      ];
    }
    if (w.format === 'numeral-pick' && a.kind === 'choice') {
      const piece = o.tiling[0]?.kind ?? 'triangle';
      if (out.params.ask === 'how-many') {
        return [
          step('gen.geo.compose.look', {}, { op: 'highlight', args: { id: a.id } }),
          step(
            'gen.geo.compose.count',
            { n: o.tiling.length, piece, many: 2 },
            { op: 'tap', args: { id: a.id } },
          ),
        ];
      }
      const [k1, k2] = o.tiling.map((p) => p.kind);
      return [
        step('gen.geo.compose.look', {}, { op: 'highlight', args: { id: a.id } }),
        step(
          'gen.geo.compose.pieces-are',
          { a: k1 ?? piece, b: k2 ?? piece, one: 1 },
          { op: 'tap', args: { id: a.id } },
        ),
      ];
    }
    if (w.format === 'puzzle-grid') {
      const pz = puzzleOf(o, asNum(out.params.pieces));
      const fill = pz.fills[0] ?? [];
      const steps: LessonStep[] = [];
      const done = new Set<string>();
      for (const [r, c] of pz.cells as Cell[]) {
        const k = `${r},${c}`;
        if (done.has(k)) continue;
        done.add(k);
        const v = fill[r]?.[c] ?? 'square';
        if (v === 'rectangle') {
          // Its partner is the cell to the right or below with the same label (reading order).
          const partner = (
            [
              [r, c + 1],
              [r + 1, c],
            ] as Cell[]
          ).find(
            ([r2, c2]) =>
              fill[r2]?.[c2] === 'rectangle' &&
              !done.has(`${r2},${c2}`) &&
              pairedHere(fill, pz.cells, done, [r, c], [r2, c2]),
          );
          steps.push(
            step(
              'gen.geo.compose.grid-rect',
              {},
              { op: 'fill', args: { r, c, value: 'rectangle' } },
            ),
          );
          if (partner) {
            done.add(`${partner[0]},${partner[1]}`);
            steps.push(
              step(
                'gen.geo.compose.grid-next',
                {},
                { op: 'fill', args: { r: partner[0], c: partner[1], value: 'rectangle' } },
              ),
            );
          }
        } else {
          steps.push(
            step(
              'gen.geo.compose.grid-square',
              {},
              { op: 'fill', args: { r, c, value: 'square' } },
            ),
          );
        }
      }
      return steps;
    }
    return [];
  },
};

/** Whether pairing these two rectangle cells still lets the remaining rectangle cells pair up. */
function pairedHere(fill: string[][], cells: Cell[], done: Set<string>, a: Cell, b: Cell): boolean {
  const left = cells.filter(([r, c]) => {
    const k = `${r},${c}`;
    return (
      fill[r]?.[c] === 'rectangle' &&
      !done.has(k) &&
      !(r === a[0] && c === a[1]) &&
      !(r === b[0] && c === b[1])
    );
  });
  const keys = new Set(left.map(([r, c]) => `${r},${c}`));
  const sorted = [...left].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const go = (): boolean => {
    const f = sorted.find(([r, c]) => keys.has(`${r},${c}`));
    if (!f) return true;
    keys.delete(`${f[0]},${f[1]}`);
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const k = `${f[0] + dr},${f[1] + dc}`;
      if (keys.has(k)) {
        keys.delete(k);
        if (go()) return true;
        keys.add(k);
      }
    }
    keys.add(`${f[0]},${f[1]}`);
    return false;
  };
  return go();
}
