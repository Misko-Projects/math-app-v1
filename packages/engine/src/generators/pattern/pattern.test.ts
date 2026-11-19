// pattern.repeat and pattern.grow (03 §5.6, K01): every format branch, the solution replay where the
// format has a model, the feature values, and MC.pattern-restart's predictions (including the
// items it cannot discriminate).

import type {
  ItemFormat,
  ItemTemplate,
  MisconceptionSpec,
  ParamValues,
  Representation,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { patternTokens } from '../../check/state/pattern.tokens';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { earlyCoreLength, patternRestart } from '../../misconceptions/rules/patternRestart';
import { patternGrow } from './grow';
import { patternRepeat, themeUnits, tokenAt } from './repeat';

let nextId = 0;
function tpl(
  generator: string,
  format: ItemFormat,
  tier: ItemTemplate['tier'] = 'pictorial',
  representation?: Representation,
): ItemTemplate {
  nextId += 1;
  return {
    id: `ALG.01.t${nextId}`,
    skillId: 'ALG.01',
    format,
    tier,
    ...(representation ? { representation } : {}),
    generator,
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  };
}

const restartSpec: MisconceptionSpec = {
  id: 'MC.pattern-restart',
  name: 'restart',
  area: 'patterns-data',
  detect: { kind: 'state', rule: 'patternRestart' },
  appliesTo: { generators: ['pattern.repeat'] },
  skills: ['ALG.01'],
  remediation: ['ALG.01'],
  feedback: 'fb.mc.pattern-restart',
  priority: 50,
  parentTip: 'x',
  examples: [],
};

function bind(...templates: ItemTemplate[]) {
  resetContent();
  initContent({ templates, narration: {}, misconceptions: [restartSpec] });
}

beforeEach(() => bind());

/** Builds from params; checks exampleCorrect and, where the format has a model, the solution. */
function build(t: ItemTemplate, params: ParamValues) {
  bind(t);
  const item = generateItemFromParams(t, params);
  const model = formatModel(t.format);
  if (model) {
    const parsed = model.configSchema.safeParse(item.widget);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    const replayed = replaySteps(item, itemSolution(item, t));
    expect(replayed).not.toBeNull();
    expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);
  }
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  return { item, features: itemFeatures(item, t) };
}

describe('pattern.repeat', () => {
  const units = themeUnits(0, false);
  const shell = { sprite: 'shell' };
  const fish = { sprite: 'fish' };

  it('extends an AB pattern with the next tokens', () => {
    const t = tpl('pattern.repeat', 'pattern-extend', 'concrete', 'objects');
    const { item, features } = build(t, { mode: 'extend', core: 'AB', shown: 5, ask: 2, theme: 0 });
    expect(item.widget).toMatchObject({ format: 'pattern-extend', mode: 'extend', kind: 'repeat' });
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'pattern.tokens',
      target: { expected: [fish, shell] },
    });
    expect(features).toMatchObject({ 'core.len': 0, 'core.double': 0, 'ask.over1': 1 });
    // Starting over gives shell, fish: tagged MC.pattern-restart.
    const predicted = patternRestart.predict?.(item);
    expect(predicted).toEqual({ kind: 'state', value: { tokens: [shell, fish] } });
    const res = checkResponse(item, predicted as NonNullable<typeof predicted>);
    expect(res.correct).toBe(false);
    expect(res.misconceptionIds).toEqual(['MC.pattern-restart']);
  });

  it('cannot discriminate when the shown part ends on a whole core', () => {
    const t = tpl('pattern.repeat', 'pattern-extend', 'concrete', 'objects');
    const { item } = build(t, { mode: 'extend', core: 'AB', shown: 4, ask: 2, theme: 0 });
    expect(patternRestart.predict?.(item)).toBeNull();
    expect(patternRestart.match(item, { kind: 'state', value: { tokens: [shell, fish] } })).toBe(
      false,
    );
  });

  it('fills a gap that ends one before the last token', () => {
    const t = tpl('pattern.repeat', 'pattern-extend', 'pictorial', 'shapes');
    const { item, features } = build(t, { mode: 'fill', core: 'ABB', shown: 8, ask: 2, theme: 1 });
    if (item.widget.format !== 'pattern-extend') throw new Error('format');
    expect(item.widget.sequence.map((x) => x === null)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
    ]);
    const shapes = themeUnits(1, true);
    expect(item.answer).toMatchObject({
      target: { expected: [tokenAt('ABB', shapes, 5), tokenAt('ABB', shapes, 6)] },
    });
    expect(features['hidden.middle']).toBe(1);
    expect(features['core.double']).toBe(1);
  });

  it('brackets the first repeat of the core', () => {
    const t = tpl('pattern.repeat', 'pattern-extend', 'concrete', 'objects');
    const { item, features } = build(t, { mode: 'core', core: 'AAB', shown: 7, theme: 0 });
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'select.exactSet',
      target: { values: [0, 1, 2] },
    });
    expect(features['core.len']).toBe(1);
    // AAB: stopping where the A comes back brackets only the first A.
    expect(patternRestart.predict?.(item)).toEqual({ kind: 'state', value: { values: [0] } });
    expect(checkResponse(item, { kind: 'state', value: { values: [0] } }).misconceptionIds).toEqual(
      ['MC.pattern-restart'],
    );
    const ab = build(t, { mode: 'core', core: 'ABC', shown: 7, theme: 0 }).item;
    expect(patternRestart.predict?.(ab)).toBeNull();
    expect(earlyCoreLength('AABB')).toBe(1);
    expect(earlyCoreLength('ABB')).toBe(3);
  });

  it('orders the next cards after the fixed ones (order model replay)', () => {
    const t = tpl('pattern.repeat', 'order', 'pictorial', 'objects');
    const { item } = build(t, { core: 'AB', shown: 3, ask: 2, theme: 0 });
    if (item.widget.format !== 'order') throw new Error('format');
    expect(item.widget.fixed).toEqual({ 0: 'obj-0', 1: 'obj-1', 2: 'obj-2' });
    expect(item.answer).toEqual({ kind: 'numbers', values: [1, 2, 3, 4, 5], ordered: true });
    // shell fish shell | fish shell: starting over puts the shell card first.
    const predicted = patternRestart.predict?.(item);
    expect(predicted).toEqual({ kind: 'numbers', values: [1, 2, 3, 5, 4] });
    expect(
      checkResponse(item, predicted as NonNullable<typeof predicted>).misconceptionIds,
    ).toEqual(['MC.pattern-restart']);
  });

  it('rejects order items whose cards repeat a unit, and short core items', () => {
    const order = tpl('pattern.repeat', 'order', 'pictorial', 'objects');
    const extend = tpl('pattern.repeat', 'pattern-extend', 'concrete', 'objects');
    expect(patternRepeat.accepts?.({ core: 'ABB', shown: 4, ask: 2, theme: 0 }, order)).toBe(false);
    // PR #84 review: more than one whole core comes before the free cards.
    expect(patternRepeat.accepts?.({ core: 'ABB', shown: 3, ask: 2, theme: 0 }, order)).toBe(false);
    expect(patternRepeat.accepts?.({ core: 'ABB', shown: 6, ask: 2, theme: 0 }, order)).toBe(true);
    expect(
      patternRepeat.accepts?.({ core: 'ABC', shown: 5, ask: 1, theme: 0, mode: 'core' }, extend),
    ).toBe(false);
  });

  it('every token comes from the params (themes and cores)', () => {
    expect(tokenAt('AAB', units, 2)).toEqual(fish);
    expect(tokenAt('AAB', units, 4)).toEqual(shell);
    expect(themeUnits(2, true)).toHaveLength(3);
  });
});

