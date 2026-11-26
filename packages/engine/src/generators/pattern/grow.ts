// pattern.grow (03 §5.6): growing number patterns, +1, +2 or +10 (ALG.02). The pattern starts at
// `start` and grows by `step`; three terms are shown and the child finds the next `ask`.
// - hundred-chart `pattern`: the chart shades start, start + step, start + 2·step as given terms
//   (`patternShown: 3`); the child taps the next `ask` terms (select.exactSet `{ values }`).
// - number-line-jump: the child jumps on from the third term (any of 1, 2 or 10 at a time) and
//   types where it lands, the next term (`goal: add`, `thenAsk: landing`, jumps.reach).
// - pattern-extend `extend` (number tokens): the next `ask` terms (pattern.tokens); `rule`: the
//   step (a number).
// K01 builds pattern-extend, hundred-chart and number-line-jump.
// `kind: shape` (ALG.10, K02 slice 4e): a growing shape pattern on pattern-extend `extend`, kind
// `grow`. Three steps are shown; each step has `step` more squares than the one before (1 to 3,
// starting at 1 to 4 squares). At the `tiles` representation each step is a stack of square tiles
// and the child builds the next stack with one-more / one-less (built, never picked); otherwise the
// steps are the numbers of squares and the child types the count of each asked step. On number-pad
// the prompt tells the squares of steps 1 to 3 and the child types the squares of step 3 + `ask`.
// A stack has at most MAX_TILES squares.

import type { LessonStep, PatternToken, ResponseValue } from '@number-island/shared';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import { MAX_TILES } from '../../formats/pattern-extend';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const MODES = ['extend', 'rule'] as const;
const KINDS = ['number', 'shape'] as const;
/** A growing shape pattern grows by 1 to this many squares a step. */
export const SHAPE_STEP_MAX = 3;
const SHOWN = 3;

/** The k-th term (0 = start). */
export const term = (start: number, step: number, k: number): number => start + k * step;

