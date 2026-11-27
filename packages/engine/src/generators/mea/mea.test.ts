// 03 §5.6 mea.length and mea.massvolume: fixed params → answer, widget and solution per format,
// exampleCorrect is correct, solutions replay through the format models that exist (order,
// number-pad, numeral-pick) and end with the answer, feature values at the extremes, validity
// (accepts), and the two measurement misconception rules.

import {
  type AnswerSpec,
  type ItemFormat,
  type ItemTemplate,
  type LessonStep,
  type ParamValues,
  widgetConfigSchema,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { biggerUnitMore } from '../../misconceptions/rules/biggerUnitMore';
import { rulerCountTicks, rulerReadEnd } from '../../misconceptions/rules/rulerReading';
import { unitGaps } from '../../misconceptions/rules/unitGaps';
import { registry } from '..';
import { GenerationError } from '../types';
import { lengthCloseness, NONSTANDARD_UNIT_SIZE, objectLengths } from './length';
import { clearlyLighter, gaugeFor, WEIGHABLES } from './massvolume';

let nextId = 0;
/** A test template without an id. */
function tplShape(
  generator: 'mea.length' | 'mea.massvolume',
  format: ItemFormat,
): Omit<ItemTemplate, 'id'> {
  return {
    skillId: 'X.01',
    format,
    tier: 'pictorial',
    generator,
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  };
}

function tpl(
  generator: 'mea.length' | 'mea.massvolume',
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  nextId += 1;
  return { id: `T.${generator}.${format}.${nextId}`, ...tplShape(generator, format), ...over };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

interface Case {
  name: string;
  t: ItemTemplate;
  params: ParamValues;
  answer: AnswerSpec | ((item: ReturnType<typeof generateItem>) => AnswerSpec);
  widget?: Record<string, unknown>;
  lastOp: string;
}

const LENGTH: Case[] = [
  {
    name: 'compare-length: the longer of 4 and 9',
    t: tpl('mea.length', 'compare-length', { tier: 'concrete' }),
    params: { mode: 'compare', ask: 'longer', length: 4, length2: 9 },
    answer: (item) => {
      const w = item.widget as unknown as { objects: { id: string; length: number }[] };
      return { kind: 'choice', id: w.objects.find((o) => o.length === 9)?.id ?? '' };
    },
    widget: { ask: 'longer', aligned: true },
    lastOp: 'answer',
  },
  {
    name: 'compare-length: the shorter, misaligned',
    t: tpl('mea.length', 'compare-length', { tier: 'concrete' }),
    params: { mode: 'compare', ask: 'shorter', length: 6, length2: 8, offset: 3 },
    answer: (item) => {
      const w = item.widget as { objects: { id: string; length: number }[] };
      return { kind: 'choice', id: w.objects.find((o) => o.length === 6)?.id ?? '' };
    },
    widget: { ask: 'shorter', aligned: false },
    lastOp: 'answer',
  },
  {
    name: 'compare-length: order three, shortest first',
    t: tpl('mea.length', 'compare-length', { tier: 'concrete' }),
    params: { mode: 'order', ask: 'shorter', objects: 3, length: 7, length2: 3, length3: 5 },
    answer: { kind: 'numbers', values: [3, 5, 7], ordered: true },
    widget: { ask: 'order', aligned: true },
    lastOp: 'answer',
  },
  {
    name: 'compare-length: indirect, with a string',
    t: tpl('mea.length', 'compare-length', { tier: 'concrete' }),
    params: { mode: 'indirect', ask: 'longer', length: 5, length2: 7 },
    answer: (item) => {
      const w = item.widget as { objects: { id: string; length: number }[] };
      return { kind: 'choice', id: w.objects.find((o) => o.length === 7)?.id ?? '' };
    },
    widget: { ask: 'indirect', aligned: false },
    lastOp: 'answer',
  },
  {
    name: 'compare-length: how much longer',
    t: tpl('mea.length', 'compare-length'),
    params: { mode: 'difference', length: 9, length2: 4 },
    answer: { kind: 'number', value: 5 },
    widget: { ask: 'how-much-longer' },
    lastOp: 'answer',
  },
  {
    name: 'compare: two ruler strips, the same',
    t: tpl('mea.length', 'compare'),
    params: { mode: 'compare', ask: 'longer', length: 6, same: true },
    answer: { kind: 'choice', id: 'same' },
    widget: { ask: 'longer', left: { kind: 'number-line', min: 0, max: 7 } },
    lastOp: 'answer',
  },
  {
    name: 'compare: which unit is needed more (cubes or sticks)',
    t: tpl('mea.length', 'compare'),
    params: { mode: 'two-units', ask: 'more', unit: 'stick', altUnit: 'cube', length: 2 },
    answer: (item) => {
      const w = item.widget as { left: { set: { sprite: string } } };
      return { kind: 'choice', id: w.left.set.sprite === 'cube' ? 'left' : 'right' };
    },
    widget: { ask: 'more' },
    lastOp: 'answer',
  },
  {
    name: 'order: three measured lengths, longest first',
    t: tpl('mea.length', 'order', { tier: 'abstract' }),
    params: { mode: 'order', ask: 'longer', objects: 3, length: 4, length2: 12, length3: 8 },
    answer: { kind: 'numbers', values: [12, 8, 4], ordered: true },
    widget: { direction: 'desc' },
    lastOp: 'drag',
  },
  {
    name: 'order: three ruler strips on one scale, longest first, no numerals (MEA.01)',
    t: tpl('mea.length', 'order', { representation: 'ruler' }),
    params: { mode: 'order', ask: 'longer', objects: 3, length: 6, length2: 2, length3: 9 },
    answer: { kind: 'numbers', values: [9, 6, 2], ordered: true },
    widget: {
      direction: 'desc',
      items: [
        { stimulus: { kind: 'number-line', min: 0, max: 10, labelsEvery: null } },
        { stimulus: { kind: 'number-line', min: 0, max: 10, labelsEvery: null } },
        { stimulus: { kind: 'number-line', min: 0, max: 10, labelsEvery: null } },
      ],
    },
    lastOp: 'drag',
  },
  {
    name: 'measure-length: two units, pictorial (MEA.22)',
    t: tpl('mea.length', 'measure-length', { representation: 'units' }),
    params: { mode: 'two-units', unit: 'shell', altUnit: 'cube', length: 3 },
    answer: { kind: 'numbers', values: [3, 6], ordered: true },
    widget: { tool: 'units', mode: 'two-units' },
    lastOp: 'answer',
  },
  {
    name: 'measure-length: iterate 6 shells',
    t: tpl('mea.length', 'measure-length', { tier: 'concrete' }),
    params: { mode: 'iterate', unit: 'shell', length: 6 },
    answer: {
      kind: 'state',
      checker: 'units.iterate',
      target: { length: 6, gapTolerance: 0.1 },
    },
    widget: { tool: 'units', unit: 'shell', mode: 'iterate', object: { length: 6 } },
    lastOp: 'answer',
  },
  {
    name: 'measure-length: two units, 8 cubes is 2 sticks',
    t: tpl('mea.length', 'measure-length', { tier: 'concrete' }),
    params: { mode: 'two-units', unit: 'cube', altUnit: 'stick', length: 8 },
    answer: { kind: 'numbers', values: [8, 2], ordered: true },
    widget: { tool: 'units', unit: 'cube', altUnit: 'stick', mode: 'two-units' },
    lastOp: 'answer',
  },
  {
    name: 'measure-length: read a ruler from 2 (K02 path)',
    t: tpl('mea.length', 'measure-length'),
    params: { mode: 'read', unit: 'cm', length: 5, offset: 2 },
    answer: { kind: 'number', value: 5 },
    widget: { tool: 'ruler', startOffset: 2, precision: 1, mode: 'read' },
    lastOp: 'answer',
  },
  {
    name: 'measure-length: read to the half inch (K02 path)',
    t: tpl('mea.length', 'measure-length'),
    params: { mode: 'read', unit: 'in', length: 40, precision: 2 },
    answer: { kind: 'number', value: 2.5 },
    widget: { precision: 0.5, object: { length: 40 } },
    lastOp: 'answer',
  },
  {
    name: 'number-pad: count 7 cubes laid along it',
    t: tpl('mea.length', 'number-pad'),
    params: { mode: 'iterate', unit: 'cube', length: 7 },
    answer: { kind: 'number', value: 7 },
    widget: { stimulus: { kind: 'objects', set: { count: 7, sprite: 'cube' } }, unit: null },
    lastOp: 'type',
  },
  {
    name: 'numeral-pick: count 5 sticks',
    t: tpl('mea.length', 'numeral-pick'),
    params: { mode: 'iterate', unit: 'stick', length: 5 },
    answer: { kind: 'choice', id: 'opt-5' },
    lastOp: 'tap',
  },
];

const MASS: Case[] = [
  {
    name: 'balance: a rock against a feather',
    t: tpl('mea.massvolume', 'balance', { tier: 'concrete' }),
    params: { instrument: 'balance', unit: 'none', value: 8, value2: 1 },
    answer: (item) => {
      const w = item.widget as { left: { terms: { object: string }[] } };
      return { kind: 'choice', id: w.left.terms[0]?.object === 'rock' ? 'left' : 'right' };
    },
    widget: { mode: 'which-heavier', showTilt: true, objectWeights: { rock: 8, feather: 1 } },
    lastOp: 'answer',
  },
  {
    name: 'balance: two apples stay level',
    t: tpl('mea.massvolume', 'balance', { tier: 'concrete' }),
    params: { instrument: 'balance', unit: 'none', value: 4, value2: 4 },
    answer: { kind: 'choice', id: 'same' },
    lastOp: 'answer',
  },
  {
    name: 'compare: which is heavier, a pumpkin or a leaf',
    t: tpl('mea.massvolume', 'compare'),
    params: { instrument: 'balance', unit: 'none', value: 2, value2: 9 },
    answer: (item) => {
      const w = item.widget as { left: { set: { sprite: string } } };
      return { kind: 'choice', id: w.left.set.sprite === 'pumpkin' ? 'left' : 'right' };
    },
    widget: { ask: 'heavier' },
    lastOp: 'answer',
  },
  {
    name: 'order: a feather, a pumpkin and an apple, heavy to light (MEA.16)',
    t: tpl('mea.massvolume', 'order', { representation: 'objects' }),
    params: { instrument: 'balance', unit: 'none', value: 1, value2: 9, value3: 4 },
    answer: { kind: 'numbers', values: [9, 4, 1], ordered: true },
    widget: { direction: 'desc' },
    lastOp: 'drag',
  },
  {
    name: 'shape-sort: heavier or lighter than an apple (MEA.16)',
    t: tpl('mea.massvolume', 'shape-sort', { representation: 'objects' }),
    params: { instrument: 'balance', unit: 'none', value: 4, cards: 4, hits: 2 },
    answer: (item) => {
      if (item.widget.format !== 'shape-sort') throw new Error('shape-sort');
      return {
        kind: 'state',
        checker: 'sort.byRule',
        target: {
          cards: item.widget.cards.map(({ id, card }) => ({
            id,
            props: 'props' in card ? card.props : {},
          })),
          bins: [
            { id: 'b0', rule: { prop: 'weight', op: '>=', value: 5 } },
            { id: 'b1', rule: { prop: 'weight', op: '<=', value: 3 } },
          ],
        },
      };
    },
    widget: { mode: 'sort', bins: [{ label: 'word.heavy' }, { label: 'word.light' }] },
    lastOp: 'drag-card',
  },
  {
    name: 'number-pad: read 30 g on a scale (K02 path)',
    t: tpl('mea.massvolume', 'number-pad'),
    params: { instrument: 'scale', unit: 'g', value: 30, ticksEvery: 10 },
    answer: { kind: 'number', value: 30 },
    widget: { unit: 'g', stimulus: { kind: 'gauge', ticksEvery: 10, labelsEvery: 20 } },
    lastOp: 'type',
  },
  {
    name: 'numeral-pick: read 3 L on a jug (K02 path)',
    t: tpl('mea.massvolume', 'numeral-pick'),
    params: { instrument: 'beaker', unit: 'L', value: 3 },
    answer: { kind: 'choice', id: 'opt-3' },
    lastOp: 'tap',
  },
];

// K02 slice 4b (MEA.10): how much longer on the number pad and numeral pick. These templates have
// fixed ids and leave the counter alone, so every other test template keeps its id (and its draws).
const k02 = (format: ItemFormat, n: number, over: Partial<ItemTemplate>): ItemTemplate => ({
  ...tplShape('mea.length', format),
  id: `T.mea.length.k02.${n}`,
  ...over,
});
const LENGTH_K02: Case[] = [
  {
    name: 'number-pad: how much longer, both on a ruler from 0 (MEA.10)',
    t: k02('number-pad', 1, { representation: 'ruler' }),
    params: { mode: 'difference', unit: 'in', length: 4, length2: 13 },
    answer: { kind: 'number', value: 9 },
    widget: {
      stimulus: {
        kind: 'number-line',
        min: 0,
        max: 14,
        marks: [{ at: 4 }, { at: 13, arrow: true }],
      },
      unit: 'in',
    },
    lastOp: 'type',
  },
  {
    name: 'number-pad: how much longer, the lengths in words only (MEA.10, symbols)',
    t: k02('number-pad', 2, { representation: 'symbols', tier: 'abstract' }),
    params: { mode: 'difference', unit: 'cm', length: 8, length2: 7 },
    answer: { kind: 'number', value: 1 },
    widget: { stimulus: { kind: 'none' }, unit: 'cm' },
    lastOp: 'type',
  },
  {
    name: 'numeral-pick: how much longer, both on a ruler from 0 (MEA.10)',
    t: k02('numeral-pick', 3, { representation: 'ruler' }),
    params: { mode: 'difference', unit: 'in', length: 6, length2: 11 },
    answer: { kind: 'choice', id: 'opt-5' },
    widget: {
      stimulus: { kind: 'number-line', max: 12, marks: [{ at: 6 }, { at: 11, arrow: true }] },
    },
    lastOp: 'tap',
  },
  // K02 slice 4c-1 (MEA.08): sort things into inches and feet; estimate beside one unit.
  {
    name: 'shape-sort: two feet things and two inch things into inches and feet (MEA.08)',
    t: k02('shape-sort', 4, { representation: 'objects' }),
    params: { mode: 'unit-sort', cards: 4, hits: 2 },
    answer: (item) => {
      const w = item.widget as unknown as {
        cards: { id: string; card: { props: { unit: string } } }[];
      };
      const feet = w.cards.filter((c) => c.card.props.unit === 'ft');
      expect(feet).toHaveLength(2);
      return item.answer;
    },
    widget: {
      mode: 'sort',
      bins: [
        { id: 'b0', label: 'unit.in.many', rule: { prop: 'unit', op: '==', value: 'in' } },
        { id: 'b1', label: 'unit.ft.many', rule: { prop: 'unit', op: '==', value: 'ft' } },
      ],
    },
    lastOp: 'drag-card',
  },
  {
    name: 'measure-length: about how many feet, beside one foot; 2, 7 or 21 (MEA.08)',
    t: k02('measure-length', 5, { representation: 'units' }),
    params: { mode: 'estimate', unit: 'ft', length: 7 },
    answer: { kind: 'choice', id: 'opt-7' },
    widget: { mode: 'estimate', input: 'pick' },
    lastOp: 'answer',
  },
];

describe.each([
  ['mea.length', [...LENGTH, ...LENGTH_K02]],
  ['mea.massvolume', MASS],
] as const)('%s', (generator, cases) => {
  it('covers every format the generator lists', () => {
    const formats = new Set(cases.map((k) => k.t.format));
    expect([...formats].sort()).toEqual([...(registry.get(generator)?.formats ?? [])].sort());
  });

  it.each(cases)('$name', ({ t, params, answer, widget, lastOp }) => {
    const item = generateItemFromParams(t, params);
    expect(item.widget.format).toBe(t.format);
    expect(item.answer).toEqual(typeof answer === 'function' ? answer(item) : answer);
    if (widget) expect(item.widget).toMatchObject(widget);
    const schema = formatModel(t.format)?.configSchema ?? widgetConfigSchema;
    const parsed = schema.safeParse(item.widget);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);

    expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);

    // The solution ends by entering the answer, and replays where a format model exists.
    const steps: LessonStep[] = itemSolution(item, t);
    expect(steps.length).toBeGreaterThan(1);
    expect(steps[steps.length - 1]?.action?.op).toBe(lastOp);
    if (formatModel(t.format)) {
      const r = replaySteps(item, steps);
      expect(r).not.toBeNull();
      expect(checkResponse(item, r as NonNullable<typeof r>).correct).toBe(true);
    }
    // The worked-step hint never plays the final (answering) step.
    const worked = item.hints.find((h) => h.level === 4);
    expect(worked?.actions ?? []).not.toContainEqual(steps[steps.length - 1]?.action);
  });

  it('builds every format from its default params', () => {
    for (const format of registry.get(generator)?.formats ?? []) {
      const t = tpl(generator, format);
      for (let seed = 0; seed < 20; seed += 1) {
        const item = generateItem(t, seed);
        expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
      }
    }
  });
});