describe('pattern.tokens', () => {
  const target = { expected: [{ sprite: 'fish' }, { n: 7 }] };
  it.each([
    [[{ sprite: 'fish' }, { n: 7 }], true],
    [[{ sprite: 'fish', color: 'red' }, { n: 7 }], false],
    [[{ sprite: 'fish' }, { n: 8 }], false],
    [[{ sprite: 'fish' }], false],
    [[{ n: 7 }, { sprite: 'fish' }], false],
  ])('%j → %s', (tokens, expected) => {
    expect(patternTokens.check(target, { tokens })).toBe(expected);
  });
});

describe('pattern.grow', () => {
  it('hundred chart: taps the next terms after the three shaded', () => {
    const t = tpl('pattern.grow', 'hundred-chart', 'pictorial', 'hundred-chart');
    const { item, features } = build(t, { start: 4, step: 10, ask: 2 });
    expect(item.widget).toMatchObject({ mode: 'pattern', patternStart: 4, patternStep: 10 });
    expect(item.answer).toMatchObject({ checker: 'select.exactSet', target: { values: [34, 44] } });
    expect(features).toMatchObject({ twoDigitStep: 1, 'step.notOne': 1, 'ask.over1': 1 });
  });

  it('number line: jumps on from the third term and types the landing', () => {
    const t = tpl('pattern.grow', 'number-line-jump', 'pictorial', 'number-line');
    const { item, features } = build(t, { start: 15, step: 2, ask: 1 });
    expect(item.widget).toMatchObject({ start: 19, target: 21, goal: 'add', thenAsk: 'landing' });
    expect(item.answer).toMatchObject({ target: { start: 19, target: 21, value: 21 } });
    expect(features.crossDecade).toBe(1);
    expect(
      checkResponse(item, { kind: 'state', value: { jumps: [1, 1], value: 21 } }).correct,
    ).toBe(true);
    expect(checkResponse(item, { kind: 'state', value: { jumps: [2], value: 22 } }).correct).toBe(
      false,
    );
  });

  it('pattern-extend: the next number tokens, or the rule', () => {
    const ext = tpl('pattern.grow', 'pattern-extend', 'abstract', 'symbols');
    const { item, features } = build(ext, { start: 7, step: 1, ask: 2, mode: 'extend' });
    expect(item.answer).toMatchObject({ target: { expected: [{ n: 10 }, { n: 11 }] } });
    expect(features).toMatchObject({ crossDecade: 1, 'step.notOne': 0, twoDigitStep: 0 });
    const rule = build(ext, { start: 7, step: 2, ask: 1, mode: 'rule' }).item;
    expect(rule.answer).toEqual({ kind: 'number', value: 2 });
    expect(patternGrow.accepts?.({ start: 80, step: 10, ask: 1, mode: 'rule' }, ext)).toBe(false);
  });
});
