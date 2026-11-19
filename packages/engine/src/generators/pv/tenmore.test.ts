// pv.tenmore (03 §5.6): fixed params → answer and widget per format, exampleCorrect and solution
// replay, near misses, feature values at the extremes, validity, and features that depend on the
// params only.

import type {
  AnswerSpec,
  ItemFormat,
  ItemTemplate,
  ParamSpec,
  ParamValues,
  Representation,
  Tier,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { createRng } from '../../rng';
import { GenerationError } from '../types';
import { pvTenMore, tenMoreFeatures } from './tenmore';

let nextId = 0;
function tpl(
  format: ItemFormat,
  tier: Tier,
  representation?: Representation,
  params: Record<string, ParamSpec> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.tenmore.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier,
    ...(representation ? { representation } : {}),
    generator: 'pv.tenmore',
    params,
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

interface Case {
  name: string;
  t: ItemTemplate;
  params: ParamValues;
  answer: AnswerSpec;
  widget?: Record<string, unknown>;
}

const CASES: Case[] = [
  {
    name: 'hundred-chart: 10 more than 34 is one row down',
    t: tpl('hundred-chart', 'pictorial'),
    params: { n: 34, delta: 10 },
    answer: { kind: 'number', value: 44 },
    widget: { first: 1, rows: 10, mode: 'move', from: 34, moves: ['down'], hidden: [] },
  },
  {
    name: 'hundred-chart: 10 less than 34 is one row up',
    t: tpl('hundred-chart', 'pictorial'),
    params: { n: 34, delta: -10 },
    answer: { kind: 'number', value: 24 },
    widget: { moves: ['up'] },
  },
  {
    name: 'hundred-chart: 34, 44, 54, 55, 56 (two tens and two ones, CNT.20)',
    t: tpl('hundred-chart', 'pictorial'),
    params: { n: 34, delta: 10, moves: 2, ones: 2 },
    answer: { kind: 'number', value: 56 },
    widget: { moves: ['down', 'down', 'right', 'right'] },
  },
  {
    name: 'hundred-chart: back by tens and ones on a 1–120 chart',
    t: tpl('hundred-chart', 'pictorial'),
    params: { n: 105, delta: -10, moves: 1, ones: -3 },
    answer: { kind: 'number', value: 92 },
    widget: { first: 1, rows: 12, moves: ['up', 'left', 'left', 'left'] },
  },
  {
    name: 'base-ten-build: 34 prebuilt, put in a ten',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { n: 34, delta: 10 },
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 44 } },
    widget: {
      target: 44,
      mode: 'build',
      prebuilt: { hundreds: 0, tens: 3, ones: 4 },
      pieces: { thousands: false, hundreds: false, tens: true, ones: true },
    },
  },
  {
    name: 'base-ten-build: 10 less than 47 takes a ten away',
    t: tpl('base-ten-build', 'concrete', 'bundles'),
    params: { n: 47, delta: -10 },
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 37 } },
  },
  {
    name: 'base-ten-build: 100 more than 245, and two ones',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { n: 245, delta: 100, ones: 2 },
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 347 } },
    widget: { pieces: { thousands: false, hundreds: true, tens: true, ones: true } },
  },
  {
    name: 'number-pad symbols: 34 + 10 = ?',
    t: tpl('number-pad', 'abstract', 'symbols'),
    params: { n: 34, delta: 10 },
    answer: { kind: 'number', value: 44 },
    widget: {
      stimulus: { kind: 'none' },
      expression: {
        tokens: [
          { t: 'num', v: 34 },
          { t: 'op', v: '+' },
          { t: 'num', v: 10 },
          { t: 'rel', v: '=' },
          { t: 'blank', id: 'x' },
        ],
      },
      blanks: [{ id: 'x', maxDigits: 3 }],
    },
  },
  {
    name: 'number-pad symbols: 52 − 20 + 3 = ?',
    t: tpl('number-pad', 'abstract'),
    params: { n: 52, delta: -10, moves: 2, ones: 3 },
    answer: { kind: 'number', value: 35 },
    widget: {
      expression: {
        tokens: [
          { t: 'num', v: 52 },
          { t: 'op', v: '-' },
          { t: 'num', v: 20 },
          { t: 'op', v: '+' },
          { t: 'num', v: 3 },
          { t: 'rel', v: '=' },
          { t: 'blank', id: 'x' },
        ],
      },
    },
  },
  {
    name: 'number-pad base-ten: a picture of n, no expression',
    t: tpl('number-pad', 'pictorial', 'base-ten'),
    params: { n: 63, delta: -10 },
    answer: { kind: 'number', value: 53 },
    widget: { stimulus: { kind: 'base-ten', hundreds: 0, tens: 6, ones: 3 } },
  },
  {
    name: 'number-line-jump: jump ten twice, then one, landing typed',
    t: tpl('number-line-jump', 'pictorial', 'open-number-line'),
    params: { n: 34, delta: 10, moves: 2, ones: 1 },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 34, target: 55, allowedJumps: [10, 1], value: 55 },
    },
    widget: {
      min: 20,
      max: 70,
      path: 'open',
      goal: 'add',
      ticksEvery: null,
      labelsEvery: null,
      thenAsk: 'landing',
    },
  },
  {
    name: 'number-line-jump: ten less',
    t: tpl('number-line-jump', 'pictorial', 'open-number-line'),
    params: { n: 40, delta: -10 },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 40, target: 30, allowedJumps: [-10], value: 30 },
    },
    widget: { min: 20, max: 50, goal: 'subtract' },
  },
];

