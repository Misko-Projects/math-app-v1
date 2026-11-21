// div.share (03 §5.6): share `items` fairly among `recipients` by dealing one at a time.
// Derived: `each` = items ÷ recipients (rounded down) and `rest` = what is left over.
// Formats (K01): equal-share, number-pad. `ask`:
// - `each` (MUL.12): deal everything out and say how many each one gets. On equal-share the answer
//   is `share.fair` (with `leftover: true` the rest goes to the seagull); on number-pad a picture of
//   the pile is shown and the child types each. No make-set: one basket checks only its count, so
//   it never needs the dealing the skill teaches (PR #84 review).
// - `fair-or-not` (FRA.07, equal-share): a pre-dealt share, fair when `fair`, otherwise `shift`
//   items moved from one plate to another; the child answers `yes` | `no`.
// - `fix` (FRA.07, equal-share): two plates pre-dealt unfairly (`shift` moved); the child moves
//   items until it is fair and types how many each plate has (`share.fair`).
// - `moves` (FRA.07, number-pad): the same unfair pair in a picture; the child types how many must
//   move to make it fair (the answer is `shift`).
// Pre-dealt counts follow from the params (each ± shift); only which plate has more is layout.

import type { LessonStep, ParamValues, ResponseValue, StimulusSpec } from '@number-island/shared';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  layoutSeed,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const ASKS = ['each', 'fair-or-not', 'fix', 'moves'] as const;
/** Things to share; each has noun clips (contexts.yaml). */
export const SHARE_SPRITES = ['shell', 'fish', 'crab', 'pebble'] as const;

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** Whether the item shows an unfair pre-dealt share. */
function unfair(p: ParamValues): boolean {
  const ask = asStr(p.ask);
  return ask === 'fix' || ask === 'moves' || (ask === 'fair-or-not' && p.fair !== true);
}

/**
 * The pre-dealt counts: `each` for everyone, then `shift` moved from one recipient to the next
 * (the first two in display order, so the bigger plate is `big` and the smaller `big + 1`).
 */
export function predealtShares(p: ParamValues, big: number): number[] {
  const recipients = asNum(p.recipients, 2);
  const each = asNum(p.each);
  const shares = new Array<number>(recipients).fill(each);
  if (!unfair(p)) return shares;
  const shift = asNum(p.shift, 1);
  const small = (big + 1) % recipients;
  shares[big] = each + shift;
  shares[small] = each - shift;
  return shares;
}

