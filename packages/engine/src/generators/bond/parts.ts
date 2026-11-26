// bond.parts (03 §5.6): part–part–whole. `unknown` is part (find the missing part), whole, split
// (any two parts), or new-way (a split not found yet; `found` ways are shown as already found).
// Derived: `other` = whole − part. With `addend` (CPS.11, split to finish a ten), the whole is the
// second addend and the part is what the addend needs to make ten (8 + 5: give 2, keep 3).
// With `gap` (CPS.06, all the ways), a new-way item shows every way but one as found, in order
// 1 + (n − 1), 2 + (n − 2), …; the missing way is the one whose smaller part is `gap`.
// Formats: number-bond, tenframe-fill, rekenrek, number-pad, number-line-jump, make-set, and (part
// unknown, CPS.09 tens partners of 100) base-ten-build and hundred-chart: the known part is built
// on the mat and the child adds pieces until the mat is worth the whole (`baseten.value`), or taps
// the missing part on a 1–100 chart. K02: number-line-jump with the `open-number-line`
// representation (CPS.10, partners of 100) has no ticks and hops of 1–10 from the part to the
// whole; the total jump is typed (the demo goes to the next ten, then by tens).

import type {
  LessonStep,
  ParamValues,
  ResponseValue,
  StimulusSpec,
  WidgetAction,
} from '@number-island/shared';
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

/**
 * Formats with their own size feature; whole.over5 is emitted only for the others. The rekenrek's
 * own size feature (n.over10) only marks the second row, so it gets whole.over5 too.
 */
const SIZED = new Set(['tenframe-fill', 'make-set']);

/** Hops from `from` up to `to` on an open line: to the next ten first, then tens, then the rest. */
export function tenHops(from: number, to: number): number[] {
  const hops: number[] = [];
  let at = from;
  const first = Math.min(to - at, (10 - (at % 10)) % 10);
  if (first > 0) {
    hops.push(first);
    at += first;
  }
  while (to - at >= 10) {
    hops.push(10);
    at += 10;
  }
  if (to > at) hops.push(to - at);
  return hops;
}

/** Formats that can show an addend being finished to ten (number-bond and number-pad show the split). */
const ADDEND_FORMATS = new Set(['tenframe-fill', 'rekenrek', 'number-bond', 'number-pad']);

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const wayKey = (a: number, b: number): string => `${Math.min(a, b)}+${Math.max(a, b)}`;

/** The canonical split a demo shows: as even as possible, both parts non-zero. */
export function demoSplit(whole: number): [number, number] {
  const a = Math.max(1, Math.floor(whole / 2));
  return [a, whole - a];
}

/**
 * The ways a new-way item shows as already found, in a fixed order so they depend on the params
 * only: ten and the rest (13 is 10 and 3), then one less and one, then the near double, then the
 * remaining splits from the top. Both parts are non-zero; turn-arounds count once.
 */
export function knownWays(whole: number, count: number): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<string>();
  const push = (a: number, b: number) => {
    if (out.length >= count || a <= 0 || b <= 0 || seen.has(wayKey(a, b))) return;
    seen.add(wayKey(a, b));
    out.push([a, b]);
  };
  if (whole > 10) push(10, whole - 10);
  push(whole - 1, 1);
  push(Math.ceil(whole / 2), Math.floor(whole / 2));
  for (let a = whole - 2; a >= 1 && out.length < count; a -= 1) push(a, whole - a);
  return out;
}

/**
 * CPS.06 (all the ways): every way to split `whole` into two non-zero parts, turn-arounds once,
 * in order (1 and whole − 1 first), except the one whose smaller part is `gap`.
 */
export function gapWays(whole: number, gap: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 1; a <= Math.floor(whole / 2); a += 1) if (a !== gap) out.push([a, whole - a]);
  return out;
}

/** The ways a new-way item shows as found: the `gap` list, or the `found` first ways. */
export function shownWays(whole: number, p: ParamValues): [number, number][] {
  if (p.unknown !== 'new-way') return [];
  const gap = asNum(p.gap);
  return gap > 0 ? gapWays(whole, gap) : knownWays(whole, asNum(p.found));
}

/**
 * The split a demo shows that is not already found and fits the widget (`cap` per part: ten cells
 * in a frame, ten beads on a row, five fingers on a hand): the most even one available. Null when
 * none is left.
 */
