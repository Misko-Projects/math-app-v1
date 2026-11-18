import { formatModel } from '@number-island/engine';
import type { ResponseValue, WidgetAction } from '@number-island/shared';
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
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
import { HandPointerIcon } from '../../primitives/icons';
import { NumberDisplay } from '../../primitives/NumberDisplay';
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
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './number-line-place.css';

/**
 * `number-line-place` (03 §5.5, Treasure Beach W4): a number line and one of three asks.
 *
 * - `place`: a flag carrying the target number waits in its sand dock. The child drags it onto the
 *   line (mouse, touch or pen), taps a spot on the line (tap-to-place, with or without picking the
 *   flag up first), or uses the keyboard (Enter on the flag or Tab to the line, arrows move a ghost
 *   pin by a tick or 1% of the line, Enter plants the flag). With `snap: 'tick'` it lands on the nearest tick. "Check" answers
 *   `{ kind: 'placement', value }` (config units: hundredths with `valueScale: 100`).
 * - `read`: an arrow points at a spot; the child types its number on the pad → `number`.
 * - `closer`: the target sits between two benchmarks; the child picks one → `choice` `b0` | `b1`.
 *
 * The widget never shows how close a placement is: the engine reports closeness, and the workshop
 * shows hot/cold after the check. `vertical: true` draws a thermometer-like upright line.
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

/** Line stage sizes (px). Numerals stay 32 px; the line is drawn at a fixed size (kit rule). */
const WIDE = 1040;
const NARROW = 700;
const TALL = 470;
const VERTICAL_W = 330;

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
    height: headroom + 64,
    at: (v) => ({ x: s.x(v), y: s.lineY }),
    valueAt: (p) => s.value(p.x),
    span: (a, b) => Math.abs(s.x(b) - s.x(a)),
  };
}

const V_PAD = 40;
const V_AXIS_X = 170;

