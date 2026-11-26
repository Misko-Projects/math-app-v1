import type { StimulusSpec } from '@number-island/shared';

/**
 * The bar model (03 §5.1 `bar-model`, #17 slice 4d): a tape diagram laid out in CSS px.
 *
 * - **Part–part–whole**: one bar of pieces with a brace under it, labelled with the whole.
 * - **Comparison** (`compare`): the bigger amount's bar over the smaller one's, which is closed by
 *   an "extra" piece (the difference, `parts[1]`), so the two bars end together.
 * - **Two steps** (`lower`): the first step's bar over the second's. `null` is the first step's
 *   result: a blank sand piece (or a bar's whole) that both rows share, drawn at the same place and
 *   width in both, with a strip between them, so the child sees the first step feed the second.
 *
 * Bars are ordered, not to scale (design A): each amount's width comes from a bucket of its ratio
 * to the biggest amount (BUCKETS), the unknown's too, so a bigger amount reads bigger but no
 * length can be measured off another to the unit. The unknown is "?" and never a number.
 */

export type BarSpec = Extract<StimulusSpec, { kind: 'bar-model' }>;
type BarValue = BarSpec['parts'][number];

/** A bar's height; its numerals are 32 px (06 §2). */
export const BAR_H = 56;
/** A brace: its bracket and its label. */
export const BRACE_H = 14;
export const BRACE_LABEL_H = 40;
/** Between the two bars of a comparison. */
export const ROW_GAP = 12;
/** Between the two bars of a two-step model: the strip that joins the shared piece. */
export const LINK_GAP = 28;
/** The narrowest piece ("?" or a one-digit number at 32 px, inside its border). */
export const MIN_PIECE = 44;
/** A blank piece (a two-step model's first result) needs no room for a label. */
const BLANK_PIECE = 36;

/** The least width of a piece with this label: about 19 px a digit at 32 px, and its border. */
export const pieceNeed = (label: string): number =>
  label === '' ? BLANK_PIECE : Math.max(MIN_PIECE, 19 * label.length + 20);
/** The step number left of each bar of a two-step model. */
export const BADGE_W = 44;
/** A piece's weight by its ratio to the biggest amount of the model. */
const BUCKETS: readonly [number, number][] = [
  [0.67, 1],
  [0.34, 0.7],
  [0, 0.5],
];

export const pieceWeight = (v: number, max: number): number => {
  const r = max > 0 ? v / max : 1;
  return (BUCKETS.find(([at]) => r >= at) as [number, number])[1];
};

export type PieceKind = 'known' | 'unknown' | 'first' | 'extra';

export interface BarPiece {
  x: number;
  y: number;
  w: number;
  /** "45", "?", or "" for the first step's result. */
  label: string;
  kind: PieceKind;
  /** Colour slot of a known piece (0–2), by its place in its bar. */
  tone: number;
}

export interface BarBrace {
  x: number;
  /** The bracket's top. */
  y: number;
  w: number;
  label: string;
  /** Above its bar (the label over the bracket) or below it. */
  side: 'above' | 'below';
}

export interface BarLayout {
  w: number;
  h: number;
  pieces: BarPiece[];
  braces: BarBrace[];
  /** Two steps: the strip joining the shared piece, and each bar's step number. */
  link: { x: number; y: number; w: number; h: number } | null;
  badges: { y: number; label: string }[];
  /** The least width the model is drawn at (its narrowest piece MIN_PIECE). */
  minWidth: number;
}

const labelOf = (v: BarValue): string => (v === null ? '' : v === '?' ? '?' : String(v));
const kindOf = (v: BarValue): PieceKind => (v === null ? 'first' : v === '?' ? 'unknown' : 'known');

/**
 * The amounts a bar stands for, its unknowns solved from what it tells (only to size the pieces;
 * never drawn). `first` is the first step's result, for a second bar's `null`. Unknowns that
 * cannot be told apart (put-together/both's two parts) share what is left equally.
 */
export function solveRow(
  parts: readonly BarValue[],
  whole: BarValue,
  first?: number,
): { parts: number[]; whole: number } {
  const val = (v: BarValue) => (typeof v === 'number' ? v : v === null ? first : undefined);
  const known = parts.map(val);
  const w = val(whole);
  const missing = known.filter((v) => v === undefined).length;
  const sumKnown = known.reduce<number>((a, v) => a + (v ?? 0), 0);
  if (w !== undefined) {
    const each = missing > 0 ? Math.max(0, w - sumKnown) / missing : 0;
    return { parts: known.map((v) => v ?? each), whole: w };
  }
  const filled = known.map((v) => v ?? (missing > 0 && sumKnown > 0 ? sumKnown / parts.length : 1));
  return { parts: filled, whole: filled.reduce((a, v) => a + v, 0) };
}

