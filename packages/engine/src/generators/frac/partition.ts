// frac.partition (03 §5.6): cut a whole into `den` equal parts, or judge whether parts are equal.
// Formats (K01): fraction-cut, fraction-pick, fraction-line. `mode`:
// - `cut` (fraction-cut, FRA.01, FRA.02, FRA.07): cut the `shape` into `den` equal parts and
//   shade `num` of them (0: no shading; `den`: the whole, FRA.02). Answer `fraction.cut`.
//   With `acceptNonCongruent` (FRA.16, K02) the whole is a `grid` of `cols` × `rows` squares cut
//   freely along its lines, and equal parts of different shapes count. Only the grids
//   NONCONGRUENT_DEMOS lists are drawn (fourths of 4 × 4 or 8 × 2, thirds of 6 × 2): the worked
//   solution cuts each into squares and bars of the same size, so equal shares look different.
// - `fair-or-not` (fraction-pick, FRA.07): one shape cut into `den` parts, equal when
//   `equalParts`; the child answers `yes` | `no`.
// - `pick` (fraction-pick pick-picture, FRA.01): three pictures of the same shape (halves, fourths,
//   and `unequalParts` parts that are not equal). `ask` names the one to find: `name` asks for the
//   equal `den` parts ("cut into fourths"), `unequal` for the one whose parts are not the same size.
//   The set depends on `shape` and `unequalParts` only, never on the key (PR #84 review: the unequal
//   picture used to have `den` parts), each picture is the answer of some item, and the features
//   are the set's (denominator 2: fourths are always shown). `thirds` (FRA.02) adds a picture of
//   thirds to the set (four pictures), lets `den` be 3, and lets the unequal picture have 3 parts.
// - `partition` (fraction-line partition on a strip, FRA.01): mark the strip into `den` equal
//   parts. Answer `fraction.partition`.

import type { LessonStep, ResponseValue, StimulusSpec } from '@number-island/shared';
import { partitionPoints } from '../../check/state/fraction.partition';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const SHAPES = ['circle', 'rect', 'square', 'bar', 'grid'] as const;

type FreeCut = { dir: 'v' | 'h'; at: number; part?: number };
/**
 * The grids a FRA.16 cut draws (`den`, `cols`, `rows`), each with the free cuts of its worked
 * solution: one full cut, then each side cut a different way, so the parts are squares and bars
 * of one size. Parts are numbered in reading order, so the part cut first keeps its number.
 */
export const NONCONGRUENT_DEMOS: readonly {
  den: number;
  cols: number;
  rows: number;
  cuts: FreeCut[];
}[] = [
  // 4 × 4 in fourths: two 4 × 1 bars below, two 2 × 2 squares above.
  {
    den: 4,
    cols: 4,
    rows: 4,
    cuts: [
      { dir: 'h', at: 0.5 },
      { dir: 'h', at: 0.75, part: 1 },
      { dir: 'v', at: 0.5, part: 0 },
    ],
  },
  // 8 × 2 in fourths: two 2 × 2 squares on the left, two 4 × 1 bars on the right.
  {
    den: 4,
    cols: 8,
    rows: 2,
    cuts: [
      { dir: 'v', at: 0.5 },
      { dir: 'h', at: 0.5, part: 1 },
      { dir: 'v', at: 0.25, part: 0 },
    ],
  },
  // 6 × 2 in thirds: a 2 × 2 square, then two 4 × 1 bars.
  {
    den: 3,
    cols: 6,
    rows: 2,
    cuts: [
      { dir: 'v', at: 1 / 3 },
      { dir: 'h', at: 0.5, part: 1 },
    ],
  },
];

const demoOf = (den: number, cols: number, rows: number) =>
  NONCONGRUENT_DEMOS.find((d) => d.den === den && d.cols === cols && d.rows === rows);
const MODES = ['cut', 'fair-or-not', 'pick', 'partition'] as const;
const ASKS = ['name', 'unequal'] as const;
/** The fraction stimulus has no square; pictures of a square are drawn as a rectangle. */
type PictureShape = 'circle' | 'rect' | 'bar';

