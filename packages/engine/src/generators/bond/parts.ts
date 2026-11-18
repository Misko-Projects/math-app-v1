// bond.parts (03 §5.6): part–part–whole. `unknown` is part (find the missing part), whole, split
// (any two parts), or new-way (a split not found yet). Derived: `other` = whole − part.
// Formats: number-bond, tenframe-fill, rekenrek, number-pad, number-line-jump, make-set.

import type { LessonStep, ParamValues, ResponseValue, StimulusSpec } from '@number-island/shared';
import { BEADS_PER_ROW } from '../../formats/rekenrek';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
  tenFrameOverlay,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const UNKNOWNS = ['part', 'whole', 'split', 'new-way'];

/** Formats with their own size feature; whole.over5 is emitted only for the others. */
const SIZED = new Set(['tenframe-fill', 'rekenrek', 'make-set']);

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** The canonical split a demo shows: as even as possible, both parts non-zero. */
export function demoSplit(whole: number): [number, number] {
  const a = Math.max(1, Math.floor(whole / 2));
  return [a, whole - a];
}

export const bondParts: GeneratorDef = {
  id: 'bond.parts',
  formats: [
    'number-bond',
    'tenframe-fill',
    'rekenrek',
    'number-pad',
    'number-line-jump',
    'make-set',
  ],
  params: {
    whole: { type: 'int', default: { kind: 'int', min: 2, max: 10 }, doc: 'the whole' },
    part: {
      type: 'int',
      default: { kind: 'int', min: 0, max: 10 },
      doc: 'the known part (part and whole unknowns); not drawn for split and new-way',
    },
    unknown: {
      type: 'string',
      values: UNKNOWNS,
      default: { kind: 'const', value: 'part' },
      doc: 'part, whole, split or new-way',
    },
    tensOnly: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'multiples of ten only (MDA.16); whole and part are given in tens',
    },
  },
  derived: ['other'],
  features: {
    zeroPart: { weight: -0.3, doc: 'one part is 0' },
    'whole.over20': { weight: 0.4, doc: 'max(0, whole − 20) / 10' },
    tensBond: { weight: 0.3, doc: 'a bond of tens (tensOnly)' },
    'whole.over5': {
      weight: 0.4,
      doc: 'max(0, whole − 5) / 5, for formats without their own size feature',
    },
  },
  narration: [
    'gen.bond.parts.whole-is',
    'gen.bond.parts.count-on',
    'gen.bond.parts.missing-is',
    'gen.bond.parts.split',
    'gen.bond.parts.together',
  ],
  sample(spec, rng) {
    const p = sampleAll(spec, rng);
    if (p.unknown === 'split' || p.unknown === 'new-way') delete p.part;
    return p;
  },
  derive(p): ParamValues {
    if (p.part === undefined) return {};
    return { other: asNum(p.whole) - asNum(p.part) };
  },
  accepts(p, t) {
    const split = p.unknown === 'split' || p.unknown === 'new-way';
    if (split) return asNum(p.whole) >= 2;
    const part = asNum(p.part);
    if (part < 0 || part > asNum(p.whole)) return false;
    // A jump item needs at least one hop.
    return t.format !== 'number-line-jump' || part < asNum(p.whole);
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const unknown = asStr(params.unknown, 'part');
    const scale = params.tensOnly === true ? 10 : 1;
    const whole = asNum(params.whole) * scale;
    const part = asNum(params.part) * scale;
    const other = whole - part;
    const isSplit = unknown === 'split' || unknown === 'new-way';
    if (!isSplit && (part < 0 || other < 0)) throw new RangeError('bond.parts: part exceeds whole');
    const math: Record<string, number> = {
      zeroPart: !isSplit && (part === 0 || other === 0) ? 1 : 0,
      'whole.over20': Math.max(0, whole - 20) / 10,
      tensBond: scale === 10 ? 1 : 0,
    };
    if (!SIZED.has(t.format)) math['whole.over5'] = Math.max(0, whole - 5) / 5;
    const vars = pickVars(t, { whole, part, other });
    const missing = unknown === 'whole' ? whole : other;
    const bondPicture: StimulusSpec = {
      kind: 'number-bond',
      whole: unknown === 'whole' ? '?' : whole,
      parts: unknown === 'whole' ? [part, other] : [part, '?'],
    };
    const overlay = tenFrameOverlay(whole, [part, other]);
    const splitAnswer = {
      kind: 'state' as const,
      checker: 'bond.split' as const,
      target: { whole, nonZero: true },
    };
    let p: PartialOutput;
    switch (t.format) {
      case 'number-bond': {
        const counters = t.tier === 'concrete';
        p = {
          params,
          vars,
          math,
          widget: isSplit
            ? {
                format: 'number-bond',
                whole,
                parts: [null, null],
                mode: unknown === 'new-way' ? 'new-way' : 'split',
                ...(unknown === 'new-way' ? { found: [] } : {}),
                counters,
                nonZero: true,
              }
            : unknown === 'whole'
              ? {
                  format: 'number-bond',
                  whole: null,
                  parts: [part, other],
                  mode: 'missing-whole',
                  counters,
                  nonZero: false,
                }
              : {
                  format: 'number-bond',
                  whole,
                  parts: [part, null],
                  mode: 'missing-part',
                  counters,
                  nonZero: false,
                },
          answer: isSplit
            ? unknown === 'new-way'
              ? { kind: 'state', checker: 'bond.newWay', target: { whole, found: [] } }
              : splitAnswer
            : { kind: 'number', value: missing },
          nudge: [{ op: 'highlight', args: { slot: unknown === 'whole' ? 'whole' : 'part-1' } }],
          overlay,
        };
        break;
      }
      case 'tenframe-fill': {
        const frames: 1 | 2 = whole > 10 ? 2 : 1;
        const base = {
          format: 'tenframe-fill' as const,
          frames,
          size: 10 as const,
          requireStandardFill: false,
          skin: 'frame' as const,
        };
        if (isSplit) {
          p = {
            params,
            vars,
            math,
            widget: { ...base, prefilled: [], goal: 'show-n', n: whole, thenAsk: null },
            answer: splitAnswer,
          };
        } else if (whole === 10 && unknown === 'part') {
          p = {
            params,
            vars,
            math,
            widget: {
              ...base,
              prefilled: part > 0 ? [{ frame: 0, color: 'a', count: part }] : [],
              goal: 'make-ten',
              thenAsk: 'missing',
            },
            answer: {
              kind: 'state',
              checker: 'tenframe.makeTen',
              target: { total: 10, value: other },
            },
            highlight: [{ op: 'highlight', args: { target: 'empty-cells' } }],
          };
        } else {
          p = {
            params,
            vars,
            math,
            widget: {
              ...base,
              prefilled: part > 0 ? [{ frame: 0, color: 'a', count: part }] : [],
              goal: 'show-n',
              n: whole,
              thenAsk: 'missing',
            },
            answer: {
              kind: 'state',
              checker: 'tenframe.total',
              target: { n: whole, value: other },
            },
            highlight: [{ op: 'highlight', args: { target: 'empty-cells' } }],
          };
        }
        break;
      }
      case 'rekenrek': {
        if (whole > 2 * BEADS_PER_ROW)
          throw new RangeError('bond.parts: whole exceeds the rekenrek');
        const rows: 1 | 2 = isSplit || whole > BEADS_PER_ROW ? 2 : 1;
        if (isSplit) {
          p = {
            params,
            vars,
            math,
            widget: {
              format: 'rekenrek',
              rows,
              preset: [0, 0],
              mode: 'show',
              target: whole,
              rowRule: 'any',
              thenAsk: null,
            },
            answer: splitAnswer,
          };
        } else {
          const rowRule = whole === BEADS_PER_ROW ? 'fill-top-first' : 'any';
          p = {
            params,
            vars,
            math,
            widget: {
              format: 'rekenrek',
              rows,
              preset: [Math.min(part, BEADS_PER_ROW), Math.max(0, part - BEADS_PER_ROW)],
              mode: whole === BEADS_PER_ROW ? 'make-ten' : 'show',
              target: whole,
              rowRule,
              thenAsk: null,
            },
            answer: { kind: 'state', checker: 'rekenrek.total', target: { n: whole, rowRule } },
            highlight: [{ op: 'highlight', args: { row: 0, upTo: part } }],
          };
        }
        break;
      }
      case 'number-pad': {
        const abstract = t.tier === 'abstract';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: abstract ? { kind: 'none' } : bondPicture,
            ...(abstract
              ? {
                  expression: {
                    tokens:
                      unknown === 'whole'
                        ? [
                            { t: 'num', v: part },
                            { t: 'op', v: '+' },
                            { t: 'num', v: other },
                            { t: 'rel', v: '=' },
                            { t: 'blank', id: 'x' },
                          ]
                        : [
                            { t: 'num', v: part },
                            { t: 'op', v: '+' },
                            { t: 'blank', id: 'x' },
                            { t: 'rel', v: '=' },
                            { t: 'num', v: whole },
                          ],
                  },
                }
              : {}),
            blanks: [{ id: 'x', maxDigits: 2 }],
            unit: null,
          },
          answer: { kind: 'number', value: missing },
          overlay,
        };
        if (isSplit) throw new RangeError('bond.parts: number-pad needs a part or whole unknown');
        break;
      }
      case 'number-line-jump': {
        if (isSplit)
          throw new RangeError('bond.parts: number-line-jump needs a part or whole unknown');
        const jump = scale;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-line-jump',
            min: 0,
            max: Math.max(whole + 2 * jump, 10),
            ticksEvery: jump,
            labelsEvery: jump,
            start: part,
            goal: 'land-on',
            target: whole,
            allowedJumps: [jump],
            path: t.tier === 'concrete' ? 'stones' : 'line',
            thenAsk: 'total-jump',
          },
          answer: {
            kind: 'state',
            checker: 'jumps.reach',
            target: { start: part, target: whole, allowedJumps: [jump], value: other },
          },
          highlight: [{ op: 'highlight', args: { at: whole } }],
        };
        break;
      }
      case 'make-set': {
        const hands = t.representation === 'fingers';
        if (isSplit) {
          p = {
            params,
            vars,
            math,
            widget: hands
              ? {
                  format: 'make-set',
                  target: whole,
                  mode: 'make',
                  source: { sprite: 'finger', supply: 10 },
                  container: 'hands',
                  capacity: 10,
                  showRunningCount: false,
                }
              : {
                  format: 'make-set',
                  target: whole,
                  mode: 'take-away',
                  start: whole,
                  source: { sprite: 'shell', supply: 0 },
                  container: 'boat',
                  capacity: Math.max(10, whole),
                  showRunningCount: false,
                },
            answer: splitAnswer,
          };
        } else {
          p = {
            params,
            vars,
            math,
            widget: {
              format: 'make-set',
              target: whole,
              mode: part > 0 ? 'add-more' : 'make',
              ...(part > 0 ? { start: part } : {}),
              source: { sprite: hands ? 'finger' : 'shell', supply: other + 2 },
              container: hands ? 'hands' : 'boat',
              capacity: hands ? 10 : Math.max(10, whole),
              showRunningCount: false,
            },
            answer: { kind: 'state', checker: 'set.count', target: { count: whole } },
          };
        }
        break;
      }
      default:
        throw new Error(`bond.parts cannot build ${t.format}`);
    }
    return finish(bondParts, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const w = out.widget;
    const target = out.answer.target;
    switch (out.answer.checker) {
      case 'bond.split':
      case 'bond.newWay': {
        const whole = asNum(target.whole as number);
        const [a, b] = demoSplit(whole);
        if (w.format === 'tenframe-fill') {
          const cells = Array.from({ length: w.frames }, (_, f) =>
            Array.from({ length: 10 }, (_, i) => {
              const k = f * 10 + i;
              return k < a ? 1 : k < a + b ? 2 : 0;
            }),
          );
          return { kind: 'state', value: { cells } };
        }
        if (w.format === 'rekenrek') return { kind: 'state', value: { rows: [a, b] } };
        if (w.format === 'make-set') {
          return w.container === 'hands'
            ? { kind: 'state', value: { count: whole, removed: 0, parts: [a, b] } }
            : { kind: 'state', value: { count: a, removed: b, parts: [a, b] } };
        }
        return { kind: 'state', value: { parts: [a, b] } };
      }
      case 'tenframe.total':
      case 'tenframe.makeTen': {
        if (w.format !== 'tenframe-fill') break;
        const part = w.prefilled.reduce((s, x) => s + x.count, 0);
        const whole = asNum((target.n ?? target.total) as number);
        const cells = Array.from({ length: w.frames }, (_, f) =>
          Array.from({ length: 10 }, (_, i) => {
            const k = f * 10 + i;
            return k < part ? 1 : k < whole ? 2 : 0;
          }),
        );
        return { kind: 'state', value: { cells, value: whole - part } };
      }
      case 'rekenrek.total': {
        const n = asNum(target.n as number);
        return {
          kind: 'state',
          value: { rows: [Math.min(n, BEADS_PER_ROW), Math.max(0, n - BEADS_PER_ROW)] },
        };
      }
      case 'jumps.reach': {
        const start = asNum(target.start as number);
        const goal = asNum(target.target as number);
        const jump = (target.allowedJumps as number[])[0] as number;
        return {
          kind: 'state',
          value: {
            jumps: new Array<number>((goal - start) / jump).fill(jump),
            value: goal - start,
          },
        };
      }
      case 'set.count': {
        if (w.format !== 'make-set') break;
        const count = asNum(target.count as number);
        return {
          kind: 'state',
          value: {
            count,
            removed: 0,
            ...(w.container === 'hands'
              ? { parts: [Math.min(5, count), Math.max(0, count - 5)] }
              : {}),
          },
        };
      }
      default:
        break;
    }
    throw new Error(`bond.parts: no example for ${w.format}`);
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const unknown = asStr(out.params.unknown, 'part');
    const scale = out.params.tensOnly === true ? 10 : 1;
    const whole = asNum(out.params.whole) * scale;
    const part = asNum(out.params.part) * scale;
    const other = whole - part;
    const [a, b] = demoSplit(whole);
    switch (w.format) {
      case 'number-bond':
        if (w.mode === 'split' || w.mode === 'new-way') {
          return [
            say('gen.bond.parts.whole-is', { whole }, { op: 'highlight', args: { slot: 'whole' } }),
            say(
              'gen.bond.parts.split',
              { a, b },
              { op: 'split-counters', args: { left: a, right: b } },
            ),
          ];
        }
        if (w.mode === 'missing-whole') {
          return [
            say(
              'gen.bond.parts.together',
              { a: part, b: other },
              { op: 'highlight', args: { slot: 'whole' } },
            ),
            say(
              'gen.bond.parts.missing-is',
              { n: whole },
              { op: 'fill', args: { slot: 'whole', value: whole } },
            ),
          ];
        }
        return [
          say(
            'gen.bond.parts.count-on',
            { part, whole },
            { op: 'highlight', args: { slot: 'part-1' } },
          ),
          say(
            'gen.bond.parts.missing-is',
            { n: other },
            { op: 'fill', args: { slot: 'part-1', value: other } },
          ),
        ];
      case 'tenframe-fill':
        if (w.thenAsk === null) {
          return [
            say(
              'gen.bond.parts.whole-is',
              { whole },
              { op: 'place', args: { frame: 0, count: a, color: 'a' } },
            ),
            say(
              'gen.bond.parts.split',
              { a, b },
              { op: 'place', args: { frame: 0, count: b, color: 'b' } },
            ),
          ];
        }
        return [
          say(
            'gen.bond.parts.count-on',
            { part, whole },
            { op: 'place', args: { frame: 0, count: other, color: 'b' } },
          ),
          say('gen.bond.parts.missing-is', { n: other }, { op: 'answer', args: { value: other } }),
        ];
      case 'rekenrek':
        if (
          w.mode === 'show' &&
          w.preset[0] === 0 &&
          w.preset[1] === 0 &&
          out.answer.kind === 'state' &&
          out.answer.checker === 'bond.split'
        ) {
          return [
            say('gen.bond.parts.whole-is', { whole }, { op: 'slide', args: { row: 0, count: a } }),
            say('gen.bond.parts.split', { a, b }, { op: 'slide', args: { row: 1, count: b } }),
          ];
        }
        {
          const topFree = BEADS_PER_ROW - w.preset[0];
          const toTop = Math.min(other, topFree);
          const steps = [
            say(
              'gen.bond.parts.count-on',
              { part, whole },
              { op: 'slide', args: { row: 0, count: toTop } },
            ),
          ];
          if (other > toTop) {
            steps.push(
              say(
                'gen.bond.parts.count-on',
                { part, whole },
                { op: 'slide', args: { row: 1, count: other - toTop } },
              ),
            );
          }
          steps.push(say('gen.bond.parts.missing-is', { n: other }, { op: 'count-total' }));
          return steps;
        }
      case 'number-pad':
        return [
          say(unknown === 'whole' ? 'gen.bond.parts.together' : 'gen.bond.parts.count-on', {
            part,
            whole,
            a: part,
            b: other,
          }),
          say(
            'gen.bond.parts.missing-is',
            { n: unknown === 'whole' ? whole : other },
            {
              op: 'type',
              args: { blank: 'x', value: unknown === 'whole' ? whole : other },
            },
          ),
        ];
      case 'number-line-jump': {
        const steps: LessonStep[] = [
          say('gen.bond.parts.count-on', { part, whole }, { op: 'highlight', args: { at: part } }),
        ];
        for (let v = part + scale; v <= whole; v += scale) {
          steps.push(
            say('gen.bond.parts.count-on', { part: v, whole }, { op: 'hop', args: { by: scale } }),
          );
        }
        steps.push(say('gen.bond.parts.missing-is', { n: other }, { op: 'label-landing' }));
        return steps;
      }
      case 'make-set':
        if (out.answer.kind === 'state' && out.answer.checker === 'bond.split') {
          return w.container === 'hands'
            ? [
                say(
                  'gen.bond.parts.whole-is',
                  { whole },
                  { op: 'drag', args: { count: a, hand: 0 } },
                ),
                say('gen.bond.parts.split', { a, b }, { op: 'drag', args: { count: b, hand: 1 } }),
              ]
            : [
                say('gen.bond.parts.whole-is', { whole }),
                say('gen.bond.parts.split', { a, b }, { op: 'remove', args: { count: b } }),
              ];
        }
        return [
          say('gen.bond.parts.count-on', { part, whole }, { op: 'drag', args: { count: other } }),
          say('gen.bond.parts.missing-is', { n: other }, { op: 'close-container' }),
        ];
      default:
        return [];
    }
  },
};
