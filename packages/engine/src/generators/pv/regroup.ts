// pv.regroup (03 §5.6): one number, two ways to show it. `n` shown `from` one decomposition is
// traded `to` another: canonical (34 = 3 tens 4 ones), regrouped (one unit of the lowest non-zero
// place above the ones broken into ten: 2 tens 14 ones; 305 = 2 hundreds 10 tens 5 ones) or ones
// (all ones: 34 ones, n ≤ 99). K02 (PV.16) adds tens: one hundred broken into ten tens whatever
// the tens digit (253 = 1 hundred 15 tens 3 ones), which `regrouped` only does when n has no tens.
// `places` (2 or 3) is how many places the mat shows.
//
// Formats:
//   base-ten-trade  `regroup-to`: the mat starts at `from` and must show exactly `to`
//                   (trade.result `{ regroupTarget }`)
//   base-ten-build  `build-exact`, bundling only (every trade a fuse; unbundling is
//                   base-ten-trade): `from` is prebuilt; fuse until the mat holds exactly
//                   the `to` counts (baseten.exact `{ value, exact }`). The tray `limits`
//                   (tradeLimits) hold none of the kinds the trades make, so no piece can be
//                   swapped through the tray instead of fused or split, and any number of the
//                   kind they use up, so putting pieces back never strands the item
//   number-pad      how many is the `from` decomposition (a picture of its pieces on base-ten or
//                   bundles, ten-frames for a canonical teen or 20, or words in the prompt)?
//                   `to` is not used
//   make-set        n loose objects in the boat: bundle every ten (from ones to canonical;
//                   set.count `{ count, groupsOf: 10 }`)
// Feature values depend on the params only (the learner rebuilds them from params and seed).

