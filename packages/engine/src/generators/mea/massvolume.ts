// mea.massvolume (03 §5.6): compare weights with a balance, and read a scale or a measuring jug.
// Formats: number-pad, numeral-pick, compare, balance.
//
// - instrument `balance` (balance, compare), MEA.16: two island objects, `objects` copies of the
//   first against one of the second. Each object kind has a fixed weight step (1–9, WEIGHABLES), so
//   `value` and `value2` pick the objects and the heavier side follows from the params. The balance
//   tilts to show it (`which-heavier`); the compare format asks from everyday knowledge.
// - instrument `scale` / `beaker` (number-pad, numeral-pick), MEA.17–18 (K02): read `value` in
//   `unit` off a gauge with a tick every `ticksEvery` and a label every second tick.

import type { LessonStep, ResponseValue, StimulusSpec } from '@number-island/shared';
import { numberOptionId, optionNumber } from '../../formats/numeral-pick';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  layoutSeed,
  numberOptions,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const INSTRUMENTS = ['balance', 'scale', 'beaker'] as const;
const UNITS = ['none', 'g', 'kg', 'L'] as const;

/**
 * Island objects by weight step (index + 1): a feather is the lightest, a pumpkin the heaviest.
 * The order matches everyday experience, so compare items can be answered without a balance.
 */
export const WEIGHABLES = [
  'feather',
  'leaf',
  'shell',
  'apple',
  'coconut',
  'melon',
  'brick',
  'rock',
  'pumpkin',
] as const;
const sprite = (weight: number): string => WEIGHABLES[weight - 1] ?? 'shell';

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const ratio100 = (x: number): number => Math.round(x * 100) / 100;

/** The gauge a reading is shown on: labels every second tick, room above the value. */
export function gaugeFor(
  instrument: 'scale' | 'beaker',
  value: number,
  ticksEvery: number,
  unit: 'g' | 'kg' | 'L',
): Extract<StimulusSpec, { kind: 'gauge' }> {
  const labelsEvery = 2 * ticksEvery;
  const max = Math.max(
    5 * labelsEvery,
    labelsEvery * Math.ceil((value + ticksEvery) / labelsEvery),
  );
  return { kind: 'gauge', instrument, min: 0, max, ticksEvery, labelsEvery, value, unit };
}

