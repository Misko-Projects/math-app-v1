// subitize.flash (03 §5.6): see a small quantity at a glance, or build it in a structured frame.
// Formats: dot-flash, numeral-pick, number-pad, make-set, tenframe-fill, rekenrek, number-bond.

import type {
  LessonStep,
  ObjectSet,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
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

/** Formats with their own size feature (n.over4, target.over5, whole.over5): no n.over5 there. */
const SIZED = new Set(['dot-flash', 'make-set', 'number-bond']);

/**
 * The visible groups of an arrangement (03 §5.1 StimulusSpec `dots.groups`). For `groups`, `part`
 * (> 0 and < n) fixes the first group's size and the rest of n is split as evenly as possible over
 * the other groups. `groups` 0 means automatic: 2 when n ≥ 6 or a part is given, else 1.
 */
export function arrangementGroups(
  n: number,
  arrangement: Arrangement,
  groups: number,
  part = 0,
): number[] {
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
      const hasPart = part > 0 && part < n;
      const k = Math.max(1, Math.min(groups > 0 ? groups : n >= 6 || hasPart ? 2 : 1, n));
      if (hasPart && k >= 2) return [part, ...evenSplit(n - part, k - 1)];
      return evenSplit(n, k);
    }
    default:
      return [n];
  }
}

/**
 * The groups an item shows. A number bond always has two parts: an arrangement that shows one
 * group (dice up to 6, a small `groups` set) is split evenly in two.
 */
function itemGroups(p: ParamValues, format: string): number[] {
  const n = asNum(p.n);
  const groups = arrangementGroups(
    n,
    asStr(p.arrangement, 'dice') as Arrangement,
    asNum(p.groups),
    asNum(p.part),
  );
  if (format === 'number-bond' && groups.filter((g) => g > 0).length === 1 && n >= 2) {
    return evenSplit(n, 2);
  }
  return groups;
}

/** `total` split into `count` groups as evenly as possible, larger groups first. */
function evenSplit(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => base + (i < total % count ? 1 : 0));
}

/** Objects (shells) laid out like the arrangement: in groups, in a dice pattern, or scattered. */
function objectSet(n: number, arrangement: Arrangement, groups: number[], seed: number): ObjectSet {
  if (arrangement === 'groups') {
    return { count: n, sprite: 'shell', layout: 'groups', groups, layoutSeed: seed };
  }
  return {
    count: n,
    sprite: 'shell',
    layout: arrangement === 'dice' ? 'dice' : 'scatter',
    layoutSeed: seed,
  };
}

