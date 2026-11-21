// The supported ranges of the pictures the widget kit draws from numbers (03 §5.1 "Supported
// picture ranges"): one test per bound, at the bound (accepted) and one past it (refused).
import { describe, expect, it } from 'vitest';
import {
  CHART_AXIS_STEPS_MAX,
  CHART_CATEGORIES_MAX,
  CHART_LINE_POSITIONS_MAX,
  CHART_STIMULUS_CATEGORIES_MAX,
  type ChartSpec,
  chartAxisTop,
  chartLinePositions,
  chartSpecSchema,
  FRACTION_PARTS_MAX,
  hintStepSchema,
  type StimulusSpec,
  stimulusSpecSchema,
  widgetConfigSchema,
} from './index';

const fraction = (over: Record<string, unknown>) => ({
  kind: 'fraction',
  shape: 'bar',
  parts: 4,
  shaded: 1,
  equalParts: true,
  ...over,
});
const IDS = ['fish', 'crab', 'shell', 'apple', 'bun', 'plank', 'feather'];
const cats = (...values: number[]) =>
  values.map((value, i) => ({ id: IDS[i] as string, label: `noun.${IDS[i]}.many`, value }));
const chart = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  kind: 'bar',
  orientation: 'vertical',
  categories: cats(4, 2),
  scale: 1,
  axisMax: 10,
  ...over,
});
const linePlot = (over: Partial<ChartSpec> = {}): ChartSpec =>
  chart({
    kind: 'line-plot',
    orientation: 'horizontal',
    categories: [{ id: '1.5', label: 'noun.fish.many', value: 2 }],
    lineScale: { min: 0, max: 5, step: 0.5 },
    ...over,
  });

