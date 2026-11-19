// 03 §5.7 checkResponse / matches, 03 §7.1 answer-rule ordering and dedupe, and 02 §5.2
// detectProcessMisconceptions.

import type {
  AnswerSpec,
  GeneratedItem,
  InteractionEvent,
  ItemTemplate,
  MisconceptionSpec,
  ResponseValue,
} from '@number-island/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../content/binding';
import { applicableMisconceptions } from '../misconceptions';
import { checkResponse, detectProcessMisconceptions, matches } from './check';
import { type DevEvent, setDevLogger } from './devlog';
import { generateItemFromParams } from './generate';

// ---------- inline content (normalised JSON form, copied from packages/content) ----------

const COUNT_START_NUMBER: MisconceptionSpec = {
  id: 'MC.count-start-number',
  name: 'Counts the starting number when counting on',
  area: 'addsub',
  detect: { kind: 'answer', rule: 'countStartNumber' },
  appliesTo: { generators: ['addsub.facts'] },
  skills: ['ADD.03'],
  remediation: ['CNT.07', 'ADD.03'],
  feedback: 'fb.mc.count-start-number',
  priority: 60,
  parentTip:
    'When counting on from 5 to add 3, say "5" quietly and count "6, 7, 8" on three fingers.',
  examples: [
    {
      params: { a: 5, b: 3, op: '+', unknown: 'result' },
      response: { kind: 'number', value: 7 },
      match: true,
    },
    {
      params: { a: 5, b: 3, op: '+', unknown: 'result' },
      response: { kind: 'number', value: 9 },
      match: false,
    },
  ],
};

const COUNTER_TRACE: InteractionEvent[] = Array.from({ length: 8 }, (_, i) => ({
  t: 'tap' as const,
  target: `counter-${i}`,
  ms: i * 600,
}));

const COUNT_ALL_INSTEAD: MisconceptionSpec = {
  id: 'MC.count-all-instead',
  name: 'Counts both groups from 1 instead of counting on',
  area: 'addsub',
  detect: { kind: 'process', rule: 'countAllInstead' },
  appliesTo: { generators: ['addsub.facts'] },
  skills: ['ADD.03'],
  remediation: ['ADD.03'],
  feedback: 'fb.mc.count-all-instead',
  priority: 40,
  parentTip: 'Hide the first group under a cup, say how many are inside, then count on from there.',
  examples: [
    {
      params: { a: 5, b: 3, op: '+', unknown: 'result' },
      response: { kind: 'number', value: 8 },
      meta: { latencyMs: 9000, trace: COUNTER_TRACE },
      match: true,
    },
    {
      params: { a: 5, b: 3, op: '+', unknown: 'result' },
      response: { kind: 'number', value: 8 },
      meta: { latencyMs: 4000, trace: COUNTER_TRACE.slice(5) },
      match: false,
    },
  ],
};

const OFF_BY_ONE: MisconceptionSpec = {
  id: 'MC.off-by-one-counting',
  name: 'Skips an object or counts one twice',
  area: 'counting',
  detect: { kind: 'process', rule: 'offByOneCounting' },
  appliesTo: { generators: ['count.set'] },
  skills: ['CNT.02', 'CNT.03', 'CNT.06'],
  remediation: ['CNT.02'],
  feedback: 'fb.mc.off-by-one-counting',
  priority: 50,
  parentTip: 'Ask your child to touch each object once and move it aside as they say each number.',
  examples: [],
};

const ADD_PAD: ItemTemplate = {
  id: 'T.ADD.03.pad',
  skillId: 'ADD.03',
  format: 'number-pad',
  tier: 'abstract',
  generator: 'addsub.facts',
  params: {
    a: { kind: 'int', min: 0, max: 10 },
    b: { kind: 'int', min: 0, max: 10 },
    op: { kind: 'const', value: '+' },
    unknown: { kind: 'const', value: 'result' },
    family: { kind: 'const', value: 'any' },
  },
  difficulty: { base: 0, features: {} },
  narration: { prompt: 'p.add.what-is', hints: ['h.add.count-on'] },
};

