// One scale within a screen: compare and order refuse fraction and chart pictures that could not
// be drawn to one scale (formats/pictures.ts), and accept the K01 part 7 payloads (DAT.02.t4,
// FRA.08.t1–t3).
import { type ChartSpec, compareConfigSchema, type StimulusSpec } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compare } from './compare';
import { order } from './order';
import { CHART_COMPARE_ASKS, misplacedCharts, sharedScaleIssues } from './pictures';

const fraction = (shape: 'circle' | 'rect' | 'bar' | 'loaf', parts: number): StimulusSpec => ({
  kind: 'fraction',
  shape,
  parts,
  shaded: 1,
  equalParts: true,
});
const bar = (id: string, value: number, over: Partial<ChartSpec> = {}): StimulusSpec => ({
  kind: 'chart',
  chart: {
    kind: 'bar',
    orientation: 'vertical',
    categories: [{ id, label: `noun.${id}.many`, value }],
    scale: 1,
    axisMax: 10,
    ...over,
  },
});

const comparePaths = (left: StimulusSpec, right: StimulusSpec) => {
  const r = compare.configSchema.safeParse({
    format: 'compare',
    left,
    right,
    ask: 'more',
    allowMatchLines: false,
  });
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};
const orderPaths = (...pictures: StimulusSpec[]) => {
  const r = order.configSchema.safeParse({
    format: 'order',
    items: pictures.map((stimulus, i) => ({ id: `obj-${i}`, value: i, stimulus })),
    direction: 'asc',
  });
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('compare: pictures on one scale', () => {
  it('accepts the fraction and chart payloads of FRA.08.t1, FRA.08.t2 and DAT.02.t4', () => {
    for (const den of [2, 3, 4, 6, 8]) {
      for (const den2 of [2, 3, 4, 6, 8]) {
        expect(comparePaths(fraction('bar', den), fraction('bar', den2))).toEqual([]);
        expect(comparePaths(fraction('circle', den), fraction('circle', den2))).toEqual([]);
      }
    }
    for (let a = 1; a <= 10; a += 1) {
      const axisMax = Math.max(5, a, 11 - a);
      expect(comparePaths(bar('fish', a, { axisMax }), bar('crab', 11 - a, { axisMax }))).toEqual(
        [],
      );
    }
  });

  it('fraction sides are wholes of one shape', () => {
    expect(comparePaths(fraction('bar', 2), fraction('circle', 2))).toEqual(['right.shape']);
    expect(comparePaths(fraction('rect', 2), fraction('loaf', 4))).toEqual(['right.shape']);
  });

  it('chart sides share kind, orientation, scale and axis top', () => {
    const left = bar('fish', 4);
    // (A tally chart or a horizontal graph is also refused as a stimulus, by the contract.)
    expect(comparePaths(left, bar('crab', 2, { kind: 'tally' }))).toContain('right.chart');
    expect(comparePaths(left, bar('crab', 2, { orientation: 'horizontal' }))).toContain(
      'right.chart',
    );
    const two = [
      { id: 'crab', label: 'noun.crab.many', value: 2 },
      { id: 'shell', label: 'noun.shell.many', value: 3 },
    ];
    expect(comparePaths(left, bar('crab', 2, { categories: two }))).toEqual(['right.chart']);
    expect(comparePaths(left, bar('crab', 2, { scale: 2 }))).toEqual(['right.chart']);
    expect(comparePaths(left, bar('crab', 2, { axisMax: 5 }))).toEqual(['right.chart']);
    // The axis top is what is drawn: axisMax rounded up to the scale.
    expect(
      comparePaths(
        bar('fish', 4, { scale: 5, axisMax: 16 }),
        bar('crab', 2, { scale: 5, axisMax: 20 }),
      ),
    ).toEqual([]);
  });

  it('a fraction picture beside another kind has no scale to share', () => {
    const numeral: StimulusSpec = { kind: 'expression', expr: { tokens: [{ t: 'num', v: 4 }] } };
    expect(comparePaths(fraction('bar', 4), numeral)).toEqual([]);
  });

  it('bars that differ only in unused lineScale metadata are on one scale', () => {
    const lineScale = { min: 0, max: 4, step: 1 };
    expect(comparePaths(bar('fish', 4), bar('crab', 2, { lineScale }))).toEqual([]);
    expect(comparePaths(bar('fish', 4, { lineScale }), bar('crab', 2))).toEqual([]);
  });

  it('each side keeps its own supported ranges (the contract)', () => {
    expect(comparePaths(fraction('bar', 13), fraction('bar', 2))).toEqual(['left.parts']);
    expect(comparePaths(bar('fish', 4, { axisMax: 21 }), bar('crab', 2, { axisMax: 21 }))).toEqual([
      'left.chart.axisMax',
      'right.chart.axisMax',
    ]);
  });
});

describe('compare: where a chart may sit (numerals stay 32 px)', () => {
  const config = (left: StimulusSpec, right: StimulusSpec, ask: string) => {
    const r = compare.configSchema.safeParse({
      format: 'compare',
      left,
      right,
      ask,
      allowMatchLines: false,
    });
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  };
  const numeral: StimulusSpec = { kind: 'expression', expr: { tokens: [{ t: 'num', v: 4 }] } };

  it('chart sides take the side-pick asks, more and fewer', () => {
    expect(CHART_COMPARE_ASKS).toEqual(['more', 'fewer']);
    for (const ask of CHART_COMPARE_ASKS) {
      expect(config(bar('fish', 4), bar('crab', 2), ask)).toEqual([]);
    }
  });

  it.each(['symbol', 'same-or-not', 'true-false', 'longer', 'heavier'])(
    'chart sides refuse the %s ask (its answer row leaves a chart too little height)',
    (ask) => {
      expect(config(bar('fish', 4), bar('crab', 2), ask)).toEqual(['ask']);
    },
  );

  it('every ask of the format is either a chart ask or refused for charts', () => {
    const asks = compareConfigSchema.shape.ask.options;
    expect(asks.length).toBeGreaterThan(CHART_COMPARE_ASKS.length);
    for (const ask of asks) {
      const refused = config(bar('fish', 4), bar('crab', 2), ask).includes('ask');
      expect(refused, ask).toBe(!CHART_COMPARE_ASKS.includes(ask));
    }
  });

  it('a chart is compared with a chart, never with another kind of picture', () => {
    expect(config(bar('fish', 4), numeral, 'more')).toEqual(['right']);
    expect(config(numeral, bar('fish', 4), 'fewer')).toEqual(['left']);
    const blocks: StimulusSpec = { kind: 'base-ten', hundreds: 9, tens: 9, ones: 9 };
    expect(config(blocks, bar('fish', 4), 'more')).toEqual(['left']);
    expect(config(bar('fish', 4), { kind: 'none' }, 'true-false')).toEqual(['ask', 'right']);
  });

  it('sides without charts are unaffected', () => {
    expect(config(numeral, numeral, 'symbol')).toEqual([]);
    expect(config(fraction('bar', 2), fraction('bar', 4), 'more')).toEqual([]);
  });
});

describe('misplacedCharts: a chart stimulus sits only on a compare side', () => {
  const chart = bar('fish', 4);
  it('compare sides are the one place', () => {
    expect(
      misplacedCharts({
        widget: { format: 'compare', left: chart, right: chart, ask: 'more' },
        hints: [],
      }),
    ).toEqual([]);
  });

  it('any other format, an order card and a hint overlay are reported with their paths', () => {
    expect(misplacedCharts({ widget: { format: 'number-pad', stimulus: chart } })).toEqual([
      'widget.stimulus',
    ]);
    expect(misplacedCharts({ widget: { format: 'numeral-pick', stimulus: chart } })).toEqual([
      'widget.stimulus',
    ]);
    expect(
      misplacedCharts({
        widget: { format: 'order', items: [{ id: 'a', value: 1, stimulus: chart }] },
      }),
    ).toEqual(['widget.items.0.stimulus']);
    expect(
      misplacedCharts({
        widget: { format: 'compare', left: chart, right: chart, ask: 'more' },
        hints: [{ level: 3, kind: 'representation', say: 'h.x', overlay: chart }],
      }),
    ).toEqual(['hints.0.overlay']);
    // Only a side itself: a chart nested deeper in a compare config is not a side.
    expect(
      misplacedCharts({ widget: { format: 'compare', left: { nested: chart }, right: chart } }),
    ).toEqual(['widget.left.nested']);
  });

  it('the bar-graph formats hold a ChartSpec, not a chart stimulus, and are left alone', () => {
    const spec = chart.kind === 'chart' ? chart.chart : null;
    expect(misplacedCharts({ widget: { format: 'bar-graph-read', chart: spec } })).toEqual([]);
    expect(misplacedCharts({ widget: { format: 'tap-count', set: { count: 3 } } })).toEqual([]);
  });
});

describe('sharedScaleIssues: charts of every kind', () => {
  const paths = (...specs: StimulusSpec[]) => {
    const schema = z.unknown().superRefine((_v, ctx) =>
      sharedScaleIssues(
        specs,
        ctx,
        specs.map((_s, i) => [i]),
      ),
    );
    const r = schema.safeParse(null);
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  };
  const plot = (max: number, step = 1): StimulusSpec => ({
    kind: 'chart',
    chart: {
      kind: 'line-plot',
      orientation: 'horizontal',
      categories: [{ id: '1', label: 'noun.fish.many', value: 2 }],
      scale: 1,
      axisMax: 5,
      lineScale: { min: 0, max, step },
    },
  });

  it('line plots share their position scale (one px per unit across)', () => {
    expect(paths(plot(2), plot(2))).toEqual([]);
    expect(paths(plot(2), plot(4))).toEqual(['1.chart']);
    expect(paths(plot(2), plot(2, 0.5))).toEqual(['1.chart']);
    expect(paths(plot(4), plot(4), plot(2))).toEqual(['2.chart']);
  });

  it('pictures of other kinds are left alone', () => {
    expect(
      paths({ kind: 'none' }, plot(2), { kind: 'dots', arrangement: 'dice', groups: [3] }),
    ).toEqual([]);
  });
});

describe('order: pictures on one scale', () => {
  it('accepts the strips of FRA.08.t3 (two or three different wholes of one shape)', () => {
    expect(orderPaths(fraction('bar', 4), fraction('bar', 2))).toEqual([]);
    expect(orderPaths(fraction('bar', 4), fraction('bar', 2), fraction('bar', 8))).toEqual([]);
  });

  it('fraction cards are wholes of one shape', () => {
    expect(orderPaths(fraction('bar', 4), fraction('bar', 2), fraction('circle', 8))).toEqual([
      'items.2.stimulus.shape',
    ]);
  });

  it('a card never shows a chart (its numerals could not keep 32 px)', () => {
    expect(orderPaths(bar('fish', 4), bar('crab', 2))).toEqual([
      'items.0.stimulus',
      'items.1.stimulus',
    ]);
    expect(orderPaths(fraction('bar', 4), bar('crab', 2))).toEqual(['items.1.stimulus']);
  });

  it('numeral cards and mixed cards are unaffected', () => {
    const r = order.configSchema.safeParse({
      format: 'order',
      items: [
        { id: 'a', value: 1 },
        { id: 'b', value: 2, stimulus: fraction('bar', 2) },
      ],
      direction: 'asc',
    });
    expect(r.success).toBe(true);
  });
});
