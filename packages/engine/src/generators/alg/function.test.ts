// 03 §5.6 alg.function (ALG.09, K02 slice 4c-2): input–output tables on pattern-extend and the
// rule on number-pad, over the shipped templates' ranges: the table rules (distinct inputs, never in
// order, no column trap, no asked output already in the table), about one doubling lure in three,
// worked solutions that find the rule from one pair and check it on a second, and the four
// misconception rules.

import {
  type GeneratedItem,
  type ItemFormat,
  type ItemTemplate,
  type ParamSpec,
  widgetConfigSchema,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { checkResponse } from '../../items/check';
import { generateItem } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import {
  functionAddForTake,
  functionBackwards,
  functionColumnPattern,
  functionFirstPairDouble,
} from '../../misconceptions/rules/k02SharesMachines';
import { registry } from '../index';
import { columnGuess, functionTable } from './function';

const tpl = (
  id: string,
  format: ItemFormat,
  params: Record<string, ParamSpec | string | number>,
): ItemTemplate =>
  ({
    id,
    skillId: 'X.01',
    format,
    tier: 'abstract',
    generator: 'alg.function',
    // Bare values are constants, as the content compiler reads them from the YAML.
    params: Object.fromEntries(
      Object.entries(params).map(([k, v]) => [
        k,
        typeof v === 'object' ? v : { kind: 'const', value: v },
      ]),
    ),
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  }) as ItemTemplate;

const arrange: ParamSpec = { kind: 'int', min: 0, max: 9999 };
const lure: ParamSpec = { kind: 'choice', values: [1, 0, 0] };
// The shipped templates' params (templates/ALG.yaml).
const T1 = tpl('ALG.09.t1', 'pattern-extend', {
  op: 'add',
  n: { kind: 'int', min: 1, max: 5 },
  max: 20,
  rows: 4,
  blanks: 1,
  lure,
  arrange,
});
const T2 = tpl('ALG.09.t2', 'pattern-extend', {
  op: { kind: 'choice', values: ['add', 'sub'] },
  n: { kind: 'int', min: 2, max: 9 },
  max: 60,
  rows: 4,
  blanks: 2,
  lure,
  arrange,
});
const T3 = tpl('ALG.09.t3', 'number-pad', {
  op: 'add',
  n: { kind: 'int', min: 2, max: 9 },
  max: 40,
  rows: 2,
  blanks: 0,
  lure: 0,
  arrange,
});
const T4 = tpl('ALG.09.t4', 'number-pad', { ...T3.params, op: 'sub' });

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);
const items = (t: ItemTemplate) => SEEDS.map((s) => generateItem(t, s));

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

