// equality.eq (03 §5.6): the equal sign as "the same as", the unknown anywhere, and the relations
// < and > between numbers (ADD.05, ADD.10, ADD.11, CMP.08; ALG.06–08, MDA.22 later).
// Formats: balance, number-pad, compare, numeral-pick, number-bond.
//
// `form` is the layout of the equation, with `op` (+ or −) on the left side and the blank `_`:
//   a+b=_   a op b = _          _=a+b   _ = a op b        (the blank alone on the left)
//   a+_=c   a op _ = result     _+b=c   _ op b = result   (change and start unknown)
//   a+b=c+_ a op b = c + _      a+b=_+c a op b = _ + c    (operations on both sides)
//   _+c=a+b _ + c = a op b      (the box first, ALG.07's "? + 4 = 6 + 3")
//   a=c+_   a = c + _           (one number against a sum: how many more make it the same)
//   between a < _ < a + 2, or a + 2 > _ > a with `rel` >  (the one number between, CMP.08)
// The number shown on the right of a two-sided form is `c`; `result` is a op b and `missing` the
// number the blank stands for. `fact` draws a kind of fact within the template's domains:
// turn-around (a + b = b + _ or a + b = _ + a, ADD.05) or zero (one addend is 0).
//
// `mode`: fill (the child gives the missing number), judge (the blank shows `missing`, or
// `missing + off` when `truth` is false, and the child says true or false: compare true-false and
// balance judge) or make-equal (balance: the pans hold the two sides without the blank, and the
// child adds unit blocks until they balance, checked by balance.equal). The compare format always
// judges. Balance terms are numerals at the pictorial tier and `sprite` objects at the concrete
// tier (one object weighs one).
//
// `near` (ALG.06, same value without adding up): on a two-sided form the shown `c` is 1 to `near`
// away from its partner, the number in the same place on the other side (`a` in a+b=c+_, `b` in
// a+b=_+c and _+c=a+b), so the box is the box's partner moved the other way. The hint vars say it
// for every draw: `cp` (c's partner), `bp` (the box's partner), `d` (how far c moved), `more` and
// `less` ("more" and "less", swapped when c is below its partner).