const ADD_PAD_OTHER_SKILL: ItemTemplate = { ...ADD_PAD, id: 'T.ADD.01.pad', skillId: 'ADD.01' };

const COUNT_TAP: ItemTemplate = {
  id: 'T.CNT.02.tap',
  skillId: 'CNT.02',
  format: 'tap-count',
  tier: 'concrete',
  generator: 'count.set',
  params: { n: { kind: 'int', min: 1, max: 10 }, mode: { kind: 'const', value: 'how-many' } },
  difficulty: { base: -0.6, features: {} },
  narration: { prompt: 'p.count.how-many', hints: ['h.count.touch-each'] },
};

function bind(
  misconceptions: MisconceptionSpec[] = [COUNT_START_NUMBER, COUNT_ALL_INSTEAD, OFF_BY_ONE],
) {
  initContent({
    templates: [ADD_PAD, ADD_PAD_OTHER_SKILL, COUNT_TAP],
    narration: {},
    misconceptions,
  });
}

/** A hand-built item: only the answer (and seed/format) matter to checkResponse. */
function item(answer: AnswerSpec, over: Partial<GeneratedItem> = {}): GeneratedItem {
  return {
    templateId: 'T.none',
    skillId: 'X.01',
    seed: 0,
    format: 'number-pad',
    tier: 'abstract',
    params: {},
    prompt: { narration: 'p.x', vars: {}, text: '' },
    widget: {
      format: 'number-pad',
      stimulus: { kind: 'none' },
      blanks: [{ id: 'x', maxDigits: 2 }],
    },
    answer,
    hints: [],
    difficulty: 0,
    ...over,
  };
}

const fact53 = () => generateItemFromParams(ADD_PAD, { a: 5, b: 3 });

beforeEach(() => {
  resetContent();
  setDevLogger(null);
});
afterEach(() => setDevLogger(null));

// ---------- checkResponse ----------

describe('checkResponse: skip and incompatible kinds', () => {
  it('skip → fb.skip, incorrect, no misconceptions', () => {
    expect(checkResponse(item({ kind: 'number', value: 3 }), { kind: 'skip' })).toEqual({
      correct: false,
      partialCredit: 0,
      misconceptionIds: [],
      feedback: 'fb.skip',
    });
  });

  it.each<[AnswerSpec, ResponseValue]>([
    [
      { kind: 'number', value: 3 },
      { kind: 'choice', id: 'opt-3' },
    ],
    [
      { kind: 'choice', id: 'opt-3' },
      { kind: 'number', value: 3 },
    ],
    [
      { kind: 'numbers', values: [3], ordered: true },
      { kind: 'number', value: 3 },
    ],
    [
      { kind: 'state', checker: 'set.count', target: { count: 3 } },
      { kind: 'number', value: 3 },
    ],
    [
      { kind: 'placement', value: 3, min: 0, max: 10, tolerance: 1 },
      { kind: 'number', value: 3 },
    ],
  ])('%j answered with %j → fb.retry and a dev event', (answer, r) => {
    const events: DevEvent[] = [];
    setDevLogger((e) => events.push(e));
    expect(checkResponse(item(answer), r)).toEqual({
      correct: false,
      partialCredit: 0,
      misconceptionIds: [],
      feedback: 'fb.retry',
    });
    expect(events).toEqual([
      {
        event: 'response.incompatible',
        templateId: 'T.none',
        answerKind: answer.kind,
        responseKind: r.kind,
      },
    ]);
  });
});

