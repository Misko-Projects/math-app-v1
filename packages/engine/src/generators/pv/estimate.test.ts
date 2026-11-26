// pv.estimate (03 §5.6, PV.19): the estimate is the rounded numbers added or taken away; the
// numeral-pick options; validity; the line picture; MC.round-down-always on estimate items.

import type { ItemFormat, ItemTemplate, Representation, Tier } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams } from '../../items/generate';
import { itemSolution, replaySteps } from '../../items/solution';
import { roundDownAlways } from '../../misconceptions/rules/rounding';
import { estimateOptions, estimateParts, pvEstimate, roundedDownEstimate } from './estimate';

let nextId = 0;
const tpl = (format: ItemFormat, tier: Tier, representation: Representation): ItemTemplate =>
  ({
    id: `T.est.${format}.${(nextId += 1)}`,
    skillId: 'X.01',
    format,
    tier,
    representation,
    generator: 'pv.estimate',
    params: {
      a: { kind: 'int', min: 101, max: 899 },
      b: { kind: 'int', min: 101, max: 899 },
      op: { kind: 'choice', values: ['+', '-'] },
      place: { kind: 'const', value: 100 },
    },
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  }) as ItemTemplate;

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

describe('pv.estimate', () => {
  it('rounds each number, then adds or takes away', () => {
    expect(estimateParts({ a: 470, b: 250, op: '+', place: 100 })).toMatchObject({
      ra: 500,
      rb: 300,
      result: 720,
      estimate: 800,
    });
    expect(estimateParts({ a: 612, b: 289, op: '-', place: 100 }).estimate).toBe(300);
    expect(estimateParts({ a: 47, b: 38, op: '+', place: 10 }).estimate).toBe(90);
    expect(roundedDownEstimate({ a: 470, b: 250, op: '+', place: 100 })).toBe(600);
    // Both round down already: cutting down changes nothing.
    expect(roundedDownEstimate({ a: 420, b: 230, op: '+', place: 100 })).toBeNull();
  });

  it('offers three different options with the estimate among them, none below 1', () => {
    const t = tpl('numeral-pick', 'abstract', 'symbols');
    for (let seed = 1; seed <= 200; seed += 1) {
      const item = generateItem(t, seed);
      const values = estimateOptions(item.params);
      expect(new Set(values).size).toBe(3);
      expect(values).toContain(estimateParts(item.params).estimate);
      expect(Math.min(...values)).toBeGreaterThan(0);
      const response = replaySteps(item, itemSolution(item, t));
      expect(response && checkResponse(item, response).correct).toBe(true);
    }
  });

  it('rejects multiples of the place, a − b with a ≤ b or an estimate of 0', () => {
    const t = tpl('number-pad', 'abstract', 'symbols');
    expect(pvEstimate.accepts({ a: 400, b: 230, op: '+', place: 100 }, t)).toBe(false);
    expect(pvEstimate.accepts({ a: 230, b: 410, op: '-', place: 100 }, t)).toBe(false);
    expect(pvEstimate.accepts({ a: 240, b: 210, op: '-', place: 100 }, t)).toBe(false);
    expect(pvEstimate.accepts({ a: 470, b: 250, op: '+', place: 100 }, t)).toBe(true);
  });

  it('the line runs hundred to hundred with both numbers marked at least a hundred apart', () => {
    const t = tpl('number-pad', 'pictorial', 'number-line');
    expect(pvEstimate.accepts({ a: 470, b: 430, op: '+', place: 100 }, t)).toBe(false);
    const item = generateItemFromParams(t, { a: 470, b: 250, op: '+', place: 100 });
    const w = item.widget;
    if (w.format !== 'number-pad' || w.stimulus?.kind !== 'number-line') throw new Error('no line');
    expect([w.stimulus.min, w.stimulus.max, w.stimulus.ticksEvery]).toEqual([200, 500, 100]);
    expect(w.stimulus.marks.map((m) => m.at)).toEqual([470, 250]);
  });

  it('MC.round-down-always reads an estimate item: both numbers cut down', () => {
    const t = tpl('number-pad', 'abstract', 'symbols');
    const item = generateItemFromParams(t, { a: 470, b: 250, op: '+', place: 100 });
    expect(roundDownAlways.match(item, { kind: 'number', value: 600 })).toBe(true);
    expect(roundDownAlways.match(item, { kind: 'number', value: 800 })).toBe(false);
    const down = generateItemFromParams(t, { a: 420, b: 230, op: '+', place: 100 });
    expect(roundDownAlways.predict?.(down)).toBeNull();
  });
});