export const divShare: GeneratorDef = {
  id: 'div.share',
  formats: ['equal-share', 'number-pad'],
  params: {
    items: { type: 'int', default: { kind: 'int', min: 4, max: 12 }, doc: 'things to share' },
    recipients: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: 'friends or plates to share among (2–4; fix and moves use 2)',
    },
    leftover: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'each: the items do not share evenly, and the rest goes to the seagull',
    },
    ask: {
      type: 'string',
      values: [...ASKS],
      default: { kind: 'const', value: 'each' },
      doc: 'each, fair-or-not, fix (make a pre-dealt share fair) or moves (how many must move)',
    },
    fair: {
      type: 'bool',
      default: { kind: 'const', value: true },
      doc: 'fair-or-not: the pre-dealt share is fair',
    },
    shift: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'unfair shares: how many were moved from one plate to another',
    },
    sprite: {
      type: 'string',
      values: [...SHARE_SPRITES],
      default: { kind: 'choice', values: [...SHARE_SPRITES] },
      doc: 'what is shared (a noun with clips)',
    },
  },
  derived: ['each', 'rest'],
  features: {
    items: {
      weight: 0.3,
      doc: '(items − recipients) / 10: items beyond one each (the equal-share feature, 03 §5.5)',
    },
    'recipients.over2': { weight: 0.2, doc: 'recipients − 2' },
    leftover: { weight: 0.4, doc: 'the items do not share evenly' },
    nearFair: {
      weight: 0.3,
      doc: 'fair-or-not: an unfair share only one apart, which is harder to see',
    },
    shift: { weight: 0.3, doc: 'fix, moves: shift − 1 (more must move)' },
  },
  narration: [
    'gen.div.share.deal-round',
    'gen.div.share.seagull',
    'gen.div.share.each',
    'gen.div.share.look',
    'gen.div.share.fair',
    'gen.div.share.not-fair',
    'gen.div.share.take-back',
    'gen.div.share.give',
    'gen.div.share.in-turn',
    'gen.div.share.make-same',
    'gen.div.share.moves',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    const items = asNum(p.items);
    const recipients = Math.max(1, asNum(p.recipients, 2));
    return { each: Math.floor(items / recipients), rest: items % recipients };
  },
  accepts(p, t) {
    const items = asNum(p.items);
    const recipients = asNum(p.recipients, 2);
    const each = asNum(p.each);
    const rest = asNum(p.rest);
    const ask = asStr(p.ask);
    const shift = asNum(p.shift, 1);
    if (recipients < 2 || recipients > 4 || items < recipients || each < 1) return false;
    if ((p.leftover === true) !== rest > 0) return false;
    if (ask !== 'each' && p.leftover === true) return false;
    if (unfair(p) && (shift < 1 || each - shift < 1)) return false;
    if ((ask === 'fix' || ask === 'moves') && recipients !== 2) return false;
    switch (t.format) {
      case 'equal-share':
        return ask === 'each' || ask === 'fair-or-not' || ask === 'fix';
      case 'number-pad':
        return (ask === 'each' && rest === 0) || ask === 'moves';
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const items = asNum(params.items);
    const recipients = asNum(params.recipients, 2);
    const each = asNum(params.each);
    const rest = asNum(params.rest);
    const ask = asStr(params.ask);
    const shift = asNum(params.shift, 1);
    const sprite = asStr(params.sprite, 'shell');
    const big = rng.fork('layout').int(0, recipients - 1);
    const shares = predealtShares(params, big);
    const vars = pickVars(t, {
      items,
      recipients,
      sprite,
      a: shares[0] as number,
      b: shares[1] as number,
    });
    const math: Record<string, number> = {
      items: Math.max(0, items - recipients) / 10,
      'recipients.over2': recipients - 2,
      leftover: rest > 0 ? 1 : 0,
      nearFair: ask === 'fair-or-not' && unfair(params) && shift === 1 ? 1 : 0,
      shift: ask === 'fix' || ask === 'moves' ? shift - 1 : 0,
    };
    let p: PartialOutput;
    if (t.format === 'equal-share') {
      const predealt = ask === 'each' ? undefined : shares;
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'equal-share',
          items,
          recipients,
          sprite,
          recipientsKind: ask === 'each' ? 'pebbling' : 'plate',
          allowLeftover: params.leftover === true,
          ask: ask === 'fair-or-not' ? 'fair-or-not' : 'each',
          ...(predealt ? { predealt } : {}),
        },
        answer:
          ask === 'fair-or-not'
            ? { kind: 'choice', id: unfair(params) ? 'no' : 'yes' }
            : {
                kind: 'state',
                checker: 'share.fair',
                target: { items, recipients, allowLeftover: params.leftover === true, value: each },
              },
      };
    } else if (t.format === 'number-pad') {
      const stimulus: StimulusSpec =
        ask === 'moves'
          ? {
              kind: 'objects',
              set: { count: items, sprite, layout: 'groups', groups: shares, layoutSeed: 0 },
            }
          : {
              kind: 'objects',
              set: { count: items, sprite, layout: 'scatter', layoutSeed: layoutSeed(rng) },
            };
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'number-pad',
          stimulus,
          blanks: [{ id: 'n', maxDigits: 2 }],
          unit: null,
        },
        answer: { kind: 'number', value: ask === 'moves' ? shift : each },
      };
    } else {
      throw new Error(`div.share cannot build ${t.format}`);
    }
    return finish(divShare, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    const recipients = asNum(out.params.recipients, 2);
    const each = asNum(out.params.each);
    return {
      kind: 'state',
      value: {
        shares: new Array<number>(recipients).fill(each),
        leftover: asNum(out.params.rest),
        value: each,
      },
    };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const p = out.params;
    const each = asNum(p.each);
    const shift = asNum(p.shift, 1);
    const ask = asStr(p.ask);
    switch (w.format) {
      case 'equal-share': {
        if (w.ask === 'fair-or-not') {
          const fair = w.predealt?.every((x) => x === w.predealt?.[0]) ?? true;
          return [
            say('gen.div.share.look', {}),
            say(
              fair ? 'gen.div.share.fair' : 'gen.div.share.not-fair',
              {},
              {
                op: 'answer',
                args: { id: fair ? 'yes' : 'no' },
              },
            ),
          ];
        }
        if (w.predealt) {
          const big = w.predealt.indexOf(Math.max(...w.predealt));
          const small = w.predealt.indexOf(Math.min(...w.predealt));
          return [
            say('gen.div.share.take-back', {}, { op: 'deal', args: { to: big, count: -shift } }),
            say('gen.div.share.give', {}, { op: 'deal', args: { to: small, count: shift } }),
            say('gen.div.share.each', { each }, { op: 'answer', args: { value: each } }),
          ];
        }
        const steps: LessonStep[] = [];
        for (let k = 0; k < each; k += 1) {
          steps.push(say('gen.div.share.deal-round', {}, { op: 'deal-round' }));
        }
        if (asNum(p.rest) > 0) {
          steps.push(say('gen.div.share.seagull', {}, { op: 'set-aside-leftover' }));
        }
        steps.push(say('gen.div.share.each', { each }, { op: 'answer', args: { value: each } }));
        return steps;
      }
      case 'number-pad':
        return ask === 'moves'
          ? [
              say('gen.div.share.make-same', {}, { op: 'show-stimulus' }),
              say(
                'gen.div.share.moves',
                { shift },
                { op: 'type', args: { blank: 'n', value: shift } },
              ),
            ]
          : [
              say('gen.div.share.in-turn', {}, { op: 'show-stimulus' }),
              say(
                'gen.div.share.each',
                { each },
                { op: 'type', args: { blank: 'n', value: each } },
              ),
            ];
      default:
        return [];
    }
  },
};
