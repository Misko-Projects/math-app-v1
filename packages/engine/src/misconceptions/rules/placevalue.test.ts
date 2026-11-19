// K01 place-value rules (03 §7.2): placeSwap, faceValue and writeAsSpoken (answer), and
// forgotTheTen on two-digit addition (mda.addsub). Each includes non-discriminating items, where
// predict is null and match is false, and checks that checkResponse tags the predicted response.

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
import { misconceptionRule } from '..';
import { faceValue } from './faceValue';
import { forgotTheTen } from './forgotTheTen';
import { placeSwap, placeSwapped } from './placeSwap';
import { spokenConcat, writeAsSpoken } from './writeAsSpoken';

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
  spec('MC.place-swap', 'placeSwap', ['PV.01', 'PV.13']),
  spec('MC.face-value', 'faceValue', ['PV.01']),
  spec('MC.write-as-spoken', 'writeAsSpoken', ['PV.13']),
  spec('MC.forgot-the-ten', 'forgotTheTen', ['MDA.08'], ['mda.addsub']),
];

const T = {
  build: tpl('T.build', 'PV.01', 'base-ten-build', {
    tier: 'concrete',
    representation: 'bundles',
    params: { mode: { kind: 'const', value: 'build' } },
  }),
  read: tpl('T.read', 'PV.01', 'base-ten-build', {
    representation: 'base-ten',
    params: { mode: { kind: 'const', value: 'read' } },
  }),
  cards: tpl('T.cards', 'PV.01', 'expanded-form', {
    params: { mode: { kind: 'const', value: 'build' } },
  }),
  write: tpl('T.write', 'PV.01', 'number-pad', {
    tier: 'abstract',
    params: { mode: { kind: 'const', value: 'write' } },
  }),
  digit: tpl('T.digit', 'PV.01', 'number-pad', {
    tier: 'abstract',
    params: { mode: { kind: 'const', value: 'digit-value' } },
  }),
  standard: tpl('T.standard', 'PV.13', 'expanded-form', {
    params: { mode: { kind: 'const', value: 'expanded' } },
  }),
  words: tpl('T.words', 'PV.13', 'expanded-form', {
    tier: 'abstract',
    representation: 'words',
    params: { mode: { kind: 'const', value: 'words' } },
  }),
  name: tpl('T.name', 'PV.13', 'numeral-pick', {
    tier: 'abstract',
    params: { mode: { kind: 'const', value: 'words' } },
    distractors: [{ rule: 'MC.place-swap' }],
  }),
  trade: tpl(
    'T.trade',
    'MDA.08',
    'base-ten-trade',
    { tier: 'concrete', representation: 'base-ten' },
    'mda.addsub',
  ),
  open: tpl(
    'T.open',
    'MDA.08',
    'number-line-jump',
    {
      representation: 'open-number-line',
      params: { strategy: { kind: 'const', value: 'next-ten' } },
    },
    'mda.addsub',
  ),
};

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);
const num = (value: number): ResponseValue => ({ kind: 'number', value });
const mat = (tens: number, ones: number): ResponseValue => ({
  kind: 'state',
  value: { thousands: 0, hundreds: 0, tens, ones },
});

beforeEach(() => {
  resetContent();
  initContent({ templates: Object.values(T), narration: {}, misconceptions: SPECS });
});

describe('registry', () => {
  it.each(['placeSwap', 'faceValue', 'writeAsSpoken'])('%s is an answer rule', (id) => {
    expect(misconceptionRule(id)?.kind).toBe('answer');
    expect(misconceptionRule(id)?.id).toBe(id);
  });
  it('writeAsSpoken has no predict (its number is never an option, 03 §7.1)', () => {
    expect(writeAsSpoken.predict).toBeUndefined();
  });
});

describe('placeSwap', () => {
  it.each<[number, number | null]>([
    [34, 43],
    [91, 19],
    [20, null], // the swap would start with 0
    [44, null], // the same both ways
    [14, null], // a teen: MC.teen-reversal
    [345, null],
  ])('placeSwapped(%i) = %s', (v, want) => {
    expect(placeSwapped(v)).toBe(want);
  });

  it('3 tens 4 ones typed as 43 is predicted, matched and tagged', () => {
    const item = make(T.write, { n: 34 });
    expect(placeSwap.predict?.(item)).toEqual(num(43));
    expect(placeSwap.match(item, num(43))).toBe(true);
    expect(placeSwap.match(item, num(44))).toBe(false);
    expect(checkResponse(item, num(43)).misconceptionIds).toContain('MC.place-swap');
  });

  it('a build of 34 as 4 tens 3 ones is the swap', () => {
    const item = make(T.build, { n: 34 });
    const predicted = placeSwap.predict?.(item);
    expect(predicted).toEqual({
      kind: 'state',
      value: { thousands: 0, hundreds: 0, tens: 4, ones: 3 },
    });
    const res = checkResponse(item, mat(4, 3));
    expect(res.correct).toBe(false);
    expect(res.misconceptionIds).toContain('MC.place-swap');
    // 34 built as 2 tens 14 ones is right, not a swap.
    expect(checkResponse(item, mat(2, 14)).correct).toBe(true);
  });

  it('place-value cards of the swapped number (40 and 3 for 34)', () => {
    const item = make(T.cards, { n: 34 });
    const predicted = placeSwap.predict?.(item);
    expect(predicted).toEqual({ kind: 'numbers', values: [40, 3] });
    expect(checkResponse(item, predicted as ResponseValue).misconceptionIds).toContain(
      'MC.place-swap',
    );
  });

  it('a pick of the name offers the swap as a distractor', () => {
    const item = make(T.name, { n: 47 });
    expect(item.widget.format === 'numeral-pick' && item.widget.options.map((o) => o.id)).toContain(
      'opt-74',
    );
    expect(placeSwap.predict?.(item)).toEqual({ kind: 'choice', id: 'opt-74' });
  });

  it('cannot discriminate 30 or 55', () => {
    for (const n of [30, 55]) {
      const item = make(T.write, { n });
      expect(placeSwap.predict?.(item)).toBeNull();
      expect(placeSwap.match(item, num(Number(String(n).split('').reverse().join(''))))).toBe(
        false,
      );
    }
  });
});

