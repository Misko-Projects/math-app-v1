// 03 §5.5 bar-graph-build (U05 #14). The child builds a chart from `data`: objects to tally first,
// tally marks, a table of counts, or measurements (line plots). The chart arrives empty (every
// category value 0): the counts are only in `data.values`, so the widget never shows what it asks.
// - `bars`: raise each bar to its count (`raise-bar {id, to}`).
// - `pictures`: add symbols to each row (`add-picture {id, count?}`); `count` is in symbols
//   (default 1), each worth `scale`, so at scale 2 `count: 0.5` adds a half symbol; a negative
//   count takes symbols away.
// - `tally`: add marks (`tally {id, count?}`, default 1; negative takes marks away).
// - `xs` (line plot): add an X above a position (`add-x {at, count?}`; negative takes Xs away).
// Every op changes the same counts, so a chart built one way is the same end state as one built
// another way. Response `{ values }` (`chart.values`): the count in each slot, in chart order
// (categories; line-plot positions min → max), whatever the marks; null while the chart is empty.
// The generic `answer {values}` sets every count at once. Counts stay within 0 … axisMax.

import {
  type AnswerSpec,
  barGraphBuildConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { chartIssues, chartSlots, halvesOfScale, linePositions, positionId, tidy } from './chart';
import {
  argNumber,
  argNumbers,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'bar-graph-build'>;

export interface BarGraphBuildState extends FormatState<'bar-graph-build'> {
  /** The count built in each slot (chartSlots order). */
  values: number[];
}

const MODE_KIND: Record<Config['mode'], Config['chart']['kind']> = {
  bars: 'bar',
  pictures: 'picture',
  xs: 'line-plot',
  tally: 'tally',
};

/** The counts the child is asked to build, in slot order (line plots: Xs per position). */
export function buildTargets(c: Config): number[] {
  if (c.chart.kind !== 'line-plot' || c.data.kind !== 'measurements') return [...c.data.values];
  const positions = c.chart.lineScale ? linePositions(c.chart.lineScale).map(positionId) : [];
  const counts = positions.map(() => 0);
  for (const m of c.data.values) {
    const i = positions.indexOf(positionId(m));
    if (i >= 0) counts[i] = (counts[i] as number) + 1;
  }
  return counts;
}

const configSchema = barGraphBuildConfigSchema.superRefine((c, ctx) => {
  const add = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  chartIssues(c.chart, ctx, ['chart']);
  if (MODE_KIND[c.mode] !== c.chart.kind) {
    add(['mode'], `${c.mode} builds a ${MODE_KIND[c.mode]} chart, not ${c.chart.kind}`);
  }
  c.chart.categories.forEach((x, i) => {
    if (x.value !== 0) add(['chart', 'categories', i, 'value'], 'the chart starts empty');
  });
  const lineData = c.data.kind === 'measurements';
  if (lineData !== (c.chart.kind === 'line-plot')) {
    add(['data', 'kind'], 'measurements go with a line plot, and only there');
  }
  if (lineData) {
    const positions = new Set(
      c.chart.lineScale ? linePositions(c.chart.lineScale).map(positionId) : [],
    );
    c.data.values.forEach((m, i) => {
      if (!positions.has(positionId(m))) {
        add(['data', 'values', i], 'a measurement is not a position on the line plot');
      }
    });
    if (c.data.values.length < 1) add(['data', 'values'], 'no measurements');
    const most = Math.max(0, ...buildTargets(c));
    if (most > c.chart.axisMax) add(['chart', 'axisMax'], 'more Xs at one place than axisMax');
    return;
  }
  if (c.data.values.length !== c.chart.categories.length) {
    add(['data', 'values'], 'one count per category');
  }
  c.data.values.forEach((v, i) => {
    if (!(Number.isInteger(v) && v >= 0)) add(['data', 'values', i], 'a count is a whole number');
    if (v > c.chart.axisMax) add(['data', 'values', i], 'a count above axisMax cannot be built');
    if (c.mode === 'pictures' && !halvesOfScale(v, c.chart.scale)) {
      add(['data', 'values', i], `cannot be built from whole and half symbols of ${c.chart.scale}`);
    }
  });
  if (c.data.values.every((v) => v === 0)) add(['data', 'values'], 'nothing to build');
});

function clampTo(s: BarGraphBuildState, i: number, v: number): BarGraphBuildState {
  const cap = s.config.chart.axisMax;
  const next = Math.min(cap, Math.max(0, tidy(v)));
  if (next === s.values[i]) return s;
  const values = [...s.values];
  values[i] = next;
  return { ...s, values };
}

export const barGraphBuild: FormatModel<'bar-graph-build', BarGraphBuildState> = {
  format: 'bar-graph-build',
  configSchema,
  features: {
    'categories.over2': { weight: 0.2, doc: 'categories − 2 (each)' },
    'scale.notOne': { weight: 0.6, doc: 'each symbol or axis step stands for 2, 5 or 10' },
    notMultipleOfScale: { weight: 0.5, doc: 'some count is not a multiple of the scale' },
    'data.raw': { weight: 0.4, doc: 'objects or measurements to tally first' },
    fractional: { weight: 0.6, doc: 'a line plot with ½ or ¼ positions' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const scale = c.chart.scale;
    return {
      'categories.over2': Math.max(0, c.chart.categories.length - 2),
      'scale.notOne': scale !== 1 ? 1 : 0,
      notMultipleOfScale:
        c.chart.kind !== 'line-plot' && c.data.values.some((v) => tidy(v % scale) !== 0) ? 1 : 0,
      'data.raw': c.data.kind === 'objects' || c.data.kind === 'measurements' ? 1 : 0,
      fractional: c.chart.kind === 'line-plot' && (c.chart.lineScale?.step ?? 1) < 1 ? 1 : 0,
    };
  },
  initialState: (config) => ({ config, values: chartSlots(config.chart).map(() => 0) }),
  apply(s, a) {
    const slots = chartSlots(s.config.chart);
    const slotOf = (id: string | undefined) =>
      id === undefined ? -1 : slots.findIndex((x) => x.id === id);
    const step = (key: string) => {
      const n = argNumber(a, key);
      return n === undefined ? 1 : n;
    };
    switch (a.op) {
      case 'raise-bar': {
        const i = slotOf(argString(a, 'id'));
        const to = argNumber(a, 'to');
        // Counts are whole: a bar stops on a whole number, between gridlines when the scale is 2+.
        return i < 0 || to === undefined || !Number.isInteger(to) ? s : clampTo(s, i, to);
      }
      case 'add-picture': {
        const i = slotOf(argString(a, 'id'));
        if (i < 0) return s;
        // Whole or half symbols only (a picture graph shows halves, 03 §5.5).
        const n = step('count');
        if (!Number.isInteger(n * 2)) return s;
        return clampTo(s, i, (s.values[i] as number) + n * s.config.chart.scale);
      }
      case 'tally': {
        const i = slotOf(argString(a, 'id'));
        const n = step('count');
        return i < 0 || !Number.isInteger(n) ? s : clampTo(s, i, (s.values[i] as number) + n);
      }
      case 'add-x': {
        const at = argNumber(a, 'at');
        const i = at === undefined ? -1 : slotOf(positionId(at));
        const n = step('count');
        return i < 0 || !Number.isInteger(n) ? s : clampTo(s, i, (s.values[i] as number) + n);
      }
      case 'answer': {
        const vs = argNumbers(a, 'values');
        if (!vs || vs.length !== slots.length) return s;
        return vs.reduce((acc, v, i) => clampTo(acc, i, v), s);
      }
      default:
        throw new UnsupportedOpError('bar-graph-build', a.op);
    }
  },
  toResponse(s) {
    if (s.values.every((v) => v === 0)) return null;
    return { kind: 'state', value: { values: [...s.values] } };
  },
};
