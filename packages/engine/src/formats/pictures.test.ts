// One scale within a screen: compare and order refuse fraction and chart pictures that could not
// be drawn to one scale (formats/pictures.ts), and accept the K01 part 7 payloads (DAT.02.t4,
// FRA.08.t1–t3).
import type { ChartSpec, StimulusSpec } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { compare } from './compare';
import { order } from './order';

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
    expect(comparePaths(left, bar('crab', 2, { kind: 'tally' }))).toEqual(['right.chart']);
    expect(comparePaths(left, bar('crab', 2, { orientation: 'horizontal' }))).toEqual([
      'right.chart',
    ]);
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

  it('a picture beside another kind has no scale to share', () => {
    const numeral: StimulusSpec = { kind: 'expression', expr: { tokens: [{ t: 'num', v: 4 }] } };
    expect(comparePaths(bar('fish', 4), numeral)).toEqual([]);
    expect(comparePaths(fraction('bar', 4), numeral)).toEqual([]);
  });

  it('each side keeps its own supported ranges (the contract)', () => {
    expect(comparePaths(fraction('bar', 13), fraction('bar', 2))).toEqual(['left.parts']);
    expect(comparePaths(bar('fish', 4, { axisMax: 21 }), bar('crab', 2, { axisMax: 21 }))).toEqual([
      'left.chart.axisMax',
      'right.chart.axisMax',
    ]);
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
