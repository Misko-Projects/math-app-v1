// data.lineplot (03 §5.6): make and read a line plot of measured lengths (DAT.03; DAT.08 later
// with halves and quarters). Formats: bar-graph-build (mode `xs`), bar-graph-read.
//
// The scale runs from `min` (a whole number of units) over `positions` marks, `1 / precision`
// apart; `x1` … `x<positions>` are how many measurements sit at each mark (0 to
// GRAPH_LINE_STACK_MAX). The first and the last mark always hold at least one, so the scale spans
// the data. `measurements` (derived) is the count of measured things.
// - bar-graph-build (`question: build`): the data board lists every measurement (in layout order);
//   the child puts an X above its length. At most BUILD_LINE_POSITIONS_MAX marks and
//   BUILD_DATA_MEASUREMENTS_MAX measurements. Answer `chart.values` (Xs per mark, min → max).
// - bar-graph-read: `how-many` (the Xs above mark `at`, 0 when none), `total` (every measurement),
//   `difference` (the Xs above `at` minus those above `at2`, more than 0). At most
//   READ_POSITIONS_MAX marks. A line plot's marks are not choices, so it never asks most or least.
//
// Every count is a param, so the item key follows from the params alone (03 §5.3).

import type { ChartSpec, LessonStep, ResponseValue } from '@number-island/shared';
import { chartPositionId } from '@number-island/shared';
import { BUILD_DATA_MEASUREMENTS_MAX } from '../../formats/bar-graph-build';
import { BUILD_LINE_POSITIONS_MAX, GRAPH_LINE_STACK_MAX } from '../../formats/bar-graph';
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

const QUESTIONS = ['build', 'how-many', 'total', 'difference'] as const;
const PRECISIONS = [1, 2, 4];
/** Most marks on a line plot the child reads (a 960 × 600 screen keeps 12 px between labels). */
export const READ_POSITIONS_MAX = 6;
/** Most measurements on a line plot the child reads. */
export const READ_MEASUREMENTS_MAX = 20;
/** The largest first mark (whole units). */
export const LINEPLOT_MIN_MAX = 20;
const SLOTS = [1, 2, 3, 4, 5, 6] as const;
/** What was measured: its label on the chart (a line plot shows numerals, never the label). */
const THING_LABEL = 'noun.plank.many';

/** The Xs above each mark, first to last. */
export function lineCounts(p: Record<string, unknown>): number[] {
  const n = asNum(p.positions as number, 3);
  return SLOTS.slice(0, n).map((i) => asNum(p[`x${i}`] as number, 0));
}

/** The value at mark `i` (1-based). */
const markAt = (p: Record<string, unknown>, i: number): number =>
  asNum(p.min as number, 1) + (i - 1) / asNum(p.precision as number, 1);