import type {
  BalanceSide,
  ItemTemplate,
  LessonStep,
  ParamSpec,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
import type { Rng } from '../../rng';
import {
  asNum,
  asStr,
  correctFromAnswer,
  DEFAULT_SPRITES,
  finish,
  inDomain,
  layoutSeed,
  numberOptions,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import { BALANCE_FEATURES, featureSubset } from '../compare/shared';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import {
  asForm,
  asOp,
  type Equation,
  equation,
  FORMS,
  judgedValue,
  MAKE_EQUAL,
  ONE_SIDED,
  sideValue,
  type Term,
  TWO_SIDED,
  tokens,
} from './model';

export { equation, FORMS, judgedValue, TWO_SIDED } from './model';

const MODES = ['fill', 'judge', 'make-equal'] as const;
const FACTS = ['any', 'turn-around', 'zero'] as const;

/** Balance pan terms: numerals (pictorial) or `sprite` objects (concrete); the blank is `x`. */
function panTerms(terms: Term[], concrete: boolean, sprite: string, fill?: number): BalanceSide {
  return {
    terms: terms.flatMap((t): BalanceSide['terms'] => {
      if ('rel' in t) return [];
      if ('op' in t) return [{ op: t.op }];
      const v = 'n' in t ? t.n : fill;
      if (v === undefined) return [{ blank: 'x' }];
      return [concrete ? { object: sprite, count: v } : { n: v }];
    }),
  };
}

/** A picture of the equation's left-hand numbers (pictorial number-pad), by representation. */
function picture(t: ItemTemplate, eq: Equation, p: ParamValues, rng: Rng): StimulusSpec {
  const a = asNum(p.a);
  const b = asNum(p.b);
  const r = eq.op === '-' ? a - b : a + b;
  switch (t.representation) {
    case 'objects':
      return {
        kind: 'objects',
        set: {
          count: eq.op === '-' ? a : a + b,
          sprite: asStr(p.sprite, 'shell'),
          layout: 'groups',
          groups: eq.op === '-' ? [r, b] : [a, b],
          layoutSeed: layoutSeed(rng),
        },
      };
    case 'bar-model': {
      if (TWO_SIDED.has(eq.form) || eq.form === 'a=c+_') {
        return { kind: 'bar-model', parts: [asNum(p.c), '?'], whole: eq.value };
      }
      return bondOrBar('bar-model', eq, a, b, r) ?? { kind: 'none' };
    }
    case 'number-bond':
      return bondOrBar('number-bond', eq, a, b, r) ?? { kind: 'none' };
    default:
      return { kind: 'none' };
  }
}

/** Parts and whole of a one-operation equation, with '?' for the blank (null if not one). */
function bondParts(
  eq: Equation,
  a: number,
  b: number,
  r: number,
): { whole: number | '?'; parts: (number | '?')[] } | null {
  if (!ONE_SIDED.has(eq.form)) return null;
  const blankA = eq.form === '_+b=c';
  const blankB = eq.form === 'a+_=c';
  const blankR = eq.form === 'a+b=_' || eq.form === '_=a+b';
  if (eq.op === '+') {
    return {
      whole: blankR ? '?' : r,
      parts: [blankA ? '?' : a, blankB ? '?' : b],
    };
  }
  // a − b = r: the whole is a, the parts are b and r.
  return { whole: blankA ? '?' : a, parts: [blankB ? '?' : b, blankR ? '?' : r] };
}

function bondOrBar(
  kind: 'bar-model' | 'number-bond',
  eq: Equation,
  a: number,
  b: number,
  r: number,
): StimulusSpec | null {
  const bp = bondParts(eq, a, b, r);
  if (!bp) return null;
  return kind === 'bar-model'
    ? { kind: 'bar-model', parts: bp.parts, whole: bp.whole }
    : { kind: 'number-bond', whole: bp.whole, parts: bp.parts };
}

const isFact = (v: unknown): v is (typeof FACTS)[number] =>
  (FACTS as readonly unknown[]).includes(v);

function sampleEq(spec: Record<string, ParamSpec>, rng: Rng): ParamValues {
  const p = sampleAll(spec, rng);
  const fact = isFact(p.fact) ? p.fact : 'any';
  const form = asForm(p.form);
  const set = (name: string, v: number) => {
    const s = spec[name];
    if (s && inDomain(s, v)) p[name] = v;
  };
  if (fact === 'turn-around') {
    // a + b = b + _ and a + b = _ + a: the shown number is the other addend.
    if (form === 'a+b=c+_') set('c', asNum(p.b));
    if (form === 'a+b=_+c' || form === '_+c=a+b') set('c', asNum(p.a));
  } else if (fact === 'zero' && asNum(p.a) !== 0 && asNum(p.b) !== 0) {
    // One addend is 0 (a − 0 for subtraction), drawn within the template's domains.
    const which = asOp(p.op) === '-' ? 'b' : rng.fork('zero').bool(0.5) ? 'a' : 'b';
    set(which, 0);
  }
  const near = asNum(p.near, 0);
  if (near >= 1 && TWO_SIDED.has(form)) {
    const r = rng.fork('near');
    const d = r.int(1, near);
    set('c', partners(form, p).cp + (r.bool(0.5) ? d : -d));
  }
  return p;
}

/** c's partner (`cp`, the number in c's place on the other side) and the box's partner (`bp`). */
export function partners(form: string, p: ParamValues): { cp: number; bp: number } {
  const a = asNum(p.a);
  const b = asNum(p.b);
  return form === 'a+b=c+_' ? { cp: a, bp: b } : { cp: b, bp: a };
}

function valid(p: ParamValues, t: ItemTemplate): boolean {
  const eq = equation(p);
  const a = asNum(p.a);
  const b = asNum(p.b);
  const c = asNum(p.c);
  const maxN = asNum(p.maxN, 20);
  const mode = asStr(p.mode, 'fill');
  const fact = asStr(p.fact, 'any');
  const r = eq.op === '-' ? a - b : a + b;
  if (Math.min(a, b, c, r, eq.missing) < 0) return false;
  if (Math.max(...eq.shown, eq.missing, eq.value) > maxN) return false;
  // Two-sided forms show a number on the right (never + 0), so the blank is never the left side's
  // value; a + b = c + _ never shows the answer of the left side.
  if ((TWO_SIDED.has(eq.form) || eq.form === 'a=c+_') && c < 1) return false;
  if (fact === 'turn-around') {
    if (eq.op !== '+' || !TWO_SIDED.has(eq.form)) return false;
    if (eq.form === 'a+b=c+_' ? c !== b : c !== a) return false;
    if (a === b) return false; // a turn-around needs two different addends
  }
  const near = asNum(p.near, 0);
  if (near >= 1) {
    // Same value without adding up: c sits 1 to `near` from its partner, on an adding form.
    if (!TWO_SIDED.has(eq.form) || eq.op !== '+') return false;
    const d = Math.abs(c - partners(eq.form, p).cp);
    if (d < 1 || d > near) return false;
  }
  if (fact === 'zero') {
    if (!ONE_SIDED.has(eq.form)) return false;
    const zero = eq.op === '-' ? b === 0 : (a === 0) !== (b === 0);
    if (!zero) return false;
  }
  const judging = t.format === 'compare' || (t.format === 'balance' && mode === 'judge');
  if (judging) {
    if (eq.form === 'between') return false;
    const v = judgedValue(p, eq);
    if (v < 0 || v > maxN) return false;
  }
  switch (t.format) {
    case 'number-bond':
      return ONE_SIDED.has(eq.form) && mode === 'fill';
    case 'balance':
      if (eq.form === 'between') return false;
      if (mode === 'make-equal') return MAKE_EQUAL.has(eq.form) && eq.missing >= 1;
      return true;
    case 'compare':
      return true;
    case 'number-pad':
    case 'numeral-pick':
      return mode === 'fill';
    default:
      return false;
  }
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** The lines of a worked solution before the step that gives the answer (never the answer). */
function thinkLines(eq: Equation, p: ParamValues): LessonStep[] {
  const a = asNum(p.a);
  const b = asNum(p.b);
  const c = asNum(p.c);
  switch (eq.form) {
    case 'a+b=_':
    case '_=a+b':
      return [say('gen.equality.eq.same', {})];
    case 'a+_=c':
      return [
        say(eq.op === '-' ? 'gen.equality.eq.take-what' : 'gen.equality.eq.and-what', {
          x: a,
          n: eq.value,
        }),
      ];
    case '_+b=c':
      return [
        say(eq.op === '-' ? 'gen.equality.eq.what-take' : 'gen.equality.eq.what-and', {
          x: b,
          n: eq.value,
        }),
      ];
    case 'a+b=c+_':
    case 'a+b=_+c':
    case '_+c=a+b':
      return [
        say('gen.equality.eq.side', { n: eq.value }),
        say('gen.equality.eq.and-what', { x: c, n: eq.value }),
      ];
    case 'a=c+_':
      return [say('gen.equality.eq.and-what', { x: c, n: eq.value })];
    case 'between':
      return [say('gen.equality.eq.between', { lo: a, hi: a + 2 })];
  }
}

export const equalityEq: GeneratorDef = {
  id: 'equality.eq',
  formats: ['balance', 'number-pad', 'compare', 'numeral-pick', 'number-bond'],
  params: {
    form: {
      type: 'string',
      values: [...FORMS],
      default: { kind: 'const', value: 'a+b=_' },
      doc: 'the layout of the equation and its blank (see the file header)',
    },
    op: {
      type: 'string',
      values: ['+', '-'],
      default: { kind: 'const', value: '+' },
      doc: 'the operation on the left side',
    },
    a: { type: 'int', default: { kind: 'int', min: 0, max: 10 }, doc: 'first number' },
    b: { type: 'int', default: { kind: 'int', min: 0, max: 10 }, doc: 'second number' },
    c: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 10 },
      doc: 'the number shown beside the box in a two-sided form (a+b=c+_, a+b=_+c, _+c=a+b, a=c+_)',
    },
    fact: {
      type: 'string',
      values: [...FACTS],
      default: { kind: 'const', value: 'any' },
      doc: 'any; turn-around (a + b = b + _ or _ + a); zero (an addend is 0)',
    },
    mode: {
      type: 'string',
      values: [...MODES],
      default: { kind: 'const', value: 'fill' },
      doc: 'fill (give the missing number), judge (true or false; compare always judges), make-equal (balance: add blocks)',
    },
    truth: {
      type: 'bool',
      default: { kind: 'bool', p: 0.5 },
      doc: 'judge: the equation shown is true',
    },
    off: {
      type: 'int',
      default: { kind: 'choice', values: [-2, -1, 1, 2] },
      doc: 'judge: how far the number in the blank is from the right one when false',
    },
    rel: {
      type: 'string',
      values: ['<', '>'],
      default: { kind: 'const', value: '<' },
      doc: 'between: a < _ < a + 2, or a + 2 > _ > a',
    },
    sprite: {
      type: 'string',
      values: [...DEFAULT_SPRITES],
      default: { kind: 'const', value: 'shell' },
      doc: 'concrete balance pans and the objects picture: the art-kit object',
    },
    near: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'two-sided adding forms: c is 1 to near from its partner (0: any c)',
    },
    maxN: {
      type: 'int',
      default: { kind: 'const', value: 20 },
      doc: 'largest number in the equation, its sides and the blank',
    },
  },
  derived: ['result', 'lhs', 'missing'],
  features: {
    size: { weight: 0.3, doc: 'max(0, largest number − 5) / 5 (shown numbers and the blank)' },
    sub: { weight: 0.35, doc: 'the left side subtracts' },
    'unknown.change': { weight: 0.6, doc: 'the blank is the second number (a op _ = c)' },
    'unknown.start': { weight: 0.9, doc: 'the blank is the first number (_ op b = c)' },
    answerLeft: { weight: 0.4, doc: 'the blank stands alone left of the equal sign (_ = a + b)' },
    opsBothSides: {
      weight: 0.9,
      doc: 'an operation on both sides of the equal sign (also the 03 §5.5 balance feature)',
    },
    oneVsSum: { weight: 0.3, doc: 'one number against a sum (a = c + _)' },
    between: { weight: 0.2, doc: 'the number between two others, with < or >' },
    zero: { weight: -0.4, doc: 'an addend is 0, or 0 is taken away' },
    // 03 §5.5 balance features (K01: emitted by the generator until the format has a model).
    'blank.left': { weight: 0.5, doc: 'balance: the blank is on the left pan' },
    ...featureSubset(BALANCE_FEATURES, ['judge.false', 'showTilt.off']),
  },
  narration: [
    'gen.equality.eq.same',
    'gen.equality.eq.side',
    'gen.equality.eq.other-side',
    'gen.equality.eq.and-what',
    'gen.equality.eq.what-and',
    'gen.equality.eq.take-what',
    'gen.equality.eq.what-take',
    'gen.equality.eq.answer',
    'gen.equality.eq.true',
    'gen.equality.eq.false',
    'gen.equality.eq.balances',
    'gen.equality.eq.not-balanced',
    'gen.equality.eq.heavier',
    'gen.equality.eq.add-blocks',
    'gen.equality.eq.between',
    'gen.equality.eq.is-between',
  ],
  sample: sampleEq,
  derive(p) {
    const eq = equation(p);
    const a = asNum(p.a);
    const b = asNum(p.b);
    return { result: asOp(p.op) === '-' ? a - b : a + b, lhs: eq.value, missing: eq.missing };
  },
  accepts: valid,
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const eq = equation(params);
    if (!valid(params, t)) throw new RangeError(`equality.eq: invalid ${eq.form} item`);
    const a = asNum(params.a);
    const b = asNum(params.b);
    const c = asNum(params.c);
    const mode = asStr(params.mode, 'fill');
    const sprite = asStr(params.sprite, 'shell');
    const concrete = t.tier === 'concrete';
    const { cp, bp } = partners(eq.form, params);
    const vars = pickVars(t, {
      a,
      b,
      c,
      n: eq.value,
      lo: a,
      hi: a + 2,
      cp,
      bp,
      d: Math.abs(c - cp),
      more: c >= cp ? 'more' : 'less',
      less: c >= cp ? 'less' : 'more',
    });
    const zero = ONE_SIDED.has(eq.form) && (eq.op === '-' ? b === 0 : a === 0 || b === 0) ? 1 : 0;
    const math: Record<string, number> = {
      size: Math.max(0, Math.max(...eq.shown, eq.missing, eq.value) - 5) / 5,
      sub: eq.op === '-' && eq.form !== 'a=c+_' && eq.form !== 'between' ? 1 : 0,
      'unknown.change': eq.form === 'a+_=c' ? 1 : 0,
      'unknown.start': eq.form === '_+b=c' ? 1 : 0,
      answerLeft: eq.form === '_=a+b' ? 1 : 0,
      opsBothSides: TWO_SIDED.has(eq.form) ? 1 : 0,
      oneVsSum: eq.form === 'a=c+_' ? 1 : 0,
      between: eq.form === 'between' ? 1 : 0,
      zero,
    };
    let p: PartialOutput;
    switch (t.format) {
      case 'number-pad': {
        const stimulus =
          t.tier === 'abstract' ? { kind: 'none' as const } : picture(t, eq, params, rng);
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus,
            expression: { tokens: tokens(eq) },
            blanks: [{ id: 'x', maxDigits: 2 }],
            unit: null,
          },
          answer: { kind: 'number', value: eq.missing },
          ...(stimulus.kind !== 'none' ? { overlay: stimulus } : {}),
        };
        break;
      }
      case 'numeral-pick': {
        const opts = numberOptions(t, params, eq.missing, rng, 0, 2 * asNum(params.maxN, 20));
        p = {
          params,
          vars,
          math: opts.diagnostic > 0 ? { ...math, 'distractors.diagnostic': opts.diagnostic } : math,
          widget: {
            format: 'numeral-pick',
            stimulus: { kind: 'expression', expr: { tokens: tokens(eq) } },
            options: opts.options,
            layout: 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(eq.missing) },
        };
        break;
      }
      case 'number-bond': {
        const bp = bondParts(eq, a, b, eq.op === '-' ? a - b : a + b);
        if (!bp) throw new RangeError('equality.eq: a number bond needs a one-operation form');
        const slot = (v: number | '?'): number | null => (v === '?' ? null : v);
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-bond',
            whole: slot(bp.whole),
            parts: bp.parts.map(slot),
            mode: bp.whole === '?' ? 'missing-whole' : 'missing-part',
            counters: concrete,
            nonZero: false,
          },
          answer: { kind: 'number', value: eq.missing },
        };
        break;
      }
      case 'compare': {
        const v = judgedValue(params, eq);
        const truth = v === eq.missing;
        p = {
          params,
          vars,
          math: { ...math, 'judge.false': truth ? 0 : 1 },
          widget: {
            format: 'compare',
            // The whole statement sits on the left (03 §5.5 true-false, K01 convention).
            left: { kind: 'expression', expr: { tokens: tokens(eq, v) } },
            right: { kind: 'none' },
            ask: 'true-false',
            allowMatchLines: false,
          },
          answer: { kind: 'choice', id: truth ? 'true' : 'false' },
        };
        break;
      }
      case 'balance': {
        const blankLeft = eq.left.some((x) => 'blank' in x);
        if (mode === 'make-equal') {
          // The right pan holds c; the child adds blocks to it (or any amount to both pans).
          const right = eq.right.filter((x) => 'n' in x);
          p = {
            params,
            vars,
            math: { ...math, 'showTilt.off': 0 },
            widget: {
              format: 'balance',
              left: panTerms(eq.left, concrete, sprite),
              right: panTerms(right, concrete, sprite),
              mode: 'make-equal',
              ...(concrete ? { objectWeights: { [sprite]: 1 } } : {}),
              showTilt: true,
            },
            answer: {
              kind: 'state',
              checker: 'balance.equal',
              target: { left: sideValue(eq.left), right: sideValue(right) },
            },
          };
          break;
        }
        const judge = mode === 'judge';
        const v = judge ? judgedValue(params, eq) : undefined;
        p = {
          params,
          vars,
          math: {
            ...math,
            'blank.left': !judge && blankLeft ? 1 : 0,
            'showTilt.off': 1,
            ...(judge ? { 'judge.false': v === eq.missing ? 0 : 1 } : {}),
          },
          widget: {
            format: 'balance',
            left: panTerms(eq.left, concrete, sprite, v),
            right: panTerms(eq.right, concrete, sprite, v),
            mode: judge ? 'judge' : 'fill-blank',
            ...(concrete ? { objectWeights: { [sprite]: 1 } } : {}),
            showTilt: false,
          },
          answer: judge
            ? { kind: 'choice', id: v === eq.missing ? 'true' : 'false' }
            : { kind: 'number', value: eq.missing },
        };
        break;
      }
      default:
        throw new Error(`equality.eq cannot build ${t.format}`);
    }
    return finish(equalityEq, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const target = out.answer.target as { left: number; right: number };
    return {
      kind: 'state',
      value: {
        left: Math.max(0, target.right - target.left),
        right: Math.max(0, target.left - target.right),
      },
    };
  },
  solution(out): LessonStep[] {
    const eq = equation(out.params);
    const w = out.widget;
    const n = eq.missing;
    const answerLine = (action: LessonStep['action']): LessonStep =>
      eq.form === 'between'
        ? say('gen.equality.eq.is-between', { n }, action)
        : say('gen.equality.eq.answer', { n }, action);
    switch (w.format) {
      case 'number-pad': {
        const [first, ...rest] = thinkLines(eq, out.params);
        const look: LessonStep['action'] =
          w.stimulus.kind !== 'none'
            ? { op: 'show-stimulus' }
            : { op: 'highlight', args: { token: 'x' } };
        return [
          { ...(first as LessonStep), action: look },
          ...rest,
          answerLine({ op: 'type', args: { blank: 'x', value: n } }),
        ];
      }
      case 'numeral-pick':
        return [
          ...thinkLines(eq, out.params),
          answerLine({ op: 'tap', args: { id: numberOptionId(n) } }),
        ];
      case 'number-bond': {
        const slot = w.whole === null ? 'whole' : w.parts[0] === null ? 'part-0' : 'part-1';
        const [first, ...rest] = thinkLines(eq, out.params);
        return [
          { ...(first as LessonStep), action: { op: 'highlight', args: { slot } } },
          ...rest,
          answerLine({ op: 'fill', args: { slot, value: n } }),
        ];
      }
      case 'compare': {
        const id = out.answer.kind === 'choice' ? out.answer.id : 'true';
        const v = judgedValue(out.params, eq);
        return [
          say(
            'gen.equality.eq.side',
            { n: sideValue(eq.left, v) },
            { op: 'highlight', args: { side: 'left' } },
          ),
          id === 'true'
            ? say('gen.equality.eq.true', { n: eq.value }, { op: 'answer', args: { id } })
            : say('gen.equality.eq.false', {}, { op: 'answer', args: { id } }),
        ];
      }
      case 'balance': {
        if (w.mode === 'make-equal') {
          const target = out.answer.kind === 'state' ? out.answer.target : {};
          const left = asNum(target.left as number);
          const right = asNum(target.right as number);
          const side = left >= right ? 'right' : 'left';
          const k = Math.abs(left - right);
          const sprite = asStr(out.params.sprite, 'shell');
          const unit = w.objectWeights ? { object: sprite, count: 1 } : { n: 1 };
          return [
            say(
              'gen.equality.eq.heavier',
              { n: Math.max(left, right) },
              { op: 'highlight-side', args: { side: side === 'right' ? 'left' : 'right' } },
            ),
            say(
              'gen.equality.eq.add-blocks',
              { n: k },
              { op: 'place', args: { side, term: unit, count: k } },
            ),
          ];
        }
        if (w.mode === 'judge') {
          const id = out.answer.kind === 'choice' ? out.answer.id : 'true';
          const v = judgedValue(out.params, eq);
          return [
            say(
              'gen.equality.eq.side',
              { n: sideValue(eq.left, v) },
              { op: 'highlight-side', args: { side: 'left' } },
            ),
            say(
              'gen.equality.eq.other-side',
              { n: sideValue(eq.right, v) },
              { op: 'highlight-side', args: { side: 'right' } },
            ),
            id === 'true'
              ? say('gen.equality.eq.balances', { n: eq.value }, { op: 'answer', args: { id } })
              : say('gen.equality.eq.not-balanced', {}, { op: 'answer', args: { id } }),
          ];
        }
        const blankLeft = eq.left.some((x) => 'blank' in x);
        const [first, ...rest] = thinkLines(eq, out.params);
        return [
          {
            ...(first as LessonStep),
            action: { op: 'highlight-side', args: { side: blankLeft ? 'right' : 'left' } },
          },
          ...rest,
          answerLine({ op: 'answer', args: { value: n } }),
        ];
      }
      default:
        return [];
    }
  },
};