const ok = (spec: unknown) => stimulusSpecSchema.safeParse(spec).success;
const chartOk = (c: unknown) => chartSpecSchema.safeParse(c).success;
/** The paths of the issues a chart raises (under `chart.`, as a stimulus or a format reports them). */
const chartPaths = (c: unknown) => {
  const r = chartSpecSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => ['chart', ...i.path].join('.'));
};
/** The paths of the issues a `chart` stimulus raises. */
const stimulusPaths = (c: unknown) => {
  const r = stimulusSpecSchema.safeParse({ kind: 'chart', chart: c });
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('fraction pictures', () => {
  it('parts: 1 to FRACTION_PARTS_MAX, whole numbers', () => {
    expect(FRACTION_PARTS_MAX).toBe(12);
    expect(ok(fraction({ parts: 1, shaded: 0 }))).toBe(true);
    expect(ok(fraction({ parts: FRACTION_PARTS_MAX }))).toBe(true);
    expect(ok(fraction({ parts: 0, shaded: 0 }))).toBe(false);
    expect(ok(fraction({ parts: FRACTION_PARTS_MAX + 1 }))).toBe(false);
    expect(ok(fraction({ parts: 2.5 }))).toBe(false);
    expect(ok(fraction({ parts: Number.POSITIVE_INFINITY }))).toBe(false);
  });

  it('shaded: 0 to parts, whole numbers', () => {
    expect(ok(fraction({ parts: 4, shaded: 0 }))).toBe(true);
    expect(ok(fraction({ parts: 4, shaded: 4 }))).toBe(true);
    expect(ok(fraction({ parts: 4, shaded: 5 }))).toBe(false);
    expect(ok(fraction({ parts: 4, shaded: -1 }))).toBe(false);
    expect(ok(fraction({ parts: 4, shaded: 1.5 }))).toBe(false);
    const r = stimulusSpecSchema.safeParse(fraction({ parts: 4, shaded: 5 }));
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.'))).toEqual(['shaded']);
  });

  it('every shape takes every supported part count', () => {
    for (const shape of ['circle', 'rect', 'bar', 'loaf']) {
      for (let parts = 1; parts <= FRACTION_PARTS_MAX; parts += 1) {
        for (const equalParts of [true, false]) {
          expect(ok(fraction({ shape, parts, shaded: parts, equalParts }))).toBe(true);
        }
      }
    }
  });
});

describe('chart pictures', () => {
  it('categories: 1 to CHART_CATEGORIES_MAX, ids distinct', () => {
    expect(CHART_CATEGORIES_MAX).toBe(6);
    expect(chartOk(chart({ categories: cats(3) }))).toBe(true);
    expect(chartOk(chart({ categories: cats(1, 2, 3, 4, 5, 6) }))).toBe(true);
    expect(chartPaths(chart({ categories: [] }))).toEqual(['chart.categories']);
    expect(chartPaths(chart({ categories: cats(1, 2, 3, 4, 5, 6, 7) }))).toEqual([
      'chart.categories',
    ]);
    const twice = [...cats(1), ...cats(2)];
    expect(chartPaths(chart({ categories: twice }))).toEqual(['chart.categories']);
  });

  it('axisMax: above 0, at most CHART_AXIS_STEPS_MAX steps of the scale', () => {
    expect(CHART_AXIS_STEPS_MAX).toBe(20);
    expect(chartPaths(chart({ axisMax: 0, categories: cats(0) }))).toEqual(['chart.axisMax']);
    expect(chartPaths(chart({ axisMax: -5, categories: cats(0) }))).toContain('chart.axisMax');
    for (const scale of [1, 2, 5, 10] as const) {
      const top = CHART_AXIS_STEPS_MAX * scale;
      expect(chartOk(chart({ scale, axisMax: top, categories: cats(top) }))).toBe(true);
      expect(chartPaths(chart({ scale, axisMax: top + 1, categories: cats(scale) }))).toEqual([
        'chart.axisMax',
      ]);
    }
    // The steps are counted on the drawn axis, whose top rounds axisMax up to the scale.
    expect(chartAxisTop({ scale: 5, axisMax: 96 })).toBe(100);
    expect(chartOk(chart({ scale: 5, axisMax: 96, categories: cats(95) }))).toBe(true);
    expect(chartOk(chart({ axisMax: Number.POSITIVE_INFINITY }))).toBe(false);
  });

  it('values: 0 to axisMax', () => {
    expect(chartOk(chart({ categories: cats(0, 10) }))).toBe(true);
    expect(chartPaths(chart({ categories: cats(4, 11) }))).toEqual(['chart.categories.1.value']);
    expect(chartPaths(chart({ categories: cats(-1, 4) }))).toEqual(['chart.categories.0.value']);
    expect(chartOk(chart({ categories: cats(Number.NaN) }))).toBe(false);
  });

  it('values: whole numbers, except on a bar graph', () => {
    expect(chartOk(chart({ categories: cats(2.5) }))).toBe(true);
    for (const kind of ['picture', 'tally', 'table'] as const) {
      expect(chartOk(chart({ kind, categories: cats(3) }))).toBe(true);
      expect(chartPaths(chart({ kind, categories: cats(2.5) }))).toContain(
        'chart.categories.0.value',
      );
    }
  });

  it('picture graphs: whole or half symbols of the scale', () => {
    expect(chartOk(chart({ kind: 'picture', scale: 2, categories: cats(4, 5) }))).toBe(true);
    expect(chartOk(chart({ kind: 'picture', scale: 10, categories: cats(5, 10) }))).toBe(true);
    expect(chartPaths(chart({ kind: 'picture', scale: 10, categories: cats(5, 3) }))).toEqual([
      'chart.categories.1.value',
    ]);
  });

  it('tally charts and tables count in ones', () => {
    for (const kind of ['tally', 'table'] as const) {
      expect(chartOk(chart({ kind, scale: 1 }))).toBe(true);
      expect(chartPaths(chart({ kind, scale: 2 }))).toEqual(['chart.scale']);
    }
  });

  it('line plots: a scale of 1, 0.5 or 0.25 steps, max above min, whole steps', () => {
    for (const step of [1, 0.5, 0.25]) {
      const categories = [{ id: '2', label: 'noun.fish.many', value: 2 }];
      expect(chartOk(linePlot({ categories, lineScale: { min: 0, max: 3, step } }))).toBe(true);
    }
    expect(chartPaths(linePlot({ lineScale: undefined }))).toEqual(['chart.lineScale']);
    expect(chartPaths(linePlot({ lineScale: { min: 0, max: 3, step: 0.1 } }))).toContain(
      'chart.lineScale.step',
    );
    expect(chartPaths(linePlot({ lineScale: { min: 3, max: 3, step: 1 } }))).toEqual([
      'chart.lineScale',
    ]);
    expect(chartPaths(linePlot({ lineScale: { min: 0, max: 1.75, step: 0.5 } }))).toContain(
      'chart.lineScale',
    );
  });

  it('line plots: at most CHART_LINE_POSITIONS_MAX positions, categories on them', () => {
    expect(CHART_LINE_POSITIONS_MAX).toBe(25);
    const at = (max: number) => linePlot({ lineScale: { min: 0, max, step: 1 }, categories: [] });
    expect(chartOk(at(CHART_LINE_POSITIONS_MAX - 1))).toBe(true);
    expect(chartPaths(at(CHART_LINE_POSITIONS_MAX))).toEqual(['chart.lineScale']);
    // A scale far past the bound is refused without building its positions.
    expect(chartPaths(at(1e12))).toEqual(['chart.lineScale']);
    expect(chartLinePositions({ min: 0, max: 1e12, step: 0.25 })).toEqual([]);
    expect(chartLinePositions({ min: 0, max: 2, step: 0.5 })).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(
      chartPaths(linePlot({ categories: [{ id: '1.3', label: 'noun.fish.many', value: 1 }] })),
    ).toEqual(['chart.categories.0.id']);
    // An id is the position as written: "1" and "1.0" would be one position counted twice, so
    // only the canonical spelling is a position (and ids are distinct).
    const spelled = (...ids: string[]) =>
      linePlot({
        lineScale: { min: 0, max: 2, step: 0.5 },
        categories: ids.map((id, i) => ({ id, label: 'noun.fish.many', value: 2 + i })),
      });
    expect(chartOk(spelled('1', '1.5'))).toBe(true);
    expect(chartPaths(spelled('1', '1.0'))).toEqual(['chart.categories.1.id']);
    expect(chartPaths(spelled('1.50'))).toEqual(['chart.categories.0.id']);
    expect(chartPaths(spelled('1', '1'))).toContain('chart.categories');
    // A line plot's categories are positions, so the six-category bound does not apply to it.
    const many = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((p) => ({
      id: String(p),
      label: 'noun.fish.many',
      value: 1,
    }));
    expect(chartOk(linePlot({ categories: many }))).toBe(true);
  });
});

describe('chart stimuli: a vertical bar graph of one or two categories', () => {
  it('categories: 1 to CHART_STIMULUS_CATEGORIES_MAX', () => {
    expect(CHART_STIMULUS_CATEGORIES_MAX).toBe(2);
    expect(stimulusPaths(chart({ categories: cats(4) }))).toEqual([]);
    expect(stimulusPaths(chart({ categories: cats(4, 2) }))).toEqual([]);
    expect(stimulusPaths(chart({ categories: cats(4, 2, 3) }))).toEqual(['chart.categories']);
    expect(stimulusPaths(chart({ categories: [] }))).toEqual(['chart.categories']);
  });

  it('only bar graphs, only vertical (the other kinds belong to the bar-graph formats)', () => {
    expect(stimulusPaths(chart({ orientation: 'horizontal' }))).toEqual(['chart.orientation']);
    for (const kind of ['picture', 'tally', 'table'] as const) {
      expect(stimulusPaths(chart({ kind }))).toEqual(['chart.kind']);
    }
    expect(stimulusPaths(linePlot())).toEqual(['chart.kind', 'chart.orientation']);
  });

  it('every scale and axis length a chart may have', () => {
    for (const scale of [1, 2, 5, 10] as const) {
      for (let steps = 1; steps <= CHART_AXIS_STEPS_MAX; steps += 1) {
        const top = steps * scale;
        expect(stimulusPaths(chart({ scale, axisMax: top, categories: cats(top, 0) }))).toEqual([]);
      }
    }
  });
});

describe('the ranges hold wherever a picture travels', () => {
  const badFraction = fraction({ parts: FRACTION_PARTS_MAX + 1 }) as unknown as StimulusSpec;
  const badChart = { kind: 'chart', chart: chart({ axisMax: 21 }) } as StimulusSpec;
  const good = fraction({}) as unknown as StimulusSpec;

  it('compare sides and order cards', () => {
    const compare = (left: StimulusSpec) => ({
      format: 'compare',
      left,
      right: good,
      ask: 'more',
      allowMatchLines: false,
    });
    const order = (stimulus: StimulusSpec) => ({
      format: 'order',
      items: [
        { id: 'a', value: 1, stimulus },
        { id: 'b', value: 2, stimulus: good },
      ],
      direction: 'asc',
    });
    expect(widgetConfigSchema.safeParse(compare(good)).success).toBe(true);
    expect(widgetConfigSchema.safeParse(order(good)).success).toBe(true);
    for (const bad of [badFraction, badChart]) {
      expect(widgetConfigSchema.safeParse(compare(bad)).success).toBe(false);
      expect(widgetConfigSchema.safeParse(order(bad)).success).toBe(false);
    }
  });

  it('a hint overlay, and a bar-graph format chart', () => {
    const hint = (overlay: StimulusSpec) => ({
      level: 3,
      kind: 'representation',
      say: 'h.frac.more-parts',
      overlay,
    });
    expect(hintStepSchema.safeParse(hint(good)).success).toBe(true);
    expect(hintStepSchema.safeParse(hint(badFraction)).success).toBe(false);
    expect(hintStepSchema.safeParse(hint(badChart)).success).toBe(false);
    const read = (c: ChartSpec) => ({
      format: 'bar-graph-read',
      chart: c,
      question: { type: 'difference', categories: ['fish', 'crab'] },
    });
    expect(widgetConfigSchema.safeParse(read(chart())).success).toBe(true);
    expect(widgetConfigSchema.safeParse(read(chart({ axisMax: 21 }))).success).toBe(false);
  });
});