describe('matches: number', () => {
  it.each<[AnswerSpec & { kind: 'number' }, number, boolean]>([
    [{ kind: 'number', value: 8 }, 8, true],
    [{ kind: 'number', value: 8 }, 7, false],
    [{ kind: 'number', value: 8 }, 8.000001, false],
    // Both sides are rounded to 6 decimals before comparing.
    [{ kind: 'number', value: 0.3 }, 0.1 + 0.2, true],
    [{ kind: 'number', value: 8 }, 8.0000004, true],
    [{ kind: 'number', value: 2, tolerance: 0.5 }, 2.5, true],
    [{ kind: 'number', value: 2, tolerance: 0.5 }, 1.5, true],
    [{ kind: 'number', value: 2, tolerance: 0.5 }, 2.6, false],
    [{ kind: 'number', value: 2, tolerance: 0.5 }, 2.5000004, true],
  ])('%j vs %s → %s', (answer, value, want) => {
    expect(matches(answer, { kind: 'number', value })).toBe(want);
    expect(checkResponse(item(answer), { kind: 'number', value }).correct).toBe(want);
  });
});

describe('matches: values exactly at the tolerance boundary', () => {
  // Regression (fixed; was: items/check.ts `matches`, number case): rounding r and v to 6 decimals and then subtracting
  // still leaves float noise, so |2.1 − 2| = 0.10000000000000009 > 0.1 rejects a response that is
  // exactly at the tolerance (03 §5.7: |r − v| ≤ tolerance, compared after rounding to 6 decimals).
  it('number: 2.1 vs 2 with tolerance 0.1 is correct', () => {
    expect(
      matches({ kind: 'number', value: 2, tolerance: 0.1 }, { kind: 'number', value: 2.1 }),
    ).toBe(true);
  });

  // Regression (fixed; was: items/check.ts `matches`, placement case): no rounding at all, so |0.4 − 0.3| =
  // 0.10000000000000003 > 0.1 rejects a placement exactly at the tolerance (03 §5.7).
  it('placement: 0.4 vs 0.3 with tolerance 0.1 is correct', () => {
    expect(
      matches(
        { kind: 'placement', value: 0.3, min: 0, max: 1, tolerance: 0.1 },
        { kind: 'placement', value: 0.4 },
      ),
    ).toBe(true);
  });

  it('integer boundaries already work', () => {
    expect(
      matches({ kind: 'number', value: 20, tolerance: 2 }, { kind: 'number', value: 22 }),
    ).toBe(true);
    expect(
      matches(
        { kind: 'placement', value: 50, min: 0, max: 100, tolerance: 2 },
        { kind: 'placement', value: 48 },
      ),
    ).toBe(true);
  });
});

describe('matches: numbers', () => {
  it.each<[string, AnswerSpec, number[], boolean]>([
    ['ordered, same order', { kind: 'numbers', values: [1, 2, 3], ordered: true }, [1, 2, 3], true],
    [
      'ordered, other order',
      { kind: 'numbers', values: [1, 2, 3], ordered: true },
      [3, 2, 1],
      false,
    ],
    [
      'unordered, other order',
      { kind: 'numbers', values: [1, 2, 3], ordered: false },
      [3, 1, 2],
      true,
    ],
    [
      'unordered multiset differs',
      { kind: 'numbers', values: [1, 1, 2], ordered: false },
      [1, 2, 2],
      false,
    ],
    ['length differs', { kind: 'numbers', values: [1, 2], ordered: false }, [1, 2, 2], false],
    ['ordered rounding', { kind: 'numbers', values: [0.3], ordered: true }, [0.1 + 0.2], true],
    [
      'fraction equivalent',
      { kind: 'numbers', values: [1, 2], ordered: true, fraction: { equivalentOk: true } },
      [2, 4],
      true,
    ],
    [
      'fraction equivalent 3/6',
      { kind: 'numbers', values: [1, 2], ordered: true, fraction: { equivalentOk: true } },
      [3, 6],
      true,
    ],
    [
      'fraction not equivalent',
      { kind: 'numbers', values: [1, 2], ordered: true, fraction: { equivalentOk: true } },
      [2, 3],
      false,
    ],
    [
      'fraction with zero denominator',
      { kind: 'numbers', values: [0, 2], ordered: true, fraction: { equivalentOk: true } },
      [0, 0],
      false,
    ],
    [
      'fraction equivalence off: exact only',
      { kind: 'numbers', values: [1, 2], ordered: true, fraction: { equivalentOk: false } },
      [2, 4],
      false,
    ],
  ])('%s', (_label, answer, values, want) => {
    expect(matches(answer, { kind: 'numbers', values })).toBe(want);
    expect(checkResponse(item(answer), { kind: 'numbers', values }).correct).toBe(want);
  });
});

