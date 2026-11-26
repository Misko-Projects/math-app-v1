// mda.addsub within 1000 (K02 slice 2b, #17): borrows across a zero, `zeroTens` sampling, the
// column algorithm beside the trade mat, three-digit sums on expanded-form and the number pad's
// place-by-place solution, and the disk bound of every shipped three-column compute template: no
// column above DISK_COLUMN_MAX and no more than 2 hundreds in an addition's tray on the way to
// the answer.

import type {
  ItemFormat,
  ItemTemplate,
  ParamSpec,
  Representation,
  Tier,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { TRADE_ADD_OPERAND_HUNDREDS_MAX } from '../../formats/base-ten-trade';
import { DISK_COLUMN_MAX } from '../../formats/place-value';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams } from '../../items/generate';
import { itemSolution, replaySteps } from '../../items/solution';
import { acrossZerosOf, groupedTokens, mdaAddSub } from './addsub';

let nextId = 0;
function tpl(
  format: ItemFormat,
  tier: Tier,
  representation: Representation,
  params: Record<string, ParamSpec>,
  constraints: string[] = [],
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.mda1000.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier,
    representation,
    generator: 'mda.addsub',
    params,
    constraints,
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  } as ItemTemplate;
}

const int = (min: number, max: number): ParamSpec => ({ kind: 'int', min, max });
const k = (value: string | number | boolean): ParamSpec => ({ kind: 'const', value });

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

describe('borrows across a zero', () => {
  it('counts the zeros a borrow passes through', () => {
    expect(acrossZerosOf(403, 127)).toBe(1);
    expect(acrossZerosOf(400, 168)).toBe(1);
    expect(acrossZerosOf(105, 96)).toBe(1);
    expect(acrossZerosOf(453, 127)).toBe(0);
    // The tens borrow from the hundreds; the zero ones lend nothing.
    expect(acrossZerosOf(500, 30)).toBe(0);
    expect(acrossZerosOf(900, 899)).toBe(1);
  });

  it('zeroTens draws minuends with no tens, and accepts only those', () => {
    const t = tpl(
      'number-pad',
      'abstract',
      'symbols',
      {
        a: int(100, 999),
        b: int(11, 899),
        op: k('-'),
        zeroTens: k(true),
      },
      ['acrossZeros >= 1'],
    );
    for (let seed = 1; seed <= 80; seed += 1) {
      const p = generateItem(t, seed).params;
      expect(Math.floor(Number(p.a) / 10) % 10).toBe(0);
      expect(p.acrossZeros).toBeGreaterThanOrEqual(1);
    }
    expect(mdaAddSub.accepts({ a: 413, b: 127, op: '-', zeroTens: true }, t)).toBe(false);
  });
});

describe('the column algorithm beside the trade mat', () => {
  it('strategy algorithm writes it on base-ten-trade, and nowhere else', () => {
    const trade = tpl('base-ten-trade', 'pictorial', 'pv-chart', {});
    const item = generateItemFromParams(trade, { a: 456, b: 278, op: '+', strategy: 'algorithm' });
    expect(item.widget.format === 'base-ten-trade' && item.widget.showAlgorithm).toBe(true);
    const plain = generateItemFromParams(trade, { a: 456, b: 278, op: '+' });
    expect(plain.widget.format === 'base-ten-trade' && plain.widget.showAlgorithm).toBe(false);
    const pad = tpl('number-pad', 'abstract', 'symbols', {});
    expect(mdaAddSub.accepts({ a: 456, b: 278, op: '+', strategy: 'algorithm' }, pad)).toBe(false);
  });
});

