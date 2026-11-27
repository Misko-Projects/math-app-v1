import { formatModel } from '@number-island/engine';
import type { StimulusSpec, WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { CheckIcon, HandPointerIcon } from '../../primitives/icons';
import { MIN_TARGET_PX, TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo, wait } from '../demo';
import {
  CheckButton,
  cellToFit,
  countLayout,
  FitPicture,
  fittedLineNumeralPx,
  fractionWords,
  LINE_BARE_PAD,
  minObjectStep,
  NumberLineView,
  naturalPictureSize,
  numberLineScale,
  type ObjectLayout,
  ObjectSetView,
  ObjectSprite,
  objectSetLayout,
  PickCard,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSharedScale,
  useSubmitGuard,
  useWidgetRoom,
  type WidgetRoom,
  wrapLine,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './compare.css';

/**
 * `compare` (03 §5.5): two sides, each any `StimulusSpec` (objects, dots, ten-frames, numerals,
 * number lines…), framed side by side, and one question:
 *
 * - **more / fewer / longer / heavier**: tap the side (`left` | `right`) or "the same" (`same`);
 * - **same-or-not**: "the same" (=) or "not the same" (≠) (`same` | `not-same`);
 * - **symbol**: tap `<`, `=` or `>` (or drag it into the gap between the sides; keyboard works);
 *   the chosen symbol shows between the sides;
 * - **true-false**: yes (check) or no (cross) (`true` | `false`); a plain statement with no
 *   relation of its own reads "left = right"; a whole statement may sit on the left alone.
 *
 * With `allowMatchLines` on the concrete tier (objects on both sides) the two sets show as rows
 * and the child may pair objects: tap one in the top row, then one in the bottom row, and a line
 * joins them (trace `tap` `left-obj-<i>` / `right-obj-<i>`, then `move` `match-<l>-<r>`). Matches
 * are help, never the answer. "Check" sends `{ kind: 'choice', id }` through the format model.
 * Selection is an ink ring plus a check badge, never colour alone (06 §7).
 *
 * Layout (06 §1, container-relative): the widget measures its room (`useWidgetRoom`). Match rows
 * are used only when both rows fit at full target size with the answer controls; otherwise the
 * sides are drawn side by side (see `planLayout`). Side pictures are sized from the room; the
 * answer row goes below the sides, or in a column beside them when that gives bigger pictures.
 *
 * Demo ops (03 §5.5): `match {left, right}`, `highlight {side}`, `place-symbol {symbol}`, plus
 * `answer {id}`. An invite rings ONE enabled control and the guide's hand points at it (kit
 * `useInviteHand`), only while the child can act.
 */

const OPS = ['match', 'highlight', 'place-symbol', 'answer'] as const;
const FLY_MS = 520;

type Config = ConfigFor<'compare'>;
type Side = 'left' | 'right';
type Symbol = '<' | '=' | '>';
type Match = [number, number];

const SIDE_ASKS = new Set<Config['ask']>(['more', 'fewer', 'longer', 'heavier']);
const SYMBOLS: readonly Symbol[] = ['<', '=', '>'];
const SYMBOL_KEY: Record<Symbol, string> = {
  '<': 'ui.compare.less',
  '=': 'ui.compare.equal',
  '>': 'ui.compare.greater',
};

type GlyphKind = 'eq' | 'ne' | 'lt' | 'gt' | 'yes' | 'no';
const SYMBOL_GLYPH: Record<Symbol, GlyphKind> = { '<': 'lt', '=': 'eq', '>': 'gt' };

/** A pick control below the sides: its answer id, narration key and glyph. */
interface Choice {
  id: string;
  label: string;
  glyph: GlyphKind;
}

function choicesFor(ask: Config['ask']): Choice[] {
  switch (ask) {
    case 'same-or-not':
      return [
        { id: 'same', label: 'ui.compare.same', glyph: 'eq' },
        { id: 'not-same', label: 'ui.compare.not-same', glyph: 'ne' },
      ];
    case 'true-false':
      return [
        { id: 'true', label: 'ui.compare.yes', glyph: 'yes' },
        { id: 'false', label: 'ui.compare.no', glyph: 'no' },
      ];
    case 'symbol':
      return [];
    default:
      return [{ id: 'same', label: 'ui.compare.same', glyph: 'eq' }];
  }
}

/** Chunky relation glyphs (ink strokes on light cards, ≥ 3:1). */
function Glyph({ kind }: { kind: GlyphKind }) {
  if (kind === 'yes' || kind === 'no') return <Thumb up={kind === 'yes'} />;
  const ink = 'var(--color-ink)';
  const paths: Record<Exclude<GlyphKind, 'yes' | 'no'>, ReactNode> = {
    eq: <path d="M10 18h28M10 30h28" stroke={ink} strokeWidth="6" />,
    ne: (
      <>
        <path d="M10 18h28M10 30h28" stroke={ink} strokeWidth="6" />
        <path d="M31 8 17 40" stroke={ink} strokeWidth="5" />
      </>
    ),
    lt: <path d="M36 10 12 24l24 14" stroke={ink} strokeWidth="6" />,
    gt: <path d="m12 10 24 14-24 14" stroke={ink} strokeWidth="6" />,
  };
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="ni-cmp__glyph-svg"
      data-glyph={kind}
    >
      {paths[kind]}
    </svg>
  );
}

/**
 * Yes / no for a statement: a thumb up or down (the Check button already shows a tick, so a K
 * child must never see the same mark on "yes"). Island style: a warm hand, ink outline, one
 * highlight, a sea-blue cuff.
 */
function Thumb({ up }: { up: boolean }) {
  const ink = 'var(--color-ink)';
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="ni-cmp__glyph-svg"
      data-glyph={up ? 'thumb-up' : 'thumb-down'}
    >
      <g transform={up ? undefined : 'matrix(1 0 0 -1 0 48)'}>
        <rect
          x="5"
          y="21"
          width="9"
          height="21"
          rx="2.5"
          fill="var(--color-sea)"
          stroke={ink}
          strokeWidth="3"
        />
        <path
          d="M14 22h5l6-11c1.5-3 6.5-2.5 7 1l-1 8h8.5c3 0 5 2.6 4.4 5.5l-2.6 12c-.6 2.6-2.8 4.5-5.5 4.5H14Z"
          fill="var(--color-sunshine-light)"
          stroke={ink}
          strokeWidth="3"
        />
        <path d="M29 28h9M29 34h8M28 40h6" stroke={ink} strokeWidth="2" opacity="0.55" />
        <path d="M24 15c1-2 2-3 3.5-3.2" stroke="#fff" strokeWidth="2.5" opacity="0.7" />
      </g>
    </svg>
  );
}

/**
 * "This one" at the start of a match row: the guide's pointing hand, turned to point along its row, so
 * a pre-reader sees which row the card picks (a bare triangle read as "play").
 */
function RowPointer() {
  return (
    <span className="ni-cmp__rowhand" data-glyph="row-pointer">
      <HandPointerIcon direction="up" />
    </span>
  );
}