describe('matches: choice, placement, state', () => {
  it('choice compares ids', () => {
    const a: AnswerSpec = { kind: 'choice', id: 'opt-4' };
    expect(checkResponse(item(a), { kind: 'choice', id: 'opt-4' }).correct).toBe(true);
    expect(checkResponse(item(a), { kind: 'choice', id: 'opt-5' }).correct).toBe(false);
  });

  // closeness = 1 − min(1, |r − v| / (0.25 · (max − min))): here the scale is 25.
  it.each([
    [50, true, 1],
    [51, true, 0.96],
    [48, true, 0.92],
    [55, false, 0.8],
    [60, false, 0.6],
    [75, false, 0],
    [100, false, 0],
  ])('placement %s → correct %s, closeness %s', (value, correct, closeness) => {
    const a: AnswerSpec = { kind: 'placement', value: 50, min: 0, max: 100, tolerance: 2 };
    const res = checkResponse(item(a, { format: 'number-line-place' }), {
      kind: 'placement',
      value,
    });
    expect(res.correct).toBe(correct);
    expect(res.closeness).toBeCloseTo(closeness, 10);
  });

  it('non-placement answers carry no closeness', () => {
    expect(
      checkResponse(item({ kind: 'number', value: 1 }), { kind: 'number', value: 1 }),
    ).not.toHaveProperty('closeness');
  });

  it('state answers use the registered checker', () => {
    const a: AnswerSpec = { kind: 'state', checker: 'set.count', target: { count: 3 } };
    expect(checkResponse(item(a), { kind: 'state', value: { count: 3, removed: 0 } }).correct).toBe(
      true,
    );
    expect(checkResponse(item(a), { kind: 'state', value: { count: 4, removed: 0 } }).correct).toBe(
      false,
    );
    const jumps: AnswerSpec = {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 2, target: 5, allowedJumps: [1, 2] },
    };
    // Strategy freedom: any allowed path that lands on the target.
    expect(matches(jumps, { kind: 'state', value: { jumps: [1, 1, 1] } })).toBe(true);
    expect(matches(jumps, { kind: 'state', value: { jumps: [2, 1] } })).toBe(true);
    expect(matches(jumps, { kind: 'state', value: { jumps: [2, 2] } })).toBe(false);
  });

  it('a state answer whose checker is not registered never matches', () => {
    const a: AnswerSpec = { kind: 'state', checker: 'coins.total', target: { total: 25 } };
    expect(matches(a, { kind: 'state', value: { total: 25 } })).toBe(false);
  });
});

