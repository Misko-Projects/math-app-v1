// pv.regroup (03 §5.6): fixed params → answer and widget per format, exampleCorrect and solution
// replay, near misses, feature values at the extremes, validity, the trade helpers, and features
// that depend on the params only.

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
import { decompose, pvRegroup, regroupFeatures, tradesBetween } from './regroup';

let nextId = 0;
function tpl(
  format: ItemFormat,
  tier: Tier,
  representation?: Representation,
  params: Record<string, ParamSpec> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.regroup.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier,
    ...(representation ? { representation } : {}),
    generator: 'pv.regroup',
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

const hto = (hundreds: number, tens: number, ones: number) => ({ hundreds, tens, ones });

const CASES: Case[] = [
  {
    name: 'base-ten-trade: unbundle a ten, 34 as 2 tens 14 ones',
    t: tpl('base-ten-trade', 'pictorial', 'base-ten'),
    params: { n: 34, from: 'canonical', to: 'regrouped' },
    answer: { kind: 'state', checker: 'trade.result', target: { regroupTarget: hto(0, 2, 14) } },
    widget: {
      start: hto(0, 3, 4),
      goal: 'regroup-to',
      regroupTarget: hto(0, 2, 14),
      showAlgorithm: false,
      thenAsk: false,
    },
  },
  {
    name: 'base-ten-trade: bundle ten ones back into a ten (pv-chart)',
    t: tpl('base-ten-trade', 'pictorial', 'pv-chart'),
    params: { n: 47, from: 'regrouped', to: 'canonical' },
    answer: { kind: 'state', checker: 'trade.result', target: { regroupTarget: hto(0, 4, 7) } },
    widget: { start: hto(0, 3, 17) },
  },
  {
    name: 'base-ten-trade: a hundred split into tens (305)',
    t: tpl('base-ten-trade', 'concrete', 'base-ten'),
    params: { n: 305, from: 'canonical', to: 'regrouped', places: 3 },
    answer: { kind: 'state', checker: 'trade.result', target: { regroupTarget: hto(2, 10, 5) } },
  },
  {
    name: 'base-ten-trade: all ones to tens and ones',
    t: tpl('base-ten-trade', 'concrete', 'bundles'),
    params: { n: 23, from: 'ones', to: 'canonical' },
    answer: { kind: 'state', checker: 'trade.result', target: { regroupTarget: hto(0, 2, 3) } },
  },
  {
    name: 'base-ten-build: 14 ones prebuilt, make one ten and 4 ones',
    t: tpl('base-ten-build', 'concrete', 'bundles'),
    params: { n: 14, from: 'ones', to: 'canonical' },
    answer: {
      kind: 'state',
      checker: 'baseten.exact',
      target: { value: 14, exact: { tens: 1, ones: 4 } },
    },
    widget: {
      target: 14,
      mode: 'build-exact',
      prebuilt: hto(0, 0, 14),
      exact: { tens: 1, ones: 4 },
      pieces: { thousands: false, hundreds: false, tens: true, ones: true },
    },
  },
  {
    name: 'base-ten-build: unbundle 52 into 4 tens 12 ones',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { n: 52, from: 'canonical', to: 'regrouped' },
    answer: {
      kind: 'state',
      checker: 'baseten.exact',
      target: { value: 52, exact: { tens: 4, ones: 12 } },
    },
  },
  {
    name: 'base-ten-build: 340 with the hundreds named',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { n: 340, from: 'regrouped', to: 'canonical', places: 3 },
    answer: {
      kind: 'state',
      checker: 'baseten.exact',
      target: { value: 340, exact: { hundreds: 3, tens: 4, ones: 0 } },
    },
  },
  {
    name: 'number-pad symbols: 1 ten and 14 ones is how many?',
    t: tpl('number-pad', 'abstract', 'symbols'),
    params: { n: 24, from: 'regrouped' },
    answer: { kind: 'number', value: 24 },
    widget: { stimulus: { kind: 'none' }, blanks: [{ id: 'x', maxDigits: 3 }] },
  },
  {
    name: 'number-pad base-ten: a picture of the regrouped pieces',
    t: tpl('number-pad', 'pictorial', 'base-ten'),
    params: { n: 36, from: 'regrouped' },
    answer: { kind: 'number', value: 36 },
    widget: { stimulus: { kind: 'base-ten', hundreds: 0, tens: 2, ones: 16 } },
  },
  {
    name: 'number-pad ten-frame: a full ten and the ones',
    t: tpl('number-pad', 'pictorial', 'ten-frame'),
    params: { n: 16, from: 'canonical' },
    answer: { kind: 'number', value: 16 },
    widget: { stimulus: { kind: 'ten-frame', frames: 2, filled: [10, 6] } },
  },
  {
    name: 'make-set: bundle every ten of 23 loose shells',
    t: tpl('make-set', 'concrete', 'objects'),
    params: { n: 23, from: 'ones', sprite: 'shell' },
    answer: { kind: 'state', checker: 'set.count', target: { count: 23, groupsOf: 10 } },
    widget: {
      target: 23,
      mode: 'make',
      start: 23,
      groupsOf: 10,
      capacity: 30,
      container: 'boat',
      source: { sprite: 'shell', supply: 0 },
    },
  },
];

describe('pv.regroup formats', () => {
  it('covers every format the generator lists', () => {
    expect([...new Set(CASES.map((c) => c.t.format))].sort()).toEqual(
      [...pvRegroup.formats].sort(),
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
    for (const s of steps.slice(0, -1)) {
      expect(['answer', 'type', 'tap', 'fill', 'label-landing']).not.toContain(s.action?.op);
      expect(Object.values(s.vars ?? {})).not.toContain(item.params.n);
    }
    const replayed = replaySteps(item, steps);
    expect(replayed).not.toBeNull();
    expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);
  });

  it('rejects near misses and takes only the asked counts', () => {
    const trade = generateItemFromParams(tpl('base-ten-trade', 'pictorial'), {
      n: 34,
      from: 'canonical',
      to: 'regrouped',
    });
    // The start mat is worth 34, but regroup-to wants exactly 2 tens 14 ones.
    expect(checkResponse(trade, { kind: 'state', value: hto(0, 3, 4) }).correct).toBe(false);
    expect(checkResponse(trade, { kind: 'state', value: hto(0, 2, 13) }).correct).toBe(false);
    const build = generateItemFromParams(tpl('base-ten-build', 'concrete'), {
      n: 14,
      from: 'ones',
      to: 'canonical',
    });
    const mat = (tens: number, ones: number) => ({
      kind: 'state' as const,
      value: { thousands: 0, hundreds: 0, tens, ones },
    });
    expect(checkResponse(build, mat(0, 14)).correct).toBe(false);
    expect(checkResponse(build, mat(1, 3)).correct).toBe(false);
    expect(checkResponse(build, mat(1, 4)).correct).toBe(true);
    const set = generateItemFromParams(tpl('make-set', 'concrete'), { n: 23, from: 'ones' });
    // Not bundled yet: the loose shells are the right count but no ten is bundled.
    expect(
      checkResponse(set, { kind: 'state', value: { count: 23, removed: 0, bundles: 0 } }).correct,
    ).toBe(false);
  });
});

describe('pv.regroup validity', () => {
  it.each<[string, ItemFormat, Representation | undefined, ParamValues]>([
    [
      'a trade needs two different ways',
      'base-ten-trade',
      undefined,
      { n: 34, from: 'canonical', to: 'canonical' },
    ],
    [
      'a build needs two different ways',
      'base-ten-build',
      undefined,
      { n: 34, from: 'ones', to: 'ones' },
    ],
    ['n is at least 10', 'number-pad', undefined, { n: 9, from: 'canonical' }],
    ['all ones stop at 99', 'number-pad', undefined, { n: 120, from: 'ones', places: 3 }],
    ['three digits need places 3', 'number-pad', undefined, { n: 120, from: 'canonical' }],
    ['make-set starts loose', 'make-set', undefined, { n: 23, from: 'canonical' }],
    ['make-set holds at most 39', 'make-set', undefined, { n: 45, from: 'ones' }],
    ['ten-frames show a canonical teen', 'number-pad', 'ten-frame', { n: 16, from: 'regrouped' }],
    ['ten-frames hold twenty', 'number-pad', 'ten-frame', { n: 26, from: 'canonical' }],
  ])('%s', (_name, format, rep, params) => {
    expect(() => generateItemFromParams(tpl(format, 'pictorial', rep), params)).toThrow(
      GenerationError,
    );
  });
});

describe('pv.regroup helpers and features', () => {
  it('decomposes one number three ways', () => {
    expect(decompose(34, 'canonical')).toEqual(hto(0, 3, 4));
    expect(decompose(34, 'regrouped')).toEqual(hto(0, 2, 14));
    expect(decompose(34, 'ones')).toEqual(hto(0, 0, 34));
    expect(decompose(305, 'regrouped')).toEqual(hto(2, 10, 5));
    expect(decompose(340, 'regrouped')).toEqual(hto(3, 3, 10));
    expect(decompose(7, 'canonical')).toBeNull();
    expect(decompose(150, 'ones')).toBeNull();
  });

  it('lists the trades in solution order', () => {
    expect(tradesBetween(hto(0, 3, 4), hto(0, 0, 34))).toEqual([
      { kind: 'tens', dir: 'down' },
      { kind: 'tens', dir: 'down' },
      { kind: 'tens', dir: 'down' },
    ]);
    expect(tradesBetween(hto(0, 2, 14), hto(0, 3, 4))).toEqual([{ kind: 'ones', dir: 'up' }]);
    expect(tradesBetween(hto(3, 0, 5), hto(2, 10, 5))).toEqual([{ kind: 'hundreds', dir: 'down' }]);
    expect(tradesBetween(hto(2, 10, 5), hto(3, 0, 5))).toEqual([{ kind: 'tens', dir: 'up' }]);
  });

  it.each<[string, ItemFormat, ParamValues, Record<string, number>]>([
    [
      'one trade',
      'base-ten-trade',
      { n: 34, from: 'canonical', to: 'regrouped' },
      { regroups: 1, acrossPlaces: 0 },
    ],
    [
      'three tens unbundled',
      'base-ten-trade',
      { n: 34, from: 'canonical', to: 'ones' },
      { regroups: 3 },
    ],
    [
      'a hundred split is one trade at one place',
      'base-ten-trade',
      { n: 305, from: 'canonical', to: 'regrouped', places: 3 },
      { regroups: 1, acrossPlaces: 0 },
    ],
    [
      'a canonical number to read scores 0',
      'number-pad',
      { n: 34, from: 'canonical' },
      { regroups: 0 },
    ],
    [
      'a regrouped number to read scores one trade',
      'number-pad',
      { n: 34, from: 'regrouped' },
      { regroups: 1 },
    ],
    ['make-set bundles each ten', 'make-set', { n: 23, from: 'ones' }, { regroups: 2 }],
  ])('%s', (_name, format, params, want) => {
    const got = regroupFeatures(params, format);
    for (const [k, v] of Object.entries(want)) expect(got[k], k).toBe(v);
  });

  it('feature values depend on the params only, never on the build RNG', () => {
    for (const format of pvRegroup.formats) {
      const t = tpl(format, 'pictorial');
      for (let seed = 1; seed <= 20; seed += 1) {
        const item = generateItem(t, seed);
        const rebuilt = pvRegroup.build({
          params: item.params,
          template: t,
          rng: createRng(seed * 7919).fork('other'),
        });
        expect(rebuilt.features).toEqual(itemFeatures(item, t));
        expect(rebuilt.features).toMatchObject(regroupFeatures(item.params, format));
      }
    }
  });
});
