// 03 §7.1 / §7.2 fixture misconception rules: countStartNumber (answer + state), countAllInstead
// (process) and offByOneCounting (process), plus sameResponse.

import type {
  GeneratedItem,
  InteractionEvent,
  ItemTemplate,
  MisconceptionSpec,
  ParamSpec,
  ParamValues,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../content/binding';
import { checkResponse } from '../items/check';
import { generateItemFromParams } from '../items/generate';
import { misconceptionRule, registeredRuleIds } from '.';
import { sameResponse } from './rules';
import { countAllInstead } from './rules/countAllInstead';
import { countStartNumber } from './rules/countStartNumber';
import { offByOneCounting } from './rules/offByOneCounting';

// ---------- inline content ----------

const taps = (targets: string[]): InteractionEvent[] =>
  targets.map((target, i) => ({ t: 'tap' as const, target, ms: i * 500 }));
const counters = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `counter-${from + i}`);
const objs = (...ids: number[]): string[] => ids.map((i) => `obj-${i}`);

/** The three fixture specs, normalised as in packages/content/dist/misconceptions.json. */
const SPECS: MisconceptionSpec[] = [
  {
    id: 'MC.count-start-number',
    name: 'Counts the starting number when counting on',
    area: 'addsub',
    detect: { kind: 'answer', rule: 'countStartNumber' },
    appliesTo: { generators: ['addsub.facts'] },
    skills: ['ADD.03'],
    remediation: ['CNT.07', 'ADD.03'],
    feedback: 'fb.mc.count-start-number',
    priority: 60,
    parentTip:
      'When counting on from 5 to add 3, say "5" quietly and count "6, 7, 8" on three fingers.',
    examples: [
      {
        params: { a: 5, b: 3, op: '+', unknown: 'result' },
        response: { kind: 'number', value: 7 },
        match: true,
      },
      {
        params: { a: 5, b: 3, op: '+', unknown: 'result' },
        response: { kind: 'number', value: 9 },
        match: false,
      },
    ],
  },
  {
    id: 'MC.count-all-instead',
    name: 'Counts both groups from 1 instead of counting on',
    area: 'addsub',
    detect: { kind: 'process', rule: 'countAllInstead' },
    appliesTo: { generators: ['addsub.facts'] },
    skills: ['ADD.03'],
    remediation: ['ADD.03'],
    feedback: 'fb.mc.count-all-instead',
    priority: 40,
    parentTip:
      'Hide the first group under a cup, say how many are inside, then count on from there.',
    examples: [
      {
        params: { a: 5, b: 3, op: '+', unknown: 'result' },
        response: { kind: 'number', value: 8 },
        meta: { latencyMs: 9000, trace: taps(counters(0, 7)) },
        match: true,
      },
      {
        params: { a: 5, b: 3, op: '+', unknown: 'result' },
        response: { kind: 'number', value: 8 },
        meta: { latencyMs: 4000, trace: taps(counters(5, 7)) },
        match: false,
      },
    ],
  },
  {
    id: 'MC.off-by-one-counting',
    name: 'Skips an object or counts one twice',
    area: 'counting',
    detect: { kind: 'process', rule: 'offByOneCounting' },
    appliesTo: { generators: ['count.set'] },
    skills: ['CNT.02', 'CNT.03', 'CNT.06'],
    remediation: ['CNT.02'],
    feedback: 'fb.mc.off-by-one-counting',
    priority: 50,
    parentTip:
      'Ask your child to touch each object once and move it aside as they say each number.',
    examples: [
      {
        params: { n: 7, mode: 'how-many' },
        response: { kind: 'number', value: 6 },
        meta: { latencyMs: 6000, trace: taps(objs(0, 1, 2, 3, 4, 5)) },
        match: true,
      },
      {
        params: { n: 7, mode: 'how-many' },
        response: { kind: 'number', value: 7 },
        match: false,
      },
    ],
  },
];

const int = (min: number, max: number): ParamSpec => ({ kind: 'int', min, max });
const c = (value: string | number | boolean): ParamSpec => ({ kind: 'const', value });

function tpl(id: string, over: Partial<ItemTemplate>): ItemTemplate {
  return {
    id,
    skillId: 'ADD.03',
    format: 'number-pad',
    tier: 'abstract',
    generator: 'addsub.facts',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.x'] },
    ...over,
  };
}

