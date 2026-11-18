// Regression tests for the round-1 cross-model review of PR #46 (s_b074f0d1cb46), one block per
// finding, plus authored-lesson replay over the whole fixture.

import type { ItemTemplate, NarrationJson, ParamSpec } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../src/check/state';
import { initContent } from '../src/content/binding';
import { render } from '../src/content/render';
import { formatModel } from '../src/formats';
import { GenerationError } from '../src/generators/types';
import { checkResponse } from '../src/items/check';
import { generateItem, generateItemFromParams } from '../src/items/generate';
import { itemSolution, replaySteps } from '../src/items/solution';
import { numeralsIn, runTemplateProperties } from '../src/testing/properties';
import { compileFixture, fixtureTemplate, loadFixture } from './fixture';

describe('F1: authored lessons replay to a correct demonstration', () => {
  const fixture = compileFixture();
  const cases = fixture.skills.flatMap((s) =>
    s.lesson.mode === 'authored'
      ? s.lesson.worked
          .filter((ex) => ex.params && ex.steps?.every((st) => st.actor === 'demo'))
          .map((ex) => ({ skill: s.id, templateId: ex.templateId ?? s.lesson.templateId, ex }))
      : [],
  );

  it('the fixture has authored worked examples to check', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)('$skill worked example on $templateId', ({ templateId, ex }) => {
    loadFixture();
    const t = fixtureTemplate(templateId);
    const item = generateItemFromParams(t, ex.params ?? {}, { checkConstraints: true });
    const r = replaySteps(item, ex.steps ?? []);
    expect(r).not.toBeNull();
    expect(checkResponse(item, r as NonNullable<typeof r>).correct).toBe(true);
  });

  it('CPS.02: eight counters with three moved to the second frame show 5 and 3', () => {
    loadFixture();
    const item = generateItemFromParams(fixtureTemplate('CPS.02.t1'), {
      whole: 8,
      unknown: 'split',
    });
    expect(item.widget.format === 'tenframe-fill' && item.widget.frames).toBe(2);
    const r = replaySteps(item, [
      {
        actor: 'demo',
        say: 'ls.CPS.02.w1.s1',
        action: { op: 'place', args: { frame: 0, count: 8, color: 'a' } },
      },
      {
        actor: 'demo',
        say: 'ls.CPS.02.w1.s2',
        action: { op: 'move-counters', args: { fromFrame: 0, toFrame: 1, count: 3 } },
      },
    ]);
    expect(
      r?.kind === 'state' && (r.value.cells as number[][]).map((f) => f.filter((x) => x).length),
    ).toEqual([5, 3]);
    expect(checkResponse(item, r as NonNullable<typeof r>).correct).toBe(true);
  });
});

describe('F2: make-set lets a child put removed objects back', () => {
  it('remove all 5 from the boat, then put 1 back → a 1 + 4 split', () => {
    loadFixture();
    const item = generateItemFromParams(fixtureTemplate('CPS.01.t1'), {
      whole: 5,
      unknown: 'split',
    });
    const r = replaySteps(item, [
      {
        actor: 'demo',
        say: 'gen.bond.parts.whole-is',
        action: { op: 'remove', args: { count: 5 } },
      },
      { actor: 'demo', say: 'gen.bond.parts.split', action: { op: 'drag', args: { count: 1 } } },
    ]);
    expect(r).toEqual({ kind: 'state', value: { count: 1, removed: 4, parts: [1, 4] } });
    expect(checkResponse(item, r as NonNullable<typeof r>).correct).toBe(true);
  });

  it('dragging takes from the pile before the supply, and never invents objects', () => {
    const model = formatModel('make-set');
    if (!model) throw new Error('no make-set model');
    let s = model.initialState({
      format: 'make-set',
      target: 3,
      mode: 'make',
      source: { sprite: 'shell', supply: 3 },
      container: 'boat',
      capacity: 10,
      showRunningCount: false,
    });
    s = model.apply(s, { op: 'drag', args: { count: 3 } });
    s = model.apply(s, { op: 'remove', args: { count: 2 } });
    s = model.apply(s, { op: 'drag', args: { count: 5 } }); // only the 2 in the pile remain
    expect(model.toResponse(s)).toEqual({ kind: 'state', value: { count: 3, removed: 0 } });
  });
});

describe('F3: make-ten needs a full first frame', () => {
  const makeTen = stateChecker('tenframe.makeTen');
  it.each([
    ['empty first frame', [[], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]]],
    [
      'short first frame',
      [
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ],
    ],
  ])('%s is rejected', (_label, cells) => {
    expect(makeTen?.check({ total: 10, value: 3 }, { cells, value: 3 })).toBe(false);
  });
  it('a full first frame passes', () => {
    expect(
      makeTen?.check({ total: 10, value: 3 }, { cells: [new Array(10).fill(1)], value: 3 }),
    ).toBe(true);
  });
});

