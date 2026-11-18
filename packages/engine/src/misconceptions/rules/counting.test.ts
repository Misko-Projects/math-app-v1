// K01 counting rules (03 §7.2): recountFromOne (process), decadeTransition and teenReversal
// (answer). Each includes non-discriminating items, where predict is null and match is false.

import type {
  GeneratedItem,
  InteractionEvent,
  ItemFormat,
  ItemTemplate,
  MisconceptionSpec,
  ParamSpec,
  ParamValues,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { checkResponse, detectProcessMisconceptions } from '../../items/check';
import { generateItemFromParams } from '../../items/generate';
import { misconceptionRule } from '..';
import { decadeSlip, decadeTransition } from './decadeTransition';
import { recountFromOne } from './recountFromOne';
import { teenReversal, teenSwap } from './teenReversal';

const int = (min: number, max: number): ParamSpec => ({ kind: 'int', min, max });
const taps = (...ids: number[]): InteractionEvent[] =>
  ids.map((i, k) => ({ t: 'tap' as const, target: `obj-${i}`, ms: k * 400 }));

function tpl(
  id: string,
  skillId: string,
  generator: string,
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  return {
    id,
    skillId,
    format,
    tier: 'pictorial',
    generator,
    params: { start: int(0, 200), n: int(0, 20) },
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.x'] },
    ...over,
  };
}

const spec = (
  id: string,
  rule: string,
  kind: MisconceptionSpec['detect']['kind'],
  generators: string[],
  skills: string[],
): MisconceptionSpec => ({
  id,
  name: id,
  area: 'counting',
  detect: { kind, rule },
  appliesTo: { generators },
  skills,
  remediation: [skills[0] as string],
  feedback: `fb.mc.${id.slice(3)}`,
  priority: 50,
  parentTip: 'tip',
  examples: [],
});

const SPECS = [
  spec('MC.recount-from-one', 'recountFromOne', 'process', ['count.set'], ['CNT.03']),
  spec('MC.decade-transition', 'decadeTransition', 'answer', ['count.sequence'], ['CNT.09']),
  spec('MC.teen-reversal', 'teenReversal', 'answer', ['count.set', 'count.sequence'], ['CNT.10']),
];

const T = {
  tap: tpl('T.tap', 'CNT.03', 'count.set', 'tap-count', { tier: 'concrete' }),
  tapOrdinal: tpl('T.ord', 'CNT.03', 'count.ordinal', 'tap-count', { params: {} }),
  seqPad: tpl('T.seqPad', 'CNT.09', 'count.sequence', 'number-pad', { tier: 'abstract' }),
  seqPick: tpl('T.seqPick', 'CNT.09', 'count.sequence', 'numeral-pick', {
    distractors: [{ rule: 'MC.decade-transition' }],
  }),
  seqChart: tpl('T.seqChart', 'CNT.09', 'count.sequence', 'hundred-chart'),
  seqJump: tpl('T.seqJump', 'CNT.09', 'count.sequence', 'number-line-jump'),
  seqOrder: tpl('T.seqOrder', 'CNT.09', 'count.sequence', 'order'),
  teenPad: tpl('T.teenPad', 'CNT.10', 'count.set', 'number-pad', { tier: 'abstract' }),
  teenPick: tpl('T.teenPick', 'CNT.10', 'count.set', 'numeral-pick', {
    distractors: [{ rule: 'MC.teen-reversal' }],
  }),
  teenSeq: tpl('T.teenSeq', 'CNT.10', 'count.sequence', 'number-pad', { tier: 'abstract' }),
};

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);

beforeEach(() => {
  resetContent();
  initContent({ templates: Object.values(T), narration: {}, misconceptions: SPECS });
});

describe('registry', () => {
  it.each([
    ['recountFromOne', 'process'],
    ['decadeTransition', 'answer'],
    ['teenReversal', 'answer'],
  ])('%s has kind %s', (id, kind) => {
    expect(misconceptionRule(id)?.kind).toBe(kind);
    expect(misconceptionRule(id)?.id).toBe(id);
  });
});