const FACT_PARAMS = {
  a: int(0, 20),
  b: int(0, 20),
  op: c('+'),
  unknown: c('result'),
  family: c('any'),
};
const T = {
  pad: tpl('T.pad', { params: FACT_PARAMS }),
  pick: tpl('T.pick', {
    format: 'numeral-pick',
    tier: 'pictorial',
    params: FACT_PARAMS,
    distractors: [{ rule: 'MC.count-start-number' }],
  }),
  jump: tpl('T.jump', { format: 'number-line-jump', tier: 'concrete', params: FACT_PARAMS }),
  frame: tpl('T.frame', { format: 'tenframe-fill', tier: 'concrete', params: FACT_PARAMS }),
  tap: tpl('T.tap', {
    skillId: 'CNT.02',
    format: 'tap-count',
    tier: 'concrete',
    generator: 'count.set',
    params: { n: int(0, 20), mode: c('how-many') },
  }),
  countPad: tpl('T.countPad', {
    skillId: 'CNT.03',
    format: 'number-pad',
    generator: 'count.set',
    params: { n: int(0, 20), mode: c('how-many') },
  }),
  countPick: tpl('T.countPick', {
    skillId: 'CNT.03',
    format: 'numeral-pick',
    tier: 'pictorial',
    generator: 'count.set',
    params: { n: int(0, 20), mode: c('how-many') },
  }),
  makeSet: tpl('T.makeSet', {
    skillId: 'CNT.06',
    format: 'make-set',
    tier: 'concrete',
    generator: 'count.set',
    params: { n: int(0, 20), mode: c('make') },
  }),
};

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);

beforeEach(() => {
  resetContent();
  initContent({ templates: Object.values(T), narration: {}, misconceptions: SPECS });
});

describe('registry', () => {
  it('registers the rules by detect.rule id', () => {
    expect(registeredRuleIds().sort()).toEqual([
      'biggerUnitMore',
      'countAllInstead',
      'countStartNumber',
      'decadeTransition',
      'forgotTheTen',
      'fractionBiggerDenominator',
      'fractionUnequalParts',
      'hourHandNext',
      'hourMinuteSwap',
      'offByOneCounting',
      'patternRestart',
      'perceptualSize',
      'recountFromOne',
      'teenReversal',
      'unequalShare',
      'unitGaps',
      'wrongOperation',
    ]);
    expect(misconceptionRule('countStartNumber')).toBe(countStartNumber);
    expect(misconceptionRule('nope')).toBeUndefined();
  });

  it.each([
    ['countStartNumber', 'answer'],
    ['countAllInstead', 'process'],
    ['offByOneCounting', 'process'],
  ])('%s has kind %s', (id, kind) => {
    expect(misconceptionRule(id)?.kind).toBe(kind);
    expect(misconceptionRule(id)?.id).toBe(id);
  });
});

describe('fixture YAML examples evaluate as declared (V18)', () => {
  const cases = SPECS.flatMap((spec) =>
    spec.examples.map((ex, i) => ({
      name: `${spec.id} example ${i + 1} (match ${ex.match})`,
      spec,
      ex,
    })),
  );
  it.each(cases)('$name', ({ spec, ex }) => {
    const rule = misconceptionRule(spec.detect.rule);
    expect(rule).toBeDefined();
    const t = spec.appliesTo.generators[0] === 'count.set' ? T.tap : T.pad;
    const item = make(t, ex.params);
    expect(rule?.match(item, ex.response, ex.meta)).toBe(ex.match);
  });
});