const sum = (xs: number[]): number => xs.reduce((x, y) => x + y, 0);

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const dataLineplot: GeneratorDef = {
  id: 'data.lineplot',
  formats: ['bar-graph-build', 'bar-graph-read'],
  params: {
    min: {
      type: 'int',
      default: { kind: 'int', min: 2, max: 8 },
      doc: `the first mark, in whole units (0–${LINEPLOT_MIN_MAX})`,
    },
    positions: {
      type: 'int',
      default: { kind: 'const', value: 4 },
      doc: `marks on the scale (2–${BUILD_LINE_POSITIONS_MAX} to build, up to ${READ_POSITIONS_MAX} to read)`,
    },
    precision: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: '1 (whole units), 2 (halves) or 4 (quarters): marks are 1 / precision apart and the scale ends on a whole unit',
    },
    ...Object.fromEntries(
      SLOTS.map((i) => [
        `x${i}`,
        {
          type: 'int' as const,
          default: { kind: 'int' as const, min: i === 1 ? 1 : 0, max: 3 },
          doc: `Xs above mark ${i} (0–${GRAPH_LINE_STACK_MAX}); drawn only when positions ≥ ${i}`,
        },
      ]),
    ),
    question: {
      type: 'string',
      values: [...QUESTIONS],
      // Templates always set it; the choice lets either format build from defaults.
      default: { kind: 'choice', values: [...QUESTIONS] },
      doc: 'build (bar-graph-build); how-many, total or difference (bar-graph-read)',
    },
    at: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'how-many, difference: the mark asked about (1-based)',
    },
    at2: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: 'difference: the mark with fewer Xs (1-based)',
    },
  },
  derived: ['measurements'],
  features: {},
  narration: [
    'gen.data.lineplot.find',
    'gen.data.lineplot.mark',
    'gen.data.lineplot.count',
    'gen.data.lineplot.done',
    'gen.data.chart.is',
    'gen.data.chart.all',
    'gen.data.chart.more',
  ],
  sample(spec, rng) {
    const p = sampleAll(spec, rng);
    const n = asNum(p.positions, 4);
    for (const i of SLOTS) if (i > n) delete p[`x${i}`];
    return p;
  },
  derive: (p) => ({ measurements: sum(lineCounts(p)) }),
  accepts(p, t) {
    const n = asNum(p.positions, 4);
    const precision = asNum(p.precision, 1);
    const min = asNum(p.min, 1);
    const q = asStr(p.question);
    if (!PRECISIONS.includes(precision) || !Number.isInteger(min)) return false;
    if (min < 0 || min > LINEPLOT_MIN_MAX) return false;
    // The scale ends on a whole unit (a line plot runs between two whole numbers).
    if (n < 2 || (n - 1) % precision !== 0) return false;
    const xs = lineCounts(p);
    if (xs.some((x) => !Number.isInteger(x) || x < 0 || x > GRAPH_LINE_STACK_MAX)) return false;
    if ((xs[0] as number) < 1 || (xs[n - 1] as number) < 1) return false;
    const all = sum(xs);
    if (t.format === 'bar-graph-build') {
      return q === 'build' && n <= BUILD_LINE_POSITIONS_MAX && all <= BUILD_DATA_MEASUREMENTS_MAX;
    }
    if (t.format !== 'bar-graph-read' || n > READ_POSITIONS_MAX || all > READ_MEASUREMENTS_MAX)
      return false;
    const at = asNum(p.at, 1);
    const at2 = asNum(p.at2, 2);
    const inRange = (i: number) => Number.isInteger(i) && i >= 1 && i <= n;
    switch (q) {
      case 'how-many':
        return inRange(at);
      case 'total':
        return true;
      case 'difference':
        return inRange(at) && inRange(at2) && (xs[at - 1] as number) > (xs[at2 - 1] as number);
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const xs = lineCounts(params);
    const n = xs.length;
    const precision = asNum(params.precision, 1);
    const min = asNum(params.min, 1);
    const max = markAt(params, n);
    const q = asStr(params.question, 'build');
    const ids = SLOTS.slice(0, n).map((i) => chartPositionId(markAt(params, i)));
    const chart = (values: number[]): ChartSpec => ({
      kind: 'line-plot',
      orientation: 'horizontal',
      categories: ids.map((id, i) => ({ id, label: THING_LABEL, value: values[i] as number })),
      scale: 1,
      axisMax: Math.max(4, ...xs),
      lineScale: { min, max, step: 1 / precision },
    });
    const at = asNum(params.at, 1);
    const at2 = asNum(params.at2, 2);
    const vars = pickVars(t, {
      at: markAt(params, at),
      at2: markAt(params, at2),
      min,
      max,
      many: 2,
    });
    let p: PartialOutput;
    if (t.format === 'bar-graph-build') {
      const measurements = rng
        .fork('layout')
        .shuffle(xs.flatMap((x, i) => Array.from({ length: x }, () => markAt(params, i + 1))));
      p = {
        params,
        vars,
        math: {},
        widget: {
          format: 'bar-graph-build',
          chart: chart(xs.map(() => 0)),
          data: { kind: 'measurements', values: measurements },
          mode: 'xs',
        },
        answer: { kind: 'state', checker: 'chart.values', target: { values: [...xs] } },
      };
      return finish(dataLineplot, ctx, p);
    }
    const value =
      q === 'total'
        ? sum(xs)
        : q === 'difference'
          ? (xs[at - 1] as number) - (xs[at2 - 1] as number)
          : (xs[at - 1] as number);
    p = {
      params,
      vars,
      math: {},
      widget: {
        format: 'bar-graph-read',
        chart: chart(xs),
        question: {
          type: q as 'how-many' | 'total' | 'difference',
          categories:
            q === 'how-many'
              ? [ids[at - 1] as string]
              : q === 'difference'
                ? [ids[at - 1] as string, ids[at2 - 1] as string]
                : [...ids],
        },
      },
      answer: { kind: 'number', value },
    };
    return finish(dataLineplot, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    return { kind: 'state', value: { values: [...(a.target.values as number[])] } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    if (w.format === 'bar-graph-build') {
      const steps: LessonStep[] = [say('gen.data.lineplot.find', {})];
      w.chart.categories.forEach((c, i) => {
        const count = (a.kind === 'state' ? (a.target.values as number[]) : [])[i] ?? 0;
        if (count > 0) {
          steps.push(
            say('gen.data.lineplot.mark', { at: c.id }, { op: 'add-x', args: { at: Number(c.id), count } }),
          );
        }
      });
      steps.push(say('gen.data.lineplot.done', {}));
      return steps;
    }
    if (w.format !== 'bar-graph-read') return [];
    const value = a.kind === 'number' ? a.value : 0;
    const steps: LessonStep[] = w.question.categories.map((id) =>
      say('gen.data.lineplot.count', { at: id }, { op: 'count-pictures', args: { id } }),
    );
    const last =
      w.question.type === 'total'
        ? 'gen.data.chart.all'
        : w.question.type === 'difference'
          ? 'gen.data.chart.more'
          : 'gen.data.chart.is';
    steps.push(say(last, { n: value }, { op: 'answer', args: { value } }));
    return steps;
  },
};
