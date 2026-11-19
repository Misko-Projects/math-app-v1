// K01 addition and subtraction rules (03 §7.2): forgotTheTen and wrongOperation (answer), and
// countStartNumber on counting-up jumps. Each includes non-discriminating items, where predict is
// null and match is false, and checks that checkResponse tags the predicted response.

import type {
  GeneratedItem,
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
import { countStartNumber } from './countStartNumber';
import { droppedTen, forgotTheTen } from './forgotTheTen';
import { wrongOperation, wrongOperationAnswer } from './wrongOperation';

function tpl(
  id: string,
  skillId: string,
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  return {
    id,
    skillId,
    format,
    tier: 'pictorial',
    generator: 'addsub.facts',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.x'] },
    ...over,
  };
}

const spec = (id: string, rule: string, skills: string[]): MisconceptionSpec => ({
  id,
  name: id,
  area: 'addsub',
  detect: { kind: 'answer', rule },
  appliesTo: { generators: ['addsub.facts'] },
  skills,
  remediation: [skills[0] as string],
  feedback: `fb.mc.${id.slice(3)}`,
  priority: 50,
  parentTip: 'tip',
  examples: [],
});

const SPECS = [
  spec('MC.forgot-the-ten', 'forgotTheTen', ['ADD.08', 'ADD.26']),
  spec('MC.wrong-operation', 'wrongOperation', ['ADD.06', 'ADD.09']),
  { ...spec('MC.count-start-number', 'countStartNumber', ['ADD.04', 'ADD.19']), priority: 60 },
];

const T = {
  tenPad: tpl('T.tenPad', 'ADD.08', 'number-pad', { tier: 'abstract' }),
  tenPick: tpl('T.tenPick', 'ADD.08', 'numeral-pick', {
    tier: 'abstract',
    distractors: [{ rule: 'MC.forgot-the-ten' }],
  }),
  tenFrame: tpl('T.tenFrame', 'ADD.08', 'tenframe-fill', {
    tier: 'concrete',
    representation: 'double-ten-frame',
  }),
  tenRack: tpl('T.tenRack', 'ADD.08', 'rekenrek', { tier: 'concrete' }),
  tenOpen: tpl('T.tenOpen', 'ADD.08', 'number-line-jump', { representation: 'open-number-line' }),
  teenPad: tpl('T.teenPad', 'ADD.26', 'number-pad', { tier: 'abstract' }),
  opPad: tpl('T.opPad', 'ADD.06', 'number-pad', { tier: 'abstract' }),
  opPick: tpl('T.opPick', 'ADD.06', 'numeral-pick', {
    tier: 'abstract',
    distractors: [{ rule: 'MC.wrong-operation' }],
  }),
  opBond: tpl('T.opBond', 'ADD.09', 'number-bond'),
  upStones: tpl('T.upStones', 'ADD.04', 'number-line-jump', {
    tier: 'concrete',
    representation: 'number-path',
  }),
  upOpen: tpl('T.upOpen', 'ADD.19', 'number-line-jump', { representation: 'open-number-line' }),
};

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);
const num = (value: number): ResponseValue => ({ kind: 'number', value });
const MAKE_TEN = { op: '+', family: 'make-ten', unknown: 'result' };

beforeEach(() => {
  resetContent();
  initContent({ templates: Object.values(T), narration: {}, misconceptions: SPECS });
});

describe('registry', () => {
  it.each(['forgotTheTen', 'wrongOperation'])('%s is an answer rule', (id) => {
    expect(misconceptionRule(id)?.kind).toBe('answer');
    expect(misconceptionRule(id)?.id).toBe(id);
  });
});

describe('forgotTheTen', () => {
  it.each<[number, number | null]>([
    [13, 3],
    [11, 1],
    [20, 10],
    [10, null],
    [7, null],
    [0, null],
  ])('droppedTen(%i) = %s', (v, want) => {
    expect(droppedTen(v)).toBe(want);
  });

  it('8 + 5 → 3 on the number pad is predicted, matched and tagged', () => {
    const item = make(T.tenPad, { a: 8, b: 5, ...MAKE_TEN });
    expect(forgotTheTen.predict?.(item)).toEqual(num(3));
    expect(forgotTheTen.match(item, num(3))).toBe(true);
    expect(forgotTheTen.match(item, num(12))).toBe(false);
    expect(forgotTheTen.match(item, num(13))).toBe(false);
    expect(checkResponse(item, num(3)).misconceptionIds).toEqual(['MC.forgot-the-ten']);
  });

  it('10 + 7 → 7 is predicted; 17 − 10 cannot discriminate (the answer is below 11)', () => {
    const plus = make(T.teenPad, { a: 10, b: 7, op: '+', family: 'ten-plus' });
    expect(forgotTheTen.predict?.(plus)).toEqual(num(7));
    const minus = make(T.teenPad, { a: 17, b: 10, op: '-', family: 'teen-minus-ten' });
    expect(forgotTheTen.predict?.(minus)).toBeNull();
    expect(forgotTheTen.match(minus, num(7))).toBe(false);
    expect(forgotTheTen.match(minus, num(-3))).toBe(false);
  });

  it('a pick shows the dropped-ten distractor and picking it is tagged', () => {
    const item = make(T.tenPick, { a: 9, b: 4, ...MAKE_TEN });
    expect(item.widget.format === 'numeral-pick' && item.widget.options.map((o) => o.id)).toContain(
      'opt-3',
    );
    const r: ResponseValue = { kind: 'choice', id: 'opt-3' };
    expect(forgotTheTen.predict?.(item)).toEqual(r);
    expect(checkResponse(item, r).misconceptionIds).toEqual(['MC.forgot-the-ten']);
  });

  it.each([
    ['the frames', 'tenFrame'],
    ['the rack', 'tenRack'],
    ['the open line', 'tenOpen'],
  ] as const)('on %s: built right, then the ones typed as the total', (_label, key) => {
    const item = make(T[key], { a: 8, b: 5, ...MAKE_TEN });
    const predicted = forgotTheTen.predict?.(item) as ResponseValue;
    expect(predicted?.kind).toBe('state');
    expect(predicted.kind === 'state' && predicted.value.value).toBe(3);
    const res = checkResponse(item, predicted);
    expect(res.correct).toBe(false);
    expect(res.misconceptionIds).toEqual(['MC.forgot-the-ten']);
  });
});

