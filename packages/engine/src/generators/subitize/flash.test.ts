// subitize.flash branches added for K01 (03 §5.6): the `part` param, objects that follow the
// arrangement, the symbols (no picture) stimulus, number-bond, the parts solution step, and the
// n.upTo4 / group.over3 / n.over5 features at their extremes.

import type { ItemFormat, ItemTemplate, ParamValues } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { arrangementGroups, subitizeFlash } from './flash';

let nextId = 0;
function tpl(format: ItemFormat, over: Partial<ItemTemplate> = {}): ItemTemplate {
  nextId += 1;
  return {
    id: `T.sub.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: 'pictorial',
    generator: 'subitize.flash',
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

/** Builds from fixed params and checks the schema, exampleCorrect and the solution replay. */
function build(t: ItemTemplate, params: ParamValues) {
  const item = generateItemFromParams(t, params);
  const parsed = formatModel(t.format)?.configSchema.safeParse(item.widget);
  expect(parsed?.success, JSON.stringify(parsed?.error?.issues)).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const steps = itemSolution(item, t);
  const replayed = replaySteps(item, steps);
  expect(replayed).not.toBeNull();
  expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);
  return { item, steps, features: itemFeatures(item, t) };
}

describe('arrangementGroups', () => {
  it.each([
    { n: 7, groups: 2, part: 3, want: [3, 4] },
    { n: 7, groups: 2, part: 5, want: [5, 2] },
    { n: 7, groups: 0, part: 1, want: [1, 6] }, // a part implies two groups
    { n: 9, groups: 3, part: 1, want: [1, 4, 4] }, // the rest splits evenly
    { n: 7, groups: 2, part: 0, want: [4, 3] }, // no part: even split
    { n: 4, groups: 0, part: 0, want: [4] }, // automatic: one group below 6
    { n: 4, groups: 2, part: 4, want: [2, 2] }, // a part ≥ n is ignored (accepts rejects it)
  ])('groups n=$n groups=$groups part=$part → $want', ({ n, groups, part, want }) => {
    expect(arrangementGroups(n, 'groups', groups, part)).toEqual(want);
  });

  it('ignores part for structured arrangements', () => {
    expect(arrangementGroups(8, 'fingers', 0, 3)).toEqual([5, 3]);
    expect(arrangementGroups(8, 'five-frame', 0, 3)).toEqual([5, 3]);
  });
});

describe('accepts', () => {
  const bond = tpl('number-bond', { tier: 'concrete' });
  const flash = tpl('dot-flash');
  it('rejects a part that leaves nothing for the other group', () => {
    expect(subitizeFlash.accepts?.({ n: 4, arrangement: 'groups', part: 4 }, flash)).toBe(false);
    expect(subitizeFlash.accepts?.({ n: 4, arrangement: 'groups', part: 3 }, flash)).toBe(true);
    // part is only read by the groups arrangement
    expect(subitizeFlash.accepts?.({ n: 4, arrangement: 'dice', part: 4 }, flash)).toBe(true);
  });
  it('needs two parts for a number bond (one group is split, three are rejected)', () => {
    expect(subitizeFlash.accepts?.({ n: 7, arrangement: 'groups', groups: 2 }, bond)).toBe(true);
    expect(subitizeFlash.accepts?.({ n: 4, arrangement: 'groups', groups: 0 }, bond)).toBe(true);
    expect(subitizeFlash.accepts?.({ n: 9, arrangement: 'groups', groups: 3 }, bond)).toBe(false);
    expect(subitizeFlash.accepts?.({ n: 8, arrangement: 'fingers' }, bond)).toBe(true);
    expect(subitizeFlash.accepts?.({ n: 1, arrangement: 'dice' }, bond)).toBe(false);
  });
});

describe('stimulus', () => {
  it('objects follow the arrangement: groups, dice, otherwise scatter', () => {
    const t = tpl('dot-flash', { representation: 'objects' });
    const grouped = build(t, { n: 7, arrangement: 'groups', groups: 2, part: 3 }).item.widget;
    expect(grouped).toMatchObject({
      stimulus: { kind: 'objects', set: { count: 7, layout: 'groups', groups: [3, 4] } },
    });
    const dice = build(t, { n: 4, arrangement: 'dice' }).item.widget;
    expect(dice).toMatchObject({ stimulus: { kind: 'objects', set: { layout: 'dice' } } });
    const fingers = build(t, { n: 4, arrangement: 'fingers' }).item.widget;
    expect(fingers).toMatchObject({ stimulus: { kind: 'objects', set: { layout: 'scatter' } } });
  });

  it('symbols shows no picture (abstract number pad)', () => {
    const t = tpl('number-pad', { tier: 'abstract', representation: 'symbols' });
    const { item } = build(t, { n: 8, arrangement: 'ten-frame' });
    expect(item.widget).toMatchObject({ format: 'number-pad', stimulus: { kind: 'none' } });
    expect(item.answer).toEqual({ kind: 'number', value: 8 });
  });
});

describe('number-bond', () => {
  it('pictorial tier has no counters and asks for the whole', () => {
    const t = tpl('number-bond');
    const { item, steps } = build(t, { n: 9, arrangement: 'groups', groups: 2, part: 5 });
    expect(item.widget).toMatchObject({
      whole: null,
      parts: [5, 4],
      mode: 'missing-whole',
      counters: false,
    });
    expect(item.answer).toEqual({ kind: 'number', value: 9 });
    expect(steps.map((s) => s.say)).toEqual([
      'gen.subitize.flash.parts',
      'gen.subitize.flash.total',
    ]);
    expect(steps[0]?.vars).toEqual({ a: 5, b: 4 });
    expect(steps[1]?.action).toEqual({ op: 'fill', args: { slot: 'whole', value: 9 } });
  });

  it('fingers give a hand of five and the rest; one dice group is split evenly', () => {
    const t = tpl('number-bond', { tier: 'concrete' });
    expect(build(t, { n: 8, arrangement: 'fingers' }).item.widget).toMatchObject({
      parts: [5, 3],
      counters: true,
    });
    const dice = build(t, { n: 5, arrangement: 'dice' });
    expect(dice.item.widget).toMatchObject({ parts: [3, 2] });
    expect(dice.features.conceptual).toBe(1);
  });
});

describe('dot-flash solution', () => {
  it('names the two parts before the total', () => {
    const t = tpl('dot-flash');
    const { steps } = build(t, { n: 7, arrangement: 'groups', groups: 2, part: 3 });
    expect(steps.map((s) => s.say)).toEqual([
      'gen.subitize.flash.look',
      'gen.subitize.flash.parts',
      'gen.subitize.flash.total',
    ]);
    expect(steps[1]?.vars).toEqual({ a: 3, b: 4 });
    expect(steps[1]?.action).toEqual({ op: 'circle-groups', args: { groups: [3, 4] } });
  });

  it('has no parts step for one group or a frame picture', () => {
    const t = tpl('dot-flash');
    const cases: ParamValues[] = [
      { n: 4, arrangement: 'dice' },
      { n: 3, arrangement: 'groups', groups: 3 }, // three groups: no a-and-b line
      { n: 8, arrangement: 'ten-frame' },
    ];
    for (const params of cases) {
      expect(build(t, params).steps.map((s) => s.say)).not.toContain('gen.subitize.flash.parts');
    }
  });
});

describe('features', () => {
  it('n.upTo4 grows 1 → 4 and stays at 3 above', () => {
    const t = tpl('dot-flash');
    expect(build(t, { n: 1, arrangement: 'dice' }).features['n.upTo4']).toBe(0);
    expect(build(t, { n: 3, arrangement: 'dice' }).features['n.upTo4']).toBe(2);
    expect(build(t, { n: 4, arrangement: 'dice' }).features['n.upTo4']).toBe(3);
    expect(build(t, { n: 9, arrangement: 'ten-frame' }).features['n.upTo4']).toBe(3);
  });

  it('group.over3 reads the largest group of a groups arrangement only', () => {
    const t = tpl('dot-flash');
    const g = (params: ParamValues) => build(t, params).features['group.over3'];
    expect(g({ n: 6, arrangement: 'groups', groups: 2, part: 3 })).toBe(0); // 3 and 3
    expect(g({ n: 7, arrangement: 'groups', groups: 2, part: 2 })).toBe(2); // 2 and 5
    expect(g({ n: 10, arrangement: 'groups', groups: 2, part: 5 })).toBe(2); // 5 and 5
    expect(g({ n: 5, arrangement: 'groups', groups: 1 })).toBe(0); // one group is perceptual
    expect(g({ n: 10, arrangement: 'fingers' })).toBe(0); // a full hand is a known pattern
    expect(g({ n: 10, arrangement: 'five-frame' })).toBe(0);
  });

  it('n.over5 is left to formats that measure size themselves', () => {
    const p = { n: 10, arrangement: 'fingers' };
    expect(build(tpl('make-set', { tier: 'concrete' }), p).features).not.toHaveProperty([
      'n.over5',
    ]);
    expect(build(tpl('number-bond'), p).features).not.toHaveProperty(['n.over5']);
    expect(build(tpl('dot-flash'), p).features).not.toHaveProperty(['n.over5']);
    expect(build(tpl('numeral-pick'), p).features['n.over5']).toBe(1);
    expect(build(tpl('make-set', { tier: 'concrete' }), p).features['target.over5']).toBe(1);
    expect(build(tpl('number-bond'), p).features['whole.over5']).toBe(1);
  });
});
