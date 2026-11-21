// pattern.repeat (03 §5.6): repeating patterns (ALG.01, ALG.04). A `core` (AB, AAB, ABB, ABC,
// AABB) repeats; `theme` picks the units (island objects, or coloured shapes with the `shapes`
// representation), so every token is a function of the params.
// - pattern-extend `extend`: the first `shown` tokens, then `ask` blanks to fill (pattern.tokens).
// - pattern-extend `fill`: `shown` tokens with `ask` of them hidden, ending one before the last
//   (`hidden.middle`, pattern.tokens).
// - pattern-extend `core`: `shown` tokens (at least two repeats); the child brackets the first
//   repeat of the core (select.exactSet `{ values }`: its indices).
// - order: the whole pattern as cards, the first `shown` fixed in their slots; the child puts the
//   next `ask` cards (all different units) in order. Card value = position (1, 2, …). With
//   `mode: core` (ALG.04, "make the next repeat") the fixed cards end on a core boundary and the
//   free cards are exactly one whole core: `shown % coreLen == 0`, `ask == coreLen` (PR #84 review),
//   so the core has no repeated unit (AB, ABC).
// Formats: pattern-extend, order.

import type { LessonStep, PatternToken, ResponseValue, StimulusSpec } from '@number-island/shared';
import {
  asNum,
  asStr,
  finish,
  layoutSeed,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

export const CORES = ['AB', 'AAB', 'ABB', 'ABC', 'AABB'] as const;
const MODES = ['extend', 'fill', 'core'] as const;

/** Object units by theme (art-kit sprites). */
export const OBJECT_THEMES: readonly (readonly string[])[] = [
  ['shell', 'fish', 'crab'],
  ['leaf', 'starfish', 'shell'],
  ['fish', 'leaf', 'starfish'],
  ['crab', 'shell', 'leaf'],
];

/** Shape units by theme: each unit differs in both shape and colour. */
export const SHAPE_THEMES: readonly (readonly PatternToken[])[] = [
  [
    { sprite: 'circle', color: 'red' },
    { sprite: 'square', color: 'blue' },
    { sprite: 'triangle', color: 'yellow' },
  ],
  [
    { sprite: 'square', color: 'yellow' },
    { sprite: 'circle', color: 'blue' },
    { sprite: 'triangle', color: 'red' },
  ],
  [
    { sprite: 'triangle', color: 'blue' },
    { sprite: 'circle', color: 'yellow' },
    { sprite: 'square', color: 'red' },
  ],
  [
    { sprite: 'circle', color: 'yellow' },
    { sprite: 'triangle', color: 'red' },
    { sprite: 'square', color: 'blue' },
  ],
];

const unitIndex = (letter: string): number => letter.charCodeAt(0) - 65;

/** The units of a theme (A, B, C order). */
export function themeUnits(theme: number, shapes: boolean): PatternToken[] {
  if (shapes) return [...(SHAPE_THEMES[theme % SHAPE_THEMES.length] ?? [])];
  return (OBJECT_THEMES[theme % OBJECT_THEMES.length] ?? []).map((sprite) => ({ sprite }));
}

/** The token at position i of the pattern. */
export function tokenAt(core: string, units: PatternToken[], i: number): PatternToken {
  return units[unitIndex(core[i % core.length] as string)] as PatternToken;
}

/** fill: the first hidden position (the gap ends one before the last token). */
export const fillStart = (shown: number, ask: number): number => shown - 1 - ask;

const say = (key: string, action?: LessonStep['action']): LessonStep =>
  action ? { actor: 'demo', say: key, vars: {}, action } : { actor: 'demo', say: key, vars: {} };

const tokenSprite = (t: PatternToken): string => ('sprite' in t ? t.sprite : 'shell');

export const patternRepeat: GeneratorDef = {
  id: 'pattern.repeat',
  formats: ['pattern-extend', 'order'],
  params: {
    core: {
      type: 'string',
      values: [...CORES],
      default: { kind: 'choice', values: [...CORES] },
      doc: 'the part that repeats: AB, AAB, ABB, ABC or AABB',
    },
    shown: {
      type: 'int',
      default: { kind: 'int', min: 4, max: 8 },
      doc: 'tokens shown (core: at least two repeats; fill: the length with the gap)',
    },
    ask: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 2 },
      doc: 'tokens the child places (extend, fill, order)',
    },
    theme: {
      type: 'int',
      default: { kind: 'int', min: 0, max: 3 },
      doc: 'which units: OBJECT_THEMES, or SHAPE_THEMES with the shapes representation',
    },
    mode: {
      type: 'string',
      values: [...MODES],
      default: { kind: 'const', value: 'extend' },
      doc: 'pattern-extend: extend, fill or core; order: core places the next whole repeat (ask = core length after whole cores), otherwise any next cards',
    },
  },
  derived: ['coreLen'],
  features: {
    'core.len': { weight: 0.4, doc: 'pattern-extend format feature (03 §5.5): core length − 2' },
    'hidden.middle': {
      weight: 0.4,
      doc: 'pattern-extend format feature (03 §5.5): the blanks are inside the pattern (fill)',
    },
    'core.double': { weight: 0.3, doc: 'the core repeats a unit (AAB, ABB, AABB)' },
    'ask.over1': { weight: 0.2, doc: 'tokens to place − 1' },
    items: { weight: 0.3, doc: 'order format feature (03 §5.5): card count − 3' },
  },
  narration: [
    'gen.pattern.repeat.say-it',
    'gen.pattern.repeat.next',
    'gen.pattern.repeat.core',
    'gen.pattern.repeat.bracket',
    // its order retry line (items/check.ts retryFeedback)
    'fb.order.retry-pattern',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: (p) => ({ coreLen: asStr(p.core, 'AB').length }),
  accepts(p, t) {
    const core = asStr(p.core);
    if (!(CORES as readonly string[]).includes(core)) return false;
    const L = core.length;
    const shown = asNum(p.shown);
    const ask = asNum(p.ask);
    if (ask < 1 || ask > 3) return false;
    if (t.format === 'order') {
      // The cards to place are all different units, after more than one whole core.
      // The core has started again among the fixed cards, so h.pattern.keep-going ("find where the
      // pattern starts again") holds, as it does for extend (shown ≥ L + 1).
      if (shown <= L) return false;
      if (asStr(p.mode) === 'core' && (ask !== L || shown % L !== 0)) return false;
      const next = Array.from({ length: ask }, (_, k) => core[(shown + k) % L]);
      return ask >= 2 && new Set(next).size === next.length;
    }
    const mode = asStr(p.mode);
    if (mode === 'core') return shown >= 2 * L && shown <= 3 * L;
    if (mode === 'fill') return fillStart(shown, ask) >= L && ask <= L;
    return shown >= L + 1 && ask <= shown;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const core = asStr(params.core);
    const L = core.length;
    const shown = asNum(params.shown);
    const ask = asNum(params.ask);
    const mode = asStr(params.mode, 'extend');
    const units = themeUnits(asNum(params.theme), t.representation === 'shapes');
    const palette = units.slice(0, new Set(core).size);
    const tok = (i: number) => tokenAt(core, units, i);
    const math: Record<string, number> = {
      'core.len': L - 2,
      'core.double': new Set(core).size < L ? 1 : 0,
    };
    const vars = pickVars(t, { ask });
    let p: PartialOutput;
    if (t.format === 'order') {
      const seed = layoutSeed(rng);
      const total = shown + ask;
      const free = rng.fork('layout').shuffle(Array.from({ length: ask }, (_, k) => shown + k));
      const positions = [...Array.from({ length: shown }, (_, i) => i), ...free];
      const items = positions.map((pos, i) => ({
        id: `obj-${i}`,
        value: pos + 1,
        stimulus: {
          kind: 'objects',
          set: { count: 1, sprite: tokenSprite(tok(pos)), layout: 'line', layoutSeed: seed },
        } as StimulusSpec,
      }));
      const fixed: Record<number, string> = {};
      for (let i = 0; i < shown; i += 1) fixed[i] = `obj-${i}`;
      math['ask.over1'] = ask - 1;
      math.items = 0;
      p = {
        params,
        vars,
        math,
        widget: { format: 'order', items, direction: 'asc', fixed },
        answer: {
          kind: 'numbers',
          values: Array.from({ length: total }, (_, i) => i + 1),
          ordered: true,
        },
      };
      return finish(patternRepeat, ctx, p);
    }
    if (mode === 'core') {
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'pattern-extend',
          sequence: Array.from({ length: shown }, (_, i) => tok(i)),
          palette,
          mode: 'core',
          kind: 'repeat',
        },
        answer: {
          kind: 'state',
          checker: 'select.exactSet',
          target: { values: Array.from({ length: L }, (_, i) => i) },
        },
      };
      return finish(patternRepeat, ctx, p);
    }
    const hidden =
      mode === 'fill'
        ? Array.from({ length: ask }, (_, k) => fillStart(shown, ask) + k)
        : Array.from({ length: ask }, (_, k) => shown + k);
    const length = mode === 'fill' ? shown : shown + ask;
    const sequence = Array.from({ length }, (_, i) => (hidden.includes(i) ? null : tok(i)));
    math['ask.over1'] = ask - 1;
    math['hidden.middle'] = mode === 'fill' ? 1 : 0;
    p = {
      params,
      vars,
      math,
      widget: {
        format: 'pattern-extend',
        sequence,
        palette,
        mode: mode === 'fill' ? 'fill' : 'extend',
        kind: 'repeat',
      },
      answer: {
        kind: 'state',
        checker: 'pattern.tokens',
        target: { expected: hidden.map((i) => tok(i)) },
      },
    };
    return finish(patternRepeat, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind === 'numbers') return { kind: 'numbers', values: [...a.values] };
    if (a.kind !== 'state') throw new Error('pattern.repeat: unexpected answer');
    if (a.checker === 'select.exactSet') {
      return { kind: 'state', value: { values: [...(a.target.values as number[])] } };
    }
    return { kind: 'state', value: { tokens: [...(a.target.expected as PatternToken[])] } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    if (w.format === 'order') {
      const fixed = new Set(Object.values(w.fixed ?? {}));
      const free = w.items.filter((i) => !fixed.has(i.id)).sort((x, y) => x.value - y.value);
      return [
        say('gen.pattern.repeat.say-it'),
        ...free.map((i) =>
          say('gen.pattern.repeat.next', {
            op: 'drag',
            args: { id: i.id, slot: i.value - 1 },
          }),
        ),
      ];
    }
    if (w.format !== 'pattern-extend') return [];
    const a = out.answer;
    if (a.kind === 'state' && a.checker === 'select.exactSet') {
      const L = (a.target.values as number[]).length;
      return [
        say('gen.pattern.repeat.say-it'),
        say('gen.pattern.repeat.core', { op: 'highlight', args: { index: 0 } }),
        say('gen.pattern.repeat.bracket', { op: 'bracket-core', args: { from: 0, to: L - 1 } }),
      ];
    }
    const expected = a.kind === 'state' ? (a.target.expected as PatternToken[]) : [];
    const blanks = w.sequence.flatMap((x, i) => (x === null ? [i] : []));
    return [
      say('gen.pattern.repeat.say-it'),
      ...blanks.map((index, k) =>
        say('gen.pattern.repeat.next', {
          op: 'place-token',
          args: { index, token: expected[k] },
        }),
      ),
    ];
  },
};
