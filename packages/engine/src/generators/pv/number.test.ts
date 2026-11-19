// pv.number (03 §5.6): fixed params → answer and widget for every format and mode, exampleCorrect
// and solution replay (where the format has a model), feature values at the extremes, validity,
// digit-count and zeros sampling, and features that depend on the params only.

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
import {
  digitsOf,
  expandedTerms,
  nameClass,
  placeCounts,
  pvFeatures,
  pvMode,
  pvNumber,
  zeroInternal,
  zerosMatch,
  zeroTrailing,
} from './number';

let nextId = 0;
function tpl(
  format: ItemFormat,
  tier: Tier,
  representation?: Representation,
  params: Record<string, ParamSpec> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.pv.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier,
    ...(representation ? { representation } : {}),
    generator: 'pv.number',
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
  // base-ten-build
  {
    name: 'base-ten-build build 34: any pieces of the right value',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { n: 34, mode: 'build' },
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 34 } },
    widget: { target: 34, mode: 'build', pieces: { hundreds: false, tens: true, ones: true } },
  },
  {
    name: 'base-ten-build build 34 nonCanonical: three ones on offer force a trade',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { n: 34, mode: 'build', nonCanonical: true },
    // The limits are the tray's (the widget); the checker takes any mat worth 34.
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 34 } },
    widget: { limits: { ones: 3 } },
  },
  {
    name: 'base-ten-build exact 14 with bundles: one ten and 4 ones',
    t: tpl('base-ten-build', 'concrete', 'bundles'),
    params: { n: 14, mode: 'exact' },
    answer: {
      kind: 'state',
      checker: 'baseten.exact',
      target: { exact: { tens: 1, ones: 4 }, value: 14 },
    },
    widget: { mode: 'build-exact', exact: { tens: 1, ones: 4 } },
  },
  {
    name: 'base-ten-build exact 305 nonCanonical: 2 hundreds 10 tens 5 ones',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { n: 305, mode: 'exact', nonCanonical: true },
    answer: {
      kind: 'state',
      checker: 'baseten.exact',
      target: { exact: { hundreds: 2, tens: 10, ones: 5 }, value: 305 },
    },
  },
  {
    name: 'base-ten-build read 1,204',
    t: tpl('base-ten-build', 'pictorial', 'base-ten'),
    params: { n: 1204, mode: 'read' },
    answer: { kind: 'number', value: 1204 },
    widget: {
      mode: 'read',
      prebuilt: { thousands: 1, hundreds: 2, tens: 0, ones: 4 },
      pieces: { thousands: true, hundreds: true },
    },
  },
  {
    name: 'base-ten-build read 245 hundredths on flats (decimals)',
    t: tpl('base-ten-build', 'pictorial', 'base-ten'),
    params: { n: 245, mode: 'read', wholeIs: 'flat' },
    answer: { kind: 'number', value: 245 },
    widget: { wholeIs: 'flat', prebuilt: { hundreds: 2, tens: 4, ones: 5 } },
  },
  // expanded-form
  {
    name: 'expanded-form build 14 from cards',
    t: tpl('expanded-form', 'pictorial', 'expanded'),
    params: { n: 14, mode: 'build' },
    answer: { kind: 'numbers', values: [10, 4], ordered: false },
    widget: { mode: 'build', target: 14 },
  },
  {
    name: 'expanded-form to-standard 300 + 40 + 5',
    t: tpl('expanded-form', 'abstract', 'expanded'),
    params: { n: 345, mode: 'expanded' },
    answer: { kind: 'number', value: 345 },
    widget: {
      mode: 'to-standard',
      expression: {
        tokens: [
          { t: 'num', v: 300 },
          { t: 'op', v: '+' },
          { t: 'num', v: 40 },
          { t: 'op', v: '+' },
          { t: 'num', v: 5 },
          { t: 'rel', v: '=' },
          { t: 'blank', id: 'x' },
        ],
      },
    },
  },
  {
    name: 'expanded-form fill 47 = ? + 7, unusual order',
    t: tpl('expanded-form', 'abstract', 'expanded'),
    params: { n: 47, mode: 'expanded', place: 1, unusualOrder: true },
    answer: { kind: 'number', value: 40 },
    widget: {
      mode: 'fill',
      unusualOrder: true,
      expression: {
        tokens: [
          { t: 'num', v: 47 },
          { t: 'rel', v: '=' },
          { t: 'num', v: 7 },
          { t: 'op', v: '+' },
          { t: 'blank', id: 'x' },
        ],
      },
    },
  },
  {
    name: 'expanded-form fill 34 = 20 + ? (nonCanonical)',
    t: tpl('expanded-form', 'abstract', 'expanded'),
    params: { n: 34, mode: 'expanded', place: 0, nonCanonical: true },
    answer: { kind: 'number', value: 14 },
  },
  {
    name: 'expanded-form words: hear 305, type it',
    t: tpl('expanded-form', 'pictorial', 'words'),
    params: { n: 305, mode: 'words' },
    answer: { kind: 'number', value: 305 },
    widget: { mode: 'words', target: 305 },
  },
  {
    name: 'expanded-form digit-value: the 4 in 345',
    t: tpl('expanded-form', 'abstract', 'expanded'),
    params: { n: 345, mode: 'digit-value', place: 1 },
    answer: { kind: 'number', value: 40 },
    widget: { mode: 'digit-value', digitIndex: 1 },
  },
  {
    name: 'expanded-form digit-value: the 5 in 345 (digitIndex counts from the left)',
    t: tpl('expanded-form', 'abstract', 'expanded'),
    params: { n: 345, mode: 'digit-value', place: 0 },
    answer: { kind: 'number', value: 5 },
    widget: { mode: 'digit-value', digitIndex: 2 },
  },
  // numeral-pick
  {
    name: 'numeral-pick read 14 on double ten-frames',
    t: tpl('numeral-pick', 'pictorial', 'double-ten-frame'),
    params: { n: 14, mode: 'read' },
    answer: { kind: 'choice', id: 'opt-14' },
    widget: { stimulus: { kind: 'ten-frame', frames: 2, filled: [10, 4] } },
  },
  {
    name: 'numeral-pick write 3 tens 4 ones',
    t: tpl('numeral-pick', 'abstract', 'symbols'),
    params: { n: 34, mode: 'write' },
    answer: { kind: 'choice', id: 'opt-34' },
    widget: { stimulus: { kind: 'none' } },
  },
  {
    name: 'numeral-pick expanded 40 + 7',
    t: tpl('numeral-pick', 'pictorial', 'expanded'),
    params: { n: 47, mode: 'expanded' },
    answer: { kind: 'choice', id: 'opt-47' },
    widget: {
      stimulus: {
        kind: 'expression',
        expr: {
          tokens: [
            { t: 'num', v: 40 },
            { t: 'op', v: '+' },
            { t: 'num', v: 7 },
          ],
        },
      },
    },
  },
  {
    name: 'numeral-pick words: pick the name of 47',
    t: tpl('numeral-pick', 'abstract', 'words'),
    params: { n: 47, mode: 'words' },
    answer: { kind: 'choice', id: 'opt-47' },
  },
  {
    name: 'numeral-pick digit-value: the 3 in 345',
    t: tpl('numeral-pick', 'abstract', 'symbols'),
    params: { n: 345, mode: 'digit-value' },
    answer: { kind: 'choice', id: 'opt-300' },
  },
  // number-pad
  {
    name: 'number-pad read 23 from base-ten',
    t: tpl('number-pad', 'pictorial', 'base-ten'),
    params: { n: 23, mode: 'read' },
    answer: { kind: 'number', value: 23 },
    widget: { stimulus: { kind: 'base-ten', hundreds: 0, tens: 2, ones: 3 } },
  },
  {
    name: 'number-pad read 34 shown regrouped (2 tens 14 ones)',
    t: tpl('number-pad', 'pictorial', 'bundles'),
    params: { n: 34, mode: 'read', nonCanonical: true },
    answer: { kind: 'number', value: 34 },
    widget: { stimulus: { kind: 'base-ten', hundreds: 0, tens: 2, ones: 14 } },
  },
  {
    name: 'number-pad write ten and 6 more',
    t: tpl('number-pad', 'abstract', 'symbols'),
    params: { n: 16, mode: 'write' },
    answer: { kind: 'number', value: 16 },
    widget: { stimulus: { kind: 'none' }, blanks: [{ id: 'x', maxDigits: 2 }] },
  },
  {
    name: 'number-pad expanded 10 + 4 = ? beside double ten-frames',
    t: tpl('number-pad', 'pictorial', 'double-ten-frame'),
    params: { n: 14, mode: 'expanded' },
    answer: { kind: 'number', value: 14 },
    widget: {
      stimulus: { kind: 'ten-frame', frames: 2, filled: [10, 4] },
      expression: {
        tokens: [
          { t: 'num', v: 10 },
          { t: 'op', v: '+' },
          { t: 'num', v: 4 },
          { t: 'rel', v: '=' },
          { t: 'blank', id: 'x' },
        ],
      },
    },
  },
  {
    name: 'number-pad expanded 14 = 10 + ?',
    t: tpl('number-pad', 'abstract', 'symbols'),
    params: { n: 14, mode: 'expanded', place: 0 },
    answer: { kind: 'number', value: 4 },
    widget: { blanks: [{ id: 'x', maxDigits: 1 }] },
  },
  {
    name: 'number-pad digit-value: the 5 in 506,000 (stretch)',
    t: tpl('number-pad', 'abstract', 'symbols'),
    params: { n: 506_000, mode: 'digit-value' },
    answer: { kind: 'number', value: 500_000 },
  },
  // dot-flash
  {
    name: 'dot-flash read a base-ten picture of 42',
    t: tpl('dot-flash', 'pictorial', 'base-ten'),
    params: { n: 42, mode: 'read', flashMs: 700 },
    answer: { kind: 'number', value: 42 },
    widget: { stimulus: { kind: 'base-ten', tens: 4, ones: 2 }, flashMs: 700 },
  },
  {
    name: 'dot-flash read 17 on a rekenrek',
    t: tpl('dot-flash', 'pictorial', 'rekenrek'),
    params: { n: 17, mode: 'read' },
    answer: { kind: 'number', value: 17 },
    widget: { stimulus: { kind: 'rekenrek', rows: [10, 7] } },
  },
  // hundred-chart
  {
    name: 'hundred-chart write: find 3 tens 4 ones',
    t: tpl('hundred-chart', 'pictorial'),
    params: { n: 34, mode: 'write' },
    answer: { kind: 'number', value: 34 },
    widget: { first: 1, rows: 10, mode: 'find', hidden: [] },
  },
  {
    name: 'hundred-chart expanded: find 100 + 10 + 5 on a 1–120 chart',
    t: tpl('hundred-chart', 'pictorial'),
    params: { n: 115, mode: 'expanded' },
    answer: { kind: 'number', value: 115 },
    widget: { first: 1, rows: 12 },
  },
  // tenframe-fill
  {
    name: 'tenframe-fill build 13: a full ten first',
    t: tpl('tenframe-fill', 'concrete', 'double-ten-frame'),
    params: { n: 13, mode: 'build' },
    answer: {
      kind: 'state',
      checker: 'tenframe.total',
      target: { n: 13, requireStandardFill: true },
    },
    widget: { frames: 2, goal: 'show-n', n: 13, requireStandardFill: true, thenAsk: null },
  },
  {
    name: 'tenframe-fill write: ten and 4 more, then how many',
    t: tpl('tenframe-fill', 'concrete', 'double-ten-frame'),
    params: { n: 14, mode: 'write' },
    answer: {
      kind: 'state',
      checker: 'tenframe.total',
      target: { n: 14, requireStandardFill: true, value: 14 },
    },
    widget: { thenAsk: 'total' },
  },
  // rekenrek
  {
    name: 'rekenrek build 16: ten on the top row first',
    t: tpl('rekenrek', 'concrete'),
    params: { n: 16, mode: 'build' },
    answer: {
      kind: 'state',
      checker: 'rekenrek.total',
      target: { n: 16, rowRule: 'fill-top-first' },
    },
    widget: { rows: 2, preset: [0, 0], mode: 'show', thenAsk: null },
  },
  {
    name: 'rekenrek write 12, then how many',
    t: tpl('rekenrek', 'concrete'),
    params: { n: 12, mode: 'write' },
    answer: {
      kind: 'state',
      checker: 'rekenrek.total',
      target: { n: 12, rowRule: 'fill-top-first', value: 12 },
    },
    widget: { thenAsk: 'total' },
  },
  {
    name: 'rekenrek read 18',
    t: tpl('rekenrek', 'concrete'),
    params: { n: 18, mode: 'read' },
    answer: { kind: 'number', value: 18 },
    widget: { mode: 'read', preset: [10, 8], rows: 2 },
  },
];

