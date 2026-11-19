// K01 equality and story rules (03 §7.2): equalsMeansAnswer, equalsAddAll, startUnknownReversed,
// keywordMoreMeansAdd and symbolReversed, plus countAllInstead on three addends. Each includes
// non-discriminating items (predict is null, match is false) and checks that checkResponse tags
// the predicted response, the higher priority winning where two rules predict the same answer.

import type {
  GeneratedItem,
  GeneratorId,
  ItemFormat,
  ItemTemplate,
  MisconceptionSpec,
  ParamValues,
  ResponseValue,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { checkResponse } from '../../items/check';
import { generateItemFromParams } from '../../items/generate';
import { misconceptionRule } from '..';
import { countAllInstead } from './countAllInstead';
import { equalsAddAll } from './equalsAddAll';
import { equalsMeansAnswer } from './equalsMeansAnswer';
import { keywordMoreMeansAdd } from './keywordMoreMeansAdd';
import { startUnknownReversed } from './startUnknownReversed';
import { symbolReversed } from './symbolReversed';

function tpl(
  id: string,
  skillId: string,
  generator: GeneratorId,
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  return {
    id,
    skillId,
    format,
    tier: 'pictorial',
    generator,
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.x'] },
    ...over,
  };
}

const spec = (
  id: string,
  rule: string,
  generators: string[],
  skills: string[],
  priority = 50,
): MisconceptionSpec => ({
  id,
  name: id,
  area: 'equality',
  detect: { kind: 'answer', rule },
  appliesTo: { generators },
  skills,
  remediation: [skills[0] as string],
  feedback: `fb.mc.${id.slice(3)}`,
  priority,
  parentTip: 'tip',
  examples: [],
});

const SPECS = [
  spec('MC.equals-means-answer', 'equalsMeansAnswer', ['equality.eq'], ['ADD.10', 'ADD.11']),
  spec('MC.equals-add-all', 'equalsAddAll', ['equality.eq'], ['ADD.11']),
  spec(
    'MC.start-unknown-reversed',
    'startUnknownReversed',
    ['equality.eq', 'story.addsub', 'addsub.facts'],
    ['ADD.11', 'ADD.12'],
    55,
  ),
  spec('MC.keyword-more-means-add', 'keywordMoreMeansAdd', ['story.addsub'], ['ADD.12', 'ADD.21']),
  spec('MC.symbol-reversed', 'symbolReversed', ['compare.numbers'], ['CMP.08']),
];

const T = {
  pad10: tpl('T.pad10', 'ADD.10', 'equality.eq', 'number-pad', { tier: 'abstract' }),
  pad11: tpl('T.pad11', 'ADD.11', 'equality.eq', 'number-pad', { tier: 'abstract' }),
  pick11: tpl('T.pick11', 'ADD.11', 'equality.eq', 'numeral-pick', {
    tier: 'abstract',
    distractors: [{ rule: 'MC.equals-means-answer' }, { rule: 'MC.equals-add-all' }],
  }),
  judge10: tpl('T.judge10', 'ADD.10', 'equality.eq', 'compare', { tier: 'abstract' }),
  scale10: tpl('T.scale10', 'ADD.10', 'equality.eq', 'balance', {
    tier: 'concrete',
    representation: 'balance',
  }),
  bar11: tpl('T.bar11', 'ADD.11', 'addsub.facts', 'number-pad', { representation: 'bar-model' }),
  story12: tpl('T.story12', 'ADD.12', 'story.addsub', 'story-problem', {
    representation: 'story',
  }),
  story21: tpl('T.story21', 'ADD.21', 'story.addsub', 'number-pad', { tier: 'abstract' }),
  cmp08: tpl('T.cmp08', 'CMP.08', 'compare.numbers', 'compare', { tier: 'abstract' }),
  three13: tpl('T.three13', 'ADD.13', 'addsub.three', 'tenframe-fill', {
    tier: 'concrete',
    representation: 'ten-frame',
  }),
};

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);
const num = (value: number): ResponseValue => ({ kind: 'number', value });
const pick = (id: string): ResponseValue => ({ kind: 'choice', id });

beforeEach(() => {
  resetContent();
  initContent({ templates: Object.values(T), narration: {}, misconceptions: SPECS });
});

describe('registry', () => {
  it.each([
    'equalsMeansAnswer',
    'equalsAddAll',
    'startUnknownReversed',
    'keywordMoreMeansAdd',
    'symbolReversed',
  ])('%s is an answer rule', (id) => {
    expect(misconceptionRule(id)?.kind).toBe('answer');
    expect(misconceptionRule(id)?.id).toBe(id);
  });
});

