// 03 §5.5 bar-graph-read (U05 #14). A finished chart (`chart`, any ChartSpec kind) and a question.
// - Counting questions answer `number`: `how-many` (the one category in `question.categories`),
//   `total` (every listed category), `difference` (first − second), `how-many-more-to` (how many
//   more the one category needs to reach `extra`), `two-step` (the listed categories together,
//   then `extra` more or fewer); the child types or picks the number (`answer {value}`).
// - `most` and `least` answer `choice` with a category id (`answer {id}`); the options are the
//   chart's categories and the asked extreme is never a tie.
// Ops: `point-bar {id}` (Pip points at a category's bar, row or column), `read-axis {id}` (follow
// the bar's top across to the axis), `count-pictures {id}` (count the symbols, marks or the table
// cell); all three are visual and leave the answer alone. Response: `{ kind: 'number', value }`
// or `{ kind: 'choice', id }`, null until the child has answered. `answer {}` with no id takes a
// picked category back.
//
// Supported domain: `graphIssues('read')` (formats/bar-graph.ts) bounds the chart; every value is
// a whole number, and the answer (`barGraphReadAnswer`, the one source for the item's answer and
// the widget's counter) is a whole number 0 to GRAPH_ANSWER_MAX.

import {
  type AnswerSpec,
  barGraphReadConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { GRAPH_ANSWER_MAX, graphIssues, graphLabelIssues } from './bar-graph';
import { chartIssues, chartSlots, needsPartSymbol, slotValues } from './chart';
import {
  argNumber,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'bar-graph-read'>;
type QuestionType = Config['question']['type'];

export interface BarGraphReadState extends FormatState<'bar-graph-read'> {
  /** The category Pip (or the child) points at. */
  pointed: string | null;
  /** Categories read off the axis or counted, in order (visual marks). */
  read: string[];
  value: number | null;
  choice: string | null;
}

/** Whether the question answers with a category (most / least) rather than a number. */
export const asksCategory = (type: QuestionType): boolean => type === 'most' || type === 'least';

/** How many categories a question type names (null: any number, at least one). */
const NAMED: Partial<Record<QuestionType, number>> = {
  'how-many': 1,
  difference: 2,
  'how-many-more-to': 1,
};

/**
 * The answer a config asks for: the count (or the category for most / least), or null when the
 * question does not have one (a tie, a missing category). The item's answer must equal it
 * (`barGraphReadAnswerIssues`), and the widget's counter stops at `readAnswerMax`.
 */
export function barGraphReadAnswer(c: Config): AnswerSpec | null {
  const slots = chartSlots(c.chart);
  const counts = slotValues(c.chart);
  const q = c.question;
  const vs = q.categories.map((id) => counts[slots.findIndex((x) => x.id === id)]);
  if (vs.length === 0 || vs.some((v) => v === undefined)) return null;
  const values = vs as number[];
  const sum = values.reduce((a, b) => a + b, 0);
  const number = (value: number): AnswerSpec => ({ kind: 'number', value });
  switch (q.type) {
    case 'how-many':
      return number(values[0] as number);
    case 'total':
      return number(sum);
    case 'difference':
      return values.length === 2 ? number((values[0] as number) - (values[1] as number)) : null;
    case 'how-many-more-to':
      return q.extra === undefined ? null : number(q.extra - (values[0] as number));
    case 'two-step':
      return q.extra === undefined ? null : number(sum + q.extra);
    default: {
      const best = q.type === 'most' ? Math.max(...values) : Math.min(...values);
      const at = values.flatMap((v, i) => (v === best ? [i] : []));
      return at.length === 1
        ? { kind: 'choice', id: q.categories[at[0] as number] as string }
        : null;
    }
  }
}

/** The largest number any question about this chart can answer (the counter's top). */
export function readAnswerMax(c: Config): number {
  const sum = slotValues(c.chart).reduce((a, b) => a + b, 0);
  return Math.min(
    GRAPH_ANSWER_MAX,
    Math.max(sum, sum + (c.question.extra ?? 0), c.question.extra ?? 0),
  );
}

/** Why an item's answer is not the one its config asks for (empty: it is). */
export function barGraphReadAnswerIssues(c: Config, answer: AnswerSpec): string[] {
  const want = barGraphReadAnswer(c);
  if (!want) return ['the question has no single answer'];
  if (want.kind === 'number') {
    return answer.kind === 'number' && answer.value === want.value && !answer.tolerance
      ? []
      : [`the graph answers ${want.value}, exactly`];
  }
  return answer.kind === 'choice' && want.kind === 'choice' && answer.id === want.id
    ? []
    : [`the graph answers ${want.kind === 'choice' ? want.id : ''}`];
}

const configSchema = barGraphReadConfigSchema.superRefine((c, ctx) => {
  chartIssues(c.chart, ctx, ['chart']);
  graphIssues(c.chart, 'read', (path, message) =>
    ctx.addIssue({ code: 'custom', path: ['chart', ...path], message }),
  );
  c.chart.categories.forEach((x, i) => {
    if (!Number.isInteger(x.value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['chart', 'categories', i, 'value'],
        message: 'a graph the child reads shows whole numbers',
      });
    }
  });
  if (c.question.extra !== undefined && !Number.isInteger(c.question.extra)) {
    ctx.addIssue({ code: 'custom', path: ['question', 'extra'], message: 'extra is whole' });
  }
  const asked = barGraphReadAnswer(c);
  if (asked?.kind === 'number' && !(asked.value >= 0 && asked.value <= GRAPH_ANSWER_MAX)) {
    ctx.addIssue({
      code: 'custom',
      path: ['question'],
      message: `the answer is 0 to ${GRAPH_ANSWER_MAX} (the pad cannot type ${asked.value})`,
    });
  }
  // Line plots ask about positions (ids as positionId writes them).
  const slots = chartSlots(c.chart);
  const counts = slotValues(c.chart);
  const ids = new Set(slots.map((x) => x.id));
  const q = c.question;
  q.categories.forEach((id, i) => {
    if (!ids.has(id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['question', 'categories', i],
        message: `${id} is not a category of the chart`,
      });
    }
  });
  if (new Set(q.categories).size !== q.categories.length) {
    ctx.addIssue({ code: 'custom', path: ['question', 'categories'], message: 'ids repeat' });
  }
  const named = NAMED[q.type];
  if (named !== undefined ? q.categories.length !== named : q.categories.length < 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['question', 'categories'],
      message: `${q.type} names ${named ?? 'at least one'} categor${named === 1 ? 'y' : 'ies'}`,
    });
  }
  const value = (id: string) => counts[slots.findIndex((x) => x.id === id)] ?? 0;
  if (q.type === 'difference' && q.categories.length === 2) {
    const [a, b] = q.categories as [string, string];
    if (!(value(a) > value(b))) {
      ctx.addIssue({
        code: 'custom',
        path: ['question'],
        message: 'difference asks the bigger first (the answer is positive)',
      });
    }
  }
  if (q.type === 'how-many-more-to' || q.type === 'two-step') {
    if (q.extra === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['question', 'extra'],
        message: `${q.type} needs extra`,
      });
    }
  }
  if (q.type === 'how-many-more-to' && q.extra !== undefined && q.categories.length === 1) {
    if (!(q.extra > value(q.categories[0] as string))) {
      ctx.addIssue({
        code: 'custom',
        path: ['question', 'extra'],
        message: 'the goal is above the count',
      });
    }
  }
  if (asksCategory(q.type)) {
    if (slots.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['chart'], message: `${q.type} needs two categories` });
    }
    const vs = q.categories.map(value);
    const best = q.type === 'most' ? Math.max(...vs) : Math.min(...vs);
    if (vs.filter((v) => v === best).length > 1) {
      ctx.addIssue({ code: 'custom', path: ['question'], message: `${q.type} is a tie` });
    }
  }
});

