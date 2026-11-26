// mda.addsub (03 §5.6): fixed params → answer and widget for every format and op, exampleCorrect
// and solution replay through the format models, near misses, feature values at the extremes,
// validity (accepts), number-line strategies, and features that depend on the params only.

import type {
  AnswerSpec,
  ItemFormat,
  ItemTemplate,
  ParamSpec,
  ParamValues,
  Representation,
  ResponseValue,
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
  borrowsOf,
  carriesOf,
  chartMoves,
  groupedTokens,
  jumpPath,
  mdaAddSub,
  mdaFeatures,
} from './addsub';

let nextId = 0;
function tpl(
  format: ItemFormat,
  tier: Tier,
  representation?: Representation,
  params: Record<string, ParamSpec> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.mda.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier,
    ...(representation ? { representation } : {}),
    generator: 'mda.addsub',
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

const OPEN_UP = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const OPEN_DOWN = OPEN_UP.map((j) => -j);

const CASES: Case[] = [
  {
    name: 'number-pad 34 + 25 (symbols)',
    t: tpl('number-pad', 'abstract', 'symbols'),
    params: { a: 34, b: 25, op: '+' },
    answer: { kind: 'number', value: 59 },
    widget: {
      stimulus: { kind: 'none' },
      expression: {
        tokens: [
          { t: 'num', v: 34 },
          { t: 'op', v: '+' },
          { t: 'num', v: 25 },
          { t: 'rel', v: '=' },
          { t: 'blank', id: 'x' },
        ],
      },
      blanks: [{ id: 'x', maxDigits: 3 }],
    },
  },
  {
    name: 'number-pad 64 − 30 with a base-ten picture of 64',
    t: tpl('number-pad', 'pictorial', 'base-ten'),
    params: { a: 64, b: 30, op: '-' },
    answer: { kind: 'number', value: 34 },
    widget: { stimulus: { kind: 'base-ten', hundreds: 0, tens: 6, ones: 4 } },
  },
  {
    name: 'number-pad change unknown 34 + ? = 59',
    t: tpl('number-pad', 'abstract', 'symbols'),
    params: { a: 34, b: 25, op: '+', unknown: 'change' },
    answer: { kind: 'number', value: 25 },
    widget: {
      expression: {
        tokens: [
          { t: 'num', v: 34 },
          { t: 'op', v: '+' },
          { t: 'blank', id: 'x' },
          { t: 'rel', v: '=' },
          { t: 'num', v: 59 },
        ],
      },
    },
  },
  {
    name: 'base-ten-build 34 + 20: 34 prebuilt, build 54',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { a: 34, b: 20, op: '+' },
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 54 } },
    widget: {
      mode: 'build',
      target: 54,
      prebuilt: { hundreds: 0, tens: 3, ones: 4 },
      pieces: { thousands: false, hundreds: false, tens: true, ones: true },
    },
  },
  {
    name: 'base-ten-build 78 − 40: take four tens away',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { a: 78, b: 40, op: '-' },
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 38 } },
  },
  {
    name: 'base-ten-build 43 + 25 (tens and ones)',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { a: 43, b: 25, op: '+' },
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 68 } },
  },
  {
    name: 'base-ten-build 120 + 230 (hundreds on offer)',
    t: tpl('base-ten-build', 'concrete', 'base-ten'),
    params: { a: 120, b: 230, op: '+' },
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 350 } },
    widget: { pieces: { thousands: false, hundreds: true, tens: true, ones: true } },
  },
  {
    name: 'base-ten-trade 37 + 5: trade ten ones',
    t: tpl('base-ten-trade', 'concrete', 'base-ten'),
    params: { a: 37, b: 5, op: '+' },
    answer: {
      kind: 'state',
      checker: 'trade.result',
      target: { result: 42, value: 42, regroupTarget: { hundreds: 0, tens: 4, ones: 2 } },
    },
    widget: {
      goal: 'compute',
      start: { hundreds: 0, tens: 3, ones: 7 },
      operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 5 } },
      thenAsk: true,
      showAlgorithm: false,
    },
  },
  {
    name: 'base-ten-trade 95 + 7: two trades (into the hundreds)',
    t: tpl('base-ten-trade', 'concrete', 'base-ten'),
    params: { a: 95, b: 7, op: '+' },
    answer: {
      kind: 'state',
      checker: 'trade.result',
      target: { result: 102, value: 102, regroupTarget: { hundreds: 1, tens: 0, ones: 2 } },
    },
  },
  {
    name: 'base-ten-trade 52 − 27: split a ten',
    t: tpl('base-ten-trade', 'pictorial', 'base-ten'),
    params: { a: 52, b: 27, op: '-' },
    answer: {
      kind: 'state',
      checker: 'trade.result',
      target: { result: 25, value: 25, regroupTarget: { hundreds: 0, tens: 2, ones: 5 } },
    },
  },
  {
    name: 'base-ten-trade 304 − 128: split a hundred, then a ten',
    t: tpl('base-ten-trade', 'pictorial', 'base-ten'),
    params: { a: 304, b: 128, op: '-' },
    answer: {
      kind: 'state',
      checker: 'trade.result',
      target: { result: 176, value: 176, regroupTarget: { hundreds: 1, tens: 7, ones: 6 } },
    },
  },
  {
    name: 'number-line-jump 37 + 5 on the open line (next ten)',
    t: tpl('number-line-jump', 'pictorial', 'open-number-line', {
      strategy: { kind: 'const', value: 'next-ten' },
    }),
    params: { a: 37, b: 5, op: '+', strategy: 'next-ten' },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 37, target: 42, allowedJumps: OPEN_UP, value: 42 },
    },
    widget: {
      path: 'open',
      ticksEvery: null,
      labelsEvery: null,
      start: 37,
      target: 42,
      goal: 'add',
      thenAsk: 'landing',
      min: 20,
      max: 60,
    },
  },
  {
    name: 'number-line-jump 64 − 30 (tens and ones)',
    t: tpl('number-line-jump', 'pictorial', 'open-number-line'),
    params: { a: 64, b: 30, op: '-', strategy: 'tens-ones' },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 64, target: 34, allowedJumps: OPEN_DOWN, value: 34 },
    },
    widget: { goal: 'subtract', min: 20, max: 80 },
  },
  {
    name: 'expanded-form 47 + 32: (40 + 30) + (7 + 2)',
    t: tpl('expanded-form', 'pictorial', 'expanded'),
    params: { a: 47, b: 32, op: '+' },
    answer: { kind: 'number', value: 79 },
    widget: {
      mode: 'to-standard',
      target: 79,
      expression: {
        tokens: [
          { t: 'paren', v: '(' },
          { t: 'num', v: 40 },
          { t: 'op', v: '+' },
          { t: 'num', v: 30 },
          { t: 'paren', v: ')' },
          { t: 'op', v: '+' },
          { t: 'paren', v: '(' },
          { t: 'num', v: 7 },
          { t: 'op', v: '+' },
          { t: 'num', v: 2 },
          { t: 'paren', v: ')' },
          { t: 'rel', v: '=' },
          { t: 'blank', id: 'x' },
        ],
      },
    },
  },
  {
    name: 'expanded-form 58 − 23',
    t: tpl('expanded-form', 'abstract', 'expanded'),
    params: { a: 58, b: 23, op: '-' },
    answer: { kind: 'number', value: 35 },
  },
  {
    name: 'hundred-chart 34 + 23: two rows down, three right',
    t: tpl('hundred-chart', 'pictorial', 'hundred-chart'),
    params: { a: 34, b: 23, op: '+' },
    answer: { kind: 'number', value: 57 },
    widget: {
      mode: 'move',
      first: 1,
      rows: 10,
      from: 34,
      hidden: [],
      moves: ['down', 'down', 'right', 'right', 'right'],
    },
  },
  {
    name: 'hundred-chart 86 − 40: four rows up',
    t: tpl('hundred-chart', 'pictorial', 'hundred-chart'),
    params: { a: 86, b: 40, op: '-' },
    answer: { kind: 'number', value: 46 },
    widget: { moves: ['up', 'up', 'up', 'up'] },
  },
];