describe('mea.length', () => {
  it.each([
    ['longer', 0],
    ['shorter', 0],
    ['longer', 3],
  ] as const)(
    'compare-length %s (offset %d): the worked step never highlights the difference',
    (ask, offset) => {
      const t = tpl('mea.length', 'compare-length', { tier: 'concrete' });
      const item = generateItemFromParams(t, {
        mode: 'compare',
        ask,
        length: 4,
        length2: 9,
        offset,
      });
      expect(item.widget).toMatchObject({ aligned: offset === 0 });
      const worked = item.hints.find((h) => h.level === 4);
      expect(worked).toBeDefined();
      expect(worked?.actions ?? []).not.toContainEqual({ op: 'highlight-difference' });
      // Show-me still points at the part that sticks out before it answers.
      const all = item.hints.find((h) => h.level === 5)?.actions ?? [];
      expect(all).toContainEqual({ op: 'highlight-difference' });
      expect(all.at(-1)?.op).toBe('answer');
    },
  );

  it('draws the other lengths from the template domain, all different', () => {
    const t = tpl('mea.length', 'compare-length', {
      tier: 'concrete',
      params: {
        mode: { kind: 'const', value: 'order' },
        ask: { kind: 'const', value: 'shorter' },
        objects: { kind: 'const', value: 4 },
        length: { kind: 'int', min: 2, max: 9 },
      },
    });
    for (let seed = 1; seed <= 50; seed += 1) {
      const ls = objectLengths(generateItem(t, seed).params);
      expect(ls).toHaveLength(4);
      expect(new Set(ls).size).toBe(4);
      for (const l of ls) expect(l >= 2 && l <= 9).toBe(true);
    }
  });

  it('rejects modes, asks and units its format cannot show', () => {
    const fails = (format: ItemFormat, params: ParamValues) =>
      expect(() => generateItemFromParams(tpl('mea.length', format), params)).toThrow(
        GenerationError,
      );
    fails('order', { mode: 'iterate', length: 4 });
    fails('compare', { mode: 'compare', ask: 'shorter', length: 4, length2: 6 });
    fails('compare-length', { mode: 'compare', length: 5, length2: 5 });
    fails('measure-length', { mode: 'two-units', unit: 'cube', altUnit: 'stick', length: 6 });
    fails('measure-length', { mode: 'two-units', unit: 'cube', altUnit: 'cube', length: 4 });
    fails('measure-length', { mode: 'read', unit: 'shell', length: 4 });
    fails('measure-length', { mode: 'iterate', unit: 'cube', length: 4, offset: 1 });
  });

  it('keeps the unit sizes consistent for two-unit measuring', () => {
    expect(NONSTANDARD_UNIT_SIZE).toEqual({ cube: 1, shell: 2, stick: 4 });
    const item = generateItemFromParams(tpl('mea.length', 'measure-length'), {
      mode: 'two-units',
      unit: 'stick',
      altUnit: 'shell',
      length: 3,
    });
    expect(item.answer).toEqual({ kind: 'numbers', values: [3, 6], ordered: true });
  });

  const features = (
    format: ItemFormat,
    params: ParamValues,
    tier: 'concrete' | 'pictorial' = 'pictorial',
  ) => {
    const t = tpl('mea.length', format, { tier });
    return itemFeatures(generateItemFromParams(t, params), t);
  };

  it('feature values at the extremes', () => {
    // Easiest direct comparison: far apart, lined up, two objects, "longer".
    expect(features('compare-length', { mode: 'compare', length: 2, length2: 10 })).toEqual({
      closeness: 0.2,
      misaligned: 0,
      'objects.over2': 0,
      indirect: 0,
      'ask.difference': 0,
      'ask.shorter': 0,
    });
    expect(
      features('compare-length', {
        mode: 'compare',
        ask: 'shorter',
        objects: 4,
        length: 9,
        length2: 10,
        length3: 3,
        length4: 5,
        offset: 2,
      }),
    ).toMatchObject({ closeness: 0.9, misaligned: 1, 'objects.over2': 2, 'ask.shorter': 1 });
    expect(features('compare-length', { mode: 'indirect', length: 4, length2: 5 })).toMatchObject({
      indirect: 1,
      closeness: 0.8,
    });
    expect(lengthCloseness([3, 6, 7])).toBeCloseTo(6 / 7);
    // The generator's math features, plus the compare format model's own (03 §5.5).
    expect(features('compare', { mode: 'compare', length: 5, same: true })).toEqual({
      closeness: 1,
      equal: 1,
      conflict: 0,
      'ask.fewer': 0,
      'ask.symbol': 0,
      magnitude: 0,
    });
    expect(
      features('compare', {
        mode: 'two-units',
        ask: 'fewer',
        unit: 'cube',
        altUnit: 'stick',
        length: 4,
      }),
    ).toEqual({
      closeness: 0.25,
      'ask.fewer': 1,
      conflict: 0,
      'ask.symbol': 0,
      equal: 0,
      magnitude: 0,
    });
    // The measure-length model (U05, #14) adds its 03 §5.5 format features; those the generator
    // does not set come from the config, 0 on these items.
    const mlZero = {
      offset: 0,
      'precision.half': 0,
      'precision.quarter': 0,
      'mode.estimate': 0,
      twoUnits: 0,
    };
    expect(features('measure-length', { mode: 'iterate', length: 3 }, 'concrete')).toEqual({
      ...mlZero,
      'length.over10': 0,
      'units.over5': 0,
      'tool.units': 1,
    });
    expect(
      features('measure-length', { mode: 'two-units', unit: 'cube', altUnit: 'shell', length: 12 }),
    ).toEqual({ ...mlZero, 'length.over10': 1, 'units.over5': 1.4, 'tool.units': 1, twoUnits: 1 });
    expect(
      features('measure-length', { mode: 'read', unit: 'in', length: 36, precision: 4, offset: 1 }),
    ).toEqual({
      ...mlZero,
      'length.over10': 0,
      offset: 1,
      'precision.half': 0,
      'precision.quarter': 1,
      'tool.units': 0,
    });
    // Order items carry only the order format's own features.
    expect(
      Object.keys(
        features('order', { mode: 'order', objects: 3, length: 2, length2: 5, length3: 9 }),
      ).sort(),
    ).toEqual(['closeness', 'desc', 'items', 'magnitude']);
  });
});