/** The single number a side shows as a numeral (spoken on tap), or null. */
function sideNumeral(s: StimulusSpec): number | null {
  if (s.kind !== 'expression') return null;
  const [tok, ...rest] = s.expr.tokens;
  return tok?.t === 'num' && rest.length === 0 ? tok.v : null;
}

/** The fraction a side shows as one stacked fraction (a single `frac` token), or null. */
function sideFraction(s: StimulusSpec): { a: number; b: number } | null {
  if (s.kind !== 'expression' || s.expr.tokens.length !== 1) return null;
  const tok = s.expr.tokens[0];
  return tok?.t === 'frac' && typeof tok.a === 'number' && typeof tok.b === 'number'
    ? { a: tok.a, b: tok.b }
    : null;
}

const hasRelation = (s: StimulusSpec) =>
  s.kind === 'expression' && s.expr.tokens.some((tok) => tok.t === 'rel');

// ---------- layout ----------

const ROOT_PAD = { x: 8, y: 6 };
/** Between the sides (and the gap or relation between them), and between sides and answers. */
const SIDE_GAP = 24;
/**
 * Between stacked sides the child picks: room for the guide's hand under the upper card (it hangs
 * ~46 px below the card, bob included) ≥ 12 px clear of the card below, past its 6 px ledge.
 */
const STACK_PICK_GAP = 53;
/**
 * Length strips (stacked ribbons over one ruler) keep the plain gap between the rows: the guide points
 * at a strip from its right instead (the ribbons and the ruler are its glyphs), so the answers
 * column stands this far off: the hand's 38 px reach past the card plus 12 px clear, and more.
 */
const STRIP_ANSWER_GAP = 56;
const ANSWER_GAP = 24;
/** A framed side: its border and padding around the picture. */
const SIDE_PAD = 19;
/** The answer row: the choices' gap (room for a picked card's badge and ring) and padding. */
const CHOICE_GAP = 36;
const CHOICES_PAD = 8;
const CHECK_GAP = 40;
/** Match rows: the room between the rows for the lines, and a row's frame and padding. */
const ROW_GAP = 40;
const ROW_PAD = { x: 17, y: 13 };
const ROW_PICK_GAP = 20;
/**
 * Between two object targets: the 12 px target gap plus the invite ring's reach (4 px wide, 1 px
 * out: 5 px), so a ringed object stays ≥ 12 px clear of its neighbours (06 §4).
 */
const OBJ_GAP = 18;
/** Pictures never grow past this (an unbounded story stage, or a huge tablet). */
const MAX_SIDE_H = 420;
/**
 * Room the guide's hand needs under the content's lowest control, past the widget's 6 px padding: the
 * kit hangs it ~18 px up that control, 56 px tall, plus its 8 px bob and a 10 px edge (57 px from
 * the control's bottom to the widget's). A widget that can invite (a demo is attached) plans its
 * layout without it, so an invite never moves anything or scrolls.
 */
const HAND_ROOM = 51;

type Arrange = 'match' | 'row' | 'beside' | 'stack' | 'stack-beside';

interface Box {
  w: number;
  h: number;
}

interface AnswerSize {
  items: Box[];
  check: Box;
}

const answerRow = (a: AnswerSize): Box => {
  const items = a.items;
  const w = items.reduce((s, b) => s + b.w, 0) + Math.max(0, items.length - 1) * CHOICE_GAP;
  return {
    w: (items.length ? w + 2 * CHOICES_PAD + CHECK_GAP : 0) + a.check.w,
    h: Math.max(a.check.h, ...items.map((b) => b.h + 2 * CHOICES_PAD)),
  };
};
const answerColumn = (a: AnswerSize): Box => {
  const items = a.items;
  const h = items.reduce((s, b) => s + b.h, 0) + Math.max(0, items.length - 1) * CHOICE_GAP;
  return {
    w: Math.max(a.check.w, ...items.map((b) => b.w + 2 * CHOICES_PAD)),
    h: (items.length ? h + 2 * CHOICES_PAD + ANSWER_GAP : 0) + a.check.h,
  };
};

/** How well a picture fits a box: its scale against its natural size (capped, so huge boxes tie). */
function fitScore(spec: StimulusSpec, box: Box): number {
  if (spec.kind === 'none') return Number.POSITIVE_INFINITY;
  if (box.w <= 0 || box.h <= 0) return 0;
  const nat = naturalPictureSize(spec, false);
  const natW = nat.flexWidth ? 360 : nat.w;
  return Math.min(1.5, box.w / natW, box.h / nat.h);
}

interface MatchGeometry {
  cell: number;
  button: number;
  overhang: number;
  rowW: number;
  rowH: number;
}

/** A "this one" card: the K target plus a margin, so it never measures under the target. */
const pickW = (target: number) => target + 4;

/**
 * Both rows at full target size (`k` = 1) or bigger (`k` > 1, to use the room): one cell for
 * both, objects ≥ the target and 18 px apart.
 */
function matchGeometry(
  layouts: [ObjectLayout, ObjectLayout],
  target: number,
  withPick: boolean,
  k = 1,
): MatchGeometry {
  const step = Math.min(...layouts.map((l) => Math.min(1.12, minObjectStep(l))));
  const cell = Math.ceil(((target + OBJ_GAP) / step) * k);
  const button = Math.max(target, Math.floor(step * cell - OBJ_GAP));
  const overhang = Math.max(0, Math.ceil((button - cell) / 2));
  const objW = Math.max(...layouts.map((l) => l.width * cell)) + 2 * overhang;
  const objH = Math.max(...layouts.map((l) => l.height * cell)) + 2 * overhang;
  return {
    cell,
    button,
    overhang,
    rowW: objW + 2 * ROW_PAD.x + (withPick ? pickW(target) + ROW_PICK_GAP : 0),
    rowH: objH + 2 * ROW_PAD.y,
  };
}

interface Plan {
  arrange: Arrange;
  /** The picture box of each side (sides layouts). */
  side: Box;
  /** The answer controls in a column (beside) or a row. */
  answers: 'row' | 'column';
  match: MatchGeometry | null;
}

