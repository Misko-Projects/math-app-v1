// 03 §5.6 story.addsub: the answer of every situation, the story lines in telling order, fixed
// params → widget and solution per format (number-pad, make-set and numeral-pick replay through
// their models), the equation grid, features, contexts and validity.

import type { GeneratedItem, ItemFormat, ItemTemplate, ParamValues } from '@number-island/shared';
import { widgetConfigSchema } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { createRng } from '../../rng';
import { registry } from '..';
import { equationGrid, storyAddsub, storyLines } from './addsub';
import { STORY_CONTEXTS } from './contexts';
import { STORY_SITUATIONS, type StorySituation, story } from './model';

let nextId = 0;
function tpl(format: ItemFormat, over: Partial<ItemTemplate> = {}): ItemTemplate {
  nextId += 1;
  return {
    id: `T.story.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: 'pictorial',
    representation: format === 'story-problem' ? 'story' : undefined,
    generator: 'story.addsub',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
    ...over,
  } as ItemTemplate;
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, { context: 'beach-shells', ...params });

function checkItem(t: ItemTemplate, item: GeneratedItem): void {
  expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
  const model = formatModel(item.widget.format);
  if (model) expect(model.configSchema.safeParse(item.widget).success).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const steps = itemSolution(item, t);
  expect(steps.length).toBeGreaterThanOrEqual(2);
  if (model) {
    const r = replaySteps(item, steps);
    expect(checkResponse(item, r as never).correct).toBe(true);
  } else {
    expect(steps[steps.length - 1]?.action?.op).toBe('answer');
  }
  for (const s of steps.slice(0, -1)) {
    expect(['answer', 'type', 'tap', 'drag', 'remove']).not.toContain(s.action?.op);
  }
  const again = registry
    .get('story.addsub')
    ?.build({ params: item.params, template: t, rng: createRng(7).fork('x') });
  expect(again?.features).toEqual(itemFeatures(item, t));
}

describe('situations', () => {
  it.each<[StorySituation, number, number, number, '+' | '-']>([
    ['add-to/result', 3, 4, 7, '+'],
    ['add-to/change', 3, 8, 5, '-'],
    ['add-to/start', 3, 8, 5, '-'],
    ['take-from/result', 9, 4, 5, '-'],
    ['take-from/change', 9, 4, 5, '-'],
    ['take-from/start', 3, 5, 8, '+'],
    ['put-together/total', 3, 4, 7, '+'],
    ['put-together/addend', 9, 4, 5, '-'],
    ['put-together/both', 6, 1, 6, '+'],
    ['compare/difference-more', 9, 3, 6, '-'],
    ['compare/difference-fewer', 9, 3, 6, '-'],
    ['compare/bigger-more', 3, 4, 7, '+'],
    ['compare/bigger-fewer', 3, 4, 7, '+'],
    ['compare/smaller-fewer', 9, 4, 5, '-'],
    ['compare/smaller-more', 9, 4, 5, '-'],
  ])('%s: a = %i, b = %i → %i', (situation, a, b, result, op) => {
    const s = story({ situation, a, b });
    expect(s.result).toBe(result);
    expect(s.op).toBe(op);
    expect(s.inconsistent).toBe(
      situation === 'compare/bigger-fewer' || situation === 'compare/smaller-more',
    );
  });

  it('a third addend counts in add-to/result and put-together/total only', () => {
    expect(story({ situation: 'add-to/result', a: 3, b: 4, c: 5 }).result).toBe(12);
    expect(story({ situation: 'put-together/total', a: 3, b: 4, c: 5 }).result).toBe(12);
    expect(story({ situation: 'take-from/result', a: 9, b: 4, c: 5 }).result).toBe(5);
  });

  it('every situation tells its numbers in order and ends with a question', () => {
    for (const situation of STORY_SITUATIONS) {
      for (const context of Object.keys(STORY_CONTEXTS)) {
        const lines = storyLines(story({ situation, a: 9, b: 4 }), context);
        expect(lines.length).toBeGreaterThanOrEqual(2);
        expect(lines[lines.length - 1]?.key).toMatch(/\.q[.-]/);
        const told = lines.flatMap((l) =>
          ['a', 'b', 'c', 'n'].flatMap((k) => (typeof l.vars[k] === 'number' ? [l.vars[k]] : [])),
        );
        expect(told[0]).toBe(9);
        for (const l of lines) expect(l.vars.who).toBe('@resident');
      }
    }
  });

  it('a context speaks its own verbs; the take-from noun can differ (fireflies)', () => {
    const lines = storyLines(
      story({ situation: 'take-from/result', a: 9, b: 4 }),
      'lighthouse-lanterns',
    );
    expect(lines.map((l) => l.key)).toEqual([
      'p.story.has',
      'p.story.lighthouse-lanterns.take',
      'p.story.q.left',
    ]);
    expect(lines[0]?.vars.item).toBe('firefly');
  });
});

describe('formats', () => {
  it('story-problem: lines, a scene of what is told, and one blank', () => {
    const t = tpl('story-problem');
    const item = make(t, { situation: 'add-to/start', a: 3, b: 8 });
    expect(item.widget).toMatchObject({
      format: 'story-problem',
      context: 'beach-shells',
      situation: 'add-to/start',
      steps: 1,
      blanks: [{ id: 'x', maxDigits: 2 }],
      showText: true,
    });
    expect(item.widget.format === 'story-problem' && item.widget.scene).toEqual({
      kind: 'scene',
      context: 'beach-shells',
      sprites: [],
    });
    expect(item.answer).toEqual({ kind: 'number', value: 5 });
    checkItem(t, item);
  });

  it('story-problem put-together/both answers any split (bond.split)', () => {
    const t = tpl('story-problem');
    const item = make(t, { situation: 'put-together/both', a: 6, b: 1 });
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'bond.split',
      target: { whole: 6, nonZero: true },
    });
    expect(checkResponse(item, { kind: 'state', value: { parts: [4, 2] } }).correct).toBe(true);
    expect(checkResponse(item, { kind: 'state', value: { parts: [6, 0] } }).correct).toBe(false);
    checkItem(t, item);
  });

  it('number-pad: one blank, or the equation a op _ = _ (ADD.23)', () => {
    const bar = tpl('number-pad', { representation: 'bar-model' });
    const item = make(bar, { situation: 'compare/difference-fewer', a: 9, b: 3 });
    expect(item.widget.format === 'number-pad' && item.widget.stimulus).toEqual({
      kind: 'bar-model',
      parts: [3, '?'],
      whole: 9,
      compare: { bigger: 9, smaller: 3 },
    });
    checkItem(bar, item);
    const eq = tpl('number-pad', { representation: 'objects' });
    const sentence = make(eq, { situation: 'add-to/result', a: 3, b: 2, ask: 'equation' });
    expect(sentence.answer).toEqual({ kind: 'numbers', values: [2, 5], ordered: true });
    expect(sentence.widget).toMatchObject({
      stimulus: { kind: 'objects', set: { count: 5, groups: [3, 2] } },
      blanks: [{ id: 'y' }, { id: 'z' }],
    });
    checkItem(eq, sentence);
  });

  it('make-set acts out add-to and take-from', () => {
    const t = tpl('make-set', { tier: 'concrete', representation: 'objects' });
    const add = make(t, { situation: 'add-to/result', a: 3, b: 4 });
    expect(add.widget).toMatchObject({
      mode: 'add-more',
      start: 3,
      target: 7,
      container: 'basket',
    });
    checkItem(t, add);
    const take = make(t, { situation: 'take-from/result', a: 9, b: 4 });
    expect(take.widget).toMatchObject({ mode: 'take-away', start: 9, target: 5 });
    checkItem(t, take);
  });

  it('numeral-pick: the told equation is the `corner` cell of the 2 × 2 grid', () => {
    const t = tpl('numeral-pick', { representation: 'objects' });
    const labels = (corner: number) => {
      const item = make(t, { situation: 'add-to/result', a: 5, b: 2, ask: 'equation', corner });
      checkItem(t, item);
      expect(item.answer).toEqual({ kind: 'choice', id: 'eq-5-plus-2' });
      return item.widget.format === 'numeral-pick' ? item.widget.options.map((o) => o.label) : [];
    };
    // The key 5 + 2 is the least, the greatest, or a middle cell, as `corner` says.
    expect(labels(0).sort()).toEqual(['5 + 2 = 7', '5 + 3 = 8', '6 + 2 = 8', '6 + 3 = 9']);
    expect(labels(1).sort()).toEqual(['4 + 2 = 6', '4 + 3 = 7', '5 + 2 = 7', '5 + 3 = 8']);
    expect(labels(2).sort()).toEqual(['5 + 1 = 6', '5 + 2 = 7', '6 + 1 = 7', '6 + 2 = 8']);
    expect(labels(3).sort()).toEqual(['4 + 1 = 5', '4 + 2 = 6', '5 + 1 = 6', '5 + 2 = 7']);
  });

  it('equationGrid: the set depends on (x0, y0) only; no turn-around pair; cells stay in 1–maxTold', () => {
    const cells = (p: ParamValues) =>
      equationGrid({ situation: 'add-to/result', ...p })?.options.map((e) => [e.x, e.y]);
    // The same set from each of its four cells.
    const set = [
      [2, 3],
      [3, 3],
      [2, 4],
      [3, 4],
    ];
    expect(cells({ a: 2, b: 3, corner: 0 })).toEqual(set);
    expect(cells({ a: 3, b: 3, corner: 1 })).toEqual(set);
    expect(cells({ a: 2, b: 4, corner: 2 })).toEqual(set);
    expect(cells({ a: 3, b: 4, corner: 3 })).toEqual(set);
    // x0 = y0 would offer 1 + 2 beside 2 + 1, which the two-group picture cannot tell apart.
    expect(equationGrid({ situation: 'add-to/result', a: 2, b: 2, corner: 3 })).toBeNull();
    expect(equationGrid({ situation: 'add-to/result', a: 2, b: 2, corner: 1 })).not.toBeNull();
    // Below 1, or past maxTold.
    expect(cells({ a: 1, b: 2, corner: 1 })).toBeUndefined();
    expect(cells({ a: 5, b: 2, corner: 0, maxTold: 5 })).toBeUndefined();
    expect(cells({ a: 5, b: 2, corner: 1, maxTold: 5 })).toEqual([
      [4, 2],
      [5, 2],
      [4, 3],
      [5, 3],
    ]);
    // 2 − 1 with corner 0: the grid has 2 − 2 = 0, which no story here asks.
    expect(equationGrid({ situation: 'take-from/result', a: 2, b: 1, corner: 0 })).toBeNull();
    expect(equationGrid({ situation: 'add-to/change', a: 1, b: 3 })).toBeNull();
  });
});

describe('put-together/both (a free split of the whole a)', () => {
  it('the level-3 picture shows the whole a with two unknown parts', () => {
    const t = tpl('story-problem');
    const item = make(t, { situation: 'put-together/both', a: 6, b: 1 });
    const level3 = item.hints.find((h) => h.level === 3);
    expect(level3?.overlay).toEqual({ kind: 'bar-model', parts: ['?', '?'], whole: 6 });
  });

  it('b changes neither the widget, the picture nor the difficulty', () => {
    const t = tpl('story-problem');
    const build = (b: number) =>
      registry.get('story.addsub')?.build({
        params: { context: 'beach-shells', situation: 'put-together/both', a: 6, b, result: 6 },
        template: t,
        rng: createRng(3).fork('x'),
      });
    const one = build(1);
    for (const b of [2, 5, 9, 19]) {
      const other = build(b);
      expect(other?.widget).toEqual(one?.widget);
      expect(other?.hints).toEqual(one?.hints);
      expect(other?.features).toEqual(one?.features);
      expect(other?.vars).toEqual(one?.vars);
    }
    expect(one?.features).toMatchObject({ size: 0.1, bridge10: 0 });
  });

  it('sampling pins b to its least value', () => {
    const p = storyAddsub.sample(
      {
        situation: { kind: 'const', value: 'put-together/both' },
        a: { kind: 'int', min: 2, max: 10 },
        b: { kind: 'int', min: 3, max: 9 },
      },
      createRng(5),
    );
    expect(p.b).toBe(3);
  });
});

describe('features and validity', () => {
  it('situation, inconsistent language, size and bridging ten', () => {
    const t = tpl('story-problem');
    expect(itemFeatures(make(t, { situation: 'add-to/result', a: 2, b: 3 }), t)).toMatchObject({
      situation: 0,
      size: 0,
      bridge10: 0,
      inconsistentLanguage: 0,
      'workspace.none': 0,
    });
    expect(
      itemFeatures(make(t, { situation: 'compare/smaller-more', a: 13, b: 5 }), t),
    ).toMatchObject({ situation: 1.2, inconsistentLanguage: 1, bridge10: 1, size: 0.8 });
  });

  it('rejects negative answers, numbers past maxN and situations a context lacks', () => {
    const ok = (format: ItemFormat, p: ParamValues) =>
      storyAddsub.accepts?.({ context: 'beach-shells', c: 0, maxN: 20, ...p }, tpl(format)) ?? true;
    expect(ok('story-problem', { situation: 'add-to/change', a: 8, b: 3 })).toBe(false);
    expect(ok('story-problem', { situation: 'add-to/result', a: 15, b: 8 })).toBe(false);
    expect(ok('story-problem', { situation: 'add-to/result', a: 5, b: 8 })).toBe(true);
    expect(ok('number-pad', { situation: 'put-together/both', a: 5, b: 1 })).toBe(false);
    expect(ok('make-set', { situation: 'compare/difference-more', a: 5, b: 1 })).toBe(false);
    expect(ok('story-problem', { situation: 'add-to/result', a: 5, b: 8, context: 'moon' })).toBe(
      false,
    );
  });
});