describe('mea.massvolume', () => {
  const features = (format: ItemFormat, params: ParamValues) => {
    const t = tpl('mea.massvolume', format, { tier: 'concrete' });
    return itemFeatures(generateItemFromParams(t, params), t);
  };

  it('maps weight steps to objects, lightest first', () => {
    expect(WEIGHABLES[0]).toBe('feather');
    expect(WEIGHABLES[8]).toBe('pumpkin');
    expect(WEIGHABLES).toHaveLength(9);
  });

  it('feature values at the extremes', () => {
    // The balance format model (U04, #13) adds its own format features; these are the math ones.
    expect(
      features('balance', { instrument: 'balance', unit: 'none', value: 1, value2: 9 }),
    ).toMatchObject({
      closeness: 0.11,
      conflict: 0,
      equal: 0,
    });
    expect(
      features('balance', { instrument: 'balance', unit: 'none', value: 2, value2: 5, objects: 2 }),
    ).toMatchObject({ closeness: 0.8, conflict: 1, equal: 0 });
    expect(
      features('balance', { instrument: 'balance', unit: 'none', value: 6, value2: 6 }),
    ).toMatchObject({
      closeness: 1,
      conflict: 0,
      equal: 1,
    });
    expect(
      features('number-pad', { instrument: 'beaker', unit: 'L', value: 4, ticksEvery: 1 }),
    ).toMatchObject({ 'tick.unlabeled': 0, 'ticksEvery.notOne': 0 });
    expect(
      features('number-pad', { instrument: 'scale', unit: 'kg', value: 15, ticksEvery: 5 }),
    ).toMatchObject({ 'tick.unlabeled': 1, 'ticksEvery.notOne': 1 });
  });

  it('only balances two identical objects, and never on the compare format', () => {
    const t = tpl('mea.massvolume', 'balance');
    expect(() =>
      generateItemFromParams(t, {
        instrument: 'balance',
        unit: 'none',
        value: 3,
        value2: 6,
        objects: 2,
      }),
    ).toThrow(GenerationError);
    expect(() =>
      generateItemFromParams(tpl('mea.massvolume', 'compare'), {
        instrument: 'balance',
        unit: 'none',
        value: 4,
        value2: 4,
      }),
    ).toThrow(GenerationError);
  });

  it('order: pictures with no numeral, the balance closeness of the nearest pair', () => {
    const t = tpl('mea.massvolume', 'order');
    const item = generateItemFromParams(t, {
      instrument: 'balance',
      unit: 'none',
      value: 2,
      value2: 9,
      value3: 4,
    });
    if (item.widget.format !== 'order') throw new Error('order');
    expect(item.widget.items.map((x) => x.label)).toEqual([undefined, undefined, undefined]);
    expect(
      item.widget.items.map((x) => (x.stimulus?.kind === 'objects' ? x.stimulus.set.sprite : '')),
    ).toEqual(expect.arrayContaining(['leaf', 'pumpkin', 'apple']));
    // The closest pair is the leaf and the apple: 2 / 4.
    expect(itemFeatures(item, t)).toMatchObject({ closeness: 0.5, magnitude: 0 });
    // The first step only says what to think of: the worked-step hint never places an object.
    const steps = itemSolution(item, t);
    expect(steps[0]?.action).toBeUndefined();
    // Two objects when value3 is 0; the same weight twice cannot be ordered.
    const two = generateItemFromParams(t, {
      instrument: 'balance',
      unit: 'none',
      value: 3,
      value2: 7,
    });
    expect(two.answer).toEqual({ kind: 'numbers', values: [7, 3], ordered: true });
    expect(() =>
      generateItemFromParams(t, {
        instrument: 'balance',
        unit: 'none',
        value: 3,
        value2: 7,
        value3: 3,
      }),
    ).toThrow(GenerationError);
    // A row everyday knowledge cannot settle (a melon and a rock, a feather and a leaf) is never
    // asked (review, PR #77: only CLEARLY_LIGHTER pairs).
    for (const [value, value2, value3] of [
      [2, 6, 8],
      [1, 2, 9],
      [1, 4, 5],
    ] as const)
      expect(() =>
        generateItemFromParams(t, { instrument: 'balance', unit: 'none', value, value2, value3 }),
      ).toThrow(GenerationError);
  });

  it('shape-sort: every card is a clear comparison with the object it is sorted against', () => {
    const t = tpl('mea.massvolume', 'shape-sort');
    for (const [value, cards, hits] of [
      [3, 4, 3],
      [4, 4, 2],
      [4, 6, 4],
    ] as const) {
      for (let seed = 0; seed < 20; seed += 1) {
        const item = generateItemFromParams(
          t,
          { instrument: 'balance', unit: 'none', value, cards, hits },
          { seed },
        );
        if (item.widget.format !== 'shape-sort') throw new Error('shape-sort');
        const ws = item.widget.cards.map(({ card }) =>
          'kind' in card && card.kind === 'object' ? Number(card.props.weight) : 0,
        );
        expect(ws).toHaveLength(cards);
        expect(new Set(ws).size).toBe(cards);
        expect(ws.filter((w) => clearlyLighter(value, w))).toHaveLength(hits);
        expect(ws.filter((w) => clearlyLighter(w, value))).toHaveLength(cards - hits);
        // The dividing object is never drawn, so no line names it (prompt or worked solution).
        expect(item.prompt.vars).toEqual({});
        for (const step of itemSolution(item, t)) expect(step.vars ?? {}).toEqual({});
        // Putting every card in the heavier bin is wrong.
        const all = {
          kind: 'state' as const,
          value: { bins: { b0: item.widget.cards.map((c) => c.id), b1: [] } },
        };
        expect(checkResponse(item, all).correct).toBe(false);
      }
    }
    expect(
      itemFeatures(
        generateItemFromParams(t, {
          instrument: 'balance',
          unit: 'none',
          value: 4,
          cards: 6,
          hits: 4,
        }),
        t,
      ),
    ).toMatchObject({ cards: 2 });
    // A shell has one thing clearly lighter (a feather); nothing is clearly heavier than a brick
    // or lighter than a feather.
    for (const params of [
      { value: 3, cards: 4, hits: 2 },
      { value: 7, cards: 4, hits: 2 },
      { value: 1, cards: 3, hits: 2 },
    ])
      expect(() =>
        generateItemFromParams(t, { instrument: 'balance', unit: 'none', ...params }),
      ).toThrow(GenerationError);
  });

  it('draws a gauge with labels every second tick and room above the reading', () => {
    expect(gaugeFor('scale', 70, 10, 'g')).toEqual({
      kind: 'gauge',
      instrument: 'scale',
      min: 0,
      max: 100,
      ticksEvery: 10,
      labelsEvery: 20,
      value: 70,
      unit: 'g',
    });
    expect(gaugeFor('beaker', 13, 1, 'L').max).toBe(14);
  });
});