export const barGraphRead: FormatModel<'bar-graph-read', BarGraphReadState> = {
  format: 'bar-graph-read',
  configSchema,
  answerIssues: barGraphReadAnswerIssues,
  labelIssues: (c, text) => graphLabelIssues(c.chart, text),
  features: {
    'categories.over2': { weight: 0.2, doc: 'categories − 2 (each)' },
    'scale.notOne': { weight: 0.6, doc: 'each symbol or axis step stands for 2, 5 or 10' },
    halfSymbol: {
      weight: 0.5,
      doc: 'a picture graph shows part of a symbol (an odd count at scale 2)',
    },
    'q.difference': { weight: 0.4, doc: 'a how-many-more (difference) question' },
    'q.total': { weight: 0.2, doc: 'a how-many-in-all (total) question' },
    'q.twoStep': { weight: 0.7, doc: 'a two-step question' },
    horizontal: {
      weight: 0.1,
      doc: 'a bar graph with horizontal bars (picture rows, tally charts and tables read left to right anyway)',
    },
    linePlot: { weight: 0.3, doc: 'the chart is a line plot' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const chart = c.chart;
    return {
      'categories.over2': Math.max(0, chart.categories.length - 2),
      'scale.notOne': chart.scale !== 1 ? 1 : 0,
      halfSymbol:
        chart.kind === 'picture' &&
        needsPartSymbol(
          chart.categories.map((x) => x.value),
          chart.scale,
        )
          ? 1
          : 0,
      'q.difference': c.question.type === 'difference' ? 1 : 0,
      'q.total': c.question.type === 'total' ? 1 : 0,
      'q.twoStep': c.question.type === 'two-step' ? 1 : 0,
      horizontal: chart.kind === 'bar' && chart.orientation === 'horizontal' ? 1 : 0,
      linePlot: chart.kind === 'line-plot' ? 1 : 0,
    };
  },
  initialState: (config) => ({ config, pointed: null, read: [], value: null, choice: null }),
  apply(s, a) {
    const isCategory = (id: string | undefined): id is string =>
      id !== undefined && chartSlots(s.config.chart).some((c) => c.id === id);
    switch (a.op) {
      case 'point-bar': {
        const id = argString(a, 'id');
        return isCategory(id) ? { ...s, pointed: id } : s;
      }
      case 'read-axis':
      case 'count-pictures': {
        const id = argString(a, 'id');
        if (!isCategory(id)) return s;
        return { ...s, pointed: id, read: s.read.includes(id) ? s.read : [...s.read, id] };
      }
      case 'answer': {
        if (asksCategory(s.config.question.type)) {
          const id = argString(a, 'id');
          // No id: the picked category is put back (the child taps it again).
          if (a.args?.id === undefined) return s.choice === null ? s : { ...s, choice: null };
          return isCategory(id) ? { ...s, choice: id } : s;
        }
        const v = argNumber(a, 'value');
        // Only what the pad or the counter can enter: a whole number 0 to GRAPH_ANSWER_MAX.
        if (v === undefined || !Number.isInteger(v) || v < 0 || v > GRAPH_ANSWER_MAX) return s;
        return { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('bar-graph-read', a.op);
    }
  },
  toResponse(s) {
    if (asksCategory(s.config.question.type)) {
      return s.choice === null ? null : { kind: 'choice', id: s.choice };
    }
    return s.value === null ? null : { kind: 'number', value: s.value };
  },
};
