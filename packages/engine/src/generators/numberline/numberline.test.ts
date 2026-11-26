// 03 §5.6 numberline.place and estimate.quantity: fixed params → answer, widget and solution per
// format, exampleCorrect is correct, solutions replay through the format models that exist
// (numeral-pick, number-pad, number-line-jump, order, dot-flash) and end with the answer, feature
// values at the extremes and as a function of the params only, and validity (accepts).

import {
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
import { generateItem, generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { createRng } from '../../rng';
import { arrowOnPrintedAnswer } from '../../testing/properties';
import { registry } from '..';
import { ESTIMATE_LADDER, estimateRung } from '../estimate/quantity';
import { GenerationError } from '../types';
import { lineFeatures, niceTick, placementAnswer } from './line';
import { benchmarkPair, readingDistractors } from './place';

let nextId = 0;
function tpl(
  generator: 'numberline.place' | 'estimate.quantity',
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.${generator}.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: 'pictorial',
    generator,
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

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);

function checkItem(t: ItemTemplate, item: GeneratedItem): void {
  expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
  const model = formatModel(item.widget.format);
  if (model) expect(model.configSchema.safeParse(item.widget).success).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const steps = itemSolution(item, t);
  expect(steps.length).toBeGreaterThanOrEqual(2);
  if (model) {
    const r = replaySteps(item, steps);
    expect(r).not.toBeNull();
    expect(checkResponse(item, r as never).correct).toBe(true);
  } else {
    expect(['answer', 'drop']).toContain(steps[steps.length - 1]?.action?.op);
  }
  for (const s of steps.slice(0, -1)) {
    expect(['answer', 'drop', 'tap', 'type']).not.toContain(s.action?.op);
  }
}

function featuresStable(t: ItemTemplate, item: GeneratedItem): void {
  const g = registry.get(t.generator);
  const again = g?.build({ params: item.params, template: t, rng: createRng(4242).fork('y') });
  expect(again?.features).toEqual(itemFeatures(item, t));
}

/** A 0–100 line with a tick and a label every 10. */
const TENS = { max: 100, ticksEvery: 10, labelsEvery: 10 };

const line = (over: ParamValues = {}): ParamValues => ({
  min: 0,
  max: 20,
  ticksEvery: 1,
  labelsEvery: 5,
  mode: 'place',
  benchmarks: 0,
  ...over,
});

describe('number-line helpers', () => {
  it('nice ticks, benchmark pairs and reading distractors', () => {
    expect([niceTick(10), niceTick(20), niceTick(100), niceTick(1000)]).toEqual([1, 1, 10, 100]);
    expect(benchmarkPair(0, 37, 10)).toEqual([30, 40]);
    // On a tick: one and two ticks away. Ends only: a quarter and a half of the line away.
    expect(readingDistractors({ min: 0, max: 20, ticksEvery: 1, labelsEvery: 5 }, 12)).toEqual([
      13, 11,
    ]);
    expect(
      readingDistractors({ min: 0, max: 100, ticksEvery: null, labelsEvery: null }, 5),
    ).toEqual([30, 55]);
  });

  it('line features are 0 for a labelled target on a 0–10 line with ticks', () => {
    const easy = { min: 0, max: 10, ticksEvery: 1, labelsEvery: 1 };
    expect(lineFeatures(easy, 2)).toEqual({
      range: 0,
      'ticks.hidden': 0,
      'target.offLabel': 0,
      'target.nearMiddle': 0,
      negative: 0,
    });
    const hard = { min: -50, max: 950, ticksEvery: null, labelsEvery: null };
    expect(lineFeatures(hard, 437)).toEqual({
      range: 2,
      'ticks.hidden': 1,
      'target.offLabel': 1,
      'target.nearMiddle': 1,
      negative: 1,
    });
  });
});

describe('numberline.place', () => {
  it('number-line-place, place: half a tick on a tick, else 5% of the line', () => {
    const t = tpl('numberline.place', 'number-line-place', { representation: 'number-path' });
    const item = make(t, line({ target: 13 }));
    expect(item.widget).toMatchObject({
      format: 'number-line-place',
      min: 0,
      max: 20,
      ticksEvery: 1,
      labelsEvery: 5,
      target: 13,
      mode: 'place',
      snap: 'tick',
      vertical: false,
      valueScale: 1,
    });
    expect(item.answer).toEqual({ kind: 'placement', value: 13, min: 0, max: 20, tolerance: 0.5 });
    expect(itemSolution(item, t).map((s) => s.say)).toEqual([
      'gen.numberline.place.ends',
      'gen.numberline.place.from',
      'gen.numberline.place.drop',
    ]);
    expect(itemSolution(item, t)[1]?.vars).toEqual({ at: 10 });
    checkItem(t, item);

    const bare = make(t, line({ max: 100, target: 37, ticksEvery: 0, labelsEvery: 0 }));
    expect(bare.widget).toMatchObject({ ticksEvery: null, labelsEvery: null, snap: 'none' });
    expect(bare.answer).toMatchObject({ value: 37, tolerance: 5 });
    expect(itemSolution(bare, t)[1]).toMatchObject({
      say: 'gen.numberline.place.middle',
      vars: { mid: 50 },
    });
    expect(itemFeatures(bare, t)).toMatchObject({
      range: 1,
      'ticks.hidden': 1,
      'target.offLabel': 1,
      'target.nearMiddle': 1,
    });
    checkItem(t, bare);
    // Ticks every 10 and a target between them: estimation tolerance.
    const tens = make(t, line({ max: 100, target: 43, ticksEvery: 10, labelsEvery: 10 }));
    expect(tens.widget).toMatchObject({ snap: 'none' });
    if (tens.widget.format !== 'number-line-place') throw new Error('nlp');
    expect(placementAnswer(tens.widget)).toMatchObject({ tolerance: 5 });
  });

  it('number-line-place, read and closer', () => {
    const t = tpl('numberline.place', 'number-line-place');
    const read = make(t, line({ mode: 'read', target: 7 }));
    expect(read.answer).toEqual({ kind: 'number', value: 7 });
    expect(itemFeatures(read, t)).toMatchObject({ 'mode.read': 1 });
    checkItem(t, read);
    const closer = make(t, line({ ...TENS, mode: 'closer', target: 37, benchmarks: 10 }));
    expect(closer.widget).toMatchObject({ mode: 'closer', benchmarks: [30, 40] });
    expect(closer.answer).toEqual({ kind: 'choice', id: 'b1' });
    const near = make(t, line({ ...TENS, mode: 'closer', target: 32, benchmarks: 10 }));
    expect(near.answer).toEqual({ kind: 'choice', id: 'b0' });
    checkItem(t, closer);
    // Halfway has no closer benchmark; a benchmark itself is not "between".
    expect(() => make(t, line({ ...TENS, mode: 'closer', target: 35, benchmarks: 10 }))).toThrow(
      GenerationError,
    );
    expect(() => make(t, line({ ...TENS, mode: 'closer', target: 40, benchmarks: 10 }))).toThrow(
      GenerationError,
    );
  });

  it('numeral-pick: read the arrow, or (symbols) pick the arrow for a numeral', () => {
    const t = tpl('numberline.place', 'numeral-pick', { representation: 'number-line' });
    const read = make(t, line({ max: 100, ticksEvery: 0, labelsEvery: 0, target: 70 }));
    expect(read.answer).toEqual({ kind: 'choice', id: 'opt-70' });
    expect(read.widget).toMatchObject({
      stimulus: { kind: 'number-line', marks: [{ at: 70, arrow: true }] },
    });
    if (read.widget.format !== 'numeral-pick') throw new Error('pick');
    expect(read.widget.options.map((o) => o.id).sort()).toEqual(['opt-45', 'opt-70', 'opt-95']);
    checkItem(t, read);
    featuresStable(t, read);
    const st = tpl('numberline.place', 'numeral-pick', {
      tier: 'abstract',
      representation: 'symbols',
    });
    const pick = make(st, line({ max: 100, ticksEvery: 0, labelsEvery: 0, target: 30 }));
    expect(pick.widget).toMatchObject({
      stimulus: { kind: 'expression', expr: { tokens: [{ t: 'num', v: 30 }] } },
    });
    if (pick.widget.format !== 'numeral-pick') throw new Error('pick');
    expect(pick.widget.options.every((o) => o.stimulus?.kind === 'number-line' && !o.label)).toBe(
      true,
    );
    checkItem(st, pick);
  });

  it('number-pad: type the number at the arrow (on a tick only)', () => {
    const t = tpl('numberline.place', 'number-pad');
    const item = make(t, line({ target: 14 }));
    expect(item.answer).toEqual({ kind: 'number', value: 14 });
    checkItem(t, item);
    expect(() => make(t, line({ max: 100, ticksEvery: 10, labelsEvery: 10, target: 14 }))).toThrow(
      GenerationError,
    );
  });

  it('number-pad on a bare line (CMP.09.t3): an estimate within 10% of the line is right', () => {
    const t = tpl('numberline.place', 'number-pad', { representation: 'number-line' });
    const item = make(t, line({ max: 100, ticksEvery: 0, labelsEvery: 0, target: 37 }));
    expect(item.answer).toEqual({ kind: 'number', value: 37, tolerance: 10 });
    // The picture labels 0 and 100 and nothing between (NumberLineView labels multiples of
    // labelsEvery; null drew no numerals at all, so the scale could not be read).
    expect(item.widget).toMatchObject({
      stimulus: {
        kind: 'number-line',
        ticksEvery: null,
        labelsEvery: 100,
        marks: [{ at: 37, arrow: true }],
      },
    });
    expect(checkResponse(item, { kind: 'number', value: 45 }).correct).toBe(true);
    expect(checkResponse(item, { kind: 'number', value: 50 }).correct).toBe(false);
    // Targets within the tolerance of an end would accept answers off the line (99 accepted 109).
    for (const target of [1, 9, 91, 99]) {
      expect(() => make(t, line({ max: 100, ticksEvery: 0, labelsEvery: 0, target }))).toThrow(
        GenerationError,
      );
    }
    for (const target of [10, 90]) {
      expect(make(t, line({ max: 100, ticksEvery: 0, labelsEvery: 0, target })).answer).toEqual({
        kind: 'number',
        value: target,
        tolerance: 10,
      });
    }
    // A bare line whose ends a picture cannot label (min not a multiple of the range) is rejected.
    expect(() =>
      make(t, line({ min: 5, max: 105, ticksEvery: 0, labelsEvery: 0, target: 50 })),
    ).toThrow(GenerationError);
    expect(itemSolution(item, t).map((x) => x.say)).toEqual([
      'gen.numberline.place.ends',
      'gen.numberline.place.middle',
      'gen.numberline.place.reads-about',
    ]);
    checkItem(t, item);
    featuresStable(t, item);
  });

  it('number-line-jump: hop by labels, then ticks', () => {
    const t = tpl('numberline.place', 'number-line-jump');
    const item = make(t, line({ max: 100, ticksEvery: 1, labelsEvery: 10, target: 23 }));
    expect(item.widget).toMatchObject({
      format: 'number-line-jump',
      start: 0,
      target: 23,
      goal: 'land-on',
      allowedJumps: [1, 10],
      path: 'line',
    });
    expect(itemExampleCorrect(item, t)).toEqual({
      kind: 'state',
      value: { jumps: [10, 10, 1, 1, 1] },
    });
    checkItem(t, item);
  });

  it('order: the target and the benchmarks around it, or the two ends', () => {
    const t = tpl('numberline.place', 'order', { representation: 'number-line' });
    const item = make(
      t,
      line({ max: 100, ticksEvery: 10, labelsEvery: 10, target: 47, benchmarks: 10 }),
    );
    expect(item.answer).toEqual({ kind: 'numbers', values: [40, 47, 50], ordered: true });
    checkItem(t, item);
    const ends = make(t, line({ target: 6 }));
    expect(ends.answer).toEqual({ kind: 'numbers', values: [0, 6, 20], ordered: true });
  });

  it('rejects lines that do not fit their ticks and targets on an end', () => {
    const t = tpl('numberline.place', 'number-line-place');
    expect(() => make(t, line({ target: 0 }))).toThrow(GenerationError);
    expect(() => make(t, line({ target: 20 }))).toThrow(GenerationError);
    expect(() => make(t, line({ max: 25, ticksEvery: 2, target: 4 }))).toThrow(GenerationError);
    expect(() => make(t, line({ ticksEvery: 2, labelsEvery: 5, target: 4 }))).toThrow(
      GenerationError,
    );
  });
});

// ---------- estimate.quantity ----------

describe('estimate.quantity', () => {
  it('the ladder: n within 20% of a rung estimates to it; between rungs there is no item', () => {
    expect(ESTIMATE_LADDER).toEqual([20, 50, 100]);
    expect([16, 20, 24].map(estimateRung)).toEqual([20, 20, 20]);
    expect([40, 47, 60].map(estimateRung)).toEqual([50, 50, 50]);
    expect([80, 100, 120].map(estimateRung)).toEqual([100, 100, 100]);
    expect([25, 33, 39, 61, 79].map(estimateRung)).toEqual([null, null, null, null, null]);
  });

  it('numeral-pick: always the ladder; the answer is the rung n is near (review: rank cues, ties)', () => {
    const t = tpl('estimate.quantity', 'numeral-pick', { representation: 'dots' });
    const g = registry.get('estimate.quantity');
    const answers = new Set<number>();
    for (let n = 20; n <= 100; n += 1) {
      const rung = estimateRung(n);
      expect(g?.accepts?.({ n, benchmarks: 0 }, t), `n = ${n}`).toBe(rung !== null);
      if (rung === null) continue;
      for (let seed = 0; seed < 8; seed += 1) {
        const item = generateItemFromParams(t, { n, benchmarks: 0 }, { seed });
        if (item.widget.format !== 'numeral-pick' || item.answer.kind !== 'choice') {
          throw new Error('pick');
        }
        const values = item.widget.options.map((o) => Number(o.id.slice(4)));
        expect([...values].sort((x, y) => x - y)).toEqual([20, 50, 100]);
        expect(item.answer.id).toBe(`opt-${rung}`);
        answers.add(rung);
      }
    }
    expect([...answers].sort((x, y) => x - y)).toEqual([20, 50, 100]);
  });

  it('dot-flash: a flashed group, correct within 25%', () => {
    const t = tpl('estimate.quantity', 'dot-flash', { representation: 'dots' });
    const item = make(t, { n: 60, benchmarks: 0 });
    expect(item.widget).toMatchObject({
      format: 'dot-flash',
      stimulus: { kind: 'dots', arrangement: 'scatter', groups: [60] },
      input: 'pad',
      estimate: { tolerancePct: 25 },
    });
    expect(item.answer).toEqual({ kind: 'number', value: 60, tolerance: 15 });
    expect(checkResponse(item, { kind: 'number', value: 50 }).correct).toBe(true);
    expect(checkResponse(item, { kind: 'number', value: 40 }).correct).toBe(false);
    checkItem(t, item);
    const objects = tpl('estimate.quantity', 'dot-flash', { representation: 'objects' });
    const ref = make(objects, { n: 45, benchmarks: 10 });
    expect(ref.widget).toMatchObject({
      stimulus: { kind: 'objects', set: { count: 45, layout: 'scatter', groups: [10, 35] } },
    });
    expect(itemSolution(ref, objects).map((s) => s.say)).toEqual([
      'gen.estimate.quantity.look',
      'gen.estimate.quantity.reference',
      'gen.estimate.quantity.about',
    ]);
    checkItem(objects, ref);
    featuresStable(objects, ref);
  });

  it('numeral-pick: numerals, or (number-line) lines with an arrow', () => {
    const t = tpl('estimate.quantity', 'numeral-pick', { representation: 'dots' });
    const item = make(t, { n: 47, benchmarks: 0 });
    expect(item.answer).toEqual({ kind: 'choice', id: 'opt-50' });
    if (item.widget.format !== 'numeral-pick') throw new Error('pick');
    expect(item.widget.options.map((o) => o.id).sort()).toEqual(['opt-100', 'opt-20', 'opt-50']);
    checkItem(t, item);
    const lt = tpl('estimate.quantity', 'numeral-pick', { representation: 'number-line' });
    for (let seed = 0; seed < 8; seed += 1) {
      const lines = generateItemFromParams(lt, { n: 80, benchmarks: 0 }, { seed });
      if (lines.widget.format !== 'numeral-pick') throw new Error('pick');
      // One line for all options (0–100: every option is in the 20–100 domain), its two ends
      // labelled and nothing between.
      expect(
        lines.widget.options.every(
          (o) =>
            o.stimulus?.kind === 'number-line' &&
            o.stimulus.max === 100 &&
            o.stimulus.labelsEvery === 100 &&
            !o.label,
        ),
      ).toBe(true);
      checkItem(lt, lines);
    }
  });

  it('number-pad: the picture stays up; type about how many, within 25%', () => {
    const t = tpl('estimate.quantity', 'number-pad', { representation: 'dots' });
    const item = make(t, { n: 64, benchmarks: 10 });
    expect(item.widget).toMatchObject({
      format: 'number-pad',
      stimulus: { kind: 'objects', set: { count: 64, sprite: 'dot', groups: [10, 54] } },
      blanks: [{ id: 'n', maxDigits: 3 }],
    });
    expect(item.answer).toEqual({ kind: 'number', value: 64, tolerance: 16 });
    expect(checkResponse(item, { kind: 'number', value: 50 }).correct).toBe(true);
    expect(checkResponse(item, { kind: 'number', value: 80 }).correct).toBe(true);
    expect(checkResponse(item, { kind: 'number', value: 40 }).correct).toBe(false);
    expect(itemSolution(item, t).map((s) => s.say)).toEqual([
      'gen.estimate.quantity.look',
      'gen.estimate.quantity.reference',
      'gen.estimate.quantity.about',
    ]);
    checkItem(t, item);
    featuresStable(t, item);
    // The pad is three digits wide for every n, so its size never hints at the answer.
    const small = make(t, { n: 20, benchmarks: 0 });
    expect(small.widget).toMatchObject({ blanks: [{ id: 'n', maxDigits: 3 }] });
    checkItem(t, small);
  });

  it('number-line-place: where n goes on a bare 0–100 or 0–200 line', () => {
    const t = tpl('estimate.quantity', 'number-line-place');
    const item = make(t, { n: 150, benchmarks: 50 });
    expect(item.widget).toMatchObject({
      min: 0,
      max: 200,
      ticksEvery: null,
      labelsEvery: 50,
      target: 150,
      snap: 'none',
    });
    expect(item.answer).toMatchObject({ kind: 'placement', value: 150, tolerance: 10 });
    checkItem(t, item);
  });

  it('n.per50 is 0 for 20, and a reference group is at most half the group', () => {
    const t = tpl('estimate.quantity', 'numeral-pick');
    expect(itemFeatures(make(t, { n: 20, benchmarks: 0 }), t)['n.per50']).toBe(0);
    const pad = tpl('estimate.quantity', 'number-pad');
    expect(itemFeatures(make(pad, { n: 120, benchmarks: 0 }), pad)['n.per50']).toBe(2);
    // 70 is near no rung of the ladder, so numeral-pick never asks for it.
    expect(() => make(t, { n: 70, benchmarks: 0 })).toThrow(GenerationError);
    expect(() => make(t, { n: 30, benchmarks: 20 })).toThrow(GenerationError);
    for (let seed = 1; seed <= 10; seed += 1) {
      const ft = tpl('estimate.quantity', 'dot-flash', {
        representation: 'objects',
        params: { benchmarks: { kind: 'choice', values: [0, 10] } },
      });
      featuresStable(ft, generateItem(ft, seed));
    }
  });
});

describe('a read-the-arrow picture never prints the answer (PR #124 review)', () => {
  const line = { min: 0, max: 1000, ticksEvery: 100, labelsEvery: 500 };
  it('500 on a line labelled every 500 is caught, for the arrow and for "which arrow shows 500?"', () => {
    const pick = tpl('numberline.place', 'numeral-pick');
    expect(arrowOnPrintedAnswer(generateItemFromParams(pick, { ...line, target: 500 }))).toBe(500);
    const which = tpl('numberline.place', 'numeral-pick', {
      tier: 'abstract',
      representation: 'symbols',
    });
    expect(arrowOnPrintedAnswer(generateItemFromParams(which, { ...line, target: 500 }))).toBe(500);
  });
  it('a target between labels passes', () => {
    const pick = tpl('numberline.place', 'numeral-pick');
    expect(arrowOnPrintedAnswer(generateItemFromParams(pick, { ...line, target: 499 }))).toBeNull();
  });
});