describe('alg.function tables', () => {
  it.each([T1, T2])('$id: every table meets the rules and its answer checks', (t) => {
    for (const item of items(t)) {
      expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
      const table = functionTable(item.params);
      if (!table || item.widget.format !== 'pattern-extend' || !item.widget.table) {
        throw new Error('no table');
      }
      const { inputs, outputs, asked, n } = table;
      expect(new Set(inputs).size).toBe(inputs.length);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(9);
      for (const v of [...inputs, ...outputs]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(Number(item.params.max));
      }
      // Not in order up or down.
      const sorted = [...inputs].sort((a, b) => a - b);
      expect(inputs).not.toEqual(sorted);
      expect(inputs).not.toEqual([...sorted].reverse());
      // The cells never show the rule: only the inputs and the shown outputs.
      expect(item.widget.table.inputs).toEqual(inputs);
      const shown = new Set([...inputs, ...outputs.filter((_, i) => !asked.includes(i))]);
      for (const j of asked) {
        expect(item.widget.table.outputs[j]).toBeNull();
        // No asked output is a number already in the table.
        expect(shown.has(outputs[j] as number)).toBe(false);
        // The Out row read as a pattern never gives the answer.
        const guess = columnGuess(outputs, j);
        if (guess !== null) expect(guess).not.toBe(outputs[j]);
        // Doubling an asked input is never right.
        expect(2 * (inputs[j] as number)).not.toBe(outputs[j]);
      }
      expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
    }
  });

  it('about one add item in three has a first pair that also doubles (a lure)', () => {
    for (const t of [T1, T2]) {
      const adds = items(t).filter((i) => i.params.op === 'add');
      const lures = adds.filter((i) => i.params.in1 === i.params.n).length;
      const share = lures / adds.length;
      expect(share, t.id).toBeGreaterThan(0.25);
      expect(share, t.id).toBeLessThan(0.42);
      // Only the first pair can double.
      for (const i of adds) {
        for (const k of [2, 3, 4]) expect(i.params[`in${k}`]).not.toBe(i.params.n);
      }
    }
  });

  it.each([T1, T2, T3, T4])(
    '$id: the worked solution finds the rule from one pair, checks it on a second, and replays correct',
    (t) => {
      for (const item of items(t).slice(0, 120)) {
        const steps = itemSolution(item, t);
        const op = item.params.op;
        expect(steps[0]?.say).toBe(`gen.alg.function.rule-${op}`);
        expect(steps[1]?.say).toBe(`gen.alg.function.check-${op}`);
        expect(steps[0]?.vars).not.toEqual(steps[1]?.vars);
        const r = replaySteps(item, steps);
        expect(r && checkResponse(item, r).correct).toBe(true);
      }
    },
  );

  it('a table needs two shown pairs (the solution finds the rule on one, checks it on another)', () => {
    const g = registry.get('alg.function');
    const p = { op: 'add', n: 3, max: 20, lure: 0, arrange: 1 };
    expect(g?.accepts?.({ ...p, rows: 2, blanks: 1 }, T1)).toBe(false);
    expect(g?.accepts?.({ ...p, rows: 3, blanks: 2 }, T1)).toBe(false);
    expect(g?.accepts?.({ ...p, rows: 3, blanks: 1 }, T1)).toBe(true);
    // number-pad asks the rule: it shows every pair, so a blank is refused (PR #137 review round 2).
    expect(g?.accepts?.({ ...p, rows: 2, blanks: 1 }, T3)).toBe(false);
    expect(g?.accepts?.({ ...p, rows: 2, blanks: 0 }, T3)).toBe(true);
  });

  it('number-pad: one template a direction, so the prompt can say "adds" or "takes away"', () => {
    for (const item of items(T3)) expect(item.params.op).toBe('add');
    for (const item of items(T4)) {
      expect(item.params.op).toBe('sub');
      expect(item.answer).toEqual({ kind: 'number', value: item.params.n });
      expect(Number(item.params.out1)).toBe(Number(item.params.in1) - Number(item.params.n));
    }
  });
});

describe('alg.function misconceptions', () => {
  const tagged = (item: GeneratedItem, rule: typeof functionBackwards) => {
    const p = rule.predict?.(item) ?? null;
    if (!p) return null;
    expect(rule.match(item, p)).toBe(true);
    expect(checkResponse(item, p).correct).toBe(false);
    return p;
  };

  it('column pattern, backwards, add-for-take and the doubling lure predict wrong answers', () => {
    let column = 0;
    let lured = 0;
    for (const item of [...items(T1), ...items(T2)]) {
      const t = functionTable(item.params);
      if (!t) continue;
      if (tagged(item, functionColumnPattern)) column += 1;
      if (t.op === 'add') {
        expect(functionAddForTake.applies?.(item)).toBe(false);
        expect(functionBackwards.applies?.(item)).toBe(true);
      } else {
        expect(tagged(item, functionAddForTake)).toEqual({
          kind: 'numbers',
          values: t.asked.map((j) => (t.inputs[j] as number) + t.n),
        });
      }
      if (t.op === 'add' && t.inputs[0] === t.n) {
        lured += 1;
        expect(tagged(item, functionFirstPairDouble)).toEqual({
          kind: 'numbers',
          values: t.asked.map((j) => 2 * (t.inputs[j] as number)),
        });
      } else expect(functionFirstPairDouble.applies?.(item)).toBe(false);
    }
    expect(column).toBeGreaterThan(400);
    expect(lured).toBeGreaterThan(100);
  });

  it('number-pad items are outside the table rules', () => {
    const item = items(T3)[0] as GeneratedItem;
    for (const r of [functionColumnPattern, functionBackwards, functionAddForTake]) {
      expect(r.applies?.(item)).toBe(false);
    }
  });
});