describe('recountFromOne', () => {
  const item = () => make(T.tap, { n: 4, mode: 'how-many' });
  const r = { kind: 'number', value: 4 } as const;

  it.each<[string, number[], boolean]>([
    ['a full pass, then a second pass', [0, 1, 2, 3, 0, 1, 2, 3], true],
    ['a full pass, then two more taps', [0, 1, 2, 3, 0, 1], true],
    ['a full pass, out of order, then a recount', [2, 0, 3, 1, 0, 1, 2], true],
    ['one pass only', [0, 1, 2, 3], false],
    ['one stray tap after the pass', [0, 1, 2, 3, 3], false],
    ['double taps before the pass is complete', [0, 0, 1, 1, 2, 3], false],
    ['an untapped object', [0, 1, 2, 0, 1, 2], false],
  ])('%s → %s', (_label, ids, want) => {
    expect(recountFromOne.match(item(), r, { latencyMs: 1, trace: taps(...ids) })).toBe(want);
  });

  it('can tag a correct count; it needs a trace', () => {
    const it4 = item();
    expect(checkResponse(it4, r).correct).toBe(true);
    expect(
      detectProcessMisconceptions(it4, r, { latencyMs: 1, trace: taps(0, 1, 2, 3, 0, 1, 2, 3) }),
    ).toEqual(['MC.recount-from-one']);
    expect(recountFromOne.match(it4, r, { latencyMs: 1 })).toBe(false);
    expect(recountFromOne.match(it4, r)).toBe(false);
  });

  it('does not apply to a single object, an empty set or an ordinal item', () => {
    const one = make(T.tap, { n: 1, mode: 'how-many' });
    expect(recountFromOne.match(one, r, { latencyMs: 1, trace: taps(0, 0, 0) })).toBe(false);
    const none = make(T.tap, { n: 0, mode: 'how-many' });
    expect(recountFromOne.match(none, r, { latencyMs: 1, trace: [] })).toBe(false);
    const ord = make(T.tapOrdinal, { k: 2, n: 4, from: 'left' });
    expect(
      recountFromOne.match(
        ord,
        { kind: 'choice', id: 'obj-1' },
        { latencyMs: 1, trace: taps(0, 1, 2, 3, 0, 1) },
      ),
    ).toBe(false);
  });

  it('has no predict (the response is usually the right count)', () => {
    expect(recountFromOne.predict).toBeUndefined();
  });
});

describe('decadeTransition', () => {
  it.each<[number, boolean, number | null]>([
    [40, false, 30],
    [20, false, 10],
    [100, false, 90],
    [10, false, null],
    [41, false, null],
    [39, true, 49],
    [19, true, 29],
    [9, true, null],
    [40, true, null],
  ])('decadeSlip(%i, back %s) → %s', (v, back, want) => {
    expect(decadeSlip(v, back)).toBe(want);
  });

  it('number pad, 39 → _: predicts 30; also matches 210-style "thirty" written as 310', () => {
    const item = make(T.seqPad, { start: 39 });
    expect(decadeTransition.predict?.(item)).toEqual({ kind: 'number', value: 30 });
    expect(decadeTransition.match(item, { kind: 'number', value: 30 })).toBe(true);
    expect(decadeTransition.match(item, { kind: 'number', value: 310 })).toBe(true);
    expect(decadeTransition.match(item, { kind: 'number', value: 41 })).toBe(false);
    expect(checkResponse(item, { kind: 'number', value: 30 }).misconceptionIds).toEqual([
      'MC.decade-transition',
    ]);
  });

  it('counting back, 40 → _: predicts 49', () => {
    const item = make(T.seqPad, { start: 40, dir: -1 });
    expect(decadeTransition.predict?.(item)).toEqual({ kind: 'number', value: 49 });
    expect(decadeTransition.match(item, { kind: 'number', value: 49 })).toBe(true);
    expect(decadeTransition.match(item, { kind: 'number', value: 30 })).toBe(false);
  });

  it('at a hundred: 199 → 200 also matches 100', () => {
    const item = make(T.seqPad, { start: 199 });
    expect(decadeTransition.predict?.(item)).toEqual({ kind: 'number', value: 190 });
    expect(decadeTransition.match(item, { kind: 'number', value: 100 })).toBe(true);
  });

  it.each<[string, ItemTemplate, ParamValues]>([
    ['no decade asked (36 → 37)', T.seqPad, { start: 36 }],
    ['counting back inside a ten (41 → 40)', T.seqPad, { start: 41, dir: -1 }],
    ['counting by tens (30 → 40)', T.seqPad, { start: 30, step: 10 }],
    ['9 → 10 (no earlier ten to keep)', T.seqPad, { start: 9 }],
    ['an order item (the numbers are given)', T.seqOrder, { start: 38, length: 3 }],
    ['a land-on jump (the target is given)', T.seqJump, { start: 38, length: 2 }],
  ])('cannot discriminate: %s', (_label, t, params) => {
    const item = make(t, params);
    expect(decadeTransition.predict?.(item)).toBeNull();
    const v = item.answer.kind === 'number' ? item.answer.value : 40;
    for (const r of [v - 10, v + 10, v - 1])
      expect(decadeTransition.match(item, { kind: 'number', value: r })).toBe(false);
  });

  it('numeral pick: the predicted option is on screen as a diagnostic distractor', () => {
    const item = make(T.seqPick, { start: 59 });
    expect(decadeTransition.predict?.(item)).toEqual({ kind: 'choice', id: 'opt-50' });
    expect(decadeTransition.match(item, { kind: 'choice', id: 'opt-50' })).toBe(true);
    expect(decadeTransition.match(item, { kind: 'choice', id: 'opt-61' })).toBe(false);
  });

  it('hundred chart fill: rewrites the decade term only', () => {
    const item = make(T.seqChart, { start: 38, length: 3 });
    expect(item.answer).toEqual({ kind: 'numbers', values: [39, 40, 41], ordered: true });
    expect(decadeTransition.predict?.(item)).toEqual({ kind: 'numbers', values: [39, 30, 41] });
    expect(decadeTransition.match(item, { kind: 'numbers', values: [39, 310, 41] })).toBe(true);
    expect(decadeTransition.match(item, { kind: 'numbers', values: [39, 30, 31] })).toBe(false);
    expect(decadeTransition.match(item, { kind: 'numbers', values: [39, 30] })).toBe(false);
  });

  it('a one-hop jump with a typed landing: same hops, the landing named with the old ten', () => {
    const item = make(T.seqJump, { start: 69 });
    expect(decadeTransition.predict?.(item)).toEqual({
      kind: 'state',
      value: { jumps: [1], value: 60 },
    });
    expect(decadeTransition.match(item, { kind: 'state', value: { jumps: [1], value: 60 } })).toBe(
      true,
    );
    expect(decadeTransition.match(item, { kind: 'state', value: { jumps: [1], value: 71 } })).toBe(
      false,
    );
  });
});