/** Widths in units for the amounts of one bar, by bucket against `max`. */
const unitWidths = (values: readonly number[], max: number) =>
  values.map((v) => pieceWeight(v, max));

interface RowUnits {
  values: BarValue[];
  xs: number[];
  ws: number[];
  whole: BarValue;
}

function rowUnits(
  values: readonly BarValue[],
  amounts: readonly number[],
  max: number,
  whole: BarValue,
): RowUnits {
  const ws = unitWidths(amounts, max);
  const xs: number[] = [];
  let x = 0;
  for (const w of ws) {
    xs.push(x);
    x += w;
  }
  return { values: [...values], xs, ws, whole };
}

const rowEnd = (r: RowUnits) => (r.xs.at(-1) ?? 0) + (r.ws.at(-1) ?? 0);

/** The model laid out to fit `maxWidth` (never narrower than its `minWidth`). */
export function layoutBarModel(spec: BarSpec, maxWidth: number): BarLayout {
  if (spec.compare) return layoutCompare(spec, maxWidth);
  if (spec.lower) return layoutTwoStep(spec, spec.lower, maxWidth);
  return layoutWhole(spec, maxWidth);
}

/**
 * The px per unit that fits `maxWidth`, never less than every piece's label needs (pieceNeed of
 * each width in units with its label).
 */
function fitScale(
  units: number,
  pieces: readonly { w: number; label: string }[],
  maxWidth: number,
) {
  const k0 = Math.max(...pieces.map((p) => pieceNeed(p.label) / p.w));
  const minWidth = Math.ceil(k0 * units);
  const w = Math.max(minWidth, Math.floor(maxWidth));
  return { k: w / units, w, minWidth };
}

function layoutWhole(spec: BarSpec, maxWidth: number): BarLayout {
  const solved = solveRow(spec.parts, spec.whole);
  const max = Math.max(...solved.parts);
  const row = rowUnits(spec.parts, solved.parts, max, spec.whole);
  const units = rowEnd(row);
  const { k, w, minWidth } = fitScale(
    units,
    row.values.map((v, i) => ({ w: row.ws[i] as number, label: labelOf(v) })),
    maxWidth,
  );
  const pieces = row.values.map((v, i) => ({
    x: (row.xs[i] as number) * k,
    y: 0,
    w: (row.ws[i] as number) * k,
    label: labelOf(v),
    kind: kindOf(v),
    tone: i % 3,
  }));
  return {
    w,
    h: BAR_H + BRACE_H + BRACE_LABEL_H,
    pieces,
    braces: [{ x: 0, y: BAR_H + 4, w, label: labelOf(spec.whole), side: 'below' }],
    link: null,
    badges: [],
    minWidth,
  };
}

function layoutCompare(spec: BarSpec, maxWidth: number): BarLayout {
  const c = spec.compare as NonNullable<BarSpec['compare']>;
  const extra = spec.parts[1] ?? '?';
  const known = (v: BarValue) => (typeof v === 'number' ? v : undefined);
  let big = known(c.bigger);
  let small = known(c.smaller);
  let gap = known(extra);
  if (big === undefined) big = (small ?? 0) + (gap ?? 0);
  if (small === undefined) small = big - (gap ?? 0);
  if (gap === undefined) gap = big - small;
  // The smaller bar and the extra piece share the lower row by their own buckets (the bigger of
  // the two wider, equal within 1.5x), so the row never draws a smaller amount wider (review #134).
  const ws = pieceWeight(small, Math.max(small, gap));
  const wg = pieceWeight(gap, Math.max(small, gap));
  const share = ws / (ws + wg);
  const minWidth = Math.ceil(
    Math.max(
      pieceNeed(labelOf(c.bigger)),
      pieceNeed(labelOf(c.smaller)) / share,
      pieceNeed(labelOf(extra)) / (1 - share),
    ),
  );
  const w = Math.max(minWidth, Math.floor(maxWidth));
  const smallW = Math.round(w * share);
  return {
    w,
    h: 2 * BAR_H + ROW_GAP,
    pieces: [
      { x: 0, y: 0, w, label: labelOf(c.bigger), kind: kindOf(c.bigger), tone: 0 },
      {
        x: 0,
        y: BAR_H + ROW_GAP,
        w: smallW,
        label: labelOf(c.smaller),
        kind: kindOf(c.smaller),
        tone: 1,
      },
      {
        x: smallW,
        y: BAR_H + ROW_GAP,
        w: w - smallW,
        label: labelOf(extra),
        kind: extra === '?' ? 'unknown' : 'extra',
        tone: 2,
      },
    ],
    braces: [],
    link: null,
    badges: [],
    minWidth,
  };
}

/** The x-span (in units) of a row's first-step result: its `null` piece, or the whole bar. */
function linkSpan(r: RowUnits): [number, number] | null {
  const i = r.values.indexOf(null);
  if (i >= 0) return [r.xs[i] as number, (r.xs[i] as number) + (r.ws[i] as number)];
  if (r.whole === null) return [0, rowEnd(r)];
  return null;
}

