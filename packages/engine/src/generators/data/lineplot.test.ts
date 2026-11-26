// 03 §5.6 data.lineplot (K02 #17, DAT.03): fixed params → widget, answer and solution per
// format; the schema bounds (accepts); and a property sweep: every accepted draw is a valid widget
// whose example answer and worked solution are correct.

import type { GeneratedItem, ItemFormat, ItemTemplate, ParamValues } from '@number-island/shared';
import { widgetConfigSchema } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { BUILD_LINE_POSITIONS_MAX, GRAPH_LINE_STACK_MAX } from '../../formats/bar-graph';
import { BUILD_DATA_MEASUREMENTS_MAX } from '../../formats/bar-graph-build';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { createRng } from '../../rng';
import { GenerationError } from '../types';
import { dataLineplot, READ_MEASUREMENTS_MAX, READ_POSITIONS_MAX } from './lineplot';

let nextId = 0;
function tpl(format: ItemFormat, fixed: ParamValues = {}): ItemTemplate {
  nextId += 1;
  return {
    id: `T.lineplot.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: format === 'bar-graph-build' ? 'concrete' : 'pictorial',
    generator: 'data.lineplot',
    params: Object.fromEntries(
      Object.entries(fixed).map(([k, v]) => [k, { kind: 'const' as const, value: v }]),
    ),
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params, { seed: 3 });

function expectSound(item: GeneratedItem, t: ItemTemplate) {
  expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const steps = itemSolution(item, t);
  expect(steps.length).toBeGreaterThan(1);
  const r = replaySteps(item, steps);
  if (r) expect(checkResponse(item, r).correct).toBe(true);
}

describe('data.lineplot', () => {
  it('builds a line plot from measurements: one X per length, a mark may stay empty', () => {
    const t = tpl('bar-graph-build', { question: 'build' });
    const item = make(t, {
      min: 4,
      positions: 4,
      precision: 1,
      x1: 2,
      x2: 0,
      x3: 3,
      x4: 1,
      question: 'build',
    });
    const w = item.widget as Extract<GeneratedItem['widget'], { format: 'bar-graph-build' }>;
    expect(w.mode).toBe('xs');
    expect(w.chart.lineScale).toEqual({ min: 4, max: 7, step: 1 });
    expect([...w.data.values].sort()).toEqual([4, 4, 6, 6, 6, 7]);
    expect(w.chart.categories.every((c) => c.value === 0)).toBe(true);
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'chart.values',
      target: { values: [2, 0, 3, 1] },
    });
    expect(item.params.measurements).toBe(6);
    expectSound(item, t);
  });

  it.each([
    ['how-many', { at: 2 }, 0],
    ['how-many', { at: 3 }, 3],
    ['total', {}, 6],
    ['difference', { at: 3, at2: 1 }, 1],
  ])('reads %s', (question, extra, value) => {
    const t = tpl('bar-graph-read', { question });
    const item = make(t, { min: 4, positions: 4, x1: 2, x2: 0, x3: 3, x4: 1, question, ...extra });
    expect(item.answer).toEqual({ kind: 'number', value });
    expectSound(item, t);
  });

  it('refuses what the widgets cannot draw or the question cannot ask', () => {
    const base = { min: 2, positions: 3, x1: 1, x2: 1, x3: 1 };
    const read = tpl('bar-graph-read', { question: 'how-many' });
    const build = tpl('bar-graph-build', { question: 'build' });
    const bad: [ItemTemplate, ParamValues][] = [
      [
        build,
        { ...base, positions: BUILD_LINE_POSITIONS_MAX + 1, x4: 1, x5: 1, question: 'build' },
      ],
      [build, { ...base, x1: 5, x2: 5, question: 'build' }], // 11 measurements
      [read, { ...base, positions: READ_POSITIONS_MAX + 1, question: 'how-many' }],
      [read, { ...base, x1: 0, question: 'how-many' }], // the scale starts before the data
      [read, { ...base, x3: 0, question: 'how-many' }], // the scale ends after the data
      [read, { ...base, x2: GRAPH_LINE_STACK_MAX + 1, question: 'how-many' }],
      [read, { ...base, at: 4, question: 'how-many' }],
      [read, { ...base, at: 1, at2: 2, question: 'difference' }], // equal stacks
      [read, { ...base, precision: 2, positions: 4, x4: 1, question: 'total' }], // ends mid-unit
      [read, { ...base, question: 'build' }],
      [build, { ...base, question: 'total' }],
    ];
    for (const [t, p] of bad) {
      expect(() => make(t, p), JSON.stringify(p)).toThrow(GenerationError);
    }
  });

  it('every accepted draw is a valid, answerable item (property sweep, 600 draws)', () => {
    const rng = createRng(17);
    const int = (lo: number, hi: number) => rng.int(lo, hi);
    let built = 0;
    for (let k = 0; k < 600; k += 1) {
      const question = (['build', 'how-many', 'total', 'difference'] as const)[k % 4] as string;
      const format: ItemFormat = question === 'build' ? 'bar-graph-build' : 'bar-graph-read';
      const t = tpl(format, { question });
      const params: ParamValues = {
        question,
        min: int(0, 12),
        positions: int(2, 7),
        precision: [1, 1, 2, 4][int(0, 3)] as number,
        at: int(1, 6),
        at2: int(1, 6),
      };
      for (let i = 1; i <= 6; i += 1) params[`x${i}`] = int(0, 4);
      if (!dataLineplot.accepts?.({ ...params, ...dataLineplot.derive(params) }, t)) continue;
      const item = make(t, params);
      expectSound(item, t);
      const n = params.positions as number;
      const all = (item.params.measurements as number) ?? 0;
      if (format === 'bar-graph-build') {
        expect(n).toBeLessThanOrEqual(BUILD_LINE_POSITIONS_MAX);
        expect(all).toBeLessThanOrEqual(BUILD_DATA_MEASUREMENTS_MAX);
      } else {
        expect(n).toBeLessThanOrEqual(READ_POSITIONS_MAX);
        expect(all).toBeLessThanOrEqual(READ_MEASUREMENTS_MAX);
      }
      built += 1;
    }
    expect(built).toBeGreaterThan(60);
  });

  it('draws from its defaults', () => {
    const t = tpl('bar-graph-build', {});
    expectSound(generateItem(t, 5), t);
  });
});
