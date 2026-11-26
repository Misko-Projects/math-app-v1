// geo.partition (03 §5.6): split a rectangle into `rows` rows and `cols` columns of equal squares
// and count them (GEO.04). Derived: `result` = rows × cols.
// Formats (K02 slice 3a), by `mode`:
// - area-tiles `partition`: a plain rectangle; the child draws the row and column lines (state
//   `array.dims`). `tile`: the child covers the rectangle with unit squares and types how many
//   (`tiles.cover`).
// - array-build `read`: rows of cubes on a grid (the kit draws no square sprite); type how many.
// - number-pad: "rows of" in words, no picture; type how many squares.
// Bounds: a worked rectangle (partition, tile) is at most AREA_WORK_H_MAX rows and AREA_WORK_W_MAX
// columns; a read array at most ARRAY_SIDE_MAX each way.
// Not built yet: MEA.05's uses (area in square units, non-rectangular regions).

import type { LessonStep, ResponseValue } from '@number-island/shared';
import { AREA_WORK_H_MAX, AREA_WORK_W_MAX } from '../../formats/area-tiles';
import { ARRAY_SIDE_MAX } from '../../formats/array-build';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const MODES = ['partition', 'tile', 'read'] as const;

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const rowCounts = (rows: number, cols: number): string =>
  Array.from({ length: rows }, (_, k) => (k + 1) * cols).join(', ');

export const geoPartition: GeneratorDef = {
  id: 'geo.partition',
  formats: ['area-tiles', 'array-build', 'number-pad'],
  params: {
    rows: { type: 'int', default: { kind: 'int', min: 2, max: 4 }, doc: 'rows of squares (1–6)' },
    cols: {
      type: 'int',
      default: { kind: 'int', min: 2, max: 5 },
      doc: 'columns of squares (1–10)',
    },
    mode: {
      type: 'string',
      values: [...MODES],
      default: { kind: 'const', value: 'partition' },
      doc: 'area-tiles: partition (draw the lines) or tile (cover and count); array-build: read',
    },
  },
  derived: ['result'],
  features: { cells: { weight: 0.3, doc: 'result / 10: how many squares' } },
  narration: [
    'gen.geo.partition.rows',
    'gen.geo.partition.cols',
    'gen.geo.partition.fill-row',
    'gen.geo.partition.count',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: (p) => ({ result: asNum(p.rows) * asNum(p.cols) }),
  accepts(p, t) {
    const rows = asNum(p.rows);
    const cols = asNum(p.cols);
    const mode = asStr(p.mode, 'partition');
    if (rows < 1 || cols < 1) return false;
    switch (t.format) {
      case 'area-tiles':
        // A partition needs at least one line to draw.
        if (mode === 'partition' && rows * cols < 2) return false;
        return (
          (mode === 'partition' || mode === 'tile') &&
          rows <= AREA_WORK_H_MAX &&
          cols <= AREA_WORK_W_MAX
        );
      case 'array-build':
        return rows <= ARRAY_SIDE_MAX && cols <= ARRAY_SIDE_MAX;
      case 'number-pad':
        return rows <= ARRAY_SIDE_MAX && cols <= ARRAY_SIDE_MAX;
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const rows = asNum(params.rows);
    const cols = asNum(params.cols);
    const result = rows * cols;
    const mode = asStr(params.mode, 'partition');
    const vars = pickVars(t, { rows, cols });
    const math = { cells: result / 10 };
    const mask = '1'.repeat(result);
    let p: PartialOutput;
    if (t.format === 'area-tiles') {
      const partition = mode === 'partition';
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'area-tiles',
          region: { w: cols, h: rows, mask },
          mode: partition ? 'partition' : 'tile',
          gridShown: !partition,
          sideLabels: false,
          unit: 'sq-units',
          decimalGrid: false,
        },
        answer: partition
          ? { kind: 'state', checker: 'array.dims', target: { rows, cols } }
          : { kind: 'state', checker: 'tiles.cover', target: { mask, value: result } },
      };
    } else if (t.format === 'array-build') {
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'array-build',
          maxRows: rows,
          maxCols: cols,
          mode: 'read',
          rows,
          cols,
          orientationMatters: true,
          sprite: 'cube',
          gridShown: true,
        },
        answer: { kind: 'number', value: result },
      };
    } else if (t.format === 'number-pad') {
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'number-pad',
          stimulus: { kind: 'none' },
          blanks: [{ id: 'x', maxDigits: 2 }],
          unit: null,
        },
        answer: { kind: 'number', value: result },
      };
    } else {
      throw new Error(`geo.partition cannot build ${t.format}`);
    }
    return finish(geoPartition, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    const rows = asNum(out.params.rows);
    const cols = asNum(out.params.cols);
    if (a.checker === 'array.dims') return { kind: 'state', value: { rows, cols } };
    return { kind: 'state', value: { tiles: '1'.repeat(rows * cols), value: rows * cols } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const rows = asNum(out.params.rows);
    const cols = asNum(out.params.cols);
    const result = rows * cols;
    const counts = rowCounts(rows, cols);
    if (w.format === 'area-tiles' && w.mode === 'partition') {
      const steps: LessonStep[] = [];
      for (let r = 1; r < rows; r += 1) {
        steps.push(
          say('gen.geo.partition.rows', { rows }, { op: 'draw-split', args: { at: r, dir: 'h' } }),
        );
      }
      for (let c = 1; c < cols; c += 1) {
        steps.push(
          say('gen.geo.partition.cols', { cols }, { op: 'draw-split', args: { at: c, dir: 'v' } }),
        );
      }
      return steps;
    }
    if (w.format === 'area-tiles') {
      const steps: LessonStep[] = [];
      for (let r = 0; r < rows; r += 1) {
        steps.push(say('gen.geo.partition.fill-row', { cols }, { op: 'fill-row', args: { r } }));
      }
      steps.push(
        say(
          'gen.geo.partition.count',
          { counts, result },
          { op: 'answer', args: { value: result } },
        ),
      );
      return steps;
    }
    if (w.format === 'array-build') {
      return [
        say('gen.geo.partition.rows', { rows }, { op: 'skip-count-rows' }),
        say(
          'gen.geo.partition.count',
          { counts, result },
          { op: 'answer', args: { value: result } },
        ),
      ];
    }
    return [
      say(
        'gen.geo.partition.count',
        { counts, result },
        { op: 'type', args: { blank: 'x', value: result } },
      ),
    ];
  },
};