// ---------- misconception rules ----------

describe('MC.unit-gaps (unitGaps)', () => {
  const t = tpl('mea.length', 'measure-length', { tier: 'concrete' });
  const item = () => generateItemFromParams(t, { mode: 'iterate', unit: 'cube', length: 4 });

  it.each([
    ['a gap between units', [0, 1, 2.5, 3.5], true],
    ['an overlap', [0, 0.5, 1.5, 2.5], true],
    ['a gap before the first unit', [0.6, 1.6, 2.6, 3.6], true],
    ['units end to end (a wrong count is not this misconception)', [0, 1, 2], false],
    ['small drift within the tolerance', [0.05, 1.05, 2.1, 3.1], false],
    ['small gaps that add up past the end', [0, 1.09, 2.18, 3.27], true],
    ['small overlaps that add up short of the end', [0, 0.91, 1.82, 2.73], true],
  ] as const)('%s → %s', (_name, units, expected) => {
    const r = { kind: 'state' as const, value: { units: [...units], value: units.length } };
    expect(unitGaps.match(item(), r)).toBe(expected);
  });

  it('does not apply to other answers', () => {
    const pad = generateItemFromParams(tpl('mea.length', 'number-pad'), {
      mode: 'iterate',
      length: 4,
    });
    expect(unitGaps.match(pad, { kind: 'number', value: 3 })).toBe(false);
    expect(unitGaps.kind).toBe('state');
    expect(unitGaps.predict).toBeUndefined();
  });
});