export function freshSplit(
  whole: number,
  found: readonly [number, number][],
  cap = Number.POSITIVE_INFINITY,
): [number, number] | null {
  const seen = new Set(found.map(([a, b]) => wayKey(a, b)));
  for (let a = Math.max(1, Math.floor(whole / 2)); a >= 1; a -= 1) {
    const b = whole - a;
    if (b >= 1 && a <= cap && b <= cap && !seen.has(wayKey(a, b))) return [a, b];
  }
  return null;
}

/** The most one part can hold on a split widget. */
function partCap(format: string, representation: string | undefined): number {
  if (format === 'tenframe-fill' || format === 'rekenrek') return BEADS_PER_ROW;
  if (format === 'make-set' && representation === 'fingers') return 5;
  return Number.POSITIVE_INFINITY;
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
    'base-ten-build',
    'hundred-chart',
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
    found: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'new-way: how many ways are shown as already found (knownWays order: ten and the rest first)',
    },
    gap: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'new-way, all the ways (CPS.06): every way but the one whose smaller part is gap is shown found, in order (0: off; then `found` is 0)',
    },
    addend: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'split to finish a ten (CPS.11): the addend being made ten; the whole is the other addend and the part is 10 − addend (0: off)',
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
    'whole.upTo5': {
      weight: 0.15,
      doc: 'max(0, min(whole, 5) − 2): size of a small whole (2 splits one way, 5 four ways)',
    },
    'missing.over4': {
      weight: 0.4,
      doc: 'part unknown: max(0, missing part − 4) / 5 (a big missing part is counted on, not seen)',
    },
  },
  narration: [
    'gen.bond.parts.whole-is',
    'gen.bond.parts.count-on',
    'gen.bond.parts.missing-is',
    'gen.bond.parts.split',
    'gen.bond.parts.together',
    'gen.bond.parts.make-ten',
    'gen.bond.parts.left-over',
    'gen.bond.parts.ten-and',
    'gen.bond.parts.put-in',
    'gen.bond.parts.hop-to',
    'gen.bond.parts.ones-make-ten',
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
    const whole = asNum(p.whole);
    const addend = asNum(p.addend);
    const found = asNum(p.found);
    const gap = asNum(p.gap);
    if (found < 0 || (found > 0 && p.unknown !== 'new-way')) return false;
    if (gap < 0 || (gap > 0 && (p.unknown !== 'new-way' || found > 0))) return false;
    if (gap > 0 && (whole < 4 || gap > Math.floor(whole / 2) || addend !== 0)) return false;
    const split = p.unknown === 'split' || p.unknown === 'new-way';
    if (split) {
      if (whole < 2 || addend !== 0) return false;
      if (p.unknown === 'split') return true;
      // A new way must be left that the widget can show.
      const ways = shownWays(whole, p);
      return (
        (gap > 0 || ways.length === found) &&
        freshSplit(whole, ways, partCap(t.format, t.representation)) !== null
      );
    }
    const part = asNum(p.part);
    if (part < 0 || part > whole) return false;
    // The mat and the chart find a missing part (CPS.09); the chart is 1–100.
    if (t.format === 'base-ten-build' || t.format === 'hundred-chart') {
      const scale = p.tensOnly === true ? 10 : 1;
      if (addend !== 0 || p.unknown !== 'part' || part >= whole) return false;
      return t.format === 'base-ten-build' ? whole * scale <= 999 : whole * scale <= 100;
    }
    if (addend !== 0) {
      // The part is what the addend needs to make ten, and something is kept from the whole.
      if (addend < 1 || addend > 9 || p.unknown !== 'part' || p.tensOnly === true) return false;
      if (addend + part !== 10 || part >= whole || !ADDEND_FORMATS.has(t.format)) return false;
      if ((t.format === 'tenframe-fill' || t.format === 'rekenrek') && whole > BEADS_PER_ROW)
        return false;
      return true;
    }
    // A jump item needs at least one hop.
    return t.format !== 'number-line-jump' || part < whole;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const unknown = asStr(params.unknown, 'part');
    const scale = params.tensOnly === true ? 10 : 1;
    const whole = asNum(params.whole) * scale;
    const part = asNum(params.part) * scale;
    const other = whole - part;
    const addend = asNum(params.addend);
    const isSplit = unknown === 'split' || unknown === 'new-way';
    if (!isSplit && (part < 0 || other < 0)) throw new RangeError('bond.parts: part exceeds whole');
    const found = shownWays(whole, params);
    // Feature values depend on the params only (the learner rebuilds them from params and seed).
    const math: Record<string, number> = {
      zeroPart: !isSplit && (part === 0 || other === 0) ? 1 : 0,
      'whole.over20': Math.max(0, whole - 20) / 10,
      tensBond: scale === 10 ? 1 : 0,
      'whole.upTo5': Math.max(0, Math.min(whole / scale, 5) - 2),
      'missing.over4': unknown === 'part' ? Math.max(0, other / scale - 4) / 5 : 0,
    };
    if (!SIZED.has(t.format)) math['whole.over5'] = Math.max(0, whole - 5) / 5;
    const [wayA, wayB] = found[0] ?? [0, 0];
    const vars = pickVars(t, { whole, part, other, addend, total: addend + whole, wayA, wayB });
    const missing = unknown === 'whole' ? whole : other;
    const bondPicture: StimulusSpec = {
      kind: 'number-bond',
      whole: unknown === 'whole' ? '?' : whole,
      parts: unknown === 'whole' ? [part, other] : [part, '?'],
    };
    // A bond of tens is pictured as the bond of its tens (30 and 70 as 3 and 7 on a ten-frame).
    const overlay = tenFrameOverlay(whole / scale, [part / scale, other / scale]);
    // Every split widget asks for two nonzero parts (`nonZero: true`); both checkers do too.
    const splitAnswer =
      unknown === 'new-way'
        ? {
            kind: 'state' as const,
            checker: 'bond.newWay' as const,
            target: { whole, found, nonZero: true },
          }
        : {
            kind: 'state' as const,
            checker: 'bond.split' as const,
            target: { whole, nonZero: true },
          };
    let p: PartialOutput;
    if (addend > 0 && (t.format === 'tenframe-fill' || t.format === 'rekenrek')) {
      p = finishTenOutput(t.format, { params, vars, math, addend, whole, give: part, keep: other });
      return finish(bondParts, ctx, p);
    }
    if (addend > 0 && !ADDEND_FORMATS.has(t.format)) {
      throw new RangeError(`bond.parts: ${t.format} cannot show an addend made ten`);
    }
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
                ...(unknown === 'new-way' ? { found } : {}),
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
          answer: isSplit ? splitAnswer : { kind: 'number', value: missing },
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
          // A split shows one part in each frame (the authored CPS.02 lesson moves counters from
          // frame 0 to frame 1), so a ten-frame split always has two frames.
          if (whole > 20) throw new RangeError('bond.parts: whole exceeds two ten-frames');
          p = {
            params,
            vars,
            math,
            widget: { ...base, frames: 2, prefilled: [], goal: 'show-n', n: whole, thenAsk: null },
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
        if (isSplit) throw new RangeError('bond.parts: number-pad needs a part or whole unknown');
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
        break;
      }
      case 'number-line-jump': {
        if (isSplit)
          throw new RangeError('bond.parts: number-line-jump needs a part or whole unknown');
        if (t.representation === 'open-number-line') {
          // CPS.10: no ticks, hops of 1–10, so 64 → 70 → 80 → 90 → 100 (or any other way there).
          const allowedJumps = Array.from({ length: 10 }, (_, i) => i + 1);
          p = {
            params,
            vars,
            math,
            widget: {
              format: 'number-line-jump',
              min: Math.max(0, Math.floor(part / 10) * 10 - 10),
              max: whole + 10,
              ticksEvery: null,
              labelsEvery: null,
              start: part,
              goal: 'land-on',
              target: whole,
              allowedJumps,
              path: 'open',
              thenAsk: 'total-jump',
            },
            answer: {
              kind: 'state',
              checker: 'jumps.reach',
              target: { start: part, target: whole, allowedJumps, value: other },
            },
            highlight: [{ op: 'highlight', args: { at: whole } }],
          };
          break;
        }
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
      case 'base-ten-build': {
        // The known part is on the mat; the child puts in pieces until it is worth the whole.
        if (unknown !== 'part') throw new RangeError('bond.parts: base-ten-build finds a part');
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'base-ten-build',
            target: whole,
            mode: 'build',
            pieces: { thousands: false, hundreds: false, tens: true, ones: scale === 1 },
            prebuilt: { hundreds: 0, tens: Math.floor(part / 10), ones: part % 10 },
            wholeIs: 'unit',
          },
          answer: { kind: 'state', checker: 'baseten.value', target: { value: whole } },
          highlight: [{ op: 'count-by', args: { kind: scale === 10 ? 'tens' : 'ones' } }],
        };
        break;
      }
      case 'hundred-chart': {
        // Tap the missing part on a 1–100 chart (30 and ? make 100: count the rows down to 100).
        if (unknown !== 'part') throw new RangeError('bond.parts: hundred-chart finds a part');
        p = {
          params,
          vars,
          math,
          widget: { format: 'hundred-chart', first: 1, rows: 10, hidden: [], mode: 'find' },
          answer: { kind: 'number', value: other },
          nudge: [chartColumn(part, scale)],
        };
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
        const [a, b] = splitShown(out);
        const whole = a + b;
        if (w.format === 'tenframe-fill') {
          // One part per frame.
          const cells = [a, b].map((part) =>
            Array.from({ length: 10 }, (_, i) => (i < part ? 1 : 0)),
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
        const addend = asNum(out.params.addend);
        if (addend > 0) {
          // Finish the ten: the addend and the given part fill frame 0, the rest stays in frame 1.
          const keep = asNum(target.value as number);
          const first = Array.from({ length: 10 }, (_, i) => (i < addend ? 1 : 2));
          const second = Array.from({ length: 10 }, (_, i) => (i < keep ? 2 : 0));
          return { kind: 'state', value: { cells: [first, second], value: keep } };
        }
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
        const jumps = target.allowedJumps as number[];
        const jump = jumps[0] as number;
        return {
          kind: 'state',
          value: {
            jumps:
              jumps.length > 1
                ? tenHops(start, goal)
                : new Array<number>((goal - start) / jump).fill(jump),
            value: goal - start,
          },
        };
      }
      case 'baseten.value': {
        // The whole as tens and ones (the tray offers no hundreds): 100 is ten tens.
        const whole = asNum(target.value as number);
        return {
          kind: 'state',
          value: { thousands: 0, hundreds: 0, tens: Math.floor(whole / 10), ones: whole % 10 },
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
    const addend = asNum(out.params.addend);
    const isSplit = unknown === 'split' || unknown === 'new-way';
    const [a, b] = isSplit ? splitShown(out) : demoSplit(whole);
    if (addend > 0 && w.format === 'tenframe-fill') {
      return [
        say(
          'gen.bond.parts.make-ten',
          { part },
          { op: 'move-counters', args: { fromFrame: 1, toFrame: 0, count: part } },
        ),
        say('gen.bond.parts.left-over', { n: other }, { op: 'answer', args: { value: other } }),
      ];
    }
    if (addend > 0 && w.format === 'rekenrek') {
      return [
        say('gen.bond.parts.make-ten', { part }, { op: 'slide', args: { row: 1, count: -part } }),
        say('gen.bond.parts.make-ten', { part }, { op: 'slide', args: { row: 0, count: part } }),
        say('gen.bond.parts.ten-and', { n: other }, { op: 'count-total' }),
      ];
    }
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
            // The second part goes in the second frame.
            say(
              'gen.bond.parts.split',
              { a, b },
              { op: 'place', args: { frame: 1, count: b, color: 'a' } },
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
          (out.answer.checker === 'bond.split' || out.answer.checker === 'bond.newWay')
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
        if (w.ticksEvery === null) {
          // The open line (CPS.10): to the next ten, then by tens.
          let at = part;
          for (const by of tenHops(part, whole)) {
            at += by;
            steps.push(say('gen.bond.parts.hop-to', { by, n: at }, { op: 'hop', args: { by } }));
          }
          steps.push(say('gen.bond.parts.missing-is', { n: other }, { op: 'label-landing' }));
          return steps;
        }
        for (let v = part + scale; v <= whole; v += scale) {
          steps.push(
            say('gen.bond.parts.count-on', { part: v, whole }, { op: 'hop', args: { by: scale } }),
          );
        }
        steps.push(say('gen.bond.parts.missing-is', { n: other }, { op: 'label-landing' }));
        return steps;
      }
      case 'base-ten-build': {
        // Count the known part, put in the missing pieces, then count the whole.
        const fill = (10 - (part % 10)) % 10;
        if (scale === 1 && fill > 0 && whole % 10 === 0 && other > fill) {
          // CPS.10 (64 + ? = 100): ones up to the next ten, bundle them, then tens, never dozens
          // of single ones.
          return [
            say(
              'gen.bond.parts.count-on',
              { part, whole },
              { op: 'count-by', args: { kind: 'tens' } },
            ),
            say(
              'gen.bond.parts.put-in',
              { n: fill },
              { op: 'add-piece', args: { kind: 'ones', count: fill } },
            ),
            say('gen.bond.parts.ones-make-ten', {}, { op: 'fuse', args: { kind: 'ones' } }),
            say(
              'gen.bond.parts.put-in',
              { n: other - fill },
              { op: 'add-piece', args: { kind: 'tens', count: (other - fill) / 10 } },
            ),
            say('gen.bond.parts.whole-is', { whole }, { op: 'count-by', args: { kind: 'tens' } }),
          ];
        }
        const kind = scale === 10 ? 'tens' : 'ones';
        return [
          say('gen.bond.parts.count-on', { part, whole }, { op: 'count-by', args: { kind } }),
          say(
            'gen.bond.parts.put-in',
            { n: other },
            { op: 'add-piece', args: { kind, count: other / scale } },
          ),
          say('gen.bond.parts.whole-is', { whole }, { op: 'count-by', args: { kind } }),
        ];
      }
      case 'hundred-chart':
        return [
          say('gen.bond.parts.count-on', { part, whole }, chartColumn(part, scale)),
          say('gen.bond.parts.missing-is', { n: other }, { op: 'tap', args: { n: other } }),
        ];
      case 'make-set':
        if (
          out.answer.kind === 'state' &&
          (out.answer.checker === 'bond.split' || out.answer.checker === 'bond.newWay')
        ) {
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

/**
 * The hundred-chart cue for finding a part: the tens column a tens bond climbs down (30 → 100), or
 * the row a part of ones starts on. Never the missing part's own cell.
 */
function chartColumn(part: number, scale: number): WidgetAction {
  return scale === 10
    ? { op: 'highlight-col', args: { n: part > 0 ? part : 10 } }
    : { op: 'highlight-row', args: { n: Math.max(1, part) } };
}

/** The split a split or new-way item's demo shows (not already found, and fits the widget). */
function splitShown(out: GeneratorOutput): [number, number] {
  const scale = out.params.tensOnly === true ? 10 : 1;
  const whole = asNum(out.params.whole) * scale;
  const found = shownWays(whole, out.params);
  const w = out.widget;
  const cap =
    w.format === 'tenframe-fill' || w.format === 'rekenrek'
      ? BEADS_PER_ROW
      : w.format === 'make-set' && w.container === 'hands'
        ? 5
        : Number.POSITIVE_INFINITY;
  return freshSplit(whole, found, cap) ?? demoSplit(whole);
}

interface FinishTen {
  params: ParamValues;
  vars: Record<string, string | number>;
  math: Record<string, number>;
  addend: number;
  whole: number;
  give: number;
  keep: number;
}

/**
 * Split to finish a ten (CPS.11): the addend sits in frame 0 (or on the top row) and the whole in
 * frame 1 (the bottom row). Moving `give` over fills the ten; `keep` is left.
 */
function finishTenOutput(format: 'tenframe-fill' | 'rekenrek', o: FinishTen): PartialOutput {
  const { params, vars, math, addend, whole, keep } = o;
  if (format === 'tenframe-fill') {
    return {
      params,
      vars,
      math,
      widget: {
        format: 'tenframe-fill',
        frames: 2,
        size: 10,
        prefilled: [
          { frame: 0, color: 'a', count: addend },
          { frame: 1, color: 'b', count: whole },
        ],
        goal: 'make-ten',
        requireStandardFill: false,
        thenAsk: 'missing',
        skin: 'frame',
      },
      answer: {
        kind: 'state',
        checker: 'tenframe.makeTen',
        target: { total: addend + whole, value: keep },
      },
      highlight: [{ op: 'highlight', args: { target: 'empty-cells' } }],
    };
  }
  return {
    params,
    vars,
    math,
    widget: {
      format: 'rekenrek',
      rows: 2,
      preset: [addend, whole],
      mode: 'make-ten',
      target: addend + whole,
      rowRule: 'fill-top-first',
      thenAsk: null,
    },
    answer: {
      kind: 'state',
      checker: 'rekenrek.total',
      target: { n: addend + whole, rowRule: 'fill-top-first' },
    },
    highlight: [{ op: 'highlight', args: { row: 0, upTo: addend } }],
  };
}
