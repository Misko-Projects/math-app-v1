// 03 §5.3 generateItem (determinism, rejection sampling, targeting), itemKey, mergedSpec,
// generateItemFromParams; 03 §5.4 / 04 §2.2 difficulty; 03 §5.8 hint ladder.

import type {
  GeneratorId,
  ItemFormat,
  ItemTemplate,
  LessonStep,
  ParamSpec,
  StimulusSpec,
} from '@number-island/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../content/binding';
import { registry } from '../generators';
import { countSet } from '../generators/count/set';
import { GenerationError, type GeneratorDef } from '../generators/types';
import { type DevEvent, setDevLogger } from './devlog';
import { difficulty, featureWeight, resolvedWeights } from './difficulty';
import {
  CANDIDATES_WITH_TARGET,
  generateItem,
  generateItemFromParams,
  itemKey,
  mergedSpec,
} from './generate';
import { buildHints, workedStepActions } from './hints';

const int = (min: number, max: number): ParamSpec => ({ kind: 'int', min, max });
const c = (value: string | number | boolean): ParamSpec => ({ kind: 'const', value });

function tpl(
  id: string,
  generator: GeneratorId,
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  return {
    id,
    skillId: 'X.01',
    format,
    tier: 'abstract',
    generator,
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
    ...over,
  };
}

const ADD = tpl('T.add', 'addsub.facts', 'number-pad', {
  params: { a: int(0, 10), b: int(0, 10), op: c('+'), unknown: c('result'), family: c('any') },
  constraints: ['a + b <= 12'],
});
/** count.set number-pad: d = 0.5 · max(0, n − 5) / 5 + format features (answer digits) — n 5..8. */
const COUNT = tpl('T.count', 'count.set', 'number-pad', { params: { n: int(5, 8) } });

const dev: DevEvent[] = [];
beforeEach(() => {
  resetContent();
  dev.length = 0;
  setDevLogger((e) => dev.push(e));
});
afterEach(() => setDevLogger(null));

describe('generateItem determinism', () => {
  it.each([0, 1, 42, -7, 123456])('same (template, seed) → deep-equal item (seed %s)', (seed) => {
    expect(generateItem(ADD, seed)).toEqual(generateItem(ADD, seed));
  });

  it.each([0, 3, 99])('same (template, seed, target) → deep-equal item (seed %s)', (seed) => {
    expect(generateItem(ADD, seed, { difficulty: 0.4 })).toEqual(
      generateItem(ADD, seed, { difficulty: 0.4 }),
    );
  });

  it('different seeds give different items', () => {
    const keys = new Set(Array.from({ length: 30 }, (_, s) => itemKey(generateItem(ADD, s))));
    expect(keys.size).toBeGreaterThan(10);
  });

  it('fills the item fields from the template', () => {
    const item = generateItem(ADD, 5);
    expect(item).toMatchObject({
      templateId: 'T.add',
      skillId: 'X.01',
      seed: 5,
      format: 'number-pad',
      tier: 'abstract',
      prompt: { narration: 'p.x', text: 'p.x' }, // no bound narration: render returns the key
    });
    expect((item.params.a as number) + (item.params.b as number)).toBeLessThanOrEqual(12);
    expect(item.params.result).toBe((item.params.a as number) + (item.params.b as number));
  });

  it('the prompt text is rendered from the bound narration', () => {
    initContent({
      templates: [],
      narration: { 'p.x': { text: 'What is {a} plus {b}?', clips: [] } },
      misconceptions: [],
    });
    const item = generateItem(ADD, 5);
    expect(item.prompt.vars).toEqual({ a: item.params.a, b: item.params.b });
    expect(item.prompt.text).toBe(`What is ${item.params.a} plus ${item.params.b}?`);
  });
});