describe('MC.bigger-unit-more (biggerUnitMore)', () => {
  it('predicts the swapped counts on a two-unit measurement', () => {
    const item = generateItemFromParams(tpl('mea.length', 'measure-length'), {
      mode: 'two-units',
      unit: 'cube',
      altUnit: 'stick',
      length: 8,
    });
    expect(biggerUnitMore.predict?.(item)).toEqual({ kind: 'numbers', values: [2, 8] });
    expect(biggerUnitMore.match(item, { kind: 'numbers', values: [2, 8] })).toBe(true);
    expect(biggerUnitMore.match(item, { kind: 'numbers', values: [8, 3] })).toBe(false);
    expect(checkResponse(item, { kind: 'numbers', values: [2, 8] }).correct).toBe(false);
  });

  it('predicts the bigger unit as "needed more" on a compare item', () => {
    for (const ask of ['more', 'fewer']) {
      const item = generateItemFromParams(tpl('mea.length', 'compare'), {
        mode: 'two-units',
        ask,
        unit: 'shell',
        altUnit: 'stick',
        length: 2,
      });
      const correct = item.answer.kind === 'choice' ? item.answer.id : '';
      const other = correct === 'left' ? 'right' : 'left';
      expect(biggerUnitMore.predict?.(item)).toEqual({ kind: 'choice', id: other });
      expect(biggerUnitMore.match(item, { kind: 'choice', id: other })).toBe(true);
      expect(biggerUnitMore.match(item, { kind: 'choice', id: 'same' })).toBe(false);
    }
  });

  it('cannot discriminate on items that are not two-unit items', () => {
    const iterate = generateItemFromParams(tpl('mea.length', 'number-pad'), {
      mode: 'iterate',
      length: 4,
    });
    expect(biggerUnitMore.predict?.(iterate)).toBeNull();
    expect(biggerUnitMore.match(iterate, { kind: 'number', value: 4 })).toBe(false);
    const ruler = generateItemFromParams(tpl('mea.length', 'compare'), {
      mode: 'compare',
      length: 5,
      same: true,
    });
    expect(biggerUnitMore.predict?.(ruler)).toBeNull();
  });
});

