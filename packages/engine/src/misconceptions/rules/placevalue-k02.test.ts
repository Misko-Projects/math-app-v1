// K02 place value to 1000 (03 §7.2): zeroPlaceholder and compareFirstDigit, placeSwap on a
// three-digit number, faceValue on a build of what a digit is worth, and the items symbolReversed
// is about. Each includes non-discriminating items, where predict is null and match is false, and
// checks that checkResponse tags the predicted response.

import type {
  GeneratedItem,
  GeneratorId,
  ItemFormat,
  ItemTemplate,
  MisconceptionSpec,
  ParamValues,
  Representation,
  ResponseValue,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { checkResponse } from '../../items/check';
import { generateItemFromParams } from '../../items/generate';
import { compareFirstDigit, firstDigitOrder } from './compareFirstDigit';
import { faceValue } from './faceValue';
import { placeSwap } from './placeSwap';
import { symbolReversed } from './symbolReversed';
import { withoutInternalZeros, zeroPlaceholder } from './zeroPlaceholder';

function tpl(
  id: string,
  skillId: string,
  format: ItemFormat,
  over: Partial<ItemTemplate> & { representation?: Representation } = {},
  generator: GeneratorId = 'pv.number',
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
  skills: string[],
  generators: GeneratorId[] = ['pv.number'],
  priority = 50,
): MisconceptionSpec => ({
  id,
  name: id,
  area: 'place-value',
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
  spec('MC.place-swap', 'placeSwap', ['PV.15'], ['pv.number'], 45),
  spec('MC.face-value', 'faceValue', ['PV.15', 'PV.24']),
  spec('MC.zero-placeholder', 'zeroPlaceholder', ['PV.14', 'PV.15']),
  spec('MC.compare-first-digit', 'compareFirstDigit', ['PV.06'], ['compare.numbers'], 55),
  spec('MC.symbol-reversed', 'symbolReversed', ['PV.06'], ['compare.numbers']),
];

const mode = (value: string) => ({ mode: { kind: 'const' as const, value } });

const T = {
  build: tpl('T.build', 'PV.15', 'base-ten-build', {
    tier: 'concrete',
    representation: 'base-ten',
    params: mode('build'),
  }),
  standard: tpl('T.standard', 'PV.14', 'number-pad', {
    tier: 'abstract',
    params: mode('expanded'),
  }),
  pick: tpl('T.pick', 'PV.14', 'numeral-pick', {
    tier: 'abstract',
    params: mode('write'),
    distractors: [{ rule: 'MC.zero-placeholder' }],
  }),
  worth: tpl('T.worth', 'PV.24', 'base-ten-build', {
    tier: 'concrete',
    representation: 'base-ten',
    params: mode('digit-value'),
  }),
  compare: tpl('T.compare', 'PV.06', 'compare', { tier: 'abstract' }, 'compare.numbers'),
  order: tpl('T.order', 'PV.06', 'order', { tier: 'abstract' }, 'compare.numbers'),
  place: tpl(
    'T.place',
    'PV.06',
    'number-line-place',
    { representation: 'number-line' },
    'compare.numbers',
  ),
};

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);
const num = (value: number): ResponseValue => ({ kind: 'number', value });
const mat = (hundreds: number, tens: number, ones: number): ResponseValue => ({
  kind: 'state',
  value: { thousands: 0, hundreds, tens, ones },
});
const pick = (id: string): ResponseValue => ({ kind: 'choice', id });
const compared = (a: number, b: number, ask: string, extra: ParamValues = {}): ParamValues => ({
  a,
  b,
  extra: 0,
  min: 0,
  max: 1000,
  ask,
  ...extra,
});

beforeEach(() => {
  resetContent();
  initContent({ templates: Object.values(T), narration: {}, misconceptions: SPECS });
});

describe('zeroPlaceholder', () => {
  it.each<[number, number | null]>([
    [305, 35],
    [1005, 15],
    [3040, 340],
    [340, null], // the zero is at the end, not inside
    [300, null],
    [345, null],
    [35, null],
  ])('withoutInternalZeros(%i) = %s', (v, want) => {
    expect(withoutInternalZeros(v)).toBe(want);
  });

  it('300 + 5 typed as 35 is predicted, matched and tagged', () => {
    const item = make(T.standard, { n: 305 });
    expect(zeroPlaceholder.predict?.(item)).toEqual(num(35));
    expect(zeroPlaceholder.match(item, num(35))).toBe(true);
    expect(zeroPlaceholder.match(item, num(350))).toBe(false);
    expect(checkResponse(item, num(35)).misconceptionIds).toContain('MC.zero-placeholder');
  });

  it('305 built with 3 tens and 5 ones', () => {
    const item = make(T.build, { n: 305 });
    expect(zeroPlaceholder.predict?.(item)).toEqual(mat(0, 3, 5));
    expect(checkResponse(item, mat(0, 3, 5)).misconceptionIds).toContain('MC.zero-placeholder');
    expect(zeroPlaceholder.match(item, mat(3, 5, 0))).toBe(false);
  });

  it('a pick offers the number without its zero as a distractor', () => {
    const item = make(T.pick, { n: 305 });
    expect(item.widget.format === 'numeral-pick' && item.widget.options.map((o) => o.id)).toContain(
      'opt-35',
    );
    expect(zeroPlaceholder.predict?.(item)).toEqual(pick('opt-35'));
  });

  it('a number with no zero inside cannot discriminate', () => {
    for (const n of [340, 345, 300]) {
      const item = make(T.standard, { n });
      expect(zeroPlaceholder.predict?.(item)).toBeNull();
      expect(zeroPlaceholder.match(item, num(34))).toBe(false);
    }
  });
});

describe('placeSwap on a three-digit number (PV.15)', () => {
  it('345 built as 3 hundreds 5 tens 4 ones is the swap', () => {
    const item = make(T.build, { n: 345 });
    expect(placeSwap.predict?.(item)).toEqual(mat(3, 5, 4));
    expect(checkResponse(item, mat(3, 5, 4)).misconceptionIds).toContain('MC.place-swap');
    // The whole number reversed is not the tens and ones swapped.
    expect(placeSwap.match(item, mat(5, 4, 3))).toBe(false);
  });

  it('340 and 355 cannot discriminate', () => {
    for (const n of [340, 355]) expect(placeSwap.predict?.(make(T.build, { n }))).toBeNull();
  });
});

describe('faceValue on a mat that lacks one digit (PV.24)', () => {
  it('the 4 in 345 put in as 4 ones, beside the 3 hundreds and 5 ones already there', () => {
    const item = make(T.worth, { n: 345, place: 1 });
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'baseten.value',
      target: { value: 345 },
    });
    expect(faceValue.predict?.(item)).toEqual(mat(3, 0, 9));
    const res = checkResponse(item, mat(3, 0, 9));
    expect(res.correct).toBe(false);
    expect(res.misconceptionIds).toContain('MC.face-value');
    expect(checkResponse(item, mat(3, 4, 5)).correct).toBe(true);
    // Four ones alone (the other pieces taken off) is another answer.
    expect(faceValue.match(item, mat(0, 0, 4))).toBe(false);
    // The 3 put in as 3 tens is another slip.
    expect(faceValue.match(make(T.worth, { n: 345, place: 2 }), mat(0, 7, 5))).toBe(false);
  });
});