describe('equalsMeansAnswer', () => {
  it('3 + 4 = 5 + _ → 7 is predicted and tagged', () => {
    const item = make(T.pad10, { form: 'a+b=c+_', a: 3, b: 4, c: 5 });
    expect(equalsMeansAnswer.predict?.(item)).toEqual(num(7));
    expect(equalsMeansAnswer.match(item, num(12))).toBe(false);
    expect(checkResponse(item, num(7)).misconceptionIds).toEqual(['MC.equals-means-answer']);
  });

  it('one-sided forms cannot discriminate', () => {
    for (const form of ['a+b=_', '_=a+b', 'a+_=c', '_+b=c']) {
      const item = make(T.pad10, { form, a: 3, b: 4, c: 1 });
      expect(equalsMeansAnswer.predict?.(item)).toBeNull();
      expect(equalsMeansAnswer.match(item, num(7))).toBe(false);
    }
  });

  it('judges a true equation with the answer on the left (or ops on both sides) false', () => {
    const left = make(T.judge10, { form: '_=a+b', a: 3, b: 4, truth: true });
    expect(equalsMeansAnswer.predict?.(left)).toEqual(pick('false'));
    expect(checkResponse(left, pick('false')).misconceptionIds).toEqual(['MC.equals-means-answer']);
    const both = make(T.judge10, { form: 'a+b=c+_', a: 3, b: 4, c: 5, truth: true });
    expect(equalsMeansAnswer.predict?.(both)).toEqual(pick('false'));
    // a + b = c is the form the misconception reads correctly, and a false one is judged false.
    expect(
      equalsMeansAnswer.predict?.(make(T.judge10, { form: 'a+b=_', a: 3, b: 4, truth: true })),
    ).toBeNull();
    expect(
      equalsMeansAnswer.predict?.(
        make(T.judge10, { form: '_=a+b', a: 3, b: 4, truth: false, off: 1 }),
      ),
    ).toBeNull();
  });

  it('make-equal: puts the left side’s answer on the right pan', () => {
    const item = make(T.scale10, { form: 'a+b=c+_', mode: 'make-equal', a: 3, b: 4, c: 5 });
    const buggy: ResponseValue = { kind: 'state', value: { left: 0, right: 7 } };
    expect(equalsMeansAnswer.predict?.(item)).toEqual(buggy);
    expect(checkResponse(item, buggy).misconceptionIds).toEqual(['MC.equals-means-answer']);
  });
});

describe('equalsAddAll', () => {
  it('adds every number shown', () => {
    expect(equalsAddAll.predict?.(make(T.pad11, { form: 'a+b=c+_', a: 3, b: 4, c: 5 }))).toEqual(
      num(12),
    );
    expect(equalsAddAll.predict?.(make(T.pad11, { form: 'a+_=c', a: 8, b: 3 }))).toEqual(num(19));
    expect(equalsAddAll.predict?.(make(T.pad11, { form: 'a+_=c', op: '-', a: 9, b: 4 }))).toEqual(
      num(14),
    );
  });

  it('a + b = _ and _ − b = c cannot discriminate (the sum is the answer)', () => {
    expect(equalsAddAll.predict?.(make(T.pad11, { form: 'a+b=_', a: 3, b: 4 }))).toBeNull();
    const start = make(T.pad11, { form: '_+b=c', op: '-', a: 8, b: 3 });
    expect(equalsAddAll.predict?.(start)).toBeNull();
    expect(equalsAddAll.match(start, num(8))).toBe(false);
  });

  it('builds diagnostic distractors with equals-means-answer', () => {
    const item = make(T.pick11, { form: 'a+b=_+c', a: 6, b: 2, c: 5 });
    const ids = item.widget.format === 'numeral-pick' ? item.widget.options.map((o) => o.id) : [];
    expect(ids).toEqual(expect.arrayContaining(['opt-3', 'opt-8', 'opt-13']));
    expect(checkResponse(item, pick('opt-13')).misconceptionIds).toEqual(['MC.equals-add-all']);
    expect(checkResponse(item, pick('opt-8')).misconceptionIds).toEqual(['MC.equals-means-answer']);
  });
});