/** Whether some asked term is in another ten than the last shown one (steps below ten). */
function crossesTen(start: number, step: number, ask: number): boolean {
  if (step >= 10) return false;
  const last = term(start, step, SHOWN - 1);
  const top = term(start, step, SHOWN - 1 + ask);
  return Math.floor(last / 10) !== Math.floor(top / 10);
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const patternGrow: GeneratorDef = {
  id: 'pattern.grow',
  formats: ['pattern-extend', 'hundred-chart', 'number-line-jump', 'number-pad'],
  params: {
    start: { type: 'int', default: { kind: 'int', min: 1, max: 20 }, doc: 'the first term' },
    step: {
      type: 'int',
      default: { kind: 'choice', values: [1, 2, 10] },
      doc: 'how much the pattern grows each time (1, 2 or 10)',
    },
    ask: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'terms the child finds after the three shown (number-line-jump: 1)',
    },
    mode: {
      type: 'string',
      values: [...MODES],
      default: { kind: 'const', value: 'extend' },
      doc: 'pattern-extend: extend (the next terms) or rule (the step)',
    },
    kind: {
      type: 'string',
      values: [...KINDS],
      default: { kind: 'const', value: 'number' },
      doc: 'number (a number pattern) or shape (squares in each step, pattern-extend extend only)',
    },
  },
  derived: ['next', 'last'],
  features: {
    twoDigitStep: { weight: 0.3, doc: 'the step is 10 or more' },
    'step.notOne': {
      weight: 0.3,
      doc: 'pattern-extend format feature (03 §5.5): the step is not 1',
    },
    crossDecade: { weight: 0.3, doc: 'an asked term is in another ten than the last shown one' },
    'ask.over1': { weight: 0.2, doc: 'terms to find − 1' },
  },
  narration: [
    'gen.pattern.grow.look',
    'gen.pattern.grow.rule',
    'gen.pattern.grow.next',
    'gen.pattern.grow.land',
    'gen.pattern.grow.squares',
    'gen.pattern.grow.next-squares',
    'gen.pattern.grow.step-squares',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    const start = asNum(p.start);
    const step = asNum(p.step);
    return {
      next: term(start, step, SHOWN),
      last: term(start, step, SHOWN - 1 + asNum(p.ask, 1)),
    };
  },
  accepts(p, t) {
    const start = asNum(p.start);
    const step = asNum(p.step);
    const ask = asNum(p.ask, 1);
    if (ask < 1 || ask > 3) return false;
    const last = term(start, step, SHOWN - 1 + ask);
    if (asStr(p.kind, 'number') === 'shape') {
      // Squares in each step: built (tiles) or typed, never the rule or another format.
      return (
        (t.format === 'pattern-extend' || t.format === 'number-pad') &&
        asStr(p.mode, 'extend') === 'extend' &&
        start >= 1 &&
        step >= 1 &&
        step <= SHAPE_STEP_MAX &&
        last <= MAX_TILES
      );
    }
    if (start < 0 || ![1, 2, 10].includes(step)) return false;
    if (t.format === 'hundred-chart') return start >= 1 && last <= 100;
    if (t.format === 'number-line-jump') return ask === 1 && last <= 90;
    if (asStr(p.mode) === 'rule') return ask === 1 && last <= 100;
    return last <= 100;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const start = asNum(params.start);
    const step = asNum(params.step);
    const ask = asNum(params.ask, 1);
    const terms = Array.from({ length: SHOWN }, (_, k) => term(start, step, k));
    const asked = Array.from({ length: ask }, (_, k) => term(start, step, SHOWN + k));
    const [a, b, c] = terms as [number, number, number];
    const vars = pickVars(t, { a, b, c, ask, k: SHOWN + ask });
    const math: Record<string, number> = {
      twoDigitStep: step >= 10 ? 1 : 0,
      'step.notOne': step !== 1 ? 1 : 0,
      crossDecade: crossesTen(start, step, ask) ? 1 : 0,
      'ask.over1': ask - 1,
    };
    let p: PartialOutput;
    if (t.format === 'hundred-chart') {
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'hundred-chart',
          first: 1,
          rows: 10,
          hidden: [],
          mode: 'pattern',
          patternStart: start,
          patternStep: step,
          patternShown: SHOWN,
        },
        answer: { kind: 'state', checker: 'select.exactSet', target: { values: asked } },
      };
    } else if (t.format === 'number-line-jump') {
      const next = asked[0] as number;
      const min = step >= 10 ? 0 : 10 * Math.floor(a / 10);
      const max = step >= 10 ? 10 * Math.ceil((next + 1) / 10) : min + 20;
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'number-line-jump',
          min,
          max,
          ticksEvery: 1,
          labelsEvery: step >= 10 ? 10 : 5,
          start: c,
          goal: 'add',
          target: next,
          allowedJumps: [1, 2, 10],
          path: 'line',
          thenAsk: 'landing',
        },
        answer: {
          kind: 'state',
          checker: 'jumps.reach',
          target: { start: c, target: next, allowedJumps: [1, 2, 10], value: next },
        },
        highlight: [{ op: 'highlight', args: { at: c } }],
      };
    } else if (t.format === 'number-pad') {
      // A shape pattern told in numbers: the squares of the asked step (the last asked term).
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'number-pad',
          stimulus: { kind: 'none' },
          blanks: [{ id: 'x', maxDigits: 2 }],
        },
        answer: { kind: 'number', value: asked[ask - 1] as number },
      };
    } else if (asStr(params.kind, 'number') === 'shape') {
      const tok = (n: number) => (t.representation === 'tiles' ? { tiles: n } : { n });
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'pattern-extend',
          sequence: [...terms.map(tok), ...Array.from({ length: ask }, () => null)],
          palette: [],
          mode: 'extend',
          kind: 'grow',
        },
        answer: {
          kind: 'state',
          checker: 'pattern.tokens',
          target: { expected: asked.map(tok) },
        },
      };
    } else {
      const rule = asStr(params.mode) === 'rule';
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'pattern-extend',
          sequence: [
            ...terms.map((n) => ({ n })),
            ...(rule ? [] : Array.from({ length: ask }, () => null)),
          ],
          palette: [],
          mode: rule ? 'rule' : 'extend',
          kind: 'number',
        },
        answer: rule
          ? { kind: 'number', value: step }
          : {
              kind: 'state',
              checker: 'pattern.tokens',
              target: { expected: asked.map((n) => ({ n })) },
            },
      };
    }
    return finish(patternGrow, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    if (a.checker === 'select.exactSet') {
      return { kind: 'state', value: { values: [...(a.target.values as number[])] } };
    }
    if (a.checker === 'jumps.reach') {
      const step = asNum(out.params.step);
      return { kind: 'state', value: { jumps: [step], value: a.target.value as number } };
    }
    return { kind: 'state', value: { tokens: [...(a.target.expected as PatternToken[])] } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const start = asNum(out.params.start);
    const step = asNum(out.params.step);
    const ask = asNum(out.params.ask, 1);
    const c = term(start, step, SHOWN - 1);
    const asked = Array.from({ length: ask }, (_, k) => term(start, step, SHOWN + k));
    const look = say('gen.pattern.grow.look', {});
    if (w.format === 'hundred-chart') {
      return [
        say('gen.pattern.grow.look', {}, { op: 'highlight-row', args: { n: Math.ceil(c / 10) } }),
        ...asked.map((n) => say('gen.pattern.grow.next', { n }, { op: 'tap', args: { n } })),
      ];
    }
    if (w.format === 'number-line-jump') {
      const next = asked[0] as number;
      return [
        say('gen.pattern.grow.look', {}, { op: 'highlight', args: { at: c } }),
        say('gen.pattern.grow.rule', { step }, { op: 'hop', args: { by: step } }),
        say('gen.pattern.grow.land', { n: next }, { op: 'label-landing' }),
      ];
    }
    if (w.format === 'pattern-extend' && w.mode === 'rule') {
      return [
        look,
        say('gen.pattern.grow.rule', { step }, { op: 'answer', args: { value: step } }),
      ];
    }
    const tiles = w.format === 'pattern-extend' && w.kind === 'grow' && w.sequence[0] !== null &&
      'tiles' in (w.sequence[0] as PatternToken);
    if (w.format === 'number-pad') {
      const n = asked[ask - 1] as number;
      return [
        say('gen.pattern.grow.squares', { step }),
        say(
          'gen.pattern.grow.step-squares',
          { k: SHOWN + ask, n },
          { op: 'type', args: { blank: 'x', value: n } },
        ),
      ];
    }
    if (w.format === 'pattern-extend' && w.kind === 'grow') {
      return [
        say('gen.pattern.grow.squares', { step }),
        ...asked.map((n, k) =>
          say(
            'gen.pattern.grow.next-squares',
            { n },
            { op: 'place-token', args: { index: SHOWN + k, token: tiles ? { tiles: n } : { n } } },
          ),
        ),
      ];
    }
    return [
      look,
      ...asked.map((n, k) =>
        say(
          'gen.pattern.grow.next',
          { n },
          { op: 'place-token', args: { index: SHOWN + k, token: { n } } },
        ),
      ),
    ];
  },
};