function planLayout(opts: {
  room: WidgetRoom | null;
  specs: StimulusSpec[];
  mid: Box;
  answer: AnswerSize;
  /** The match rows' geometry at a size factor (null: no match mode). */
  match: ((k: number) => MatchGeometry) | null;
  sidePick: boolean;
  stackOnly?: boolean;
  /** Height under the stacked sides for a shared ruler (length strips). */
  rulerH?: number;
  /** Height held back for the guide's hand (a widget that can invite). */
  handRoom?: number;
}): Plan {
  const { room, specs, mid, answer, match } = opts;
  const W = (room?.width ?? 1180) - 2 * ROOT_PAD.x;
  const H = (room?.height ?? Number.POSITIVE_INFINITY) - 2 * ROOT_PAD.y - (opts.handRoom ?? 0);
  const row = answerRow(answer);
  const col = answerColumn(answer);
  // Match rows only when both rows fit at full target size with the answer controls; then the
  // biggest objects (up to 1.5 ×) that still fit, so the rows use the room.
  // Match rows win over the hand's room: rows that fit only without it still beat the pictures
  // (10 against 9 in K at the tablet area), and the guide's hand then makes its own room below.
  const fullH = H + (opts.handRoom ?? 0);
  const heights = !match ? [] : fullH > H ? [H, fullH] : [H];
  for (const h of heights) {
    if (!match) break;
    const bounded = Number.isFinite(h);
    for (let k = bounded ? 1.5 : 1; k >= 1 - 1e-9; k -= 0.05) {
      const m = match(k);
      const rowsH = 2 * m.rowH + ROW_GAP;
      if (m.rowW <= W && rowsH + ANSWER_GAP + row.h <= h && row.w <= W) {
        return { arrange: 'match', side: { w: 0, h: 0 }, answers: 'row', match: m };
      }
      if (m.rowW + ANSWER_GAP + col.w <= W && Math.max(rowsH, col.h) <= h) {
        return { arrange: 'match', side: { w: 0, h: 0 }, answers: 'column', match: m };
      }
    }
  }
  const n = specs.length;
  const midW = mid.w > 0 ? mid.w + SIDE_GAP : 0;
  const capH = (h: number) => Math.min(MAX_SIDE_H, h);
  const stackGap = opts.sidePick && !opts.stackOnly ? STACK_PICK_GAP : SIDE_GAP;
  const besideGap = opts.stackOnly && opts.sidePick ? STRIP_ANSWER_GAP : ANSWER_GAP;
  // A side the child picks keeps a target-sized card (and its ledge) around the picture.
  const pad = 2 * SIDE_PAD + (opts.sidePick ? 6 : 0);
  const boxes: Record<Exclude<Arrange, 'match'>, Box> = {
    row: {
      w: (W - midW - (n - 1) * SIDE_GAP) / n - 2 * SIDE_PAD,
      h: capH(H - ANSWER_GAP - row.h) - pad,
    },
    beside: {
      w: (W - col.w - ANSWER_GAP - midW - (n - 1) * SIDE_GAP) / n - 2 * SIDE_PAD,
      h: capH(H) - pad,
    },
    stack: {
      w: (opts.stackOnly ? W : Math.min(W, 760)) - 2 * SIDE_PAD,
      h:
        capH(
          (H -
            ANSWER_GAP -
            row.h -
            (mid.h > 0 ? mid.h + SIDE_GAP : 0) -
            (n - 1) * stackGap -
            (opts.rulerH ?? 0)) /
            n,
        ) - pad,
    },
    // Short and wide (the 960 × 600 minimum): the sides one above the other, each the full width
    // left of the answers, so a long row of objects draws big.
    'stack-beside': {
      w: Math.min(W - col.w - besideGap, 900) - 2 * SIDE_PAD,
      h: capH((H - (n - 1) * stackGap - (opts.rulerH ?? 0)) / n) - pad,
    },
  };
  const score = (a: Exclude<Arrange, 'match'>) =>
    Math.min(...specs.map((s) => fitScore(s, boxes[a])));
  // Side by side with the answers below, unless another arrangement draws the pictures clearly
  // bigger (short rooms: answers beside; narrow ones: the sides stacked). A relation between
  // the sides (a symbol's gap, a statement's =) reads left to right, so those never stack.
  let best: Exclude<Arrange, 'match'> = opts.stackOnly ? 'stack' : 'row';
  const others = opts.stackOnly
    ? (['stack-beside'] as const)
    : mid.w > 0
      ? (['beside'] as const)
      : (['beside', 'stack', 'stack-beside'] as const);
  // An arrangement must hold its answer controls: a column beside the sides no taller than the
  // room, a row below no wider.
  const holds = (a: Exclude<Arrange, 'match'>) =>
    a === 'beside' || a === 'stack-beside' ? col.h <= H + 0.5 : row.w <= W + 0.5;
  for (const a of others) {
    // Length strips keep their answers beside them when the column fits (the strips and their
    // ruler need every px of height, 06 §1 minimum area).
    const prefer = opts.stackOnly && a === 'stack-beside';
    if (holds(a) && (prefer || !holds(best) || score(a) > score(best) * 1.15)) best = a;
  }
  return {
    arrange: best,
    side: { w: Math.max(1, boxes[best].w), h: Math.max(1, boxes[best].h) },
    answers: best === 'beside' || best === 'stack-beside' ? 'column' : 'row',
    match: null,
  };
}

/** Spreads a layout's objects apart by `k` (their size unchanged). */
function spread(layout: ObjectLayout, k: number): ObjectLayout {
  return {
    ...layout,
    objects: layout.objects.map((o) => ({ ...o, x: o.x * k, y: o.y * k })),
    width: (layout.width - 1) * k + 1,
    height: (layout.height - 1) * k + 1,
  };
}

/** Shrinks every object to `k` of its cell, centred where it was. */
function shrink(layout: ObjectLayout, k: number): ObjectLayout {
  return {
    ...layout,
    objects: layout.objects.map((o) => ({
      ...o,
      scale: o.scale * k,
      x: o.x + (o.scale * (1 - k)) / 2,
      y: o.y + (o.scale * (1 - k)) / 2,
    })),
  };
}

/**
 * The two sides' countable layouts. A compare.sets conflict item (CMP.05: one set drawn big and
 * spread out, `sizeVaries`, against a bunched set) makes its cue deliberate rather than random:
 * every object of the big-looking side is drawn larger than every object of the other side, and
 * further apart. Counts and reading order are unchanged; both sides still share one cell.
 */
function sideLayouts(specs: StimulusSpec[], stack: boolean): (ObjectLayout | null)[] {
  const plain = specs.map((sp) => countLayout(sp, stack));
  const [a, b] = specs;
  if (specs.length !== 2 || a?.kind !== 'objects' || b?.kind !== 'objects') return plain;
  const big = [a.set.sizeVaries === true, b.set.sizeVaries === true];
  if (big[0] === big[1]) return plain;
  return specs.map((sp, i) => {
    if (sp.kind !== 'objects') return plain[i] ?? null;
    return big[i]
      ? spread(objectSetLayout({ ...sp.set, sizeVaries: false }), 1.35)
      : shrink(objectSetLayout(sp.set), 0.68);
  });
}

/**
 * A "which is longer?" side (mea.length `rulerStrip`): a ruler from 0 with one unlabelled mark at
 * the object's length. It is drawn as a ribbon of that length on the ruler, starting at 0, so the
 * two sides (one scale, one start) compare like two real strips laid side by side.
 */
const isLengthStrip = (spec: StimulusSpec, ask: Config['ask']) =>
  ask === 'longer' &&
  spec.kind === 'number-line' &&
  spec.min === 0 &&
  (spec.marks ?? []).length === 1 &&
  spec.marks?.[0]?.label === undefined;

/** The width a length strip and the shared ruler are drawn at (one scale for both). */
const stripWidth = (w: number) => Math.max(200, Math.min(880, Math.floor(w)));
/** The ruler under two length strips: its height (line at 30 px, ticks and caps below). */
const RULER_H = 60;
/** The numeral floor (05 §11): a number line's printed numerals never go under it. */
const MIN_NUMERAL_PX = 32;
/** A ribbon's drawn band: 30 px in a tight room, broader (up to 56 px) where the room allows. */
const RIBBON_H = { min: 30, max: 56 };
/**
 * The ribbon band for a room: the broadest that still leaves the hand's room under the centred
 * content (two strip cards, their gap, the ruler), so a roomy area is used and nothing is lifted.
 * The minimum area keeps the 30 px band (its cards are already at the target size).
 */
