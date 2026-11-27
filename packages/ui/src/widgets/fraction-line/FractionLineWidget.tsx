import {
  type FormatModel,
  type FractionLineState,
  formatModel,
  fractionLineTicks,
  targetValue,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  FracNumeral,
  FractionEntry,
  type PadKey,
  padValue,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './fraction-line.css';

/**
 * `fraction-line` (03 §5.5, pictorial): a number line, a ruler or a fraction strip from 0 to
 * `max` wholes. Ticks sit at exactly k/denominator (when shown); labels are numerals ≥ 32 px,
 * fractions stacked a over b.
 *
 * - `partition`: tap the strip (or line) to put a mark there; tap a mark (its pin, or the line
 *   where it stands) to take it away, drag a mark to move it. Keyboard: focus the line, move its
 *   cursor with the arrow keys (twenty-fourths of a whole; Shift: 120ths), Enter or Space puts or
 *   takes a mark there; or Tab to a pin and press Enter to take it away.
 * - `place`: drag the dot onto the line (or tap the line, or move the focused line's cursor with the
 *   arrow keys); it lands where the model's `snapPlacement` says (a tick when ticks are shown).
 *   Tap the placed dot (or Enter on it, or drag it off the line) to take it back.
 * - `read`, `equivalent`: the flag stands at the target; type the fraction (or, with
 *   `decimalLabels`, the decimal) on the pad.
 *
 * The model (`formatModel('fraction-line')`) holds the state; the response is its `toResponse`.
 * Demo ops: `partition {b}`, `hop {k}`, `label {a, b}`, `drop {at}`, plus `answer`.
 */

const OPS = ['partition', 'hop', 'label', 'drop', 'answer'] as const;
const KEY_MS = 340;
/** Free marks snap to 1/120 of a whole: exact for halves to twelfths, finer than a finger. */
const MARK_STEPS = 120;
/** The keyboard cursor moves in twenty-fourths of a whole (Shift: 120ths). */
const KEY_STEPS = 24;
/** Numerals on the line: ≥ 32 px (05 §11). */
/** Numerals on the line: 52 px type, so the drawn digits are ≥ 32 px tall (05 §11). */
const NUM_PX = 52;
/** Labels sit this far below the band or the ticks they name, and this far from each other. */
const LABEL_GAP = 14;

type Config = ConfigFor<'fraction-line'>;

const model = (): FormatModel<'fraction-line', FractionLineState> => {
  const m = formatModel('fraction-line');
  if (!m) throw new Error('fraction-line has no engine model');
  // The registry stores models type-erased; this one's state is FractionLineState.
  return m as unknown as FormatModel<'fraction-line', FractionLineState>;
};

function useWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(1100);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setWidth(el.clientWidth || 1100);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

/**
 * Where a value on a line with shown ticks is, told the way a child counts it (#17 slice 5b): on a
 * labelled number (`at`: 0, a whole, or the end), or tick `k` of the `n` parts between the two
 * labelled numbers around it (the wholes; with `ends` or `none`, 0 and the end). Never the
 * fraction itself, so a placed or flagged point is found by counting, as a sighted child does.
 */
export type TickPlace =
  | { kind: 'at'; at: number }
  | { kind: 'between'; k: number; n: number; lo: number; hi: number };

export function tickPlace(
  value: number,
  den: number,
  max: number,
  labels: Config['labels'],
): TickPlace {
  const kk = Math.round(Math.min(max, Math.max(0, value)) * den);
  const span = labels === 'ends' || labels === 'none' ? den * max : den;
  if (kk % span === 0) return { kind: 'at', at: kk / den };
  const from = Math.floor(kk / span) * span;
  return { kind: 'between', k: kk - from, n: span, lo: from / den, hi: (from + span) / den };
}

/** A label for value k/den: a whole as an integer, else a stacked fraction (or a decimal). */
function labelParts(k: number, den: number, decimal: boolean) {
  if (k % den === 0) return { whole: String(k / den) };
  if (decimal) return { whole: String(Math.round((k / den) * 1000) / 1000) };
  return { a: k, b: den };
}

export function FractionLineWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { sayNumber, say } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const { ref, width } = useWidth();
  const [state, setState] = useState<FractionLineState>(() => model().initialState(config));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [texts, setTexts] = useState<[string, string]>(['', '']);
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const [active, setActive] = useState<0 | 1>(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [dragAt, setDragAt] = useState<{ x: number; y: number } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [shownHops, setShownHops] = useState<number | null>(null);
  const [pendingMarks, setPendingMarks] = useState<number[] | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const interactive = !disabled && !demoBusy;

  const { max, denominator: den, mode } = config;
  const typing = mode === 'read' || mode === 'equivalent';
  const decimalEntry = config.decimalLabels && mode === 'read';
  const k = ageMode === 'k';
  const target = k ? 80 : 64;
  const big = k ? 96 : 76;
  const compact = width < 1100;

  // ---------- geometry (CSS px on the stage) ----------

  // The side (pad, or dot and check) as drawn; the line gets the rest of the width.
  const sideRef = useRef<HTMLDivElement | null>(null);
  const [sideMeasured, setSideMeasured] = useState(0);
  useLayoutEffect(() => {
    const el = sideRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setSideMeasured(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sideW = sideMeasured > 0 ? sideMeasured : typing ? 5 * target + 80 : big + 24;
  const stageW = Math.max(320, Math.min(1000, width - sideW - (compact ? 20 : 32) - 20));
  const pad = 44;
  const x0 = pad;
  const x1 = stageW - pad;
  const unit = (x1 - x0) / max;
  const xOf = (v: number) => x0 + v * unit;
  const valueAtX = (x: number) => (x - x0) / unit;
  const strip = config.skin === 'strip';
  const ruler = config.skin === 'ruler';
  // Pins and the dot stand above the ticks (a line's ticks reach 22 px above it), never on them.
  const handleClear = strip || ruler ? 4 : 28;
  const handleZone = target + handleClear + 4;
  const bandH = strip ? 64 : ruler ? 70 : 0;
  const lineY = handleZone + (strip || ruler ? 0 : 10);
  const tickBottom = lineY + (strip ? bandH : ruler ? 34 : 22);
  const labelsTop = (strip || ruler ? lineY + bandH : tickBottom) + LABEL_GAP;
  const anyFractionLabel = config.labels === 'all' && !config.decimalLabels;
  const labelsH = config.labels === 'none' ? 0 : anyFractionLabel ? 2 * NUM_PX + 14 : NUM_PX + 8;
  const stageH = labelsTop + labelsH + 6;

  // ---------- state ----------

  const apply = (a: WidgetAction) => {
    const next = model().apply(stateRef.current, a);
    stateRef.current = next;
    setState(next);
    return next;
  };

  const snapMark = (v: number) => Math.round(v * MARK_STEPS) / MARK_STEPS;

  /** Put a mark (partition) or the dot (place) at value v; partition toggles a mark already there. */
  const actAt = (v: number, via: 'tap' | 'keyboard' | 'drop') => {
    setInvite(null);
    if (mode === 'place') {
      // The model lands the point (`snapPlacement`): the widget and the checker read one value.
      apply({ op: 'drop', args: { at: Math.min(max, Math.max(0, v)) } });
      if (via !== 'drop') trace('tap', 'line');
      return;
    }
    if (mode !== 'partition') return;
    const at = snapMark(v);
    if (!(at > 0 && at < max)) return;
    // A mark already stands here (half a keyboard step, or a fingertip, either side).
    const reach = via === 'keyboard' ? 1 / KEY_STEPS / 2 : Math.max(1 / KEY_STEPS / 2, 12 / unit);
    const cuts = stateRef.current.cuts;
    let hit = -1;
    cuts.forEach((c, i) => {
      if (
        Math.abs(c - at) < reach &&
        (hit < 0 || Math.abs(c - at) < Math.abs((cuts[hit] as number) - at))
      )
        hit = i;
    });
    if (hit >= 0) {
      // Touching a mark where it stands takes it away; a mark dragged onto another joins it.
      if (via !== 'drop') removeMark(hit);
      return;
    }
    if (via !== 'drop') trace('tap', 'line');
    apply({ op: 'drop', args: { at } });
  };

  const removeMark = (i: number) => {
    const at = stateRef.current.cuts[i];
    if (at === undefined) return;
    trace('undo', `mark-${i}`);
    if (speakOnTap) say('ui.frac.take-back');
    setInvite(null);
    apply({ op: 'drop', args: { at, remove: true } });
  };

  /** Takes the placed dot back to its home beside the line. */
  const takeDot = () => {
    if (stateRef.current.marker === null) return;
    trace('undo', 'dot');
    if (speakOnTap) say('ui.frac.take-back');
    setInvite(null);
    setCursor(null);
    apply({ op: 'drop', args: { remove: true } });
  };

  // ---------- pointer: tap the line, drag a mark or the dot ----------

  const stageRef = useRef<HTMLDivElement | null>(null);
  const press = useRef<{
    id: number;
    x0: number;
    y0: number;
    mark: number | null;
    dot: boolean;
    moved: boolean;
  } | null>(null);
  const localX = (clientX: number) =>
    clientX - (stageRef.current?.getBoundingClientRect().left ?? 0);
  const localY = (clientY: number) =>
    clientY - (stageRef.current?.getBoundingClientRect().top ?? 0);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!interactive || typing || press.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target as Element;
    const markEl = el.closest('[data-mark]');
    const dotEl = el.closest('[data-dot]');
    const p = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      mark: markEl ? Number(markEl.getAttribute('data-mark')) : null,
      dot: dotEl !== null,
      moved: false,
    };
    // A press in the tools that is not on the dot is not ours.
    if (!stageRef.current?.contains(el) && !p.dot) return;
    press.current = p;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== p.id) return;
      if (!p.moved && Math.hypot(ev.clientX - p.x0, ev.clientY - p.y0) > 8) {
        p.moved = true;
        if (p.mark !== null || p.dot) trace('drag', p.dot ? 'dot' : `mark-${p.mark}`);
      }
      if (p.moved && (p.mark !== null || p.dot)) {
        ev.preventDefault();
        setDragAt({ x: localX(ev.clientX), y: localY(ev.clientY) });
      }
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== p.id) return;
      cleanup();
      setDragAt(null);
      const v = valueAtX(localX(ev.clientX));
      const y = localY(ev.clientY);
      const onLine = y > -20 && y < stageH + 20 && v > -0.08 * max && v < max * 1.08;
      if (!p.moved) {
        if (p.mark !== null) {
          // Pins that overlap: of those under the fingertip, the nearest one.
          const cuts = stateRef.current.cuts;
          const x = localX(ev.clientX);
          const under = (i: number) => Math.abs(xOf(cuts[i] ?? Number.NaN) - x) <= target / 2;
          let best = p.mark;
          if (under(best)) {
            cuts.forEach((c, i) => {
              if (under(i) && Math.abs(xOf(c) - x) < Math.abs(xOf(cuts[best] ?? c) - x)) best = i;
            });
          }
          removeMark(best);
        } else if (p.dot) {
          // A tap on the placed dot takes it back (the dot at home only says its name).
          if (stateRef.current.marker !== null) takeDot();
        } else if (onLine) actAt(v, 'tap');
        return;
      }
      if (p.dot) {
        trace('drop', onLine ? 'line' : 'none');
        if (onLine) actAt(v, 'drop');
        // Dragged off the line: the dot goes home.
        else takeDot();
        return;
      }
      if (p.mark !== null) {
        trace('drop', onLine ? 'line' : 'none');
        const from = stateRef.current.cuts[p.mark];
        if (from !== undefined) apply({ op: 'drop', args: { at: from, remove: true } });
        if (onLine) actAt(v, 'drop');
      }
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== p.id) return;
      cleanup();
      setDragAt(null);
    };
    const cleanup = () => {
      press.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
  };

  // ---------- keyboard: the line is a slider with a cursor ----------

  const cursorStep = mode === 'place' && config.ticksShown ? 1 / den : 1 / KEY_STEPS;
  const onRange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    setCursor(v);
    if (mode === 'place' && interactive) actAt(v, 'keyboard');
  };
  // The arrow keys are handled here (not left to the native range), so every step is exact.
  const cursorRef = useRef<number | null>(null);
  cursorRef.current = cursor;
  const onRangeKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!interactive) return;
    const now = cursorRef.current ?? (mode === 'place' ? (state.marker ?? 0) : max / 2);
    if ((e.key === 'Enter' || e.key === ' ') && mode === 'partition') {
      e.preventDefault();
      if (!e.repeat) actAt(now, 'keyboard');
      return;
    }
    const dir =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -1
          : 0;
    let next: number | null = null;
    if (dir !== 0) {
      const fine = mode === 'partition' || !config.ticksShown;
      const step = e.shiftKey && fine ? 1 / MARK_STEPS : cursorStep;
      next = Math.round((now + dir * step) / step) * step;
    } else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    next = Math.min(max, Math.max(0, next));
    cursorRef.current = next;
    setCursor(next);
    if (mode === 'place') actAt(next, 'keyboard');
  };

  // ---------- answering ----------

  const response = (() => {
    if (!typing) return model().toResponse(state);
    if (decimalEntry) {
      const v = padValue(texts[0]);
      return v === null
        ? null
        : model().toResponse(model().apply(state, { op: 'answer', args: { value: v } }));
    }
    const [a, b] = texts.map(padValue);
    if (a === null || b === null || a === undefined || b === undefined) return null;
    return model().toResponse(model().apply(state, { op: 'answer', args: { values: [a, b] } }));
  })();
  const submit = useSubmitGuard(() => {
    if (!interactive || !response) return false;
    onResponse(response);
    return true;
  });
  const typeKey = (key: PadKey) => {
    if (!interactive) return;
    trace('tap', `key-${key}`);
    setInvite(null);
    const next: [string, string] = [...textsRef.current];
    const slot = decimalEntry ? 0 : active;
    next[slot] = applyPadKey(next[slot], key, decimalEntry ? 4 : 2);
    textsRef.current = next;
    setTexts(next);
  };

  // ---------- demo mode (03 §6.3) ----------

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'partition') {
          const b = typeof action.args?.b === 'number' ? action.args.b : 0;
          if (mode === 'partition' && b > 0) {
            const marks: number[] = [];
            for (let kk = 1; kk < b * max; kk += 1) if (kk % b !== 0) marks.push(kk / b);
            for (let i = 1; i <= marks.length; i += 1) {
              setPendingMarks(marks.slice(0, i));
              await pause(320);
              if (!alive.current) return;
            }
          }
          apply(action);
          setPendingMarks(null);
          await pause(300);
        } else if (action.op === 'hop') {
          const kk = typeof action.args?.k === 'number' ? Math.floor(action.args.k) : 0;
          for (let i = 1; i <= kk; i += 1) {
            setShownHops(i);
            if (speakOnTap) sayNumber(i);
            await pause(380);
            if (!alive.current) return;
          }
          apply(action);
          setShownHops(null);
        } else if (action.op === 'drop') {
          const at = typeof action.args?.at === 'number' ? action.args.at : null;
          apply(action);
          setFlash(at);
          await pause(600);
          if (alive.current) setFlash(null);
        } else if (action.op === 'label') {
          apply(action);
          await pause(700);
        } else if (action.op === 'answer') {
          const values = action.args?.values;
          const one = action.args?.value;
          const list: [0 | 1, number][] = Array.isArray(values)
            ? values.slice(0, 2).map((v, i) => [i === 0 ? 0 : 1, Number(v)] as [0 | 1, number])
            : typeof one === 'number'
              ? [[0, one]]
              : [];
          if (!typing) {
            apply(action);
          } else {
            const cleared: [string, string] = ['', ''];
            textsRef.current = cleared;
            setTexts(cleared);
            for (const [slot, v] of list) {
              setActive(slot);
              let text = '';
              for (const ch of String(v).split('') as PadKey[]) {
                setPressedKey(ch);
                await pause(KEY_MS);
                if (!alive.current) return;
                text += ch;
                const next: [string, string] = [...textsRef.current];
                next[slot] = text;
                textsRef.current = next;
                setTexts(next);
              }
              setPressedKey(null);
            }
          }
        }
      } finally {
        setPressedKey(null);
        setPendingMarks(null);
        setShownHops(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- render ----------

  const ticks = fractionLineTicks(den, max);
  const shownTicks = ticks.filter((_, kk) => config.ticksShown || kk % den === 0);
  const labelled = (kk: number) => {
    if (config.labels === 'none') return false;
    if (config.labels === 'ends') return kk === 0 || kk === den * max;
    if (config.labels === 'wholes') return kk % den === 0;
    return true;
  };
  // Crowded labels keep an even stride (always including the wholes).
  const digitW = NUM_PX * 0.62;
  const labelW = anyFractionLabel
    ? String(den * max).length * digitW + 8
    : config.decimalLabels
      ? 3 * digitW + 10
      : String(max).length * digitW + 8;
  const stride = Math.max(1, Math.ceil((labelW + LABEL_GAP) / (unit / den)));
  const labelKs = Array.from({ length: den * max + 1 }, (_, kk) => kk).filter(
    (kk) => labelled(kk) && (kk % den === 0 || kk % stride === 0),
  );
  const tv = targetValue(config);
  const extraLabels = state.labels.filter((l) => !labelKs.some((kk) => near(kk / den, l.a / l.b)));
  const hops = shownHops ?? state.hops;
  const hint = state.hintPartition;
  const marks = pendingMarks ?? state.cuts;

  const invitedAt =
    invite?.op === 'drop' && typeof invite.args?.at === 'number'
      ? invite.args.at
      : invite?.op === 'hop' && typeof invite.args?.k === 'number'
        ? invite.args.k / den
        : null;
  // The invited place on the line (a drop or hop lands there; partition points at the middle).
  const spotAt = invitedAt ?? (invite?.op === 'partition' ? max / 2 : null);
  const invitedSlot: 0 | 1 | null = typing && invite?.op === 'answer' ? active : null;
  // Pip's up-pointing hand under the invited spot on the line or the box to type into (kit
  // `useInviteHand`).
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    ref,
    (root) =>
      spotAt !== null
        ? root.querySelector<HTMLElement>('.ni-fline__spot')
        : invitedSlot !== null
          ? root.querySelector<HTMLElement>(`.ni-fentry__box[data-slot="${invitedSlot}"]`)
          : null,
    spotAt !== null ? `at:${spotAt}` : invitedSlot !== null ? `slot:${invitedSlot}` : '',
  );

  const dotPlaced = mode === 'place' && state.marker !== null;
  const dotStyle = (() => {
    if (dragAt && press.current?.dot)
      return { left: dragAt.x - target / 2, top: dragAt.y - target / 2 };
    if (dotPlaced)
      return { left: xOf(state.marker as number) - target / 2, top: lineY - target - handleClear };
    return null;
  })();

  const fractionLabel = (x: number, a: number | string, b?: number, cls = '') =>
    b === undefined ? (
      <text
        key={`l${x}-${a}`}
        className={`ni-fline__num ${cls}`}
        x={x}
        y={labelsTop + NUM_PX * 0.86}
        textAnchor="middle"
      >
        {a}
      </text>
    ) : (
      <g key={`f${x}-${a}-${b}`} className={`ni-fline__frac ${cls}`}>
        <text className="ni-fline__num" x={x} y={labelsTop + NUM_PX * 0.86} textAnchor="middle">
          {a}
        </text>
        <line
          className="ni-fline__bar"
          x1={x - Math.max(16, labelW / 2 - 4)}
          x2={x + Math.max(16, labelW / 2 - 4)}
          y1={labelsTop + NUM_PX + 3}
          y2={labelsTop + NUM_PX + 3}
        />
        <text className="ni-fline__num" x={x} y={labelsTop + NUM_PX * 1.86 + 8} textAnchor="middle">
          {b}
        </text>
      </g>
    );

  const rangeName = t(strip ? 'ui.frac.strip' : 'ui.frac.line');
  // Counted places (#17 slice 5b): the slider says where its point is as a tick between two
  // numbers, and a read line's picture where the flag is; neither says the fraction.
  const counted = config.ticksShown && !config.decimalLabels;
  const placeText = (p: TickPlace) =>
    p.kind === 'at'
      ? t('ui.frac.at', { n: p.at })
      : t('ui.frac.tick', { k: p.k, n: p.n, lo: p.lo, hi: p.hi });
  const sliderValue = cursor ?? (mode === 'place' ? (state.marker ?? 0) : max / 2);
  const sliderText =
    mode === 'place' && counted
      ? placeText(tickPlace(sliderValue, den, max, config.labels))
      : undefined;
  const flagPlace =
    mode === 'read' && counted && tv !== null && !strip
      ? tickPlace(tv, den, max, config.labels)
      : null;
  const flagKey = (at: boolean) =>
    ruler
      ? at
        ? 'ui.frac.flag-ruler-at'
        : 'ui.frac.flag-ruler-tick'
      : at
        ? 'ui.frac.flag-line-at'
        : 'ui.frac.flag-line-tick';
  const pictureName = !flagPlace
    ? t('ui.widget.picture')
    : flagPlace.kind === 'at'
      ? t(flagKey(true), { max, n: flagPlace.at })
      : t(flagKey(false), {
          max,
          k: flagPlace.k,
          n: flagPlace.n,
          lo: flagPlace.lo,
          hi: flagPlace.hi,
        });
  let side: ReactNode = null;
  if (typing) {
    side = (
      <FractionEntry
        texts={texts}
        active={decimalEntry ? 0 : active}
        onActivate={(slot) => {
          if (!interactive) return;
          trace('tap', slot === 0 ? 'top' : 'bottom');
          setActive(slot);
        }}
        onKey={typeKey}
        onEnter={submit}
        disabled={!interactive}
        decimal={decimalEntry}
        pressedKey={pressedKey}
        invitedSlot={invitedSlot}
        below={<CheckButton onPress={submit} disabled={!interactive || response === null} />}
      />
    );
  } else {
    side = (
      <div className="ni-fline__tools">
        {mode === 'place' ? (
          // What to place, written beside the dot it goes with (the prompt says it too).
          <span className="ni-fline__goalrow">
            {config.target ? (
              <FracNumeral a={config.target.a} b={config.target.b} className="ni-fline__goal" />
            ) : null}
            <span className="ni-fline__home">
              {dotPlaced ? null : (
                <button
                  type="button"
                  className="ni-fline__dot"
                  data-dot="true"
                  aria-label={t('ui.frac.dot')}
                  disabled={!interactive}
                  onPointerDown={onPointerDown}
                  onClick={() => {
                    if (!interactive) return;
                    trace('tap', 'dot');
                    if (speakOnTap) say('ui.frac.dot');
                  }}
                  style={dragAt && press.current?.dot ? { visibility: 'hidden' } : undefined}
                />
              )}
            </span>
          </span>
        ) : null}
        <CheckButton onPress={submit} disabled={!interactive || response === null} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="ni-fline"
      data-mode={mode}
      data-skin={config.skin}
      data-tier={tier}
      data-compact={compact ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={handRootStyle}
    >
      <div
        ref={stageRef}
        className="ni-fline__stage"
        style={{ width: stageW, height: stageH }}
        onPointerDown={onPointerDown}
        data-marks={state.cuts.length}
      >
        <svg
          className="ni-fline__svg"
          width={stageW}
          height={stageH}
          viewBox={`0 0 ${stageW} ${stageH}`}
          role="img"
          aria-label={pictureName}
        >
          {strip ? (
            Array.from({ length: max }, (_, w) => (
              <rect
                // biome-ignore lint/suspicious/noArrayIndexKey: one bar per whole
                key={w}
                className="ni-fline__strip"
                x={xOf(w)}
                y={lineY}
                width={unit}
                height={bandH}
                rx={6}
              />
            ))
          ) : ruler ? (
            <rect
              className="ni-fline__ruler"
              x={x0 - 14}
              y={lineY}
              width={x1 - x0 + 28}
              height={bandH}
              rx={8}
            />
          ) : (
            <line className="ni-fline__axis" x1={x0} x2={x1} y1={lineY} y2={lineY} />
          )}
          {shownTicks.map((v) => {
            const kk = Math.round(v * den);
            const whole = kk % den === 0;
            const y2 = strip
              ? lineY + bandH
              : ruler
                ? lineY + (whole ? 40 : 24)
                : lineY + (whole ? 22 : 14);
            const y1 = strip ? lineY : ruler ? lineY : lineY - (whole ? 22 : 14);
            return (
              <line
                key={kk}
                className={whole ? 'ni-fline__tick ni-fline__tick--whole' : 'ni-fline__tick'}
                data-tick={kk}
                x1={xOf(v)}
                x2={xOf(v)}
                y1={y1}
                y2={y2}
              />
            );
          })}
          {hint
            ? Array.from({ length: hint * max - 1 }, (_, i) => (i + 1) / hint).map((v) => (
                <line
                  key={`h${v}`}
                  className="ni-fline__hint"
                  x1={xOf(v)}
                  x2={xOf(v)}
                  y1={lineY - 18}
                  y2={strip ? lineY + bandH : lineY + 18}
                />
              ))
            : null}
          {hops > 0 ? (
            <g className="ni-fline__hops" data-hops={hops}>
              {Array.from({ length: hops }, (_, i) => {
                const a = xOf(i / den);
                const b = xOf((i + 1) / den);
                const h = Math.min(40, (b - a) / 2);
                return (
                  <path
                    // biome-ignore lint/suspicious/noArrayIndexKey: hops are positional
                    key={i}
                    className="ni-fline__hop"
                    d={`M${a} ${lineY - 4}Q${(a + b) / 2} ${lineY - 4 - 2 * h} ${b} ${lineY - 4}`}
                  />
                );
              })}
            </g>
          ) : null}
          {marks.map((m) => (
            <line
              key={`m${m}`}
              className="ni-fline__cut"
              data-cut={m}
              x1={xOf(m)}
              x2={xOf(m)}
              y1={lineY - (strip ? 6 : 26)}
              y2={strip ? lineY + bandH + 6 : lineY + 26}
            />
          ))}
          {tv !== null && typing ? (
            // The pole stops above the tick and an open ring marks the point, so the tick the
            // child reads (and its neighbours) stay fully visible.
            <g className="ni-fline__flag" data-at={tv}>
              <line x1={xOf(tv)} x2={xOf(tv)} y1={lineY - 76} y2={lineY - 28} />
              <path d={`M${xOf(tv)} ${lineY - 76}l34 12l-34 12Z`} />
              <circle cx={xOf(tv)} cy={lineY} r={14} />
            </g>
          ) : null}
          {dotPlaced && !(dragAt && press.current?.dot) ? (
            // The placed dot stands above the ticks on a stem down to its point.
            <line
              className="ni-fline__stem"
              x1={xOf(state.marker as number)}
              x2={xOf(state.marker as number)}
              y1={lineY - handleClear}
              y2={lineY}
            />
          ) : null}
          {flash !== null ? (
            <circle className="ni-fline__flash" cx={xOf(flash)} cy={lineY} r={20} />
          ) : null}
          {cursor !== null && !typing ? (
            <line
              className="ni-fline__cursor"
              x1={xOf(cursor)}
              x2={xOf(cursor)}
              y1={lineY - 40}
              y2={strip ? lineY + bandH + 10 : lineY + 40}
            />
          ) : null}
          <g className="ni-fline__labels">
            {labelKs.map((kk) => {
              const lp = labelParts(kk, den, config.decimalLabels);
              return 'whole' in lp
                ? fractionLabel(xOf(kk / den), lp.whole as string)
                : fractionLabel(xOf(kk / den), lp.a as number, lp.b as number);
            })}
            {extraLabels.map((l) =>
              fractionLabel(xOf(l.a / l.b), l.a, l.b, 'ni-fline__frac--hint'),
            )}
          </g>
        </svg>
        {mode === 'partition'
          ? state.cuts.map((m, i) => (
              <button
                key={`b${m}`}
                type="button"
                className="ni-fline__mark"
                data-mark={i}
                style={{ left: xOf(m) - target / 2, top: lineY - target - handleClear }}
                aria-label={t('ui.frac.mark', { n: i + 1 })}
                disabled={!interactive}
                onClick={(e) => {
                  // Keyboard (Enter or Space on the pin); a pointer tap is handled on the stage.
                  if (e.detail === 0 && interactive) removeMark(i);
                }}
              >
                <span className="ni-fline__pin" aria-hidden="true" />
              </button>
            ))
          : null}
        {mode === 'place' && dotStyle ? (
          <button
            type="button"
            className="ni-fline__dot ni-fline__dot--on"
            data-dot="true"
            aria-label={t('ui.frac.dot')}
            disabled={!interactive}
            onClick={(e) => {
              // Keyboard (Enter or Space on the dot); a pointer tap is handled on the stage.
              if (e.detail === 0 && interactive) takeDot();
            }}
            style={dotStyle}
          />
        ) : null}
        {typing ? null : (
          <input
            type="range"
            className="ni-fline__range"
            aria-label={rangeName}
            min={0}
            max={max}
            step={cursorStep}
            value={sliderValue}
            aria-valuetext={sliderText}
            disabled={!interactive}
            onFocus={() =>
              setCursor((c) => c ?? (mode === 'place' ? (state.marker ?? 0) : max / 2))
            }
            onBlur={() => setCursor(null)}
            onChange={onRange}
            onKeyDown={onRangeKey}
            style={{ left: x0, width: x1 - x0, top: lineY - 20 }}
          />
        )}
        {spotAt !== null ? (
          // The invited spot on the line: a ring Pip's hand points at (and the child sees).
          <span
            className="ni-fline__spot ni-invite"
            aria-hidden="true"
            style={{
              left: xOf(spotAt) - 22,
              top: strip ? lineY : lineY - 22,
              height: strip ? bandH : 44,
            }}
          />
        ) : null}
      </div>
      <div ref={sideRef} className="ni-fline__side">
        {side}
      </div>
      {inviteHand}
    </div>
  );
}

export default FractionLineWidget;