describe('checkResponse: feedback keys', () => {
  it.each([
    [0, 'fb.correct.1'],
    [1, 'fb.correct.2'],
    [5, 'fb.correct.6'],
    [6, 'fb.correct.1'],
    [13, 'fb.correct.2'],
    [-1, 'fb.correct.6'],
    [-6, 'fb.correct.1'],
    [-7, 'fb.correct.6'],
  ])('a correct answer with seed %s → %s', (seed, key) => {
    const res = checkResponse(item({ kind: 'number', value: 1 }, { seed }), {
      kind: 'number',
      value: 1,
    });
    expect(res).toEqual({ correct: true, partialCredit: 1, misconceptionIds: [], feedback: key });
  });

  it('a wrong answer with no matching rule → fb.<format>.retry', () => {
    const res = checkResponse(item({ kind: 'choice', id: 'opt-2' }, { format: 'numeral-pick' }), {
      kind: 'choice',
      id: 'opt-3',
    });
    expect(res).toEqual({
      correct: false,
      partialCredit: 0,
      misconceptionIds: [],
      feedback: 'fb.numeral-pick.retry',
    });
  });

  it('a wrong answer that an answer rule predicts → the rule id and its library feedback', () => {
    bind();
    const res = checkResponse(fact53(), { kind: 'number', value: 7 });
    expect(res).toEqual({
      correct: false,
      partialCredit: 0,
      misconceptionIds: ['MC.count-start-number'],
      feedback: 'fb.mc.count-start-number',
    });
  });

  it('a wrong answer the rule does not predict → fb.number-pad.retry', () => {
    bind();
    const res = checkResponse(fact53(), { kind: 'number', value: 9 });
    expect(res.misconceptionIds).toEqual([]);
    expect(res.feedback).toBe('fb.number-pad.retry');
  });

  it('correct answers never carry misconception ids', () => {
    bind();
    const it8 = fact53();
    const res = checkResponse(it8, { kind: 'number', value: 8 });
    expect(res.correct).toBe(true);
    expect(res.misconceptionIds).toEqual([]);
    expect(res.feedback).toBe(`fb.correct.${1 + (it8.seed % 6)}`);
  });

  it('process rules never run inside checkResponse', () => {
    bind([COUNT_ALL_INSTEAD]);
    expect(checkResponse(fact53(), { kind: 'number', value: 7 }).misconceptionIds).toEqual([]);
  });

  it('rules apply only to the skills they list', () => {
    bind();
    const other = generateItemFromParams(ADD_PAD_OTHER_SKILL, { a: 5, b: 3 });
    expect(checkResponse(other, { kind: 'number', value: 7 }).misconceptionIds).toEqual([]);
  });
});

describe('answer-rule priority and dedupe (03 §7.1)', () => {
  const variant = (id: string, priority: number): MisconceptionSpec => ({
    ...COUNT_START_NUMBER,
    id,
    priority,
    feedback: `fb.mc.${id.slice(3)}`,
  });

  it('applicableMisconceptions sorts by priority (descending), then id', () => {
    const specs = [
      variant('MC.b', 10),
      variant('MC.c', 60),
      variant('MC.a', 10),
      variant('MC.d', 30),
    ];
    bind(specs);
    const ids = applicableMisconceptions(fact53(), ['answer']).map((m) => m.spec.id);
    expect(ids).toEqual(['MC.c', 'MC.d', 'MC.a', 'MC.b']);
  });

  it('applicableMisconceptions filters by detection kind', () => {
    bind();
    const it53 = fact53();
    expect(applicableMisconceptions(it53, ['answer']).map((m) => m.spec.id)).toEqual([
      'MC.count-start-number',
    ]);
    expect(applicableMisconceptions(it53, ['process']).map((m) => m.spec.id)).toEqual([
      'MC.count-all-instead',
    ]);
  });

  it('when two rules predict the same response only the higher-priority id is tagged', () => {
    bind([variant('MC.a-low', 10), variant('MC.z-high', 60)]);
    const res = checkResponse(fact53(), { kind: 'number', value: 7 });
    expect(res.misconceptionIds).toEqual(['MC.z-high']);
    expect(res.feedback).toBe('fb.mc.z-high');
  });

  it('on equal priority the lower id wins the dedupe', () => {
    bind([variant('MC.y', 50), variant('MC.x', 50)]);
    expect(checkResponse(fact53(), { kind: 'number', value: 7 }).misconceptionIds).toEqual([
      'MC.x',
    ]);
  });

  it('specs whose rule is not registered are ignored', () => {
    bind([
      { ...COUNT_START_NUMBER, id: 'MC.unknown', detect: { kind: 'answer', rule: 'noSuchRule' } },
    ]);
    expect(applicableMisconceptions(fact53(), ['answer'])).toEqual([]);
  });

  it('generating from an unbound template does not bind it (02 §5.9 E3): no misconception matching', () => {
    bind();
    const unbound: ItemTemplate = { ...ADD_PAD, id: 'T.ADD.03.unbound' };
    const generated = generateItemFromParams(unbound, { a: 5, b: 3 }, { seed: 4 });
    // The skill and generator would match MC.count-start-number / MC.count-all-instead if bound.
    expect(generated.skillId).toBe('ADD.03');
    expect(checkResponse(generated, { kind: 'number', value: 7 })).toEqual({
      correct: false,
      partialCredit: 0,
      misconceptionIds: [],
      feedback: 'fb.number-pad.retry',
    });
    expect(checkResponse(generated, { kind: 'number', value: 8 })).toEqual({
      correct: true,
      partialCredit: 1,
      misconceptionIds: [],
      feedback: 'fb.correct.5',
    });
    expect(applicableMisconceptions(generated, ['answer', 'state', 'process'])).toEqual([]);
    expect(
      detectProcessMisconceptions(
        generated,
        { kind: 'number', value: 8 },
        { latencyMs: 9000, trace: COUNTER_TRACE },
      ),
    ).toEqual([]);
  });

  it('an item whose template is not bound has no applicable rules', () => {
    bind();
    const loose = { ...fact53(), templateId: 'T.unbound' };
    expect(applicableMisconceptions(loose, ['answer', 'state', 'process'])).toEqual([]);
    expect(checkResponse(loose, { kind: 'number', value: 7 }).misconceptionIds).toEqual([]);
  });
});

