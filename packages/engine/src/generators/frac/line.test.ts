// K02 slice 5b (#17): frac.line over its whole range. Every draw a template can make builds a
// valid widget whose example answer checks correct and whose solution replays; lines never label
// a fraction (so never the asked point), keep tapped ticks ≥ 64 px apart at 960 × 600; and the
// five misconception rules never claim a right answer.

import {
  type GeneratedItem,
  type ItemFormat,
  type ItemTemplate,
  type ParamValues,
  type ResponseValue,
  widgetConfigSchema,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { checkResponse, retryFeedback } from '../../items/check';
import { generateItemFromParams } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import {
  fractionLineAtWhole,
  fractionLineTicks,
  fractionLineWhole,
  fractionOverOne,
  fractionWholeCount,
} from '../../misconceptions/rules/fractionLine';
import { fracLine, LINE_DENS } from './line';

const RULES = [
  fractionLineTicks,
  fractionLineWhole,
  fractionLineAtWhole,
  fractionOverOne,
  fractionWholeCount,
];

let nextId = 0;
function tpl(format: ItemFormat, over: Partial<ItemTemplate> = {}): ItemTemplate {
  nextId += 1;
  return {
    id: `T.line.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: 'pictorial',
    generator: 'frac.line',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
    ...over,
  };
}
const owner = new WeakMap<GeneratedItem, ItemTemplate>();
const build = (t: ItemTemplate, params: ParamValues): GeneratedItem => {
  const item = generateItemFromParams(t, params, { seed: 7 });
  owner.set(item, t);
  return item;
};
beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

function roundTrip(item: GeneratedItem) {
  expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
  const right = itemExampleCorrect(item, owner.get(item));
  expect(checkResponse(item, right).correct).toBe(true);
  const steps = itemSolution(item, owner.get(item));
  expect(steps.length).toBeGreaterThan(0);
  const replayed = replaySteps(item, steps);
  if (replayed) expect(checkResponse(item, replayed).correct).toBe(true);
  // No rule claims the right answer, and every prediction is wrong.
  for (const r of RULES) {
    expect(r.match(item, right, { latencyMs: 1000 })).toBe(false);
    const p = r.predict?.(item);
    if (p) expect(checkResponse(item, p as ResponseValue).correct).toBe(false);
  }
}

/** Every (den, max, num) the generator accepts for a template and mode. */
function draws(t: ItemTemplate, base: ParamValues) {
  const out: ParamValues[] = [];
  for (const den of LINE_DENS)
    for (const max of [1, 2, 3])
      for (let num = 1; num <= 3 * den; num += 1) {
        const p = { ...base, den, max, num };
        if (fracLine.accepts?.(p, t)) out.push(p);
      }
  return out;
}

describe('frac.line on fraction-line', () => {
  const line = tpl('fraction-line');
  it.each([
    ['place', 'line'],
    ['place', 'strip'],
    ['place', 'ruler'],
    ['read', 'line'],
    ['read', 'ruler'],
  ] as const)('%s on a %s: every draw', (mode, skin) => {
    const all = draws(line, { mode, skin });
    expect(all.length).toBeGreaterThan(10);
    for (const p of all) {
      const item = build(line, p);
      const w = item.widget;
      if (w.format !== 'fraction-line') throw new Error('format');
      const { num, den, max } = p as { num: number; den: number; max: number };
      expect(w.target).toEqual({ a: num, b: den });
      expect(w.ticksShown).toBe(true);
      // Only wholes are labelled: never a fraction, so never the asked point.
      expect(['ends', 'wholes']).toContain(w.labels);
      if (num % den === 0) {
        expect(w.labels).toBe('ends');
        expect(num).toBeLessThan(den * max);
      }
      // A tapped tick is ≥ 64 px from the next at 960 × 600 (550 px a line): ≤ 8 parts past 1.
      if (max > 1) expect(den * max).toBeLessThanOrEqual(8);
      if (skin === 'ruler') expect(max).toBe(1);
      expect(item.answer).toEqual(
        mode === 'place'
          ? { kind: 'placement', value: num / den, min: 0, max, tolerance: 1 / (2 * den) }
          : { kind: 'numbers', values: [num, den], ordered: true },
      );
      roundTrip(item);
    }
  });

  it('placing: only the last solution step acts, so no demo or hint places the dot first (PR #140)', () => {
    for (const p of draws(line, { mode: 'place', skin: 'strip' })) {
      const item = build(line, p);
      const steps = itemSolution(item, owner.get(item));
      expect(steps.slice(0, -1).every((s) => s.action === undefined)).toBe(true);
      expect(steps.at(-1)?.action).toEqual({ op: 'hop', args: { k: p.num } });
    }
  });

  it('an unexplained wrong answer gets the retry line of what is drawn (PR #140)', () => {
    const at = (skin: string, mode: string) =>
      retryFeedback(build(line, { mode, skin, den: 4, num: 3, max: 1 }));
    expect(at('line', 'place')).toBe('fb.fraction-line.retry-line');
    expect(at('ruler', 'read')).toBe('fb.fraction-line.retry-ruler');
    expect(at('strip', 'place')).toBe('fb.fraction-line.retry');
  });

  it('refuses what does not fit: eighths or sixths past 1, thirds or fourths to 3, a read strip', () => {
    const ok = (p: ParamValues) => fracLine.accepts?.(p, line);
    expect(ok({ mode: 'place', skin: 'line', den: 8, num: 9, max: 2 })).toBe(false);
    expect(ok({ mode: 'place', skin: 'line', den: 6, num: 7, max: 2 })).toBe(false);
    expect(ok({ mode: 'place', skin: 'line', den: 3, num: 7, max: 3 })).toBe(false);
    expect(ok({ mode: 'read', skin: 'strip', den: 4, num: 1, max: 1 })).toBe(false);
    expect(ok({ mode: 'place', skin: 'line', den: 4, num: 8, max: 2 })).toBe(false);
    expect(ok({ mode: 'place', skin: 'line', den: 4, num: 7, max: 2 })).toBe(true);
    expect(ok({ mode: 'place', skin: 'line', den: 2, num: 5, max: 3 })).toBe(true);
  });

  it('the misconceptions predict the classic wrong places', () => {
    const at = (p: ParamValues, value: number) =>
      RULES.filter((r) => r.match(build(line, p), { kind: 'placement', value }, { latencyMs: 1 }))
        .map((r) => r.id)
        .sort();
    const quarter = { mode: 'place', skin: 'line', den: 4, num: 1, max: 1 };
    expect(at(quarter, 0)).toEqual(['fractionLineTicks']);
    expect(at(quarter, 1)).toEqual(['fractionLineAtWhole']);
    const sevenFourths = { mode: 'place', skin: 'line', den: 4, num: 7, max: 2 };
    expect(at(sevenFourths, 0.75)).toEqual(['fractionOverOne']);
    expect(at(sevenFourths, 1.5)).toEqual(['fractionLineTicks']);
    const fourFourths = { mode: 'place', skin: 'strip', den: 4, num: 4, max: 2 };
    expect(at(fourFourths, 2)).toEqual(['fractionLineWhole']);
    const twoHalves = { mode: 'place', skin: 'strip', den: 2, num: 2, max: 3 };
    expect(at(twoHalves, 2)).toEqual(['fractionWholeCount']);
    const read = build(line, { mode: 'read', skin: 'line', den: 4, num: 5, max: 2 });
    expect(
      fractionLineWhole.match(read, { kind: 'numbers', values: [5, 8] }, { latencyMs: 1 }),
    ).toBe(true);
    expect(
      fractionLineTicks.match(read, { kind: 'numbers', values: [5, 5] }, { latencyMs: 1 }),
    ).toBe(true);
    // An equal fraction is wrong and claims nothing (the prompt names the parts).
    const half = build(line, { mode: 'read', skin: 'line', den: 4, num: 2, max: 1 });
    expect(checkResponse(half, { kind: 'numbers', values: [1, 2] }).correct).toBe(false);
    for (const r of RULES)
      expect(r.match(half, { kind: 'numbers', values: [1, 2] }, { latencyMs: 1 })).toBe(false);
  });
});

describe('frac.line on fraction-pick and number-pad', () => {
  it('name: a number line from 0 to 1 in den parts with a dot at num/den, answer [num, den]', () => {
    const pick = tpl('fraction-pick');
    const all = draws(pick, { mode: 'name' });
    expect(all).toHaveLength(LINE_DENS.reduce((s, d) => s + d - 1, 0));
    for (const p of all) {
      const item = build(pick, p);
      const w = item.widget;
      if (w.format !== 'fraction-pick') throw new Error('format');
      const { num, den } = p as { num: number; den: number };
      expect(w.stimulus).toEqual({
        kind: 'number-line',
        min: 0,
        max: 1,
        ticksEvery: 1 / den,
        labelsEvery: 1,
        marks: [{ at: num / den }],
      });
      expect(item.answer).toEqual({ kind: 'numbers', values: [num, den], ordered: true });
      roundTrip(item);
    }
  });

  it('name with words: no picture (the path story)', () => {
    const words = tpl('fraction-pick', { tier: 'abstract', representation: 'symbols' });
    for (const den of LINE_DENS) {
      const item = build(words, { mode: 'name', words: true, den, num: 1, max: 1 });
      const w = item.widget;
      if (w.format !== 'fraction-pick') throw new Error('format');
      expect(w.stimulus).toBeUndefined();
      roundTrip(item);
    }
  });

  it('between: never a whole, between 1 and 3; the two blanks smaller first', () => {
    const pad = tpl('number-pad', { tier: 'abstract', representation: 'symbols' });
    const all = draws(pad, { mode: 'between' }).filter((p) => p.max === 1);
    expect(all.length).toBeGreaterThan(20);
    for (const p of all) {
      const { num, den } = p as { num: number; den: number };
      expect(num % den).not.toBe(0);
      expect(num / den).toBeGreaterThan(1);
      expect(num / den).toBeLessThan(3);
      const item = build(pad, p);
      const lo = Math.floor(num / den);
      expect(item.answer).toEqual({ kind: 'numbers', values: [lo, lo + 1], ordered: true });
      expect(checkResponse(item, { kind: 'numbers', values: [lo + 1, lo] }).correct).toBe(false);
      expect(
        fractionOverOne.match(item, { kind: 'numbers', values: [0, 1] }, { latencyMs: 1 }),
      ).toBe(true);
      roundTrip(item);
    }
  });

  it('wholes: k·den/den = k for k 1–3; answering the top number is four-fourths-is-four', () => {
    const pad = tpl('number-pad', { tier: 'abstract', representation: 'symbols' });
    const all = draws(pad, { mode: 'wholes' }).filter((p) => p.max === 1);
    expect(all).toHaveLength(LINE_DENS.length * 3);
    for (const p of all) {
      const { num, den } = p as { num: number; den: number };
      const item = build(pad, p);
      expect(item.answer).toEqual({ kind: 'number', value: num / den });
      expect(fractionWholeCount.match(item, { kind: 'number', value: num }, { latencyMs: 1 })).toBe(
        true,
      );
      // The pad takes the top number (up to 24) whole, so the misconception can be typed (PR #140).
      const w = item.widget;
      if (w.format !== 'number-pad') throw new Error('format');
      expect(w.blanks[0]?.maxDigits).toBeGreaterThanOrEqual(String(num).length);
      // The first worked step names no fraction: on 4/4 it would be the answer (PR #140).
      const steps = itemSolution(item, owner.get(item));
      expect(steps.slice(0, -1).every((s) => Object.keys(s.vars ?? {}).length === 0)).toBe(true);
      roundTrip(item);
    }
  });
});