const nearMisses = (
  item: ReturnType<typeof generateItemFromParams>,
  t: ItemTemplate,
): ResponseValue[] => {
  const a = item.answer;
  if (a.kind === 'number')
    return [a.value + 1, a.value - 1].map((v) => ({ kind: 'number', value: v }));
  if (a.kind !== 'state') return [];
  const v = Number(a.target.value ?? a.target.result);
  const correct = itemExampleCorrect(item, t);
  if (correct.kind !== 'state') return [];
  if (item.widget.format === 'base-ten-build') {
    const mat = correct.value as Record<string, number>;
    return [
      { kind: 'state', value: { ...mat, ones: (mat.ones ?? 0) + 1 } },
      { kind: 'state', value: { ...mat, tens: (mat.tens ?? 0) + 1 } },
    ];
  }
  return [{ kind: 'state', value: { ...correct.value, value: v + 1 } }];
};

describe('mda.addsub formats and ops', () => {
  it('covers every format the generator lists', () => {
    expect([...new Set(CASES.map((c) => c.t.format))].sort()).toEqual(
      [...mdaAddSub.formats].sort(),
    );
  });

  it.each(CASES)('$name', ({ t, params, answer, widget }) => {
    const item = generateItemFromParams(t, params);
    expect(item.widget.format).toBe(t.format);
    expect(item.answer).toEqual(answer);
    if (widget) expect(item.widget).toMatchObject(widget);
    const model = formatModel(t.format);
    if (!model) throw new Error(`no model for ${t.format}`);
    const parsed = model.configSchema.safeParse(item.widget);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
    for (const miss of nearMisses(item, t)) expect(checkResponse(item, miss).correct).toBe(false);
    const steps = itemSolution(item, t);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    // Steps before the last never enter the answer, and never name it.
    const asked =
      item.answer.kind === 'number'
        ? item.answer.value
        : Number(answer.kind === 'state' ? (answer.target.result ?? answer.target.value) : NaN);
    for (const s of steps.slice(0, -1)) {
      expect(['answer', 'type', 'tap', 'fill', 'label-landing']).not.toContain(s.action?.op);
      expect(Object.values(s.vars ?? {})).not.toContain(asked);
    }
    const replayed = replaySteps(item, steps);
    expect(replayed).not.toBeNull();
    expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);
  });

  it('a different landing typed after the right jumps is wrong', () => {
    const t = tpl('number-line-jump', 'pictorial', 'open-number-line');
    const item = generateItemFromParams(t, { a: 37, b: 5, op: '+' });
    const r: ResponseValue = { kind: 'state', value: { jumps: [5], value: 32 } };
    expect(checkResponse(item, r).correct).toBe(false);
    expect(checkResponse(item, { kind: 'state', value: { jumps: [5], value: 42 } }).correct).toBe(
      true,
    );
  });
});