describe('countStartNumber.predict', () => {
  it('number answer: + → v − 1', () => {
    expect(countStartNumber.predict?.(make(T.pad, { a: 5, b: 3 }))).toEqual({
      kind: 'number',
      value: 7,
    });
  });

  it('number answer: − → v + 1', () => {
    expect(countStartNumber.predict?.(make(T.pad, { a: 9, b: 3, op: '-' }))).toEqual({
      kind: 'number',
      value: 7,
    });
  });

  it.each([
    [
      'result 0 (count-up 0 + 0: the buggy answer would be negative)',
      { a: 0, b: 0, family: 'count-up' },
    ],
    ['a doubles fact with a < 3 (not a count-on family)', { a: 2, b: 2, family: 'doubles' }],
    ['a doubles fact with a ≥ 3 (still not a count-on family)', { a: 5, b: 5, family: 'doubles' }],
    ['family any with a < 3', { a: 2, b: 6 }],
    ['a make-ten fact', { a: 8, b: 5, family: 'make-ten' }],
    ['a change-unknown item', { a: 5, b: 3, unknown: 'change' }],
    ['a start-unknown item', { a: 5, b: 3, unknown: 'start' }],
  ])(
    'returns null (and match is false) when the item cannot discriminate: %s',
    (_label, params) => {
      const item = make(T.pad, params);
      expect(countStartNumber.predict?.(item)).toBeNull();
      const v = item.answer.kind === 'number' ? item.answer.value : Number.NaN;
      for (const r of [v - 1, v + 1])
        expect(countStartNumber.match(item, { kind: 'number', value: r })).toBe(false);
    },
  );

  it.each([
    ['family any with a = 3', { a: 3, b: 6 }, 8],
    ['plus1', { a: 6, b: 1, family: 'plus1' }, 6],
    ['plus2', { a: 2, b: 7, family: 'plus2' }, 8],
    ['count-up', { a: 1, b: 4, family: 'count-up' }, 4],
    ['count-up with result 1', { a: 1, b: 0, family: 'count-up' }, 0],
  ])('discriminates on count-on families: %s', (_label, params, buggy) => {
    expect(countStartNumber.predict?.(make(T.pad, params))).toEqual({
      kind: 'number',
      value: buggy,
    });
  });

  it('numeral-pick: predicts the opt-<n> choice, which the diagnostic distractor put on screen', () => {
    const item = make(T.pick, { a: 5, b: 3 });
    expect(item.widget.format === 'numeral-pick' && item.widget.options.map((o) => o.id)).toContain(
      'opt-7',
    );
    expect(countStartNumber.predict?.(item)).toEqual({ kind: 'choice', id: 'opt-7' });
    expect(countStartNumber.match(item, { kind: 'choice', id: 'opt-7' })).toBe(true);
    expect(countStartNumber.match(item, { kind: 'choice', id: 'opt-9' })).toBe(false);
  });

  it('numeral-pick: null when the buggy option is not on screen', () => {
    const item = make(T.pick, { a: 5, b: 3 });
    if (item.widget.format !== 'numeral-pick') throw new Error('expected numeral-pick');
    const without: GeneratedItem = {
      ...item,
      widget: { ...item.widget, options: item.widget.options.filter((o) => o.id !== 'opt-7') },
    };
    expect(countStartNumber.predict?.(without)).toBeNull();
  });

  it('number-line-jump (+): lands on target − 1 with the entered landing', () => {
    const item = make(T.jump, { a: 5, b: 3 });
    const predicted = countStartNumber.predict?.(item);
    expect(predicted).toEqual({ kind: 'state', value: { jumps: [1, 1], value: 7 } });
    expect(countStartNumber.match(item, { kind: 'state', value: { jumps: [1, 1] } })).toBe(true);
    expect(countStartNumber.match(item, { kind: 'state', value: { jumps: [1, 1, 1] } })).toBe(
      false,
    );
    expect(countStartNumber.match(item, { kind: 'state', value: { jumps: 'bad' } })).toBe(false);
    // The predicted state is checked incorrect and tagged by checkResponse.
    const res = checkResponse(item, predicted as NonNullable<typeof predicted>);
    expect(res.correct).toBe(false);
    expect(res.misconceptionIds).toEqual(['MC.count-start-number']);
  });

  it('number-line-jump (−): lands on target + 1', () => {
    const item = make(T.jump, { a: 9, b: 3, op: '-' });
    expect(countStartNumber.predict?.(item)).toEqual({
      kind: 'state',
      value: { jumps: [-1, -1], value: 7 },
    });
    expect(countStartNumber.match(item, { kind: 'state', value: { jumps: [-1, -1] } })).toBe(true);
  });

  it('number-line-jump: null when the buggy landing needs no hop (b = 1)', () => {
    expect(countStartNumber.predict?.(make(T.jump, { a: 2, b: 1 }))).toBeNull();
  });

  it('tenframe-fill add with thenAsk total: correct counters, total = result − 1', () => {
    const item = make(T.frame, { a: 5, b: 3 });
    expect(item.widget).toMatchObject({ goal: 'add', thenAsk: 'total' });
    const predicted = countStartNumber.predict?.(item);
    const cells = [[1, 1, 1, 1, 1, 2, 2, 2, 0, 0]];
    expect(predicted).toEqual({ kind: 'state', value: { cells, value: 7 } });
    expect(countStartNumber.match(item, { kind: 'state', value: { cells, value: 7 } })).toBe(true);
    expect(countStartNumber.match(item, { kind: 'state', value: { cells, value: 8 } })).toBe(false);
    const res = checkResponse(item, predicted as NonNullable<typeof predicted>);
    expect(res).toMatchObject({ correct: false, misconceptionIds: ['MC.count-start-number'] });
  });

  // Regression (fixed; was: misconceptions/rules/countStartNumber.ts): on a tenframe-fill *subtract* item (9 − 3 = 6,
  // family any, a ≥ 3, so countsOn is true) `predict` returns null (it only handles goal 'add'),
  // while `match` returns true for any state whose entered value is 7 (it checks
  // `r.value.value === buggy` for every tenframe-fill). 03 §7.1: a rule with `predict` matches
  // exactly when the response equals predict(item), so the two must agree.
  it('tenframe-fill subtract: predict and match agree (9 − 3, value 7)', () => {
    const item = make(T.frame, { a: 9, b: 3, op: '-' });
    const r = {
      kind: 'state',
      value: { cells: [[1, 1, 1, 1, 1, 1, 0, 0, 0, 0]], value: 7 },
    } as const;
    const predicted = countStartNumber.predict?.(item) ?? null;
    expect(countStartNumber.match(item, r)).toBe(predicted !== null && sameResponse(predicted, r));
  });

  it('tenframe-fill over two frames: 8 + 5 predicts 12 with 13 counters', () => {
    const item = make(T.frame, { a: 8, b: 5 });
    expect(countStartNumber.predict?.(item)).toEqual({
      kind: 'state',
      value: {
        cells: [
          [1, 1, 1, 1, 1, 1, 1, 1, 2, 2],
          [2, 2, 2, 0, 0, 0, 0, 0, 0, 0],
        ],
        value: 12,
      },
    });
  });
});