describe('detectProcessMisconceptions', () => {
  it('tags a correct 5 + 3 reached by tapping all eight counters (fixture trace)', () => {
    bind();
    const it53 = fact53();
    const r: ResponseValue = { kind: 'number', value: 8 };
    expect(checkResponse(it53, r).correct).toBe(true);
    expect(detectProcessMisconceptions(it53, r, { latencyMs: 9000, trace: COUNTER_TRACE })).toEqual(
      ['MC.count-all-instead'],
    );
  });

  it('does not tag counting on from the second addend', () => {
    bind();
    expect(
      detectProcessMisconceptions(
        fact53(),
        { kind: 'number', value: 8 },
        {
          latencyMs: 4000,
          trace: COUNTER_TRACE.slice(5),
        },
      ),
    ).toEqual([]);
  });

  it('returns [] for a skip', () => {
    bind();
    expect(
      detectProcessMisconceptions(
        fact53(),
        { kind: 'skip' },
        { latencyMs: 1, trace: COUNTER_TRACE },
      ),
    ).toEqual([]);
  });

  it('returns [] without a trace', () => {
    bind();
    expect(
      detectProcessMisconceptions(fact53(), { kind: 'number', value: 8 }, { latencyMs: 9000 }),
    ).toEqual([]);
  });

  it('filters by the generator of the item’s template', () => {
    bind([{ ...COUNT_ALL_INSTEAD, appliesTo: { generators: ['count.set'] } }]);
    expect(
      detectProcessMisconceptions(
        fact53(),
        { kind: 'number', value: 8 },
        { latencyMs: 9000, trace: COUNTER_TRACE },
      ),
    ).toEqual([]);
  });

  it('filters by skill', () => {
    bind();
    const other = generateItemFromParams(ADD_PAD_OTHER_SKILL, { a: 5, b: 3 });
    expect(
      detectProcessMisconceptions(
        other,
        { kind: 'number', value: 8 },
        { latencyMs: 9000, trace: COUNTER_TRACE },
      ),
    ).toEqual([]);
  });

  it('never returns answer rules', () => {
    bind();
    expect(
      detectProcessMisconceptions(fact53(), { kind: 'number', value: 7 }, { latencyMs: 1 }),
    ).toEqual([]);
  });

  it('tags an off-by-one count on a count.set item (fixture trace, 7 objects → 6)', () => {
    bind();
    const seven = generateItemFromParams(COUNT_TAP, { n: 7 });
    const trace: InteractionEvent[] = Array.from({ length: 6 }, (_, i) => ({
      t: 'tap' as const,
      target: `obj-${i}`,
      ms: i * 500,
    }));
    expect(
      detectProcessMisconceptions(seven, { kind: 'number', value: 6 }, { latencyMs: 6000, trace }),
    ).toEqual(['MC.off-by-one-counting']);
    expect(
      detectProcessMisconceptions(seven, { kind: 'number', value: 7 }, { latencyMs: 6000 }),
    ).toEqual([]);
  });
});