describe('mda.addsub helpers and strategies', () => {
  it('counts carries and borrows with the column algorithm', () => {
    expect(carriesOf(37, 5)).toBe(1);
    expect(carriesOf(95, 7)).toBe(2);
    expect(carriesOf(34, 25)).toBe(0);
    expect(borrowsOf(52, 27)).toBe(1);
    expect(borrowsOf(304, 128)).toBe(2);
    expect(borrowsOf(64, 30)).toBe(0);
  });

  it('jumps by tens then ones, or to the next ten first', () => {
    expect(jumpPath(34, 25, true, 'tens-ones')).toEqual([10, 10, 5]);
    expect(jumpPath(34, 25, true, 'none')).toEqual([10, 10, 5]);
    expect(jumpPath(37, 5, true, 'next-ten')).toEqual([3, 2]);
    expect(jumpPath(37, 15, true, 'next-ten')).toEqual([3, 10, 2]);
    expect(jumpPath(42, 5, false, 'next-ten')).toEqual([-2, -3]);
    expect(jumpPath(40, 5, true, 'next-ten')).toEqual([5]);
    expect(jumpPath(64, 30, false, 'tens-ones')).toEqual([-10, -10, -10]);
  });

  it('the next-ten solution replays to a correct item', () => {
    const t = tpl('number-line-jump', 'pictorial', 'open-number-line');
    const item = generateItemFromParams(t, { a: 46, b: 8, op: '+', strategy: 'next-ten' });
    const steps = itemSolution(item, t);
    expect(steps.filter((s) => s.action?.op === 'hop').map((s) => s.action?.args?.by)).toEqual([
      4, 4,
    ]);
    expect(steps[1]?.say).toBe('gen.mda.addsub.to-ten');
  });

  it('moves rows for tens and boxes for ones on the chart', () => {
    expect(chartMoves(23, true)).toEqual(['down', 'down', 'right', 'right', 'right']);
    expect(chartMoves(12, false)).toEqual(['up', 'left', 'left']);
  });

  it('groups the tens and the ones, dropping zero terms', () => {
    expect(groupedTokens(40, 32, true).map((x) => ('v' in x ? x.v : x.t))).toEqual([
      '(',
      40,
      '+',
      30,
      ')',
      '+',
      2,
      '=',
      'blank',
    ]);
    expect(groupedTokens(46, 30, false).map((x) => ('v' in x ? x.v : x.t))).toEqual([
      '(',
      40,
      '-',
      30,
      ')',
      '+',
      6,
      '=',
      'blank',
    ]);
  });
});