describe('countAllInstead.match', () => {
  const r = { kind: 'number', value: 8 } as const;
  it.each([
    ['all a + b counters from the first addend', counters(0, 7), true],
    [
      'all counters, out of order but starting in the first addend',
      ['counter-2', ...counters(0, 7)],
      true,
    ],
    ['counting on from the second addend', counters(5, 7), false],
    [
      'starting on the second addend then going back',
      [...counters(5, 7), ...counters(0, 4)],
      false,
    ],
    ['missing one counter', counters(0, 6), false],
    ['non-counter taps only', objs(0, 1, 2), false],
  ])('%s → %s', (_label, targets, want) => {
    expect(
      countAllInstead.match(make(T.pad, { a: 5, b: 3 }), r, { latencyMs: 1, trace: taps(targets) }),
    ).toBe(want);
  });

  it('ignores drag events and needs a trace', () => {
    const item = make(T.pad, { a: 5, b: 3 });
    const drags = counters(0, 7).map((target, i) => ({ t: 'drag' as const, target, ms: i }));
    expect(countAllInstead.match(item, r, { latencyMs: 1, trace: drags })).toBe(false);
    expect(countAllInstead.match(item, r, { latencyMs: 1 })).toBe(false);
    expect(countAllInstead.match(item, r)).toBe(false);
  });

  it('applies to addition only, with a > 0', () => {
    const trace = taps(counters(0, 12));
    expect(
      countAllInstead.match(make(T.pad, { a: 9, b: 3, op: '-' }), r, { latencyMs: 1, trace }),
    ).toBe(false);
    expect(countAllInstead.match(make(T.pad, { a: 0, b: 3 }), r, { latencyMs: 1, trace })).toBe(
      false,
    );
  });

  it('may tag a correct response', () => {
    const item = make(T.pad, { a: 8, b: 5 });
    const correct = { kind: 'number', value: 13 } as const;
    expect(checkResponse(item, correct).correct).toBe(true);
    expect(
      countAllInstead.match(item, correct, { latencyMs: 1, trace: taps(counters(0, 12)) }),
    ).toBe(true);
  });
});