describe('compareFirstDigit', () => {
  it('orders numerals digit by digit', () => {
    expect(firstDigitOrder([89, 102, 95], false)).toEqual([102, 89, 95]);
    expect(firstDigitOrder([89, 102, 95], true)).toEqual([95, 89, 102]);
  });

  it('89 taken as greater than 102, and 102 as less than 89', () => {
    const more = make(T.compare, compared(89, 102, 'more'));
    expect(more.answer).toEqual(pick('right'));
    expect(compareFirstDigit.predict?.(more)).toEqual(pick('left'));
    expect(checkResponse(more, pick('left')).misconceptionIds).toContain('MC.compare-first-digit');
    expect(compareFirstDigit.match(more, pick('same'))).toBe(false);
    const fewer = make(T.compare, compared(89, 102, 'fewer'));
    expect(compareFirstDigit.predict?.(fewer)).toEqual(pick('right'));
  });

  it('89 > 102 is this slip before it is a reversed sign (the higher priority)', () => {
    const item = make(T.compare, compared(89, 102, 'symbol'));
    expect(compareFirstDigit.predict?.(item)).toEqual(pick('>'));
    expect(checkResponse(item, pick('>')).misconceptionIds).toEqual(['MC.compare-first-digit']);
  });

  it('smallest first: 102, 89, 95 is the order of the first digits', () => {
    const item = make(T.order, compared(89, 102, 'fewer', { extra: 1, x1: 95 }));
    const slip: ResponseValue = { kind: 'numbers', values: [102, 89, 95] };
    expect(compareFirstDigit.predict?.(item)).toEqual(slip);
    expect(checkResponse(item, slip).misconceptionIds).toContain('MC.compare-first-digit');
    expect(compareFirstDigit.match(item, { kind: 'numbers', values: [95, 89, 102] })).toBe(false);
  });

  it('numbers of one length, or an order the first digits get right, cannot discriminate', () => {
    expect(compareFirstDigit.predict?.(make(T.compare, compared(189, 202, 'more')))).toBeNull();
    expect(compareFirstDigit.match(make(T.compare, compared(189, 202, 'more')), pick('left'))).toBe(
      false,
    );
    // 15, 20, 300 is the same order digit by digit, so nothing shows.
    const same = make(T.order, compared(15, 300, 'fewer', { extra: 1, x1: 20 }));
    expect(compareFirstDigit.predict?.(same)).toBeNull();
  });

  it('a shorter number whose digits read smaller does not show the slip (PR #121 review)', () => {
    // 12 against 130: read digit by digit, 130 still comes out greater ("12" before "130"), so
    // "12 is greater" is some other mistake. 89 against 102 is the slip.
    const agree = make(T.compare, compared(12, 130, 'more'));
    expect(compareFirstDigit.predict?.(agree)).toBeNull();
    expect(compareFirstDigit.match(agree, pick('left'))).toBe(false);
    expect(checkResponse(agree, pick('left')).misconceptionIds).not.toContain(
      'MC.compare-first-digit',
    );
    // Equal first digits, the next digit decides: 12 against 102 reads greater digit by digit.
    expect(compareFirstDigit.predict?.(make(T.compare, compared(12, 102, 'more')))).toEqual(
      pick('left'),
    );
    expect(compareFirstDigit.predict?.(make(T.compare, compared(102, 89, 'more')))).toEqual(
      pick('right'),
    );
  });

  it('is about comparing and ordering, not about a number put on a line', () => {
    expect(compareFirstDigit.applies?.(make(T.compare, compared(89, 102, 'more')))).toBe(true);
    expect(
      compareFirstDigit.applies?.(make(T.order, compared(89, 102, 'fewer', { extra: 1 }))),
    ).toBe(true);
    expect(
      compareFirstDigit.applies?.(make(T.place, compared(89, 102, 'fewer', { extra: 1, x1: 400 }))),
    ).toBe(false);
  });
});

describe('symbolReversed is about the items that ask for the sign', () => {
  it('applies to a symbol item, not to which is greater', () => {
    expect(symbolReversed.applies?.(make(T.compare, compared(120, 450, 'symbol')))).toBe(true);
    expect(symbolReversed.applies?.(make(T.compare, compared(120, 450, 'more')))).toBe(false);
  });
});
