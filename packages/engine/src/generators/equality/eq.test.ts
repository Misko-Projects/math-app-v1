// 03 §5.6 equality.eq: every form's missing number, fixed params → answer, widget and solution per
// format, exampleCorrect is correct, solutions replay through the models that exist (number-pad,
// numeral-pick, number-bond) and end with the answer, features at the extremes and as a function
// of the params only, `fact` and validity (accepts).

import {
  type GeneratedItem,
  type ItemFormat,
  type ItemTemplate,
  type ParamValues,
  widgetConfigSchema,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { stateChecker } from '../../check/state';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { createRng } from '../../rng';
import { registry } from '..';
import { equalityEq } from './eq';
import { equation, judgedValue, tokens } from './model';

let nextId = 0;
function tpl(format: ItemFormat, over: Partial<ItemTemplate> = {}): ItemTemplate {
  nextId += 1;
  return {
    id: `T.eq.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: 'pictorial',
    generator: 'equality.eq',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
    ...over,
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);

function checkItem(t: ItemTemplate, item: GeneratedItem): void {
  expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
  const model = formatModel(item.widget.format);
  if (model) expect(model.configSchema.safeParse(item.widget).success).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const steps = itemSolution(item, t);
  expect(steps.length).toBeGreaterThanOrEqual(2);
  if (model) {
    const r = replaySteps(item, steps);
    expect(r).not.toBeNull();
    expect(checkResponse(item, r as never).correct).toBe(true);
  } else {
    expect(['answer', 'place']).toContain(steps[steps.length - 1]?.action?.op);
  }
  for (const s of steps.slice(0, -1)) {
    expect(['answer', 'type', 'tap', 'fill', 'place']).not.toContain(s.action?.op);
  }
  // Features are a function of the params: another layout stream changes none.
  const again = registry
    .get('equality.eq')
    ?.build({ params: item.params, template: t, rng: createRng(99).fork('x') });
  expect(again?.features).toEqual(itemFeatures(item, t));
}

describe('equation forms', () => {
  it.each<[string, ParamValues, number, number, number[]]>([
    ['a+b=_', { form: 'a+b=_', a: 3, b: 4 }, 7, 7, [3, 4]],
    ['_=a+b', { form: '_=a+b', a: 3, b: 4 }, 7, 7, [3, 4]],
    ['a+_=c', { form: 'a+_=c', a: 8, b: 3 }, 11, 3, [8, 11]],
    ['_+b=c', { form: '_+b=c', a: 5, b: 3 }, 8, 5, [3, 8]],
    ['a-_=c', { form: 'a+_=c', op: '-', a: 9, b: 4 }, 5, 4, [9, 5]],
    ['_-b=c', { form: '_+b=c', op: '-', a: 8, b: 3 }, 5, 8, [3, 5]],
    ['a+b=c+_', { form: 'a+b=c+_', a: 3, b: 4, c: 5 }, 7, 2, [3, 4, 5]],
    ['a+b=_+c', { form: 'a+b=_+c', a: 6, b: 2, c: 5 }, 8, 3, [6, 2, 5]],
    ['a=c+_', { form: 'a=c+_', a: 13, c: 9 }, 13, 4, [13, 9]],
    ['between <', { form: 'between', rel: '<', a: 9 }, 10, 10, [9, 11]],
  ])('%s', (_name, p, value, missing, shown) => {
    const eq = equation(p);
    expect(eq.value).toBe(value);
    expect(eq.missing).toBe(missing);
    expect(eq.shown).toEqual(shown);
  });

  it('writes the tokens in reading order, the blank as x', () => {
    expect(tokens(equation({ form: 'a+b=c+_', a: 3, b: 4, c: 5 }))).toEqual([
      { t: 'num', v: 3 },
      { t: 'op', v: '+' },
      { t: 'num', v: 4 },
      { t: 'rel', v: '=' },
      { t: 'num', v: 5 },
      { t: 'op', v: '+' },
      { t: 'blank', id: 'x' },
    ]);
    expect(tokens(equation({ form: 'between', rel: '>', a: 4 }))).toEqual([
      { t: 'num', v: 6 },
      { t: 'rel', v: '>' },
      { t: 'blank', id: 'x' },
      { t: 'rel', v: '>' },
      { t: 'num', v: 4 },
    ]);
  });

  it('a judged equation shows the right number, or one off by `off` when false', () => {
    expect(judgedValue({ form: '_=a+b', a: 3, b: 4, truth: true, off: 2 })).toBe(7);
    expect(judgedValue({ form: '_=a+b', a: 3, b: 4, truth: false, off: -1 })).toBe(6);
  });
});

describe('formats', () => {
  it('number-pad (abstract): 3 + 4 = 5 + _ answers 2', () => {
    const t = tpl('number-pad', { tier: 'abstract' });
    const item = make(t, { form: 'a+b=c+_', a: 3, b: 4, c: 5 });
    expect(item.answer).toEqual({ kind: 'number', value: 2 });
    expect(item.widget).toMatchObject({ stimulus: { kind: 'none' }, blanks: [{ id: 'x' }] });
    checkItem(t, item);
  });

  it('number-pad (pictorial objects) pictures the two groups', () => {
    const t = tpl('number-pad', { representation: 'objects' });
    const item = make(t, { form: '_=a+b', a: 3, b: 4 });
    expect(item.widget.format === 'number-pad' && item.widget.stimulus).toMatchObject({
      kind: 'objects',
      set: { count: 7, layout: 'groups', groups: [3, 4] },
    });
    checkItem(t, item);
  });

  it('number-pad (bar model) leaves the asked slot empty', () => {
    const t = tpl('number-pad', { representation: 'bar-model' });
    const item = make(t, { form: '_+b=c', a: 5, b: 3 });
    expect(item.widget.format === 'number-pad' && item.widget.stimulus).toEqual({
      kind: 'bar-model',
      parts: ['?', 3],
      whole: 8,
    });
    checkItem(t, item);
  });

  it('number-pad between: 9 < _ < 11 answers 10', () => {
    const t = tpl('number-pad', { tier: 'abstract' });
    const item = make(t, { form: 'between', rel: '<', a: 9 });
    expect(item.answer).toEqual({ kind: 'number', value: 10 });
    checkItem(t, item);
  });

  it('numeral-pick offers the answer among 3–5 numbers', () => {
    const t = tpl('numeral-pick', { tier: 'abstract' });
    const item = make(t, { form: 'a+b=_+c', a: 6, b: 2, c: 5 });
    expect(item.answer).toEqual({ kind: 'choice', id: 'opt-3' });
    checkItem(t, item);
  });

  it('number-bond: a missing part (a + _ = c) and a missing whole (_ − b = c)', () => {
    const t = tpl('number-bond');
    const part = make(t, { form: 'a+_=c', a: 8, b: 3 });
    expect(part.widget).toMatchObject({ whole: 11, parts: [8, null], mode: 'missing-part' });
    checkItem(t, part);
    const whole = make(t, { form: '_+b=c', op: '-', a: 8, b: 3 });
    expect(whole.widget).toMatchObject({ whole: null, parts: [3, 5], mode: 'missing-whole' });
    expect(whole.answer).toEqual({ kind: 'number', value: 8 });
    checkItem(t, whole);
  });

  it('compare judges the whole statement, on the left', () => {
    const t = tpl('compare', { tier: 'abstract' });
    const yes = make(t, { form: '_=a+b', a: 3, b: 4, truth: true });
    expect(yes.answer).toEqual({ kind: 'choice', id: 'true' });
    expect(yes.widget).toMatchObject({ ask: 'true-false', right: { kind: 'none' } });
    checkItem(t, yes);
    const no = make(t, { form: 'a+b=c+_', a: 3, b: 4, c: 5, truth: false, off: 1 });
    expect(no.answer).toEqual({ kind: 'choice', id: 'false' });
    expect(no.widget.format === 'compare' && no.widget.left).toMatchObject({
      kind: 'expression',
      expr: { tokens: expect.arrayContaining([{ t: 'num', v: 3 }]) },
    });
    checkItem(t, no);
  });

  it('balance fill-blank: numerals at the pictorial tier, objects at the concrete tier', () => {
    const pic = tpl('balance', { representation: 'balance' });
    const item = make(pic, { form: 'a+_=c', a: 8, b: 3 });
    expect(item.widget).toMatchObject({
      mode: 'fill-blank',
      left: { terms: [{ n: 8 }, { op: '+' }, { blank: 'x' }] },
      right: { terms: [{ n: 11 }] },
      showTilt: false,
    });
    expect(item.answer).toEqual({ kind: 'number', value: 3 });
    checkItem(pic, item);
    const con = tpl('balance', { tier: 'concrete', representation: 'balance' });
    const objects = make(con, { form: 'a+b=c+_', fact: 'turn-around', a: 3, b: 5, c: 5 });
    expect(objects.widget).toMatchObject({
      left: { terms: [{ object: 'shell', count: 3 }, { op: '+' }, { object: 'shell', count: 5 }] },
      right: { terms: [{ object: 'shell', count: 5 }, { op: '+' }, { blank: 'x' }] },
      objectWeights: { shell: 1 },
    });
    expect(objects.answer).toEqual({ kind: 'number', value: 3 });
    checkItem(con, objects);
  });

  it('balance judge answers true or false', () => {
    const t = tpl('balance', { representation: 'balance' });
    const item = make(t, { form: 'a+b=c+_', mode: 'judge', a: 3, b: 4, c: 5, truth: true });
    expect(item.widget).toMatchObject({
      mode: 'judge',
      right: { terms: [{ n: 5 }, { op: '+' }, { n: 2 }] },
    });
    expect(item.answer).toEqual({ kind: 'choice', id: 'true' });
    checkItem(t, item);
  });

  it('balance make-equal: the right pan holds c, balance.equal on the two pans', () => {
    const t = tpl('balance', { tier: 'concrete', representation: 'balance' });
    const item = make(t, { form: 'a+b=c+_', mode: 'make-equal', a: 3, b: 4, c: 5 });
    expect(item.widget).toMatchObject({
      mode: 'make-equal',
      right: { terms: [{ object: 'shell', count: 5 }] },
      showTilt: true,
    });
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'balance.equal',
      target: { left: 7, right: 5 },
    });
    expect(itemExampleCorrect(item, t)).toEqual({ kind: 'state', value: { left: 0, right: 2 } });
    const steps = itemSolution(item, t);
    expect(steps[steps.length - 1]?.action).toEqual({
      op: 'place',
      args: { side: 'right', term: { object: 'shell', count: 1 }, count: 2 },
    });
    checkItem(t, item);
    // CMP.08: one number against a sum, with numerals.
    const pic = tpl('balance', { representation: 'balance' });
    const one = make(pic, { form: 'a=c+_', mode: 'make-equal', a: 13, b: 0, c: 9 });
    expect(one.answer).toMatchObject({ target: { left: 13, right: 9 } });
    expect(
      stateChecker('balance.equal')?.check({ left: 13, right: 9 }, { left: 0, right: 4 }),
    ).toBe(true);
    checkItem(pic, one);
  });
});

describe('features', () => {
  it('are 0 for the easiest item and mark the harder layouts', () => {
    const t = tpl('number-pad', { tier: 'abstract' });
    const easy = make(t, { form: 'a+b=_', a: 2, b: 1 });
    expect(Object.values(itemFeatures(easy, t)).every((x) => x === 0)).toBe(true);
    const f = itemFeatures(make(t, { form: '_+b=c', op: '-', a: 15, b: 4 }), t);
    expect(f).toMatchObject({ 'unknown.start': 1, sub: 1, size: 2, opsBothSides: 0 });
    expect(itemFeatures(make(t, { form: 'a+b=c+_', a: 3, b: 4, c: 5 }), t)).toMatchObject({
      opsBothSides: 1,
    });
    expect(itemFeatures(make(t, { form: '_=a+b', a: 3, b: 4 }), t)).toMatchObject({
      answerLeft: 1,
    });
    expect(itemFeatures(make(t, { form: 'a+b=_', a: 3, b: 0 }), t)).toMatchObject({ zero: 1 });
  });

  it('balance items carry the 03 §5.5 balance features', () => {
    const t = tpl('balance', { representation: 'balance' });
    expect(itemFeatures(make(t, { form: '_+b=c', a: 5, b: 3 }), t)).toMatchObject({
      'blank.left': 1,
      'showTilt.off': 1,
    });
    const judged = make(t, { form: 'a+b=_', mode: 'judge', a: 3, b: 4, truth: false, off: 2 });
    expect(itemFeatures(judged, t)).toMatchObject({ 'judge.false': 1 });
  });
});

describe('validity and facts', () => {
  it('rejects a negative blank, a two-sided form shown with + 0, and formats a form cannot take', () => {
    const accepts = (format: ItemFormat, p: ParamValues, over: Partial<ItemTemplate> = {}) =>
      equalityEq.accepts?.({ a: 0, b: 0, c: 1, maxN: 20, ...p }, tpl(format, over)) ?? true;
    expect(accepts('number-pad', { form: 'a+b=c+_', a: 2, b: 1, c: 5 })).toBe(false);
    expect(accepts('number-pad', { form: 'a+b=c+_', a: 2, b: 1, c: 0 })).toBe(false);
    expect(accepts('number-pad', { form: 'a+b=c+_', a: 2, b: 4, c: 5 })).toBe(true);
    expect(accepts('number-bond', { form: 'a+b=c+_', a: 2, b: 4, c: 5 })).toBe(false);
    expect(accepts('balance', { form: 'between', a: 2 })).toBe(false);
    expect(accepts('balance', { form: 'a+b=_+c', mode: 'make-equal', a: 4, b: 4, c: 5 })).toBe(
      false,
    );
    expect(accepts('number-pad', { form: 'a+b=_', mode: 'judge', a: 2, b: 3 })).toBe(false);
    expect(accepts('number-pad', { form: 'a+b=_', a: 12, b: 9 })).toBe(false);
  });

  it('turn-around draws c as the other addend, within the template domains', () => {
    const t = tpl('number-pad', {
      tier: 'abstract',
      params: {
        form: { kind: 'choice', values: ['a+b=c+_', 'a+b=_+c'] },
        fact: { kind: 'const', value: 'turn-around' },
        a: { kind: 'int', min: 1, max: 9 },
        b: { kind: 'int', min: 1, max: 9 },
        c: { kind: 'int', min: 1, max: 9 },
      },
    });
    for (let seed = 1; seed <= 30; seed += 1) {
      const item = generateItem(t, seed);
      const { a, b, c, form } = item.params;
      expect(c).toBe(form === 'a+b=c+_' ? b : a);
      expect(item.answer).toEqual({ kind: 'number', value: form === 'a+b=c+_' ? a : b });
    }
  });

  it('zero draws one addend as 0', () => {
    const t = tpl('number-pad', {
      tier: 'abstract',
      params: {
        form: { kind: 'const', value: 'a+b=_' },
        fact: { kind: 'const', value: 'zero' },
        a: { kind: 'int', min: 0, max: 9 },
        b: { kind: 'int', min: 0, max: 9 },
      },
    });
    for (let seed = 1; seed <= 30; seed += 1) {
      const { a, b } = generateItem(t, seed).params;
      expect((a === 0) !== (b === 0)).toBe(true);
    }
  });
});