describe('MC.ruler-count-ticks and MC.ruler-read-end (rulerReading, K02 MEA.03)', () => {
  // Fixed ids: the counter of the other test templates stays as it was.
  const t = (format: ItemFormat, n: number): ItemTemplate => ({
    ...tplShape('mea.length', format),
    id: `T.mea.length.ruler.${n}`,
  });

  it('from 0: counting the marks reads one step more; the end is the answer', () => {
    const pad = generateItemFromParams(t('number-pad', 1), { mode: 'read', unit: 'in', length: 5 });
    expect(rulerCountTicks.predict?.(pad)).toEqual({ kind: 'number', value: 6 });
    expect(rulerCountTicks.match(pad, { kind: 'number', value: 6 })).toBe(true);
    expect(rulerCountTicks.match(pad, { kind: 'number', value: 4 })).toBe(false);
    expect(rulerReadEnd.predict?.(pad)).toBeNull();
    const pick = generateItemFromParams(t('numeral-pick', 2), {
      mode: 'read',
      unit: 'cm',
      length: 7,
    });
    expect(rulerCountTicks.predict?.(pick)).toEqual({ kind: 'choice', id: 'opt-8' });
    const half = generateItemFromParams(t('number-pad', 3), {
      mode: 'read',
      unit: 'in',
      precision: 2,
      length: 40,
    });
    expect(rulerCountTicks.predict?.(half)).toEqual({ kind: 'number', value: 3 });
  });

  it('not from 0: reading the end number adds the start; counting marks does not apply', () => {
    const ml = generateItemFromParams(t('measure-length', 4), {
      mode: 'read',
      unit: 'cm',
      length: 5,
      offset: 2,
    });
    expect(ml.answer).toEqual({ kind: 'number', value: 5 });
    expect(rulerReadEnd.predict?.(ml)).toEqual({ kind: 'number', value: 7 });
    expect(rulerReadEnd.match(ml, { kind: 'number', value: 7 })).toBe(true);
    expect(rulerCountTicks.predict?.(ml)).toBeNull();
  });

  it('ignores items that are not ruler readings', () => {
    const iterate = generateItemFromParams(t('number-pad', 5), {
      mode: 'iterate',
      unit: 'cube',
      length: 5,
    });
    expect(rulerCountTicks.predict?.(iterate)).toBeNull();
    expect(rulerReadEnd.predict?.(iterate)).toBeNull();
    expect(rulerCountTicks.applies?.(iterate)).toBe(false);
    expect(rulerReadEnd.applies?.(iterate)).toBe(false);
  });
});

