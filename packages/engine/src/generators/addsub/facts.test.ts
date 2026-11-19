// addsub.facts K01 (#11): the strategy families (03 §5.6) and their formats. Fixed params → widget,
// answer and a solution that follows the strategy and replays to a correct response; earlier
// steps never enter or name the answer; families and feature values at the extremes.

import type {
  ItemFormat,
  ItemTemplate,
  LessonStep,
  ParamValues,
  ResponseValue,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { addsubFacts, FAMILIES, factParts, factStrategy, inFamily } from './facts';

let nextId = 0;
function tpl(format: ItemFormat, over: Partial<ItemTemplate> = {}): ItemTemplate {
  nextId += 1;
  return {
    id: `T.addsub.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: 'pictorial',
    generator: 'addsub.facts',
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

/** Build, check the widget schema, exampleCorrect, and the solution replay; return the parts. */
function solve(t: ItemTemplate, params: ParamValues) {
  const item = generateItemFromParams(t, params);
  const model = formatModel(t.format);
  const parsed = model?.configSchema.safeParse(item.widget);
  expect(parsed?.success, JSON.stringify(parsed?.error?.issues)).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const steps = itemSolution(item, t);
  const replayed = replaySteps(item, steps) as ResponseValue;
  expect(checkResponse(item, replayed).correct).toBe(true);
  // Every step before the last leaves the item unsolved (the level-4 hint plays them).
  const before = replaySteps(item, steps.slice(0, -1));
  if (before) expect(checkResponse(item, before).correct).toBe(false);
  return { item, steps, ops: steps.map((s) => s.action?.op), says: steps.map((s) => s.say) };
}

/** No step before the last says the answer through a slot. */
function earlyStepsHide(steps: LessonStep[], answer: number) {
  for (const s of steps.slice(0, -1)) {
    expect(Object.values(s.vars ?? {}), `${s.say} ${JSON.stringify(s.vars)}`).not.toContain(answer);
  }
}

describe('families', () => {
  it.each<[string, number, number, string, boolean]>([
    ['plus1', 6, 1, '+', true],
    ['plus1', 1, 6, '+', true],
    ['plus1', 6, 1, '-', true],
    ['plus1', 6, 2, '-', false],
    ['plus2', 7, 2, '-', true],
    ['doubles', 7, 7, '+', true],
    ['doubles', 7, 7, '-', false],
    ['near-doubles', 6, 7, '+', true],
    ['near-doubles', 6, 8, '+', false],
    ['make-ten', 8, 5, '+', true],
    ['make-ten', 9, 9, '+', true],
    ['make-ten', 6, 4, '+', false], // partners of ten: no bridge
    ['make-ten', 10, 3, '+', false],
    ['make-ten', 9, 1, '+', false],
    ['plus9', 4, 9, '+', true],
    ['ten-plus', 10, 7, '+', true],
    ['ten-plus', 7, 10, '+', true],
    ['teen-minus-ten', 17, 10, '-', true],
    ['teen-minus-ten', 10, 10, '-', false],
    ['back-to-ten', 13, 4, '-', true],
    ['back-to-ten', 14, 4, '-', true],
    ['back-to-ten', 14, 3, '-', false],
    ['count-up', 13, 8, '-', true],
    ['count-up', 15, 7, '-', false], // 8 up is longer than 7 back
    ['count-up', 9, 3, '+', true],
    ['think-add', 13, 5, '-', true],
    ['think-add', 13, 5, '+', false],
  ])('%s: %i %s… (%i, op %s) → %s', (family, a, b, op, want) => {
    expect(inFamily(family, a, b, op)).toBe(want);
  });

  it('count-up is counting on for addition and counting up for subtraction', () => {
    expect(factStrategy('count-up', '+')).toBe('count');
    expect(factStrategy('count-up', '-')).toBe('count-up');
    expect(factStrategy('any', '-')).toBe('count');
  });

  it('make-ten parts: a is made ten, b gives and keeps', () => {
    expect(factParts({ a: 8, b: 5, op: '+', family: 'make-ten' })).toMatchObject({
      give: 2,
      keep: 3,
      result: 13,
      strategy: 'make-ten',
    });
  });
});

describe('make-ten (ADD.08)', () => {
  const p = { a: 8, b: 5, op: '+', family: 'make-ten' };

  it('tenframe-fill: both addends shown, move counters to fill frame 0, then the total', () => {
    const t = tpl('tenframe-fill', { tier: 'concrete', representation: 'double-ten-frame' });
    const { item, ops, steps } = solve(t, p);
    expect(item.widget).toMatchObject({
      frames: 2,
      goal: 'make-ten',
      thenAsk: 'total',
      prefilled: [
        { frame: 0, color: 'a', count: 8 },
        { frame: 1, color: 'b', count: 5 },
      ],
    });
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'tenframe.makeTen',
      target: { total: 13, value: 13 },
    });
    expect(ops).toEqual(['show-addends', 'move-counters', 'count-total']);
    expect(steps[1]?.action?.args).toEqual({ fromFrame: 1, toFrame: 0, count: 2 });
    earlyStepsHide(steps, 13);
  });

  it('rekenrek: a on top, b below, slide beads up to fill the top row', () => {
    const t = tpl('rekenrek', { tier: 'concrete' });
    const { item, steps } = solve(t, p);
    expect(item.widget).toMatchObject({
      preset: [8, 5],
      mode: 'make-ten',
      rowRule: 'fill-top-first',
      thenAsk: 'total',
    });
    expect(steps.map((s) => s.action?.args)).toEqual([
      { row: 1, count: -2 },
      { row: 0, count: 2 },
      undefined,
    ]);
    earlyStepsHide(steps, 13);
  });

  it('open number line: free jumps, jump to ten, then the rest', () => {
    const t = tpl('number-line-jump', { representation: 'open-number-line' });
    const { item, steps } = solve(t, p);
    expect(item.widget).toMatchObject({
      path: 'open',
      ticksEvery: null,
      labelsEvery: null,
      allowedJumps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(steps.map((s) => s.action)).toEqual([
      { op: 'bridge-to', args: { at: 10 } },
      { op: 'hop', args: { by: 3 } },
      { op: 'label-landing' },
    ]);
    earlyStepsHide(steps, 13);
  });

  it('number-pad with a number bond: b split into give and keep', () => {
    const t = tpl('number-pad', { representation: 'number-bond' });
    const { item, says, steps } = solve(t, p);
    expect(item.widget.format === 'number-pad' && item.widget.stimulus).toEqual({
      kind: 'number-bond',
      whole: 5,
      parts: [2, 3],
    });
    expect(says).toEqual([
      'gen.addsub.facts.make-ten.need',
      'gen.addsub.facts.make-ten.split',
      'gen.addsub.facts.ten-and',
    ]);
    earlyStepsHide(steps, 13);
  });

  it('abstract: makes ten from the bigger addend (5 + 8: 8 needs 2)', () => {
    const { steps } = solve(tpl('number-pad', { tier: 'abstract' }), { ...p, a: 5, b: 8 });
    expect(steps[0]?.vars).toEqual({ a: 8, give: 2 });
    expect(steps[1]?.vars).toEqual({ b: 5, give: 2, keep: 3 });
  });
});

describe('the other strategy families', () => {
  it('doubles on two frames: the second addend in its own frame', () => {
    const t = tpl('tenframe-fill', { tier: 'concrete', representation: 'double-ten-frame' });
    const { item, steps, says } = solve(t, { a: 3, b: 3, op: '+', family: 'doubles' });
    expect(item.widget).toMatchObject({ frames: 2, goal: 'add' });
    expect(says[0]).toBe('gen.addsub.facts.double');
    expect(steps[1]?.action).toEqual({
      op: 'place',
      args: { frame: 1, count: 3, color: 'b' },
    });
  });

  it('doubles on dot-flash: two groups of dots, then the total', () => {
    const t = tpl('dot-flash');
    const { item, ops } = solve(t, { a: 6, b: 6, op: '+', family: 'doubles' });
    expect(item.widget).toMatchObject({
      stimulus: { kind: 'dots', arrangement: 'groups', groups: [6, 6] },
      flashMs: 1000,
      input: 'pad',
    });
    expect(item.answer).toEqual({ kind: 'number', value: 12 });
    expect(ops).toEqual(['show', 'answer']);
  });

  it('near doubles: the double of the smaller, then one more', () => {
    const t = tpl('number-pad', { representation: 'dots' });
    const { item, steps } = solve(t, { a: 7, b: 6, op: '+', family: 'near-doubles' });
    expect(item.widget.format === 'number-pad' && item.widget.stimulus).toEqual({
      kind: 'dots',
      arrangement: 'groups',
      groups: [7, 6],
    });
    expect(steps[0]).toMatchObject({
      say: 'gen.addsub.facts.near-double',
      vars: { small: 6, double: 12 },
    });
  });

  it('plus9 on the rekenrek: a full ten on top, then one bead back', () => {
    const t = tpl('rekenrek', { tier: 'concrete' });
    const { item, steps } = solve(t, { a: 6, b: 9, op: '+', family: 'plus9' });
    expect(item.widget).toMatchObject({ preset: [0, 6], mode: 'add', rowRule: 'any' });
    expect(steps.map((s) => s.action)).toEqual([
      { op: 'slide', args: { row: 0, count: 10 } },
      { op: 'slide', args: { row: 0, count: -1 } },
      { op: 'count-total' },
    ]);
    earlyStepsHide(steps, 15);
  });

  it('plus9 picture: nine in one frame, the other addend in the next', () => {
    const t = tpl('number-pad', { representation: 'double-ten-frame' });
    const { item } = solve(t, { a: 4, b: 9, op: '+', family: 'plus9' });
    expect(item.widget.format === 'number-pad' && item.widget.stimulus).toMatchObject({
      kind: 'ten-frame',
      frames: 2,
      filled: [4, 9],
    });
  });

  it('ten-plus on frames: a full ten, then the ones beside it', () => {
    const t = tpl('tenframe-fill', { tier: 'concrete', representation: 'double-ten-frame' });
    const { says, steps } = solve(t, { a: 10, b: 7, op: '+', family: 'ten-plus' });
    expect(says).toEqual([
      'gen.addsub.facts.full-ten',
      'gen.addsub.facts.put-more',
      'gen.addsub.facts.answer',
    ]);
    expect(steps[1]?.action?.args).toEqual({ frame: 1, count: 7, color: 'b' });
  });

  it('teen minus ten on frames: take the full ten away', () => {
    const t = tpl('tenframe-fill', { tier: 'concrete', representation: 'double-ten-frame' });
    const { item, steps } = solve(t, { a: 17, b: 10, op: '-', family: 'teen-minus-ten' });
    expect(item.answer).toMatchObject({ target: { n: 7, value: 7 } });
    expect(steps[1]?.action).toEqual({ op: 'remove', args: { frame: 0, count: 10 } });
    earlyStepsHide(steps, 7);
  });

  it('teen minus ten on base-ten pieces shows the teen number', () => {
    const t = tpl('number-pad', { representation: 'base-ten' });
    const { item } = solve(t, { a: 17, b: 10, op: '-', family: 'teen-minus-ten' });
    expect(item.widget.format === 'number-pad' && item.widget.stimulus).toEqual({
      kind: 'base-ten',
      hundreds: 0,
      tens: 1,
      ones: 7,
    });
  });

  it('back to ten on frames: the ones first, then the rest from the ten', () => {
    const t = tpl('tenframe-fill', { tier: 'concrete', representation: 'double-ten-frame' });
    const { steps } = solve(t, { a: 13, b: 4, op: '-', family: 'back-to-ten' });
    expect(steps.slice(1, 3)).toMatchObject([
      { say: 'gen.addsub.facts.back-to-ten', vars: { ones: 3 } },
      { say: 'gen.addsub.facts.back-rest', vars: { rest: 1 } },
    ]);
    expect(steps.slice(1, 3).map((s) => s.action?.args)).toEqual([
      { frame: 1, count: 3 },
      { frame: 0, count: 1 },
    ]);
    earlyStepsHide(steps, 9);
  });

  it('back to ten on the open line: jump back to ten, then the rest', () => {
    const t = tpl('number-line-jump', { representation: 'open-number-line' });
    const { item, steps } = solve(t, { a: 13, b: 4, op: '-', family: 'back-to-ten' });
    expect(item.widget).toMatchObject({
      goal: 'subtract',
      allowedJumps: [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10],
    });
    expect(steps.map((s) => s.action)).toEqual([
      { op: 'bridge-to', args: { at: 10 } },
      { op: 'hop', args: { by: -1 } },
      { op: 'label-landing' },
    ]);
  });

  it('count up through ten on the open line: 8 → 10 → 13, the total jump asked', () => {
    const t = tpl('number-line-jump', { representation: 'open-number-line' });
    const { item, steps } = solve(t, { a: 13, b: 8, op: '-', family: 'count-up' });
    expect(item.widget).toMatchObject({
      goal: 'difference',
      start: 8,
      target: 13,
      thenAsk: 'total-jump',
    });
    expect(item.answer).toMatchObject({ target: { start: 8, target: 13, value: 5 } });
    expect(steps.map((s) => s.action)).toEqual([
      { op: 'bridge-to', args: { at: 10 } },
      { op: 'bridge-to', args: { at: 13 } },
      { op: 'label-landing' },
    ]);
    earlyStepsHide(steps, 5);
  });

  it('count up on stones: hops of one from b to a', () => {
    const t = tpl('number-line-jump', { tier: 'concrete', representation: 'number-path' });
    const { item, ops } = solve(t, { a: 9, b: 7, op: '-', family: 'count-up' });
    expect(item.widget).toMatchObject({ path: 'stones', allowedJumps: [1], goal: 'difference' });
    expect(ops).toEqual(['highlight', 'hop', 'hop', 'label-landing']);
  });

  it('think addition on a number bond: whole a, part b, the other part asked', () => {
    const t = tpl('number-bond');
    const { item, says } = solve(t, { a: 13, b: 5, op: '-', family: 'think-add' });
    expect(item.widget).toMatchObject({ whole: 13, parts: [5, null], mode: 'missing-part' });
    expect(item.answer).toEqual({ kind: 'number', value: 8 });
    expect(says[0]).toBe('gen.addsub.facts.think-add');
  });

  it('a number bond for an addition asks for the whole', () => {
    const { item } = solve(tpl('number-bond'), { a: 6, b: 3, op: '+' });
    expect(item.widget).toMatchObject({ whole: null, parts: [6, 3], mode: 'missing-whole' });
  });

  it('a bar model for subtraction shows the whole and the known part', () => {
    const t = tpl('number-pad', { representation: 'bar-model' });
    const { item } = solve(t, { a: 12, b: 5, op: '-', family: 'think-add' });
    expect(item.widget.format === 'number-pad' && item.widget.stimulus).toEqual({
      kind: 'bar-model',
      parts: [5, '?'],
      whole: 12,
    });
  });

  it('a change unknown never names the answer before typing it (5 + ? = 13)', () => {
    const { steps } = solve(tpl('number-pad', { tier: 'abstract' }), {
      a: 5,
      b: 8,
      op: '+',
      unknown: 'change',
    });
    expect(steps[0]).toMatchObject({ say: 'gen.addsub.facts.up-to', vars: { a: 5, n: 13 } });
    earlyStepsHide(steps, 8);
  });

  it('free jumps on a ticked line keep hops of one in the solution (ADD.27)', () => {
    const t = tpl('number-line-jump');
    const { item, ops } = solve(t, { a: 8, b: 3, op: '+', jumps: 'free' });
    expect(item.widget).toMatchObject({
      path: 'line',
      allowedJumps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(ops).toEqual(['highlight', 'hop', 'hop', 'hop', 'label-landing']);
  });

  // Regression (PR #80 review): the hop-by-one demo said "Now 11" on the last hop of 8 + 3, before
  // the final step. Each landing but the last is named; the last hop is silent.
  it.each<[string, ParamValues, number[], number]>([
    ['8 + 3', { a: 8, b: 3, op: '+' }, [9, 10], 11],
    ['9 − 3', { a: 9, b: 3, op: '-' }, [8, 7], 6],
    ['5 + 1, a single hop', { a: 5, b: 1, op: '+' }, [], 6],
  ])('hops of one name the landings before the last: %s', (_label, params, named, answer) => {
    const t = tpl('number-line-jump', { tier: 'concrete', representation: 'number-path' });
    const { steps, ops, says } = solve(t, params);
    const b = params.b as number;
    expect(ops).toEqual(['highlight', ...new Array<string>(b).fill('hop'), 'label-landing']);
    expect(
      steps.filter((s) => s.say === 'gen.addsub.facts.count-on').map((s) => s.vars?.n),
    ).toEqual(named);
    expect(says.at(-2)).toBe('gen.addsub.facts.last-hop');
    expect(steps.at(-1)).toMatchObject({ say: 'gen.addsub.facts.answer', vars: { n: answer } });
    earlyStepsHide(steps, answer);
  });
});

describe('validity per format', () => {
  it.each<[string, ItemFormat, ParamValues]>([
    ['rekenrek subtraction', 'rekenrek', { a: 9, b: 3, op: '-' }],
    // Regression (PR #80 review): plus9 puts the other addend on a row of its own: 11 beads.
    ['plus9 rekenrek 9 + 11', 'rekenrek', { a: 9, b: 11, op: '+', family: 'plus9' }],
    ['dot-flash subtraction', 'dot-flash', { a: 9, b: 3, op: '-' }],
    ['dot-flash change unknown', 'dot-flash', { a: 4, b: 4, unknown: 'change' }],
    ['tenframe change unknown', 'tenframe-fill', { a: 4, b: 3, unknown: 'change' }],
    [
      'count up with nothing to jump',
      'number-line-jump',
      { a: 6, b: 6, op: '-', family: 'count-up' },
    ],
  ])('%s is rejected', (_label, format, params) => {
    expect(() => generateItemFromParams(tpl(format), params)).toThrow();
  });

  it('9 + 11 (plus9) is still a fact for the number pad', () => {
    const item = generateItemFromParams(tpl('number-pad', { tier: 'abstract' }), {
      a: 9,
      b: 11,
      family: 'plus9',
    });
    expect(item.answer).toEqual({ kind: 'number', value: 20 });
  });

  it('every rekenrek fact the generator accepts builds a rack the rekenrek model accepts', () => {
    const t = tpl('rekenrek', { tier: 'concrete' });
    const model = formatModel('rekenrek');
    let accepted = 0;
    for (const family of FAMILIES) {
      for (let a = 0; a <= 20; a += 1) {
        for (let b = 0; b <= 20; b += 1) {
          const p: ParamValues = { a, b, op: '+', unknown: 'result', family, maxSum: 20 };
          if (!addsubFacts.accepts?.(p, t)) continue;
          accepted += 1;
          const item = generateItemFromParams(t, p);
          const parsed = model?.configSchema.safeParse(item.widget);
          expect(parsed?.success, `${family} ${a} + ${b}`).toBe(true);
        }
      }
    }
    expect(accepted).toBeGreaterThan(100);
  });
});

describe('feature values depend on the params only', () => {
  it.each<[string, ItemTemplate, ParamValues, Record<string, number>]>([
    [
      'make-ten 9 + 9 on frames: largest size, a bridge, a double',
      tpl('tenframe-fill', { tier: 'concrete', representation: 'double-ten-frame' }),
      { a: 9, b: 9, family: 'make-ten' },
      { size: 2.6, bridge10: 1, double: 1, nine: 1, 'goal.makeTen': 1, twoFrames: 1 },
    ],
    [
      'make-ten 6 + 5 on the rack: a near double, the top-row rule',
      tpl('rekenrek', { tier: 'concrete' }),
      { a: 6, b: 5, family: 'make-ten' },
      { size: 1.2, nearDouble: 1, rowRule: 1, 'n.over10': 1, 'mode.add': 0 },
    ],
    [
      'count up 13 − 8 on the open line: subtraction, a bridge, open path',
      tpl('number-line-jump', { representation: 'open-number-line' }),
      { a: 13, b: 8, op: '-', family: 'count-up' },
      { sub: 1, bridge10: 1, 'path.open': 1, backward: 0, 'jumps.min': 0 },
    ],
    [
      'doubles 1 + 1 flashed: the easiest double',
      tpl('dot-flash'),
      { a: 1, b: 1, family: 'doubles' },
      { size: 0, zeroOrOne: 1, double: 1, groups: 1, 'n.over4': 0 },
    ],
    [
      'ten plus 10 + 9: adding ten, no bridge',
      tpl('number-pad', { tier: 'abstract' }),
      { a: 10, b: 9, family: 'ten-plus' },
      { plusTen: 1, bridge10: 0, nine: 1, size: 2.8 },
    ],
  ])('%s', (_label, t, params, want) => {
    const item = generateItemFromParams(t, params);
    const f = itemFeatures(item, t);
    for (const [k, v] of Object.entries(want)) expect(f[k], k).toBeCloseTo(v, 6);
    // Rebuilt with another seed, the features are the same (04 §2.2: attempt difficulty).
    const again = generateItemFromParams(t, params, { seed: 99 });
    expect(again.difficulty).toBe(item.difficulty);
  });
});