function ribbonHeight(room: WidgetRoom | null): number {
  if (!room || !Number.isFinite(room.height)) return RIBBON_H.min;
  const free = room.height - 2 * ROOT_PAD.y - 2 * HAND_ROOM - SIDE_GAP - (RULER_H + SIDE_GAP);
  const band = Math.floor(free / 2) - (2 * SIDE_PAD + 6);
  return Math.max(RIBBON_H.min, Math.min(RIBBON_H.max, band));
}

/**
 * The one ruler two length strips share: from 0 to the longer of the two ranges, so both ribbons
 * are measured on one scale (8 of 0–10 and 10 of 0–20 both on 0–20). Null when the two rulers
 * can't share a scale honestly (different tick steps): each side then keeps its own number line.
 */
function sharedRange(specs: StimulusSpec[]): Extract<StimulusSpec, { kind: 'number-line' }> | null {
  const lines = specs.filter(
    (sp): sp is Extract<StimulusSpec, { kind: 'number-line' }> => sp.kind === 'number-line',
  );
  const [a, b] = lines;
  if (lines.length !== 2 || !a || !b || a.ticksEvery !== b.ticksEvery) return null;
  const longer = b.max > a.max ? b : a;
  return {
    ...longer,
    min: Math.min(a.min, b.min),
    max: Math.max(a.max, b.max),
    labelsEvery: a.labelsEvery === b.labelsEvery ? a.labelsEvery : null,
    marks: [],
  };
}