describe('pv.number formats and modes', () => {
  it('covers every format the generator lists', () => {
    expect([...new Set(CASES.map((c) => c.t.format))].sort()).toEqual([...pvNumber.formats].sort());
  });

  it.each(CASES)('$name', ({ t, params, answer, widget }) => {
    const item = generateItemFromParams(t, params);
    expect(item.widget.format).toBe(t.format);
    expect(item.answer).toEqual(answer);
    if (widget) expect(item.widget).toMatchObject(widget);
    // The widget passes its format's schema (the shared one where the format has no model).
    const model = formatModel(t.format);
    if (model) {
      const parsed = model.configSchema.safeParse(item.widget);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
    expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
    const steps = itemSolution(item, t);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    // Steps before the last never enter the answer (the worked-step hint plays them).
    for (const s of steps.slice(0, -1)) {
      expect(['answer', 'type', 'tap', 'fill', 'label-landing']).not.toContain(s.action?.op);
    }
    if (model) {
      const replayed = replaySteps(item, steps);
      expect(replayed).not.toBeNull();
      expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);
    }
  });

  // Review (PR #77): 34 with only two tens on offer was built from 2 tens and 14 ones, no trade.
  it.each([34, 305, 340, 1034, 11])(
    'a nonCanonical build of %i cannot be made from the tray alone; the solution splits a piece',
    (n) => {
      const t = tpl('base-ten-build', 'concrete', 'base-ten');
      const item = generateItemFromParams(t, { n, mode: 'build', nonCanonical: true });
      const model = formatModel('base-ten-build');
      if (!model || item.widget.format !== 'base-ten-build') throw new Error('model');
      const w = item.widget;
      // Every tray-only mat (any count of each kind up to its limit, no fuse or split) misses n.
      const cap = (k: 'thousands' | 'hundreds' | 'tens' | 'ones') =>
        !w.pieces[k] ? 0 : k === 'thousands' ? 9 : (w.limits?.[k] ?? 99);
      let reachable = false;
      for (let th = 0; th <= cap('thousands'); th += 1)
        for (let h = 0; h <= Math.min(cap('hundreds'), 20); h += 1)
          for (let te = 0; te <= Math.min(cap('tens'), 120); te += 1) {
            const rest = n - 1000 * th - 100 * h - 10 * te;
            if (rest >= 0 && rest <= cap('ones')) reachable = true;
          }
      expect(reachable).toBe(false);
      // Replaying the same tray-only build through the model: taking the canonical pieces stops
      // at the limit, so the mat falls short.
      let s = model.initialState(w);
      for (const [kind, count] of Object.entries({
        thousands: Math.floor(n / 1000),
        hundreds: Math.floor(n / 100) % 10,
        tens: Math.floor(n / 10) % 10,
        ones: n % 10,
      })) {
        if (count > 0) s = model.apply(s, { op: 'add-piece', args: { kind, count } });
      }
      expect(checkResponse(item, model.toResponse(s) as never).correct).toBe(false);
      // The worked solution trades: it splits a piece and replays to a correct mat.
      const steps = itemSolution(item, t);
      expect(steps.map((x) => x.action?.op)).toContain('split');
      const replayed = replaySteps(item, steps);
      expect(replayed).not.toBeNull();
      expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);
      expect(itemFeatures(item, t)['limits.tight']).toBe(1);
    },
  );

  it('numeral-pick words options speak the num.* names, the answer among them', () => {
    const t = tpl('numeral-pick', 'abstract', 'words');
    const item = generateItemFromParams(t, { n: 95, mode: 'words' });
    if (item.widget.format !== 'numeral-pick') throw new Error('format');
    const values = item.widget.options.map((o) => Number(o.id.replace('opt-', '')));
    for (const o of item.widget.options) {
      expect(o.speak).toBe(`num.${o.id.replace('opt-', '')}`);
    }
    // n's name class: two reversal pairs, the same for every member (PR #83 review).
    expect([...values].sort((x, y) => x - y)).toEqual(nameClass(95, 9));
    expect(values).toHaveLength(4);
    for (const v of values) expect(values).toContain((v % 10) * 10 + Math.floor(v / 10));
  });

  it('nameClass splits the domain: each member of a class has that class', () => {
    expect(nameClass(12, 5)).toEqual([12, 13, 21, 31]);
    expect(nameClass(43, 5)).toEqual([25, 34, 43, 52]);
    for (const max of [3, 4, 5, 6, 9]) {
      for (let n = 10; n <= 99; n += 1) {
        const c = nameClass(n, max);
        if (!c) continue;
        expect(c).toContain(n);
        // Exactly two reversal pairs, never more than numeral-pick's five options (round 2).
        expect(c).toHaveLength(4);
        for (const m of c) expect(nameClass(m, max)).toEqual(c);
      }
    }
    // An odd count of pairs leaves the last pair out instead of growing a class to six.
    expect(nameClass(12, 3)).toEqual([12, 13, 21, 31]);
    expect(nameClass(23, 3)).toBeNull();
    expect(nameClass(32, 3)).toBeNull();
    expect(nameClass(33, 9)).toBeNull();
    expect(nameClass(40, 9)).toBeNull();
    expect(nameClass(16, 5)).toBeNull();
    expect(nameClass(12, 2)).toBeNull();
  });

  it('numeral-pick words with an odd count of digit pairs still offers four options', () => {
    const t = tpl('numeral-pick', 'abstract', 'words');
    const item = generateItemFromParams(t, { n: 12, mode: 'words', digitMax: 3 });
    if (item.widget.format !== 'numeral-pick') throw new Error('format');
    expect(item.widget.options.map((o) => o.id).sort()).toEqual(
      ['opt-12', 'opt-13', 'opt-21', 'opt-31'].sort(),
    );
    expect(() => generateItemFromParams(t, { n: 23, mode: 'words', digitMax: 3 })).toThrow();
    // Round 3: a non-numeric bound leaves no pairs, never an empty option set.
    expect(nameClass(12, Number.NaN)).toBeNull();
    expect(() =>
      generateItemFromParams(t, { n: 12, mode: 'words', digitMax: Number.NaN }),
    ).toThrow();
  });

  it('numeral-pick digit-value offers the value, the bare digit and the digit one place up', () => {
    const t = tpl('numeral-pick', 'abstract', 'symbols');
    const item = generateItemFromParams(t, { n: 345, mode: 'digit-value', place: 1 });
    if (item.widget.format !== 'numeral-pick') throw new Error('format');
    expect(item.widget.options.map((o) => o.id).sort()).toEqual(['opt-4', 'opt-40', 'opt-400']);
  });

  it('expanded-form build cards are the terms plus the digits in the wrong places', () => {
    const t = tpl('expanded-form', 'pictorial', 'expanded');
    const item = generateItemFromParams(t, { n: 14, mode: 'build' });
    if (item.widget.format !== 'expanded-form') throw new Error('format');
    expect([...(item.widget.cards ?? [])].sort((a, b) => a - b)).toEqual([1, 4, 10, 40]);
  });

  it('auto picks the format’s natural task', () => {
    expect(pvMode({ mode: 'auto' }, 'base-ten-build')).toBe('build');
    expect(pvMode({ mode: 'auto' }, 'expanded-form')).toBe('expanded');
    expect(pvMode({ mode: 'auto' }, 'hundred-chart')).toBe('write');
    expect(pvMode({ mode: 'auto' }, 'number-pad')).toBe('read');
    expect(pvMode({ mode: 'exact' }, 'number-pad')).toBe('exact');
  });

  it.each<[string, ItemTemplate, ParamValues]>([
    ['number-pad has no build mode', tpl('number-pad', 'abstract'), { n: 14, mode: 'build' }],
    [
      'number-pad words would show the numeral',
      tpl('number-pad', 'abstract'),
      { n: 14, mode: 'words' },
    ],
    [
      'dot-flash needs a picture',
      tpl('dot-flash', 'pictorial', 'symbols'),
      { n: 14, mode: 'read' },
    ],
    ['tenframe-fill cannot read', tpl('tenframe-fill', 'concrete'), { n: 14, mode: 'read' }],
    ['base-ten-build cannot write', tpl('base-ten-build', 'concrete'), { n: 14, mode: 'write' }],
  ])('throws for an unsupported pair: %s', (_name, t, params) => {
    expect(() => generateItemFromParams(t, params)).toThrow(RangeError);
  });

  it.each<[string, ItemTemplate, ParamValues]>([
    ['a teen frame above twenty', tpl('tenframe-fill', 'concrete'), { n: 23, mode: 'build' }],
    ['a rekenrek above twenty', tpl('rekenrek', 'concrete'), { n: 21, mode: 'read' }],
    ['words names above 99', tpl('numeral-pick', 'abstract'), { n: 120, mode: 'words' }],
    [
      'nonCanonical below ten',
      tpl('number-pad', 'abstract'),
      { n: 7, mode: 'write', nonCanonical: true },
    ],
    [
      'a blank at a zero place',
      tpl('number-pad', 'abstract'),
      { n: 305, mode: 'expanded', place: 1 },
    ],
    [
      'the value of a zero digit',
      tpl('number-pad', 'abstract'),
      { n: 305, mode: 'digit-value', place: 1 },
    ],
    [
      'a place past the digits',
      tpl('number-pad', 'abstract'),
      { n: 45, mode: 'expanded', place: 2 },
    ],
    [
      'place outside expanded and digit-value',
      tpl('number-pad', 'abstract'),
      { n: 45, mode: 'write', place: 0 },
    ],
    [
      'unusual order outside expanded',
      tpl('number-pad', 'abstract'),
      { n: 45, mode: 'write', unusualOrder: true },
    ],
    [
      'flat without base-ten pieces',
      tpl('number-pad', 'abstract'),
      { n: 45, mode: 'write', wholeIs: 'flat' },
    ],
    [
      'a trade at the thousands',
      tpl('base-ten-build', 'concrete'),
      { n: 3000, mode: 'build', nonCanonical: true },
    ],
    [
      'a forced trade with nothing to split (40)',
      tpl('base-ten-build', 'concrete'),
      { n: 40, mode: 'build', nonCanonical: true },
    ],
    [
      'a forced trade at the hundreds (1,200)',
      tpl('base-ten-build', 'concrete'),
      { n: 1200, mode: 'build', nonCanonical: true },
    ],
    ['zeros none on 305', tpl('number-pad', 'abstract'), { n: 305, mode: 'write', zeros: 'none' }],
    ['digits 3 on 45', tpl('number-pad', 'abstract'), { n: 45, mode: 'write', digits: 3 }],
  ])('rejects %s', (_name, t, params) => {
    expect(() => generateItemFromParams(t, params)).toThrow(GenerationError);
  });
});

