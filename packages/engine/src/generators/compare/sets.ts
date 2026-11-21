// compare.sets (03 §5.6): compare two groups of objects (CMP.01, CMP.05, ALG.05).
// Formats: compare, make-set, balance, order. The left group has `a` objects, the right group `b`.
//
// - compare: "which group has more / fewer?" (`ask`), answered `left`, `right` or `same`; or
//   `ask: same` (ALG.05): "do both groups have the same?" (`same-or-not`, answered `same` or
//   `not-same`, no conflict cue). With
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
// - order: put three groups (`a`, `b` and `c`, all different) in order, fewest first (`ask: fewer`)
//   or most first (`ask: more`). Each card is a picture of its group with no numeral. With
//   `conflict` the looks run against the counts: the fewest group is drawn big and spread out, the
//   middle one plain, the most bunched in two rows (no conflict cue on frames).
// - balance: `a` and `b` identical objects on the two pans, tilt hidden. `ask: more` asks which side
//   goes down (`which-heavier`: the side with more), `ask: same` whether it balances (`judge`).
//   `ask: make` (ALG.05, a ≠ b) is make-equal: the child adds objects (one unit each) until the pans
//   balance, checked by balance.equal `{ left: a, right: b }`; the tilt shows at the concrete tier.

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

const ASKS = ['more', 'fewer', 'same', 'make'] as const;
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
  formats: ['compare', 'make-set', 'balance', 'order'],
  params: {
    a: { type: 'int', default: { kind: 'int', min: 1, max: 10 }, doc: 'objects in the left group' },
    b: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 10 },
      doc: 'objects in the right group (make-set: the group to match)',
    },
    c: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 10 },
      doc: 'order: the third group (1–20, unlike a and b); the other formats ignore it',
    },
    conflict: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'compare and order: the group with fewer objects looks bigger (bigger objects, spread out)',
    },
    ask: {
      type: 'string',
      values: [...ASKS],
      default: { kind: 'const', value: 'more' },
      doc: 'compare: more, fewer or same (same-or-not); order: more (most first) or fewer (fewest first); balance: more (which side goes down), same (does it balance) or make (make-equal); make-set ignores it',
    },
    sprite: {
      type: 'string',
      default: { kind: 'choice', values: [...DEFAULT_SPRITES] },
      doc: 'art-kit object sprite id (the dots representation always uses `dot`)',
    },
  },
  features: {
    'bigger.over5': { weight: 0.3, doc: 'max(0, largest group − 5) / 5' },
    gap: { weight: 0.4, doc: 'balance make-equal: (objects to add − 1) / 5' },
    ...featureSubset(COMPARE_FEATURES, [
      'closeness',
      'conflict',
      'ask.fewer',
      'equal',
      'magnitude',
    ]),
    ...featureSubset(BALANCE_FEATURES, ['judge.false', 'showTilt.off']),
  },
  narration: [
    // its descending order retry line (items/check.ts retryFeedback)
    'fb.order.retry-desc',
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
    'gen.compare.sets.order-fewest',
    'gen.compare.sets.order-most',
    'gen.compare.sets.order-next',
    'gen.compare.sets.pan',
    'gen.compare.sets.goes-down',
    'gen.compare.sets.balances',
    'gen.compare.sets.not-balanced',
    'gen.compare.sets.not-same',
    'gen.compare.sets.add-to-balance',
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
        if (ask === 'same') return !conflict && (rep !== 'five-frame' || Math.max(a, b) <= 5);
        if (ask !== 'more' && ask !== 'fewer') return false;
        // The cue needs objects to draw (frames have no size), a bunched side of two rows, and a
        // group on each side.
        if (conflict && (FRAMES.has(rep) || Math.min(a, b) < 1 || Math.max(a, b) < 2)) return false;
        return rep !== 'five-frame' || Math.max(a, b) <= 5;
      case 'make-set':
        return a !== b && !conflict;
      case 'balance':
        if (ask === 'make') return a !== b && !conflict;
        return (ask === 'more' || ask === 'same') && !conflict;
      case 'order': {
        // Three different non-empty groups: with a third group the order is more than a guess.
        const c = asNum(p.c);
        if (Math.min(a, b) < 1 || c < 1 || c > 20 || new Set([a, b, c]).size !== 3) return false;
        if (ask !== 'more' && ask !== 'fewer') return false;
        if (conflict && FRAMES.has(rep)) return false;
        return rep !== 'five-frame' || Math.max(a, b, c) <= 5;
      }
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
        const sameOrNot = ask === 'same';
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
            ask: sameOrNot ? 'same-or-not' : ask === 'fewer' ? 'fewer' : 'more',
            allowMatchLines: concrete,
          },
          answer: {
            kind: 'choice',
            id: sameOrNot
              ? a === b
                ? 'same'
                : 'not-same'
              : sideAnswer(a, b, ask === 'fewer' ? 'fewer' : 'more'),
          },
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
      case 'order': {
        const values = [a, b, asNum(params.c)];
        const [fewest, , most] = [...values].sort((x, y) => x - y);
        // The looks run against the counts: the fewest looks biggest, the most smallest.
        const lookOf = (v: number): Look =>
          !conflict ? 'plain' : v === fewest ? 'big' : v === most ? 'bunched' : 'plain';
        const desc = ask === 'more';
        p = {
          params,
          vars,
          math: {
            'bigger.over5': Math.max(0, Math.max(...values) - 5) / 5,
            conflict: conflict ? 1 : 0,
          },
          widget: {
            format: 'order',
            items: rng
              .fork('layout')
              .shuffle(values)
              .map((v, i) => ({
                id: `item-${i}`,
                value: v,
                stimulus: sideStimulus(v, rep, sprite, lookOf(v), rng.fork(`item-${i}`)),
              })),
            direction: desc ? 'desc' : 'asc',
          },
          answer: {
            kind: 'numbers',
            values: [...values].sort((x, y) => (desc ? y - x : x - y)),
            ordered: true,
          },
        };
        break;
      }
      case 'balance': {
        if (ask === 'make') {
          // Make-equal (ALG.05): add objects to the lighter pan until it balances. Closer pans
          // need fewer objects, so the difficulty grows with the gap, not with closeness.
          const showTilt = t.tier === 'concrete';
          p = {
            params,
            vars,
            math: {
              ...math,
              gap: Math.max(0, Math.abs(a - b) - 1) / 5,
              'showTilt.off': showTilt ? 0 : 1,
            },
            widget: {
              format: 'balance',
              left: { terms: [{ object: sprite, count: a }] },
              right: { terms: [{ object: sprite, count: b }] },
              mode: 'make-equal',
              objectWeights: { [sprite]: 1 },
              showTilt,
            },
            answer: { kind: 'state', checker: 'balance.equal', target: { left: a, right: b } },
          };
          break;
        }
        const judge = ask === 'same';
        p = {
          params,
          vars,
          math: {
            ...math,
            closeness: closeness(a, b),
            equal: a === b ? 1 : 0,
            'showTilt.off': 1,
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
    if (out.widget.format === 'balance') {
      const { left, right } = out.answer.target as { left: number; right: number };
      return {
        kind: 'state',
        value: { left: Math.max(0, right - left), right: Math.max(0, left - right) },
      };
    }
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
            : id === 'not-same'
              ? 'gen.compare.sets.not-same'
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
      case 'order': {
        const desc = w.direction === 'desc';
        const sorted = [...w.items].sort((x, y) => (desc ? y.value - x.value : x.value - y.value));
        return [
          ...(isConflict(out.params.conflict) ? [say('gen.compare.sets.not-size', {})] : []),
          say('gen.compare.sets.count-each', {}),
          ...sorted.map((item, slot) =>
            say(
              slot > 0
                ? 'gen.compare.sets.order-next'
                : desc
                  ? 'gen.compare.sets.order-most'
                  : 'gen.compare.sets.order-fewest',
              {},
              { op: 'drag', args: { id: item.id, slot } },
            ),
          ),
        ];
      }
      case 'balance': {
        if (w.mode === 'make-equal' && out.answer.kind === 'state') {
          const { left, right } = out.answer.target as { left: number; right: number };
          const side = left < right ? 'left' : 'right';
          const sprite = asStr(out.params.sprite, 'shell');
          return [
            say('gen.compare.sets.pan', {}, { op: 'highlight-side', args: { side: 'left' } }),
            say('gen.compare.sets.pan', {}, { op: 'highlight-side', args: { side: 'right' } }),
            say(
              'gen.compare.sets.add-to-balance',
              { n: Math.abs(left - right) },
              {
                op: 'place',
                args: { side, term: { object: sprite, count: 1 }, count: Math.abs(left - right) },
              },
            ),
          ];
        }
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
