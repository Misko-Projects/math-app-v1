// data.chart (03 §5.6): read and build picture graphs, bar graphs, tally charts and tables with up
// to three categories (DAT.02, DAT.09). Formats: bar-graph-read, bar-graph-build, number-pad,
// compare.
//
// The categories hold `a`, `b` and (with `categories: 3`) `c`; which island objects they are and
// their order on the chart is layout. Category ids are the object (noun) ids, labels
// `noun.<id>.many`. Scale 1 throughout (scaled graphs are DAT.06, K02).
// - bar-graph-read: `question` how-many (category a), total (every category), difference (a − b,
//   a > b), most or least (a category id; never a tie). `kind` picture, bar, tally or table.
// - number-pad (`kind: picture` only): the picture graph as a `scene` stimulus, one group of
//   pictures per category in chart order (StimulusView draws scenes, not `chart`); the child types
//   the total or the difference. StimulusView wraps the groups, so two short groups can share a
//   line: the hints name groups, not rows (PR #84 review round 2).
// - compare: two one-bar charts on one scale (category a and category b); `question` more or
//   fewer; equal counts answer `same`.
// - bar-graph-build: `data` objects (raw objects to tally first), tally or table shows the counts;
//   the child builds them in `mode` bars, pictures or tally. The chart's categories carry value 0
//   (the build starts empty; the counts are only in `data.values`). Answer chart.values
//   `{ values }` in chart category order; response `{ values }`.

import type { ChartSpec, LessonStep, ResponseValue, StimulusSpec } from '@number-island/shared';
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
import { SORT_KINDS } from './sort';

const QUESTIONS = ['how-many', 'total', 'difference', 'most', 'least', 'more', 'fewer'];
const KINDS = ['picture', 'bar', 'tally', 'table'];
const DATA = ['objects', 'tally', 'table'];
const MODES = ['bars', 'pictures', 'tally'];
/** The scene a number-pad picture graph is drawn in (its rows are the categories' pictures). */
const CHART_SCENE = 'beach-shells';

type Category = ChartSpec['categories'][number];

function values(p: Record<string, unknown>): number[] {
  const n = asNum(p.categories as number, 2);
  return [asNum(p.a as number), asNum(p.b as number), ...(n >= 3 ? [asNum(p.c as number)] : [])];
}

const sum = (xs: number[]): number => xs.reduce((x, y) => x + y, 0);

function uniqueExtreme(vs: number[], q: string): boolean {
  const best = q === 'most' ? Math.max(...vs) : Math.min(...vs);
  return vs.filter((x) => x === best).length === 1;
}

