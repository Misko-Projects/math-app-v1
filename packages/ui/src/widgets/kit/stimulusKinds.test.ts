// No stimulus kind can be forgotten: the kinds table, the shared schema and StimulusView's switch
// name the same kinds, and every kind the table calls drawn renders a real picture (no placeholder
// card). The typecheck holds the table and the switch exhaustive; this holds them truthful.
import { readFileSync } from 'node:fs';
import {
  CHART_AXIS_STEPS_MAX,
  FRACTION_PARTS_MAX,
  type StimulusSpec,
  stimulusSpecSchema,
} from '@number-island/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { chartGeometry, NUMERAL_PX } from './chartLayout';
import { naturalPictureSize } from './FitPicture';
import { shapeFrame } from './fractionShapes';
import { StimulusView } from './StimulusView';
import { STIMULUS_KINDS, type StimulusKind, stimulusDrawn } from './stimulusKinds';

/** One valid sample of every kind (the record is typed over the union, so none can be missing). */
const SAMPLES: { [K in StimulusKind]: Extract<StimulusSpec, { kind: K }> } = {
  none: { kind: 'none' },
  objects: { kind: 'objects', set: { count: 3, sprite: 'fish', layout: 'line', layoutSeed: 1 } },
  dots: { kind: 'dots', arrangement: 'dice', groups: [5] },
  'ten-frame': { kind: 'ten-frame', frames: 1, filled: [7] },
  rekenrek: { kind: 'rekenrek', rows: [3, 4] },
  'base-ten': { kind: 'base-ten', hundreds: 1, tens: 2, ones: 3 },
  'number-line': { kind: 'number-line', min: 0, max: 10, ticksEvery: 1, labelsEvery: 5 },
  'bar-model': { kind: 'bar-model', parts: [5, '?'], whole: 12 },
  'number-bond': { kind: 'number-bond', whole: 7, parts: [3, 4] },
  groups: { kind: 'groups', groups: 2, perGroup: 3, sprite: 'fish' },
  array: { kind: 'array', rows: 2, cols: 3 },
  fraction: { kind: 'fraction', shape: 'bar', parts: 4, shaded: 1, equalParts: true },
  gauge: {
    kind: 'gauge',
    instrument: 'beaker',
    min: 0,
    max: 10,
    ticksEvery: 1,
    labelsEvery: 2,
    value: 6,
    unit: 'L',
  },
  clock: { kind: 'clock', h: 3, m: 0, numerals: true },
  coins: { kind: 'coins', coins: ['penny'] },
  shape: { kind: 'shape', shapes: [] },
  chart: {
    kind: 'chart',
    chart: {
      kind: 'bar',
      orientation: 'vertical',
      categories: [{ id: 'fish', label: 'noun.fish.many', value: 7 }],
      scale: 1,
      axisMax: 10,
    },
  },
  expression: { kind: 'expression', expr: { tokens: [{ t: 'num', v: 4 }] } },
  scene: { kind: 'scene', context: 'dock', sprites: [{ sprite: 'fish', count: 2 }] },
};

const html = (spec: StimulusSpec) => renderToStaticMarkup(createElement(StimulusView, { spec }));
const KINDS = Object.keys(STIMULUS_KINDS) as StimulusKind[];

describe('every stimulus kind is accounted for', () => {
  it('the table names exactly the kinds of the shared schema', () => {
    const schemaKinds = stimulusSpecSchema.options.map((o) => o.shape.kind.value);
    expect([...KINDS].sort()).toEqual([...schemaKinds].sort());
    for (const kind of KINDS)
      expect(stimulusSpecSchema.safeParse(SAMPLES[kind]).success).toBe(true);
  });

  it.each(KINDS)('%s renders what the table says', (kind) => {
    const out = html(SAMPLES[kind]);
    if (kind === 'none') {
      expect(out).toBe('');
      return;
    }
    expect(out).toContain(`data-kind="${kind}"`);
    // The placeholder card appears for the kinds the table marks, and for no other.
    expect(out.includes('data-unsupported="true"')).toBe(!stimulusDrawn(kind));
    if (!stimulusDrawn(kind)) expect(out).toContain('data-status="placeholder"');
  });

  it('chart and fraction are drawn (the compare and order pictures of K01 part 7)', () => {
    expect(STIMULUS_KINDS.chart).toBe('drawn');
    expect(STIMULUS_KINDS.fraction).toBe('drawn');
    const chart = html(SAMPLES.chart);
    expect(chart).toContain('class="ni-chart__bar"');
    expect(chart).toContain('data-value="7"');
    const fraction = html(SAMPLES.fraction);
    expect(fraction.match(/class="ni-fraction__part"/g)).toHaveLength(4);
    expect(fraction.match(/data-fraction="filled"/g)).toHaveLength(1);
  });

  it('StimulusView has one case per kind, the unfinished ones named together', () => {
    // Belt and braces for the compile-time check: every kind appears as a `case` before the
    // `default:` arm, so no kind reaches the fallback while the code compiles.
    const source = readFileSync(new URL('./StimulusView.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('switch (spec.kind)');
    const body = source.slice(start, source.indexOf('default:', start));
    expect(start).toBeGreaterThan(0);
    for (const kind of KINDS) expect(body, kind).toContain(`case '${kind}':`);
    expect(source).toContain('const unknown: never = spec;');
  });
});

describe('fitted picture sizes', () => {
  it('a fraction picture plans with its whole: one size for a shape, whatever its parts', () => {
    for (const shape of ['circle', 'rect', 'bar', 'loaf'] as const) {
      const frame = shapeFrame(shape);
      for (const parts of [1, 2, FRACTION_PARTS_MAX]) {
        const size = naturalPictureSize({
          kind: 'fraction',
          shape,
          parts,
          shaded: 1,
          equalParts: true,
        });
        expect(size).toEqual({ w: frame.width, h: frame.height });
      }
    }
  });

  it('a chart plans with the box its layout draws in, and keeps 32 px numerals', () => {
    for (const axisMax of [5, 10, CHART_AXIS_STEPS_MAX]) {
      const spec = { ...SAMPLES.chart, chart: { ...SAMPLES.chart.chart, axisMax } };
      const size = naturalPictureSize(spec);
      expect(size.w).toBeGreaterThan(160);
      expect(size.h).toBeGreaterThan(120);
      const g = chartGeometry(spec.chart, { width: size.w, height: size.h });
      expect({ w: g.width, h: g.height }).toEqual(size);
      expect(g.numeral).toBeGreaterThanOrEqual(NUMERAL_PX);
    }
  });
});
