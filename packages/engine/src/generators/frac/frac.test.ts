// 03 §5.6 div.share, frac.partition and frac.compare: fixed params → answer, widget and solution per
// format, exampleCorrect is correct, solutions replay through the format models that exist
// (equal-share, number-pad, order), feature values at the extremes, validity (accepts),
// and the three K01 fraction and sharing misconception rules.

import {
  type AnswerSpec,
  type GeneratedItem,
  type ItemFormat,
  type ItemTemplate,
  type ParamValues,
  widgetConfigSchema,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { fractionBiggerDenominator } from '../../misconceptions/rules/fractionBiggerDenominator';
import {
  fractionUnequalParts,
  unequalCuts,
  unequalRegions,
} from '../../misconceptions/rules/fractionUnequalParts';
import { unequalShare } from '../../misconceptions/rules/unequalShare';
import { predealtShares } from '../div/share';
import { GenerationError } from '../types';
import { denRatio, pieceSize } from './compare';
import { cutLines, pickWord } from './partition';

type Gen = 'div.share' | 'frac.partition' | 'frac.compare';

let nextId = 0;
function tpl(generator: Gen, format: ItemFormat, over: Partial<ItemTemplate> = {}): ItemTemplate {
  nextId += 1;
  return {
    id: `T.${generator}.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: 'concrete',
    generator,
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
    ...over,
  };
}

function build(t: ItemTemplate, params: ParamValues): GeneratedItem {
  return generateItemFromParams(t, params, { seed: 7 });
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

interface Case {
  name: string;
  t: ItemTemplate;
  params: ParamValues;
  answer: AnswerSpec | ((item: GeneratedItem) => AnswerSpec);
  lastOp: string;
}

const pick = (item: GeneratedItem, test: (s: Record<string, unknown>) => boolean): string => {
  const w = item.widget as { options?: { id: string; stimulus?: Record<string, unknown> }[] };
  return w.options?.find((o) => o.stimulus && test(o.stimulus))?.id ?? '';
};

const CASES: Case[] = [
  {
    name: 'equal-share each: 6 shared by 2',
    t: tpl('div.share', 'equal-share'),
    params: { ask: 'each', items: 6, recipients: 2, sprite: 'shell' },
    answer: {
      kind: 'state',
      checker: 'share.fair',
      target: { items: 6, recipients: 2, allowLeftover: false, value: 3 },
    },
    lastOp: 'answer',
  },
  {
    name: 'equal-share each with a leftover: 11 shared by 3',
    t: tpl('div.share', 'equal-share'),
    params: { ask: 'each', items: 11, recipients: 3, leftover: true, sprite: 'fish' },
    answer: {
      kind: 'state',
      checker: 'share.fair',
      target: { items: 11, recipients: 3, allowLeftover: true, value: 3 },
    },
    lastOp: 'answer',
  },
  {
    name: 'equal-share fix: make 8 fair after one moved',
    t: tpl('div.share', 'equal-share'),
    params: { ask: 'fix', items: 8, recipients: 2, shift: 1, sprite: 'crab' },
    answer: {
      kind: 'state',
      checker: 'share.fair',
      target: { items: 8, recipients: 2, allowLeftover: false, value: 4 },
    },
    lastOp: 'answer',
  },
  {
    name: 'equal-share fair-or-not: unfair',
    t: tpl('div.share', 'equal-share'),
    params: {
      ask: 'fair-or-not',
      items: 9,
      recipients: 3,
      fair: false,
      shift: 2,
      sprite: 'pebble',
    },
    answer: { kind: 'choice', id: 'no' },
    lastOp: 'answer',
  },
  {
    name: 'equal-share fair-or-not: fair',
    t: tpl('div.share', 'equal-share'),
    params: { ask: 'fair-or-not', items: 8, recipients: 2, fair: true, shift: 1, sprite: 'pebble' },
    answer: { kind: 'choice', id: 'yes' },
    lastOp: 'answer',
  },
  {
    name: 'number-pad each: 10 for 2',
    t: tpl('div.share', 'number-pad', { tier: 'pictorial' }),
    params: { ask: 'each', items: 10, recipients: 2, sprite: 'fish' },
    answer: { kind: 'number', value: 5 },
    lastOp: 'type',
  },
  {
    name: 'number-pad moves: 10 dealt 7 and 3',
    t: tpl('div.share', 'number-pad', { tier: 'pictorial' }),
    params: { ask: 'moves', items: 10, recipients: 2, shift: 2, sprite: 'fish' },
    answer: { kind: 'number', value: 2 },
    lastOp: 'type',
  },
  {
    name: 'fraction-cut: a circle in fourths, one shaded',
    t: tpl('frac.partition', 'fraction-cut'),
    params: { mode: 'cut', shape: 'circle', den: 4, num: 1 },
    answer: {
      kind: 'state',
      checker: 'fraction.cut',
      target: { parts: 4, shade: 1, acceptNonCongruent: false },
    },
    lastOp: 'shade',
  },
  {
    name: 'fraction-cut: a strip in thirds, none shaded',
    t: tpl('frac.partition', 'fraction-cut'),
    params: { mode: 'cut', shape: 'bar', den: 3, num: 0 },
    answer: {
      kind: 'state',
      checker: 'fraction.cut',
      target: { parts: 3, shade: 0, acceptNonCongruent: false },
    },
    lastOp: 'cut',
  },
  {
    name: 'fraction-pick fair-or-not: unequal parts',
    t: tpl('frac.partition', 'fraction-pick', { tier: 'pictorial' }),
    params: { mode: 'fair-or-not', shape: 'rect', den: 3, num: 0, equalParts: false },
    answer: { kind: 'choice', id: 'no' },
    lastOp: 'answer',
  },
  {
    name: 'fraction-pick pick-picture: cut into halves',
    t: tpl('frac.partition', 'fraction-pick', { tier: 'pictorial' }),
    params: { mode: 'pick', shape: 'circle', den: 2, ask: 'name' },
    answer: (item) => ({
      kind: 'choice',
      id: pick(item, (s) => s.parts === 2 && s.equalParts === true),
    }),
    lastOp: 'answer',
  },
  {
    name: 'fraction-pick pick-picture: the parts that are not equal',
    t: tpl('frac.partition', 'fraction-pick', { tier: 'pictorial' }),
    params: { mode: 'pick', shape: 'rect', den: 4, ask: 'unequal' },
    answer: (item) => ({ kind: 'choice', id: pick(item, (s) => s.equalParts === false) }),
    lastOp: 'answer',
  },
  {
    name: 'fraction-line partition: a strip in fourths',
    t: tpl('frac.partition', 'fraction-line', { tier: 'pictorial' }),
    params: { mode: 'partition', shape: 'bar', den: 4, num: 0 },
    answer: {
      kind: 'state',
      checker: 'fraction.partition',
      target: { denominator: 4, max: 1 },
    },
    lastOp: 'partition',
  },
  {
    name: 'compare: one half against one fourth',
    t: tpl('frac.compare', 'compare'),
    params: { shape: 'bar', den: 2, den2: 4 },
    answer: { kind: 'choice', id: 'left' },
    lastOp: 'answer',
  },
  {
    name: 'compare: cut the same way',
    t: tpl('frac.compare', 'compare', { tier: 'pictorial' }),
    params: { shape: 'circle', den: 6, den2: 6 },
    answer: { kind: 'choice', id: 'same' },
    lastOp: 'answer',
  },
  {
    name: 'order: three strips, biggest piece first',
    t: tpl('frac.compare', 'order', { tier: 'pictorial' }),
    params: { shape: 'bar', den: 8, den2: 2, den3: 4 },
    answer: { kind: 'numbers', values: [12, 6, 3], ordered: true },
    lastOp: 'drag',
  },
  {
    name: 'order: two strips',
    t: tpl('frac.compare', 'order', { tier: 'pictorial' }),
    params: { shape: 'bar', den: 3, den2: 6, den3: 0 },
    answer: { kind: 'numbers', values: [8, 4], ordered: true },
    lastOp: 'drag',
  },
];

describe('div.share, frac.partition, frac.compare: fixed params', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const item = build(c.t, c.params);
      const want = typeof c.answer === 'function' ? c.answer(item) : c.answer;
      expect(item.answer).toEqual(want);
      expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
      const model = formatModel(item.widget.format);
      if (model) expect(model.configSchema.safeParse(item.widget).success).toBe(true);
      expect(checkResponse(item, itemExampleCorrect(item, c.t)).correct).toBe(true);
      const steps = itemSolution(item, c.t);
      expect(steps.at(-1)?.action?.op).toBe(c.lastOp);
      if (model) {
        const r = replaySteps(item, steps);
        expect(r && checkResponse(item, r).correct).toBe(true);
      }
    });
  }
});

describe('div.share details', () => {
  it('pre-deals an unfair share as each ± shift', () => {
    expect(predealtShares({ ask: 'fix', recipients: 2, each: 4, shift: 1 }, 1)).toEqual([3, 5]);
    expect(
      predealtShares({ ask: 'fair-or-not', fair: false, recipients: 3, each: 3, shift: 2 }, 2),
    ).toEqual([1, 3, 5]);
    expect(predealtShares({ ask: 'fair-or-not', fair: true, recipients: 3, each: 3 }, 0)).toEqual([
      3, 3, 3,
    ]);
  });
  it('shows the unfair pair on the moves picture, all items dealt', () => {
    const t = tpl('div.share', 'number-pad', { tier: 'pictorial' });
    const item = build(t, { ask: 'moves', items: 10, recipients: 2, shift: 2, sprite: 'fish' });
    const w = item.widget as { stimulus: { set: { groups: number[]; count: number } } };
    expect([...w.stimulus.set.groups].sort()).toEqual([3, 7]);
    expect(w.stimulus.set.count).toBe(10);
  });
  it('rejects draws that do not fit the ask', () => {
    const t = tpl('div.share', 'equal-share');
    // A leftover that the template does not allow, and the reverse.
    expect(() => build(t, { ask: 'each', items: 7, recipients: 2 })).toThrow(GenerationError);
    expect(() => build(t, { ask: 'each', items: 8, recipients: 2, leftover: true })).toThrow(
      GenerationError,
    );
    // fix shares between two; a plate never starts empty.
    expect(() => build(t, { ask: 'fix', items: 9, recipients: 3, shift: 1 })).toThrow(
      GenerationError,
    );
    expect(() => build(t, { ask: 'fix', items: 4, recipients: 2, shift: 2 })).toThrow(
      GenerationError,
    );
    // moves is a number-pad item.
    expect(() => build(t, { ask: 'moves', items: 8, recipients: 2, shift: 1 })).toThrow(
      GenerationError,
    );
  });
  it('features: items beyond one each, recipients, leftover, near-fair, shift', () => {
    const t = tpl('div.share', 'equal-share');
    const f = (p: ParamValues) => itemFeatures(build(t, p), t);
    expect(f({ ask: 'each', items: 2, recipients: 2 })).toMatchObject({
      items: 0,
      'recipients.over2': 0,
      leftover: 0,
      nearFair: 0,
      shift: 0,
    });
    expect(f({ ask: 'each', items: 13, recipients: 3, leftover: true })).toMatchObject({
      items: 1,
      'recipients.over2': 1,
      leftover: 1,
    });
    expect(f({ ask: 'fair-or-not', items: 8, recipients: 2, fair: false, shift: 1 }).nearFair).toBe(
      1,
    );
    expect(f({ ask: 'fair-or-not', items: 8, recipients: 2, fair: true, shift: 1 }).nearFair).toBe(
      0,
    );
    expect(f({ ask: 'fix', items: 8, recipients: 2, shift: 3 }).shift).toBe(2);
  });
});

describe('frac.partition details', () => {
  it('cuts each shape with its guided lines', () => {
    expect(cutLines('circle', 2)).toBe(1);
    expect(cutLines('circle', 4)).toBe(2);
    expect(cutLines('circle', 3)).toBe(3);
    expect(cutLines('rect', 4)).toBe(2);
    expect(cutLines('bar', 4)).toBe(3);
    const t = tpl('frac.partition', 'fraction-cut');
    const steps = itemSolution(build(t, { mode: 'cut', shape: 'bar', den: 4, num: 1 }), t);
    expect(steps.map((s) => s.action?.op)).toEqual(['cut', 'cut', 'cut', 'shade']);
  });
  it('asks pick items in words and shows three different pictures', () => {
    expect(pickWord('name', 2)).toBe('halves');
    expect(pickWord('name', 4)).toBe('fourths');
    expect(pickWord('unequal', 4)).toBe('unequal-parts');
    const t = tpl('frac.partition', 'fraction-pick', { tier: 'pictorial' });
    const item = build(t, { mode: 'pick', shape: 'circle', den: 4, ask: 'name' });
    const w = item.widget as { options: { id: string; stimulus: Record<string, unknown> }[] };
    expect(w.options.map((o) => o.id)).toEqual(['pic-0', 'pic-1', 'pic-2']);
    const kinds = w.options.map((o) => `${o.stimulus.parts}:${o.stimulus.equalParts}`).sort();
    expect(kinds).toEqual(['2:true', '4:false', '4:true']);
    expect(item.prompt.vars.what).toBe('fourths');
  });
  it('rejects params the format cannot show', () => {
    const pickT = tpl('frac.partition', 'fraction-pick', { tier: 'pictorial' });
    expect(() => build(pickT, { mode: 'pick', shape: 'circle', den: 3, ask: 'name' })).toThrow(
      GenerationError,
    );
    expect(() => build(pickT, { mode: 'fair-or-not', shape: 'square', den: 2 })).toThrow(
      GenerationError,
    );
    const lineT = tpl('frac.partition', 'fraction-line', { tier: 'pictorial' });
    expect(() => build(lineT, { mode: 'partition', shape: 'circle', den: 2, num: 0 })).toThrow(
      GenerationError,
    );
    const cutT = tpl('frac.partition', 'fraction-cut');
    expect(() => build(cutT, { mode: 'cut', shape: 'rect', den: 2, num: 2 })).toThrow(
      GenerationError,
    );
  });
  it('features: denominator, circle, hard parts, ask unequal', () => {
    const cutT = tpl('frac.partition', 'fraction-cut');
    expect(
      itemFeatures(build(cutT, { mode: 'cut', shape: 'rect', den: 2, num: 1 }), cutT),
    ).toMatchObject({ denominator: 0, 'shape.circle': 0, 'parts.hard': 0, nonUnit: 0 });
    expect(
      itemFeatures(build(cutT, { mode: 'cut', shape: 'circle', den: 6, num: 2 }), cutT),
    ).toMatchObject({ denominator: 4, 'shape.circle': 1, 'parts.hard': 1, nonUnit: 1 });
    const pickT = tpl('frac.partition', 'fraction-pick', { tier: 'pictorial' });
    expect(
      itemFeatures(build(pickT, { mode: 'pick', shape: 'rect', den: 2, ask: 'unequal' }), pickT)[
        'ask.unequal'
      ],
    ).toBe(1);
  });
});

describe('frac.compare details', () => {
  it('piece sizes are 24ths of the whole', () => {
    expect([2, 3, 4, 6, 8].map(pieceSize)).toEqual([12, 8, 6, 4, 3]);
  });
  it('ratio is the closeness of the hardest pair', () => {
    expect(denRatio([2, 8])).toBe(0.25);
    expect(denRatio([2, 4, 8])).toBe(0.5);
    expect(denRatio([3, 4, 8])).toBe(0.75);
    expect(denRatio([4, 4])).toBe(0);
  });
  it('features: same numerator, equal, ratio', () => {
    const t = tpl('frac.compare', 'compare');
    expect(itemFeatures(build(t, { shape: 'bar', den: 2, den2: 8 }), t)).toMatchObject({
      sameNum: 1,
      equal: 0,
      ratio: 0.25,
    });
    expect(itemFeatures(build(t, { shape: 'bar', den: 3, den2: 3 }), t)).toMatchObject({
      sameNum: 0,
      equal: 1,
      ratio: 0,
    });
  });
  it('order strips are all cut differently', () => {
    const t = tpl('frac.compare', 'order', { tier: 'pictorial' });
    expect(() => build(t, { shape: 'bar', den: 4, den2: 4, den3: 2 })).toThrow(GenerationError);
    expect(() => build(t, { shape: 'circle', den: 4, den2: 2, den3: 0 })).toThrow(GenerationError);
  });
});

describe('MC.fraction-unequal-parts (fractionUnequalParts)', () => {
  const rule = fractionUnequalParts;
  it('fair-or-not: says yes to an unfair share or unequal parts', () => {
    const share = tpl('div.share', 'equal-share');
    const unfair = build(share, { ask: 'fair-or-not', items: 8, recipients: 2, fair: false });
    expect(rule.predict?.(unfair)).toEqual({ kind: 'choice', id: 'yes' });
    expect(rule.match(unfair, { kind: 'choice', id: 'yes' })).toBe(true);
    const fair = build(share, { ask: 'fair-or-not', items: 8, recipients: 2, fair: true });
    expect(rule.predict?.(fair)).toBeNull();
    expect(rule.match(fair, { kind: 'choice', id: 'no' })).toBe(false);
    const pic = tpl('frac.partition', 'fraction-pick', { tier: 'pictorial' });
    const unequal = build(pic, { mode: 'fair-or-not', shape: 'circle', den: 4, equalParts: false });
    expect(rule.predict?.(unequal)).toEqual({ kind: 'choice', id: 'yes' });
    const equal = build(pic, { mode: 'fair-or-not', shape: 'circle', den: 4, equalParts: true });
    expect(rule.predict?.(equal)).toBeNull();
  });
  it('pick: takes the unequal picture with as many parts, when the set has one', () => {
    const pic = tpl('frac.partition', 'fraction-pick', { tier: 'pictorial' });
    const item = build(pic, { mode: 'pick', shape: 'rect', den: 2, ask: 'name', unequalParts: 2 });
    const id = pick(item, (s) => s.equalParts === false);
    expect(rule.predict?.(item)).toEqual({ kind: 'choice', id });
    const four = build(pic, { mode: 'pick', shape: 'rect', den: 2, ask: 'name', unequalParts: 4 });
    expect(rule.predict?.(four)).toBeNull();
    // Asked for the unequal one, the rule cannot tell.
    const asked = build(pic, { mode: 'pick', shape: 'rect', den: 2, ask: 'unequal' });
    expect(rule.predict?.(asked)).toBeNull();
  });
  it('cut and partition: the right count, not the same size', () => {
    expect(unequalRegions(2)).toEqual([0.75, 0.25]);
    expect(unequalCuts(4, 1)).toEqual([0.35, 0.5, 0.75]);
    const cutT = tpl('frac.partition', 'fraction-cut');
    const cut = build(cutT, { mode: 'cut', shape: 'circle', den: 4, num: 1 });
    const predicted = rule.predict?.(cut);
    expect(predicted).not.toBeNull();
    expect(predicted && checkResponse(cut, predicted).correct).toBe(false);
    const any = { kind: 'state' as const, value: { regions: [0.4, 0.2, 0.2, 0.2], shaded: [1] } };
    expect(rule.match(cut, any)).toBe(true);
    const fewer = { kind: 'state' as const, value: { regions: [0.5, 0.5], shaded: [0] } };
    expect(rule.match(cut, fewer)).toBe(false);
    const equal = {
      kind: 'state' as const,
      value: { regions: [0.25, 0.25, 0.25, 0.25], shaded: [0] },
    };
    expect(rule.match(cut, equal)).toBe(false);
    const lineT = tpl('frac.partition', 'fraction-line', { tier: 'pictorial' });
    const line = build(lineT, { mode: 'partition', shape: 'bar', den: 2, num: 0 });
    expect(rule.predict?.(line)).toEqual({ kind: 'state', value: { cuts: [0.7] } });
    expect(rule.match(line, { kind: 'state', value: { cuts: [0.4] } })).toBe(true);
    expect(rule.match(line, { kind: 'state', value: { cuts: [0.3, 0.6] } })).toBe(false);
  });
  it('fix and moves: leaves the unfair share as dealt', () => {
    const shareT = tpl('div.share', 'equal-share');
    const fix = build(shareT, { ask: 'fix', items: 8, recipients: 2, shift: 1 });
    const predealt = (fix.widget as { predealt: number[] }).predealt;
    expect(rule.predict?.(fix)).toEqual({
      kind: 'state',
      value: { shares: predealt, leftover: 0, value: predealt[0] },
    });
    expect(
      rule.match(fix, { kind: 'state', value: { shares: predealt, leftover: 0, value: 5 } }),
    ).toBe(true);
    expect(
      rule.match(fix, { kind: 'state', value: { shares: [2, 6], leftover: 0, value: 4 } }),
    ).toBe(false);
    const padT = tpl('div.share', 'number-pad', { tier: 'pictorial' });
    const moves = build(padT, { ask: 'moves', items: 8, recipients: 2, shift: 1 });
    expect(rule.predict?.(moves)).toEqual({ kind: 'number', value: 0 });
    expect(rule.match(moves, { kind: 'number', value: 2 })).toBe(false);
    const each = build(padT, { ask: 'each', items: 8, recipients: 2 });
    expect(rule.predict?.(each)).toBeNull();
  });
});

describe('MC.fraction-bigger-denominator (fractionBiggerDenominator)', () => {
  const rule = fractionBiggerDenominator;
  it('compare: picks the whole cut into more parts', () => {
    const t = tpl('frac.compare', 'compare');
    const item = build(t, { shape: 'bar', den: 2, den2: 4 });
    expect(rule.predict?.(item)).toEqual({ kind: 'choice', id: 'right' });
    expect(rule.match(item, { kind: 'choice', id: 'same' })).toBe(false);
    expect(rule.predict?.(build(t, { shape: 'bar', den: 4, den2: 4 }))).toBeNull();
  });
  it('order: orders by the number of parts, most first', () => {
    const t = tpl('frac.compare', 'order', { tier: 'pictorial' });
    const item = build(t, { shape: 'bar', den: 2, den2: 4, den3: 8 });
    expect(rule.predict?.(item)).toEqual({ kind: 'numbers', values: [3, 6, 12] });
    expect(rule.match(item, { kind: 'numbers', values: [3, 6, 12] })).toBe(true);
    expect(rule.match(item, { kind: 'numbers', values: [6, 3, 12] })).toBe(false);
  });
});

describe('MC.unequal-share (unequalShare)', () => {
  const t = tpl('div.share', 'equal-share');
  it('matches unequal shares and a leftover that could go round again', () => {
    const item = build(t, { ask: 'each', items: 6, recipients: 2 });
    const r = (shares: number[], leftover: number, value: number) => ({
      kind: 'state' as const,
      value: { shares, leftover, value },
    });
    expect(unequalShare.match(item, r([4, 2], 0, 4))).toBe(true);
    expect(unequalShare.match(item, r([2, 2], 2, 2))).toBe(true);
    expect(unequalShare.match(item, r([3, 3], 0, 4))).toBe(false);
    expect(unequalShare.match(item, r([3], 3, 3))).toBe(false);
    expect(unequalShare.predict).toBeUndefined();
  });
  it('ignores items that are not share.fair', () => {
    const pad = tpl('div.share', 'number-pad', { tier: 'pictorial' });
    const item = build(pad, { ask: 'each', items: 6, recipients: 2 });
    expect(unequalShare.match(item, { kind: 'number', value: 4 })).toBe(false);
  });
});