const tpl = (over: Partial<ItemTemplate>): ItemTemplate => ({
  id: 'CNT.01.t9',
  skillId: 'CNT.01',
  format: 'number-pad',
  tier: 'abstract',
  generator: 'count.set',
  params: {},
  difficulty: { base: 0, features: {} },
  narration: { prompt: 'p.count.how-many', hints: ['h.count.touch-each'] },
  ...over,
});

describe('F4: backward hundred-chart fills answer in reading order', () => {
  it('8 back by one: hidden and answer are 5, 6, 7', () => {
    loadFixture();
    const t = tpl({ format: 'hundred-chart', tier: 'pictorial', generator: 'count.sequence' });
    const item = generateItemFromParams(t, { start: 8, step: 1, dir: -1, length: 3 });
    expect(item.widget.format === 'hundred-chart' && item.widget.hidden).toEqual([5, 6, 7]);
    expect(checkResponse(item, { kind: 'numbers', values: [5, 6, 7] }).correct).toBe(true);
    expect(checkResponse(item, { kind: 'numbers', values: [7, 6, 5] }).correct).toBe(false);
    const r = replaySteps(item, itemSolution(item, t));
    expect(r && checkResponse(item, r).correct).toBe(true);
  });
});

describe('F5: zero mode never overwrites the template’s n', () => {
  it('a zero-mode template whose n excludes 0 cannot generate', () => {
    loadFixture();
    const t = tpl({
      params: { mode: { kind: 'const', value: 'zero' }, n: { kind: 'const', value: 5 } },
    });
    expect(() => generateItem(t, 1)).toThrow(GenerationError);
  });
  it('n: 0 in zero mode is an empty set', () => {
    loadFixture();
    const t = tpl({
      params: { mode: { kind: 'const', value: 'zero' }, n: { kind: 'const', value: 0 } },
    });
    const item = generateItem(t, 1);
    expect(item.params.n).toBe(0);
    expect(item.answer).toEqual({ kind: 'number', value: 0 });
  });
});

describe('F6: addsub.facts keeps authored weights', () => {
  it('b: choice [1, 2] weighted 99:1 → about 99% have b = 1', () => {
    loadFixture();
    const b: ParamSpec = { kind: 'choice', values: [1, 2], weights: [99, 1] };
    const t = tpl({
      id: 'ADD.01.t9',
      skillId: 'ADD.01',
      generator: 'addsub.facts',
      params: { a: { kind: 'const', value: 5 }, b },
      narration: { prompt: 'p.add.what-is', hints: ['h.add.join'] },
    });
    let ones = 0;
    for (let seed = 1; seed <= 1000; seed += 1) if (generateItem(t, seed).params.b === 1) ones += 1;
    expect(ones).toBeGreaterThan(960);
  });
});

describe('F7: V17 catches hints that state a set or frame answer', () => {
  it('a make-set hint with the count as a numeral or a slot is reported', () => {
    const fixture = loadFixture();
    const narration: NarrationJson = {
      ...fixture.narration,
      'h.test.literal': { text: 'Put in 8.', clips: [] },
      'h.test.slot': { text: 'Put in {n}.', clips: [] },
    };
    initContent({ ...fixture, narration });
    const t = tpl({
      id: 'CNT.04.t9',
      skillId: 'CNT.04',
      format: 'make-set',
      tier: 'concrete',
      params: { n: { kind: 'const', value: 8 }, mode: { kind: 'const', value: 'make' } },
      narration: { prompt: 'p.count.make-n', hints: ['h.test.literal', 'h.test.slot'] },
    });
    const steps = runTemplateProperties(t, { n: 3, targeting: false }).failures.filter(
      (f) => f.step === '7.hint-reveals',
    );
    expect(steps.some((f) => f.message.includes('h.test.literal'))).toBe(true);
    expect(steps.some((f) => f.message.includes('h.test.slot'))).toBe(true);
  });
});

describe('F8: subtraction solutions narrate subtraction', () => {
  it.each(['number-pad', 'numeral-pick', 'number-line-jump', 'tenframe-fill'] as const)(
    '9 − 3 on %s',
    (format) => {
      loadFixture();
      const t = tpl({
        id: 'ADD.03.t9',
        skillId: 'ADD.03',
        format,
        tier: format === 'number-pad' ? 'abstract' : 'pictorial',
        generator: 'addsub.facts',
        narration: { prompt: 'p.add.what-is', hints: ['h.add.join'] },
      });
      const item = generateItemFromParams(t, { a: 9, b: 3, op: '-' });
      const keys = itemSolution(item, t).map((s) => s.say);
      expect(
        keys.some((k) => k === 'gen.addsub.facts.start-at' || k === 'gen.addsub.facts.join'),
      ).toBe(false);
      expect(
        keys.some((k) => k === 'gen.addsub.facts.start-back' || k === 'gen.addsub.facts.take-away'),
      ).toBe(true);
    },
  );
});