describe('GenerationError', () => {
  it('is thrown when no draw satisfies the constraints', () => {
    const t = { ...ADD, id: 'T.impossible', constraints: ['a > 100'] };
    let err: unknown;
    try {
      generateItem(t, 17);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(GenerationError);
    expect(err).toMatchObject({ name: 'GenerationError', templateId: 'T.impossible', seed: 17 });
  });

  it('is thrown with a target as well', () => {
    expect(() => generateItem({ ...ADD, constraints: ['a > 100'] }, 1, { difficulty: 0 })).toThrow(
      GenerationError,
    );
  });

  it('is thrown for an unregistered generator', () => {
    expect(() => generateItem(tpl('T.x', 'no.such', 'number-pad'), 0)).toThrow(/not registered/);
    expect(() => generateItem(tpl('T.x', 'no.such', 'number-pad'), 0)).toThrow(GenerationError);
  });

  it('is thrown for a format the generator does not build', () => {
    expect(() => generateItem(tpl('T.x', 'count.set', 'order'), 0)).toThrow(GenerationError);
    expect(() => generateItem(tpl('T.x', 'count.set', 'order'), 0)).toThrow(/does not build order/);
  });
});

describe('targeting (03 §5.4)', () => {
  const allDifficulties = [5, 6, 7, 8].map((n) => generateItemFromParams(COUNT, { n }).difficulty);
  const dMin = Math.min(...allDifficulties);
  const dMax = Math.max(...allDifficulties);

  it('the fixture template has a spread of difficulties', () => {
    expect(CANDIDATES_WITH_TARGET).toBe(24);
    expect(dMax).toBeGreaterThan(dMin);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])(
    'the targeted item is at least as close as the untargeted one (seed %s)',
    (seed) => {
      for (const target of [-1, 0.1, 0.25, 2]) {
        const targeted = generateItem(ADD, seed, { difficulty: target });
        const plain = generateItem(ADD, seed);
        expect(Math.abs(targeted.difficulty - target)).toBeLessThanOrEqual(
          Math.abs(plain.difficulty - target),
        );
      }
    },
  );

  it.each([0, 1, 2, 3, 4])('a far target returns the extreme difficulty (seed %s)', (seed) => {
    expect(generateItem(COUNT, seed, { difficulty: 100 }).difficulty).toBe(dMax);
    expect(generateItem(COUNT, seed, { difficulty: -100 }).difficulty).toBe(dMin);
    expect(generateItem(COUNT, seed, { difficulty: 100 }).params.n).toBe(8);
  });

  it('ties go to the lowest candidate index (candidate 0 is the untargeted draw)', () => {
    for (let seed = 0; seed < 5; seed += 1) {
      const plain = generateItem(ADD, seed);
      expect(generateItem(ADD, seed, { difficulty: plain.difficulty })).toEqual(plain);
    }
  });

  it('emits difficulty.miss when templateStats are bound and the target is outside [p10, p90]', () => {
    initContent({
      templates: [ADD],
      narration: {},
      misconceptions: [],
      templateStats: { 'T.add': { min: -1, p10: -0.5, median: 0, p90: 0.5, max: 1, distinct: 50 } },
    });
    const item = generateItem(ADD, 3, { difficulty: 3 });
    expect(dev).toEqual([
      {
        event: 'difficulty.miss',
        templateId: 'T.add',
        seed: 3,
        target: 3,
        difficulty: item.difficulty,
      },
    ]);
    dev.length = 0;
    generateItem(ADD, 3, { difficulty: -0.6 });
    expect(dev).toHaveLength(1);
  });

  it('emits nothing for a feasible target, without stats, or without a target', () => {
    initContent({
      templates: [ADD],
      narration: {},
      misconceptions: [],
      templateStats: { 'T.add': { min: -1, p10: -0.5, median: 0, p90: 0.5, max: 1, distinct: 50 } },
    });
    generateItem(ADD, 3, { difficulty: 0.5 });
    generateItem(ADD, 3, { difficulty: -0.5 });
    generateItem(ADD, 3);
    resetContent();
    generateItem(ADD, 3, { difficulty: 5 });
    expect(dev).toEqual([]);
  });
});

describe('itemKey', () => {
  it('is templateId + ":" + canonical params, independent of key order', () => {
    expect(itemKey({ templateId: 'T.a', params: { b: 1, a: 2, op: '+' } })).toBe(
      'T.a:{"a":2,"b":1,"op":"+"}',
    );
    expect(itemKey({ templateId: 'T.a', params: { op: '+', a: 2, b: 1 } })).toBe(
      itemKey({ templateId: 'T.a', params: { b: 1, a: 2, op: '+' } }),
    );
    expect(itemKey({ templateId: 'T.b', params: { a: 2 } })).not.toBe(
      itemKey({ templateId: 'T.a', params: { a: 2 } }),
    );
  });

  it('identifies repeats of generated items', () => {
    const a = generateItemFromParams(ADD, { a: 3, b: 4 }, { seed: 1 });
    const b = generateItemFromParams(ADD, { b: 4, a: 3 }, { seed: 2 });
    expect(itemKey(a)).toBe(itemKey(b));
  });
});

describe('mergedSpec', () => {
  it('starts from the generator defaults and lets template params override them', () => {
    const t = tpl('T.m', 'count.set', 'number-pad', {
      params: { n: c(4), layout: { kind: 'choice', values: ['line'] } },
    });
    const spec = mergedSpec(t, countSet);
    expect(spec.n).toEqual({ kind: 'const', value: 4 });
    expect(spec.layout).toEqual({ kind: 'choice', values: ['line'] });
    expect(spec.mode).toEqual(countSet.params.mode?.default);
    expect(spec.start).toEqual({ kind: 'const', value: 0 });
    expect(Object.keys(spec).sort()).toEqual(Object.keys(countSet.params).sort());
  });

  it('keeps template params the generator does not declare', () => {
    const t = tpl('T.m', 'count.set', 'number-pad', { params: { extra: c(1) } });
    expect(mergedSpec(t, countSet).extra).toEqual({ kind: 'const', value: 1 });
  });
});

describe('generateItemFromParams', () => {
  it('fixes the given params and draws the rest from the seed', () => {
    const t = tpl('T.f', 'count.set', 'number-pad', {
      params: { n: int(1, 10), sprite: { kind: 'choice', values: ['shell', 'fish', 'crab'] } },
    });
    const sprites = new Set<unknown>();
    for (let seed = 0; seed < 20; seed += 1) {
      const item = generateItemFromParams(t, { n: 4 }, { seed });
      expect(item.params.n).toBe(4);
      expect(item.seed).toBe(seed);
      sprites.add(item.params.sprite);
    }
    expect(sprites.size).toBeGreaterThan(1);
  });

  it('keeps the template id and enforces template constraints only with checkConstraints', () => {
    const t = { ...ADD, constraints: ['a + b <= 5'] };
    const item = generateItemFromParams(t, { a: 4, b: 4 });
    expect(item.templateId).toBe('T.add');
    expect(item.params.result).toBe(8);
    expect(() => generateItemFromParams(t, { a: 4, b: 4 }, { checkConstraints: true })).toThrow(
      GenerationError,
    );
    expect(
      generateItemFromParams(t, { a: 2, b: 3 }, { checkConstraints: true }).params.result,
    ).toBe(5);
  });

  it('still enforces the generator’s own validity', () => {
    expect(() => generateItemFromParams(ADD, { a: 3, b: 5, op: '-' })).toThrow(GenerationError);
  });
});

describe('difficulty (03 §5.4)', () => {
  const t = tpl('T.d', 'count.set', 'number-pad', {
    difficulty: { base: 0.5, features: { teen: 1 } },
  });

  it('resolves weights template → generator → format', () => {
    expect(featureWeight(t, countSet, 'teen')).toBe(1); // template
    expect(featureWeight(t, countSet, 'zero')).toBe(0.3); // generator
    expect(featureWeight(t, countSet, 'answer.digits')).toBe(0.3); // number-pad format
    expect(featureWeight(t, countSet, 'nope')).toBeUndefined();
  });

  it('a generator weight wins over a format weight of the same name', () => {
    const g: GeneratorDef = {
      ...countSet,
      features: { ...countSet.features, options: { weight: 9, doc: '' } },
    };
    const pick = tpl('T.p', 'count.set', 'numeral-pick');
    expect(featureWeight(pick, g, 'options')).toBe(9);
    expect(featureWeight(pick, countSet, 'options')).toBe(0.15);
    expect(resolvedWeights(pick, g).options).toBe(9);
    expect(
      resolvedWeights({ ...pick, difficulty: { base: 0, features: { options: 2 } } }, g).options,
    ).toBe(2);
  });

  it('resolvedWeights lists format, generator and template weights, template last', () => {
    const w = resolvedWeights(t, countSet);
    expect(w).toMatchObject({
      teen: 1,
      zero: 0.3,
      'n.over20': 0.5,
      'count.over5': 0.5,
      'answer.digits': 0.3,
    });
  });

  it('sums base + Σ w·x and ignores zero and unweighted features', () => {
    expect(difficulty(t, countSet, {})).toBe(0.5);
    expect(difficulty(t, countSet, { teen: 1, zero: 0, 'count.over5': 0.6 })).toBeCloseTo(
      0.5 + 1 + 0.3,
      12,
    );
    expect(difficulty(t, countSet, { nope: 5 })).toBe(0.5);
    expect(difficulty(t, countSet, { 'answer.digits': 1, teen: 1 })).toBe(1.8);
  });

  it('rounds away floating-point noise', () => {
    const noisy = tpl('T.n', 'count.set', 'number-pad', {
      difficulty: { base: 0.1, features: { teen: 0.2 } },
    });
    expect(difficulty(noisy, countSet, { teen: 1 })).toBe(0.3);
  });

  it('a generated item’s difficulty equals difficulty() of its features', () => {
    const item = generateItemFromParams(t, { n: 12 });
    // n = 12: teen (1 · 1) + count.over5 (0.5 · 1.4) + answer.digits (0.3 · 1)
    expect(item.difficulty).toBeCloseTo(0.5 + 1 + 0.7 + 0.3, 9);
  });
});

// ---------- 03 §5.8 hint ladder ----------

const step = (i: number, action = true): LessonStep =>
  action
    ? { actor: 'demo', say: `s.${i}`, action: { op: 'hop', args: { i } } }
    : { actor: 'demo', say: `s.${i}` };
const steps = (n: number) => Array.from({ length: n }, (_, i) => step(i));
const OVERLAY: StimulusSpec = { kind: 'ten-frame', frames: 1, filled: [5] };

function hintTemplate(hints: string[], over: Partial<ItemTemplate> = {}): ItemTemplate {
  return tpl('T.h', 'addsub.facts', 'number-pad', {
    tier: 'pictorial',
    narration: { prompt: 'p.x', hints },
    ...over,
  });
}

describe('buildHints', () => {
  it('three hint keys → levels 1–5 with the template keys at 2, 3, 4', () => {
    const hints = buildHints({
      template: hintTemplate(['h.a', 'h.b', 'h.c']),
      vars: { a: 1 },
      solution: steps(3),
      overlay: OVERLAY,
    });
    expect(hints.map((h) => [h.level, h.kind, h.say])).toEqual([
      [1, 'replay', 'h.replay'],
      [2, 'nudge', 'h.a'],
      [3, 'representation', 'h.b'],
      [4, 'worked-step', 'h.c'],
      [5, 'show-me', 'h.show-me'],
    ]);
    for (const h of hints) expect(h.vars).toEqual({ a: 1 });
    expect(hints[0]?.actions).toEqual([{ op: 'replay-prompt' }]);
    expect(hints[2]?.overlay).toEqual(OVERLAY);
    expect(hints[3]?.actions).toEqual([{ op: 'hop', args: { i: 0 } }]);
    expect(hints[4]?.actions).toEqual(steps(3).map((s) => s.action));
  });

  it.each([
    [['h.a'], [1, 2, 5]],
    [
      ['h.a', 'h.b'],
      [1, 2, 3, 5],
    ],
    [
      ['h.a', 'h.b', 'h.c'],
      [1, 2, 3, 4, 5],
    ],
  ])('hint keys %j → levels %j (skipped levels keep their numbers)', (keys, levels) => {
    const hints = buildHints({ template: hintTemplate(keys), vars: {}, solution: steps(2) });
    expect(hints.map((h) => h.level)).toEqual(levels);
  });

  it('dot-flash re-flashes at level 1', () => {
    const hints = buildHints({
      template: hintTemplate(['h.a'], { format: 'dot-flash' }),
      vars: {},
      solution: [],
    });
    expect(hints[0]?.actions).toEqual([{ op: 'replay-prompt' }, { op: 'flash' }]);
  });

  it('level 3 shows the overlay for pictorial and abstract items only', () => {
    for (const tier of ['pictorial', 'abstract'] as const) {
      const h3 = buildHints({
        template: hintTemplate(['h.a', 'h.b'], { tier }),
        vars: {},
        solution: steps(2),
        overlay: OVERLAY,
        highlight: [{ op: 'highlight' }],
      }).find((h) => h.level === 3);
      expect(h3?.overlay).toEqual(OVERLAY);
      expect(h3).not.toHaveProperty('actions');
    }
  });

  it('concrete items highlight at level 3 instead of an overlay', () => {
    const h3 = buildHints({
      template: hintTemplate(['h.a', 'h.b'], { tier: 'concrete' }),
      vars: {},
      solution: steps(2),
      overlay: OVERLAY,
      highlight: [{ op: 'highlight', args: { at: 3 } }],
    }).find((h) => h.level === 3);
    expect(h3).not.toHaveProperty('overlay');
    expect(h3?.actions).toEqual([{ op: 'highlight', args: { at: 3 } }]);
  });

  it('level 2 carries nudge actions only when there are some', () => {
    const base = { template: hintTemplate(['h.a']), vars: {}, solution: steps(2) };
    expect(buildHints({ ...base, nudge: [{ op: 'tap', args: { index: 0 } }] })[1]?.actions).toEqual(
      [{ op: 'tap', args: { index: 0 } }],
    );
    expect(buildHints({ ...base, nudge: [] })[1]).not.toHaveProperty('actions');
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 9])(
    'level 4 never includes the last solution step (%s steps)',
    (n) => {
      const sol = steps(n);
      const h4 = buildHints({
        template: hintTemplate(['h.a', 'h.b', 'h.c']),
        vars: {},
        solution: sol,
      }).find((h) => h.level === 4);
      const actions = h4?.actions ?? [];
      expect(actions).not.toContainEqual(sol[n - 1]?.action);
      expect(actions.length).toBeLessThan(Math.max(1, n));
      // A strict prefix of the solution, at least one step once there are two.
      expect(actions).toEqual(sol.slice(0, actions.length).map((s) => s.action));
      if (n >= 2) expect(actions.length).toBeGreaterThanOrEqual(1);
      expect(workedStepActions(sol)).toEqual(actions);
    },
  );

  it('level 4 and 5 skip steps without actions', () => {
    const sol = [step(0, false), step(1), step(2, false), step(3)];
    const hints = buildHints({
      template: hintTemplate(['h.a', 'h.b', 'h.c']),
      vars: {},
      solution: sol,
    });
    expect(hints.find((h) => h.level === 5)?.actions).toEqual([
      { op: 'hop', args: { i: 1 } },
      { op: 'hop', args: { i: 3 } },
    ]);
    expect(hints.find((h) => h.level === 4)?.actions).toEqual([]);
  });

  it('generated items carry the ladder (one hint key → levels 1, 2, 5)', () => {
    const t = tpl('T.flash', 'subitize.flash', 'dot-flash', {
      tier: 'pictorial',
      narration: { prompt: 'p.x', hints: ['h.look'] },
    });
    const item = generateItem(t, 2);
    expect(item.hints.map((h) => h.level)).toEqual([1, 2, 5]);
    expect(item.hints[0]?.actions).toContainEqual({ op: 'flash' });
    const pad = generateItem({ ...t, id: 'T.pad', format: 'number-pad' }, 2);
    expect(pad.hints[0]?.actions).toEqual([{ op: 'replay-prompt' }]);
  });

  it('generated items: level 3 overlay for an abstract number-pad, none for a concrete ten-frame', () => {
    const abstractPad = generateItem(ADD, 4);
    expect(abstractPad.hints.find((h) => h.level === 3)?.overlay).toMatchObject({
      kind: 'ten-frame',
    });
    const frame = tpl('T.frame', 'addsub.facts', 'tenframe-fill', {
      tier: 'concrete',
      params: { a: int(1, 5), b: int(1, 5), op: c('+'), unknown: c('result'), family: c('any') },
    });
    const h3 = generateItem(frame, 4).hints.find((h) => h.level === 3);
    expect(h3).not.toHaveProperty('overlay');
    expect(h3?.actions).toEqual([{ op: 'show-addends' }]);
  });
});

it('registry ids used above exist', () => {
  expect(registry.get('addsub.facts')).toBeDefined();
  expect(registry.get('count.set')).toBe(countSet);
});
