// parity.evenodd (03 §5.6): even and odd, "can everyone have a partner?" (MUL.01).
// Formats (K02 slice 3a):
// - equal-share: share `n` between two. `ask: even-odd` then answers `even` | `odd` (a choice);
//   `ask: leftover` answers `share.fair` with the typed number left without a partner (0 or 1).
// - number-pad: `n` on ten-frames; type how many are left without a partner (0 or 1).
// - shape-sort: `cards` number cards, each from 1 to `n`, at least one even and one odd, sorted
//   into an even bin and an odd bin (`sort.byRule` on the card's `even` prop).
// Bounds: n is 1–20 on ten-frames and equal-share (SHARE_ITEMS_MAX 24); shape-sort takes 4–6 cards.
// Not built yet: the spec's `display` param (how n is shown beyond the representation).

import type { LessonStep, ResponseValue, SortRule, StimulusSpec } from '@number-island/shared';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import { SHARE_SPRITES } from '../div/share';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const ASKS = ['even-odd', 'leftover'] as const;
/** The largest n: two full ten-frames. */
export const PARITY_N_MAX = 20;

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const BINS: { id: string; label: string; rule: SortRule }[] = [
  { id: 'even', label: 'gen.parity.bin-even', rule: { prop: 'even', op: '==', value: true } },
  { id: 'odd', label: 'gen.parity.bin-odd', rule: { prop: 'even', op: '==', value: false } },
];

/** `cards` distinct numbers from 1 to n, at least one even and one odd, in draw order. */
export function parityCards(n: number, cards: number, rng: BuildContext['rng']): number[] {
  const pool = Array.from({ length: n }, (_, k) => k + 1);
  for (;;) {
    const left = [...pool];
    const out: number[] = [];
    while (out.length < cards) out.push(left.splice(rng.int(0, left.length - 1), 1)[0] as number);
    if (out.some((x) => x % 2 === 0) && out.some((x) => x % 2 === 1)) return out;
  }
}

