import { formatModel } from '@number-island/engine';
import type { ResponseValue, WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
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
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { type AgeMode, MIN_TARGET_PX } from '../../tokens/tokens';
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
  PickCard,
  padValue,
  stepsBetween,
  useAlive,
  useCommitBarrier,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
  useWidgetRoom,
  type WidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './number-line-place.css';

/**
 * `number-line-place` (03 §5.5, Treasure Beach W4): a number line and one of three asks.
 *
 * - `place`: a flag carrying the target number waits in its sand dock. The child drags it onto the
 *   line (mouse, touch or pen), taps a spot on the line (tap-to-place, with or without picking the
 *   flag up first), or uses the keyboard (Enter on the flag or Tab to the line, arrows move a ghost
 *   pin by a tick or 1% of the line, Enter plants the flag). With `snap: 'tick'` it lands on the
 *   nearest tick. "Check" answers `{ kind: 'placement', value }` (config units: hundredths with
 *   `valueScale: 100`).
 * - `read`: an arrow points at a spot; the child types its number on the pad → `number`.
 * - `closer`: the target sits between two benchmarks; the child picks one → `choice` `b0` | `b1`.
 *
 * The widget never shows how close a placement is: the engine reports closeness, and the workshop
 * shows hot/cold after the check. `vertical: true` draws a thermometer-like upright line.
 *
 * Layout (06 §1, container-relative): the widget measures its room (`useWidgetRoom`). With room
 * to spare the line runs across the top with the controls under it (`stack`); in a short room
 * (960 × 600 leaves 852 × 319) the controls stand beside the line (`side`: the flag's dock on the
 * left, Check on the right; the pad on the right in `read`). The line takes whatever width is left
 * (measured, so its ticks and numerals are drawn at their real pixel size); the pad keeps full-size
 * keys and turns into four columns of three rows when four rows would not fit.
 *
 * Invites (03 §6.3) ring ONE enabled control and Pip's hand (kit `useInviteHand`) points at it,
 * only while the child can act: in `place` every op invites the flag (the child's step is always
 * to plant it), then Check once an `answer` value is planted; in `read` the next pad key (minus
 * first below zero), then Check; in `closer` the benchmark card, then Check.
 *
 * Demo ops: `drop {at}`, `show-tick {at}`, `count-ticks {from, to}`, `zoom {from, to}`, `answer`.
 */

const OPS = ['drop', 'show-tick', 'count-ticks', 'zoom', 'answer'] as const;
const MODEL = formatModel('number-line-place');
const FLY_MS = 620;
const COUNT_MS = 520;
const KEY_MS = 320;

type Config = ConfigFor<'number-line-place'>;
type MarkerId = 'marker';
type TargetId = 'line';

/** The longest line worth drawing, and the shortest the widget accepts, in px. */
const LINE_MAX = 1040;
const LINE_MIN = 360;
const TALL_MAX = 470;
const TALL_MIN = 280;
const VERTICAL_W = 330;
/** Space between the widget's parts and around them, in px (06 §4: ≥ 12 between targets). */
const GAP = 24;
const PAD_EDGE = 4;

// ---------- layout ----------

type Layout = 'stack' | 'side';

interface Plan {
  layout: Layout;
  /** The number pad (read mode): its shape and key cell size (a key is 4 px shorter: its ledge). */
  pad: { shape: '3x4' | '4x3'; key: number };
  /** Height of an upright line's stage. */
  tall: number;
  /**
   * Extra room above a place line, so the widget uses the area (≥ 60 % of it, 06 §2): the line's
   * drop zone grows with it, so a taller stage is also a bigger target for the flag.
   */
  extraHead: number;
}

/** Rendered sizes of the kit controls per age mode (06 §4; primitives.css / kit.css). */
function sizes(age: AgeMode) {
  const target = MIN_TARGET_PX[age];
  const big = age === 'k' ? 96 : 76;
  return {
    target,
    big,
    /** CheckButton (BigButton plus its 6 px ledge). */
    checkH: big + 6,
    /** The flag's dock: the flag (sign, post, pin) in a sand box. */
    dockH: target + 104,
    /** A benchmark card (closer). */
    cardH: Math.round(target * 1.4),
    /** The answer display. */
    readoutH: big + 6,
  };
}

/** The flag above the line: sign, post and pin, plus room for its rings. */
const headroomFor = (c: Config, target: number) =>
  c.mode === 'place' ? target + 48 + 16 : c.mode === 'closer' ? 92 : 92;
/** Below the line: the numerals (or the end numbers of an estimation line). */
const BELOW = 64;

/**
 * Rows of pad keys are 26 px apart (not 12): Pip's hand under a key then hangs clear of the digit
 * on the key below it.
 */
const PAD_ROW_GAP = 26;
/**
 * The pad's digit size for its key: small enough that Pip's hand, lowered to clear the invited
 * key's own digit, still hangs clear of the digit on the key below (never under 32 px).
 */
const padDigit = (key: number) =>
  key >= 96 ? undefined : key >= 84 ? '44px' : key >= 76 ? '40px' : '32px';

function padSize(shape: '3x4' | '4x3', key: number) {
  const cols = shape === '3x4' ? 3 : 4;
  const rows = shape === '3x4' ? 4 : 3;
  return { w: cols * key + (cols - 1) * 12, h: rows * key + (rows - 1) * PAD_ROW_GAP };
}

/**
 * Stack when everything fits under the line; otherwise side by side. The pad keeps the big keys
 * when they fit the room's height, else the minimum (plus the key's 4 px ledge), else 4 × 3.
 */
function planLayout(c: Config, room: WidgetRoom | null, age: AgeMode): Plan {
  const s = sizes(age);
  const H = (room?.height ?? Number.POSITIVE_INFINITY) - 2 * PAD_EDGE;
  const stageH = headroomFor(c, s.target) + BELOW;
  const minKey = s.target + 4;
  const pick = (avail: number): Plan['pad'] => {
    if (padSize('3x4', s.big).h <= avail) return { shape: '3x4', key: s.big };
    if (padSize('3x4', minKey).h <= avail) return { shape: '3x4', key: minKey };
    return { shape: '4x3', key: minKey };
  };
  let stackH: number;
  if (c.mode === 'place') stackH = stageH + GAP + Math.max(s.dockH, s.checkH);
  else if (c.mode === 'closer') stackH = stageH + GAP + Math.max(s.cardH, s.checkH);
  else stackH = stageH + GAP + s.readoutH + GAP + padSize('3x4', s.big).h;
  const vertical = c.vertical;
  const tall = Math.max(TALL_MIN, Math.min(TALL_MAX, Number.isFinite(H) ? H : TALL_MAX));
  const grow = (natural: number) =>
    c.mode === 'place' && !vertical && Number.isFinite(H)
      ? Math.max(0, Math.round(FILL * H - natural))
      : 0;
  if (!vertical && stackH <= H) {
    return { layout: 'stack', pad: pick(H), tall, extraHead: grow(stackH) };
  }
  // Side by side: the pad has the room's full height (read), next to the line and its readout.
  return {
    layout: 'side',
    pad: pick(H),
    tall,
    extraHead: grow(Math.max(stageH, s.dockH, s.checkH)),
  };
}

/** The share of the room's height a place line's widget grows to (06 §2: the area is used). */
const FILL = 0.68;

/**
 * Width of an element's content box, kept up to date (null until measured). Measured after every
 * render (a layout change re-plans the grid before paint) and whenever the element resizes.
 */
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

// ---------- geometry: horizontal (kit NumberLineView) or vertical (thermometer) ----------

interface Point {
  x: number;
  y: number;
}

interface LineGeo {
  vertical: boolean;
  width: number;
  height: number;
  /** Stage px of a value on the line. */
  at: (v: number) => Point;
  /** The value under a stage point (unclamped). */
  valueAt: (p: Point) => number;
  /** Px between two values along the line. */
  span: (a: number, b: number) => number;
}

function horizontalGeo(c: Config, width: number, headroom: number, fmt: Fmt): LineGeo {
  const s = numberLineViewScale({ min: c.min, max: c.max, width, format: fmt, headroom });
  return {
    vertical: false,
    width,
    height: headroom + BELOW,
    at: (v) => ({ x: s.x(v), y: s.lineY }),
    valueAt: (p) => s.value(p.x),
    span: (a, b) => Math.abs(s.x(b) - s.x(a)),
  };
}

const V_PAD = 40;
const V_AXIS_X = 170;

function verticalGeo(c: Config, tall: number): LineGeo {
  const inner = tall - 2 * V_PAD;
  const range = c.max - c.min || 1;
  const y = (v: number) => V_PAD + ((c.max - v) / range) * inner;
  return {
    vertical: true,
    width: VERTICAL_W,
    height: tall,
    at: (v) => ({ x: V_AXIS_X, y: y(v) }),
    valueAt: (p) => c.max - ((p.y - V_PAD) / inner) * range,
    span: (a, b) => Math.abs(y(b) - y(a)),
  };
}

type Fmt = (v: number) => string;

/** How a config value is written: hundredths as decimals (DEC.03), a real minus sign. */
function formatter(c: Config): Fmt {
  return (v) => {
    const shown = c.valueScale === 100 ? Number((v / 100).toFixed(2)) : Number(v.toFixed(6));
    return shown < 0 ? `−${Math.abs(shown)}` : String(shown);
  };
}

/** The resolution a free (unsnapped) placement is rounded to: about 1/100 of the line. */
function resolution(c: Config): number {
  const span = Math.max(1e-6, c.max - c.min);
  return 10 ** Math.floor(Math.log10(span / 100) + 1e-9);
}

function roundTo(v: number, step: number) {
  return Number((Math.round(v / step) * step).toFixed(6));
}

/** Where a drop at `at` lands, through the format model (snapping and clamping live there). */
function landing(c: Config, at: number): number {
  if (!MODEL) return at;
  // Snap the RAW value: rounding first could move it across the halfway point between two ticks
  // (5.25 on a line by tens would round to 5, a tie, and snap down to 0 instead of up to 10). A
  // free placement (no snapping) is rounded to the line's resolution after the model clamps it.
  const drop = (v: number) => {
    const st = MODEL.apply(MODEL.initialState({ ...c, mode: 'place' }), {
      op: 'drop',
      args: { at: v },
    });
    const r = MODEL.toResponse(st);
    return r?.kind === 'placement' ? r.value : v;
  };
  if (c.snap === 'tick' && c.ticksEvery !== null) return drop(at);
  return drop(roundTo(drop(at), resolution(c)));
}

/**
 * What the pad shows for a value (no sign): the exact decimal, with as many places as it has
 * (0.125 → "0.125", 13 → "13"), never rounded to hundredths. The same text a demo types and an
 * invite asks for, so its digits are the keys to press.
 */
const padText = (shown: number) => String(Number(Math.abs(shown).toFixed(6)));

/** Decimal places of a number as written (0.25 → 2), at 6-decimal precision. */
const decimalsOf = (v: number) => {
  const text = String(Number(v.toFixed(6)));
  const i = text.indexOf('.');
  return i < 0 ? 0 : text.length - i - 1;
};

/** Numbers drawn on an upright line: an even stride, so the pattern stays regular. */
function verticalLabels(c: Config, geo: LineGeo): number[] {
  const every = c.labelsEvery;
  const base = every ? stepsBetween(c.min, c.max, every) : [];
  if (base.length < 2 || !every) return [c.min, c.max];
  const gap = geo.span(c.min, c.min + every);
  const stride = [1, 2, 5, 10, 20, 50, 100].find((k) => gap * k >= 40) ?? 100;
  const unit = every * stride;
  return base.filter((v) => Math.abs(v / unit - Math.round(v / unit)) < 1e-6);
}

// ---------- the flag marker (original art: a sunshine sign on a driftwood post) ----------

function FlagSign({ text, vertical }: { text: string; vertical: boolean }) {
  return (
    <span className="ni-nlp__flag" data-orient={vertical ? 'v' : 'h'} aria-hidden="true">
      <span className="ni-nlp__sign">
        <span className="ni-nlp__shell" />
        <span className="ni-nlp__numeral">{text}</span>
      </span>
      <span className="ni-nlp__post">
        <span className="ni-nlp__pin" />
      </span>
    </span>
  );
}

// ---------- the vertical line (thermometer-like) ----------

function VerticalLine({
  c,
  geo,
  fmt,
  labels,
  children,
}: {
  c: Config;
  geo: LineGeo;
  fmt: Fmt;
  labels: number[];
  children?: ReactNode;
}) {
  const top = geo.at(c.max);
  const bottom = geo.at(c.min);
  const ticks = stepsBetween(c.min, c.max, c.ticksEvery);
  return (
    <svg
      className="ni-numberline ni-nlp__vline"
      width={geo.width}
      height={geo.height}
      viewBox={`0 0 ${geo.width} ${geo.height}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* Thermometer bulb and tube behind the axis (cloud glass, ink outline). */}
      <rect
        className="ni-nlp__tube"
        x={V_AXIS_X - 16}
        y={top.y - 26}
        width={32}
        height={bottom.y - top.y + 40}
        rx={16}
      />
      <circle className="ni-nlp__tube" cx={V_AXIS_X} cy={bottom.y + 18} r={20} />
      <line
        className="ni-numberline__axis"
        x1={V_AXIS_X}
        x2={V_AXIS_X}
        y1={top.y - 18}
        y2={bottom.y + 8}
      />
      {ticks.map((v) => (
        <line
          key={`t${v}`}
          className="ni-numberline__tick"
          x1={V_AXIS_X + 18}
          x2={V_AXIS_X + 34}
          y1={geo.at(v).y}
          y2={geo.at(v).y}
        />
      ))}
      {labels.map((v) => (
        <text
          key={`l${v}`}
          className="ni-numberline__numeral"
          x={V_AXIS_X + 42}
          y={geo.at(v).y + 12}
          fontSize={32}
          textAnchor="start"
        >
          {fmt(v)}
        </text>
      ))}
      {children}
    </svg>
  );
}

// ---------- the widget ----------

interface Counting {
  ticks: number[];
  shown: number;
  /** Numbered bubbles over the ticks while the count runs. */
  bubbles: boolean;
}

/** Where an invite points: one pressable control. */
type Cue =
  | { at: 'marker' }
  | { at: 'check' }
  | { at: 'key'; key: PadKey }
  | { at: 'minus' }
  | { at: 'bench'; id: 'b0' | 'b1' };

/** The pressable element a cue points at (found by dataset, never a selector built from data). */
function cueTarget(root: HTMLElement, cue: Cue): HTMLElement | null {
  switch (cue.at) {
    case 'marker':
      return root.querySelector<HTMLElement>('.ni-nlp__marker');
    case 'check':
      return root.querySelector<HTMLElement>('.ni-nlp__checkslot .ni-btn');
    case 'minus':
      return root.querySelector<HTMLElement>('.ni-nlp__sign-toggle');
    case 'key':
      return (
        [...root.querySelectorAll<HTMLElement>('.ni-pad__key')].find(
          (k) => k.dataset.key === cue.key,
        ) ?? null
      );
    case 'bench':
      return (
        [...root.querySelectorAll<HTMLElement>('.ni-nlp__choices .ni-pick')].find(
          (k) => k.dataset.id === cue.id,
        ) ?? null
      );
  }
}

const cueKeyOf = (cue: Cue | null) => {
  if (!cue) return '';
  if (cue.at === 'key') return `key:${cue.key}`;
  if (cue.at === 'bench') return `bench:${cue.id}`;
  return cue.at;
};

export function NumberLinePlaceWidget({
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
  const waitForCommit = useCommitBarrier();
  const c = config;
  const fmt = formatter(c);
  const mode = c.mode;
  const vertical = c.vertical;
  const showValue = (v: number) => v / c.valueScale;

  // Child state (the model builds the response from it at "check").
  const [placed, setPlaced] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [negative, setNegative] = useState(false);
  const [choice, setChoice] = useState<'b0' | 'b1' | null>(null);
  // Demo state (03 §6.3): mirrors the model's shownTicks / counted / zoom.
  const [shownTicks, setShownTicks] = useState<number[]>([]);
  const [counting, setCounting] = useState<Counting | null>(null);
  const [zoom, setZoom] = useState<{ from: number; to: number } | null>(null);
  const [pulse, setPulse] = useState<number | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [flight, setFlight] = useState<DOMRect | null>(null);

  const interactive = !disabled && !demoBusy;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const pendingDrop = useRef<number | null>(null);
  const pendingTap = useRef<number | null>(null);

  // ---------- layout ----------

  const room = useWidgetRoom(rootRef);
  const plan = planLayout(c, room, ageMode);
  const s = sizes(ageMode);
  const laneW = useWidth(laneRef);
  const headroom = headroomFor(c, s.target) + plan.extraHead;
  const lineW = Math.max(LINE_MIN, Math.min(LINE_MAX, laneW ?? LINE_MAX));
  const geo: LineGeo = vertical
    ? verticalGeo(c, plan.tall)
    : horizontalGeo(c, lineW, headroom, fmt);
  const step =
    c.snap === 'tick' && c.ticksEvery
      ? c.ticksEvery
      : Math.max(resolution(c), (c.max - c.min) / 100);

  // ---------- placing the flag ----------

  const valueAtClient = (clientX: number, clientY: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return c.min;
    return geo.valueAt({ x: clientX - r.left, y: clientY - r.top });
  };

  /** The value under the flag's pin, where it is drawn right now (mid-drag included). */
  const valueUnderPin = (el: Element) => {
    const r = el.getBoundingClientRect();
    return vertical
      ? valueAtClient(r.right, r.top + r.height / 2)
      : valueAtClient(r.left + r.width / 2, r.bottom);
  };

  const plant = (raw: number) => setPlaced(landing(c, raw));

  const dnd = useDragToTarget<MarkerId, TargetId>({
    disabled: !interactive || mode !== 'place',
    trace,
    onSelect: (item) => {
      if (item && speakOnTap) sayNumber(showValue(c.target));
    },
    onPlace: ({ via }) => {
      const raw =
        via === 'drag' ? pendingDrop.current : via === 'tap' ? pendingTap.current : cursor;
      pendingDrop.current = null;
      pendingTap.current = null;
      if (raw !== null) plant(raw);
    },
  });

  const markerProps = dnd.itemProps('marker', {
    label: t('ui.nlp.marker', { n: fmt(c.target) }),
  });
  const onMarkerPointerDown = (e: ReactPointerEvent) => {
    markerProps.onPointerDown(e);
    const el = e.currentTarget;
    const id = e.pointerId;
    // Read where the pin is before the drag hook clears the offset on release.
    const capture = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      pendingDrop.current = valueUnderPin(el);
      done();
    };
    const done = () => {
      window.removeEventListener('pointerup', capture, true);
      window.removeEventListener('pointercancel', done, true);
    };
    window.addEventListener('pointerup', capture, true);
    window.addEventListener('pointercancel', done, true);
  };

  const stripProps = dnd.targetProps('line', { label: t('ui.nlp.line') });
  const onStripClick = (e: MouseEvent) => {
    if (!interactive || mode !== 'place') return;
    // A keyboard click (detail 0) is handled on keydown.
    if (e.detail === 0) return;
    pendingTap.current = valueAtClient(e.clientX, e.clientY);
    if (dnd.selected === 'marker') {
      stripProps.onClick(e);
      return;
    }
    // Tap-to-place straight onto the line: no need to pick the flag up first.
    trace('tap', 'line');
    plant(pendingTap.current);
    pendingTap.current = null;
  };
  const onStripKeyDown = (e: KeyboardEvent) => {
    if (!interactive || mode !== 'place') return;
    const from = cursor ?? placed ?? c.min;
    const up = vertical ? ['ArrowUp', 'ArrowRight'] : ['ArrowRight', 'ArrowUp'];
    const down = vertical ? ['ArrowDown', 'ArrowLeft'] : ['ArrowLeft', 'ArrowDown'];
    const clamp = (v: number) => Math.min(c.max, Math.max(c.min, roundTo(v, step / 10)));
    let next: number | null = null;
    if (up.includes(e.key)) next = from + step;
    else if (down.includes(e.key)) next = from - step;
    else if (e.key === 'PageUp') next = from + step * 10;
    else if (e.key === 'PageDown') next = from - step * 10;
    else if (e.key === 'Home') next = c.min;
    else if (e.key === 'End') next = c.max;
    if (next !== null) {
      e.preventDefault();
      setCursor(clamp(next));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      trace('tap', 'line');
      dnd.select(null);
      plant(from);
      return;
    }
    stripProps.onKeyDown(e);
  };

  // ---------- read and closer answers ----------

  // Whole-number digits (a leading "0" of "0.5" counts as one: the pad counts it) plus the
  // decimal places the line is written in (its spacing, its numbers; hundredths with valueScale 100).
  const shownOf = (v: number) => v / c.valueScale;
  const places = Math.max(
    c.valueScale === 100 ? 2 : 0,
    ...[c.ticksEvery, c.labelsEvery, c.min, c.max, c.target]
      .filter((x): x is number => x !== null)
      .map((x) => decimalsOf(shownOf(x))),
  );
  const maxDigits =
    String(Math.trunc(Math.max(Math.abs(shownOf(c.min)), Math.abs(shownOf(c.max))))).length +
    places;
  // The decimal key is there whenever any number of the line, the answer included, is written
  // with decimal places (a 0.125 target on a line ticked in wholes still needs ".").
  const allowDecimal = places > 0;
  /** Whether the pad as rendered can type `text`: only its own keys, within its digit limit. */
  const padCanType = (text: string) =>
    /^\d*(\.\d*)?$/.test(text) &&
    (allowDecimal || !text.includes('.')) &&
    text.replace('.', '').length <= maxDigits;
  const typedValue = (() => {
    const v = padValue(typed);
    if (v === null) return null;
    return Number(((negative ? -v : v) * c.valueScale).toFixed(6));
  })();

  const onKey = (key: PadKey) => {
    if (!interactive) return;
    trace('tap', `key-${key}`);
    setTyped((prev) => applyPadKey(prev, key, maxDigits));
  };

  const pickBenchmark = (id: 'b0' | 'b1') => {
    if (!interactive) return;
    trace('tap', id);
    const b = c.benchmarks?.[id === 'b0' ? 0 : 1];
    if (speakOnTap && b !== undefined) sayNumber(showValue(b));
    setChoice(id);
  };

  // ---------- check ----------

  const response = (): ResponseValue | null => {
    if (!MODEL) return null;
    let st = MODEL.initialState(c);
    if (mode === 'place' && placed !== null)
      st = MODEL.apply(st, { op: 'answer', args: { value: placed } });
    if (mode === 'read' && typedValue !== null)
      st = MODEL.apply(st, { op: 'answer', args: { value: typedValue } });
    if (mode === 'closer' && choice !== null)
      st = MODEL.apply(st, { op: 'answer', args: { id: choice } });
    return MODEL.toResponse(st);
  };
  const ready = response() !== null;
  // One debounce for every way to submit (Check button, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    const r = response();
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  // A demo drop flies the flag from where it was drawn to its new spot (FLIP on its anchor).
  useLayoutEffect(() => {
    if (!flight) return;
    const el = anchorRef.current;
    setFlight(null);
    if (el) void flyFrom(el, flight, { ms: reduced ? 0 : FLY_MS, lift: 90 });
  }, [flight, reduced]);

  const flyTo = async (at: number) => {
    const from = markerRef.current?.getBoundingClientRect() ?? null;
    setPlaced(landing(c, at));
    if (!reduced) setFlight(from);
    await pause(reduced ? 0 : FLY_MS + 80);
  };

  const typeValue = async (v: number) => {
    if (reduced) {
      // Reduced motion: the number appears at once (no key-by-key typing).
      const shownNow = showValue(v);
      setNegative(shownNow < 0);
      setTyped(padText(shownNow));
      // The op resolves only once this state has committed (a demo play resolves after it).
      await waitForCommit();
      return;
    }
    const shown = showValue(v);
    setNegative(shown < 0);
    const chars = padText(shown).split('') as PadKey[];
    let text = '';
    setTyped('');
    for (const ch of chars) {
      setPressedKey(ch);
      await pause(reduced ? 0 : KEY_MS);
      if (!alive.current) return;
      text = applyPadKey(text, ch, maxDigits + 1);
      setTyped(text);
    }
    setPressedKey(null);
    // Let the last digit show before the op resolves.
    await pause(reduced ? 0 : KEY_MS);
  };

  const num = (a: WidgetAction, key: string) => {
    const v = a.args?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      try {
        if (action.op === 'drop') {
          const at = num(action, 'at');
          if (at !== null) await flyTo(at);
        } else if (action.op === 'show-tick') {
          const at = num(action, 'at');
          if (at === null || at < c.min || at > c.max) return;
          setShownTicks((prev) => (prev.includes(at) ? prev : [...prev, at]));
          setPulse(at);
          sayNumber(showValue(at));
          await pause(reduced ? 0 : 900);
          if (alive.current) setPulse(null);
        } else if (action.op === 'count-ticks') {
          const a = num(action, 'from');
          const b = num(action, 'to');
          if (a === null || b === null) return;
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const every = c.ticksEvery ?? resolution(c) * 10;
          const run = stepsBetween(lo, hi, every);
          // Count the jumps between ticks: the first tick is "0", each next one adds one.
          for (let i = 0; i < run.length; i++) {
            setCounting({ ticks: run, shown: i, bubbles: true });
            if (i > 0) sayNumber(i);
            await pause(reduced ? 0 : COUNT_MS);
            if (!alive.current) return;
          }
          await pause(reduced ? 0 : 600);
          if (!alive.current) return;
          // The counted stretch stays marked; the count bubbles go, so the flag can be planted.
          setCounting({ ticks: run, shown: run.length - 1, bubbles: false });
        } else if (action.op === 'zoom') {
          const a = num(action, 'from');
          const b = num(action, 'to');
          if (a === null || b === null) return;
          setZoom({ from: Math.min(a, b), to: Math.max(a, b) });
          await pause(reduced ? 0 : 900);
        } else if (action.op === 'answer') {
          if (mode === 'closer') {
            const id = action.args?.id;
            if (id === 'b0' || id === 'b1') {
              setPulse(c.benchmarks?.[id === 'b0' ? 0 : 1] ?? null);
              await pause(reduced ? 0 : 700);
              if (!alive.current) return;
              setChoice(id);
              setPulse(null);
            }
          } else {
            const v = num(action, 'value');
            if (v === null) return;
            if (mode === 'place') await flyTo(v);
            else await typeValue(v);
          }
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

  const cue: Cue | null = (() => {
    if (!invite || !interactive || !OPS.includes(invite.op as (typeof OPS)[number])) return null;
    const check: Cue | null = ready ? { at: 'check' } : null;
    if (mode === 'place') {
      if (invite.op === 'answer') {
        const v = num(invite, 'value');
        const want = v === null ? null : landing(c, v);
        if (placed !== null && (want === null || placed === want)) return check;
        return { at: 'marker' };
      }
      // Whatever the demo showed, the child's step is to plant the flag.
      return placed === null ? { at: 'marker' } : null;
    }
    if (invite.op !== 'answer') return null;
    if (mode === 'closer') {
      const id = invite.args?.id;
      if (id !== 'b0' && id !== 'b1') return check;
      return choice === id ? check : { at: 'bench', id };
    }
    // read: the next key of the value (minus first below zero), backspace after a wrong digit.
    const v = num(invite, 'value');
    if (v === null) return check;
    const shown = showValue(v);
    if (shown < 0 !== negative) return c.min < 0 ? { at: 'minus' } : null;
    const want = padText(shown);
    // Never cue a key the pad doesn't render (or one it would refuse): no hand at all instead.
    if (!padCanType(want)) return null;
    if (typed === want) return check;
    if (want.startsWith(typed)) return { at: 'key', key: want[typed.length] as PadKey };
    return { at: 'key', key: 'back' };
  })();
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => (cue ? cueTarget(root, cue) : null),
    cue ? `${cueKeyOf(cue)}|${plan.layout}|${placed ?? ''}|${lineW}` : '',
  );

  // ---------- render ----------

  const at = geo.at;
  const lineLo = at(c.min);
  const lineHi = at(c.max);

  /** SVG extras in stage coordinates (the same for both orientations). */
  const extras = () => {
    const out: ReactNode[] = [];
    const along = (v: number, offset: number): Point =>
      vertical ? { x: at(v).x - offset, y: at(v).y } : { x: at(v).x, y: at(v).y - offset };
    if (zoom) {
      const p = at(zoom.from);
      const q = at(zoom.to);
      const fine = stepsBetween(zoom.from, zoom.to, (zoom.to - zoom.from) / 10);
      out.push(
        <g key="zoom" className="ni-nlp__zoom">
          {vertical ? (
            <rect x={p.x - 34} y={q.y - 10} width={54} height={p.y - q.y + 20} rx={14} />
          ) : (
            // Above the numerals (they start 18 px under the line), so the lens never hides them.
            <rect x={p.x - 10} y={p.y - 34} width={q.x - p.x + 20} height={50} rx={14} />
          )}
          {fine.map((v) => {
            const f = at(v);
            return vertical ? (
              <line key={v} x1={f.x - 9} x2={f.x + 9} y1={f.y} y2={f.y} />
            ) : (
              <line key={v} x1={f.x} x2={f.x} y1={f.y - 9} y2={f.y + 9} />
            );
          })}
        </g>,
      );
    }
    // End numbers when the line prints none (estimation: only the ends are marked).
    if (!vertical && c.labelsEvery === null) {
      for (const v of [c.min, c.max]) {
        out.push(
          <text
            key={`end${v}`}
            className="ni-numberline__numeral"
            x={at(v).x}
            y={at(v).y + 18 + 40 * 0.9}
            fontSize={40}
            textAnchor="middle"
          >
            {fmt(v)}
          </text>,
        );
        if (c.ticksEvery === null) {
          out.push(
            <line
              key={`endtick${v}`}
              className="ni-numberline__tick"
              x1={at(v).x}
              x2={at(v).x}
              y1={at(v).y - 14}
              y2={at(v).y + 14}
            />,
          );
        }
      }
    }
    // Benchmarks are labelled numbers on the line (CMP.06: "look at the numbers you see"): a
    // long tick, and its numeral under the line unless the line already prints it.
    if (!vertical && c.benchmarks) {
      const printed = (v: number) =>
        c.labelsEvery === null
          ? v === c.min || v === c.max
          : Math.abs(v / c.labelsEvery - Math.round(v / c.labelsEvery)) < 1e-6;
      for (const b of c.benchmarks) {
        if (b < c.min || b > c.max) continue;
        const p = at(b);
        out.push(
          <g key={`bm${b}`} className="ni-nlp__benchmark" data-at={b}>
            <line x1={p.x} x2={p.x} y1={p.y - 20} y2={p.y + 20} />
            {printed(b) ? null : (
              <text
                className="ni-numberline__numeral"
                x={p.x}
                y={p.y + 18 + 40 * 0.9}
                fontSize={40}
                textAnchor="middle"
              >
                {fmt(b)}
              </text>
            )}
          </g>,
        );
      }
    }
    for (const v of shownTicks) {
      const p = at(v);
      out.push(
        <g
          key={`shown${v}`}
          className="ni-nlp__shown"
          data-pulse={pulse === v ? 'true' : undefined}
        >
          {vertical ? (
            <line x1={p.x - 22} x2={p.x + 22} y1={p.y} y2={p.y} />
          ) : (
            <line x1={p.x} x2={p.x} y1={p.y - 22} y2={p.y + 22} />
          )}
          <text
            className="ni-numberline__marklabel"
            x={vertical ? p.x - 34 : p.x}
            y={vertical ? p.y + 12 : p.y - 34}
            fontSize={32}
            textAnchor={vertical ? 'end' : 'middle'}
          >
            {fmt(v)}
          </text>
        </g>,
      );
    }
    if (counting) {
      const { ticks: run, shown, bubbles } = counting;
      const roomy = run.length < 2 || geo.span(run[0] as number, run[1] as number) >= 46;
      run.slice(0, shown + 1).forEach((v, i) => {
        if (!bubbles || i === 0 || (!roomy && i !== shown)) return;
        const p = along(v, 46);
        out.push(
          <g key={`count${v}`} className="ni-nlp__count">
            <circle cx={p.x} cy={p.y} r={22} />
            <text x={p.x} y={p.y + 11} fontSize={32} textAnchor="middle">
              {i}
            </text>
          </g>,
        );
      });
      const first = run[0];
      const last = run[shown];
      if (first !== undefined && last !== undefined) {
        const p = at(first);
        const q = at(last);
        out.push(
          <line key="counted" className="ni-nlp__counted" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />,
        );
      }
    }
    if (mode === 'closer' && c.benchmarks) {
      c.benchmarks.forEach((b, i) => {
        const p = at(b);
        out.push(
          <g
            key={`bench${b}`}
            className="ni-nlp__bench"
            data-pulse={pulse === b ? 'true' : undefined}
            data-picked={choice === (i === 0 ? 'b0' : 'b1') ? 'true' : undefined}
          >
            {vertical ? (
              <line x1={p.x - 26} x2={p.x + 26} y1={p.y} y2={p.y} />
            ) : (
              <line x1={p.x} x2={p.x} y1={p.y - 26} y2={p.y + 26} />
            )}
            <circle cx={p.x} cy={p.y} r={11} />
          </g>,
        );
      });
    }
    if (vertical && (mode === 'read' || mode === 'closer')) {
      const p = at(c.target);
      out.push(
        <g key="target" className="ni-numberline__mark">
          <circle cx={p.x} cy={p.y} r={9} />
          <path className="ni-numberline__pointer" d={`M${p.x - 16} ${p.y}l-22 -14v28z`} />
          <text
            className="ni-numberline__marklabel"
            x={p.x - 46}
            y={p.y + 12}
            fontSize={32}
            textAnchor="end"
          >
            {mode === 'read' ? '?' : fmt(c.target)}
          </text>
        </g>,
      );
    }
    if (cursor !== null && mode === 'place') {
      const p = at(cursor);
      out.push(
        <g key="cursor" className="ni-nlp__cursor">
          {vertical ? (
            <path d={`M${p.x - 8} ${p.y}l-26 -16v32z`} />
          ) : (
            <path d={`M${p.x} ${p.y - 8}l-16 -26h32z`} />
          )}
        </g>,
      );
    }
    return out;
  };

  const marks: NumberLineMark[] =
    mode === 'read'
      ? [{ at: c.target, label: '?', arrow: true }]
      : mode === 'closer'
        ? [{ at: c.target, label: fmt(c.target), arrow: true }]
        : [];

  const line = vertical ? (
    <VerticalLine c={c} geo={geo} fmt={fmt} labels={verticalLabels(c, geo)}>
      {extras()}
    </VerticalLine>
  ) : (
    <NumberLineView
      min={c.min}
      max={c.max}
      ticksEvery={c.ticksEvery}
      labelsEvery={c.labelsEvery}
      marks={marks}
      width={geo.width}
      headroom={headroom}
      format={fmt}
      label={t('ui.nlp.line')}
    >
      {() => extras()}
    </NumberLineView>
  );

  // The drop strip covers the line, the numerals and the flag's height above it.
  const strip = vertical
    ? {
        left: lineLo.x - 150,
        top: lineHi.y - 30,
        width: 230,
        height: lineLo.y - lineHi.y + 60,
      }
    : {
        left: lineLo.x - 24,
        top: lineLo.y - headroom + 10,
        width: lineHi.x - lineLo.x + 48,
        height: headroom + 50,
      };

  // The invite pulse goes on the flag, not its anchor: the pulse animates `transform`, which
  // positions the anchor.
  const markerClass = [
    markerProps.className,
    'ni-nlp__marker',
    cue?.at === 'marker' ? 'ni-invite' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const markerEl = (
    <div
      {...markerProps}
      ref={(el) => {
        markerProps.ref(el);
        markerRef.current = el;
      }}
      className={markerClass}
      data-orient={vertical ? 'v' : 'h'}
      onPointerDown={onMarkerPointerDown}
    >
      <FlagSign text={fmt(c.target)} vertical={vertical} />
    </div>
  );

  const stage = (
    <div
      ref={stageRef}
      className="ni-nlp__stage"
      data-orient={vertical ? 'v' : 'h'}
      data-line-width={geo.width}
      data-headroom={vertical ? undefined : headroom}
      data-tall={vertical ? geo.height : undefined}
      style={{ width: geo.width, height: geo.height }}
    >
      {line}
      {mode === 'place' ? (
        <button
          {...stripProps}
          type="button"
          className={[stripProps.className, 'ni-nlp__strip'].filter(Boolean).join(' ')}
          aria-disabled={interactive ? undefined : true}
          style={strip}
          onClick={onStripClick}
          onKeyDown={onStripKeyDown}
          onFocus={() => setCursor(placed ?? c.min)}
          onBlur={() => setCursor(null)}
        />
      ) : null}
      {mode === 'place' && placed !== null ? (
        <div
          ref={anchorRef}
          className="ni-nlp__anchor"
          data-orient={vertical ? 'v' : 'h'}
          data-placed="true"
          data-value={placed}
          style={{ left: at(placed).x, top: at(placed).y }}
        >
          {markerEl}
        </div>
      ) : null}
    </div>
  );

  const check = (
    <span className="ni-nlp__checkslot">
      <CheckButton
        onPress={submit}
        disabled={!interactive || !ready}
        invited={cue?.at === 'check'}
        compact={plan.layout === 'side'}
      />
    </span>
  );

  let controls: ReactNode;
  if (mode === 'place') {
    controls = (
      <>
        <div className="ni-nlp__dock" data-empty={placed !== null ? 'true' : undefined}>
          {placed === null ? (
            <div
              ref={anchorRef}
              className="ni-nlp__anchor"
              data-docked="true"
              data-orient={vertical ? 'v' : 'h'}
            >
              {markerEl}
            </div>
          ) : (
            <span className="ni-nlp__dockspot" aria-hidden="true" />
          )}
        </div>
        {check}
      </>
    );
  } else if (mode === 'read') {
    controls = (
      <>
        <div className="ni-nlp__readout">
          {c.min < 0 ? (
            <button
              type="button"
              className={['ni-nlp__sign-toggle', cue?.at === 'minus' ? 'ni-invite' : '']
                .filter(Boolean)
                .join(' ')}
              aria-label={t('ui.nlp.minus')}
              aria-pressed={negative}
              disabled={!interactive}
              onClick={() => {
                trace('tap', 'key-minus');
                setNegative((n) => !n);
              }}
            >
              <span className="ni-btn__label" aria-hidden="true">
                −
              </span>
            </button>
          ) : null}
          <NumberDisplay
            value={typed === '' ? null : `${negative ? '−' : ''}${typed}`}
            digits={2}
            size="lg"
            state={interactive ? 'active' : 'idle'}
            label="ui.widget.answer"
            speakOnTap={false}
          />
          {check}
        </div>
        <div className="ni-nlp__padcell">
          <NumberPadKeys
            onKey={onKey}
            onEnter={submit}
            allowDecimal={allowDecimal}
            disabled={!interactive}
            highlighted={pressedKey ?? (cue?.at === 'key' ? cue.key : null)}
            shape={plan.pad.shape}
          />
        </div>
      </>
    );
  } else {
    const [b0, b1] = c.benchmarks ?? [c.min, c.max];
    controls = (
      <>
        <fieldset
          className="ni-nlp__choices"
          aria-label={t('ui.widget.choices')}
          disabled={!interactive}
        >
          {(
            [
              ['b0', b0],
              ['b1', b1],
            ] as const
          ).map(([id, v]) => (
            <PickCard
              key={id}
              label={fmt(v)}
              selected={choice === id}
              highlighted={cue?.at === 'bench' && cue.id === id}
              data-id={id}
              onPress={() => pickBenchmark(id)}
            >
              <span className="ni-pick__numeral">{fmt(v)}</span>
            </PickCard>
          ))}
        </fieldset>
        {check}
      </>
    );
  }

  return (
    <div
      ref={rootRef}
      className="ni-nlp"
      data-tier={tier}
      data-mode={mode}
      data-orient={vertical ? 'v' : 'h'}
      data-layout={plan.layout}
      data-pad-shape={mode === 'read' ? plan.pad.shape : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={
        {
          '--pad-key': `${plan.pad.key}px`,
          '--pad-row-gap': `${PAD_ROW_GAP}px`,
          // Digits sized so Pip's hand clears its own key's digit and the one below.
          '--pad-digit': padDigit(plan.pad.key),
          ...handRootStyle,
        } as CSSProperties
      }
    >
      <div ref={laneRef} className="ni-nlp__lane">
        {stage}
      </div>
      {controls}
      {inviteHand}
    </div>
  );
}

export default NumberLinePlaceWidget;