describe('startUnknownReversed', () => {
  it('_ − 3 = 5 → 2 and _ + 3 = 8 → 11 (equality.eq)', () => {
    const minus = make(T.pad11, { form: '_+b=c', op: '-', a: 8, b: 3 });
    expect(startUnknownReversed.predict?.(minus)).toEqual(num(2));
    expect(checkResponse(minus, num(2)).misconceptionIds).toEqual(['MC.start-unknown-reversed']);
    const plus = make(T.pad11, { form: '_+b=c', op: '+', a: 5, b: 3 });
    expect(startUnknownReversed.predict?.(plus)).toEqual(num(11));
    // equals-add-all predicts 11 too: only the higher-priority rule is tagged.
    expect(checkResponse(plus, num(11)).misconceptionIds).toEqual(['MC.start-unknown-reversed']);
  });

  it('addsub.facts start unknown on a bar model', () => {
    const item = make(T.bar11, { a: 9, b: 4, op: '-', unknown: 'start', family: 'any' });
    expect(startUnknownReversed.predict?.(item)).toEqual(num(1));
    expect(startUnknownReversed.match(item, num(1))).toBe(true);
  });

  it('story start-unknown situations, and nothing else', () => {
    const item = make(T.story12, {
      situation: 'take-from/start',
      context: 'beach-shells',
      a: 3,
      b: 5,
    });
    expect(startUnknownReversed.predict?.(item)).toEqual(num(2));
    const change = make(T.story12, {
      situation: 'add-to/change',
      context: 'beach-shells',
      a: 3,
      b: 5,
    });
    expect(startUnknownReversed.predict?.(change)).toBeNull();
    expect(startUnknownReversed.match(change, num(8))).toBe(false);
    expect(startUnknownReversed.predict?.(make(T.pad11, { form: 'a+_=c', a: 8, b: 3 }))).toBeNull();
  });
});

describe('keywordMoreMeansAdd', () => {
  it.each([
    ['compare/difference-more', 9, 3, 12],
    ['compare/difference-fewer', 9, 3, 12],
    ['compare/smaller-more', 9, 3, 12],
  ])('%s %i, %i → %i', (situation, a, b, r) => {
    const item = make(T.story21, { situation, context: 'beach-shells', a, b });
    expect(keywordMoreMeansAdd.predict?.(item)).toEqual(num(r));
    expect(checkResponse(item, num(r)).misconceptionIds).toEqual(['MC.keyword-more-means-add']);
  });

  it('adding stories and consistent compare words cannot discriminate', () => {
    for (const situation of ['compare/bigger-more', 'compare/bigger-fewer', 'add-to/result']) {
      const item = make(T.story21, { situation, context: 'beach-shells', a: 4, b: 3 });
      expect(keywordMoreMeansAdd.predict?.(item)).toBeNull();
      expect(keywordMoreMeansAdd.match(item, num(7))).toBe(false);
    }
    const fewer = make(T.story21, {
      situation: 'compare/smaller-fewer',
      context: 'beach-shells',
      a: 9,
      b: 3,
    });
    expect(keywordMoreMeansAdd.predict?.(fewer)).toBeNull();
  });
});

describe('symbolReversed', () => {
  it('7 _ 3 → < is predicted; 7 _ 7 cannot discriminate', () => {
    const item = make(T.cmp08, { a: 7, b: 3, extra: 0, min: 0, max: 20, ask: 'symbol' });
    expect(symbolReversed.predict?.(item)).toEqual(pick('<'));
    expect(checkResponse(item, pick('<')).misconceptionIds).toEqual(['MC.symbol-reversed']);
    expect(symbolReversed.match(item, pick('='))).toBe(false);
    const same = make(T.cmp08, { a: 7, b: 7, extra: 0, min: 0, max: 20, ask: 'symbol' });
    expect(symbolReversed.predict?.(same)).toBeNull();
    expect(symbolReversed.match(same, pick('<'))).toBe(false);
  });
});

describe('countAllInstead on three addends', () => {
  const tap = (i: number) => ({ t: 'tap' as const, target: `counter-${i}`, ms: i * 400 });
  it('tapping all 3 + 2 + 4 counters from the first matches; counting on does not', () => {
    const item = make(T.three13, { a: 3, b: 2, c: 4 });
    const all = Array.from({ length: 9 }, (_, i) => tap(i));
    expect(countAllInstead.match(item, num(9), { latencyMs: 9000, trace: all })).toBe(true);
    const on = [3, 4, 5, 6, 7, 8].map(tap);
    expect(countAllInstead.match(item, num(9), { latencyMs: 4000, trace: on })).toBe(false);
    const short = Array.from({ length: 5 }, (_, i) => tap(i));
    expect(countAllInstead.match(item, num(9), { latencyMs: 4000, trace: short })).toBe(false);
  });
});