describe('pv.tenmore formats', () => {
  it('covers every format the generator lists', () => {
    expect([...new Set(CASES.map((c) => c.t.format))].sort()).toEqual(
      [...pvTenMore.formats].sort(),
    );
  });

  it.each(CASES)('$name', ({ t, params, answer, widget }) => {
    const item = generateItemFromParams(t, params);
    expect(item.answer).toEqual(answer);
    if (widget) expect(item.widget).toMatchObject(widget);
    const model = formatModel(t.format);
    if (!model) throw new Error(`no model for ${t.format}`);
    const parsed = model.configSchema.safeParse(item.widget);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
    const steps = itemSolution(item, t);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    const result = item.params.result as number;
    for (const s of steps.slice(0, -1)) {
      // Steps before the last never enter the answer or name it.
      expect(['answer', 'type', 'tap', 'fill', 'label-landing']).not.toContain(s.action?.op);
      expect(Object.values(s.vars ?? {})).not.toContain(result);
    }
    const replayed = replaySteps(item, steps);
    expect(replayed).not.toBeNull();
    expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);
  });

  it('rejects near misses: one ten or one off', () => {
    const pad = generateItemFromParams(tpl('number-pad', 'abstract'), { n: 34, delta: 10 });
    for (const v of [43, 45, 34, 54]) {
      expect(checkResponse(pad, { kind: 'number', value: v }).correct).toBe(false);
    }
    const build = generateItemFromParams(tpl('base-ten-build', 'concrete'), { n: 34, delta: 10 });
    expect(
      checkResponse(build, {
        kind: 'state',
        value: { thousands: 0, hundreds: 0, tens: 3, ones: 4 },
      }).correct,
    ).toBe(false);
    // Any mat worth 44 is right, even 3 tens and 14 ones.
    expect(
      checkResponse(build, {
        kind: 'state',
        value: { thousands: 0, hundreds: 0, tens: 3, ones: 14 },
      }).correct,
    ).toBe(true);
    const line = generateItemFromParams(tpl('number-line-jump', 'pictorial', 'open-number-line'), {
      n: 34,
      delta: 10,
    });
    expect(checkResponse(line, { kind: 'state', value: { jumps: [10], value: 45 } }).correct).toBe(
      false,
    );
    expect(checkResponse(line, { kind: 'state', value: { jumps: [10], value: 44 } }).correct).toBe(
      true,
    );
  });
});

describe('pv.tenmore validity', () => {
  it.each<[string, ItemFormat, ParamValues]>([
    ['delta must be ±10 or ±100', 'number-pad', { n: 34, delta: 5 }],
    ['the result must stay positive', 'number-pad', { n: 8, delta: -10 }],
    ['moves are 1–9', 'number-pad', { n: 34, delta: 10, moves: 0 }],
    ['ones are at most 9', 'number-pad', { n: 34, delta: 10, ones: 10 }],
    ['the chart takes tens only', 'hundred-chart', { n: 134, delta: 100 }],
    ['the chart holds every number', 'hundred-chart', { n: 95, delta: 10, moves: 3 }],
    ['the ones stay in the row', 'hundred-chart', { n: 38, delta: 10, ones: 3 }],
    ['a build never trades a ten', 'base-ten-build', { n: 95, delta: 10 }],
    ['a build never trades a one', 'base-ten-build', { n: 37, delta: 10, ones: 5 }],
    ['taking a ten from no tens trades', 'base-ten-build', { n: 104, delta: -10 }],
  ])('%s', (_name, format, params) => {
    expect(() => generateItemFromParams(tpl(format, 'pictorial'), params)).toThrow(GenerationError);
  });

  it('the row rule allows the last box of a row', () => {
    // 35 → 45 → 50: 50 ends the row of 41–50 on a 1–100 chart.
    const item = generateItemFromParams(tpl('hundred-chart', 'pictorial'), {
      n: 35,
      delta: 10,
      ones: 5,
    });
    expect(item.answer).toEqual({ kind: 'number', value: 50 });
  });
});

describe('pv.tenmore features', () => {
  it.each<[string, ParamValues, Record<string, number>]>([
    [
      'ten more is the easiest: every feature 0',
      { n: 34, delta: 10 },
      { minus: 0, crossCentury: 0, threeDigit: 0, extraMoves: 0, withOnes: 0 },
    ],
    ['ten less', { n: 34, delta: -10 }, { minus: 1 }],
    ['crossing a hundred', { n: 95, delta: 10 }, { crossCentury: 1, threeDigit: 1 }],
    ['three moves', { n: 14, delta: 10, moves: 3 }, { extraMoves: 2 }],
    ['ones after the tens', { n: 14, delta: 10, ones: -2 }, { withOnes: 1 }],
  ])('%s', (_name, params, want) => {
    const t = tpl('number-pad', 'abstract');
    const got = itemFeatures(generateItemFromParams(t, params), t);
    for (const [k, v] of Object.entries(want)) expect(got[k], k).toBe(v);
  });

  it('feature values depend on the params only, never on the build RNG', () => {
    for (const format of pvTenMore.formats) {
      const t = tpl(format, 'pictorial', undefined, {
        n: { kind: 'int', min: 11, max: 79 },
        delta: { kind: 'choice', values: [10, -10] },
      });
      for (let seed = 1; seed <= 20; seed += 1) {
        const item = generateItem(t, seed);
        const rebuilt = pvTenMore.build({
          params: item.params,
          template: t,
          rng: createRng(seed * 7919).fork('other'),
        });
        expect(rebuilt.features).toEqual(itemFeatures(item, t));
        expect(rebuilt.features).toMatchObject(tenMoreFeatures(item.params));
      }
    }
  });

  it('derives the result', () => {
    expect(pvTenMore.derive({ n: 34, delta: 10, moves: 2, ones: -1 })).toEqual({ result: 53 });
    expect(pvTenMore.derive({ n: 340, delta: -100 })).toEqual({ result: 240 });
  });
});