describe('mda.addsub validity', () => {
  const draws = (t: ItemTemplate, seeds = 60) =>
    Array.from({ length: seeds }, (_, i) => generateItem(t, i + 1).params);

  it('base-ten-build never needs a trade', () => {
    const t = tpl('base-ten-build', 'concrete', 'base-ten', {
      a: { kind: 'int', min: 10, max: 89 },
      b: { kind: 'int', min: 1, max: 30 },
      op: { kind: 'choice', values: ['+', '-'] },
    });
    for (const p of draws(t)) {
      expect(p.carries).toBe(0);
      expect(p.borrows).toBe(0);
    }
  });

  it('subtraction never goes below 1, and the hundred chart keeps the ones in the row', () => {
    const t = tpl('hundred-chart', 'pictorial', 'hundred-chart', {
      a: { kind: 'int', min: 11, max: 99 },
      b: { kind: 'int', min: 1, max: 40 },
      op: { kind: 'choice', values: ['+', '-'] },
    });
    for (const p of draws(t)) {
      const a = p.a as number;
      const r = p.result as number;
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(120);
      const mid =
        p.op === '+'
          ? a + (p.b as number) - ((p.b as number) % 10)
          : a - (p.b as number) + ((p.b as number) % 10);
      expect(Math.floor((mid - 1) / 10)).toBe(Math.floor((r - 1) / 10));
    }
  });

  it('filters by regroups, digits and the minuend zero', () => {
    const t = tpl('number-pad', 'abstract', 'symbols', {
      a: { kind: 'int', min: 10, max: 999 },
      b: { kind: 'int', min: 1, max: 99 },
      op: { kind: 'const', value: '-' },
      regroups: { kind: 'const', value: 1 },
      digitsA: { kind: 'const', value: 3 },
      zeroInMinuend: { kind: 'const', value: true },
    });
    for (const p of draws(t)) {
      expect(p.borrows).toBe(1);
      expect(String(p.a)).toHaveLength(3);
      expect(String(p.a).slice(1)).toContain('0');
    }
  });

  it('rejects change unknowns off the pad and the line, bad extra addends, a − b below 0', () => {
    const fails = (format: ItemFormat, params: Record<string, ParamSpec>) => {
      const t = tpl(format, 'pictorial', undefined, params);
      expect(() => generateItem(t, 1)).toThrow(GenerationError);
    };
    const n = (value: number | string): ParamSpec => ({ kind: 'const', value });
    fails('base-ten-trade', { unknown: n('change') });
    // More addends: 3–4 (MDA_ADDENDS_MAX), each 1–99, adding the result on the pad (or three in
    // expanded form) only.
    fails('number-pad', { addends: n(3) }); // c is 0
    fails('number-pad', { addends: n(5), c: n(11), d: n(12) });
    fails('number-pad', { addends: n(3), c: n(100) });
    fails('number-pad', { addends: n(3), c: n(11), op: n('-') });
    fails('number-pad', { addends: n(3), c: n(11), unknown: n('change') });
    fails('base-ten-trade', { addends: n(3), c: n(11) });
    fails('expanded-form', { addends: n(4), c: n(11), d: n(12) });
    fails('number-pad', { a: n(5), b: n(9), op: n('-') });
    // count-up subtracts and asks the result.
    fails('number-line-jump', { op: n('+'), strategy: n('count-up') });
    // A borrow in expanded form is shown for two-digit numbers only, and once.
    fails('expanded-form', { a: n(305), b: n(128), op: n('-') });
  });

  it('adds three or four numbers on the pad and three in expanded form (MDA.04)', () => {
    const n = (value: number | string): ParamSpec => ({ kind: 'const', value });
    const four = generateItem(
      tpl('number-pad', 'abstract', 'symbols', {
        a: n(23),
        b: n(18),
        c: n(29),
        d: n(14),
        addends: n(4),
      }),
      1,
    );
    expect(four.answer).toEqual({ kind: 'number', value: 84 });
    expect(four.params.carries).toBe(1);
    const tokens = (four.widget as { expression: { tokens: { v?: unknown }[] } }).expression.tokens;
    expect(tokens.map((x) => x.v ?? '_').join(' ')).toBe('23 + 18 + 29 + 14 = _');
    expect(
      groupedTokens(47, 25, true, [16])
        .map((x) => ('v' in x ? x.v : '_'))
        .join(' '),
    ).toBe('( 40 + 20 + 10 ) + ( 7 + 5 + 6 ) = _');
    // 52 − 27 shows the traded ten: (40 − 20) + (12 − 7).
    expect(
      groupedTokens(52, 27, false)
        .map((x) => ('v' in x ? x.v : '_'))
        .join(' '),
    ).toBe('( 40 - 20 ) + ( 12 - 7 ) = _');
  });

  it('counts up on the open line: from b to a for count-up, from a to the result for a change', () => {
    const n = (value: number | string): ParamSpec => ({ kind: 'const', value });
    const up = generateItem(
      tpl('number-line-jump', 'pictorial', 'open-number-line', {
        a: n(62),
        b: n(48),
        op: n('-'),
        strategy: n('count-up'),
      }),
      1,
    );
    expect(up.widget).toMatchObject({
      start: 48,
      target: 62,
      goal: 'difference',
      thenAsk: 'total-jump',
    });
    expect(up.answer).toMatchObject({ target: { start: 48, target: 62, value: 14 } });
    const change = generateItem(
      tpl('number-line-jump', 'pictorial', 'open-number-line', {
        a: n(36),
        b: n(44),
        unknown: n('change'),
      }),
      1,
    );
    expect(change.widget).toMatchObject({ start: 36, target: 80, goal: 'difference' });
    expect(change.answer).toMatchObject({ target: { value: 44 } });
    const back = generateItem(
      tpl('number-line-jump', 'pictorial', 'open-number-line', {
        a: n(80),
        b: n(44),
        op: n('-'),
        unknown: n('change'),
      }),
      1,
    );
    expect(back.widget).toMatchObject({ start: 36, target: 80, goal: 'difference' });
    expect(back.answer).toMatchObject({ target: { value: 44 } });
  });
});