// ---------- round 2 (s_9c4efe4dbd5a) ----------

describe('R2-F1: two-frame splits count only valid cell codes', () => {
  const split = stateChecker('bond.split');
  const frames = (code: number) => [
    [...new Array(5).fill(code), ...new Array(5).fill(0)],
    [...new Array(3).fill(code), ...new Array(7).fill(0)],
  ];
  it('a 5 + 3 split coded with 1 is accepted', () => {
    expect(split?.check({ whole: 8, nonZero: true }, { cells: frames(1) })).toBe(true);
  });
  it.each([3, -1, 2.5])('the same split coded with %s is rejected', (code) => {
    expect(split?.check({ whole: 8, nonZero: true }, { cells: frames(code) })).toBe(false);
  });
});

describe('R2-F2: repeated choice values keep each entry’s weight', () => {
  it('5 − b with b: [7, 1, 1, 2] weighted [10000, 1, 99, 10] → about 91% have b = 1', () => {
    loadFixture();
    const t = tpl({
      id: 'ADD.01.t9',
      skillId: 'ADD.01',
      generator: 'addsub.facts',
      params: {
        a: { kind: 'const', value: 5 },
        op: { kind: 'const', value: '-' },
        b: { kind: 'choice', values: [7, 1, 1, 2], weights: [10000, 1, 99, 10] },
      },
      narration: { prompt: 'p.add.what-is', hints: ['h.add.join'] },
    });
    let ones = 0;
    for (let seed = 1; seed <= 1000; seed += 1) if (generateItem(t, seed).params.b === 1) ones += 1;
    // 100 / 110 ≈ 0.909
    expect(ones).toBeGreaterThan(870);
    expect(ones).toBeLessThan(950);
  });
});

describe('R2-F3: V17 catches a hint that gives a complete split', () => {
  it('CPS.02.t1 (whole 8) with “Put 5 on the first frame and 3 on the second.”', () => {
    const fixture = loadFixture();
    // fixtureTemplate() re-binds the stock fixture, so read the template before binding the
    // test narration.
    const base = fixtureTemplate('CPS.02.t1');
    const narration: NarrationJson = {
      ...fixture.narration,
      'h.test.split': { text: 'Put 5 on the first frame and 3 on the second.', clips: [] },
      'h.test.whole': { text: 'There are 8 in all.', clips: [] },
    };
    initContent({ ...fixture, narration });
    const t: ItemTemplate = {
      ...base,
      id: 'CPS.02.t9',
      params: { ...base.params, whole: { kind: 'const', value: 8 } },
      narration: { prompt: base.narration.prompt, hints: ['h.test.split', 'h.test.whole'] },
    };
    const item = generateItem(t, 1);
    // Following the hint is a correct answer…
    const r = replaySteps(item, [
      { actor: 'demo', say: 'h.test.split', action: { op: 'place', args: { frame: 0, count: 5 } } },
      { actor: 'demo', say: 'h.test.split', action: { op: 'place', args: { frame: 1, count: 3 } } },
    ]);
    expect(r && checkResponse(item, r).correct).toBe(true);
    // …so V17 reports it; naming only the whole is not a reveal.
    const reveals = runTemplateProperties(t, { n: 3, targeting: false }).failures.filter(
      (f) => f.step === '7.hint-reveals',
    );
    expect(reveals.some((f) => f.message.includes('h.test.split'))).toBe(true);
    expect(reveals.some((f) => f.message.includes('h.test.whole'))).toBe(false);
  });
});