describe('pv.number features', () => {
  const pad = tpl('number-pad', 'abstract');
  const build = tpl('base-ten-build', 'concrete');
  const cards = tpl('expanded-form', 'abstract', 'expanded');

  it.each<[string, ItemTemplate, ParamValues, Record<string, number | undefined>]>([
    [
      'the easiest teen has every size feature at 0 but teen',
      pad,
      { n: 12, mode: 'write' },
      { digits: 1, teen: 1, 'zero.internal': 0, 'zero.trailing': 0, 'ones.over5': 0, words: 0 },
    ],
    ['19: four ones past five', pad, { n: 19, mode: 'write' }, { 'ones.over5': 1 }],
    [
      '305 has an internal zero',
      pad,
      { n: 305, mode: 'write' },
      { digits: 2, 'zero.internal': 1, 'zero.trailing': 0 },
    ],
    [
      '450 has a trailing zero',
      pad,
      { n: 450, mode: 'write' },
      { 'zero.internal': 0, 'zero.trailing': 1 },
    ],
    ['nonCanonical', pad, { n: 34, mode: 'write', nonCanonical: true }, { nonCanonical: 1 }],
    ['numeral-pick words', tpl('numeral-pick', 'abstract'), { n: 47, mode: 'words' }, { words: 1 }],
    [
      'expanded-form words counts once (mode.words)',
      tpl('expanded-form', 'pictorial', 'words'),
      { n: 47, mode: 'words' },
      { words: 0, 'mode.words': 1 },
    ],
    ['unusual order', cards, { n: 47, mode: 'expanded', unusualOrder: true }, { unusualOrder: 1 }],
    [
      'base-ten exact',
      build,
      { n: 34, mode: 'exact' },
      { exact: 1, 'mode.read': 0, 'limits.tight': 0 },
    ],
    [
      'base-ten read',
      tpl('base-ten-build', 'pictorial'),
      { n: 34, mode: 'read' },
      { 'mode.read': 1 },
    ],
    [
      'base-ten limits force a trade',
      build,
      { n: 34, mode: 'build', nonCanonical: true },
      { 'limits.tight': 1 },
    ],
    ['decimals on flats', build, { n: 245, mode: 'build', wholeIs: 'flat' }, { decimal: 1 }],
    [
      'format features only where the format has none of its own',
      pad,
      { n: 34, mode: 'write' },
      { exact: undefined, 'mode.words': undefined },
    ],
  ])('%s', (_name, t, params, want) => {
    const item = generateItemFromParams(t, params);
    const got = itemFeatures(item, t);
    for (const [k, v] of Object.entries(want)) {
      if (v === undefined) expect(got, k).not.toHaveProperty([k]);
      else expect(got[k], k).toBeCloseTo(v, 9);
    }
  });

  it('feature values depend on the params only, never on the build RNG', () => {
    const t = tpl('expanded-form', 'pictorial', 'expanded', {
      n: { kind: 'int', min: 11, max: 99 },
      mode: { kind: 'const', value: 'build' },
    });
    for (let seed = 1; seed <= 40; seed += 1) {
      const item = generateItem(t, seed);
      const rebuilt = pvNumber.build({
        params: item.params,
        template: t,
        rng: createRng(seed * 7919).fork('other'),
      });
      expect(rebuilt.features).toEqual(itemFeatures(item, t));
      expect(rebuilt.features).toEqual({
        ...rebuilt.features,
        ...pvFeatures(item.params, t.format),
      });
    }
  });
});