describe('mda.addsub features', () => {
  it.each([
    [
      'easiest: two-digit plus, no regroup',
      { a: 34, b: 25, op: '+' },
      {
        digits: 0,
        regroups: 0,
        sub: 0,
        crossDecade: 0,
        'unknown.change': 0,
        'addends.extra': 0,
        'zero.minuend': 0,
      },
    ],
    ['crossing a ten', { a: 37, b: 5, op: '+' }, { regroups: 1, crossDecade: 1 }],
    ['subtract with a borrow', { a: 52, b: 27, op: '-' }, { regroups: 1, crossDecade: 1, sub: 1 }],
    [
      'three digits with an internal zero',
      { a: 304, b: 128, op: '-' },
      { digits: 1, regroups: 2, 'zero.minuend': 1 },
    ],
    ['change unknown', { a: 34, b: 25, op: '+', unknown: 'change' }, { 'unknown.change': 1 }],
  ] as const)('%s', (_name, params, want) => {
    const t = tpl('number-pad', 'abstract', 'symbols');
    const item = generateItemFromParams(t, params as unknown as ParamValues);
    const got = itemFeatures(item, t);
    for (const [k, v] of Object.entries(want)) expect(got[k], k).toBe(v);
  });

  it('generator features override the format features of the same name', () => {
    const t = tpl('number-line-jump', 'pictorial', 'open-number-line');
    const item = generateItemFromParams(t, { a: 64, b: 30, op: '-' });
    // The format would call 64 → 34 a crossDecade path; the generator's ones do not cross a ten.
    expect(itemFeatures(item, t).crossDecade).toBe(0);
  });

  it('feature values depend on the params only, never on the build RNG', () => {
    const t = tpl('number-line-jump', 'pictorial', 'open-number-line', {
      a: { kind: 'int', min: 10, max: 89 },
      b: { kind: 'int', min: 1, max: 30 },
      op: { kind: 'choice', values: ['+', '-'] },
    });
    for (let seed = 1; seed <= 40; seed += 1) {
      const item = generateItem(t, seed);
      const rebuilt = mdaAddSub.build({
        params: item.params,
        template: t,
        rng: createRng(seed * 7919).fork('other'),
      });
      expect(rebuilt.features).toEqual(itemFeatures(item, t));
      expect(rebuilt.features).toEqual({ ...rebuilt.features, ...mdaFeatures(item.params) });
    }
  });
});