/** One side's length: a ribbon from the ruler's 0 to its length, on the shared ruler's scale. */
function LengthStrip({
  spec,
  range,
  width,
  height,
  label,
}: {
  spec: Extract<StimulusSpec, { kind: 'number-line' }>;
  /** The shared ruler's range (both strips are drawn on it). */
  range: { min: number; max: number };
  width: number;
  /** The ribbon's band (`ribbonHeight`): the ribbon is drawn 8 px short of it. */
  height: number;
  label: string;
}) {
  const at = spec.marks?.[0]?.at ?? spec.min;
  const w = stripWidth(width);
  const scale = numberLineScale(range.min, range.max, w, LINE_BARE_PAD);
  const x0 = scale.x(spec.min);
  const len = Math.max(0, scale.x(at) - x0);
  const thick = height - 8;
  return (
    <div className="ni-cmp__strip" role="img" aria-label={label} data-length={at}>
      <svg
        className="ni-cmp__ribbon"
        width={w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        aria-hidden="true"
        focusable="false"
      >
        <rect className="ni-invite-glyph" x={x0} y={4} width={len} height={thick} rx={thick / 2} />
        <path d={`M${x0 + thick / 2 + 1} ${4 + Math.round(thick * 0.32)}h${len * 0.35}`} />
      </svg>
    </div>
  );
}

/** One ruler under both strips (all its ticks, 5s and 10s longer): the common start and scale. */
function SharedRuler({
  spec,
  width,
}: {
  spec: Extract<StimulusSpec, { kind: 'number-line' }>;
  width: number;
}) {
  return (
    <div className="ni-cmp__ruler ni-invite-glyph" aria-hidden="true">
      <NumberLineView
        min={spec.min}
        max={spec.max}
        ticksEvery={spec.ticksEvery}
        labelsEvery={spec.labelsEvery}
        width={stripWidth(width)}
        pad={LINE_BARE_PAD}
        headroom={30}
        tickRhythm
      />
    </div>
  );
}

interface Line {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Flight {
  symbol: Symbol;
  from: DOMRect;
  to: DOMRect;
  moving: boolean;
}

/** Where a demo invite points: a pick or choice (`data-id`), a symbol tile, or an object. */
type Cue = { kind: 'id'; id: string } | { kind: 'symbol'; s: Symbol } | { kind: 'obj'; id: string };

export function CompareWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, textLabels, ageMode } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const [selected, setSelected] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pending, setPending] = useState<{ side: Side; index: number } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);
  const room = useWidgetRoom(rootRef);
  // Drawn-to-size pictures (blocks, lines, numbers) share one scale: size is never a false cue.
  const shared = useSharedScale();

  const interactive = !disabled && !demoBusy;
  const ask = config.ask;
  const sidePick = SIDE_ASKS.has(ask);
  const target = MIN_TARGET_PX[ageMode];
  const leftSet = config.left.kind === 'objects' ? config.left.set : null;
  const rightSet = config.right.kind === 'objects' ? config.right.set : null;
  const specs = config.right.kind === 'none' ? [config.left] : [config.left, config.right];
  const [leftLayout, rightLayout] = leftSet && rightSet ? sideLayouts(specs, false) : [null, null];
  // Match rows are for the questions answered below them (which has more, the same or not). A
  // symbol question keeps its sides and the gap between them: the gap is where the symbol goes.
  const matchable =
    tier === 'concrete' &&
    config.allowMatchLines &&
    ask !== 'symbol' &&
    leftLayout !== null &&
    rightLayout !== null;
  const choices = choicesFor(ask);
  const validIds: string[] =
    ask === 'symbol'
      ? [...SYMBOLS]
      : [...(sidePick ? ['left', 'right'] : []), ...choices.map((c) => c.id)];
  const symbol = ask === 'symbol' && selected !== null ? (selected as Symbol) : null;

  // ---------- layout ----------

  // The answer controls' own sizes (they don't depend on the layout), measured once laid out.
  const [answerSize, setAnswerSize] = useState<AnswerSize | null>(null);
  useLayoutEffect(() => {
    const el = answerRef.current;
    if (!el) return;
    const measure = () => {
      const box = (e: Element | null): Box => {
        const r = e?.getBoundingClientRect();
        return { w: Math.ceil(r?.width ?? 0), h: Math.ceil(r?.height ?? 0) };
      };
      // Each wrapper already holds its control's 6 px ledge (the control's bottom margin).
      const next: AnswerSize = {
        items: [...el.querySelectorAll('.ni-cmp__choice')].map((c) => box(c)),
        check: box(el.querySelector('.ni-cmp__check')),
      };
      setAnswerSize((cur) => (cur && JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of el.querySelectorAll('.ni-cmp__choice, .ni-cmp__check')) ro.observe(c);
    return () => ro.disconnect();
  }, []);
  const pickPx = Math.round(target * 1.15);
  const fallbackAnswer: AnswerSize = {
    items: Array.from({ length: ask === 'symbol' ? 3 : choices.length }, () => ({
      w: pickPx,
      h: pickPx + 6,
    })),
    check: { w: TARGET_PX[ageMode].big + 8, h: TARGET_PX[ageMode].big + 6 },
  };
  const symbolGap = ask === 'symbol';
  const relation =
    ask === 'true-false' && config.right.kind !== 'none' && !hasRelation(config.left);
  const mid: Box = symbolGap
    ? { w: Math.round(target * 1.6), h: Math.round(target * 1.6) }
    : relation
      ? { w: Math.round(target * 0.9), h: Math.round(target * 0.9) }
      : { w: 0, h: 0 };
  // "Which is longer?" with two ruler strips: two ribbons stacked over one shared ruler.
  const ruler = specs.every((sp) => isLengthStrip(sp, ask)) ? sharedRange(specs) : null;
  const strips = ruler !== null;
  const bounded = room !== null && Number.isFinite(room.height);
  // A widget in a bounded room fills its height and keeps room under its content for the guide's hand
  // (see `lift` below). When centring the planned layout leaves less than `HAND_ROOM` there, the
  // layout is planned again with that much held back (once per room size, so it never flips).
  const reserve = bounded && room !== null;
  const roomKey = room ? `${room.width}x${room.height}` : '';
  const [tightRoom, setTightRoom] = useState<string | null>(null);
  const holdBack = reserve && tightRoom === roomKey;
  const planWith = (handRoom: number) =>
    planLayout({
      room,
      specs,
      mid,
      answer: answerSize ?? fallbackAnswer,
      match:
        matchable && leftLayout && rightLayout
          ? (k: number) => matchGeometry([leftLayout, rightLayout], target, sidePick, k)
          : null,
      sidePick,
      // Two lengths compare one above the other from a common start.
      stackOnly: strips,
      rulerH: strips ? RULER_H + SIDE_GAP : 0,
      handRoom,
    });
  const held = planWith(holdBack ? HAND_ROOM : 0);
  // A side's number line printed under the 32 px numeral floor (05 §11) at this plan's height.
  const smallNumerals = (p: Plan) =>
    specs.some((sp) => {
      if (sp.kind !== 'number-line' || isLengthStrip(sp, ask)) return false;
      const px = fittedLineNumeralPx(sp, p.side.h);
      return px !== null && px < MIN_NUMERAL_PX - 0.01;
    });
  // The hand's room never costs a side its target size (06 §4) or a number line its numerals
  // (05 §11): a layout that would shrink either keeps the room it has (the hand then points from
  // beside or above).
  const plan =
    holdBack &&
    held.arrange !== 'match' &&
    (held.side.h + 2 * SIDE_PAD < target || smallNumerals(held))
      ? planWith(0)
      : held;
  /**
   * Match mode (concrete tier with match lines): the sets as rows of object targets. When the rows
   * don't fit the room at full target size, the widget falls back to the side-by-side pictures:
   * the sides become the pick targets and there are no object targets, so matching (optional
   * help, never the answer) is simply not offered.
   */
  const matchMode = plan.arrange === 'match';

  /**
   * The guide's hand under the lowest control (an answer, a row's "this one") needs `HAND_ROOM` below
   * the content. Any widget may be invited (03 §6.3), so the room is there in both states, with
   * an invite and without, and an invite never moves anything: the widget fills its room's height
   * with its content centred, raised just enough to leave that room under it (`lift`).
   */
  const [contentH, setContentH] = useState(0);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!reserve || !root) return;
    const parts = [
      ...root.querySelectorAll(
        ':scope > .ni-cmp__stage, :scope > .ni-cmp__rows, :scope > .ni-cmp__answer',
      ),
    ];
    if (parts.length === 0) return;
    const rects = parts.map((p) => p.getBoundingClientRect());
    const h = Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top));
    setContentH((cur) => (Math.abs(cur - h) < 0.5 ? cur : h));
    if (!holdBack && room && room.height - 2 * ROOT_PAD.y - h < HAND_ROOM - 0.5) {
      setTightRoom(roomKey);
    }
  });
  const fillH = reserve && room ? Math.floor(room.height) : 0;
  const slack = Math.max(0, fillH - 2 * ROOT_PAD.y - contentH);
  const lift = reserve ? Math.min(slack, Math.max(0, Math.ceil(2 * HAND_ROOM - slack))) : 0;

  const speakKey = (key: string) => {
    if (speakOnTap) say(key);
  };

  const choose = (id: string, speak?: () => void) => {
    if (!interactive || !validIds.includes(id)) return;
    trace('tap', id);
    speak?.();
    setInvite(null);
    setSelected(id);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || selected === null) return false;
    const model = formatModel('compare');
    if (!model) return false;
    const state = model.apply(model.initialState(config), {
      op: 'answer',
      args: { id: selected },
    });
    const response = model.toResponse(state);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- symbol: tap or drag into the gap ----------

  const placeSymbol = (s: Symbol) => {
    speakKey(SYMBOL_KEY[s]);
    setInvite(null);
    setSelected(s);
  };
  const dndRef = useRef<{ select: (item: Symbol | null) => void } | null>(null);
  const dnd = useDragToTarget<Symbol, 'gap'>({
    disabled: !interactive || ask !== 'symbol',
    trace,
    // A tap on a symbol places it straight away (one tap for pre-readers); a drag drops it.
    onSelect: (item) => {
      if (item === null) return;
      placeSymbol(item);
      dndRef.current?.select(null);
    },
    onPlace: ({ item }) => placeSymbol(item),
  });
  dndRef.current = dnd;

  // ---------- match lines ----------

  const addMatch = (l: number, r: number) => {
    setMatches((prev) => [...prev.filter(([x, y]) => x !== l && y !== r), [l, r]]);
  };

  const tapObject = (side: Side, index: number, sprite: string) => {
    if (!interactive) return;
    trace('tap', `${side}-obj-${index}`);
    if (speakOnTap) say(spriteNameKey(sprite));
    if (pending && pending.side !== side) {
      const l = side === 'left' ? index : pending.index;
      const r = side === 'right' ? index : pending.index;
      trace('move', `match-${l}-${r}`);
      addMatch(l, r);
      setPending(null);
    } else if (pending && pending.index === index) {
      setPending(null);
    } else {
      setPending({ side, index });
    }
  };

  // Measure each matched pair's objects and draw a line between them (top row → bottom row).
  const measureLines = useCallback(() => {
    const rows = rowsRef.current;
    if (!rows) return;
    const box = rows.getBoundingClientRect();
    const objAt = (id: string) =>
      [...rows.querySelectorAll<HTMLElement>('[data-obj]')]
        .find((el) => el.dataset.obj === id)
        ?.getBoundingClientRect();
    const next: Line[] = [];
    for (const [l, r] of matches) {
      const a = objAt(`left-obj-${l}`);
      const b = objAt(`right-obj-${r}`);
      if (!a || !b) continue;
      next.push({
        key: `${l}-${r}`,
        x1: a.left + a.width / 2 - box.left,
        y1: a.bottom - box.top - 6,
        x2: b.left + b.width / 2 - box.left,
        y2: b.top - box.top + 6,
      });
    }
    setLines(next);
  }, [matches]);

  useLayoutEffect(() => {
    if (!matchMode) return;
    measureLines();
    const rows = rowsRef.current;
    if (!rows || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureLines());
    ro.observe(rows);
    return () => ro.disconnect();
  }, [matchMode, measureLines]);

  // ---------- demo mode (03 §6.3) ----------

  const flyRect = (find: (root: HTMLElement) => Element | undefined | null) => {
    const root = rootRef.current;
    return root ? (find(root)?.getBoundingClientRect() ?? null) : null;
  };
  const symbolTile = (root: HTMLElement, s: string) =>
    [...root.querySelectorAll<HTMLElement>('[data-symbol]')].find((el) => el.dataset.symbol === s);

  const flySymbol = async (s: Symbol) => {
    const from = flyRect((r) => symbolTile(r, s));
    const to = flyRect((r) => r.querySelector('.ni-cmp__pad'));
    if (reduced || !from || !to) return;
    setFlight({ symbol: s, from, to, moving: false });
    await wait(20);
    if (!alive.current) return;
    setFlight({ symbol: s, from, to, moving: true });
    await wait(FLY_MS);
    if (alive.current) setFlight(null);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'highlight') {
          const side = action.args?.side;
          if (side !== 'left' && side !== 'right') return;
          setHighlight(side);
          await pause(1200);
          if (alive.current) setHighlight(null);
        } else if (action.op === 'match') {
          const l = Number(action.args?.left);
          const r = Number(action.args?.right);
          const ok =
            config.allowMatchLines &&
            Number.isInteger(l) &&
            Number.isInteger(r) &&
            l >= 0 &&
            r >= 0 &&
            l < (leftSet?.count ?? 0) &&
            r < (rightSet?.count ?? 0);
          if (!ok) return;
          if (!matchMode) {
            // The pictures have no tappable objects: point at each side in turn.
            setHighlight('left');
            await pause(500);
            if (!alive.current) return;
            setHighlight('right');
            await pause(500);
            if (alive.current) setHighlight(null);
            return;
          }
          setHighlight(`left-obj-${l}`);
          if (leftSet) say(spriteNameKey(leftSet.sprite));
          await pause(500);
          if (!alive.current) return;
          setHighlight(`right-obj-${r}`);
          addMatch(l, r);
          await pause(600);
          if (alive.current) setHighlight(null);
        } else if (action.op === 'place-symbol' || action.op === 'answer') {
          const id = String(action.op === 'place-symbol' ? action.args?.symbol : action.args?.id);
          if (!validIds.includes(id)) return;
          if (ask === 'symbol') {
            setHighlight(`symbol-${id}`);
            say(SYMBOL_KEY[id as Symbol]);
            await pause(400);
            if (!alive.current) return;
            await flySymbol(id as Symbol);
            if (!alive.current) return;
          } else {
            setHighlight(id);
            await pause(600);
            if (!alive.current) return;
          }
          setSelected(id);
          setHighlight(null);
          await pause(300);
        }
      } finally {
        setDemoBusy(false);
        setFlight(null);
      }
    },
    invite: (action) => setInvite(action),
  });

  /** The one control the invite rings, only while the child can act (03 §6.3). */
  const cue: Cue | null = (() => {
    if (!invite || !interactive) return null;
    const a = invite.args ?? {};
    // A side is a target only for the side questions (its card, or its row's "this one").
    const sideCue = (side: unknown): Cue | null =>
      sidePick && (side === 'left' || side === 'right') ? { kind: 'id', id: side } : null;
    switch (invite.op) {
      case 'highlight':
        return sideCue(a.side);
      case 'match': {
        // The fallback layout has no object targets: no cue.
        if (!matchMode) return null;
        const l = Number(a.left);
        const r = Number(a.right);
        if (!Number.isInteger(l) || !Number.isInteger(r)) return null;
        if (l < 0 || r < 0 || l >= (leftSet?.count ?? 0) || r >= (rightSet?.count ?? 0)) {
          return null;
        }
        if (matches.some(([x, y]) => x === l && y === r)) return null;
        return pending?.side === 'left' && pending.index === l
          ? { kind: 'obj', id: `right-obj-${r}` }
          : { kind: 'obj', id: `left-obj-${l}` };
      }
      case 'place-symbol':
        return ask === 'symbol' && SYMBOLS.includes(a.symbol as Symbol)
          ? { kind: 'symbol', s: a.symbol as Symbol }
          : null;
      case 'answer': {
        const id = String(a.id);
        if (!validIds.includes(id)) return null;
        if (ask === 'symbol') return { kind: 'symbol', s: id as Symbol };
        return id === 'left' || id === 'right' ? sideCue(id) : { kind: 'id', id };
      }
      default:
        return null;
    }
  })();
  const cueKey =
    cue === null
      ? ''
      : cue.kind === 'id'
        ? `id:${cue.id}`
        : cue.kind === 'symbol'
          ? `sym:${cue.s}`
          : `obj:${cue.id}`;
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => {
      if (cue === null) return null;
      if (cue.kind === 'symbol') return symbolTile(root, cue.s) ?? null;
      const key = cue.kind === 'obj' ? 'obj' : 'id';
      return (
        [...root.querySelectorAll<HTMLElement>(`[data-${key}]`)].find(
          (el) => el.dataset[key] === cue.id,
        ) ?? null
      );
    },
    cueKey,
  );
  /** Ringed: the demo's highlight while it plays, or the invite's one control. */
  const lit = (id: string) =>
    highlight === id ||
    (cue !== null &&
      ((cue.kind === 'id' && cue.id === id) ||
        (cue.kind === 'obj' && cue.id === id) ||
        (cue.kind === 'symbol' && `symbol-${cue.s}` === id)));

  // ---------- render ----------

  const sideLabel = (side: Side) => t(side === 'left' ? 'ui.compare.left' : 'ui.compare.right');

  // Two counted pictures share one object size, so size is never a cue the numbers don't give
  // (a line of 6 must not look smaller than a scatter of 6). A double ten-frame stacks when that
  // draws it bigger.
  // Stacked sides keep their objects in column (one left edge, one cell, as match rows do), so
  // object i sits above object i and a longer row's extra objects stand out at its end.
  const stacked = plan.arrange === 'stack' || plan.arrange === 'stack-beside';
  // Two plain lines of more than five objects, stacked, may each wrap into rows of five (reading
  // order kept, both sides alike, so they stay in column: 10 reads 5 + 5 above 9 = 5 + 4) when
  // that draws the objects bigger: a tall side card is then used, not a thin strip of it.
  const wrappable =
    stacked &&
    specs.length === 2 &&
    specs.every((sp) => sp.kind === 'objects' && sp.set.layout === 'line' && !sp.set.sizeVaries) &&
    specs.some((sp) => sp.kind === 'objects' && sp.set.count > 5);
  const layoutsOf = (stack: boolean, wrap: boolean) =>
    sideLayouts(specs, stack).map((l) => (l && wrap ? wrapLine(l, 5) : l));
  const sharedCount = (stack: boolean, wrap = false) => {
    const ls = layoutsOf(stack, wrap);
    if (specs.length < 2 || ls.some((l) => l === null)) return null;
    return Math.min(...ls.map((l) => cellToFit(l as ObjectLayout, plan.side.w, plan.side.h)));
  };
  const plainCell = sharedCount(false);
  const wrapCell = wrappable ? sharedCount(false, true) : null;
  const wrapRows = wrapCell !== null && plainCell !== null && wrapCell > plainCell;
  const flatCell = wrapRows ? wrapCell : plainCell;
  /**
   * What tapping a side says (06 §5): its number when it shows one (a numeral, a number line's
   * labelled mark), or the name of its objects; never a count the child is asked for. A number
   * line whose mark has no label says nothing: its value is exactly what the child is asked to
   * read off the line, so speaking it would give the answer away (the side still picks).
   */
  const sideSpeech = (spec: StimulusSpec): { name: string; speak: () => void } | null => {
    const n = sideNumeral(spec);
    if (n !== null) return { name: String(n), speak: () => sayNumber(n) };
    if (spec.kind === 'objects') {
      const key = spriteNameKey(spec.set.sprite);
      return { name: t(key), speak: () => say(key) };
    }
    // K02 slice 5a: a stacked fraction is named and said as words ("three eighths"), and a
    // fraction picture by what is seen (its equal parts and how many are shaded), so a
    // screen-reader child compares what a sighted child sees.
    const frac = sideFraction(spec);
    if (frac) {
      const f = `${frac.a}/${frac.b}`;
      return { name: fractionWords(t, frac.a, frac.b), speak: () => say('ui.frac.value', { f }) };
    }
    // A picture side gains an accessible name only: a tap stays silent, as it was (FRA.08),
    // so a sighted child's tap never hears the counts read out (PR #139 review).
    if (spec.kind === 'fraction' && spec.equalParts) {
      const key = `ui.frac.picture-shaded-${spec.shape}`;
      return { name: t(key, { n: spec.parts, s: spec.shaded }), speak: () => {} };
    }

    if (spec.kind === 'number-line') {
      const labels = (spec.marks ?? []).filter((m) => m.label !== undefined);
      const v = labels.length === 1 ? Number(labels[0]?.label) : Number.NaN;
      if (Number.isFinite(v)) return { name: String(v), speak: () => sayNumber(v) };
    }
    return null;
  };
  const stackedCell = specs.some((s) => s.kind === 'ten-frame' && s.frames === 2)
    ? sharedCount(true)
    : null;
  const stackFrames = stackedCell !== null && flatCell !== null && stackedCell > flatCell;
  const sharedCell = stackFrames ? stackedCell : flatCell;
  const shownLayouts = layoutsOf(stackFrames, wrapRows);
  const columnW =
    stacked && sharedCell !== null
      ? Math.max(...shownLayouts.map((l) => (l?.width ?? 0) * sharedCell))
      : null;

  const renderSide = (side: Side) => {
    const spec = config[side];
    if (spec.kind === 'none') return null;
    const name = sidePick ? undefined : sideLabel(side);
    const layout = shownLayouts[side === 'left' ? 0 : 1] ?? undefined;
    const picture =
      strips && isLengthStrip(spec, ask) && spec.kind === 'number-line' ? (
        <LengthStrip
          spec={spec}
          range={ruler ?? spec}
          width={plan.side.w}
          height={ribbonHeight(room)}
          label={name ?? t('ui.widget.picture')}
        />
      ) : (
        <FitPicture
          spec={spec}
          layout={layout}
          maxWidth={plan.side.w}
          maxHeight={plan.side.h}
          cell={sharedCell ?? undefined}
          stackFrames={stackFrames}
          // Blocks and numbers may grow to fill a roomy side (both sides share one scale).
          maxScale={spec.kind === 'base-ten' || spec.kind === 'expression' ? 1.5 : 1}
          scale={shared.scale}
          onFit={shared.report(side)}
          label={name}
        />
      );
    const speech = sideSpeech(spec);
    const face =
      columnW !== null ? (
        <div className="ni-cmp__column" style={{ width: columnW }}>
          {picture}
        </div>
      ) : (
        picture
      );
    // A side that says something on tap but is no answer (symbol and true-false operands, same
    // or not) is a plain button: a tap speaks and joins the trace, the answer never changes.
    const operand = !sidePick && speech !== null;
    const overlay = sidePick || operand;
    return (
      <div className="ni-cmp__side" data-side={side} data-overlay={overlay ? 'true' : undefined}>
        {sidePick ? (
          <PickCard
            className="ni-cmp__tray"
            variant="picture"
            // Named with the number it shows (a numeral, a labelled mark); objects keep the side name.
            label={
              speech && spec.kind !== 'objects'
                ? `${sideLabel(side)}: ${speech.name}`
                : sideLabel(side)
            }
            selected={selected === side}
            highlighted={lit(side)}
            data-id={side}
            disabled={!interactive}
            onPress={() =>
              choose(side, () => {
                if (speakOnTap) speech?.speak();
              })
            }
          >
            <span className="ni-cmp__trayspace" />
          </PickCard>
        ) : operand ? (
          <button
            type="button"
            // A lesson's highlight shows on an operand too (a side that is no answer gets no invite).
            className={`ni-cmp__tray ni-cmp__tray--static ni-cmp__operand${lit(side) ? ' ni-invite' : ''}`}
            aria-label={`${sideLabel(side)}: ${speech.name}`}
            data-operand={side}
            disabled={!interactive}
            onClick={() => {
              if (!interactive) return;
              trace('tap', `side-${side}`);
              if (speakOnTap) speech.speak();
            }}
          />
        ) : (
          <div className={`ni-cmp__tray ni-cmp__tray--static${lit(side) ? ' ni-invite' : ''}`}>
            {face}
          </div>
        )}
        {/* A side that is a button draws its picture over it (the button is named by its side),
            so the button holds no text of its own (axe label-content-name-mismatch). */}
        {overlay ? (
          <div className="ni-cmp__trayface" aria-hidden="true">
            {face}
          </div>
        ) : null}
      </div>
    );
  };

  const gapLabel = t('ui.compare.gap');
  const renderMiddle = () => {
    if (symbolGap) {
      const pad = dnd.targetProps('gap', { label: gapLabel });
      return (
        <div className="ni-cmp__gap" data-filled={symbol ? 'true' : undefined}>
          <div {...pad} className={`${pad.className} ni-cmp__pad`} />
          {symbol ? (
            <span className="ni-cmp__placed" aria-hidden="true">
              <Glyph kind={SYMBOL_GLYPH[symbol]} />
            </span>
          ) : null}
        </div>
      );
    }
    if (relation) {
      return (
        <div className="ni-cmp__relation" aria-hidden="true">
          <Glyph kind="eq" />
        </div>
      );
    }
    return null;
  };

  const renderRow = (side: Side) => {
    const set = side === 'left' ? leftSet : rightSet;
    const layout = side === 'left' ? leftLayout : rightLayout;
    const geo = plan.match;
    if (!set || !layout || !geo) return null;
    const { cell, button, overhang } = geo;
    return (
      <div className="ni-cmp__row" data-side={side}>
        {sidePick ? (
          <PickCard
            className="ni-cmp__this"
            variant="picture"
            label={`${t('ui.compare.this-one')}: ${sideLabel(side)}`}
            selected={selected === side}
            highlighted={lit(side)}
            data-id={side}
            disabled={!interactive}
            onPress={() => choose(side)}
          >
            <RowPointer />
          </PickCard>
        ) : null}
        <div
          className={[
            'ni-cmp__tray',
            'ni-cmp__tray--objects',
            lit(side) && !sidePick ? 'ni-invite' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ padding: `${ROW_PAD.y - 3 + overhang}px ${ROW_PAD.x - 3 + overhang}px` }}
        >
          <ObjectSetView
            layout={layout}
            cell={cell}
            label={sideLabel(side)}
            renderObject={(o, style) => {
              if (o.kind === 'distractor') {
                return (
                  <span
                    key={`d-${o.index}`}
                    className="ni-objects__item"
                    style={style}
                    aria-hidden="true"
                  >
                    <ObjectSprite sprite={o.sprite} tone={o.tone} />
                  </span>
                );
              }
              const id = `${side}-obj-${o.index}`;
              const matched = matches.some(([l, r]) => (side === 'left' ? l : r) === o.index);
              const isPending = pending?.side === side && pending.index === o.index;
              // The button is target-sized and centred on the object's place; the sprite keeps
              // the size the picture gives it (a "big looking" set stays big looking).
              const cx = Number(style.left) + Number(style.width) / 2;
              const cy = Number(style.top) + Number(style.height) / 2;
              const sprite = Math.min(button - 8, Number(style.width));
              const objStyle: CSSProperties = {
                left: cx - button / 2,
                top: cy - button / 2,
                width: button,
                height: button,
                padding: (button - sprite) / 2,
              };
              return (
                <button
                  key={id}
                  type="button"
                  className={['ni-cmp__obj', lit(id) ? 'ni-invite' : ''].filter(Boolean).join(' ')}
                  style={objStyle}
                  data-obj={id}
                  data-matched={matched ? 'true' : undefined}
                  aria-pressed={isPending}
                  aria-label={`${t(spriteNameKey(o.sprite))} ${o.index + 1}`}
                  disabled={!interactive}
                  onClick={() => tapObject(side, o.index, o.sprite)}
                >
                  <ObjectSprite sprite={o.sprite} tone={o.tone} />
                </button>
              );
            }}
          />
        </div>
      </div>
    );
  };

  const renderChoice = (c: Choice) => (
    <span key={c.id} className="ni-cmp__choice">
      <PickCard
        label={t(c.label)}
        selected={selected === c.id}
        highlighted={lit(c.id)}
        variant="word"
        data-id={c.id}
        disabled={!interactive}
        onPress={() => choose(c.id, () => speakKey(c.label))}
      >
        <span className="ni-cmp__glyph">
          <Glyph kind={c.glyph} />
        </span>
        {textLabels ? <span className="ni-cmp__caption">{t(c.label)}</span> : null}
      </PickCard>
    </span>
  );

  const renderSymbol = (s: Symbol) => {
    // Pressed = the committed symbol (the drag hook's own aria-pressed is only its pick-up).
    const props = {
      ...dnd.itemProps(s, { label: t(SYMBOL_KEY[s]) }),
      'aria-pressed': symbol === s,
    };
    const id = `symbol-${s}`;
    return (
      <span key={s} className="ni-cmp__choice">
        <div
          {...props}
          className={[props.className, 'ni-pick', 'ni-cmp__sym', lit(id) ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-symbol={s}
          data-chosen={symbol === s ? 'true' : undefined}
        >
          <span className="ni-cmp__glyph">
            <Glyph kind={SYMBOL_GLYPH[s]} />
          </span>
          {symbol === s ? (
            <span className="ni-pick__badge" aria-hidden="true">
              <CheckIcon tone="light" />
            </span>
          ) : null}
        </div>
      </span>
    );
  };

  const flightStyle: CSSProperties | undefined = flight
    ? {
        left: flight.moving ? flight.to.left : flight.from.left,
        top: flight.moving ? flight.to.top : flight.from.top,
        width: flight.moving ? flight.to.width : flight.from.width,
        height: flight.moving ? flight.to.height : flight.from.height,
        transitionDuration: `${FLY_MS}ms`,
      }
    : undefined;

  const vars = {
    '--cmp-pad': `${ROOT_PAD.y}px ${ROOT_PAD.x}px`,
    // In a bounded room the side cards take the height planned for them (06 §1: use the room).
    ...(room && Number.isFinite(room.height) && plan.arrange !== 'match' && !strips
      ? { '--cmp-side-h': `${Math.round(plan.side.h + 2 * SIDE_PAD)}px` }
      : {}),
    '--cmp-gap': `${ANSWER_GAP}px`,
    '--cmp-side-gap': `${stacked && sidePick && !strips ? STACK_PICK_GAP : SIDE_GAP}px`,
    // Beside length strips, the answers stand off far enough for the guide's hand at a strip's right.
    '--cmp-stage-gap': `${strips && sidePick && plan.answers === 'column' ? STRIP_ANSWER_GAP : ANSWER_GAP}px`,
    '--cmp-row-gap': `${ROW_GAP}px`,
    '--cmp-choice-gap': `${CHOICE_GAP}px`,
    '--cmp-check-gap': `${CHECK_GAP}px`,
    '--cmp-mid': `${mid.w}px`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className="ni-cmp"
      data-tier={tier}
      data-ask={ask}
      data-mode={matchMode ? 'match' : 'sides'}
      data-arrange={plan.arrange}
      data-answers={plan.answers}
      data-disabled={disabled ? 'true' : undefined}
      data-hand-room={reserve ? 'true' : undefined}
      style={{
        ...vars,
        ...(reserve ? { minHeight: fillH, paddingBottom: ROOT_PAD.y + lift } : {}),
        ...handRootStyle,
      }}
    >
      {matchMode ? (
        <div className="ni-cmp__rows" ref={rowsRef}>
          {renderRow('left')}
          {renderRow('right')}
          <svg className="ni-cmp__lines" aria-hidden="true" focusable="false">
            {lines.map((l) => (
              <g key={l.key} className="ni-cmp__line" data-pair={l.key}>
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
                <circle cx={l.x1} cy={l.y1} r="7" />
                <circle cx={l.x2} cy={l.y2} r="7" />
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <div
          className="ni-cmp__stage"
          data-sides={specs.length}
          data-strips={strips ? 'true' : undefined}
        >
          {renderSide('left')}
          {renderMiddle()}
          {renderSide('right')}
          {ruler ? <SharedRuler spec={ruler} width={plan.side.w} /> : null}
        </div>
      )}

      <div className="ni-cmp__answer" ref={answerRef}>
        <fieldset
          className="ni-cmp__choices"
          aria-label={t('ui.widget.choices')}
          disabled={!interactive}
        >
          {ask === 'symbol' ? SYMBOLS.map(renderSymbol) : choices.map(renderChoice)}
        </fieldset>
        <span className="ni-cmp__check">
          <CheckButton onPress={submit} disabled={!interactive || selected === null} />
        </span>
      </div>

      {flight ? (
        <div className="ni-cmp__flight" style={flightStyle} aria-hidden="true">
          <Glyph kind={SYMBOL_GLYPH[flight.symbol]} />
        </div>
      ) : null}
      {inviteHand}
    </div>
  );
}

export default CompareWidget;