// K02 slice 4c-1 (MEA.09): one plank in centimeters and inches. Fixed template ids (the shared
// counter above numbers other tests' templates).
describe('mea.length two-units in centimeters and inches (MEA.09)', () => {
  const ml: ItemTemplate = {
    id: 'T.mea09.measure-length',
    ...tplShape('mea.length', 'measure-length'),
  };
  const pad: ItemTemplate = { id: 'T.mea09.number-pad', ...tplShape('mea.length', 'number-pad') };
  const params = (length: number): ParamValues => ({
    mode: 'two-units',
    ask: 'longer',
    unit: 'cm',
    altUnit: 'in',
    length,
  });
  const accepted = (t: ItemTemplate) =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => {
      const p = params(n);
      return registry
        .get('mea.length')
        ?.accepts?.({ ...p, ...registry.get('mea.length')?.derive?.(p) }, t);
    });

  it('draws only whole centimeters under 10 whose inch reading is 0.2 in or more from a half', () => {
    expect(accepted(ml)).toEqual([2, 3, 5, 7, 8]);
    expect(accepted(pad)).toEqual([2, 3, 5, 7, 8]);
    for (const n of accepted(ml)) {
      const inches = n / 2.54;
      expect(Math.abs(inches - Math.floor(inches) - 0.5)).toBeGreaterThanOrEqual(0.2);
      expect(Number.isInteger(inches)).toBe(false);
    }
  });

  it('measure-length: two rulers, answer [cm, nearest inch]; the solution reads both', () => {
    const item = generateItemFromParams(ml, params(8));
    expect(item.widget).toMatchObject({
      tool: 'ruler',
      unit: 'cm',
      altUnit: 'in',
      mode: 'two-units',
    });
    expect(item.answer).toEqual({ kind: 'numbers', values: [8, 3], ordered: true });
    expect(checkResponse(item, itemExampleCorrect(item, ml)).correct).toBe(true);
    const steps = itemSolution(item, ml);
    expect(steps.map((s) => s.action?.op)).toEqual(['align-zero', 'read-end', 'answer']);
    const r = replaySteps(item, steps);
    if (r) expect(checkResponse(item, r).correct).toBe(true);
    expect(biggerUnitMore.match(item, { kind: 'numbers', values: [3, 8] })).toBe(true);
  });

  it('no step before the last says a number (a faded lesson plays them before the turn; R1)', () => {
    const item = generateItemFromParams(ml, params(8));
    const steps = itemSolution(item, ml);
    for (const s of steps.slice(0, -1)) expect(Object.values(s.vars ?? {})).toEqual([]);
  });

  it('estimates put the answer in every position across seeds (R1)', () => {
    const est: ItemTemplate = {
      id: 'T.mea08.estimate',
      ...tplShape('mea.length', 'measure-length'),
      params: {
        mode: { kind: 'const', value: 'estimate' },
        unit: { kind: 'const', value: 'ft' },
        length: { kind: 'int', min: 2, max: 8 },
      },
    };
    const positions = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const item = generateItem(est, seed);
      if (item.widget.format !== 'measure-length' || item.answer.kind !== 'choice') continue;
      const length = item.widget.object.length;
      expect([...(item.widget.options ?? [])].sort((a, b) => a - b)).toEqual([
        Math.max(1, Math.round(length / 3)),
        length,
        3 * length,
      ]);
      positions.add((item.widget.options ?? []).indexOf(length));
    }
    expect([...positions].sort()).toEqual([0, 1, 2]);
  });

  it('number-pad: a centimeter ruler picture from 0, the centimeters asked, the inches told', () => {
    const item = generateItemFromParams(pad, params(7));
    expect(item.answer).toEqual({ kind: 'number', value: 7 });
    expect(item.params.altLength).toBe(3);
    expect(item.widget).toMatchObject({
      format: 'number-pad',
      unit: 'cm',
      stimulus: { kind: 'number-line', min: 0, max: 8, marks: [{ at: 0 }, { at: 7, arrow: true }] },
    });
    expect(biggerUnitMore.match(item, { kind: 'number', value: 3 })).toBe(true);
    expect(biggerUnitMore.match(item, { kind: 'number', value: 7 })).toBe(false);
  });
});
