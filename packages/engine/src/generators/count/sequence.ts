// count.sequence (03 §5.6): the counting sequence from `start` by `step`, forwards or backwards.
// The sequence is start, then `length` more terms; `last` = start + dir · step · length.
// `hide` picks the terms a number-pad or hundred-chart item asks for (every term after start, only
// the last, or the terms between start and last: missing numbers, CNT.18), and `cross: decade`
// redraws until the counted terms cross a multiple of 10 (CNT.09, CNT.10, CNT.16). With `tens` > 0
// (CNT.20, count on and back by tens and ones) the first `tens` steps are tens and the rest are
// ones (34, 44, 54, 55, 56); K01 builds that on number-pad, and the base-ten representation shows
// the start as base-ten pieces.
// Formats: numeral-pick, number-pad, hundred-chart, order, number-line-jump.

import type {
  ExpressionToken,
  LessonStep,
  ParamValues,
  ResponseValue,
  StimulusSpec,
  WidgetAction,
} from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
import { digitCount } from '../../formats/types';
import {
  asNum,
  correctFromAnswer,
  finish,
  numberOptions,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

/**
 * start, then `length` more terms. The first `tens` steps are tens and the rest `step` (34, 44, 54,
 * 55, 56 for tens 2, step 1, length 4).
 */
export function sequenceTerms(
  start: number,
  step: number,
  dir: number,
  length: number,
  tens = 0,
): number[] {
  const out = [start];
  for (let i = 1; i <= length; i += 1) {
    out.push((out[i - 1] as number) + dir * (i <= tens ? 10 : step));
  }
  return out;
}

/** The `tens` param, clamped to 0 … length. */
const tensOf = (p: ParamValues): number => Math.max(0, Math.min(asNum(p.length, 1), asNum(p.tens)));

/**
 * The one hundred chart (03 §5.5: first 0, 1, 101, 201, …; 10 rows, or 12 for 1–120) that shows
 * every number from lo to hi, or null when no single chart does.
 */
export function chartFor(lo: number, hi: number): { first: number; rows: number } | null {
  if (lo < 0) return null;
  if (lo === 0) return hi <= 99 ? { first: 0, rows: 10 } : null;
  if (hi <= 100) return { first: 1, rows: 10 };
  if (lo <= 100) return hi <= 120 ? { first: 1, rows: 12 } : null;
  const first = Math.floor((lo - 1) / 100) * 100 + 1;
  return hi <= first + 99 ? { first, rows: 10 } : null;
}

const crosses = (lo: number, hi: number, unit: number): boolean =>
  Math.floor(lo / unit) !== Math.floor(hi / unit);

const HIDE = ['last', 'all-after', 'between'] as const;
type Hide = (typeof HIDE)[number];

/** The terms a number-pad or hundred-chart item hides (03 §5.6 `hide`). */
export function hiddenTerms(terms: number[], hide: Hide): number[] {
  if (hide === 'last') return terms.slice(-1);
  if (hide === 'between') return terms.slice(1, -1);
  return terms.slice(1);
}

/**
 * A number path (or line) that labels only the terms shown, with '?' on the hidden ones, so the
 * picture never gives a blank away (number-pad on the number-path or number-line representation).
 */
function partialPath(
  terms: number[],
  hidden: number[],
  step: number,
  arrowAt?: number,
): StimulusSpec {
  const lo = Math.min(...terms);
  const hi = Math.max(...terms);
  return {
    kind: 'number-line',
    min: Math.max(0, lo - step),
    max: hi + step,
    ticksEvery: step,
    labelsEvery: null,
    marks: terms.map((v) => ({
      at: v,
      label: hidden.includes(v) ? '?' : String(v),
      ...(v === arrowAt ? { arrow: true } : {}),
    })),
  };
}

/**
 * A number line with ticks every step and only its two ends labelled: a counting aid that names no
 * term of the sequence (the level-3 picture for an order item, whose answer is every term).
 */
function endsOnlyLine(terms: number[], step: number): StimulusSpec {
  const lo = Math.min(...terms);
  const hi = Math.max(...terms);
  const min = Math.max(0, lo - step);
  const max = hi + step;
  return {
    kind: 'number-line',
    min,
    max,
    ticksEvery: step,
    labelsEvery: null,
    // An end that is itself a term (0 when the sequence reaches 0) stays unlabelled.
    marks: [min, max].filter((v) => !terms.includes(v)).map((v) => ({ at: v, label: String(v) })),
  };
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const countSequence: GeneratorDef = {
  id: 'count.sequence',
  formats: ['numeral-pick', 'number-pad', 'hundred-chart', 'order', 'number-line-jump'],
  params: {
    start: { type: 'int', default: { kind: 'int', min: 1, max: 19 }, doc: 'first number shown' },
    step: { type: 'int', default: { kind: 'const', value: 1 }, doc: '1, 2, 5, 10 or 100' },
    dir: { type: 'int', default: { kind: 'const', value: 1 }, doc: '+1 forwards, −1 backwards' },
    length: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'terms after start (1 = "what comes next")',
    },
    hide: {
      type: 'string',
      values: [...HIDE],
      default: { kind: 'const', value: 'all-after' },
      doc: 'number-pad and hundred-chart: hide only the last term, every term after start, or the terms between start and last (missing numbers)',
    },
    cross: {
      type: 'string',
      values: ['any', 'decade'],
      default: { kind: 'const', value: 'any' },
      doc: 'decade: the terms from start to last must cross a multiple of 10 (redrawn otherwise)',
    },
    tens: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'CNT.20: the first `tens` steps are tens, the rest are `step` (34, 44, 54, 55); number-pad only, with step 1',
    },
  },
  derived: ['last'],
  features: {
    digits: { weight: 0.5, doc: 'digits of the largest term − 1' },
    'step.notOne': { weight: 0.4, doc: 'step ≠ 1' },
    mixedSteps: { weight: 0.3, doc: 'tens steps and then ones steps in one sequence (tens)' },
    backward: { weight: 0.6, doc: 'counting back' },
    crossDecade: { weight: 0.5, doc: 'the sequence crosses a multiple of 10' },
    crossCentury: { weight: 0.7, doc: 'the sequence crosses a multiple of 100' },
    zero: { weight: 0.3, doc: 'a term after start is 0 (counting back to zero, CNT.13)' },
  },
  narration: [
    'gen.count.sequence.say-from',
    'gen.count.sequence.say-back',
    'gen.count.sequence.next-is',
    'gen.count.sequence.hop',
    'gen.count.sequence.order-start',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    const start = asNum(p.start);
    const step = asNum(p.step, 1);
    const dir = asNum(p.dir, 1) < 0 ? -1 : 1;
    const length = asNum(p.length, 1);
    const tens = tensOf(p);
    return { last: start + dir * (10 * tens + step * (length - tens)) };
  },
  accepts(p, t) {
    const start = asNum(p.start);
    const last = asNum(p.last);
    if (start < 0 || last < 0 || asNum(p.step, 1) <= 0) return false;
    // Tens then ones (CNT.20): a number pad, counting by ones after the tens.
    const tens = asNum(p.tens);
    if (tens < 0 || tens > asNum(p.length, 1)) return false;
    if (tens > 0 && (t.format !== 'number-pad' || asNum(p.step, 1) !== 1)) return false;
    const lo = Math.min(start, last);
    const hi = Math.max(start, last);
    if (p.cross === 'decade' && !crosses(lo, hi, 10)) return false;
    // Missing numbers between start and last need at least one term between them.
    const asks = t.format === 'number-pad' || t.format === 'hundred-chart';
    if (asks && p.hide === 'between' && asNum(p.length, 1) < 2) return false;
    // A hundred-chart item must fit on one chart.
    return t.format !== 'hundred-chart' || chartFor(lo, hi) !== null;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const start = asNum(params.start);
    const step = asNum(params.step, 1);
    const dir = asNum(params.dir, 1) < 0 ? -1 : 1;
    const length = Math.max(1, asNum(params.length, 1));
    const tens = tensOf(params);
    const terms = sequenceTerms(start, step, dir, length, tens);
    const last = terms[terms.length - 1] as number;
    const next = terms[1] as number;
    const lo = Math.min(start, last);
    const hi = Math.max(start, last);
    if (lo < 0) throw new RangeError('count.sequence: the sequence goes below 0');
    const math = {
      digits: Math.max(0, digitCount(hi) - 1),
      'step.notOne': step !== 1 || tens === length ? 1 : 0,
      mixedSteps: tens > 0 && tens < length ? 1 : 0,
      backward: dir < 0 ? 1 : 0,
      crossDecade: crosses(lo, hi, 10) ? 1 : 0,
      crossCentury: crosses(lo, hi, 100) ? 1 : 0,
      zero: terms.slice(1).includes(0) ? 1 : 0,
    };
    const vars = pickVars(t, { start, last, step, length });
    const hiddenAfter = hiddenTerms(terms, asStrHide(params.hide));
    const onPath = t.representation === 'number-path' || t.representation === 'number-line';
    let p: PartialOutput;
    switch (t.format) {
      case 'numeral-pick': {
        const opts = numberOptions(t, params, length === 1 ? next : last, rng);
        // Label the start (with its arrow) and the shown terms only; the asked term is '?', so
        // neither the picture nor the level-3 overlay names the answer (#12 evidence, CNT.09.t3).
        // The asked term is always hidden too: with hide: between, the pick asks for the last
        // term, which the sequence itself would otherwise show.
        const asked = length === 1 ? next : last;
        const path = partialPath(terms, [...new Set([...hiddenAfter, asked])], step, start);
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'numeral-pick',
            stimulus: onPath ? path : { kind: 'none' },
            options: opts.options,
            layout: 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(length === 1 ? next : last) },
          overlay: path,
        };
        if (opts.diagnostic > 0) p.math = { ...math, 'distractors.diagnostic': opts.diagnostic };
        break;
      }
      case 'number-pad': {
        const tokens: ExpressionToken[] = terms.map((v, i) =>
          i === 0 || !hiddenAfter.includes(v) ? { t: 'num', v } : { t: 'blank', id: `t${i}` },
        );
        const blanks = tokens.flatMap((tk) =>
          // One digit to spare, so a written-as-spoken slip ("twenty-ten" → 210 for 30) can be
          // entered and tagged (MC.decade-transition), and the box size never hints the answer.
          tk.t === 'blank' ? [{ id: tk.id, maxDigits: Math.max(2, digitCount(hi) + 1) }] : [],
        );
        const hidden = terms.filter((v, i) => i > 0 && hiddenAfter.includes(v));
        // The base-ten representation shows the start as pieces (CNT.20: count on from 3 tens 4 ones).
        const pieces: StimulusSpec = {
          kind: 'base-ten',
          ...(start >= 1000 ? { thousands: Math.floor(start / 1000) } : {}),
          hundreds: Math.floor(start / 100) % 10,
          tens: Math.floor(start / 10) % 10,
          ones: start % 10,
        };
        const baseTen = t.representation === 'base-ten' || t.representation === 'bundles';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: onPath
              ? partialPath(terms, hidden, step)
              : baseTen
                ? pieces
                : { kind: 'none' },
            expression: { tokens },
            blanks,
            unit: null,
          },
          answer:
            hidden.length === 1
              ? { kind: 'number', value: hidden[0] as number }
              : { kind: 'numbers', values: hidden, ordered: true },
          // The representation rung shows the path with the asked terms still marked '?'.
          overlay: partialPath(terms, hidden, step),
        };
        break;
      }
      case 'hundred-chart': {
        const chart = chartFor(lo, hi);
        if (!chart)
          throw new RangeError('count.sequence: the sequence does not fit one hundred chart');
        const { first, rows } = chart;
        const fill = length > 1;
        // `fill` answers in the chart's reading order (03 §5.5), which is ascending even when the
        // sequence counts back.
        const readingOrder = [...hiddenAfter].sort((x, y) => x - y);
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'hundred-chart',
            first,
            rows,
            hidden: fill ? readingOrder : [],
            mode: fill ? 'fill' : 'next',
            from: start,
          },
          answer: fill
            ? { kind: 'numbers', values: readingOrder, ordered: true }
            : { kind: 'number', value: next },
          nudge: [chartCue(step, start)],
        };
        break;
      }
      case 'order': {
        const shuffled = rng.fork('layout').shuffle(terms);
        const sorted = [...terms].sort((a, b) => (dir > 0 ? a - b : b - a));
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'order',
            items: shuffled.map((v, i) => ({ id: `item-${i}`, value: v, label: String(v) })),
            direction: dir > 0 ? 'asc' : 'desc',
          },
          answer: { kind: 'numbers', values: sorted, ordered: true },
          overlay: endsOnlyLine(terms, step),
        };
        break;
      }
      case 'number-line-jump': {
        const stones = t.tier === 'concrete';
        const goal = length === 1 ? 'next' : 'land-on';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-line-jump',
            min: Math.max(0, lo - 2 * step),
            max: hi + 3 * step,
            ticksEvery: step,
            labelsEvery: step,
            start,
            goal,
            target: last,
            allowedJumps: [dir * step],
            path: stones ? 'stones' : 'line',
            thenAsk: goal === 'next' ? 'landing' : null,
          },
          answer: {
            kind: 'state',
            checker: 'jumps.reach',
            target: {
              start,
              target: last,
              allowedJumps: [dir * step],
              ...(goal === 'next' ? { value: last } : {}),
            },
          },
          nudge: [{ op: 'highlight', args: { at: start } }],
          highlight: [{ op: 'highlight', args: { at: start } }],
        };
        break;
      }
      default:
        throw new Error(`count.sequence cannot build ${t.format}`);
    }
    return finish(countSequence, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const target = out.answer.target as { start: number; target: number; allowedJumps: number[] };
    const jump = target.allowedJumps[0] as number;
    const hops = Math.round((target.target - target.start) / jump);
    const value = out.answer.target.value;
    return {
      kind: 'state',
      value: {
        jumps: new Array<number>(hops).fill(jump),
        ...(typeof value === 'number' ? { value } : {}),
      },
    };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const start = asNum(out.params.start);
    const last = asNum(out.params.last);
    const step = asNum(out.params.step, 1);
    const dir = asNum(out.params.dir, 1) < 0 ? -1 : 1;
    const terms = sequenceTerms(
      start,
      step,
      dir,
      Math.max(1, asNum(out.params.length, 1)),
      tensOf(out.params),
    );
    const next = terms[1] as number;
    const from = dir < 0 ? 'gen.count.sequence.say-back' : 'gen.count.sequence.say-from';
    switch (w.format) {
      case 'numeral-pick': {
        const id = out.answer.kind === 'choice' ? out.answer.id : '';
        return [
          say(from, { start }),
          say(
            'gen.count.sequence.next-is',
            { n: Number(id.slice(4)) },
            { op: 'tap', args: { id } },
          ),
        ];
      }
      case 'number-pad': {
        const steps: LessonStep[] = [say(from, { start })];
        for (const b of w.blanks) {
          const i = Number(b.id.slice(1));
          const v = terms[i] as number;
          steps.push(
            say(
              'gen.count.sequence.next-is',
              { n: v },
              { op: 'type', args: { blank: b.id, value: v } },
            ),
          );
        }
        return steps;
      }
      case 'hundred-chart':
        if (w.mode === 'fill') {
          // Name every hidden term in counting order, pointing at each box; the last step enters
          // them all (the chart answers with every hidden cell at once, in reading order).
          const hiddenInOrder = terms.filter((v) => w.hidden.includes(v));
          return [
            say(from, { start }, chartCue(step, start)),
            ...hiddenInOrder.map((v, i) =>
              say(
                'gen.count.sequence.next-is',
                { n: v },
                i === hiddenInOrder.length - 1
                  ? { op: 'answer', args: { values: w.hidden } }
                  : { op: 'tap', args: { n: v } },
              ),
            ),
          ];
        }
        return [
          say(from, { start }, chartCue(step, start)),
          say('gen.count.sequence.next-is', { n: next }, { op: 'tap', args: { n: next } }),
        ];
      case 'order': {
        const sorted = [...w.items].sort((a, b) =>
          w.direction === 'asc' ? a.value - b.value : b.value - a.value,
        );
        return [
          say('gen.count.sequence.order-start', { n: (sorted[0] as { value: number }).value }),
          ...sorted.map((it, slot) =>
            say(
              'gen.count.sequence.next-is',
              { n: it.value },
              { op: 'drag', args: { id: it.id, slot } },
            ),
          ),
        ];
      }
      case 'number-line-jump': {
        const steps: LessonStep[] = [
          say(from, { start }, { op: 'highlight', args: { at: start } }),
        ];
        for (let v = start + dir * step; dir > 0 ? v <= last : v >= last; v += dir * step) {
          steps.push(
            say('gen.count.sequence.hop', { n: v }, { op: 'hop', args: { by: dir * step } }),
          );
        }
        if (w.thenAsk) {
          steps.push(say('gen.count.sequence.next-is', { n: last }, { op: 'label-landing' }));
        }
        return steps;
      }
      default:
        return [];
    }
  },
};

/**
 * The hundred-chart cue for a sequence: its row when counting by ones, its column when counting by
 * tens (each next term is one row down, in the same column). Never reveals a hidden term.
 */
function chartCue(step: number, start: number): WidgetAction {
  return step % 10 === 0
    ? { op: 'highlight-col', args: { n: start } }
    : { op: 'highlight-row', args: { n: start } };
}

function asStrHide(v: unknown): Hide {
  return v === 'last' || v === 'between' ? v : 'all-after';
}