describe('R3: split hints name no part size (03 §9.4 step 7 authoring rule)', () => {
  // Free splits accept every valid split, and text cannot tell a numeral that sizes a part from
  // one that counts something else, so a split hint may name no numeral from 1 to whole − 1.
  // Counting words are written in letters.
  function revealsFor(whole: number, templateId: string, lines: Record<string, string>) {
    const fixture = loadFixture();
    const base = fixtureTemplate(templateId);
    const narration: NarrationJson = { ...fixture.narration };
    for (const [k, text] of Object.entries(lines)) narration[k] = { text, clips: [] };
    initContent({ ...fixture, narration });
    const t: ItemTemplate = {
      ...base,
      id: `${base.skillId}.t9`,
      params: { ...base.params, whole: { kind: 'const', value: whole } },
      narration: { prompt: base.narration.prompt, hints: Object.keys(lines) },
    };
    return {
      t,
      flagged: (key: string) =>
        runTemplateProperties(t, { n: 2, targeting: false }).failures.some(
          (f) => f.step === '7.hint-reveals' && f.message.includes(key),
        ),
    };
  }

  it('R3-F1: an equal distribution (“Put 4 counters in each frame.”, whole 8) is reported', () => {
    const { t, flagged } = revealsFor(8, 'CPS.02.t1', {
      'h.test.each': 'Put 4 counters in each frame.',
    });
    const item = generateItem(t, 1);
    const r = replaySteps(item, [
      { actor: 'demo', say: 'h.test.each', action: { op: 'place', args: { frame: 0, count: 4 } } },
      { actor: 'demo', say: 'h.test.each', action: { op: 'place', args: { frame: 1, count: 4 } } },
    ]);
    expect(r && checkResponse(item, r).correct).toBe(true);
    expect(flagged('h.test.each')).toBe(true);
  });

  it('counting words in letters pass; numerals that could be parts are reported (R3-F2, by design)', () => {
    const { flagged } = revealsFor(4, 'CPS.01.t2', {
      'h.test.letters': 'Use two hands. Find two ways.',
      'h.test.numerals': 'Use 2 hands. Find 2 ways.',
      'h.test.fingers': 'Put 2 fingers on each hand.',
    });
    expect(flagged('h.test.letters')).toBe(false);
    expect(flagged('h.test.numerals')).toBe(true);
    expect(flagged('h.test.fingers')).toBe(true);
  });
});

// ---------- round 4 (s_975dee5b9b9a) ----------

function hintReveals(t: ItemTemplate, entries: NarrationJson, key: string): boolean {
  const fixture = loadFixture();
  initContent({ ...fixture, narration: { ...fixture.narration, ...entries } });
  return runTemplateProperties(t, { n: 2, targeting: false }).failures.some(
    (f) => f.step === '7.hint-reveals' && f.message.includes(key),
  );
}

describe('R4-F1: V17 checks the spoken form (`say`) too', () => {
  it('a neutral caption with “Put 4 counters in each frame.” spoken is reported (whole 8)', () => {
    loadFixture();
    const base = fixtureTemplate('CPS.02.t1');
    const t: ItemTemplate = {
      ...base,
      id: 'CPS.02.t9',
      params: { ...base.params, whole: { kind: 'const', value: 8 } },
      narration: { prompt: base.narration.prompt, hints: ['h.test.spoken'] },
    };
    const entries: NarrationJson = {
      'h.test.spoken': {
        text: 'Use both frames.',
        say: 'Put 4 counters in each frame.',
        clips: [],
      },
    };
    expect(hintReveals(t, entries, 'h.test.spoken')).toBe(true);
  });
});

describe('R4-F2: a thousands-grouped numeral is one number', () => {
  it('“There are {whole} in all.” with whole 1000 renders 1,000 and is not a part size', () => {
    loadFixture();
    const base = fixtureTemplate('CPS.02.t3'); // number-bond
    const t: ItemTemplate = {
      ...base,
      id: 'CPS.02.t9',
      params: { whole: { kind: 'const', value: 1000 }, unknown: { kind: 'const', value: 'split' } },
      constraints: [],
      narration: { prompt: base.narration.prompt, hints: ['h.test.whole'] },
    };
    const entries: NarrationJson = {
      'h.test.whole': { text: 'There are {whole} in all.', clips: [] },
    };
    expect(hintReveals(t, entries, 'h.test.whole')).toBe(false);
    const item = generateItem(t, 1);
    const h = item.hints.find((x) => x.say === 'h.test.whole');
    expect(h && render(h.say, h.vars ?? {})).toBe('There are 1,000 in all.');
  });

  it('numeralsIn reads grouped numerals whole', () => {
    expect(numeralsIn('There are 1,000 in all, and 12,345 more; 7 left, 2, 3.')).toEqual([
      1000, 12345, 7, 2, 3,
    ]);
  });
});

// ---------- round 5 (s_17583aed040a) ----------

describe('R5: compact comma lists are separate numerals', () => {
  it.each<[string, number[]]>([
    ['Count on: 6,7,8.', [6, 7, 8]],
    ['There are 1,000 in all.', [1000]],
    ['10,20,30', [10, 20, 30]],
    ['1,23', [1, 23]],
    ['1,000,000 and 5', [1000000, 5]],
  ])('numeralsIn(%j)', (text, want) => {
    expect(numeralsIn(text)).toEqual(want);
  });

  it('a hint “Count on: 6,7,8.” on an item whose answer is 8 is reported', () => {
    loadFixture();
    const t = tpl({
      id: 'ADD.03.t9',
      skillId: 'ADD.03',
      generator: 'addsub.facts',
      params: { a: { kind: 'const', value: 5 }, b: { kind: 'const', value: 3 } },
      narration: { prompt: 'p.add.what-is', hints: ['h.test.list'] },
    });
    expect(
      hintReveals(t, { 'h.test.list': { text: 'Count on: 6,7,8.', clips: [] } }, 'h.test.list'),
    ).toBe(true);
  });
});