describe('offByOneCounting', () => {
  it.each([
    ['n = 3', 3],
    ['n = 0', 0],
  ])('predict returns null below 4 (%s)', (_label, n) => {
    const item = make(T.countPad, { n });
    expect(offByOneCounting.predict?.(item)).toBeNull();
    expect(offByOneCounting.match(item, { kind: 'number', value: n + 1 })).toBe(false);
  });

  it.each([
    ['number-pad', T.countPad, { kind: 'number', value: 6 }],
    ['tap-count', T.tap, { kind: 'number', value: 6 }],
    ['numeral-pick', T.countPick, { kind: 'choice', id: 'opt-6' }],
    ['make-set', T.makeSet, { kind: 'state', value: { count: 6, removed: 0 } }],
  ] as const)('predict on %s skips one object (n = 7 → 6)', (_label, t, want) => {
    expect(offByOneCounting.predict?.(make(t, { n: 7 }))).toEqual(want);
  });

  it('predict is null for count.set modes that do not ask for a count', () => {
    const t = tpl('T.addMore', {
      skillId: 'CNT.06',
      format: 'make-set',
      tier: 'concrete',
      generator: 'count.set',
      params: { n: int(0, 20), start: int(0, 20), mode: c('add-more') },
    });
    expect(offByOneCounting.predict?.(make(t, { n: 7, start: 2 }))).toBeNull();
  });

  it('without a tap trace: matches r = v ± 1 when v ≥ 4', () => {
    const item = make(T.countPad, { n: 7 });
    expect(offByOneCounting.match(item, { kind: 'number', value: 6 })).toBe(true);
    expect(offByOneCounting.match(item, { kind: 'number', value: 8 })).toBe(true);
    expect(offByOneCounting.match(item, { kind: 'number', value: 5 })).toBe(false);
    expect(offByOneCounting.match(item, { kind: 'number', value: 7 })).toBe(false);
    expect(
      offByOneCounting.match(item, { kind: 'number', value: 6 }, { latencyMs: 1, trace: [] }),
    ).toBe(true);
  });

  it('on make-set reads the container count', () => {
    const item = make(T.makeSet, { n: 7 });
    expect(offByOneCounting.match(item, { kind: 'state', value: { count: 6, removed: 0 } })).toBe(
      true,
    );
    expect(offByOneCounting.match(item, { kind: 'state', value: { count: 8, removed: 0 } })).toBe(
      true,
    );
    expect(offByOneCounting.match(item, { kind: 'state', value: { count: 5, removed: 0 } })).toBe(
      false,
    );
    expect(offByOneCounting.match(item, { kind: 'state', value: { removed: 0 } })).toBe(false);
  });

  it('on numeral-pick reads the picked number', () => {
    const item = make(T.countPick, { n: 7 });
    expect(offByOneCounting.match(item, { kind: 'choice', id: 'opt-8' })).toBe(true);
    expect(offByOneCounting.match(item, { kind: 'choice', id: 'opt-9' })).toBe(false);
  });

  it.each([
    ['a double tap on one object, r = v + 1', objs(0, 1, 2, 3, 3, 4, 5, 6), 8, true],
    ['an untapped object, r = v − 1', objs(0, 1, 2, 4, 5, 6), 6, true],
    ['every object tapped exactly once, r = v + 1', objs(0, 1, 2, 3, 4, 5, 6), 8, false],
    ['a double tap but r = v + 2', objs(0, 1, 2, 3, 3, 4, 5, 6), 9, false],
  ])('with a tap trace (n = 7): %s → %s', (_label, targets, value, want) => {
    const item = make(T.tap, { n: 7 });
    expect(
      offByOneCounting.match(
        item,
        { kind: 'number', value },
        { latencyMs: 1, trace: taps(targets) },
      ),
    ).toBe(want);
  });

  it('a tap trace decides even below 4 (n = 3, double tap → 4)', () => {
    const item = make(T.tap, { n: 3 });
    expect(
      offByOneCounting.match(
        item,
        { kind: 'number', value: 4 },
        { latencyMs: 1, trace: taps(objs(0, 1, 1, 2)) },
      ),
    ).toBe(true);
  });
});

describe('sameResponse', () => {
  it.each([
    ['equal numbers', { kind: 'number', value: 3 }, { kind: 'number', value: 3 }, true],
    ['different numbers', { kind: 'number', value: 3 }, { kind: 'number', value: 4 }, false],
    ['different kinds', { kind: 'number', value: 3 }, { kind: 'choice', id: '3' }, false],
    ['choice ids', { kind: 'choice', id: 'opt-3' }, { kind: 'choice', id: 'opt-3' }, true],
    [
      'number lists in order',
      { kind: 'numbers', values: [1, 2] },
      { kind: 'numbers', values: [1, 2] },
      true,
    ],
    [
      'number lists out of order',
      { kind: 'numbers', values: [1, 2] },
      { kind: 'numbers', values: [2, 1] },
      false,
    ],
    [
      'state objects with keys in another order',
      { kind: 'state', value: { jumps: [1, 1], value: 7, nested: { b: 1, a: 2 } } },
      { value: { nested: { a: 2, b: 1 }, value: 7, jumps: [1, 1] }, kind: 'state' },
      true,
    ],
    [
      'state objects ignoring undefined keys',
      { kind: 'state', value: { count: 6, extra: undefined } },
      { kind: 'state', value: { count: 6 } },
      true,
    ],
    [
      'state objects with different nested arrays',
      { kind: 'state', value: { cells: [[1, 0]] } },
      { kind: 'state', value: { cells: [[0, 1]] } },
      false,
    ],
  ] as const)('%s → %s', (_label, a, b, want) => {
    expect(sameResponse(a as never, b as never)).toBe(want);
  });
});
