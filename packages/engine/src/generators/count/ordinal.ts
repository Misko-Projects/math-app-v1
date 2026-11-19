// count.ordinal (03 §5.6): ordinal positions, first to tenth (CNT.15). A line of `n` objects is
// counted from the left or the right; the item asks for the object in position `k`.
// Formats:
// - tap-count (mode ordinal): "Tap the third one." The answer is the object's choice id
//   `obj-<i>` (0-based reading order), so k from the right is index n − k.
// - numeral-pick: one object in the line looks different (its own colour group); the options are
//   position words (`ord.<k>` clips) and the child picks its place. Option ids are `opt-<k>`.
// - number-pad: the same marked line; the child types the place as a number (3 for third). This is
//   CNT.15's constructed-answer format (04 §7b: only constructed answers are evidence). With
//   `ask: after` (the abstract tier) there is no line: the prompt names place k and the child types
//   the number of the place just after it (6 after fifth), so k is 1 to 9.

import type { LessonStep, ObjectSet, ResponseValue } from '@number-island/shared';
import { boundNarration } from '../../content/binding';
import { numberOptionId } from '../../formats/numeral-pick';
import {
  asNum,
  asStr,
  correctFromAnswer,
  DEFAULT_SPRITES,
  finish,
  layoutSeed,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const FROM = ['left', 'right'] as const;
type From = (typeof FROM)[number];
const ASKS = ['place', 'after'] as const;

/** The 0-based reading-order index of position k counted from `from` in a line of n. */
export function ordinalIndex(k: number, n: number, from: From): number {
  return from === 'right' ? n - k : k - 1;
}

const SUFFIX = (k: number): string => {
  const tens = k % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  return k % 10 === 1 ? 'st' : k % 10 === 2 ? 'nd' : k % 10 === 3 ? 'rd' : 'th';
};

/**
 * A position word for an option label: the `ord.<k>` clip's text from the bound narration
 * ("third"), or "3rd" when no narration is bound (engine unit tests).
 */
function ordinalLabel(k: number): string {
  return boundNarration()[`ord.${k}`]?.text ?? `${k}${SUFFIX(k)}`;
}

/** Three distinct positions near k, within 1 … max (k always included). */
function positionOptions(k: number, max: number): number[] {
  const picked = [k];
  for (const d of [1, -1, 2, -2, 3, -3, 4, -4]) {
    const v = k + d;
    if (picked.length < 3 && v >= 1 && v <= max && !picked.includes(v)) picked.push(v);
  }
  return picked;
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const countOrdinal: GeneratorDef = {
  id: 'count.ordinal',
  formats: ['tap-count', 'numeral-pick', 'number-pad'],
  params: {
    k: { type: 'int', default: { kind: 'int', min: 1, max: 10 }, doc: 'the position, 1 to 10' },
    from: {
      type: 'string',
      values: [...FROM],
      default: { kind: 'const', value: 'left' },
      doc: 'the end of the line the counting starts from',
    },
    n: {
      type: 'int',
      default: { kind: 'int', min: 3, max: 10 },
      doc: 'objects in the line (at least k)',
    },
    sprite: {
      type: 'string',
      default: { kind: 'choice', values: [...DEFAULT_SPRITES] },
      doc: 'art-kit object sprite id',
    },
    ask: {
      type: 'string',
      values: [...ASKS],
      default: { kind: 'const', value: 'place' },
      doc: 'place: the place of object k (every format); after (number-pad only): no line, type the place just after place k',
    },
  },
  features: {
    'k.over5': { weight: 0.3, doc: 'max(0, k − 5) / 5' },
    'ordinal.fromRight': {
      weight: 0.4,
      doc: 'counted from the right (also on numeral-pick, which has no format feature for it)',
    },
  },
  narration: [
    'gen.count.ordinal.start-left',
    'gen.count.ordinal.start-right',
    'gen.count.ordinal.this-one',
    'gen.count.ordinal.say-to',
    'gen.count.ordinal.after',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const k = asNum(p.k);
    const n = asNum(p.n);
    // `after` asks for place k + 1, which needs a clip too (… tenth): number-pad only.
    if (asStr(p.ask, 'place') === 'after') return t.format === 'number-pad' && k >= 1 && k <= 9;
    // Ordinal words have clips for first … tenth; the line holds at least k objects and at least 3
    // (a numeral-pick needs three positions to choose from).
    return k >= 1 && k <= 10 && n >= k && n >= 3;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const k = asNum(params.k);
    const n = asNum(params.n);
    const from: From = asStr(params.from) === 'right' ? 'right' : 'left';
    const sprite = asStr(params.sprite, 'shell');
    const index = ordinalIndex(k, n, from);
    const vars = pickVars(t, { k, n, from });
    const math: Record<string, number> = {
      'k.over5': Math.max(0, k - 5) / 5,
      // An `after` item shows no line, so it has no end to count from.
      'ordinal.fromRight': from === 'right' && asStr(params.ask, 'place') !== 'after' ? 1 : 0,
    };
    const set: ObjectSet = { count: n, sprite, layout: 'line', layoutSeed: layoutSeed(rng) };
    let p: PartialOutput;
    switch (t.format) {
      case 'tap-count': {
        const concrete = t.tier === 'concrete';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'tap-count',
            set,
            mode: 'ordinal',
            ordinal: { k, from },
            input: 'auto',
            marks: concrete,
            countAloud: concrete,
          },
          answer: { kind: 'choice', id: `obj-${index}` },
          nudge: [{ op: 'tap', args: { index: from === 'right' ? n - 1 : 0 } }],
          highlight: [{ op: 'tap', args: { index: from === 'right' ? n - 1 : 0 } }],
        };
        break;
      }
      case 'numeral-pick': {
        // The asked object is its own colour group: [before, 1, after] in reading order.
        const marked: ObjectSet = { ...set, groups: [index, 1, n - index - 1] };
        const order = rng.fork('layout').shuffle(positionOptions(k, Math.min(10, n)));
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'numeral-pick',
            stimulus: { kind: 'objects', set: marked },
            options: order.map((v) => ({
              id: numberOptionId(v),
              label: ordinalLabel(v),
              speak: `ord.${v}`,
            })),
            layout: 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(k) },
        };
        break;
      }
      case 'number-pad': {
        const after = asStr(params.ask, 'place') === 'after';
        const marked: ObjectSet = { ...set, groups: [index, 1, n - index - 1] };
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: after ? { kind: 'none' } : { kind: 'objects', set: marked },
            blanks: [{ id: 'n', maxDigits: 2 }],
            unit: null,
          },
          answer: { kind: 'number', value: after ? k + 1 : k },
        };
        break;
      }
      default:
        throw new Error(`count.ordinal cannot build ${t.format}`);
    }
    return finish(countOrdinal, ctx, p);
  },
  exampleCorrect: (out): ResponseValue => correctFromAnswer(out.answer),
  solution(out): LessonStep[] {
    const w = out.widget;
    const k = asNum(out.params.k);
    const n = asNum(out.params.n);
    const from: From = asStr(out.params.from) === 'right' ? 'right' : 'left';
    const index = ordinalIndex(k, n, from);
    const start =
      from === 'right' ? 'gen.count.ordinal.start-right' : 'gen.count.ordinal.start-left';
    switch (w.format) {
      case 'tap-count':
        return [
          say(start, { k }, { op: 'tap', args: { index: from === 'right' ? n - 1 : 0 } }),
          say('gen.count.ordinal.this-one', { k }, { op: 'ring', args: { index } }),
        ];
      case 'numeral-pick':
        return [
          say(start, { k }),
          say('gen.count.ordinal.this-one', { k }, { op: 'tap', args: { id: numberOptionId(k) } }),
        ];
      case 'number-pad':
        if (asStr(out.params.ask, 'place') === 'after') {
          return [
            say('gen.count.ordinal.say-to', { k }),
            say(
              'gen.count.ordinal.after',
              { k, n: k + 1 },
              { op: 'type', args: { blank: 'n', value: k + 1 } },
            ),
          ];
        }
        return [
          say(start, { k }),
          say('gen.count.ordinal.this-one', { k }, { op: 'type', args: { blank: 'n', value: k } }),
        ];
      default:
        return [];
    }
  },
};