export const parityEvenOdd: GeneratorDef = {
  id: 'parity.evenodd',
  formats: ['equal-share', 'number-pad', 'shape-sort'],
  params: {
    n: {
      type: 'int',
      default: { kind: 'int', min: 2, max: 12 },
      doc: 'the number (1–20); shape-sort: the largest card',
    },
    ask: {
      type: 'string',
      values: [...ASKS],
      default: { kind: 'const', value: 'even-odd' },
      doc: 'equal-share: say even or odd, or type how many are left without a partner',
    },
    cards: {
      type: 'int',
      default: { kind: 'const', value: 5 },
      doc: 'shape-sort: number cards to sort (4–6)',
    },
    sprite: {
      type: 'string',
      values: [...SHARE_SPRITES],
      default: { kind: 'choice', values: [...SHARE_SPRITES] },
      doc: 'what is shared (a noun with clips)',
    },
  },
  features: {
    'n.over10': { weight: 0.4, doc: 'n is above 10 (shape-sort: the largest card)' },
  },
  narration: [
    'gen.parity.pair-up',
    'gen.parity.even',
    'gen.parity.odd',
    'gen.parity.left',
    'gen.parity.sort',
    'gen.parity.bin-even',
    'gen.parity.bin-odd',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const n = asNum(p.n);
    if (n < 1 || n > PARITY_N_MAX) return false;
    if (t.format === 'shape-sort') {
      const cards = asNum(p.cards, 5);
      return cards >= 4 && cards <= 6 && n >= cards;
    }
    return t.format === 'equal-share' || t.format === 'number-pad';
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const n = asNum(params.n);
    const rest = n % 2;
    const sprite = asStr(params.sprite, 'shell') as (typeof SHARE_SPRITES)[number];
    const vars = pickVars(t, { n, sprite });
    const math = { 'n.over10': n > 10 ? 1 : 0 };
    let p: PartialOutput;
    if (t.format === 'equal-share') {
      const leftover = asStr(params.ask) === 'leftover';
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'equal-share',
          items: n,
          recipients: 2,
          sprite,
          recipientsKind: 'pebbling',
          allowLeftover: true,
          ask: leftover ? 'leftover' : 'even-odd',
        },
        answer: leftover
          ? {
              kind: 'state',
              checker: 'share.fair',
              target: { items: n, recipients: 2, allowLeftover: true, value: rest },
            }
          : { kind: 'choice', id: rest === 0 ? 'even' : 'odd' },
      };
    } else if (t.format === 'number-pad') {
      const stimulus: StimulusSpec = {
        kind: 'ten-frame',
        frames: n > 10 ? 2 : 1,
        filled: n > 10 ? [10, n - 10] : [n],
      };
      p = {
        params,
        vars,
        math,
        widget: { format: 'number-pad', stimulus, blanks: [{ id: 'x', maxDigits: 2 }], unit: null },
        answer: { kind: 'number', value: rest },
      };
    } else if (t.format === 'shape-sort') {
      const values = parityCards(n, asNum(params.cards, 5), rng.fork('cards'));
      const cards = values.map((v, k) => ({ id: `c${k}`, value: v }));
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'shape-sort',
          cards: cards.map((c) => ({ id: c.id, card: { kind: 'number', value: c.value } })),
          bins: BINS,
          mode: 'sort',
        },
        answer: {
          kind: 'state',
          checker: 'sort.byRule',
          target: {
            cards: cards.map((c) => ({
              id: c.id,
              props: { value: c.value, even: c.value % 2 === 0 },
            })),
            bins: BINS.map((b) => ({ id: b.id, rule: b.rule })),
          },
        },
      };
    } else {
      throw new Error(`parity.evenodd cannot build ${t.format}`);
    }
    return finish(parityEvenOdd, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    const n = asNum(out.params.n);
    if (a.checker === 'share.fair') {
      const half = Math.floor(n / 2);
      return { kind: 'state', value: { shares: [half, half], leftover: n % 2, value: n % 2 } };
    }
    const w = out.widget;
    const bins: Record<string, string[]> = { even: [], odd: [] };
    if (w.format === 'shape-sort') {
      for (const c of w.cards) {
        if ('kind' in c.card && c.card.kind === 'number') {
          (bins[c.card.value % 2 === 0 ? 'even' : 'odd'] as string[]).push(c.id);
        }
      }
    }
    return { kind: 'state', value: { bins } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const n = asNum(out.params.n);
    const rest = n % 2;
    const verdict = rest === 0 ? 'gen.parity.even' : 'gen.parity.odd';
    switch (w.format) {
      case 'equal-share': {
        const steps: LessonStep[] = [];
        for (let k = 0; k < Math.floor(n / 2); k += 1) {
          steps.push(say('gen.parity.pair-up', {}, { op: 'deal-round' }));
        }
        if (rest > 0) steps.push(say('gen.parity.left', { rest }, { op: 'set-aside-leftover' }));
        steps.push(
          w.ask === 'leftover'
            ? say(verdict, { n }, { op: 'answer', args: { value: rest } })
            : say(verdict, { n }, { op: 'answer', args: { id: rest === 0 ? 'even' : 'odd' } }),
        );
        return steps;
      }
      case 'number-pad':
        return [
          say('gen.parity.pair-up', {}, { op: 'show-stimulus' }),
          say(verdict, { n }, { op: 'type', args: { blank: 'x', value: rest } }),
        ];
      case 'shape-sort':
        return w.cards.map((c) => {
          const v = 'kind' in c.card && c.card.kind === 'number' ? c.card.value : 0;
          return say(
            v % 2 === 0 ? 'gen.parity.even' : 'gen.parity.odd',
            { n: v },
            { op: 'drag-card', args: { id: c.id, bin: v % 2 === 0 ? 'even' : 'odd' } },
          );
        });
      default:
        return [];
    }
  },
};
