// frac.shares (03 §5.6): equal shares of one whole that do not look the same (FRA.16, K02 slice
// 4c-2). A grid of squares cut along its lines into rectangles, drawn as a `grid-parts` picture.
// - number-pad: one of SHARE_CUTS, equal parts of different shapes; the child types
//   how many squares are in each part.
// - fraction-pick `fair-or-not`: one of SHARE_CUTS (`equalParts`, answer yes) or of UNEQUAL_CUTS
//   (answer no; the parts differ by at least one whole square).
// `cut` picks the cut (0 to 7) and `mirror` flips it left to right. Every part is a rectangle of at
// least 2 squares, so the picture's spoken name ("a bar 4 squares long") tells all of it.
// - fraction-pick `name` (K02 slice 5c, FRA.14, with `name`): one of SHARE_CUTS; what fraction of
//   the whole is each part? Typed on the pads; any name of that amount is right (1/4, 2/8, 4/16:
//   `fraction.equivalentOk`, a·d = b·c), since each true name is a true answer.
// The fraction-cut item of FRA.16 is frac.partition's grid cut; this generator draws pictures.

import type { GridPartsSpec, LessonStep, ResponseValue } from '@number-island/shared';
import {
  asNum,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

/** A part: a rectangle `w` × `h` squares at column `c`, row `r`. */
type Rect = [c: number, r: number, w: number, h: number];
interface Cut {
  cols: number;
  rows: number;
  rects: Rect[];
}

/** Equal parts that look different (squares and bars of the same number of squares). */
export const SHARE_CUTS: readonly Cut[] = [
  // 4 × 4 in fourths: two 2 × 2 squares above two bars of 4.
  {
    cols: 4,
    rows: 4,
    rects: [
      [0, 0, 2, 2],
      [2, 0, 2, 2],
      [0, 2, 4, 1],
      [0, 3, 4, 1],
    ],
  },
  // 4 × 4 in fourths: two bars of 4 above two squares.
  {
    cols: 4,
    rows: 4,
    rects: [
      [0, 0, 4, 1],
      [0, 1, 4, 1],
      [0, 2, 2, 2],
      [2, 2, 2, 2],
    ],
  },
  // 4 × 4 in fourths: two upright bars of 4 beside two squares.
  {
    cols: 4,
    rows: 4,
    rects: [
      [0, 0, 1, 4],
      [1, 0, 1, 4],
      [2, 0, 2, 2],
      [2, 2, 2, 2],
    ],
  },
  // 8 × 2 in fourths: two squares, then two bars of 4.
  {
    cols: 8,
    rows: 2,
    rects: [
      [0, 0, 2, 2],
      [2, 0, 2, 2],
      [4, 0, 4, 1],
      [4, 1, 4, 1],
    ],
  },
  // 6 × 2 in thirds: a square, then two bars of 4.
  {
    cols: 6,
    rows: 2,
    rects: [
      [0, 0, 2, 2],
      [2, 0, 4, 1],
      [2, 1, 4, 1],
    ],
  },
  // 6 × 4 in fourths (6 squares each): two bars of 6 above two 3 × 2 rectangles.
  {
    cols: 6,
    rows: 4,
    rects: [
      [0, 0, 6, 1],
      [0, 1, 6, 1],
      [0, 2, 3, 2],
      [3, 2, 3, 2],
    ],
  },
  // 6 × 4 in fourths: two 3 × 2 rectangles above two bars of 6.
  {
    cols: 6,
    rows: 4,
    rects: [
      [0, 0, 3, 2],
      [3, 0, 3, 2],
      [0, 2, 6, 1],
      [0, 3, 6, 1],
    ],
  },
  // 8 × 4 in fourths (8 squares each): two bars of 8 above two 4 × 2 rectangles.
  {
    cols: 8,
    rows: 4,
    rects: [
      [0, 0, 8, 1],
      [0, 1, 8, 1],
      [0, 2, 4, 2],
      [4, 2, 4, 2],
    ],
  },
];

/** Parts that are not equal: on the same grids, sizes that differ by at least one square. */
export const UNEQUAL_CUTS: readonly Cut[] = [
  {
    cols: 4,
    rows: 4,
    rects: [
      [0, 0, 3, 2],
      [3, 0, 1, 2],
      [0, 2, 4, 1],
      [0, 3, 4, 1],
    ],
  },
  {
    cols: 4,
    rows: 4,
    rects: [
      [0, 0, 1, 4],
      [1, 0, 1, 4],
      [2, 0, 2, 1],
      [2, 1, 2, 3],
    ],
  },
  {
    cols: 4,
    rows: 4,
    rects: [
      [0, 0, 4, 1],
      [0, 1, 4, 1],
      [0, 2, 3, 2],
      [3, 2, 1, 2],
    ],
  },
  {
    cols: 8,
    rows: 2,
    rects: [
      [0, 0, 2, 2],
      [2, 0, 3, 2],
      [5, 0, 3, 1],
      [5, 1, 3, 1],
    ],
  },
  {
    cols: 6,
    rows: 2,
    rects: [
      [0, 0, 3, 2],
      [3, 0, 3, 1],
      [3, 1, 3, 1],
    ],
  },
  {
    cols: 6,
    rows: 4,
    rects: [
      [0, 0, 6, 1],
      [0, 1, 6, 1],
      [0, 2, 2, 2],
      [2, 2, 4, 2],
    ],
  },
  {
    cols: 6,
    rows: 4,
    rects: [
      [0, 0, 4, 2],
      [4, 0, 2, 2],
      [0, 2, 6, 1],
      [0, 3, 6, 1],
    ],
  },
  {
    cols: 8,
    rows: 4,
    rects: [
      [0, 0, 8, 1],
      [0, 1, 8, 1],
      [0, 2, 3, 2],
      [3, 2, 5, 2],
    ],
  },
];

/** The squares of each part, in the picture's order. */
export const partSizes = (g: GridPartsSpec): number[] => g.parts.map((p) => p.length);

/** The grid-parts picture of a cut, mirrored left to right when asked; parts in reading order. */
export function sharePicture(cut: Cut, mirror: boolean): GridPartsSpec {
  const rects = cut.rects
    .map(([c, r, w, h]): Rect => [mirror ? cut.cols - c - w : c, r, w, h])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return {
    kind: 'grid-parts',
    cols: cut.cols,
    rows: cut.rows,
    parts: rects.map(([c, r, w, h]) =>
      Array.from({ length: w * h }, (_, k) => (r + Math.floor(k / w)) * cut.cols + c + (k % w)),
    ),
  };
}

const cutOf = (p: Record<string, unknown>): Cut | undefined =>
  (p.equalParts === false ? UNEQUAL_CUTS : SHARE_CUTS)[asNum(p.cut as number)];

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const fracShares: GeneratorDef = {
  id: 'frac.shares',
  formats: ['number-pad', 'fraction-pick'],
  params: {
    cut: { type: 'int', default: { kind: 'int', min: 0, max: 7 }, doc: 'which cut (0–7)' },
    mirror: {
      type: 'bool',
      default: { kind: 'choice', values: [true, false] },
      doc: 'flip the cut left to right',
    },
    equalParts: {
      type: 'bool',
      default: { kind: 'const', value: true },
      doc: 'equal parts of different shapes (true), or parts that are not equal (fraction-pick only)',
    },
    name: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'fraction-pick: name the fraction each equal part is of the whole (FRA.14)',
    },
  },
  features: {
    'share.over4': { weight: 0.4, doc: 'count: more than 4 squares in each part' },
    'parts.three': { weight: 0.2, doc: 'the whole is cut into 3 parts' },
    lookDifferent: {
      weight: 0.5,
      doc: 'fair-or-not: the parts are equal but look different (the yes the skill teaches)',
    },
  },
  narration: [
    'gen.frac.shares.count-part',
    'gen.frac.shares.each-same',
    'gen.frac.shares.sizes',
    'gen.frac.shares.not-equal',
    'gen.frac.shares.no',
    'gen.frac.shares.name-count',
    'gen.frac.shares.name-each',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    if (!cutOf(p)) return false;
    if (p.name === true) return t.format === 'fraction-pick' && p.equalParts !== false;
    // The count item asks the squares in each of equal parts; fraction-pick judges either kind.
    return t.format === 'fraction-pick' || p.equalParts !== false;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const cut = cutOf(params) as NonNullable<ReturnType<typeof cutOf>>;
    const picture = sharePicture(cut, params.mirror === true);
    const sizes = partSizes(picture);
    const equal = sizes.every((s) => s === sizes[0]);
    const share = sizes[0] as number;
    const vars = pickVars(t, { parts: sizes.length });
    const math: Record<string, number> = {
      'share.over4': t.format === 'number-pad' && share > 4 ? 1 : 0,
      'parts.three': sizes.length === 3 ? 1 : 0,
      lookDifferent: t.format === 'fraction-pick' && equal ? 1 : 0,
    };
    let p: PartialOutput;
    if (params.name === true) {
      p = {
        params,
        vars,
        math: { ...math, lookDifferent: 0 },
        widget: { format: 'fraction-pick', mode: 'name', nameInput: 'pads', stimulus: picture },
        answer: {
          kind: 'numbers',
          values: [1, sizes.length],
          ordered: true,
          fraction: { equivalentOk: true },
        },
      };
    } else if (t.format === 'number-pad') {
      p = {
        params,
        vars,
        math,
        widget: { format: 'number-pad', stimulus: picture, blanks: [{ id: 'x', maxDigits: 2 }] },
        answer: { kind: 'number', value: share },
      };
    } else {
      p = {
        params,
        vars,
        math,
        widget: { format: 'fraction-pick', mode: 'fair-or-not', stimulus: picture },
        answer: { kind: 'choice', id: equal ? 'yes' : 'no' },
      };
    }
    return finish(fracShares, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    return correctFromAnswer(out.answer);
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const picture =
      (w.format === 'number-pad' || w.format === 'fraction-pick') &&
      w.stimulus?.kind === 'grid-parts'
        ? w.stimulus
        : null;
    if (!picture) return [];
    const sizes = partSizes(picture);
    const equal = sizes.every((s) => s === sizes[0]);
    const n = sizes[0] as number;
    const highlight = { op: 'highlight', args: { id: 'stimulus' } };
    if (w.format === 'fraction-pick' && w.mode === 'name') {
      // The first step names no asked number: the worked-step hint plays it.
      return [
        say('gen.frac.shares.name-count', {}, highlight),
        say(
          'gen.frac.shares.name-each',
          { f: `1/${sizes.length}` },
          { op: 'answer', args: { values: [1, sizes.length] } },
        ),
      ];
    }
    if (w.format === 'number-pad') {
      return [
        say('gen.frac.shares.count-part', { n }, { op: 'show-stimulus' }),
        say('gen.frac.shares.each-same', { n }, { op: 'type', args: { blank: 'x', value: n } }),
      ];
    }
    if (equal) {
      return [
        say('gen.frac.shares.each-same', { n }, highlight),
        say('gen.frac.shares.sizes', {}, { op: 'answer', args: { id: 'yes' } }),
      ];
    }
    const big = Math.max(...sizes);
    const small = Math.min(...sizes);
    return [
      say('gen.frac.shares.not-equal', { big, small }, highlight),
      say('gen.frac.shares.no', {}, { op: 'answer', args: { id: 'no' } }),
    ];
  },
};