/** The compared counts are one apart or equal (most / least: the extreme and the next). */
function closeness(vs: number[], q: string): number {
  if (q === 'most' || q === 'least') {
    const s = [...vs].sort((x, y) => (q === 'most' ? y - x : x - y));
    return Math.abs((s[0] as number) - (s[1] as number)) <= 1 ? 1 : 0;
  }
  return Math.abs((vs[0] as number) - (vs[1] as number)) <= 1 ? 1 : 0;
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const chartKind = (k: string): ChartSpec['kind'] =>
  k === 'bar' ? 'bar' : k === 'tally' ? 'tally' : k === 'table' ? 'table' : 'picture';

export const dataChart: GeneratorDef = {
  id: 'data.chart',
  formats: ['bar-graph-read', 'bar-graph-build', 'number-pad', 'compare'],
  params: {
    categories: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: 'how many categories (2 or 3)',
    },
    a: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 8 },
      doc: 'count of category a (the one asked about)',
    },
    b: { type: 'int', default: { kind: 'int', min: 1, max: 8 }, doc: 'count of category b' },
    c: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 8 },
      doc: 'count of category c; not drawn with two categories',
    },
    question: {
      type: 'string',
      values: QUESTIONS,
      // Templates always set it; the choice lets every format build from defaults.
      default: { kind: 'choice', values: [...QUESTIONS] },
      doc: 'how-many (a), total, difference (a − b), most, least (bar-graph-read, number-pad); more, fewer (compare)',
    },
    kind: {
      type: 'string',
      values: KINDS,
      // A picture graph, the one kind every format can show (the number pad draws it as a scene).
      default: { kind: 'const', value: 'picture' },
      doc: 'the chart: picture graph, bar graph, tally chart or table',
    },
    data: {
      type: 'string',
      values: DATA,
      default: { kind: 'const', value: 'objects' },
      doc: 'bar-graph-build: what shows the counts (raw objects, tally marks or a table)',
    },
    mode: {
      type: 'string',
      values: MODES,
      default: { kind: 'const', value: 'tally' },
      doc: 'bar-graph-build: what the child makes (bars, pictures or tally marks)',
    },
  },
  features: {
    'categories.over2': { weight: 0.2, doc: 'bar graph format feature (03 §5.5): categories − 2' },
    'q.difference': { weight: 0.4, doc: 'bar-graph-read format feature: a how-many-more question' },
    'q.total': { weight: 0.2, doc: 'bar-graph-read format feature: a how-many-in-all question' },
    'data.raw': { weight: 0.4, doc: 'bar-graph-build format feature: objects to tally first' },
    'count.over5': { weight: 0.4, doc: 'max(0, the number answered − 5) / 5' },
    marks: { weight: 0.3, doc: 'bar-graph-build: marks to make beyond one per category, / 10' },
    closeness: {
      weight: 0.4,
      doc: 'most / least: the extreme is one away from the next; compare: the two are equal or one apart',
    },
  },
  narration: [
    'gen.data.chart.find',
    'gen.data.chart.count',
    'gen.data.chart.is',
    'gen.data.chart.all',
    'gen.data.chart.more',
    'gen.data.chart.compare',
    'gen.data.chart.pick',
    'gen.data.chart.mark',
    'gen.data.chart.done',
  ],
  sample(spec, rng) {
    const p = sampleAll(spec, rng);
    if (asNum(p.categories, 2) < 3) delete p.c;
    return p;
  },
  derive: () => ({}),
  accepts(p, t) {
    const n = asNum(p.categories, 2);
    if (n < 2 || n > 3) return false;
    const vs = values(p);
    if (vs.some((x) => x < 1 || x > 10)) return false;
    const q = asStr(p.question);
    switch (t.format) {
      case 'bar-graph-read':
        if (q === 'total') return sum(vs) <= 20;
        if (q === 'difference') return (vs[0] as number) > (vs[1] as number);
        if (q === 'most' || q === 'least') return uniqueExtreme(vs, q);
        return q === 'how-many';
      case 'number-pad':
        // The pad's picture is a scene of picture rows, so only a picture graph can be shown.
        if (asStr(p.kind) !== 'picture') return false;
        if (q === 'total') return sum(vs) <= 20;
        return q === 'difference' && (vs[0] as number) > (vs[1] as number);
      case 'compare':
        return n === 2 && (q === 'more' || q === 'fewer');
      case 'bar-graph-build':
        return sum(vs) <= 20;
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const vs = values(params);
    const n = vs.length;
    const q = asStr(params.question, 'how-many');
    const kinds = rng.fork('groups').shuffle(SORT_KINDS).slice(0, n);
    const catA = kinds[0] as string;
    const catB = kinds[1] as string;
    const cats: Category[] = kinds.map((k, i) => ({
      id: k,
      label: `noun.${k}.many`,
      value: vs[i] as number,
    }));
    const shown = rng.fork('layout').shuffle(cats);
    const kind = chartKind(asStr(params.kind, 'bar'));
    const axisMax = Math.max(5, ...vs);
    const chart = (categories: Category[]): ChartSpec => ({
      kind,
      orientation: kind === 'bar' ? 'vertical' : 'horizontal',
      categories,
      scale: 1,
      axisMax,
    });
    const vars = pickVars(t, {
      catA,
      catB,
      many: 2,
      ask: q === 'least' ? 'fewest' : q === 'fewer' ? 'fewer' : q === 'more' ? 'more' : 'most',
    });
    const numberAnswer =
      q === 'total'
        ? sum(vs)
        : q === 'difference'
          ? (vs[0] as number) - (vs[1] as number)
          : (vs[0] as number);
    const math: Record<string, number> = { 'categories.over2': n - 2 };
    let p: PartialOutput;
    switch (t.format) {
      case 'bar-graph-read': {
        let answer: PartialOutput['answer'];
        if (q === 'most' || q === 'least') {
          const best = q === 'most' ? Math.max(...vs) : Math.min(...vs);
          math.closeness = closeness(vs, q);
          answer = { kind: 'choice', id: kinds[vs.indexOf(best)] as string };
        } else {
          math['q.total'] = q === 'total' ? 1 : 0;
          math['q.difference'] = q === 'difference' ? 1 : 0;
          math['count.over5'] = Math.max(0, numberAnswer - 5) / 5;
          answer = { kind: 'number', value: numberAnswer };
        }
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'bar-graph-read',
            chart: chart(shown),
            question: {
              type: q as 'how-many' | 'total' | 'difference' | 'most' | 'least',
              categories:
                q === 'how-many'
                  ? [catA]
                  : q === 'difference'
                    ? [catA, catB]
                    : shown.map((c) => c.id),
            },
          },
          answer,
        };
        break;
      }
      case 'number-pad': {
        math['q.total'] = q === 'total' ? 1 : 0;
        math['q.difference'] = q === 'difference' ? 1 : 0;
        math['count.over5'] = Math.max(0, numberAnswer - 5) / 5;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: {
              kind: 'scene',
              context: CHART_SCENE,
              sprites: shown.map((c) => ({ sprite: c.id, count: c.value })),
            },
            blanks: [{ id: 'n', maxDigits: 2 }],
            unit: null,
          },
          answer: { kind: 'number', value: numberAnswer },
        };
        break;
      }
      case 'compare': {
        const [first, second] = cats as [Category, Category];
        const swap = rng.fork('sides').bool(0.5);
        const [left, right] = swap ? [second, first] : [first, second];
        const id =
          left.value === right.value
            ? 'same'
            : left.value > right.value === (q === 'more')
              ? 'left'
              : 'right';
        math.closeness = closeness(vs, q);
        const side = (c: Category): StimulusSpec => ({ kind: 'chart', chart: chart([c]) });
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'compare',
            left: side(left),
            right: side(right),
            ask: q === 'fewer' ? 'fewer' : 'more',
            allowMatchLines: false,
          },
          answer: { kind: 'choice', id },
        };
        break;
      }
      case 'bar-graph-build': {
        const data = asStr(params.data, 'objects') as 'objects' | 'tally' | 'table';
        const mode = asStr(params.mode, 'tally') as 'bars' | 'pictures' | 'tally';
        math['data.raw'] = data === 'objects' ? 1 : 0;
        math.marks = Math.max(0, sum(vs) - n) / 10;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'bar-graph-build',
            chart: chart(shown.map((c) => ({ ...c, value: 0 }))),
            data: { kind: data, values: shown.map((c) => c.value) },
            mode,
          },
          answer: {
            kind: 'state',
            checker: 'chart.values',
            target: { values: shown.map((c) => c.value) },
          },
        };
        break;
      }
      default:
        throw new Error(`data.chart cannot build ${t.format}`);
    }
    return finish(dataChart, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    return { kind: 'state', value: { values: [...(a.target.values as number[])] } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    const cat = (id: string) => ({ cat: id, many: 2 });
    switch (w.format) {
      case 'bar-graph-read': {
        const ids = w.question.categories;
        const op = w.chart.kind === 'bar' ? 'read-axis' : 'count-pictures';
        if (a.kind === 'choice') {
          return [
            say('gen.data.chart.compare', {}),
            say('gen.data.chart.pick', {}, { op: 'answer', args: { id: a.id } }),
          ];
        }
        const value = a.kind === 'number' ? a.value : 0;
        const steps: LessonStep[] = ids.map((id) =>
          say('gen.data.chart.count', cat(id), { op, args: { id } }),
        );
        const last =
          w.question.type === 'total'
            ? 'gen.data.chart.all'
            : w.question.type === 'difference'
              ? 'gen.data.chart.more'
              : 'gen.data.chart.is';
        steps.push(say(last, { n: value }, { op: 'answer', args: { value } }));
        return steps;
      }
      case 'number-pad': {
        const value = a.kind === 'number' ? a.value : 0;
        return [
          say('gen.data.chart.find', {}, { op: 'show-stimulus' }),
          say('gen.data.chart.is', { n: value }, { op: 'type', args: { blank: 'n', value } }),
        ];
      }
      case 'compare': {
        const id = a.kind === 'choice' ? a.id : 'same';
        return [
          say('gen.data.chart.compare', {}),
          say('gen.data.chart.pick', {}, { op: 'answer', args: { id } }),
        ];
      }
      case 'bar-graph-build': {
        const op =
          w.mode === 'bars' ? 'raise-bar' : w.mode === 'pictures' ? 'add-picture' : 'tally';
        const steps: LessonStep[] = w.chart.categories.map((c, i) => {
          const count = w.data.values[i] as number;
          return say(
            'gen.data.chart.mark',
            cat(c.id),
            op === 'raise-bar'
              ? { op, args: { id: c.id, to: count } }
              : { op, args: { id: c.id, count } },
          );
        });
        steps.push(say('gen.data.chart.done', {}));
        return steps;
      }
      default:
        return [];
    }
  },
};