export const meaMassVolume: GeneratorDef = {
  id: 'mea.massvolume',
  formats: ['number-pad', 'numeral-pick', 'compare', 'balance'],
  params: {
    instrument: {
      type: 'string',
      values: [...INSTRUMENTS],
      // Templates always set it; the default lets every format build from defaults.
      default: { kind: 'choice', values: [...INSTRUMENTS] },
      doc: 'balance (balance, compare) or scale / beaker (number-pad, numeral-pick)',
    },
    value: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 9 },
      doc: 'balance: weight step (1–9) of the first object, which picks it from WEIGHABLES; scale or beaker: the reading',
    },
    value2: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 9 },
      doc: 'balance: weight step (1–9) of the second object',
    },
    objects: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'balance: copies of the first object on its side (1–3); the other side has one object',
    },
    unit: {
      type: 'string',
      values: [...UNITS],
      default: { kind: 'choice', values: [...UNITS] },
      doc: 'none (balance); g or kg (scale); L (beaker)',
    },
    ticksEvery: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'scale or beaker: units between ticks (labels on every second tick)',
    },
  },
  derived: ['weight', 'weight2'],
  features: {
    closeness: { weight: 0.6, doc: 'balance: lighter ÷ heavier side (1 when level)' },
    equal: { weight: 0.4, doc: 'balance: both sides weigh the same' },
    conflict: { weight: 0.8, doc: 'balance: the side with more objects is the lighter one' },
    'tick.unlabeled': { weight: 0.5, doc: 'gauge: the reading is on an unlabeled tick' },
    'ticksEvery.notOne': { weight: 0.4, doc: 'gauge: ticks are not one unit apart' },
  },
  narration: [
    'gen.mea.massvolume.place-first',
    'gen.mea.massvolume.place-second',
    'gen.mea.massvolume.watch',
    'gen.mea.massvolume.goes-down',
    'gen.mea.massvolume.level',
    'gen.mea.massvolume.lift',
    'gen.mea.massvolume.heavier',
    'gen.mea.massvolume.find-mark',
    'gen.mea.massvolume.reads',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: (p) => ({
    weight: asNum(p.value) * asNum(p.objects, 1),
    weight2: asNum(p.value2),
  }),
  accepts(p, t) {
    const instrument = asStr(p.instrument);
    const unit = asStr(p.unit);
    const value = asNum(p.value);
    const objects = asNum(p.objects, 1);
    if (t.format === 'balance' || t.format === 'compare') {
      if (instrument !== 'balance' || unit !== 'none') return false;
      const v2 = asNum(p.value2);
      if (value < 1 || value > 9 || v2 < 1 || v2 > 9 || objects < 1 || objects > 3) return false;
      const w = value * objects;
      // Level only for two identical objects; the compare format has no balance to show it.
      if (w === v2) return t.format === 'balance' && objects === 1 && value === v2;
      return true;
    }
    const ticks = asNum(p.ticksEvery, 1);
    if (ticks < 1 || value < 0 || value % ticks !== 0) return false;
    if (instrument === 'scale') return unit === 'g' || unit === 'kg';
    if (instrument === 'beaker') return unit === 'L';
    return false;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const value = asNum(params.value);
    const vars = pickVars(t, {});
    let p: PartialOutput;
    if (t.format === 'balance' || t.format === 'compare') {
      const objects = asNum(params.objects, 1);
      const value2 = asNum(params.value2);
      const w = value * objects;
      const first = { sprite: sprite(value), count: objects, weight: w };
      const second = { sprite: sprite(value2), count: 1, weight: value2 };
      const swap = rng.fork('layout').bool(0.5);
      const [left, right] = swap ? [second, first] : [first, second];
      const id =
        left.weight === right.weight ? 'same' : left.weight > right.weight ? 'left' : 'right';
      const math: Record<string, number> = {
        closeness: ratio100(Math.min(w, value2) / Math.max(w, value2)),
        conflict: objects >= 2 && w < value2 ? 1 : 0,
      };
      if (t.format === 'balance') {
        math.equal = w === value2 ? 1 : 0;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'balance',
            left: { terms: [{ object: left.sprite, count: left.count }] },
            right: { terms: [{ object: right.sprite, count: right.count }] },
            mode: 'which-heavier',
            objectWeights: { [sprite(value)]: value, [sprite(value2)]: value2 },
            showTilt: true,
          },
          answer: { kind: 'choice', id },
        };
      } else {
        const pic = (s: { sprite: string; count: number }): StimulusSpec => ({
          kind: 'objects',
          set: { count: s.count, sprite: s.sprite, layout: 'line', layoutSeed: layoutSeed(rng) },
        });
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'compare',
            left: pic(left),
            right: pic(right),
            ask: 'heavier',
            allowMatchLines: false,
          },
          answer: { kind: 'choice', id },
        };
      }
      return finish(meaMassVolume, ctx, p);
    }
    const instrument = asStr(params.instrument) as 'scale' | 'beaker';
    const unit = asStr(params.unit) as 'g' | 'kg' | 'L';
    const ticks = asNum(params.ticksEvery, 1);
    const gauge = gaugeFor(instrument, value, ticks, unit);
    const math: Record<string, number> = {
      'tick.unlabeled': value % gauge.labelsEvery !== 0 ? 1 : 0,
      'ticksEvery.notOne': ticks !== 1 ? 1 : 0,
    };
    if (t.format === 'number-pad') {
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'number-pad',
          stimulus: gauge,
          blanks: [{ id: 'n', maxDigits: String(gauge.max).length }],
          unit,
        },
        answer: { kind: 'number', value },
      };
    } else if (t.format === 'numeral-pick') {
      const opts = numberOptions(t, params, value, rng);
      math['distractors.diagnostic'] = opts.diagnostic;
      p = {
        params,
        vars,
        math,
        widget: { format: 'numeral-pick', stimulus: gauge, options: opts.options, layout: 'row' },
        answer: { kind: 'choice', id: numberOptionId(value) },
      };
    } else {
      throw new Error(`mea.massvolume cannot build ${t.format}`);
    }
    return finish(meaMassVolume, ctx, p);
  },
  exampleCorrect: (out): ResponseValue => correctFromAnswer(out.answer),
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    const id = a.kind === 'choice' ? a.id : 'same';
    switch (w.format) {
      case 'balance':
        return [
          say(
            'gen.mea.massvolume.place-first',
            {},
            { op: 'place', args: { side: 'left', term: w.left.terms[0] } },
          ),
          say(
            'gen.mea.massvolume.place-second',
            {},
            { op: 'place', args: { side: 'right', term: w.right.terms[0] } },
          ),
          say('gen.mea.massvolume.watch', {}, { op: id === 'same' ? 'level' : 'tilt' }),
          say(
            id === 'same' ? 'gen.mea.massvolume.level' : 'gen.mea.massvolume.goes-down',
            {},
            { op: 'answer', args: { id } },
          ),
        ];
      case 'compare':
        return [
          // No highlight: the worked-step hint (level 4) plays this step and must not point at the answer.
          say('gen.mea.massvolume.lift', {}),
          say('gen.mea.massvolume.heavier', {}, { op: 'answer', args: { id } }),
        ];
      case 'number-pad':
      case 'numeral-pick': {
        const n =
          a.kind === 'number' ? a.value : a.kind === 'choice' ? (optionNumber(a.id) ?? 0) : 0;
        return [
          w.format === 'number-pad'
            ? say('gen.mea.massvolume.find-mark', {}, { op: 'show-stimulus' })
            : say('gen.mea.massvolume.find-mark', {}),
          say(
            'gen.mea.massvolume.reads',
            { n },
            w.format === 'number-pad'
              ? { op: 'type', args: { blank: 'n', value: n } }
              : { op: 'tap', args: { id: numberOptionId(n) } },
          ),
        ];
      }
      default:
        return [];
    }
  },
};
