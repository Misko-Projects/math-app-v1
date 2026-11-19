// compare.sets (03 §5.6): compare two groups of objects (CMP.01, CMP.05; ALG.05 later).
// Formats: compare, make-set, balance. The left group has `a` objects, the right group `b`.
//
// - compare: "which group has more / fewer?" (`ask`), answered `left`, `right` or `same`. With
//   `conflict`, the perceptual cue contradicts the number (CMP.05): one group is drawn with bigger
//   objects spread along its whole side (`layout: line`, `sizeVaries: true`), the other bunched
//   (`layout: array`, two rows). The bigger-looking group is the one with fewer objects, or either
//   group when they are equal. The concrete tier lets the child draw match lines first.
//   Representations: objects; dots (objects with the `dot` sprite, so the same cue works); ten-frame
//   and double-ten-frame (one frame picture per side; no conflict cue).
// - make-set: make the groups the same. The boat (a raft for the ten-frame representation) starts
//   with `a`; the other group has `b`, which the prompt names (MakeSetConfig shows no second group).
//   The child adds (`add-more`) or takes away (`take-away`) until the boat holds `b`. `ask` and
//   `conflict` do not apply.
// - balance: `a` and `b` identical objects on the two pans, tilt hidden. `ask: more` asks which side
//   goes down (`which-heavier`: the side with more), `ask: same` whether it balances (`judge`).

import type { LessonStep, ResponseValue, StimulusSpec } from '@number-island/shared';
import type { Rng } from '../../rng';
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
import {
  BALANCE_FEATURES,
  COMPARE_FEATURES,
  closeness,
  digits,
  featureSubset,
  type Side,
  say,
  sideAnswer,
} from './shared';

const ASKS = ['more', 'fewer', 'same'] as const;
const FRAMES = new Set(['ten-frame', 'double-ten-frame', 'five-frame']);

/** How one side of a compare item is drawn. */
type Look = 'plain' | 'big' | 'bunched';

function sideStimulus(n: number, rep: string, sprite: string, look: Look, rng: Rng): StimulusSpec {
  if (FRAMES.has(rep)) {
    const frames: 1 | 2 = n > 10 || rep === 'double-ten-frame' ? 2 : 1;
    return {
      kind: 'ten-frame',
      frames,
      filled: frames === 2 ? [Math.min(10, n), Math.max(0, n - 10)] : [n],
    };
  }
  return {
    kind: 'objects',
    set: {
      count: n,
      sprite: rep === 'dots' ? 'dot' : sprite,
      layout: look === 'bunched' ? 'array' : 'line',
      ...(look === 'bunched' ? { rows: 2 } : {}),
      ...(look === 'big' ? { sizeVaries: true } : {}),
      layoutSeed: layoutSeed(rng),
    },
  };
}

const isConflict = (v: unknown): boolean => v === true || v === 1;