import type { LessonStep, ParamValues, ResponseValue, StimulusSpec } from '@number-island/shared';
import type { Hto } from '../../formats/place-value';
import { digitCount } from '../../formats/types';
import {
  asNum,
  asStr,
  correctFromAnswer,
  DEFAULT_SPRITES,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import { placeCounts } from './number';

export const DECOMPOSITIONS = ['canonical', 'regrouped', 'ones', 'tens'] as const;
export type Decomposition = (typeof DECOMPOSITIONS)[number];

const BASE_TEN_REPS = new Set(['base-ten', 'bundles']);

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const asDecomposition = (v: unknown, fallback: Decomposition): Decomposition =>
  (DECOMPOSITIONS as readonly unknown[]).includes(v) ? (v as Decomposition) : fallback;

/**
 * The hundreds, tens and ones of n shown one way, or null when n cannot be shown that way (no
 * place above the ones to break for `regrouped`, more than 99 ones for `ones`, no hundred to break
 * for `tens`, n ≥ 1000).
 */
export function decompose(n: number, how: Decomposition): Hto | null {
  if (!Number.isInteger(n) || n < 10 || n > 999) return null;
  if (how === 'ones') return n <= 99 ? { hundreds: 0, tens: 0, ones: n } : null;
  if (how === 'tens') {
    // One hundred as ten tens: 10–19 tens beside the hundreds left (the mat's widest tens column).
    if (n < 100) return null;
    return {
      hundreds: Math.floor(n / 100) - 1,
      tens: (Math.floor(n / 10) % 10) + 10,
      ones: n % 10,
    };
  }
  const c = placeCounts(n, how === 'regrouped');
  const out = { hundreds: c[2] ?? 0, tens: c[1] ?? 0, ones: c[0] ?? 0 };
  if (how === 'regrouped' && out.ones < 10 && out.tens < 10) return null;
  return out;
}

const sameHto = (x: Hto, y: Hto): boolean =>
  x.hundreds === y.hundreds && x.tens === y.tens && x.ones === y.ones;

/**
 * The single trades from one decomposition to another, in the order a solution makes them:
 * hundreds split first, then the tens ↔ ones trades, then tens fused into hundreds. Each trade is
 * `down` (one piece becomes ten of the next smaller kind) or `up` (ten become one).
 */
export function tradesBetween(
  from: Hto,
  to: Hto,
): { kind: 'hundreds' | 'tens' | 'ones'; dir: 'down' | 'up' }[] {
  const out: { kind: 'hundreds' | 'tens' | 'ones'; dir: 'down' | 'up' }[] = [];
  const dh = to.hundreds - from.hundreds;
  const k = (to.ones - from.ones) / 10;
  for (let i = 0; i < -dh; i += 1) out.push({ kind: 'hundreds', dir: 'down' });
  for (let i = 0; i < k; i += 1) out.push({ kind: 'tens', dir: 'down' });
  for (let i = 0; i < -k; i += 1) out.push({ kind: 'ones', dir: 'up' });
  for (let i = 0; i < dh; i += 1) out.push({ kind: 'tens', dir: 'up' });
  return out;
}

/**
 * The tray limits of a build-exact regroup item (PR #83 review, rounds 1–3). The mat starts at
 * `from`, already worth n, and must end with the `to` counts:
 * - a kind the trades use up (fewer in `to` than in `from`) holds any number, so a learner who
 *   puts pieces back can always take them again and finish (the model does not return prebuilt
 *   pieces to the tray), and any other kind can be rebuilt by trading it;
 * - every other shown kind holds none, so the tray never stands in for any one of the trades
 *   (no putting ten ones back for a rod).
 */
export function tradeLimits(
  from: Hto,
  to: Hto,
  withHundreds: boolean,
): Partial<Record<'hundreds' | 'tens' | 'ones', number>> {
  const kinds = withHundreds
    ? (['hundreds', 'tens', 'ones'] as const)
    : (['tens', 'ones'] as const);
  const out: Partial<Record<'hundreds' | 'tens' | 'ones', number>> = {};
  for (const k of kinds) if (to[k] >= from[k]) out[k] = 0;
  return out;
}

/** The decompositions an item trades between (number-pad and make-set end canonical). */
function endsOf(p: ParamValues, format: string): { from: Hto | null; to: Hto | null } {
  const n = asNum(p.n);
  const from = decompose(n, asDecomposition(p.from, 'ones'));
  const to =
    format === 'number-pad' || format === 'make-set'
      ? decompose(n, 'canonical')
      : decompose(n, asDecomposition(p.to, 'canonical'));
  return { from, to };
}

/** The math features of an item: a function of its params and the template's format only. */
export function regroupFeatures(p: ParamValues, format: string): Record<string, number> {
  const { from, to } = endsOf(p, format);
  // Size (n < 100): tens and ones past five are counted, not seen at a glance (as pv.number).
  const n = asNum(p.n);
  // K02: each place of a number to 999, as pv.number counts them.
  const size = {
    'hundreds.over5': Math.max(0, Math.floor(n / 100) - 5) / 4,
    'tens.over5': Math.max(0, (Math.floor(n / 10) % 10) - 5) / 4,
    'ones.over5': Math.max(0, (n % 10) - 5) / 4,
  };
  if (!from || !to) return { regroups: 0, acrossPlaces: 0, ...size };
  const trades = tradesBetween(from, to);
  const hundreds = trades.some(
    (x) => x.kind === 'hundreds' || (x.kind === 'tens' && x.dir === 'up'),
  );
  const tens = trades.some((x) => x.kind === 'ones' || (x.kind === 'tens' && x.dir === 'down'));
  return { regroups: trades.length, acrossPlaces: hundreds && tens ? 1 : 0, ...size };
}

const picture = (h: Hto): StimulusSpec => ({ kind: 'base-ten', ...h });

export const pvRegroup: GeneratorDef = {
  id: 'pv.regroup',
  formats: ['base-ten-trade', 'base-ten-build', 'number-pad', 'make-set'],
  params: {
    n: { type: 'int', default: { kind: 'int', min: 11, max: 39 }, doc: 'the number (10–999)' },
    from: {
      type: 'string',
      values: [...DECOMPOSITIONS],
      default: { kind: 'const', value: 'ones' },
      doc: 'how n is shown first: canonical (3 tens 4 ones), regrouped (2 tens 14 ones), ones (34 ones, n ≤ 99) or tens (one hundred as ten tens: 253 as 1 hundred 15 tens 3 ones)',
    },
    to: {
      type: 'string',
      values: [...DECOMPOSITIONS],
      default: { kind: 'const', value: 'canonical' },
      doc: 'how n must be shown after trading (base-ten-trade, base-ten-build); number-pad and make-set end canonical',
    },
    places: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: '2: tens and ones; 3: hundreds, tens and ones (n has at most this many digits)',
    },
    sprite: {
      type: 'string',
      default: { kind: 'choice', values: [...DEFAULT_SPRITES] },
      doc: 'make-set: art-kit object sprite id',
    },
  },
  features: {
    regroups: {
      weight: 0.6,
      doc: 'single trades between the two decompositions (number-pad, make-set: to canonical)',
    },
    acrossPlaces: { weight: 0.6, doc: 'trades at both the hundreds and the tens' },
    'hundreds.over5': {
      weight: 0.4,
      doc: 'max(0, hundreds − 5) / 4 (hundreds past five are counted)',
    },
    'tens.over5': {
      weight: 0.4,
      doc: 'max(0, tens − 5) / 4 (tens past five are counted)',
    },
    'ones.over5': {
      weight: 0.4,
      doc: 'max(0, ones − 5) / 4 (ones past five are counted)',
    },
  },
  narration: [
    'gen.pv.regroup.look',
    'gen.pv.regroup.split-ten',
    'gen.pv.regroup.split-hundred',
    'gen.pv.regroup.make-ten',
    'gen.pv.regroup.make-hundred',
    'gen.pv.regroup.count-ones',
    'gen.pv.regroup.tens-first',
    'gen.pv.regroup.now',
    'gen.pv.regroup.now-hundreds',
    'gen.pv.regroup.is',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const n = asNum(p.n);
    const places = asNum(p.places, 2);
    if (places !== 2 && places !== 3) return false;
    if (digitCount(n) > places) return false;
    const { from, to } = endsOf(p, t.format);
    if (!from || !to) return false;
    switch (t.format) {
      case 'base-ten-trade':
        return !sameHto(from, to);
      case 'base-ten-build':
        // Bundling only (PR #83 review round 3): every trade fuses ten into one. The kind the
        // trades use up (always the lowest traded kind) is then the one the tray leaves open,
        // and limits.tight still sees the trade. Unbundling is taught on base-ten-trade.
        return !sameHto(from, to) && tradesBetween(from, to).every((x) => x.dir === 'up');
      case 'make-set':
        return asStr(p.from) === 'ones' && n >= 10 && n <= 39;
      case 'number-pad':
        // Ten-frames show a full ten and the ones: a canonical teen (or 20).
        return t.representation !== 'ten-frame' || (n <= 20 && asStr(p.from) === 'canonical');
      default:
        return true;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const n = asNum(params.n);
    const { from, to } = endsOf(params, t.format);
    if (!from || !to) throw new RangeError(`pv.regroup: ${n} cannot be shown that way`);
    const math = regroupFeatures(params, t.format);
    const vars = pickVars(t, {
      n,
      fromHundreds: from.hundreds,
      fromTens: from.tens,
      fromOnes: from.ones,
      toHundreds: to.hundreds,
      toTens: to.tens,
      toOnes: to.ones,
    });
    let p: PartialOutput;
    switch (t.format) {
      case 'base-ten-trade':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'base-ten-trade',
            start: from,
            goal: 'regroup-to',
            regroupTarget: to,
            showAlgorithm: false,
            thenAsk: false,
          },
          answer: { kind: 'state', checker: 'trade.result', target: { regroupTarget: to } },
        };
        break;
      case 'base-ten-build': {
        const withHundreds = asNum(params.places, 2) === 3 || n >= 100;
        const exact = {
          ...(withHundreds ? { hundreds: to.hundreds } : {}),
          tens: to.tens,
          ones: to.ones,
        };
        const limits = tradeLimits(from, to, withHundreds);
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'base-ten-build',
            target: n,
            mode: 'build-exact',
            pieces: { thousands: false, hundreds: withHundreds, tens: true, ones: true },
            limits,
            exact,
            wholeIs: 'unit',
            prebuilt: { ...from },
          },
          answer: { kind: 'state', checker: 'baseten.exact', target: { value: n, exact } },
        };
        break;
      }
      case 'number-pad': {
        const stimulus: StimulusSpec = BASE_TEN_REPS.has(t.representation ?? '')
          ? picture(from)
          : t.representation === 'ten-frame'
            ? { kind: 'ten-frame', frames: 2, filled: [10, n - 10] }
            : { kind: 'none' };
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus,
            blanks: [{ id: 'x', maxDigits: digitCount(n) + 1 }],
            unit: null,
          },
          answer: { kind: 'number', value: n },
          ...(stimulus.kind === 'none' ? { overlay: picture(from) } : {}),
        };
        break;
      }
      case 'make-set':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'make-set',
            target: n,
            mode: 'make',
            start: n,
            source: { sprite: asStr(params.sprite, 'shell'), supply: 0 },
            container: 'boat',
            capacity: Math.max(10, Math.ceil(n / 10) * 10),
            showRunningCount: false,
            groupsOf: 10,
          },
          answer: { kind: 'state', checker: 'set.count', target: { count: n, groupsOf: 10 } },
          nudge: [{ op: 'count-aloud' }],
        };
        break;
      default:
        throw new Error(`pv.regroup cannot build ${t.format}`);
    }
    return finish(pvRegroup, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const n = asNum(out.params.n);
    const { to } = endsOf(out.params, out.widget.format);
    if (!to) throw new Error('pv.regroup: no example');
    switch (out.widget.format) {
      case 'base-ten-trade':
        return { kind: 'state', value: { ...to } };
      case 'base-ten-build':
        return { kind: 'state', value: { thousands: 0, ...to } };
      case 'make-set':
        return { kind: 'state', value: { count: n, removed: 0, bundles: Math.floor(n / 10) } };
      default:
        throw new Error(`pv.regroup: no example for ${out.widget.format}`);
    }
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const n = asNum(out.params.n);
    const { from, to } = endsOf(out.params, w.format);
    if (!from || !to) return [];
    const now = (action: LessonStep['action']): LessonStep =>
      to.hundreds > 0
        ? say(
            'gen.pv.regroup.now-hundreds',
            { hundreds: to.hundreds, tens: to.tens, ones: to.ones },
            action,
          )
        : say('gen.pv.regroup.now', { tens: to.tens, ones: to.ones }, action);
    const trades = tradesBetween(from, to);
    const lineOf = (x: (typeof trades)[number]): string =>
      x.dir === 'down'
        ? x.kind === 'hundreds'
          ? 'gen.pv.regroup.split-hundred'
          : 'gen.pv.regroup.split-ten'
        : x.kind === 'tens'
          ? 'gen.pv.regroup.make-hundred'
          : 'gen.pv.regroup.make-ten';
    const smaller = { hundreds: 'tens', tens: 'ones', ones: 'ones' } as const;
    const larger = { hundreds: 'hundreds', tens: 'hundreds', ones: 'tens' } as const;
    switch (w.format) {
      case 'base-ten-trade': {
        const steps = trades.map((x) =>
          say(
            lineOf(x),
            {},
            {
              op: 'trade',
              args:
                x.dir === 'down'
                  ? { from: x.kind, to: smaller[x.kind] }
                  : { from: x.kind, to: larger[x.kind] },
            },
          ),
        );
        // The last trade names the counts it leaves.
        const last = steps.pop() as LessonStep;
        return [say('gen.pv.regroup.look', {}), ...steps, now(last.action)];
      }
      case 'base-ten-build':
        return [
          ...trades.map((x) =>
            say(lineOf(x), {}, { op: x.dir === 'down' ? 'split' : 'fuse', args: { kind: x.kind } }),
          ),
          now({ op: 'count-by', args: { kind: 'ones' } }),
        ];
      case 'number-pad':
        return [
          say(
            'gen.pv.regroup.tens-first',
            {},
            w.stimulus.kind === 'none'
              ? { op: 'highlight', args: { token: 'x' } }
              : { op: 'show-stimulus' },
          ),
          say('gen.pv.regroup.is', { v: n }, { op: 'type', args: { blank: 'x', value: n } }),
        ];
      case 'make-set':
        return [say('gen.pv.regroup.count-ones', {}, { op: 'count-aloud' }), now({ op: 'bundle' })];
      default:
        return [];
    }
  },
};
