// count.set (03 §5.6): count a set, make a set, or find the numeral for a set.
// Formats: tap-count, make-set, dot-flash, numeral-pick, number-pad, tenframe-fill.

import type {
  ItemFormat,
  LessonStep,
  ObjectSet,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
import {
  asNum,
  asStr,
  correctFromAnswer,
  DEFAULT_SPRITES,
  finish,
  layoutSeed,
  numberOptions,
  type PartialOutput,
  pickVars,
  sampleAll,
  tenFrameOverlay,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const LAYOUTS = [
  'line',
  'array',
  'circle',
  'scatter',
  'ten-frame',
  'double-ten-frame',
  'dice',
  'groups',
] as const;
type Layout = (typeof LAYOUTS)[number];
const MODES = ['how-many', 'make', 'take-away', 'add-more', 'zero'];

/** Formats with their own size feature; count.over5 is emitted only for the others. */
const SIZED_FORMATS = new Set<ItemFormat>(['make-set', 'tenframe-fill', 'dot-flash']);

function objectSet(n: number, sprite: string, layout: Layout, seed: number): ObjectSet {
  // A ten-frame holds 10; larger sets use the double frame. Dice show up to 6 per die.
  const lay: Layout = layout === 'ten-frame' && n > 10 ? 'double-ten-frame' : layout;
  const set: ObjectSet = { count: n, sprite, layout: lay, layoutSeed: seed };
  if (lay === 'array') set.rows = n > 10 ? 4 : 2;
  if (lay === 'dice' || lay === 'groups') {
    const groups: number[] = [];
    for (let left = n; left > 0; left -= Math.min(lay === 'dice' ? 6 : 5, left)) {
      groups.push(Math.min(lay === 'dice' ? 6 : 5, left));
    }
    set.groups = groups;
  }
  return set;
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const countSet: GeneratorDef = {
  id: 'count.set',
  formats: ['tap-count', 'make-set', 'dot-flash', 'numeral-pick', 'number-pad', 'tenframe-fill'],
  params: {
    n: { type: 'int', default: { kind: 'int', min: 1, max: 10 }, doc: 'the count' },
    layout: {
      type: 'string',
      values: [...LAYOUTS],
      default: { kind: 'const', value: 'line' },
      doc: 'object layout',
    },
    sprite: {
      type: 'string',
      default: { kind: 'choice', values: [...DEFAULT_SPRITES] },
      doc: 'art-kit object sprite id',
    },
    mode: {
      type: 'string',
      values: MODES,
      default: { kind: 'const', value: 'how-many' },
      doc: 'how-many, make, take-away, add-more, or zero (CNT.13: an empty set)',
    },
    start: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'objects already in the container (add-more, take-away)',
    },
    groupsOf: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: '10: every full ten must be bundled (CNT.19); 0: no bundling',
    },
  },
  features: {
    teen: { weight: 0.4, doc: 'n ≥ 11' },
    zero: { weight: 0.3, doc: 'n = 0' },
    'n.over20': { weight: 0.5, doc: 'max(0, n − 20) / 10' },
    'count.over5': {
      weight: 0.5,
      doc: 'max(0, n − 5) / 5, for formats without their own size feature',
    },
  },
  narration: [
    'gen.count.set.touch-count',
    'gen.count.set.last-number',
    'gen.count.set.drag',
    'gen.count.set.take-away',
    'gen.count.set.bundle',
    'gen.count.set.count-picture',
    'gen.count.set.pick',
    'gen.count.set.type',
    'gen.count.set.fill-frame',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  // Zero mode (CNT.13) is an empty set: the template's `n` domain must allow 0, and draws of any
  // other n are rejected rather than overwritten (03 §9.4 step 2).
  accepts: (p) => p.mode !== 'zero' || p.n === 0,
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const n = asNum(params.n);
    const mode = asStr(params.mode, 'how-many');
    const start = asNum(params.start);
    const sprite = asStr(params.sprite, 'shell');
    const layout = asStr(params.layout, 'line') as Layout;
    const vars = pickVars(t, { n, start, more: Math.max(0, n - start) });
    const math: Record<string, number> = {
      teen: n >= 11 ? 1 : 0,
      zero: n === 0 ? 1 : 0,
      'n.over20': Math.max(0, n - 20) / 10,
    };
    if (!SIZED_FORMATS.has(t.format)) math['count.over5'] = Math.max(0, n - 5) / 5;
    const set = objectSet(n, sprite, layout, layoutSeed(rng));
    const picture: StimulusSpec = { kind: 'objects', set };
    const overlay = tenFrameOverlay(n);
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
            mode: 'how-many',
            input: concrete ? 'auto' : 'pad',
            marks: concrete,
            countAloud: concrete,
          },
          answer: { kind: 'number', value: n },
          nudge: n > 0 ? [{ op: 'tap', args: { index: 0 } }] : [],
          highlight: [{ op: 'count-aloud', args: { upTo: Math.min(n, 2) } }],
        };
        break;
      }
      case 'make-set': {
        const hands = t.representation === 'fingers';
        const raft = t.representation === 'ten-frame';
        const startIn = mode === 'add-more' || mode === 'take-away' ? start : 0;
        const capacity = hands ? 10 : Math.max(n, startIn) > 10 ? 20 : 10;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'make-set',
            target: n,
            mode: mode === 'add-more' ? 'add-more' : mode === 'take-away' ? 'take-away' : 'make',
            ...(startIn > 0 || mode === 'take-away' ? { start: startIn } : {}),
            source: { sprite, supply: Math.max(0, n - startIn) + 3 },
            container: hands ? 'hands' : raft ? 'raft' : 'boat',
            capacity,
            showRunningCount: false,
            ...(asNum(params.groupsOf) === 10 ? { groupsOf: 10 as const } : {}),
          },
          answer: {
            kind: 'state',
            checker: 'set.count',
            target: { count: n, ...(asNum(params.groupsOf) === 10 ? { groupsOf: 10 } : {}) },
          },
          nudge: [{ op: 'count-aloud' }],
          highlight: [{ op: 'count-aloud' }],
        };
        break;
      }
      case 'dot-flash':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'dot-flash',
            stimulus: picture,
            flashMs: 1500,
            reflashes: 1,
            input: 'pad',
          },
          answer: { kind: 'number', value: n },
          overlay,
        };
        break;
      case 'numeral-pick': {
        const opts = numberOptions(t, params, n, rng);
        math['distractors.diagnostic'] = opts.diagnostic;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'numeral-pick',
            stimulus: picture,
            options: opts.options,
            layout: 'row',
          },
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
            stimulus: picture,
            blanks: [{ id: 'n', maxDigits: 2 }],
            unit: null,
          },
          answer: { kind: 'number', value: n },
          overlay,
        };
        break;
      case 'tenframe-fill': {
        const frames: 1 | 2 = n > 10 ? 2 : 1;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'tenframe-fill',
            frames,
            size: 10,
            prefilled: [],
            goal: 'show-n',
            n,
            requireStandardFill: false,
            thenAsk: null,
            skin: 'frame',
          },
          answer: { kind: 'state', checker: 'tenframe.total', target: { n } },
          highlight: [{ op: 'highlight', args: { target: 'top-row' } }],
        };
        break;
      }
      default:
        throw new Error(`count.set cannot build ${t.format}`);
    }
    return finish(countSet, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    if (out.widget.format === 'make-set') {
      const w = out.widget;
      const count = w.target;
      const removed = w.mode === 'take-away' ? Math.max(0, (w.start ?? 0) - count) : 0;
      const value: Record<string, unknown> = { count, removed };
      if (w.container === 'hands') value.parts = [Math.min(5, count), Math.max(0, count - 5)];
      else if (w.mode === 'take-away') value.parts = [count, removed];
      if (w.groupsOf) value.bundles = Math.floor(count / 10);
      return { kind: 'state', value };
    }
    if (out.widget.format === 'tenframe-fill') {
      const n = out.widget.n ?? 0;
      const cells = Array.from({ length: out.widget.frames }, (_, f) =>
        Array.from({ length: 10 }, (_, i) => (f * 10 + i < n ? 1 : 0)),
      );
      return { kind: 'state', value: { cells } };
    }
    throw new Error(`count.set: no example for ${out.widget.format}`);
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    switch (w.format) {
      case 'tap-count': {
        const n = w.set.count;
        return [
          say('gen.count.set.touch-count', { n }, { op: 'count-aloud', args: { upTo: n } }),
          say('gen.count.set.last-number', { n }, { op: 'say-total' }),
        ];
      }
      case 'make-set': {
        const start = w.start ?? 0;
        const steps: LessonStep[] = [];
        if (w.mode === 'take-away') {
          steps.push(
            say(
              'gen.count.set.take-away',
              { n: w.target },
              {
                op: 'remove',
                args: { count: Math.max(0, start - w.target) },
              },
            ),
          );
        } else {
          steps.push(
            say(
              'gen.count.set.drag',
              { n: w.target },
              {
                op: 'drag',
                args: { count: Math.max(0, w.target - start) },
              },
            ),
          );
        }
        if (w.groupsOf) steps.push(say('gen.count.set.bundle', { n: w.target }, { op: 'bundle' }));
        steps.push(say('gen.count.set.last-number', { n: w.target }, { op: 'close-container' }));
        return steps;
      }
      case 'numeral-pick': {
        const n = out.answer.kind === 'choice' ? Number(out.answer.id.slice(4)) : 0;
        return [
          say('gen.count.set.count-picture', { n }),
          say('gen.count.set.pick', { n }, { op: 'tap', args: { id: numberOptionId(n) } }),
        ];
      }
      case 'number-pad':
      case 'dot-flash': {
        const n = out.answer.kind === 'number' ? out.answer.value : 0;
        return [
          say('gen.count.set.count-picture', { n }),
          say(
            'gen.count.set.type',
            { n },
            w.format === 'number-pad'
              ? { op: 'type', args: { blank: 'n', value: n } }
              : { op: 'answer', args: { value: n } },
          ),
        ];
      }
      case 'tenframe-fill': {
        const n = w.n ?? 0;
        return [
          say(
            'gen.count.set.fill-frame',
            { n },
            { op: 'place', args: { frame: 0, count: n, color: 'a' } },
          ),
          say('gen.count.set.last-number', { n }, { op: 'count-total' }),
        ];
      }
      default:
        return [];
    }
  },
};