describe('pv.number sampling and helpers', () => {
  it('digits draws numbers with that many digits inside n’s range', () => {
    const t = tpl('number-pad', 'abstract', 'symbols', {
      n: { kind: 'int', min: 0, max: 999_999 },
      digits: { kind: 'const', value: 3 },
      mode: { kind: 'const', value: 'write' },
    });
    for (let seed = 1; seed <= 60; seed += 1) {
      const n = generateItem(t, seed).params.n as number;
      expect(n).toBeGreaterThanOrEqual(100);
      expect(n).toBeLessThanOrEqual(999);
    }
  });

  it.each(['none', 'internal', 'trailing', 'some'])('zeros %s holds on every draw', (zeros) => {
    const t = tpl('number-pad', 'abstract', 'symbols', {
      n: { kind: 'int', min: 100, max: 9999 },
      zeros: { kind: 'const', value: zeros },
      mode: { kind: 'const', value: 'write' },
    });
    for (let seed = 1; seed <= 60; seed += 1) {
      expect(zerosMatch(generateItem(t, seed).params.n as number, zeros)).toBe(true);
    }
  });

  it('derives the hundreds, tens and ones digits', () => {
    expect(pvNumber.derive({ n: 1345 })).toEqual({ h: 3, t: 4, o: 5 });
    expect(pvNumber.derive({ n: 7 })).toEqual({ h: 0, t: 0, o: 7 });
  });

  it('reads digits, zeros and regrouped counts', () => {
    expect(digitsOf(305)).toEqual([5, 0, 3]);
    expect(zeroInternal(305)).toBe(true);
    expect(zeroInternal(340)).toBe(false);
    expect(zeroInternal(300)).toBe(false);
    expect(zeroInternal(1005)).toBe(true);
    expect(zeroTrailing(450)).toBe(true);
    expect(zeroTrailing(7)).toBe(false);
    expect(placeCounts(34, true)).toEqual([14, 2]);
    expect(placeCounts(305, true)).toEqual([5, 10, 2]);
    expect(placeCounts(340, true)).toEqual([10, 3, 3]);
    expect(expandedTerms(placeCounts(34, true)).map((x) => x.value)).toEqual([20, 14]);
  });
});
