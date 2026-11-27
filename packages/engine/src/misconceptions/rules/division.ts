// K02 slice 3c (#17) division and missing-factor rules (03 §7.2). They read mul.facts items whose
// sentence divides (`op: ÷`) or asks a factor or the dividend (`unknown` factor | dividend): the
// sentence tells two numbers and asks one (r ÷ d = ?, r ÷ ? = q, ? ÷ d = q, a × ? = r, ? × b = r).
// Story pads (MUL.10) are the same items with the story in the prompt.
// - MC.multiply-instead-of-divide (multiplyInsteadOfDivide): the two told numbers multiplied
//   (8 ÷ 2 → 16; 4 × ? = 24 → 96; a story that divides answered with its two numbers times each
//   other). Not read when that product is the answer (÷ 1 asks the told number's own value).
// - MC.told-number-back (toldNumberBack): a told number given back (24 ÷ 4 → 4 or 24; 4 × ? = 24
//   → 24, the product for the missing factor), unless it equals the answer (16 ÷ 4 = 4, 7 ÷ 1).
// - MC.neighbour-fact (neighbourFact): the answer of the next fact up or down: one more or one
//   less for a quotient or a factor (the next multiple of the divisor), and one divisor more or
//   less for a dividend (? ÷ 6 = 8 → 42 or 54). A told number is left to toldNumberBack.
// Product facts (× with the result asked) stay with MC.skip-count-slip, whose v ± a, v ± b are
// the neighbouring facts 6 × 8 and 7 × 7 of 6 × 7.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { factPlan } from '../../generators/mul/facts';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

interface Asked {
  told: [number, number];
  answer: number;
  /** The divisor of a dividend-unknown item, else 1: how far the neighbouring facts are. */
  step: number;
}

/** The two told numbers and the asked one of a ÷ or missing-factor mul.facts item, else null. */
function askedItem(item: GeneratedItem): Asked | null {
  const ps = item.params;
  if (typeof ps.a !== 'number' || typeof ps.b !== 'number') return null;
  if (typeof ps.c === 'number' && ps.c > 0) return null;
  const op = ps.op ?? '×';
  const unknown = ps.unknown ?? 'result';
  if (op === '×' && unknown === 'result') return null;
  const plan = factPlan(ps);
  const told = plan.tokens.flatMap((t) => (t.t === 'num' ? [t.v] : []));
  const asked = askedNumbers(item);
  if (told.length !== 2 || !asked || asked.length !== 1) return null;
  return {
    told: told as [number, number],
    answer: asked[0] as number,
    step: unknown === 'dividend' ? plan.rows : 1,
  };
}

function rule(id: string, wrongs: (q: Asked) => number[]): MisconceptionRule {
  const of = (item: GeneratedItem) => {
    const q = askedItem(item);
    if (!q) return null;
    // A pick can only be wrong with one of its options.
    const w0 = item.widget;
    const offered = (x: number) =>
      w0.format !== 'numeral-pick' || w0.options.some((o) => o.label === String(x));
    const w = [...new Set(wrongs(q))].filter((x) => x > 0 && x !== q.answer && offered(x));
    return w.length > 0 ? { q, w } : null;
  };
  return {
    id,
    kind: 'answer',
    applies: (item) => askedItem(item) !== null,
    predict(item): ResponseValue | null {
      const x = of(item);
      return x ? responseWith(item, [x.w[0] as number]) : null;
    },
    match(item, r) {
      const x = of(item);
      if (!x) return false;
      return rewritesAsked(item, r, (v, given) => v === x.q.answer && x.w.includes(given));
    },
  };
}

export const multiplyInsteadOfDivide = rule('multiplyInsteadOfDivide', (q) => [
  q.told[0] * q.told[1],
]);

export const toldNumberBack = rule('toldNumberBack', (q) => [...q.told]);

export const neighbourFact = rule('neighbourFact', (q) =>
  [q.answer - q.step, q.answer + q.step].filter((x) => !q.told.includes(x)),
);