describe('three-digit sums', () => {
  const words = (a: number, b: number) =>
    groupedTokens(a, b, true).map((x) => ('v' in x ? x.v : x.t));

  it('expanded-form lists every hundred, ten and one in place order, a zero term dropped', () => {
    expect(words(345, 232)).toEqual([
      300,
      '+',
      200,
      '+',
      40,
      '+',
      30,
      '+',
      5,
      '+',
      2,
      '=',
      'blank',
    ]);
    expect(words(305, 201)).toEqual([300, '+', 200, '+', 5, '+', 1, '=', 'blank']);
    expect(words(456, 78)).toEqual([400, '+', 50, '+', 70, '+', 6, '+', 8, '=', 'blank']);
  });

  it('the worked solutions go place by place and name only places on the card', () => {
    const ef = tpl('expanded-form', 'pictorial', 'expanded', {});
    const says = (a: number, b: number) =>
      itemSolution(generateItemFromParams(ef, { a, b, op: '+' }), ef).map((s) => s.say);
    expect(says(345, 232)).toEqual([
      'gen.mda.addsub.sum-hundreds',
      'gen.mda.addsub.sum-tens',
      'gen.mda.addsub.sum-ones',
      'gen.mda.addsub.is',
    ]);
    expect(says(305, 201)).toEqual([
      'gen.mda.addsub.sum-hundreds',
      'gen.mda.addsub.sum-ones',
      'gen.mda.addsub.is',
    ]);
    const pad = tpl('number-pad', 'abstract', 'symbols', {});
    const first = (a: number, b: number, op: string) =>
      itemSolution(generateItemFromParams(pad, { a, b, op }), pad)[0]?.say;
    expect(first(456, 278, '+')).toBe('gen.mda.addsub.columns-add');
    expect(first(403, 127, '-')).toBe('gen.mda.addsub.columns-take');
    expect(first(46, 27, '+')).toBe('gen.mda.addsub.tens-then-ones');
  });
});

describe('MDA.16: the worked solution ends with the addition check', () => {
  it('52 − 27 ends with 25 + 27 = 52, and only a pad subtraction takes the param', () => {
    const pad = tpl('number-pad', 'abstract', 'symbols', {});
    const steps = itemSolution(
      generateItemFromParams(pad, { a: 52, b: 27, op: '-', checkByAdding: true }),
      pad,
    );
    expect(steps.at(-1)).toMatchObject({
      say: 'gen.mda.addsub.check-add',
      vars: { r: 25, b: 27, a: 52 },
    });
    expect(steps.at(-2)?.say).toBe('gen.mda.addsub.is');
    expect(mdaAddSub.accepts({ a: 52, b: 27, op: '+', checkByAdding: true }, pad)).toBe(false);
    const line = tpl('number-line-jump', 'pictorial', 'open-number-line', {});
    expect(mdaAddSub.accepts({ a: 52, b: 27, op: '-', checkByAdding: true }, line)).toBe(false);
  });
});

// The shipped three-column compute templates (templates/MDA.yaml, slice 2b), their params and
// constraints as authored.
const SHIPPED: [string, Record<string, ParamSpec>, string[]][] = [
  [
    'MDA.05.t1',
    { a: int(101, 899), b: int(11, 299), op: k('+') },
    ['carries >= 1', 'result <= 999'],
  ],
  [
    'MDA.07.t1',
    { a: int(101, 899), b: int(11, 299), op: k('+'), strategy: k('algorithm') },
    ['carries >= 1', 'result <= 999'],
  ],
  ['MDA.17.t1', { a: int(201, 999), b: int(101, 899), op: k('-') }, ['borrows >= 1']],
  [
    'MDA.18.t1',
    { a: int(100, 999), zeroTens: k(true), b: int(11, 899), op: k('-') },
    ['acrossZeros >= 1'],
  ],
  [
    'MDA.21.t1',
    { a: int(101, 999), b: int(11, 899), op: k('-'), strategy: k('algorithm') },
    ['borrows >= 1'],
  ],
];

describe('the disk bound of three-column compute (03 §5.5 place-value disks)', () => {
  it.each(SHIPPED)(
    '%s: every column stays within 20 on the worked path to the answer',
    (_id, params, constraints) => {
      const t = tpl('base-ten-trade', 'concrete', 'base-ten', params, constraints);
      const model = formatModel('base-ten-trade');
      if (!model) throw new Error('no base-ten-trade model');
      let fullest = 0;
      for (let seed = 1; seed <= 300; seed += 1) {
        const item = generateItem(t, seed);
        const w = item.widget;
        if (w.format !== 'base-ten-trade' || !w.operation) throw new Error('not a compute item');
        if (w.operation.op === '+')
          expect(w.operation.operand.hundreds).toBeLessThanOrEqual(TRADE_ADD_OPERAND_HUNDREDS_MAX);
        expect(Number(item.params.result)).toBeLessThanOrEqual(999);
        const steps = itemSolution(item, t);
        let s = model.initialState(w);
        for (const step of steps) {
          if (!step.action) continue;
          s = model.apply(s, step.action);
          const mat = (s as { mat: Record<string, number> }).mat;
          fullest = Math.max(fullest, mat.hundreds ?? 0, mat.tens ?? 0, mat.ones ?? 0);
        }
        const response = replaySteps(item, steps);
        expect(response && checkResponse(item, response).correct).toBe(true);
      }
      expect(fullest).toBeLessThanOrEqual(DISK_COLUMN_MAX);
    },
  );
});