export const compareSets: GeneratorDef = {
  id: 'compare.sets',
  formats: ['compare', 'make-set', 'balance'],
  params: {
    a: { type: 'int', default: { kind: 'int', min: 1, max: 10 }, doc: 'objects in the left group' },
    b: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 10 },
      doc: 'objects in the right group (make-set: the group to match)',
    },
    conflict: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'compare: the group with fewer objects looks bigger (bigger objects, spread out)',
    },
    ask: {
      type: 'string',
      values: [...ASKS],
      default: { kind: 'const', value: 'more' },
      doc: 'compare: more or fewer; balance: more (which side goes down) or same (does it balance); make-set ignores it',
    },
    sprite: {
      type: 'string',
      default: { kind: 'choice', values: [...DEFAULT_SPRITES] },
      doc: 'art-kit object sprite id (the dots representation always uses `dot`)',
    },
  },
  features: {
    'bigger.over5': { weight: 0.3, doc: 'max(0, max(a, b) − 5) / 5' },
    ...featureSubset(COMPARE_FEATURES, [
      'closeness',
      'conflict',
      'ask.fewer',
      'equal',
      'magnitude',
    ]),
    ...featureSubset(BALANCE_FEATURES, ['judge.false']),
  },
  narration: [
    'gen.compare.sets.match',
    'gen.compare.sets.left-over',
    'gen.compare.sets.count-each',
    'gen.compare.sets.not-size',
    'gen.compare.sets.has-more',
    'gen.compare.sets.has-fewer',
    'gen.compare.sets.same',
    'gen.compare.sets.boat-has',
    'gen.compare.sets.add-some',
    'gen.compare.sets.take-some',
    'gen.compare.sets.now-same',
    'gen.compare.sets.pan',
    'gen.compare.sets.goes-down',
    'gen.compare.sets.balances',
    'gen.compare.sets.not-balanced',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const a = asNum(p.a);
    const b = asNum(p.b);
    const ask = asStr(p.ask, 'more');
    const conflict = isConflict(p.conflict);
    const rep = t.representation ?? 'objects';
    if (a < 0 || b < 0 || a + b === 0 || Math.max(a, b) > 20) return false;
    switch (t.format) {
      case 'compare':
        if (ask !== 'more' && ask !== 'fewer') return false;
        // The cue needs objects to draw (frames have no size), a bunched side of two rows, and a
        // group on each side.
        if (conflict && (FRAMES.has(rep) || Math.min(a, b) < 1 || Math.max(a, b) < 2)) return false;
        return rep !== 'five-frame' || Math.max(a, b) <= 5;
      case 'make-set':
        return a !== b && !conflict;
      case 'balance':
        return (ask === 'more' || ask === 'same') && !conflict;
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const a = asNum(params.a);
    const b = asNum(params.b);
    const ask = asStr(params.ask, 'more');
    const conflict = isConflict(params.conflict);
    const sprite = asStr(params.sprite, 'shell');
    const rep = t.representation ?? 'objects';
    const vars = pickVars(t, { a, b, ask: ask === 'fewer' ? 'fewer' : 'more' });
    const math: Record<string, number> = { 'bigger.over5': Math.max(0, Math.max(a, b) - 5) / 5 };
    let p: PartialOutput;
    switch (t.format) {
      case 'compare': {
        // The bigger-looking side: the fewer group, or (equal groups) either one. Which side is
        // drawn big never changes a feature.
        const big: 'left' | 'right' | null = !conflict
          ? null
          : a < b
            ? 'left'
            : a > b
              ? 'right'
              : rng.fork('layout').bool(0.5)
                ? 'left'
                : 'right';
        const look = (side: 'left' | 'right'): Look =>
          big === null ? 'plain' : big === side ? 'big' : 'bunched';
        const concrete = t.tier === 'concrete';
        p = {
          params,
          vars,
          math: {
            ...math,
            closeness: closeness(a, b),
            conflict: conflict ? 1 : 0,
            'ask.fewer': ask === 'fewer' ? 1 : 0,
            equal: a === b ? 1 : 0,
            magnitude: digits(Math.max(a, b)) - 1,
          },
          widget: {
            format: 'compare',
            left: sideStimulus(a, rep, sprite, look('left'), rng.fork('left')),
            right: sideStimulus(b, rep, sprite, look('right'), rng.fork('right')),
            ask: ask === 'fewer' ? 'fewer' : 'more',
            allowMatchLines: concrete,
          },
          answer: { kind: 'choice', id: sideAnswer(a, b, ask === 'fewer' ? 'fewer' : 'more') },
          ...(concrete
            ? {
                nudge: [{ op: 'match', args: { left: 0, right: 0 } }],
                highlight: [{ op: 'match', args: { left: 0, right: 0 } }],
              }
            : {}),
        };
        break;
      }
      case 'make-set': {
        const raft = rep === 'ten-frame';
        p = {
          params,
          vars,
          math: {},
          widget: {
            format: 'make-set',
            target: b,
            mode: b > a ? 'add-more' : 'take-away',
            start: a,
            source: { sprite, supply: Math.max(0, b - a) + 3 },
            container: raft ? 'raft' : 'boat',
            capacity: Math.max(a, b) > 10 ? 20 : 10,
            showRunningCount: false,
          },
          answer: { kind: 'state', checker: 'set.count', target: { count: b } },
          nudge: [{ op: 'count-aloud' }],
          highlight: [{ op: 'count-aloud' }],
        };
        break;
      }
      case 'balance': {
        const judge = ask === 'same';
        p = {
          params,
          vars,
          math: {
            ...math,
            closeness: closeness(a, b),
            equal: a === b ? 1 : 0,
            ...(judge ? { 'judge.false': a !== b ? 1 : 0 } : {}),
          },
          widget: {
            format: 'balance',
            left: { terms: [{ object: sprite, count: a }] },
            right: { terms: [{ object: sprite, count: b }] },
            mode: judge ? 'judge' : 'which-heavier',
            objectWeights: { [sprite]: 1 },
            showTilt: false,
          },
          answer: {
            kind: 'choice',
            id: judge ? (a === b ? 'true' : 'false') : sideAnswer(a, b, 'more'),
          },
        };
        break;
      }
      default:
        throw new Error(`compare.sets cannot build ${t.format}`);
    }
    return finish(compareSets, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    if (out.widget.format !== 'make-set') throw new Error('compare.sets: no example state');
    const w = out.widget;
    const start = w.start ?? 0;
    if (w.mode === 'take-away') {
      const removed = start - w.target;
      return { kind: 'state', value: { count: w.target, removed, parts: [w.target, removed] } };
    }
    return { kind: 'state', value: { count: w.target, removed: 0 } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const id = out.answer.kind === 'choice' ? out.answer.id : 'same';
    switch (w.format) {
      case 'compare': {
        const steps: LessonStep[] = [];
        if (isConflict(out.params.conflict)) steps.push(say('gen.compare.sets.not-size', {}));
        if (w.allowMatchLines) {
          steps.push(
            say('gen.compare.sets.match', {}, { op: 'match', args: { left: 0, right: 0 } }),
            say('gen.compare.sets.left-over', {}),
          );
        } else {
          steps.push(say('gen.compare.sets.count-each', {}));
        }
        const last =
          (id as Side) === 'same'
            ? 'gen.compare.sets.same'
            : w.ask === 'fewer'
              ? 'gen.compare.sets.has-fewer'
              : 'gen.compare.sets.has-more';
        steps.push(say(last, {}, { op: 'answer', args: { id } }));
        return steps;
      }
      case 'make-set': {
        const start = w.start ?? 0;
        return [
          say('gen.compare.sets.boat-has', { n: start }, { op: 'count-aloud' }),
          w.mode === 'take-away'
            ? say(
                'gen.compare.sets.take-some',
                {},
                { op: 'remove', args: { count: start - w.target } },
              )
            : say(
                'gen.compare.sets.add-some',
                {},
                { op: 'drag', args: { count: w.target - start } },
              ),
          say('gen.compare.sets.now-same', { n: w.target }, { op: 'close-container' }),
        ];
      }
      case 'balance': {
        const last =
          w.mode === 'judge'
            ? id === 'true'
              ? 'gen.compare.sets.balances'
              : 'gen.compare.sets.not-balanced'
            : id === 'same'
              ? 'gen.compare.sets.balances'
              : 'gen.compare.sets.goes-down';
        return [
          say('gen.compare.sets.pan', {}, { op: 'highlight-side', args: { side: 'left' } }),
          say('gen.compare.sets.pan', {}, { op: 'highlight-side', args: { side: 'right' } }),
          say(last, {}, { op: 'answer', args: { id } }),
        ];
      }
      default:
        return [];
    }
  },
};