/** The word a pick item asks for (word clips: halves, fourths, unequal-parts). */
export function pickWord(ask: string, den: number): string {
  if (ask === 'unequal') return 'unequal-parts';
  return den === 2 ? 'halves' : den === 3 ? 'thirds' : 'fourths';
}

/** Guided cut lines a shape needs for `den` equal parts (solution steps cut each once). */
export function cutLines(shape: string, den: number): number {
  if (shape === 'circle') return den % 2 === 0 ? den / 2 : den;
  if ((shape === 'rect' || shape === 'square') && den === 4) return 2;
  return den - 1;
}

export function fractionPicture(
  shape: PictureShape,
  parts: number,
  shaded: number,
  equalParts: boolean,
): StimulusSpec {
  return { kind: 'fraction', shape, parts, shaded, equalParts };
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const fracPartition: GeneratorDef = {
  id: 'frac.partition',
  formats: ['fraction-cut', 'fraction-pick', 'fraction-line'],
  params: {
    shape: {
      type: 'string',
      values: [...SHAPES],
      default: { kind: 'choice', values: ['circle', 'rect', 'square', 'bar'] },
      doc: 'circle, rect, square, bar (a strip) or grid (cut with acceptNonCongruent only); pictures (pick, fair-or-not) use circle, rect or bar',
    },
    cols: {
      type: 'int',
      default: { kind: 'const', value: 4 },
      doc: 'grid: squares across (a NONCONGRUENT_DEMOS grid)',
    },
    rows: {
      type: 'int',
      default: { kind: 'const', value: 4 },
      doc: 'grid: squares down (a NONCONGRUENT_DEMOS grid)',
    },
    den: { type: 'int', default: { kind: 'int', min: 2, max: 4 }, doc: 'number of equal parts' },
    num: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'cut: parts to shade (0: none)',
    },
    mode: {
      type: 'string',
      values: [...MODES],
      // Templates always set it; the default lets every format build from defaults.
      default: { kind: 'choice', values: [...MODES] },
      doc: 'cut (fraction-cut), fair-or-not or pick (fraction-pick), partition (fraction-line)',
    },
    equalParts: {
      type: 'bool',
      default: { kind: 'const', value: true },
      doc: 'fair-or-not: the parts are equal',
    },
    ask: {
      type: 'string',
      values: [...ASKS],
      default: { kind: 'const', value: 'name' },
      doc: 'pick: name (find the equal den parts) or unequal (find the parts that are not equal)',
    },
    unequalParts: {
      type: 'int',
      default: { kind: 'choice', values: [2, 4] },
      doc: 'pick: parts of the picture whose parts are not equal (2 or 4; 3 too with thirds), independent of den and ask',
    },
    thirds: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'pick (FRA.02): the set also shows thirds, and den may be 3',
    },
    acceptNonCongruent: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'cut: equal areas of different shapes count (FRA.14, FRA.16)',
    },
  },
  features: {
    denominator: {
      weight: 0.2,
      doc: 'den − 2 (the fraction-pick and fraction-line feature, 03 §5.5)',
    },
    'shape.circle': { weight: 0.3, doc: 'a circle (the fraction-cut feature, 03 §5.5)' },
    'parts.hard': {
      weight: 0.4,
      doc: 'cut: parts odd or more than 4 (the fraction-cut feature, 03 §5.5)',
    },
    nonUnit: { weight: 0.3, doc: 'more than one part shaded' },
    'ask.unequal': { weight: 0.2, doc: 'pick: find the picture whose parts are not equal' },
  },
  narration: [
    'gen.frac.partition.cut-middle',
    'gen.frac.partition.cut-again',
    'gen.frac.partition.cut-half',
    'gen.frac.partition.cut-other',
    'gen.frac.partition.cut-same',
    'gen.frac.partition.shade',
    'gen.frac.partition.look-parts',
    'gen.frac.partition.same-size',
    'gen.frac.partition.not-same',
    'gen.frac.partition.look-options',
    'gen.frac.partition.this-one',
    'gen.frac.partition.find-middle',
    'gen.frac.partition.middle-each',
    'gen.frac.partition.mark-parts',
    'gen.frac.partition.grid-first',
    'gen.frac.partition.grid-other-way',
    'gen.frac.partition.grid-same-size',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const den = asNum(p.den);
    const num = asNum(p.num);
    const mode = asStr(p.mode);
    const shape = asStr(p.shape);
    // A cut may shade every part (FRA.02: four fourths make the whole); nothing else shades all.
    if (den < 2 || den > 8 || num < 0 || num > den || (num === den && mode !== 'cut')) return false;
    if (p.acceptNonCongruent === true && mode !== 'cut') return false;
    // A grid is the FRA.16 cut, and FRA.16's cut is a grid that has a worked solution.
    if ((shape === 'grid') !== (p.acceptNonCongruent === true)) return false;
    if (shape === 'grid' && !demoOf(den, asNum(p.cols), asNum(p.rows))) return false;
    switch (t.format) {
      case 'fraction-cut':
        return mode === 'cut';
      case 'fraction-pick':
        if (shape === 'square') return false;
        if (mode === 'pick') {
          const u = asNum(p.unequalParts, 2);
          const thirds = p.thirds === true;
          const dens = thirds ? [2, 3, 4] : [2, 4];
          const us = thirds ? [2, 3, 4] : [2, 4];
          return dens.includes(den) && num === 1 && us.includes(u);
        }
        return mode === 'fair-or-not' && den <= 4;
      case 'fraction-line':
        return mode === 'partition' && shape === 'bar';
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const den = asNum(params.den);
    const num = asNum(params.num);
    const mode = asStr(params.mode);
    const shape = asStr(params.shape, 'circle');
    const ask = asStr(params.ask, 'name');
    const picShape: PictureShape = shape === 'square' ? 'rect' : (shape as PictureShape);
    const math: Record<string, number> = {
      denominator: den - 2,
      'shape.circle': shape === 'circle' ? 1 : 0,
      nonUnit: num > 1 ? 1 : 0,
    };
    const vars = pickVars(t, { den, what: pickWord(ask, den) });
    let p: PartialOutput;
    if (t.format === 'fraction-cut') {
      math['parts.hard'] = den % 2 === 1 || den > 4 ? 1 : 0;
      const acceptNonCongruent = params.acceptNonCongruent === true;
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'fraction-cut',
          shape: shape as (typeof SHAPES)[number],
          ...(shape === 'grid'
            ? { gridSize: [asNum(params.cols), asNum(params.rows)] as [number, number] }
            : {}),
          parts: den,
          ...(num > 0 ? { shade: num } : {}),
          cutMode: shape === 'grid' ? 'free' : 'guided',
          acceptNonCongruent,
          thenName: false,
        },
        answer: {
          kind: 'state',
          checker: 'fraction.cut',
          target: { parts: den, shade: num, acceptNonCongruent },
        },
      };
    } else if (t.format === 'fraction-pick' && mode === 'fair-or-not') {
      const equal = params.equalParts === true;
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'fraction-pick',
          mode: 'fair-or-not',
          stimulus: fractionPicture(picShape, den, 0, equal),
        },
        answer: { kind: 'choice', id: equal ? 'yes' : 'no' },
      };
    } else if (t.format === 'fraction-pick') {
      math['ask.unequal'] = ask === 'unequal' ? 1 : 0;
      // The option set's feature, the same whichever picture is the key: fourths always show.
      math.denominator = 2;
      // The set is built before the key: halves, fourths, and unequal parts whose count is its own
      // param. When it matches the asked word (two unequal parts for halves), it is the picture a
      // child who ignores equal sizes would take (MC.fraction-unequal-parts).
      const kinds = [
        { kind: 'halves', stimulus: fractionPicture(picShape, 2, 0, true) },
        ...(params.thirds === true
          ? [{ kind: 'thirds', stimulus: fractionPicture(picShape, 3, 0, true) }]
          : []),
        { kind: 'fourths', stimulus: fractionPicture(picShape, 4, 0, true) },
        {
          kind: 'unequal',
          stimulus: fractionPicture(picShape, asNum(params.unequalParts, 2), 0, false),
        },
      ];
      const shown = rng.fork('layout').shuffle(kinds);
      const want = pickWord(ask, den).replace('unequal-parts', 'unequal');
      const index = shown.findIndex((k) => k.kind === want);
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'fraction-pick',
          mode: 'pick-picture',
          options: shown.map((k, i) => ({ id: `pic-${i}`, stimulus: k.stimulus })),
        },
        answer: { kind: 'choice', id: `pic-${index}` },
      };
    } else if (t.format === 'fraction-line') {
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'fraction-line',
          max: 1,
          denominator: den,
          ticksShown: false,
          labels: 'ends',
          mode: 'partition',
          skin: 'strip',
          decimalLabels: false,
        },
        answer: {
          kind: 'state',
          checker: 'fraction.partition',
          target: { denominator: den, max: 1 },
        },
      };
    } else {
      throw new Error(`frac.partition cannot build ${t.format}`);
    }
    return finish(fracPartition, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    if (a.checker === 'fraction.partition') {
      const den = Number(a.target.denominator);
      return { kind: 'state', value: { cuts: partitionPoints(den, 1) } };
    }
    const parts = Number(a.target.parts);
    const shade = Number(a.target.shade ?? 0);
    return {
      kind: 'state',
      value: {
        regions: new Array<number>(parts).fill(1 / parts),
        shaded: Array.from({ length: shade }, (_, i) => i),
      },
    };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const den = asNum(out.params.den);
    if (w.format === 'fraction-cut') {
      const lines = cutLines(w.shape, den);
      let steps: LessonStep[];
      const demo = w.gridSize ? demoOf(den, w.gridSize[0], w.gridSize[1]) : undefined;
      if (demo && w.gridSize) {
        const cells = (w.gridSize[0] * w.gridSize[1]) / den;
        steps = demo.cuts.map((c, i) =>
          say(
            i === 0 ? 'gen.frac.partition.grid-first' : 'gen.frac.partition.grid-other-way',
            {},
            { op: 'cut', args: { ...c } },
          ),
        );
        steps.push(say('gen.frac.partition.grid-same-size', { n: cells }));
      } else if (w.shape === 'bar' && den === 4) {
        // A strip's lines run left to right, so line 1 is the middle: halve it first, then each
        // half, as the cut-middle hint says (PR #84 review round 2: the cuts went 0, 1, 2).
        steps = [
          say('gen.frac.partition.cut-middle', {}, { op: 'cut', args: { line: 1 } }),
          say('gen.frac.partition.cut-half', {}, { op: 'cut', args: { line: 0 } }),
          say('gen.frac.partition.cut-other', {}, { op: 'cut', args: { line: 2 } }),
        ];
      } else {
        const halving = den === 2 || den === 4;
        steps = Array.from({ length: lines }, (_, i) =>
          say(
            halving
              ? i === 0
                ? 'gen.frac.partition.cut-middle'
                : 'gen.frac.partition.cut-again'
              : 'gen.frac.partition.cut-same',
            {},
            { op: 'cut', args: { line: i } },
          ),
        );
      }
      for (let i = 0; i < (w.shade ?? 0); i += 1) {
        steps.push(say('gen.frac.partition.shade', {}, { op: 'shade', args: { part: i } }));
      }
      return steps;
    }
    if (w.format === 'fraction-line') {
      // Thirds have no middle mark: only halves and fourths start from the middle.
      const steps: LessonStep[] = den % 2 === 0 ? [say('gen.frac.partition.find-middle', {})] : [];
      if (den === 4) steps.push(say('gen.frac.partition.middle-each', {}));
      steps.push(say('gen.frac.partition.mark-parts', {}, { op: 'partition', args: { b: den } }));
      return steps;
    }
    if (w.format === 'fraction-pick') {
      const a = out.answer;
      const id = a.kind === 'choice' ? a.id : 'yes';
      if (w.mode === 'fair-or-not') {
        return [
          say('gen.frac.partition.look-parts', {}, { op: 'count-parts' }),
          say(
            id === 'yes' ? 'gen.frac.partition.same-size' : 'gen.frac.partition.not-same',
            {},
            { op: 'answer', args: { id } },
          ),
        ];
      }
      return [
        say('gen.frac.partition.look-options', {}),
        say('gen.frac.partition.this-one', {}, { op: 'answer', args: { id } }),
      ];
    }
    return [];
  },
};
