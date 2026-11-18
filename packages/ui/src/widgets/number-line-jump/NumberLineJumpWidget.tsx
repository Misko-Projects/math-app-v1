import { formatModel } from '@number-island/engine';
import type { ResponseValue, WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  flyFrom,
  type NumberLineMark,
  NumberLineView,
  NumberPadKeys,
  numberLineViewScale,
  type PadKey,
  padValue,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
  useWidgetRoom,
  type WidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './number-line-jump.css';

/**
 * `number-line-jump` (03 §5.5, Road Crew W1): a Pebbling hops along the Numbered Road.
 *
 * - Concrete (`path: 'stones'`): a row of numbered stepping stones. When every stone fits at the
 *   full target size, the stones are buttons: tapping a stone says its number, and tapping the
 *   stone one allowed hop away hops there. A longer road (0–22 at 960 × 600) is a picture: a
 *   window of stones that follows the hopper (the road slides on), and the hop buttons hop.
 * - Pictorial: `line` (ticks and numbers), `open` (a bare line: the child picks the jump sizes and
 *   each arc shows its size) and `timeline` (arcs labelled, minutes when `unit: 'min'`).
 *
 * The child taps a hop button (one per `allowedJumps`: the arrow points the way, the numeral is
 * the size; never colour alone) to hop, and can take back the last hop. With `thenAsk` they type
 * the landing number or the total jump on the pad. "Check" answers
 * `{ kind: 'state', value: { jumps, value? } }`, built through the format model. Any allowed path
 * to the target is fine (the checker decides; strategy freedom).
 *
 * Layout (06 §1, container-relative): the widget measures its room (`useWidgetRoom`) and takes the
 * first plan that fits: everything stacked under the road; or the pad (with the answer above it,
 * or beside the hop buttons) standing beside the road. Hop buttons wrap into rows; the pad keeps
 * full-size keys (four columns of three rows when four rows don't fit); the road takes the width
 * that is left (measured, so the line's ticks are drawn at their real size).
 *
 * Invites (03 §6.3) ring ONE enabled control and Pip's hand (kit `useInviteHand`) points at it,
 * only while the child can act: `hop {by}` the hop button; `bridge-to {at}` the hop that heads
 * there; `label-landing` and `answer {value}` the next pad key, then Check (first the hop
 * toward the target while the hopper is not there yet).
 *
 * Trace: `tap` `jump-<by>` for a hop button (e.g. `jump-1`, `jump--10`), `tap` `stone-<n>`,
 * `undo` `jump-<by>` for the hop taken back, `tap` `key-<k>` on the pad.
 *
 * Demo ops: `hop {by}`, `label-landing`, `highlight {at}`, `bridge-to {at}`, plus `answer {value}`.
 */

const OPS = ['hop', 'label-landing', 'highlight', 'bridge-to', 'answer'] as const;
const MODEL = formatModel('number-line-jump');
const HOP_MS = 460;
const KEY_MS = 320;
const LINE_MAX = 1100;
const GAP = 20;
const EDGE = 8;
/** Room above the stones for the hopper. */
const HOPPER_ROOM = 72;
/** A picture stone (not a button): big enough for a 32 px numeral. */
const PICTURE_STONE = 56;
const PICTURE_STONE_GAP = 8;
/** Width of a "the road goes on" mark at a cut end of the stones window. */
const MORE_W = 28;

type Config = ConfigFor<'number-line-jump'>;

const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

// ---------- art (original) ----------

/** The hopper: a round shore Pebbling with a pebble shell (5-grouping) and two stalk eyes. */
function Hopper() {
  return (
    <svg viewBox="-10 0 116 84" width="100%" height="100%" aria-hidden="true" focusable="false">
      <ellipse cx="48" cy="79" rx="30" ry="5" fill="rgb(38 70 83 / 0.2)" />
      {/* Little claws: a shore crab Pebbling. */}
      {[-1, 1].map((side) => (
        <g key={side} transform={side < 0 ? undefined : 'translate(96 0) scale(-1 1)'}>
          <path d="M14 56 4 48" stroke="var(--color-ink)" strokeWidth="4" strokeLinecap="round" />
          <path
            d="M-6 44a9 9 0 1 1 13 9l-4-6-5 4Z"
            fill="var(--color-coral)"
            stroke="var(--color-ink)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </g>
      ))}
      <path
        d="M26 66c-6 4-10 9-8 12M70 66c6 4 10 9 8 12"
        stroke="var(--color-ink)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M38 24 33 9M58 24l5-15"
        stroke="var(--color-ink)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle
        cx="32"
        cy="9"
        r="7"
        fill="var(--color-cloud)"
        stroke="var(--color-ink)"
        strokeWidth="3"
      />
      <circle
        cx="64"
        cy="9"
        r="7"
        fill="var(--color-cloud)"
        stroke="var(--color-ink)"
        strokeWidth="3"
      />
      <circle cx="33" cy="10" r="3" fill="var(--color-ink)" />
      <circle cx="63" cy="10" r="3" fill="var(--color-ink)" />
      <path
        d="M10 56c0-20 17-34 38-34s38 14 38 34c0 9-8 14-18 14H28c-10 0-18-5-18-14Z"
        fill="var(--color-sea)"
        stroke="var(--color-sea-dark)"
        strokeWidth="3.5"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle
          key={i}
          cx={24 + i * 12}
          cy={46}
          r={4.6}
          fill="var(--color-sunshine-light)"
          stroke="var(--color-sea-dark)"
          strokeWidth="2"
        />
      ))}
      <path
        d="M30 34c4-4 9-6 15-6.5"
        stroke="#fff"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.6"
        fill="none"
      />
      <path
        d="M40 60q8 6 16 0"
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** A hop arrow: the direction is the sign (ink on white, never colour alone). */
function HopArrow({ back }: { back: boolean }) {
  return (
    <svg viewBox="0 0 56 40" width="100%" height="100%" aria-hidden="true" focusable="false">
      <g transform={back ? 'translate(56 0) scale(-1 1)' : undefined}>
        <path
          d="M6 32C12 12 34 6 46 22"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M50 12 48 30 33 23Z"
          fill="var(--color-ink)"
          stroke="var(--color-ink)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Take back the last hop: a curling-back arrow (not a left arrow, which means a backward hop). */
function UndoIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path
        d="M14 20h17a9 9 0 0 1 0 18H22"
        stroke="var(--color-ink)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 11 10 20l10 9"
        stroke="var(--color-ink)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------- layout ----------

type PadShape = '3x4' | '4x3';

/**
 * Where the parts go. `stack`: the road, then the hop buttons, then the answer and pad (or Check)
 * under them. `side-right`: the answer above the pad, both beside the road and hop buttons.
 * `side-main`: the pad alone beside the road; the answer in the hop buttons' row. `side-col`: the
 * answer (readout over Check) and the pad side by side, beside the road.
 */
type Layout = 'stack' | 'side-right' | 'side-main' | 'side-col';

interface Plan {
  layout: Layout;
  pad: { shape: PadShape; key: number } | null;
  /**
   * `bank`: one button per allowed hop. `dial`: one hop button whose size the child steps through
   * the allowed sizes (smaller / bigger), for a long list in a short room.
   */
  hops: 'bank' | 'dial';
  /** Hop controls (and take-back) per row. */
  hopCols: number;
  /** Space between the parts (12 px in a short room, never less: 06 §4). */
  gap: number;
  /** A short room: the answer display uses its regular (not large) numerals. */
  short: boolean;
  /** The road's width in px (what is left beside the pad). */
  mainW: number;
  /** Rendered height of the plan, and whether it fits the room (with room for Pip's hand). */
  h: number;
  fits: boolean;
  /** Fits while no pad key is invited (Pip's hand under a bottom-row key needs more). */
  fitsAtRest: boolean;
}

interface Measured {
  check: { w: number; h: number };
  readout: { w: number; h: number };
}

function padBox(shape: PadShape, key: number) {
  const cols = shape === '3x4' ? 3 : 4;
  const rows = shape === '3x4' ? 4 : 3;
  return {
    w: cols * key + (cols - 1) * TARGET_GAP_PX,
    h: rows * key + (rows - 1) * TARGET_GAP_PX,
  };
}

/**
 * How far Pip's hand reaches below a bottom-row pad key's cell (kit useInviteHand: fingertip 10 px
 * up the key, the 56 px hand, its 8 px bob and 10 px edge margin, less the key's 4 px ledge).
 */
const HAND_REACH = 52;

/** The stones' size and window for a road `w` px wide. */
export function stonesFor(c: Config, w: number, target: number) {
  const count = c.max - c.min + 1;
  const full = count * target + (count - 1) * TARGET_GAP_PX;
  if (full <= w) {
    // Buttons: as big as the room allows (up to 112 px), never below the target size.
    const size = Math.max(
      target,
      Math.min(112, Math.floor((w - (count - 1) * TARGET_GAP_PX) / count)),
    );
    return { tappable: true, size, gap: TARGET_GAP_PX, window: count };
  }
  // Room at both ends for the "the road goes on" marks.
  const window = Math.max(
    3,
    Math.floor((w - 2 * MORE_W + PICTURE_STONE_GAP) / (PICTURE_STONE + PICTURE_STONE_GAP)),
  );
  return {
    tappable: false,
    size: PICTURE_STONE,
    gap: PICTURE_STONE_GAP,
    window: Math.min(count, window),
  };
}

function pathHeight(c: Config, w: number, target: number) {
  if (c.path === 'stones') return HOPPER_ROOM + stonesFor(c, w, target).size + 6;
  return headroomFor(c) + 64;
}

const headroomFor = (c: Config) => (c.path === 'open' || c.path === 'timeline' ? 132 : 104);

/** A room shorter than this gets the tight spacing and the regular answer numerals. */
const SHORT_ROOM = 420;

/**
 * The first plan that fits the room: stack; then the pad beside the road (the answer above it, in
 * the hop row, or beside it); each with the biggest pad that fits, all hop buttons before the
 * dial. Nothing fits with room for Pip's hand under the pad: the first that fits at rest; nothing
 * fits at all: the smallest (the area then scrolls; targets never shrink below the minimum).
 */
function planLayout(c: Config, room: WidgetRoom | null, age: AgeMode, m: Measured): Plan {
  const T = MIN_TARGET_PX[age];
  const big = age === 'k' ? 96 : 76;
  const roomH = room?.height ?? Number.POSITIVE_INFINITY;
  const short = roomH < SHORT_ROOM;
  const G = short ? TARGET_GAP_PX : GAP;
  const W = Math.min(room?.width ?? 1180, 1180) - 2 * EDGE;
  const H = roomH - 2 * EDGE;
  const sizes = new Set(c.allowedJumps).size;
  // Hop controls: the target's width, 18 px taller (room for Pip's fingertip), plus the ledge.
  const hopCell = { w: T, h: T + 24 };
  const hopsBox = (w: number, kind: Plan['hops']) => {
    // The dial: smaller, the hop itself, bigger; then take-back.
    const n = kind === 'dial' ? 4 : sizes + 1;
    const cols = Math.max(1, Math.min(n, Math.floor((w + TARGET_GAP_PX) / (T + TARGET_GAP_PX))));
    const rows = Math.ceil(n / cols);
    return {
      cols,
      w: cols * hopCell.w + (cols - 1) * TARGET_GAP_PX,
      h: rows * hopCell.h + (rows - 1) * TARGET_GAP_PX,
    };
  };
  const ask = c.thenAsk !== null;
  const pads: Plan['pad'][] = ask
    ? [
        { shape: '3x4', key: big },
        { shape: '3x4', key: T + 4 },
        { shape: '4x3', key: T + 4 },
      ]
    : [null];
  // The answer: the readout and Check side by side (or Check alone without a pad).
  const answerRow = ask
    ? { w: m.readout.w + G + m.check.w, h: Math.max(m.readout.h, m.check.h) }
    : { w: m.check.w, h: m.check.h };
  const answerCol = ask
    ? { w: Math.max(m.readout.w, m.check.w), h: m.readout.h + G + m.check.h }
    : answerRow;
  const plans: Plan[] = [];
  const add = (
    layout: Layout,
    pad: Plan['pad'],
    hops: Plan['hops'],
    mainW: number,
    hopCols: number,
    h: number,
    padH: number,
    ok: boolean,
  ) => {
    const withHand = Math.max(h, padH + (pad ? HAND_REACH : 0));
    plans.push({
      layout,
      pad,
      hops,
      hopCols,
      gap: G,
      short,
      mainW,
      h: withHand,
      fits: ok && withHand <= H,
      fitsAtRest: ok && h <= H,
    });
  };
  const kinds: Plan['hops'][] = sizes > 3 ? ['bank', 'dial'] : ['bank'];
  for (const kind of kinds) {
    for (const pad of pads) {
      const p = pad ? padBox(pad.shape, pad.key) : { w: 0, h: 0 };
      // stack: road; hop buttons (Check beside them without a pad); answer column beside the pad.
      {
        const mainW = W;
        const hops = hopsBox(pad ? mainW : mainW - G - answerRow.w, kind);
        const pathH = pathHeight(c, mainW, T);
        const top = pathH + G + hops.h + G;
        const h = pad
          ? top + Math.max(answerCol.h, p.h)
          : pathH + G + Math.max(hops.h, answerRow.h);
        const w = pad ? Math.max(hops.w, answerCol.w + G + p.w) : hops.w + G + answerRow.w;
        add('stack', pad, kind, mainW, hops.cols, h, pad ? top + p.h : 0, w <= W);
      }
      if (!pad) continue;
      // side-right: the answer above the pad, beside the road and the hop buttons.
      {
        const rightW = Math.max(p.w, answerRow.w);
        const mainW = W - G - rightW;
        const hops = hopsBox(mainW, kind);
        const right = answerRow.h + G + p.h;
        const h = Math.max(pathHeight(c, mainW, T) + G + hops.h, right);
        add('side-right', pad, kind, mainW, hops.cols, h, right, mainW >= 3 * T);
      }
      // side-main: the pad alone beside; the answer in the hop buttons' row.
      {
        const mainW = W - G - p.w;
        const hops = hopsBox(mainW - G - answerRow.w, kind);
        const oneRow =
          hops.cols * (T + TARGET_GAP_PX) >=
          (kind === 'dial' ? 4 : sizes + 1) * (T + TARGET_GAP_PX);
        const h = Math.max(pathHeight(c, mainW, T) + G + Math.max(hops.h, answerRow.h), p.h);
        add(
          'side-main',
          pad,
          kind,
          mainW,
          hops.cols,
          h,
          p.h,
          mainW - G - answerRow.w >= T && oneRow,
        );
      }
      // side-col: the answer column and the pad side by side, beside the road.
      {
        const mainW = W - G - answerCol.w - G - p.w;
        const hops = hopsBox(mainW, kind);
        const h = Math.max(pathHeight(c, mainW, T) + G + hops.h, answerCol.h, p.h);
        add('side-col', pad, kind, mainW, hops.cols, h, p.h, mainW >= 3 * T);
      }
    }
  }
  // Preference: all hop buttons before the dial; then stack, side-right, side-main, side-col;
  // then the biggest pad (the plans were made in pad order, and the sort is stable).
  const rank = (p: Plan) =>
    (p.hops === 'dial' ? 10 : 0) +
    ['stack', 'side-right', 'side-main', 'side-col'].indexOf(p.layout);
  plans.sort((a, b) => rank(a) - rank(b));
  return (
    plans.find((p) => p.fits) ??
    plans.find((p) => p.fitsAtRest) ??
    plans.reduce((a, b) => (b.h < a.h ? b : a), plans[0] as Plan)
  );
}

/** Width of an element's content box: after every render and whenever it resizes. */
function useWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [w, setW] = useState<number | null>(null);
  const measure = useRef(() => {});
  measure.current = () => {
    const el = ref.current;
    if (!el) return;
    const next = Math.floor(el.clientWidth);
    setW((prev) => (prev === next ? prev : next));
  };
  useLayoutEffect(() => measure.current());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** The border-box size of an element (fixed-size controls), measured once laid out. */
function useBoxSize(ref: RefObject<HTMLElement | null>, fallback: { w: number; h: number }) {
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.ceil(r.width);
      const h = Math.ceil(r.height);
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Where an invite points: one pressable control. */
type Cue =
  | { at: 'hop'; by: number }
  | { at: 'dial'; dir: 'smaller' | 'bigger' }
  | { at: 'key'; key: PadKey }
  | { at: 'check' };

function cueTarget(root: HTMLElement, cue: Cue): HTMLElement | null {
  switch (cue.at) {
    case 'hop':
      return (
        [...root.querySelectorAll<HTMLElement>('.ni-nlj__jump')].find(
          (b) => b.dataset.by === String(cue.by),
        ) ?? null
      );
    case 'dial':
      return (
        [...root.querySelectorAll<HTMLElement>('.ni-nlj__dialstep')].find(
          (b) => b.dataset.dir === cue.dir,
        ) ?? null
      );
    case 'key':
      return (
        [...root.querySelectorAll<HTMLElement>('.ni-pad__key')].find(
          (k) => k.dataset.key === cue.key,
        ) ?? null
      );
    case 'check':
      return root.querySelector<HTMLElement>('.ni-nlj__check .ni-btn');
  }
}

const cueKeyOf = (cue: Cue | null) => {
  if (cue === null) return '';
  if (cue.at === 'hop') return `hop:${cue.by}`;
  if (cue.at === 'dial') return `dial:${cue.dir}`;
  if (cue.at === 'key') return `key:${cue.key}`;
  return 'check';
};

// ---------- the widget ----------

export function NumberLineJumpWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { sayNumber } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const c = config;
  const stones = c.path === 'stones';
  const T = MIN_TARGET_PX[ageMode];

  const [hops, setHops] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [flight, setFlight] = useState<DOMRect | null>(null);
  const hopsRef = useRef(hops);
  hopsRef.current = hops;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const hopperRef = useRef<HTMLDivElement | null>(null);
  const checkRef = useRef<HTMLSpanElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);

  const interactive = !disabled && !demoBusy;
  const position = c.start + hops.reduce((a, b) => a + b, 0);
  // Backward hops on the left (largest first), forward hops on the right: like the line itself.
  const allowed = [...new Set(c.allowedJumps)].sort((a, b) => a - b);
  // The dial's sizes, smallest hop first.
  const dialSizes = [...allowed].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
  const [dialIdx, setDialIdx] = useState(0);
  const dialBy = dialSizes[Math.min(dialIdx, dialSizes.length - 1)] ?? 1;
  const maxDigits = String(Math.max(Math.abs(c.min), Math.abs(c.max), c.max - c.min)).length;
  const canHop = (by: number, from = position) =>
    by !== 0 && from + by >= c.min && from + by <= c.max;

  // ---------- layout ----------

  const room = useWidgetRoom(rootRef);
  const check = useBoxSize(checkRef, {
    w: ageMode === 'k' ? 96 : 180,
    h: ageMode === 'k' ? 102 : 82,
  });
  const readout = useBoxSize(readoutRef, { w: 150, h: 96 });
  const plan = planLayout(c, room, ageMode, { check, readout });
  const laneW = useWidth(laneRef) ?? plan.mainW;
  const roadW = Math.max(3 * T, Math.min(LINE_MAX, laneW));

  // ---------- hopping ----------

  const hop = (by: number) => {
    const from = hopperRef.current?.getBoundingClientRect() ?? null;
    const next = [...hopsRef.current, by];
    hopsRef.current = next;
    setHops(next);
    setFlight(reduced ? null : from);
    return c.start + next.reduce((a, b) => a + b, 0);
  };

  const childHop = (by: number, target: string) => {
    if (!interactive || !canHop(by)) return;
    trace('tap', target);
    setHighlight(null);
    const landed = hop(by);
    if (speakOnTap) sayNumber(landed);
  };

  const undo = () => {
    if (!interactive) return;
    const last = hopsRef.current.at(-1);
    if (last === undefined) return;
    trace('undo', `jump-${last}`);
    const from = hopperRef.current?.getBoundingClientRect() ?? null;
    const next = hopsRef.current.slice(0, -1);
    hopsRef.current = next;
    setHops(next);
    setFlight(reduced ? null : from);
  };

  const tapStone = (n: number) => {
    if (!interactive) return;
    const by = n - position;
    if (by !== 0 && c.allowedJumps.includes(by)) {
      childHop(by, `stone-${n}`);
      return;
    }
    trace('tap', `stone-${n}`);
    if (speakOnTap) sayNumber(n);
  };

  // Fly the hopper from where it was drawn to where it is drawn now.
  useLayoutEffect(() => {
    const el = hopperRef.current;
    if (!el || !flight) return;
    setFlight(null);
    void flyFrom(el, flight, { ms: HOP_MS, lift: stones ? 70 : 56 });
  });

  // ---------- typing ----------

  const onKey = (key: PadKey) => {
    if (!interactive) return;
    trace('tap', `key-${key}`);
    setTyped((prev) => applyPadKey(prev, key, maxDigits));
  };
  const typedValue = padValue(typed);

  // ---------- check (through the format model) ----------

  const response = (): ResponseValue | null => {
    if (!MODEL) return null;
    let s = MODEL.initialState(c);
    for (const by of hops) s = MODEL.apply(s, { op: 'hop', args: { by } });
    if (typedValue !== null) s = MODEL.apply(s, { op: 'answer', args: { value: typedValue } });
    return MODEL.toResponse(s);
  };
  const ready = hops.length > 0 && (c.thenAsk === null || typedValue !== null);
  // One debounce for every way to submit (Check button, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive || !ready) return false;
    const r = response();
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const num = (a: WidgetAction, key: string) => {
    const v = a.args?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const typeValue = async (v: number) => {
    const chars = String(Math.abs(v)).split('') as PadKey[];
    let text = '';
    setTyped('');
    for (const ch of chars) {
      setPressedKey(ch);
      await pause(reduced ? 0 : KEY_MS);
      if (!alive.current) return;
      text = applyPadKey(text, ch, maxDigits);
      setTyped(text);
    }
    setPressedKey(null);
    // Let the last digit show before the op resolves.
    await pause(reduced ? 0 : KEY_MS);
  };

  const currentPosition = () => c.start + hopsRef.current.reduce((a, b) => a + b, 0);
  /** The landing number or total jump the child is asked for, as things stand. */
  const askedValue = (jumps: number[]) => {
    const total = jumps.reduce((a, b) => a + b, 0);
    return c.thenAsk === 'total-jump' ? Math.abs(total) : c.start + total;
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      try {
        if (action.op === 'hop' || action.op === 'bridge-to') {
          const at = num(action, 'at');
          const by =
            action.op === 'hop' ? num(action, 'by') : at === null ? null : at - currentPosition();
          if (by === null || !canHop(by, currentPosition())) return;
          setHighlight(null);
          const k = dialSizes.indexOf(by);
          if (k >= 0) setDialIdx(k);
          const landed = hop(by);
          await pause(reduced ? 0 : HOP_MS);
          if (!alive.current) return;
          sayNumber(landed);
          await pause(reduced ? 0 : 220);
        } else if (action.op === 'highlight') {
          const at = num(action, 'at');
          if (at === null) return;
          setHighlight(at);
          sayNumber(at);
          await pause(reduced ? 0 : 1000);
        } else if (action.op === 'label-landing') {
          const value = askedValue(hopsRef.current);
          await typeValue(value);
          if (alive.current) sayNumber(value);
        } else if (action.op === 'answer') {
          const v = num(action, 'value');
          if (v !== null) await typeValue(v);
        }
      } finally {
        if (alive.current) {
          setPressedKey(null);
          setDemoBusy(false);
        }
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- the invite: ONE enabled control, only while the child can act ----------

  /** The hop that heads from here toward `at`: the biggest allowed one that does not overshoot. */
  const hopToward = (at: number): number | null => {
    const gap = at - position;
    if (gap === 0) return null;
    const fits = allowed.filter(
      (by) => Math.sign(by) === Math.sign(gap) && Math.abs(by) <= Math.abs(gap),
    );
    const by = fits.sort((a, b) => Math.abs(b) - Math.abs(a))[0];
    return by !== undefined && canHop(by) ? by : null;
  };
  /** The control that hops by `by`: its button, or (dial) the step toward that size first. */
  const hopCue = (by: number): Cue => {
    if (plan.hops !== 'dial' || by === dialBy) return { at: 'hop', by };
    const want = dialSizes.indexOf(by);
    return { at: 'dial', dir: want > dialIdx ? 'bigger' : 'smaller' };
  };
  const cue: Cue | null = (() => {
    if (!invite || !interactive) return null;
    const checkCue: Cue | null = ready ? { at: 'check' } : null;
    const valueCue = (want: number | null): Cue | null => {
      if (c.thenAsk === null) return checkCue;
      const text = want === null ? null : String(Math.abs(want));
      if (text === null || typed === text) return checkCue;
      if (text.startsWith(typed)) return { at: 'key', key: text[typed.length] as PadKey };
      return { at: 'key', key: 'back' };
    };
    switch (invite.op) {
      case 'hop': {
        const by = num(invite, 'by');
        return by !== null && allowed.includes(by) && canHop(by) ? hopCue(by) : null;
      }
      case 'bridge-to': {
        const at = num(invite, 'at');
        const by = at === null ? null : hopToward(at);
        return by === null ? null : hopCue(by);
      }
      case 'label-landing':
        return hops.length === 0 ? null : valueCue(askedValue(hops));
      case 'answer': {
        // First the hops toward the target, then the value.
        if (c.target !== undefined && position !== c.target) {
          const by = hopToward(c.target);
          if (by !== null) return hopCue(by);
        }
        if (hops.length === 0) return null;
        return valueCue(num(invite, 'value'));
      }
      default:
        return null;
    }
  })();
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => (cue ? cueTarget(root, cue) : null),
    cue ? `${cueKeyOf(cue)}|${plan.layout}|${plan.hops}|${plan.hopCols}|${roadW}` : '',
  );

  // ---------- render ----------

  const invitedSpot = highlight;

  let path: ReactNode;
  if (stones) {
    const fit = stonesFor(c, roadW, T);
    const values: number[] = [];
    for (let v = c.min; v <= c.max; v++) values.push(v);
    // The window of stones shown: all of them, or a stretch that follows the hopper (one stone of
    // road kept ahead of it in the way it hops, when the road goes on).
    const n = fit.window;
    const ahead = allowed.some((b) => b < 0) && !allowed.some((b) => b > 0) ? -1 : 1;
    let first = c.min;
    if (n < values.length) {
      const want = ahead > 0 ? position - 1 : position - n + 2;
      first = Math.max(c.min, Math.min(c.max - n + 1, want));
    }
    const pitch = fit.size + fit.gap;
    const rowW = values.length * pitch - fit.gap;
    const windowW = n * pitch - fit.gap;
    const offset = (first - c.min) * pitch;
    const hopperX = (position - c.min) * pitch + fit.size / 2 - offset;
    path = (
      // biome-ignore lint/a11y/useSemanticElements: a row of stones with an overlay, not a form group
      <div
        className="ni-nlj__stones"
        role="group"
        aria-label={t('ui.nlj.path')}
        data-tappable={fit.tappable ? 'true' : 'false'}
        data-first={first}
        data-window={n}
        style={
          {
            width: windowW,
            height: HOPPER_ROOM + fit.size + 6,
            '--stone': `${fit.size}px`,
            '--stone-gap': `${fit.gap}px`,
          } as CSSProperties
        }
      >
        {first > c.min ? (
          <span className="ni-nlj__more" data-side="start" aria-hidden="true" />
        ) : null}
        {first + n - 1 < c.max ? (
          <span className="ni-nlj__more" data-side="end" aria-hidden="true" />
        ) : null}
        <div className="ni-nlj__window">
          <div
            className="ni-nlj__road"
            style={{ width: rowW, transform: `translateX(${-offset}px)` }}
          >
            {values.map((v) => {
              const visible = v >= first && v < first + n;
              const common = {
                className: 'ni-nlj__stone',
                'data-stone': v,
                'data-start': v === c.start ? 'true' : undefined,
                'data-here': v === position ? 'true' : undefined,
                'data-highlight': highlight === v ? 'true' : undefined,
              };
              return fit.tappable ? (
                <button
                  key={v}
                  type="button"
                  {...common}
                  aria-label={v === position ? t('ui.nlj.hopper', { n: v }) : String(v)}
                  aria-current={v === position ? 'true' : undefined}
                  disabled={!interactive}
                  onClick={() => tapStone(v)}
                >
                  <span className="ni-nlj__stonenum" aria-hidden="true">
                    {v}
                  </span>
                </button>
              ) : (
                <span key={v} {...common} aria-hidden={visible ? undefined : true}>
                  <span className="ni-nlj__stonenum">{v}</span>
                </span>
              );
            })}
          </div>
        </div>
        <div
          ref={hopperRef}
          className="ni-nlj__hopper"
          data-path="stones"
          role="img"
          aria-label={t('ui.nlj.hopper', { n: position })}
          style={{ left: hopperX }}
        >
          <Hopper />
        </div>
      </div>
    );
  } else {
    const open = c.path === 'open';
    const labelArcs = open || c.path === 'timeline';
    const headroom = headroomFor(c);
    const jumps: { from: number; to: number }[] = [];
    let p = c.start;
    for (const by of hops) {
      jumps.push({ from: p, to: p + by });
      p += by;
    }
    // An open line has no scale to keep: it shows just the stretch the hops need (start, target
    // and every landing, with room around them), so small hops stay big enough to see.
    let viewMin = c.min;
    let viewMax = c.max;
    if (open) {
      const seen = [c.start, c.target ?? c.start, ...jumps.map((j) => j.to)];
      const lo = Math.min(...seen);
      const hi = Math.max(...seen);
      const pad = Math.max(2, Math.ceil((hi - lo) * 0.15));
      viewMin = Math.max(c.min, lo - pad);
      viewMax = Math.min(c.max, hi + pad);
    }
    const scale = numberLineViewScale({ min: viewMin, max: viewMax, width: roadW, headroom });
    const marks: NumberLineMark[] = [{ at: c.start }];
    if (highlight !== null) marks.push({ at: highlight, arrow: true });
    const unit = c.unit === 'min' ? ' min' : '';
    path = (
      <div
        className="ni-nlj__line"
        data-line-width={roadW}
        data-view-min={viewMin}
        data-view-max={viewMax}
        data-headroom={headroom}
        style={{ width: roadW, height: headroom + 64 }}
      >
        <NumberLineView
          min={viewMin}
          max={viewMax}
          ticksEvery={open ? null : c.ticksEvery}
          labelsEvery={open ? null : c.labelsEvery}
          marks={marks}
          jumps={jumps}
          width={roadW}
          headroom={headroom}
          label={t('ui.nlj.path')}
        >
          {(s) => (
            <>
              {open ? (
                <text
                  className="ni-numberline__numeral"
                  x={s.x(c.start)}
                  y={s.lineY + 18 + 40 * 0.9}
                  fontSize={40}
                  textAnchor="middle"
                >
                  {c.start}
                </text>
              ) : null}
              {labelArcs
                ? jumps.map((j, i) => {
                    const dx = Math.abs(s.x(j.to) - s.x(j.from));
                    const h = Math.min(70, 18 + dx * 0.35);
                    const text = `${signed(j.to - j.from)}${unit}`;
                    // Numerals stay 32 px: an arc too narrow for its label goes unlabelled
                    // rather than overprinting its neighbours.
                    if (dx < text.length * 19 + 10) return null;
                    return (
                      <text
                        // biome-ignore lint/suspicious/noArrayIndexKey: hops are positional
                        key={i}
                        className="ni-nlj__arclabel"
                        x={(s.x(j.from) + s.x(j.to)) / 2}
                        y={s.lineY - 14 - h}
                        fontSize={32}
                        textAnchor="middle"
                      >
                        {text}
                      </text>
                    );
                  })
                : null}
              {invitedSpot !== null ? (
                <circle className="ni-nlj__spot" cx={s.x(invitedSpot)} cy={s.lineY} r={26} />
              ) : null}
            </>
          )}
        </NumberLineView>
        <div
          ref={hopperRef}
          className="ni-nlj__hopper"
          data-path="line"
          role="img"
          aria-label={t('ui.nlj.hopper', { n: position })}
          style={{ left: scale.x(position), top: scale.lineY }}
        >
          <Hopper />
        </div>
      </div>
    );
  }

  const hopButton = (by: number) => {
    const back = by < 0;
    const label = back ? t('ui.nlj.hop-back', { n: Math.abs(by) }) : t('ui.nlj.hop', { n: by });
    const invited = cue?.at === 'hop' && cue.by === by;
    return (
      <button
        key={by}
        type="button"
        className={['ni-nlj__jump', invited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        data-by={by}
        data-blocked={canHop(by) ? undefined : 'true'}
        aria-label={label}
        disabled={!canHop(by)}
        onClick={() => childHop(by, `jump-${by}`)}
      >
        <span className="ni-nlj__jumparrow" data-back={back ? 'true' : undefined}>
          <HopArrow back={back} />
        </span>
        <span className="ni-nlj__jumpnum ni-btn__label" aria-hidden="true">
          {Math.abs(by)}
        </span>
      </button>
    );
  };
  const stepDial = (dir: 'smaller' | 'bigger') => {
    if (!interactive) return;
    const next = Math.max(0, Math.min(dialSizes.length - 1, dialIdx + (dir === 'bigger' ? 1 : -1)));
    const by = dialSizes[next];
    if (by === undefined || next === dialIdx) return;
    trace('tap', `hop-${dir}`);
    setDialIdx(next);
    if (speakOnTap) sayNumber(Math.abs(by));
  };
  const dialStep = (dir: 'smaller' | 'bigger') => (
    <button
      key={dir}
      type="button"
      className={[
        'ni-nlj__jump',
        'ni-nlj__dialstep',
        cue?.at === 'dial' && cue.dir === dir ? 'ni-invite' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-dir={dir}
      aria-label={t(dir === 'bigger' ? 'ui.nlj.bigger' : 'ui.nlj.smaller')}
      disabled={dir === 'bigger' ? dialIdx >= dialSizes.length - 1 : dialIdx <= 0}
      onClick={() => stepDial(dir)}
    >
      <span className="ni-nlj__dialicon ni-btn__icon" data-dir={dir} aria-hidden="true" />
    </button>
  );

  const hopButtons = (
    <fieldset
      className="ni-nlj__jumps"
      data-kind={plan.hops}
      aria-label={t('ui.nlj.jumps')}
      disabled={!interactive}
      style={{ gridTemplateColumns: `repeat(${plan.hopCols}, var(--target-min))` }}
    >
      {plan.hops === 'dial'
        ? [dialStep('smaller'), hopButton(dialBy), dialStep('bigger')]
        : allowed.map(hopButton)}
      <button
        type="button"
        className="ni-nlj__jump ni-nlj__undo"
        aria-label={t('ui.nlj.undo')}
        disabled={hops.length === 0}
        onClick={undo}
      >
        <span className="ni-nlj__undoicon ni-btn__icon">
          <UndoIcon />
        </span>
      </button>
    </fieldset>
  );

  const checkEl = (
    <span ref={checkRef} className="ni-nlj__check">
      <CheckButton
        onPress={submit}
        disabled={!interactive || !ready}
        invited={cue?.at === 'check'}
        compact={plan.short}
      />
    </span>
  );

  // The answer (readout and Check, or Check alone): in the hop buttons' row (no pad, or the pad
  // alone beside the road), else above the pad (side) or beside it (stack, readout over Check).
  const answerInRow = plan.pad === null || plan.layout === 'side-main';
  const answer = (
    <div
      className="ni-nlj__answer"
      data-dir={
        (plan.layout === 'stack' && plan.pad) || plan.layout === 'side-col' ? 'column' : 'row'
      }
    >
      {c.thenAsk !== null ? (
        <span ref={readoutRef} className="ni-nlj__readout">
          <NumberDisplay
            value={typed === '' ? null : typed}
            digits={Math.min(2, maxDigits)}
            size={plan.short ? undefined : 'lg'}
            state={interactive && hops.length > 0 ? 'active' : 'idle'}
            label="ui.widget.answer"
            speakOnTap={false}
          />
        </span>
      ) : null}
      {checkEl}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="ni-nlj"
      data-tier={tier}
      data-path={c.path}
      data-ask={c.thenAsk ?? 'none'}
      data-layout={plan.layout}
      data-hops={plan.hops}
      data-pad-shape={plan.pad?.shape}
      data-fits={plan.fits ? 'true' : plan.fitsAtRest ? 'at-rest' : 'false'}
      data-disabled={disabled ? 'true' : undefined}
      style={
        {
          '--pad-key': plan.pad ? `${plan.pad.key}px` : undefined,
          '--nlj-gap': `${plan.gap}px`,
          ...handRootStyle,
        } as CSSProperties
      }
    >
      <div className="ni-nlj__main">
        <div ref={laneRef} className="ni-nlj__lane">
          {path}
        </div>
        <div className="ni-nlj__row">
          {hopButtons}
          {answerInRow ? answer : null}
        </div>
      </div>
      {!answerInRow || plan.pad ? (
        <div className="ni-nlj__entry" data-dir={plan.layout === 'side-right' ? 'column' : 'row'}>
          {answerInRow ? null : answer}
          {plan.pad ? (
            <div className="ni-nlj__padcell">
              <NumberPadKeys
                onKey={onKey}
                onEnter={submit}
                disabled={!interactive}
                highlighted={pressedKey ?? (cue?.at === 'key' ? cue.key : null)}
                shape={plan.pad.shape}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {inviteHand}
    </div>
  );
}

export default NumberLineJumpWidget;