function layoutTwoStep(
  spec: BarSpec,
  lower: NonNullable<BarSpec['lower']>,
  maxWidth: number,
): BarLayout {
  const top = solveRow(spec.parts, spec.whole);
  const firstIdx = spec.parts.indexOf(null);
  const first = firstIdx >= 0 ? (top.parts[firstIdx] as number) : top.whole;
  const bottom = solveRow(lower.parts, lower.whole, first);
  const max = Math.max(...top.parts, ...bottom.parts);
  const r1 = rowUnits(spec.parts, top.parts, max, spec.whole);
  const r2 = rowUnits(lower.parts, bottom.parts, max, lower.whole);
  const s1 = linkSpan(r1) ?? [0, rowEnd(r1)];
  const s2 = linkSpan(r2) ?? [0, rowEnd(r2)];
  // The second bar is scaled and moved so its share of the first step's result sits exactly under
  // the first bar's.
  const scale = (s1[1] - s1[0]) / (s2[1] - s2[0]);
  const off = s1[0] - s2[0] * scale;
  const xs2 = r2.xs.map((x) => x * scale + off);
  const ws2 = r2.ws.map((w) => w * scale);
  const left = Math.min(0, ...xs2);
  const right = Math.max(rowEnd(r1), ...xs2.map((x, i) => x + (ws2[i] as number)));
  const units = right - left;
  const fit = fitScale(
    units,
    [
      ...r1.values.map((v, i) => ({ w: r1.ws[i] as number, label: labelOf(v) })),
      ...r2.values.map((v, i) => ({ w: ws2[i] as number, label: labelOf(v) })),
    ],
    maxWidth - BADGE_W,
  );
  const k = fit.k;
  const toPx = (u: number) => BADGE_W + (u - left) * k;
  const topBrace = spec.whole !== null;
  const bottomBrace = lower.whole !== null;
  const y1 = topBrace ? BRACE_LABEL_H + BRACE_H : 0;
  const y2 = y1 + BAR_H + LINK_GAP;
  const pieces: BarPiece[] = [
    ...r1.values.map((v, i) => ({
      x: toPx(r1.xs[i] as number),
      y: y1,
      w: (r1.ws[i] as number) * k,
      label: labelOf(v),
      kind: kindOf(v),
      tone: i % 3,
    })),
    ...r2.values.map((v, i) => ({
      x: toPx(xs2[i] as number),
      y: y2,
      w: (ws2[i] as number) * k,
      label: labelOf(v),
      kind: kindOf(v),
      tone: (i + 1) % 3,
    })),
  ];
  const braces: BarBrace[] = [];
  if (topBrace)
    braces.push({
      x: toPx(0),
      y: BRACE_LABEL_H,
      w: rowEnd(r1) * k,
      label: labelOf(spec.whole),
      side: 'above',
    });
  if (bottomBrace) {
    const x0 = Math.min(...xs2);
    braces.push({
      x: toPx(x0),
      y: y2 + BAR_H + 4,
      w: (Math.max(...xs2.map((x, i) => x + (ws2[i] as number))) - x0) * k,
      label: labelOf(lower.whole),
      side: 'below',
    });
  }
  return {
    w: fit.w + BADGE_W,
    h: y2 + BAR_H + (bottomBrace ? BRACE_H + BRACE_LABEL_H : 0),
    pieces,
    braces,
    link: { x: toPx(s1[0]), y: y1 + BAR_H, w: (s1[1] - s1[0]) * k, h: LINK_GAP },
    badges: [
      { y: y1, label: '1' },
      { y: y2, label: '2' },
    ],
    minWidth: fit.minWidth + BADGE_W,
  };
}

type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The model's accessible name: its structure and the amounts the story tells, with "?" for the
 * unknown and never an operation word (#17 slice 4d). The first step's result is "the amount from
 * bar 1".
 */
export function describeBarModel(spec: BarSpec, t: T): string {
  const word = (v: BarValue) => (v === null ? t('ui.widget.bar.from-first') : labelOf(v));
  const list = (vs: readonly BarValue[]) => vs.map(word).join(', ');
  if (spec.compare)
    return t('ui.widget.bar.compare', {
      bigger: word(spec.compare.bigger),
      smaller: word(spec.compare.smaller),
      extra: word(spec.parts[1] ?? '?'),
    });
  if (spec.lower)
    return [
      t('ui.widget.bar.two'),
      t('ui.widget.bar.row', { n: 1, parts: list(spec.parts), whole: word(spec.whole) }),
      t('ui.widget.bar.row', {
        n: 2,
        parts: list(spec.lower.parts),
        whole: word(spec.lower.whole),
      }),
    ].join(' ');
  return t('ui.widget.bar.whole', { parts: list(spec.parts), whole: word(spec.whole) });
}