/** The non-empty groups a dots or objects stimulus shows. */
function stimulusParts(s: StimulusSpec): number[] {
  switch (s.kind) {
    case 'dots':
      return s.groups.filter((g) => g > 0);
    case 'objects':
      return (s.set.groups ?? [s.set.count]).filter((g) => g > 0);
    default:
      return [];
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
  formats: [
    'dot-flash',
    'numeral-pick',
    'number-pad',
    'make-set',
    'tenframe-fill',
    'rekenrek',
    'number-bond',
  ],
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
    part: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: "size of the first group for the 'groups' arrangement (0: even split)",
    },
    flashMs: {
      type: 'int',
      default: { kind: 'const', value: 1500 },
      doc: 'flash time in ms (1500 for K, 1000 for G1+)',
    },
  },
  features: {
    'n.upTo4': {
      weight: 0.15,
      doc: 'min(n, 4) − 1: size inside the perceptual range (1 is instant, 4 the slowest)',
    },
    'n.over5': {
      weight: 0.3,
      doc: 'max(0, n − 5) / 5, on formats without their own size feature (not dot-flash, make-set, number-bond)',
    },
    conceptual: { weight: 0.3, doc: '≥ 2 visible groups (conceptual subitizing)' },
    'group.over3': {
      weight: 0.2,
      doc: "max(0, largest group − 3) in a 'groups' arrangement of ≥ 2 groups (frames, dice and fingers show 5 as a known pattern)",
    },
    teen: { weight: 0.5, doc: 'n ≥ 11' },
    placeValue: { weight: 0.4, doc: 'a full ten plus ones' },
    multiplicative: { weight: 0.5, doc: '≥ 3 equal groups' },
  },
  narration: [
    'gen.subitize.flash.look',
    'gen.subitize.flash.see-groups',
    'gen.subitize.flash.parts',
    'gen.subitize.flash.total',
    'gen.subitize.flash.show',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const n = asNum(p.n);
    const part = asNum(p.part);
    const arrangement = asStr(p.arrangement, 'dice') as Arrangement;
    // A given part must leave something for the other group(s).
    if (arrangement === 'groups' && part > 0 && part >= n) return false;
    // A number bond shows exactly two parts.
    if (t.format === 'number-bond')
      return itemGroups(p, t.format).filter((g) => g > 0).length === 2;
    return true;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const n = asNum(params.n);
    const arrangement = asStr(params.arrangement, 'dice') as Arrangement;
    const groups = itemGroups(params, t.format);
    const visible = groups.filter((g) => g > 0);
    const a = visible[0] ?? 0;
    const b = visible[1] ?? 0;
    const math: Record<string, number> = {
      'n.upTo4': Math.max(0, Math.min(n, 4) - 1),
      conceptual: visible.length >= 2 ? 1 : 0,
      'group.over3':
        arrangement === 'groups' && visible.length >= 2 ? Math.max(0, Math.max(...visible) - 3) : 0,
      teen: n >= 11 ? 1 : 0,
      // A full ten plus ones: teen quantities shown in ten-frames (or with a group of ten).
      placeValue:
        n > 10 &&
        (arrangement === 'ten-frame' || arrangement === 'double-ten-frame' || groups[0] === 10)
          ? 1
          : 0,
      multiplicative: visible.length >= 3 && visible.every((g) => g === visible[0]) ? 1 : 0,
    };
    // Formats with their own size feature measure size there; n.over5 covers the rest.
    if (!SIZED.has(t.format)) math['n.over5'] = Math.max(0, n - 5) / 5;
    const vars = pickVars(t, { n, more: Math.max(0, n - 5), a, b });
    const dots: StimulusSpec =
      t.representation === 'objects'
        ? { kind: 'objects', set: objectSet(n, arrangement, groups, layoutSeed(rng)) }
        : t.representation === 'symbols'
          ? { kind: 'none' } // abstract tier: the numbers are in the prompt only
          : arrangement === 'ten-frame' || arrangement === 'double-ten-frame'
            ? { kind: 'ten-frame', frames: n > 10 ? 2 : 1, filled: n > 10 ? [10, n - 10] : [n] }
            : { kind: 'dots', arrangement, groups };
    // The level-3 picture: a ten-frame, coloured by part when the item shows two groups.
    const overlay = visible.length === 2 ? tenFrameOverlay(n, [a, b]) : tenFrameOverlay(n);
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
      case 'number-bond':
        // The two groups are the parts (counters on the concrete tier); the child names the whole.
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-bond',
            whole: null,
            parts: [a, b],
            mode: 'missing-whole',
            counters: t.tier === 'concrete',
            nonZero: true,
          },
          answer: { kind: 'number', value: n },
          nudge: [{ op: 'highlight', args: { slot: 'part-0' } }],
          highlight: [{ op: 'highlight', args: { slot: 'part-1' } }],
          overlay,
        };
        break;
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
      case 'dot-flash': {
        const shown = stimulusParts(w.stimulus);
        const [a, b] = shown;
        return [
          say('gen.subitize.flash.look', { n }, { op: 'show' }),
          // Two visible groups: name the parts before the total (3 and 4 make 7).
          ...(shown.length === 2 && a !== undefined && b !== undefined
            ? [
                say(
                  'gen.subitize.flash.parts',
                  { a, b },
                  { op: 'circle-groups', args: { groups: shown } },
                ),
              ]
            : []),
          say('gen.subitize.flash.total', { n }, { op: 'answer', args: { value: n } }),
        ];
      }
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
      case 'number-bond': {
        const a = w.parts[0] ?? 0;
        const b = w.parts[1] ?? 0;
        return [
          say('gen.subitize.flash.parts', { a, b }, { op: 'highlight', args: { slot: 'whole' } }),
          say('gen.subitize.flash.total', { n }, { op: 'fill', args: { slot: 'whole', value: n } }),
        ];
      }
      default:
        return [];
    }
  },
};