describe('wrongOperation', () => {
  it.each<[string, ParamValues, { v: number; r: number } | null]>([
    ['9 − 4 adds', { a: 9, b: 4, op: '-' }, { v: 5, r: 13 }],
    ['9 + 4 takes away', { a: 9, b: 4, op: '+' }, { v: 13, r: 5 }],
    ['4 + 9 takes away (absolute difference)', { a: 4, b: 9, op: '+' }, { v: 13, r: 5 }],
    [
      '5 + ? = 13 adds the shown numbers',
      { a: 5, b: 8, op: '+', unknown: 'change' },
      { v: 8, r: 18 },
    ],
    ['? − 3 = 5 takes away', { a: 8, b: 3, op: '-', unknown: 'start' }, { v: 8, r: 2 }],
    ['a double (4 + 4) has no other-operation answer', { a: 4, b: 4, op: '+' }, null],
    ['adding 0 cannot discriminate', { a: 6, b: 0, op: '+' }, null],
    ['taking 0 cannot discriminate', { a: 6, b: 0, op: '-' }, null],
  ])('%s', (_label, params, want) => {
    const item = make(T.opPad, { unknown: 'result', ...params });
    expect(wrongOperationAnswer(item)).toEqual(want);
    if (want === null) {
      expect(wrongOperation.predict?.(item)).toBeNull();
      expect(
        wrongOperation.match(item, num(item.answer.kind === 'number' ? item.answer.value : 0)),
      ).toBe(false);
    } else {
      expect(wrongOperation.predict?.(item)).toEqual(num(want.r));
      expect(wrongOperation.match(item, num(want.r))).toBe(true);
      expect(wrongOperation.match(item, num(want.r + 1))).toBe(false);
      expect(checkResponse(item, num(want.r)).misconceptionIds).toEqual(['MC.wrong-operation']);
    }
  });

  it('a pick offers the other operation as a distractor', () => {
    const item = make(T.opPick, { a: 7, b: 2, op: '-', unknown: 'result' });
    const r: ResponseValue = { kind: 'choice', id: 'opt-9' };
    expect(wrongOperation.predict?.(item)).toEqual(r);
    expect(checkResponse(item, r).misconceptionIds).toEqual(['MC.wrong-operation']);
  });

  it('a think-addition number bond (13 − 5) predicts 18 in the missing part', () => {
    const item = make(T.opBond, { a: 13, b: 5, op: '-', unknown: 'result', family: 'think-add' });
    expect(wrongOperation.predict?.(item)).toEqual(num(18));
    expect(checkResponse(item, num(18)).misconceptionIds).toEqual(['MC.wrong-operation']);
  });
});

describe('countStartNumber on counting up to subtract (goal difference)', () => {
  it.each([
    ['stones, hops of one', 'upStones', { a: 9, b: 6 }],
    ['the open line, free jumps', 'upOpen', { a: 13, b: 8 }],
  ] as const)('%s: the hop count includes the start', (_label, key, ab) => {
    const item = make(T[key], { ...ab, op: '-', unknown: 'result', family: 'count-up' });
    expect(item.widget.format === 'number-line-jump' && item.widget.goal).toBe('difference');
    const v = ab.a - ab.b;
    const predicted = countStartNumber.predict?.(item) as ResponseValue;
    expect(predicted).toEqual({
      kind: 'state',
      value: { jumps: new Array<number>(v).fill(1), value: v + 1 },
    });
    expect(countStartNumber.match(item, predicted)).toBe(true);
    expect(countStartNumber.match(item, { kind: 'state', value: { jumps: [v], value: v } })).toBe(
      false,
    );
    const res = checkResponse(item, predicted);
    expect(res.correct).toBe(false);
    expect(res.misconceptionIds).toEqual(['MC.count-start-number']);
  });
});