describe('teenReversal', () => {
  it.each<[number, number | null]>([
    [13, 31],
    [19, 91],
    [41, 14],
    [21, 12],
    [11, null],
    [10, null],
    [20, null],
    [45, null],
    [113, null],
    [7, null],
  ])('teenSwap(%i) → %s', (v, want) => {
    expect(teenSwap(v)).toBe(want);
  });

  it('number pad (count.set): 13 → 31', () => {
    const item = make(T.teenPad, { n: 13, mode: 'how-many' });
    expect(teenReversal.predict?.(item)).toEqual({ kind: 'number', value: 31 });
    expect(teenReversal.match(item, { kind: 'number', value: 31 })).toBe(true);
    expect(teenReversal.match(item, { kind: 'number', value: 14 })).toBe(false);
    expect(checkResponse(item, { kind: 'number', value: 31 }).misconceptionIds).toEqual([
      'MC.teen-reversal',
    ]);
  });

  it('numeral pick: 16 offers and predicts 61', () => {
    const item = make(T.teenPick, { n: 16, mode: 'how-many' });
    if (item.widget.format !== 'numeral-pick') throw new Error('expected numeral-pick');
    expect(item.widget.options.map((o) => o.id)).toContain('opt-61');
    expect(teenReversal.predict?.(item)).toEqual({ kind: 'choice', id: 'opt-61' });
  });

  it('count.sequence: 40 → 41 read as fourteen', () => {
    const item = make(T.teenSeq, { start: 40 });
    expect(teenReversal.predict?.(item)).toEqual({ kind: 'number', value: 14 });
  });

  it('a list answer reverses every reversible term', () => {
    const item = make(T.teenSeq, { start: 11, length: 2 });
    expect(teenReversal.predict?.(item)).toEqual({ kind: 'numbers', values: [21, 31] });
    expect(teenReversal.match(item, { kind: 'numbers', values: [12, 31] })).toBe(true);
    expect(teenReversal.match(item, { kind: 'numbers', values: [21, 14] })).toBe(false);
  });

  it.each<[string, ItemTemplate, ParamValues]>([
    ['11 reads the same both ways', T.teenPad, { n: 11, mode: 'how-many' }],
    ['20 has a zero in the ones', T.teenPad, { n: 20, mode: 'how-many' }],
    ['8 is one digit', T.teenPad, { n: 8, mode: 'how-many' }],
    ['45 has no teen either way', T.teenSeq, { start: 44 }],
  ])('cannot discriminate: %s', (_label, t, params) => {
    const item = make(t, params);
    expect(teenReversal.predict?.(item)).toBeNull();
    const v = item.answer.kind === 'number' ? item.answer.value : 0;
    const reversed = Number(String(v).split('').reverse().join(''));
    expect(teenReversal.match(item, { kind: 'number', value: reversed })).toBe(false);
  });
});