describe('faceValue', () => {
  it('3 tens 4 ones typed as 7 (each ten counted as one)', () => {
    const item = make(T.write, { n: 34 });
    expect(faceValue.predict?.(item)).toEqual(num(7));
    expect(faceValue.match(item, num(7))).toBe(true);
    expect(faceValue.match(item, num(8))).toBe(false);
    expect(checkResponse(item, num(7)).misconceptionIds).toContain('MC.face-value');
  });

  it('reading a picture of 3 rods and 4 units as 7', () => {
    const item = make(T.read, { n: 34 });
    expect(faceValue.predict?.(item)).toEqual(num(7));
    expect(checkResponse(item, num(7)).misconceptionIds).toContain('MC.face-value');
  });

  it('34 built with 7 ones', () => {
    const item = make(T.build, { n: 34 });
    expect(faceValue.predict?.(item)).toEqual(mat(0, 7));
    const res = checkResponse(item, mat(0, 7));
    expect(res.correct).toBe(false);
    expect(res.misconceptionIds).toContain('MC.face-value');
    // 7 ones and a ten is not every piece a one.
    expect(faceValue.match(item, mat(1, 7))).toBe(false);
  });

  it('the bare digits as cards (3 and 4 for 34), when the cards hold them', () => {
    const item = make(T.cards, { n: 34 });
    expect(faceValue.predict?.(item)).toEqual({ kind: 'numbers', values: [3, 4] });
    expect(faceValue.match(item, { kind: 'numbers', values: [4, 3] })).toBe(true);
    expect(faceValue.match(item, { kind: 'numbers', values: [30, 4] })).toBe(false);
    // 33 offers one 3 card only, so the bare digits cannot be picked.
    expect(faceValue.predict?.(make(T.cards, { n: 33 }))).toBeNull();
  });

  it('digit-value: the 4 in 345 is worth 4; the ones digit cannot discriminate', () => {
    const item = make(T.digit, { n: 345, place: 1 });
    expect(item.answer).toEqual(num(40));
    expect(faceValue.predict?.(item)).toEqual(num(4));
    expect(checkResponse(item, num(4)).misconceptionIds).toContain('MC.face-value');
    const ones = make(T.digit, { n: 345, place: 0 });
    expect(faceValue.predict?.(ones)).toBeNull();
    expect(faceValue.match(ones, num(5))).toBe(false);
  });

  it('a one-digit number cannot discriminate', () => {
    const item = make(T.write, { n: 7 });
    expect(faceValue.predict?.(item)).toBeNull();
    expect(faceValue.match(item, num(7))).toBe(false);
  });
});

describe('writeAsSpoken', () => {
  it.each<[number, number | null]>([
    [47, 407],
    [105, 1005],
    [345, 300405],
    [40, null],
    [14, null],
    [7, null],
  ])('spokenConcat(%i) = %s', (v, want) => {
    expect(spokenConcat(v)).toBe(want);
  });

  it('40 + 7 written as 407 is tagged; 47 and 74 are not this slip', () => {
    const item = make(T.standard, { n: 47 });
    expect(writeAsSpoken.match(item, num(407))).toBe(true);
    expect(writeAsSpoken.match(item, num(74))).toBe(false);
    expect(checkResponse(item, num(407)).misconceptionIds).toEqual(['MC.write-as-spoken']);
  });

  it('hearing "forty-seven" and typing 407', () => {
    const item = make(T.words, { n: 47 });
    expect(writeAsSpoken.match(item, num(407))).toBe(true);
  });

  it('a teen or a decade number cannot discriminate', () => {
    expect(writeAsSpoken.match(make(T.standard, { n: 14 }), num(104))).toBe(false);
    expect(writeAsSpoken.match(make(T.standard, { n: 40 }), num(40))).toBe(false);
  });
});

describe('forgotTheTen on two-digit addition (mda.addsub)', () => {
  it('37 + 5 computed on the mat, then 32 typed', () => {
    const item = make(T.trade, { a: 37, b: 5, op: '+' });
    const predicted = forgotTheTen.predict?.(item);
    expect(predicted).toEqual({
      kind: 'state',
      value: { hundreds: 0, tens: 4, ones: 2, value: 32 },
    });
    const res = checkResponse(item, predicted as ResponseValue);
    expect(res.correct).toBe(false);
    expect(res.misconceptionIds).toEqual(['MC.forgot-the-ten']);
  });

  it('on the open line: the jumps land right, then 32 typed', () => {
    const item = make(T.open, { a: 37, b: 5, op: '+' });
    const predicted = forgotTheTen.predict?.(item) as ResponseValue;
    expect(predicted.kind === 'state' && predicted.value.value).toBe(32);
    expect(checkResponse(item, predicted).misconceptionIds).toEqual(['MC.forgot-the-ten']);
  });
});
