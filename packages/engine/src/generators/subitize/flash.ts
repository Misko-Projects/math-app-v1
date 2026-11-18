// subitize.flash (03 §5.6): see a small quantity at a glance, or build it in a structured frame.
// Formats: dot-flash, numeral-pick, number-pad, make-set, tenframe-fill, rekenrek.

import type { LessonStep, ResponseValue, StimulusSpec } from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
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
  tenFrameOverlay,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const ARRANGEMENTS = [
  'dice',
  'scatter',
  'five-frame',
  'ten-frame',
  'double-ten-frame',
  'fingers',
  'groups',
] as const;
type Arrangement = (typeof ARRANGEMENTS)[number];

/** The visible groups of an arrangement (03 §5.1 StimulusSpec `dots.groups`). */
export function arrangementGroups(n: number, arrangement: Arrangement, groups: number): number[] {
  switch (arrangement) {
    case 'fingers':
    case 'five-frame':
    case 'ten-frame':
    case 'double-ten-frame': {
      const unit = arrangement === 'double-ten-frame' ? 10 : 5;
      const out: number[] = [];
      for (let left = n; left > 0; left -= Math.min(unit, left)) out.push(Math.min(unit, left));
      return out.length ? out : [0];
    }
    case 'dice': {
      const out: number[] = [];
      for (let left = n; left > 0; left -= Math.min(6, left)) out.push(Math.min(6, left));
      return out.length ? out : [0];
    }
    case 'groups': {
      const k = Math.max(1, Math.min(groups > 0 ? groups : n >= 6 ? 2 : 1, n));
      const base = Math.floor(n / k);
      return Array.from({ length: k }, (_, i) => base + (i < n % k ? 1 : 0));
    }
    default:
      return [n];
  }
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const subitizeFlash: GeneratorDef = {
  id: 'subitize.flash',
  formats: ['dot-flash', 'numeral-pick', 'number-pad', 'make-set', 'tenframe-fill', 'rekenrek'],
  params: {
    n: { type: 'int', default: { kind: 'int', min: 1, max: 5 }, doc: 'the quantity' },
    arrangement: {
      type: 'string',
      values: [...ARRANGEMENTS],
      default: { kind: 'const', value: 'dice' },
      doc: 'how the dots are arranged',
    },
    groups: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: "number of groups for the 'groups' arrangement (0: automatic)",
    },
    flashMs: {
      type: 'int',
      default: { kind: 'const', value: 1500 },
      doc: 'flash time in ms (1500 for K, 1000 for G1+)',
    },
  },
  features: {
    'n.over5': { weight: 0.3, doc: 'max(0, n − 5) / 5 (not on dot-flash, which has n.over4)' },
    conceptual: { weight: 0.3, doc: '≥ 2 visible groups (conceptual subitizing)' },
    teen: { weight: 0.5, doc: 'n ≥ 11' },
    placeValue: { weight: 0.4, doc: 'a full ten plus ones' },
    multiplicative: { weight: 0.5, doc: '≥ 3 equal groups' },
  },
  narration: [
    'gen.subitize.flash.look',
    'gen.subitize.flash.see-groups',
    'gen.subitize.flash.total',
    'gen.subitize.flash.show',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const n = asNum(params.n);
    const arrangement = asStr(params.arrangement, 'dice') as Arrangement;
    const groups = arrangementGroups(n, arrangement, asNum(params.groups));
    const visible = groups.filter((g) => g > 0);
    const math: Record<string, number> = {
      conceptual: visible.length >= 2 ? 1 : 0,
      teen: n >= 11 ? 1 : 0,
      // A full ten plus ones: teen quantities shown in ten-frames (or with a group of ten).
      placeValue:
        n > 10 &&
        (arrangement === 'ten-frame' || arrangement === 'double-ten-frame' || groups[0] === 10)
          ? 1
          : 0,
      multiplicative: visible.length >= 3 && visible.every((g) => g === visible[0]) ? 1 : 0,
    };
    // dot-flash already measures size (n.over4); the generator's size feature covers the rest.
    if (t.format !== 'dot-flash') math['n.over5'] = Math.max(0, n - 5) / 5;
    const vars = pickVars(t, { n, more: Math.max(0, n - 5) });
    const dots: StimulusSpec =
      t.representation === 'objects'
        ? {
            kind: 'objects',
            set: { count: n, sprite: 'shell', layout: 'scatter', layoutSeed: layoutSeed(rng) },
          }
        : arrangement === 'ten-frame' || arrangement === 'double-ten-frame'
          ? { kind: 'ten-frame', frames: n > 10 ? 2 : 1, filled: n > 10 ? [10, n - 10] : [n] }
          : { kind: 'dots', arrangement, groups };
    const overlay = tenFrameOverlay(n);
    let p: PartialOutput;
    switch (t.format) {
      case 'dot-flash':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'dot-flash',
            stimulus: dots,
            flashMs: asNum(params.flashMs, 1500),
            reflashes: 1,
            input: 'pad',
          },
          answer: { kind: 'number', value: n },
          overlay,
        };
        break;
      case 'numeral-pick': {
        const opts = numberOptions(t, params, n, rng);
        p = {
          params,
          vars,
          math: opts.diagnostic > 0 ? { ...math, 'distractors.diagnostic': opts.diagnostic } : math,
          widget: { format: 'numeral-pick', stimulus: dots, options: opts.options, layout: 'row' },
          answer: { kind: 'choice', id: numberOptionId(n) },
          overlay,
        };
        break;
      }
      case 'number-pad':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: dots,
            blanks: [{ id: 'n', maxDigits: 2 }],
            unit: null,
          },
          answer: { kind: 'number', value: n },
          overlay,
        };
        break;
      case 'make-set':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'make-set',
            target: n,
            mode: 'make',
            source: { sprite: 'finger', supply: 10 },
            container: 'hands',
            capacity: 10,
            showRunningCount: false,
          },
          answer: { kind: 'state', checker: 'set.count', target: { count: n } },
          highlight: [{ op: 'count-aloud' }],
        };
        break;
      case 'tenframe-fill':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'tenframe-fill',
            frames: n > 10 ? 2 : 1,
            size: 10,
            prefilled: [],
            goal: 'show-n',
            n,
            requireStandardFill: true,
            thenAsk: null,
            skin: 'frame',
          },
          answer: {
            kind: 'state',
            checker: 'tenframe.total',
            target: { n, requireStandardFill: true },
          },
          highlight: [{ op: 'highlight', args: { target: 'top-row' } }],
        };
        break;
      case 'rekenrek': {
        const preset: [number, number] = [Math.min(10, n), Math.max(0, n - 10)];
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'rekenrek',
            rows: n > 10 ? 2 : 1,
            preset,
            mode: 'read',
            rowRule: 'any',
            thenAsk: null,
          },
          answer: { kind: 'number', value: n },
          overlay,
        };
        break;
      }
      default:
        throw new Error(`subitize.flash cannot build ${t.format}`);
    }
    return finish(subitizeFlash, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const n = asNum(out.params.n);
    if (out.widget.format === 'make-set') {
      return {
        kind: 'state',
        value: { count: n, removed: 0, parts: [Math.min(5, n), Math.max(0, n - 5)] },
      };
    }
    const frames = n > 10 ? 2 : 1;
    const cells = Array.from({ length: frames }, (_, f) =>
      Array.from({ length: 10 }, (_, i) => (f * 10 + i < n ? 1 : 0)),
    );
    return { kind: 'state', value: { cells } };
  },
  solution(out): LessonStep[] {
    const n = asNum(out.params.n);
    const w = out.widget;
    switch (w.format) {
      case 'dot-flash':
        return [
          say('gen.subitize.flash.look', { n }, { op: 'show' }),
          say('gen.subitize.flash.total', { n }, { op: 'answer', args: { value: n } }),
        ];
      case 'numeral-pick':
        return [
          say('gen.subitize.flash.see-groups', { n }),
          say('gen.subitize.flash.total', { n }, { op: 'tap', args: { id: numberOptionId(n) } }),
        ];
      case 'number-pad':
        return [
          say('gen.subitize.flash.see-groups', { n }, { op: 'show-stimulus' }),
          say('gen.subitize.flash.total', { n }, { op: 'type', args: { blank: 'n', value: n } }),
        ];
      case 'make-set':
        return [
          say('gen.subitize.flash.show', { n }, { op: 'drag', args: { count: n } }),
          say('gen.subitize.flash.total', { n }, { op: 'close-container' }),
        ];
      case 'tenframe-fill':
        return [
          say(
            'gen.subitize.flash.show',
            { n },
            { op: 'place', args: { frame: 0, count: n, color: 'a' } },
          ),
          say('gen.subitize.flash.total', { n }, { op: 'count-total' }),
        ];
      case 'rekenrek':
        return [
          say(
            'gen.subitize.flash.see-groups',
            { n },
            { op: 'highlight', args: { row: 0, upTo: n } },
          ),
          say('gen.subitize.flash.total', { n }, { op: 'answer', args: { value: n } }),
        ];
      default:
        return [];
    }
  },
};