function verticalGeo(c: Config): LineGeo {
  const inner = TALL - 2 * V_PAD;
  const range = c.max - c.min || 1;
  const y = (v: number) => V_PAD + ((c.max - v) / range) * inner;
  return {
    vertical: true,
    width: VERTICAL_W,
    height: TALL,
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
  const free = roundTo(at, resolution(c));
  const s = MODEL.apply(MODEL.initialState({ ...c, mode: 'place' }), {
    op: 'drop',
    args: { at: free },
  });
  const r = MODEL.toResponse(s);
  return r?.kind === 'placement' ? r.value : free;
}

/** Numbers drawn on the line: the kit's stride for horizontal lines, an even stride upright. */
function verticalLabels(c: Config, geo: LineGeo): number[] {
  const every = c.labelsEvery;
  const base = every ? stepsBetween(c.min, c.max, every) : [];
  if (base.length < 2 || !every) return [c.min, c.max];
  const gap = geo.span(c.min, c.min + every);
  const stride = [1, 2, 5, 10, 20, 50, 100].find((k) => gap * k >= 40) ?? 100;
  const unit = every * stride;
  return base.filter((v) => Math.abs(v / unit - Math.round(v / unit)) < 1e-6);
}

// ---------- the flag marker (original art: a sand-coloured sign on a driftwood post) ----------

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
      {/* Thermometer bulb and tube behind the axis (sand glass, ink outline). */}
      <rect
        className="ni-nlp__tube"
        x={V_AXIS_X - 16}
        y={top.y - 26}
        width={32}
        height={bottom.y - top.y + 40}
        rx={16}
      />
      <circle className="ni-nlp__tube" cx={V_AXIS_X} cy={bottom.y + 22} r={22} />
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
          x1={V_AXIS_X - 14}
          x2={V_AXIS_X + 14}
          y1={geo.at(v).y}
          y2={geo.at(v).y}
        />
      ))}
      {labels.map((v) => (
        <text
          key={`l${v}`}
          className="ni-numberline__numeral"
          x={V_AXIS_X + 28}
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
  const { speakOnTap } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
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
  const stageRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const pendingDrop = useRef<number | null>(null);
  const pendingTap = useRef<number | null>(null);

  const headroom = mode === 'place' ? 136 : 92;
  const geo: LineGeo = vertical
    ? verticalGeo(c)
    : horizontalGeo(c, mode === 'read' ? NARROW : WIDE, headroom, fmt);
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

  const plant = (raw: number) => {
    setInvite(null);
    setPlaced(landing(c, raw));
  };

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

  const maxDigits =
    String(Math.trunc(Math.max(Math.abs(c.min), Math.abs(c.max)) / c.valueScale)).length +
    (c.valueScale === 100 ? 2 : 0);
  const allowDecimal =
    c.valueScale === 100 || [c.ticksEvery, c.labelsEvery].some((x) => x !== null && x % 1 !== 0);
  const typedValue = (() => {
    const v = padValue(typed);
    if (v === null) return null;
    return Number(((negative ? -v : v) * c.valueScale).toFixed(6));
  })();

  const onKey = (key: PadKey) => {
    if (!interactive) return;
    trace('tap', `key-${key}`);
    setInvite(null);
    setTyped((prev) => applyPadKey(prev, key, maxDigits));
  };

  const pickBenchmark = (id: 'b0' | 'b1') => {
    if (!interactive) return;
    trace('tap', id);
    setInvite(null);
    const b = c.benchmarks?.[id === 'b0' ? 0 : 1];
    if (speakOnTap && b !== undefined) sayNumber(showValue(b));
    setChoice(id);
  };

  // ---------- check ----------

  const response = (): ResponseValue | null => {
    if (!MODEL) return null;
    let s = MODEL.initialState(c);
    if (mode === 'place' && placed !== null)
      s = MODEL.apply(s, { op: 'answer', args: { value: placed } });
    if (mode === 'read' && typedValue !== null)
      s = MODEL.apply(s, { op: 'answer', args: { value: typedValue } });
    if (mode === 'closer' && choice !== null)
      s = MODEL.apply(s, { op: 'answer', args: { id: choice } });
    return MODEL.toResponse(s);
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
    await pause(FLY_MS + 80);
  };

  const typeValue = async (v: number) => {
    const shown = showValue(v);
    setNegative(shown < 0);
    const chars = String(Math.abs(Number(shown.toFixed(2)))).split('') as PadKey[];
    let text = '';
    setTyped('');
    for (const ch of chars) {
      setPressedKey(ch);
      await pause(KEY_MS);
      if (!alive.current) return;
      text = applyPadKey(text, ch, maxDigits + 1);
      setTyped(text);
    }
    setPressedKey(null);
    // Let the last digit show before the op resolves.
    await pause(KEY_MS);
  };

  const num = (a: WidgetAction, key: string) => {
    const v = a.args?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
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
          await pause(900);
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
          await pause(600);
          if (!alive.current) return;
          // The counted stretch stays marked; the count bubbles go, so the flag can be planted.
          setCounting({ ticks: run, shown: run.length - 1, bubbles: false });
        } else if (action.op === 'zoom') {
          const a = num(action, 'from');
          const b = num(action, 'to');
          if (a === null || b === null) return;
          setZoom({ from: Math.min(a, b), to: Math.max(a, b) });
          await pause(900);
        } else if (action.op === 'answer') {
          if (mode === 'closer') {
            const id = action.args?.id;
            if (id === 'b0' || id === 'b1') {
              setPulse(c.benchmarks?.[id === 'b0' ? 0 : 1] ?? null);
              await pause(700);
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
        setPressedKey(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- render ----------

  const at = geo.at;
  const lineLo = at(c.min);
  const lineHi = at(c.max);
  const inviteLine = invite !== null && ['show-tick', 'count-ticks', 'zoom'].includes(invite.op);
  const inviteMarker =
    invite !== null && mode === 'place' && ['drop', 'answer'].includes(invite.op);
  const inviteAnswer = invite?.op === 'answer' && mode !== 'place';
  const inviteChoice = inviteAnswer && mode === 'closer' ? (invite?.args?.id as string) : null;

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
            y={at(v).y + 18 + 32 * 0.9}
            fontSize={32}
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
  const markerClass = `${markerProps.className} ni-nlp__marker${inviteMarker ? ' ni-invite' : ''}`;
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
  const hand = (cls: string) => (
    <span className={`ni-hand ${cls}`}>
      <HandPointerIcon />
    </span>
  );

  const stage = (
    <div
      ref={stageRef}
      className="ni-nlp__stage"
      data-orient={vertical ? 'v' : 'h'}
      style={{ width: geo.width, height: geo.height }}
    >
      {line}
      {mode === 'place' ? (
        <button
          {...stripProps}
          type="button"
          className={[stripProps.className, 'ni-nlp__strip', inviteLine ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          aria-disabled={interactive ? undefined : true}
          style={strip}
          onClick={onStripClick}
          onKeyDown={onStripKeyDown}
          onFocus={() => setCursor(placed ?? c.min)}
          onBlur={() => setCursor(null)}
        />
      ) : inviteLine ? (
        <div className="ni-nlp__strip ni-invite" style={strip} aria-hidden="true" />
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
          {inviteMarker ? hand('ni-nlp__hand') : null}
        </div>
      ) : null}
    </div>
  );

  const dock =
    mode === 'place' ? (
      <div className="ni-nlp__dock" data-empty={placed !== null ? 'true' : undefined}>
        {placed === null ? (
          <div
            ref={anchorRef}
            className="ni-nlp__anchor"
            data-docked="true"
            data-orient={vertical ? 'v' : 'h'}
          >
            {markerEl}
            {inviteMarker ? hand('ni-nlp__hand') : null}
          </div>
        ) : (
          <span className="ni-nlp__dockspot" aria-hidden="true" />
        )}
      </div>
    ) : null;

  const check = (
    <span className="ni-nlp__checkslot">
      <CheckButton
        onPress={submit}
        disabled={!interactive || !ready}
        invited={inviteAnswer && mode === 'read'}
      />
    </span>
  );

  let controls: ReactNode;
  if (mode === 'place') {
    controls = (
      <div className="ni-nlp__controls">
        {dock}
        {check}
      </div>
    );
  } else if (mode === 'read') {
    controls = (
      <div className="ni-nlp__pad">
        <div className="ni-nlp__readout">
          {c.min < 0 ? (
            <button
              type="button"
              className="ni-nlp__sign-toggle"
              aria-label={t('ui.nlp.minus')}
              aria-pressed={negative}
              disabled={!interactive}
              onClick={() => {
                trace('tap', 'key-minus');
                setNegative((n) => !n);
              }}
            >
              <span aria-hidden="true">−</span>
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
        <NumberPadKeys
          onKey={onKey}
          onEnter={submit}
          allowDecimal={allowDecimal}
          disabled={!interactive}
          highlighted={pressedKey}
        />
      </div>
    );
  } else {
    const [b0, b1] = c.benchmarks ?? [c.min, c.max];
    controls = (
      <div className="ni-nlp__controls" data-mode="closer">
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
            <span key={id} className="ni-nlp__choice">
              <PickCard
                label={fmt(v)}
                selected={choice === id}
                highlighted={inviteChoice === id}
                data-id={id}
                onPress={() => pickBenchmark(id)}
              >
                <span className="ni-pick__numeral">{fmt(v)}</span>
              </PickCard>
              {inviteChoice === id ? hand('ni-nlp__choicehand') : null}
            </span>
          ))}
        </fieldset>
        {check}
      </div>
    );
  }

  return (
    <div
      className="ni-nlp"
      data-tier={tier}
      data-mode={mode}
      data-orient={vertical ? 'v' : 'h'}
      data-disabled={disabled ? 'true' : undefined}
    >
      {stage}
      {controls}
    </div>
  );
}

export default NumberLinePlaceWidget;
