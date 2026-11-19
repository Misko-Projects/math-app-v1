import { formatModel } from '@number-island/engine';
import type { ResponseValue, WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type KeyboardEvent,
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
import { ArrowIcon } from '../../primitives/icons';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  NumberPadKeys,
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
import './hundred-chart.css';

/**
 * `hundred-chart` (03 §5.5, Road Crew W1): ten columns from `first`, `rows` rows (10, or 12 for a
 * 1–120 chart). Hidden cells are blank. The cell at row r, column c always shows
 * first + 10(r − 1) + (c − 1): 10(r − 1) + c on a 1–100 chart, 100 more on a 101–200 one.
 *
 * - `find` / `next` / `move`: the number is tapped on the chart (or typed, see below) and "check"
 *   → `number`. The `from` cell carries a start flag; `move` lists its arrows above the chart.
 * - `fill`: the hidden numbers are typed on the pad, into the blank being filled (a thick ring and
 *   a caret; full blanks move on in reading order; backspace on an empty blank goes back one) →
 *   `numbers` in the config's hidden order (reading order).
 * - `pattern`: cells are tapped to select a set (shaded, ringed and dotted, never colour alone) →
 *   state `{ values }`; typed and marked with the pad where cells cannot be tapped.
 *
 * Size and layout (06 §1, §4). Ten tappable cells across need 10 × 64 + 9 × 12 = 748 px in G1 and
 * 908 px in K, and ten rows of them could never fit a widget area 319 px tall (960 × 600). So the
 * chart is a WINDOW of whole rows (as many as fit, always all ten columns, every number in its
 * true place) with row stepping: "go up" and "go down" buttons and a small map of the whole chart
 * with the shown rows marked. The window starts on the rows the task needs (the start cell, the
 * blanks) and follows the blank being filled, a demo's highlight and the keyboard focus.
 * Cells are buttons only where ten of them fit across at the full target size (G1 from 960 px
 * wide, K from 1280 px); otherwise the chart is a picture (cells 44–72 px, numerals ≥ 32 px) and
 * the answer is typed on the pad: 03 §5.5 answers find / next / move with "the tapped or typed
 * value". `fill` always types (the chart is a picture beside the pad).
 *
 * Invites (03 §6.3) ring ONE enabled control and Pip's hand (kit `useInviteHand`) points at it,
 * only while the child can act: `tap {n}` / `answer {value}` the cell (stepping the window to it
 * first) or, typed, the next pad key; `answer {values}` the next key of the blank being filled;
 * then Check.
 *
 * Arrow keys move between cells (one tab stop, the window follows); Enter or Space taps.
 * Trace: `tap` `cell-<n>`, `tap` `key-<k>`, `tap` `rows-up` / `rows-down`, `tap` `mark`.
 * Demo ops: `tap {n}`, `highlight-row {n}` and `highlight-col {n}` (the row or column holding
 * number n), `slide {dir}`, plus `answer`.
 */

const OPS = ['tap', 'highlight-row', 'highlight-col', 'slide', 'answer'] as const;
const MODEL = formatModel('hundred-chart');
const SLIDE_MS = 420;
const KEY_MS = 300;
const EDGE = 4;
/** A room shorter than this gets the tight spacing, the compact Check and regular numerals. */
const SHORT_ROOM = 460;
/** Picture cells: tall enough for a 32 px numeral, never wider than this. */
const PIC_H = 48;
const PIC_MAX_W = 72;
/** Narrowest picture cell: a two-digit numeral at 32 px (wider numbers are condensed to fit). */
const PIC_MIN_W = 44;
/** The moves strip (move mode): one arrow tile per move. */
const MOVE_TILE = 44;
/** The small map of the whole chart, beside the steppers. */
const MAP_CELL = 5;
/**
 * How far Pip's hand reaches below a bottom-row pad key's cell (kit useInviteHand: fingertip 10 px
 * up the key, the 56 px hand, its 8 px bob and 10 px edge margin, less the key's 4 px ledge).
 */
const HAND_REACH = 52;

type Config = ConfigFor<'hundred-chart'>;
type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];
const STEP: Record<Dir, number> = { up: -10, down: 10, left: -1, right: 1 };
const ROTATE: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };

function MoveArrow({ dir }: { dir: Dir }) {
  return (
    <span className="ni-hc__arrow" style={{ transform: `rotate(${ROTATE[dir]}deg)` }}>
      <ArrowIcon />
    </span>
  );
}

// ---------- layout ----------

type PadShape = '3x4' | '4x3';

interface Plan {
  /** Cells are buttons (`tap`) or a picture whose answer is typed (`type`). */
  cells: 'tap' | 'type';
  cellW: number;
  cellH: number;
  gap: number;
  rowsShown: number;
  /** `tap`: the chart with a side column (steppers, map, Check). `side`: the pad beside the chart,
   * the steppers / answer / Check under it. `stack`: chart on top, the rest under it. */
  layout: 'tap' | 'side' | 'stack';
  pad: { shape: PadShape; key: number } | null;
  map: boolean;
  short: boolean;
  /** Fits with room for Pip's hand under the pad; fits while no pad key is invited. */
  fits: boolean;
  fitsAtRest: boolean;
  h: number;
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

/** Rows (from 0) the task is about: the start, the blanks, the pattern's start. */
function taskRows(c: Config): number[] {
  const row = (n: number) => Math.floor((n - c.first) / 10);
  const out: number[] = [];
  if (c.from !== undefined) out.push(row(c.from));
  for (const h of c.hidden) out.push(row(h));
  if (c.mode === 'pattern' && c.patternStart !== undefined) out.push(row(c.patternStart));
  return out.filter((r) => r >= 0 && r < c.rows);
}

function planLayout(c: Config, room: WidgetRoom | null, age: AgeMode, m: Measured): Plan {
  const T = MIN_TARGET_PX[age];
  const big = age === 'k' ? 96 : 76;
  const roomH = room?.height ?? Number.POSITIVE_INFINITY;
  const short = roomH < SHORT_ROOM;
  const G = short ? TARGET_GAP_PX : 20;
  const W = Math.min(room?.width ?? 1180, 1180) - 2 * EDGE;
  // An unbounded room (a growing page) still gets a chart a screen can hold.
  const H = Math.min(roomH, 760) - 2 * EDGE;
  const movesH = c.mode === 'move' && c.moves?.length ? MOVE_TILE + 32 + G : 0;
  const mapW = 10 * MAP_CELL + 8;
  const mapH = c.rows * MAP_CELL + 8;
  /**
   * Every plan, keeping `reach` px free under each column's lowest control for Pip's hand (an
   * invite there would otherwise add room below the widget and scroll the area).
   */
  const gen = (reach: number): Plan[] => {
    const plans: Plan[] = [];

    // 1. Tappable cells, a side column: up, map, down, Check (not for fill: it types).
    if (c.mode !== 'fill') {
      const chartW = 10 * T + 9 * TARGET_GAP_PX;
      const sideW = Math.max(T, m.check.w, mapW);
      if (chartW + G + sideW <= W) {
        const cellW = Math.min(
          Math.floor((W - G - sideW - 9 * TARGET_GAP_PX) / 10),
          Math.round(T * 1.25),
        );
        const fitRows = Math.floor((H - reach - movesH + TARGET_GAP_PX) / (T + TARGET_GAP_PX));
        const rowsShown = Math.max(1, Math.min(c.rows, fitRows));
        const paged = rowsShown < c.rows;
        // The steppers stand on a 6 px ledge.
        const sideFull = (paged ? 2 * (T + 6) + mapH + 3 * G : 0) + m.check.h;
        const sideNoMap = (paged ? 2 * (T + 6) + 2 * G : 0) + m.check.h;
        // Pip's hand hangs below the bottom control of each column (a cell, Check).
        const map = paged && sideFull + reach <= H;
        const h =
          Math.max(
            movesH + rowsShown * (T + TARGET_GAP_PX) - TARGET_GAP_PX,
            map ? sideFull : sideNoMap,
          ) + reach;
        // Two rows are enough when the moves strip takes the third (move items step anyway).
        const minRows = Math.min(movesH > 0 ? 2 : 3, c.rows);
        const ok = rowsShown >= minRows && h <= H;
        plans.push({
          cells: 'tap',
          cellW,
          cellH: T,
          gap: TARGET_GAP_PX,
          rowsShown,
          layout: 'tap',
          pad: null,
          map,
          short,
          fits: ok,
          fitsAtRest: ok,
          h,
        });
      }
    }

    // 2. A picture chart and the pad: the answer is typed.
    // A typed answer shows in a display (fill types into the blanks themselves).
    const readout = c.mode !== 'fill';
    const pads: { shape: PadShape; key: number }[] = [
      { shape: '3x4', key: big },
      { shape: '3x4', key: T + 4 },
      { shape: '4x3', key: T + 4 },
    ];
    // Under the chart: the steppers (and map), the readout and Check, in one row.
    const underW = (map: boolean) =>
      2 * T +
      TARGET_GAP_PX +
      (map ? G + mapW : 0) +
      (readout ? G + m.readout.w : 0) +
      (c.mode === 'pattern' ? G + T : 0) +
      G +
      m.check.w;
    const underH = Math.max(T + 6, m.check.h, readout ? m.readout.h : 0);
    for (const pad of pads) {
      const p = padBox(pad.shape, pad.key);
      // side: the pad beside the chart (a picture chart has a 3 px frame).
      {
        const chartW = W - G - p.w - 6;
        const cellW = Math.min(PIC_MAX_W, Math.floor(chartW / 10));
        const fitRows = Math.floor((H - movesH - G - underH - 6 - reach) / PIC_H);
        const rowsShown = Math.max(1, Math.min(c.rows, fitRows));
        const map = rowsShown < c.rows && underW(true) <= 10 * cellW;
        const under = underW(map);
        // The under row (steppers, Check) needs Pip's hand's room below it too.
        const chartH = movesH + rowsShown * PIC_H + 6 + G + underH + reach;
        const ok =
          cellW >= PIC_MIN_W && rowsShown >= Math.min(3, c.rows) && under <= 10 * cellW + 0.5;
        plans.push({
          cells: 'type',
          cellW,
          cellH: PIC_H,
          gap: 0,
          rowsShown,
          layout: 'side',
          pad,
          map,
          short,
          fits: ok && Math.max(chartH, p.h + reach) <= H,
          fitsAtRest: ok && Math.max(chartH - reach, p.h) <= H,
          h: Math.max(chartH, p.h + reach),
        });
      }
      // stack: the chart on top; under it the steppers (and map) over the answer and Check, beside
      // the pad.
      {
        const cellW = Math.min(PIC_MAX_W, Math.floor((W - 6) / 10));
        // Mark (typed pattern) joins the steppers' row.
        const stepRow = {
          w: 2 * T + TARGET_GAP_PX + G + mapW + (c.mode === 'pattern' ? G + T : 0),
          h: T + 6,
        };
        const answerRow = {
          w: (readout ? m.readout.w + G : 0) + m.check.w,
          h: Math.max(m.check.h, readout ? m.readout.h : 0),
        };
        const below = Math.max(p.h, stepRow.h + G + answerRow.h);
        const belowW = Math.max(stepRow.w, answerRow.w) + G + p.w;
        const fitRows = Math.floor((H - movesH - 6 - G - below - reach) / PIC_H);
        const rowsShown = Math.max(1, Math.min(c.rows, fitRows));
        const h = movesH + rowsShown * PIC_H + 6 + G + below;
        const ok = cellW >= PIC_MIN_W && rowsShown >= Math.min(4, c.rows) && belowW <= W - 4;
        plans.push({
          cells: 'type',
          cellW,
          cellH: PIC_H,
          gap: 0,
          rowsShown,
          layout: 'stack',
          pad,
          map: rowsShown < c.rows,
          short,
          fits: ok && h + reach <= H,
          fitsAtRest: ok && h <= H,
          h: h + reach,
        });
      }
    }
    return plans;
  };
  const strict = gen(HAND_REACH);
  const best = strict.find((p) => p.fits);
  if (best) return best;
  // Nothing keeps room for the hand: the first plan that fits at rest (an invite on a bottom
  // control then adds a little room below; K's pad keys at 960 × 600 are the known case).
  const relaxed = gen(0).find((p) => p.fits);
  if (relaxed) return { ...relaxed, fits: false, fitsAtRest: true };
  return strict.reduce((a, b) => (b.h < a.h ? b : a), strict[0] as Plan);
}

/**
 * The border-box size of an element (fixed-size controls), measured after every render: the
 * element may move to another part of the layout (and remount) when the plan changes.
 */
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
  });
  return size;
}

/** Where an invite points: one pressable control. */
type Cue =
  | { at: 'cell'; n: number }
  | { at: 'rows'; dir: 'up' | 'down' }
  | { at: 'key'; key: PadKey }
  | { at: 'mark' }
  | { at: 'check' };

function cueTarget(root: HTMLElement, cue: Cue): HTMLElement | null {
  const byData = (sel: string, key: string, value: string) =>
    [...root.querySelectorAll<HTMLElement>(sel)].find((el) => el.dataset[key] === value) ?? null;
  switch (cue.at) {
    case 'cell':
      return byData('button.ni-hc__cell', 'n', String(cue.n));
    case 'rows':
      return byData('.ni-hc__step', 'dir', cue.dir);
    case 'key':
      return byData('.ni-pad__key', 'key', cue.key);
    case 'mark':
      return root.querySelector<HTMLElement>('.ni-hc__mark');
    case 'check':
      return root.querySelector<HTMLElement>('.ni-hc__checkslot .ni-btn');
  }
}

const cueKeyOf = (cue: Cue | null): string => {
  if (!cue) return '';
  switch (cue.at) {
    case 'cell':
      return `cell:${cue.n}`;
    case 'rows':
      return `rows:${cue.dir}`;
    case 'key':
      return `key:${cue.key}`;
    default:
      return cue.at;
  }
};

export function HundredChartWidget({
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
  const last = c.first + c.rows * 10 - 1;
  const hidden = new Set(c.hidden);
  const readingOrder = [...c.hidden].sort((a, b) => a - b);
  const maxDigits = String(last).length;
  const fill = c.mode === 'fill';
  const pattern = c.mode === 'pattern';

  const [selected, setSelected] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [answerText, setAnswerText] = useState('');
  const [active, setActive] = useState<number | null>(readingOrder[0] ?? null);
  const [focusCell, setFocusCell] = useState<number>(c.from ?? c.first);
  const [band, setBand] = useState<{ kind: 'row' | 'col'; n: number } | null>(null);
  const [token, setToken] = useState<number | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [pulse, setPulse] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const checkRef = useRef<HTMLSpanElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const typedRef = useRef(typed);
  typedRef.current = typed;

  const interactive = !disabled && !demoBusy;
  const rowOf = (n: number) => Math.floor((n - c.first) / 10);
  const colOf = (n: number) => (n - c.first) % 10;
  const onChart = (n: number) => n >= c.first && n <= last;

  // ---------- layout and the window of rows ----------

  const room = useWidgetRoom(rootRef);
  const short = (room?.height ?? Number.POSITIVE_INFINITY) < SHORT_ROOM;
  const check = useBoxSize(checkRef, {
    w: ageMode === 'k' || short ? MIN_TARGET_PX[ageMode] + 16 : 180,
    h: (ageMode === 'k' ? 96 : 76) + 6,
  });
  const readoutSize = useBoxSize(readoutRef, { w: 130, h: ageMode === 'k' ? 96 : 76 });
  const plan = planLayout(c, room, ageMode, { check, readout: readoutSize });
  const tap = plan.cells === 'tap';
  const n = plan.rowsShown;
  const clampTop = (top: number) => Math.max(0, Math.min(c.rows - n, top));
  /** The top row that shows `row`, moving as little as possible from `from`. */
  const showRow = (from: number, row: number) =>
    clampTop(row < from ? row : row > from + n - 1 ? row - n + 1 : from);
  const initialTop = () => {
    const rows = taskRows(c);
    if (rows.length === 0) return 0;
    const lo = Math.min(...rows);
    const hi = Math.max(...rows);
    // The task's rows, centred, with a row of context above when there is room.
    if (hi - lo + 1 <= n) return clampTop(lo - Math.floor((n - (hi - lo + 1)) / 2));
    return clampTop(lo);
  };
  const [top, setTop] = useState<number | null>(null);
  const shownTop = clampTop(top ?? initialTop());
  // `top` stays null (the window sits on the task's rows, re-centred as the plan settles) until
  // the child, the keyboard or a demo moves it.
  const inWindow = (num: number) => {
    const r = rowOf(num);
    return r >= shownTop && r < shownTop + n;
  };
  const reveal = (num: number) => {
    if (onChart(num)) setTop((prev) => showRow(clampTop(prev ?? initialTop()), rowOf(num)));
  };

  const stepRows = (dir: 'up' | 'down') => {
    if (!interactive) return;
    trace('tap', `rows-${dir}`);
    setTop(clampTop(shownTop + (dir === 'up' ? -1 : 1)));
  };

  // ---------- taps ----------

  const tapCell = (num: number) => {
    if (!interactive) return;
    trace('tap', `cell-${num}`);
    setFocusCell(num);
    // Never say a hidden number: that would give the answer away.
    if (speakOnTap && !hidden.has(num)) sayNumber(num);
    if (fill) {
      if (hidden.has(num)) setActive(num);
      return;
    }
    if (pattern) {
      setPicked((prev) => (prev.includes(num) ? prev.filter((x) => x !== num) : [...prev, num]));
      return;
    }
    setSelected(num);
  };

  const onCellKeyDown = (e: KeyboardEvent, num: number) => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 10,
      ArrowUp: -10,
    };
    let next: number | null = null;
    if (e.key in moves) next = num + (moves[e.key] as number);
    else if (e.key === 'Home') next = num - colOf(num);
    else if (e.key === 'End') next = num - colOf(num) + 9;
    if (next === null) return;
    e.preventDefault();
    if (!onChart(next)) return;
    setFocusCell(next);
    reveal(next);
  };
  // Focus follows the roving cell once the window shows it.
  const wantFocus = useRef(false);
  useLayoutEffect(() => {
    if (!wantFocus.current) return;
    const el = [
      ...(gridRef.current?.querySelectorAll<HTMLElement>('button.ni-hc__cell') ?? []),
    ].find((b) => b.dataset.n === String(focusCell));
    if (el && document.activeElement !== el) el.focus();
  });

  // ---------- typing ----------

  const typeInto = (num: number, key: PadKey) => {
    const before = typedRef.current[num] ?? '';
    if (key === 'back' && before === '') {
      // Backspace on an empty blank goes back to the blank before it.
      const prev = [...readingOrder].reverse().find((h) => h < num);
      if (prev !== undefined) {
        setActive(prev);
        reveal(prev);
      }
      return;
    }
    const text = applyPadKey(before, key, maxDigits);
    const next = { ...typedRef.current, [num]: text };
    typedRef.current = next;
    setTyped(next);
    // A blank full of digits moves on to the next empty one (reading order).
    if (key !== 'back' && text.length >= String(num).length) {
      const after = readingOrder.find((h) => h > num && !next[h]);
      const before2 = readingOrder.find((h) => !next[h]);
      const to = after ?? before2;
      if (to !== undefined) {
        setActive(to);
        reveal(to);
      }
    }
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    if (fill) {
      if (active !== null) typeInto(active, key);
      return;
    }
    setAnswerText((prev) => applyPadKey(prev, key, maxDigits));
  };
  const typedAnswer = padValue(answerText);

  /** Pattern, typed: the typed number is marked (or unmarked) on the chart. */
  const mark = () => {
    if (!interactive || typedAnswer === null || !onChart(typedAnswer)) return;
    trace('tap', 'mark');
    const v = typedAnswer;
    setPicked((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
    setAnswerText('');
    reveal(v);
  };

  // ---------- check (through the format model) ----------

  const response = (): ResponseValue | null => {
    if (!MODEL) return null;
    let s = MODEL.initialState(c);
    if (fill) {
      const values = c.hidden.map((h) => padValue(typed[h] ?? ''));
      if (values.some((v) => v === null)) return null;
      s = MODEL.apply(s, { op: 'answer', args: { values: values as number[] } });
    } else if (pattern) {
      if (picked.length === 0) return null;
      s = MODEL.apply(s, { op: 'answer', args: { values: picked } });
    } else if (tap) {
      if (selected !== null) s = MODEL.apply(s, { op: 'tap', args: { n: selected } });
    } else if (typedAnswer !== null) {
      s = MODEL.apply(s, { op: 'answer', args: { value: typedAnswer } });
    }
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

  const num = (a: WidgetAction, key: string) => {
    const v = a.args?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const typeCell = async (cell: number, value: number) => {
    if (reduced) {
      // Reduced motion: the number appears at once (no key-by-key typing).
      setActive(cell);
      reveal(cell);
      const next = { ...typedRef.current, [cell]: String(value) };
      typedRef.current = next;
      setTyped(next);
      return;
    }
    setActive(cell);
    reveal(cell);
    let text = '';
    for (const ch of String(value).split('') as PadKey[]) {
      setPressedKey(ch);
      await pause(reduced ? 0 : KEY_MS);
      if (!alive.current) return;
      text = applyPadKey(text, ch, maxDigits);
      const next = { ...typedRef.current, [cell]: text };
      typedRef.current = next;
      setTyped(next);
    }
    setPressedKey(null);
    await pause(reduced ? 0 : KEY_MS);
  };
  const typeAnswer = async (value: number) => {
    if (reduced) {
      setAnswerText(String(value));
      return;
    }
    let text = '';
    setAnswerText('');
    for (const ch of String(value).split('') as PadKey[]) {
      setPressedKey(ch);
      await pause(reduced ? 0 : KEY_MS);
      if (!alive.current) return;
      text = applyPadKey(text, ch, maxDigits);
      setAnswerText(text);
    }
    setPressedKey(null);
    await pause(reduced ? 0 : KEY_MS);
  };
  /** Pip chooses the number: the cell lights up, then it is selected (and typed when typing). */
  const chooseCell = async (value: number) => {
    reveal(value);
    setPulse(value);
    await pause(reduced ? 0 : 500);
    if (!alive.current) return;
    setPulse(null);
    if (!hidden.has(value)) sayNumber(value);
    if (pattern) {
      setPicked((prev) =>
        prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
      );
    } else {
      setSelected(value);
      if (!tap) await typeAnswer(value);
    }
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      try {
        if (action.op === 'tap') {
          const v = num(action, 'n');
          if (v === null || !onChart(v)) return;
          if (fill && hidden.has(v)) {
            // Pip fills the blank: "the next one is …".
            await typeCell(v, v);
            sayNumber(v);
          } else if (fill) {
            reveal(v);
            setPulse(v);
            sayNumber(v);
            await pause(reduced ? 0 : 500);
            if (alive.current) setPulse(null);
          } else {
            await chooseCell(v);
          }
          setToken(v);
          await pause(reduced ? 0 : 300);
        } else if (action.op === 'highlight-row' || action.op === 'highlight-col') {
          const v = num(action, 'n');
          if (v === null || !onChart(v)) return;
          if (action.op === 'highlight-row') reveal(v);
          setBand({ kind: action.op === 'highlight-row' ? 'row' : 'col', n: v });
          if (!hidden.has(v)) sayNumber(v);
          await pause(reduced ? 0 : 1100);
        } else if (action.op === 'slide') {
          const dir = action.args?.dir;
          if (typeof dir !== 'string' || !DIRS.includes(dir as Dir)) return;
          const from = token ?? selected ?? c.from ?? c.first;
          const to = from + STEP[dir as Dir];
          // A slide never wraps round a row's end.
          if (!onChart(to) || (Math.abs(STEP[dir as Dir]) === 1 && rowOf(to) !== rowOf(from)))
            return;
          reveal(to);
          setToken(to);
          await pause(reduced ? 0 : SLIDE_MS + 120);
          if (!alive.current) return;
          if (!hidden.has(to)) sayNumber(to);
        } else if (action.op === 'answer') {
          const values = action.args?.values;
          if (Array.isArray(values)) {
            const list = values.filter((v): v is number => typeof v === 'number');
            if (fill) {
              // `answer` replaces every entry, like the engine model: unnamed cells clear.
              typedRef.current = {};
              setTyped({});
              for (let i = 0; i < c.hidden.length; i++) {
                const h = c.hidden[i] as number;
                const v = list[i];
                if (v !== undefined) await typeCell(h, v);
                if (!alive.current) return;
              }
            } else if (pattern) {
              setPicked(list.filter(onChart));
            }
          } else {
            const v = num(action, 'value');
            if (v === null) return;
            if (fill) {
              typedRef.current = {};
              setTyped({});
              const h = c.hidden[0];
              if (h !== undefined) await typeCell(h, v);
            } else if (pattern) setPicked(onChart(v) ? [v] : []);
            else if (onChart(v)) await chooseCell(v);
          }
          await pause(reduced ? 0 : 300);
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
    if (!invite || !interactive) return null;
    const checkCue: Cue | null = ready ? { at: 'check' } : null;
    const keysFor = (want: string, have: string): Cue | null => {
      if (have === want) return null;
      if (want.startsWith(have)) return { at: 'key', key: want[have.length] as PadKey };
      return { at: 'key', key: 'back' };
    };
    /** Choose number v: tap it (stepping the window to it first) or type it. */
    const chooseCue = (v: number): Cue | null => {
      if (!onChart(v)) return null;
      if (tap) {
        if (pattern ? picked.includes(v) : selected === v) return checkCue;
        if (!inWindow(v)) return { at: 'rows', dir: rowOf(v) < shownTop ? 'up' : 'down' };
        return { at: 'cell', n: v };
      }
      if (pattern && picked.includes(v)) return checkCue;
      const keys = keysFor(String(v), answerText);
      if (keys) return keys;
      return pattern ? { at: 'mark' } : checkCue;
    };
    /** Fill the blanks with `values` (hidden order): the next key of the first wrong blank. */
    const fillCue = (values: number[]): Cue | null => {
      for (const h of readingOrder) {
        const i = c.hidden.indexOf(h);
        const want = values[i];
        if (want === undefined) continue;
        const have = typed[h] ?? '';
        if (have === String(want)) continue;
        if (active !== h) return null;
        return keysFor(String(want), have);
      }
      return checkCue;
    };
    if (invite.op === 'tap') {
      const v = num(invite, 'n');
      if (v === null) return null;
      if (fill)
        return hidden.has(v) ? fillCue(c.hidden.map((h) => (h === v ? v : Number.NaN))) : null;
      return chooseCue(v);
    }
    if (invite.op !== 'answer') return null;
    const values = invite.args?.values;
    if (Array.isArray(values)) {
      const list = values.filter((v): v is number => typeof v === 'number');
      return fill ? fillCue(list) : checkCue;
    }
    const v = num(invite, 'value');
    if (v === null) return checkCue;
    return fill ? fillCue([v]) : chooseCue(v);
  })();
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => (cue ? cueTarget(root, cue) : null),
    cue ? `${cueKeyOf(cue)}|${plan.layout}|${plan.cellW}|${shownTop}` : '',
  );

  // ---------- render ----------

  const cellLabel = (v: number) => {
    if (hidden.has(v)) {
      const typedText = typed[v];
      return typedText ? `${t('ui.hc.missing')}: ${typedText}` : t('ui.hc.missing');
    }
    return v === c.from ? t('ui.hc.start', { n: v }) : String(v);
  };
  const pos = (v: number) => ({
    left: colOf(v) * (plan.cellW + plan.gap),
    top: (rowOf(v) - shownTop) * (plan.cellH + plan.gap),
  });
  const gridW = 10 * plan.cellW + 9 * plan.gap;
  const gridH = n * plan.cellH + (n - 1) * plan.gap;
  const bandStyle =
    band && (band.kind === 'col' || inWindow(band.n))
      ? band.kind === 'row'
        ? { left: -6, top: pos(band.n).top - 6, width: gridW + 12, height: plan.cellH + 12 }
        : { left: pos(band.n).left - 6, top: -6, width: plan.cellW + 12, height: gridH + 12 }
      : null;
  // Numerals wider than their cell are condensed (never smaller than 32 px tall).
  const digitsFit = Math.max(2, Math.floor((plan.cellW - 6) / 17));
  const windowCells: number[] = [];
  for (let r = shownTop; r < shownTop + n; r++) {
    for (let col = 0; col < 10; col++) windowCells.push(c.first + r * 10 + col);
  }
  const firstShown = windowCells[0] as number;
  const lastShown = windowCells.at(-1) as number;
  const paged = n < c.rows;

  const cells = windowCells.map((v) => {
    const isHidden = hidden.has(v);
    const isActive = fill && isHidden && active === v && interactive;
    const isSelected = pattern ? picked.includes(v) : !fill && selected === v;
    const text = isHidden ? (typed[v] ?? '') : String(v);
    const squeeze = text.length > digitsFit ? digitsFit / text.length : 1;
    const common = {
      className: ['ni-hc__cell', cue?.at === 'cell' && cue.n === v ? 'ni-invite' : '']
        .filter(Boolean)
        .join(' '),
      'data-n': v,
      'data-row': rowOf(v) + 1,
      'data-col': colOf(v) + 1,
      'data-hidden': isHidden ? 'true' : undefined,
      'data-active': isActive ? 'true' : undefined,
      'data-selected': isSelected ? 'true' : undefined,
      'data-start': v === c.from ? 'true' : undefined,
      'data-pulse': pulse === v ? 'true' : undefined,
      'data-decade': colOf(v) === 9 ? 'true' : undefined,
    };
    const body = (
      <>
        <span
          className="ni-hc__num"
          aria-hidden={tap ? true : undefined}
          style={squeeze < 1 ? { transform: `scaleX(${squeeze.toFixed(3)})` } : undefined}
        >
          {text}
        </span>
        {/* The caret waits in a blank until it is full (it never sits on a finished number). */}
        {isActive && text.length < String(v).length ? (
          <span className="ni-hc__caret" aria-hidden="true" />
        ) : null}
      </>
    );
    return tap ? (
      <button
        key={v}
        type="button"
        {...common}
        aria-label={cellLabel(v)}
        aria-pressed={isSelected}
        tabIndex={focusCell === v || (!inWindow(focusCell) && v === firstShown) ? 0 : -1}
        disabled={!interactive}
        onClick={() => tapCell(v)}
        onKeyDown={(e) => {
          wantFocus.current = true;
          onCellKeyDown(e, v);
        }}
        onFocus={() => setFocusCell(v)}
      >
        {body}
      </button>
    ) : (
      // A picture cell: its numeral is its text; a blank says what it is to a screen reader.
      <span key={v} {...common}>
        {body}
        {isHidden ? <span className="ni-visually-hidden">{cellLabel(v)}</span> : null}
      </span>
    );
  });

  const stepBtn = (dir: 'up' | 'down') => (
    <button
      key={dir}
      type="button"
      className={['ni-hc__step', cue?.at === 'rows' && cue.dir === dir ? 'ni-invite' : '']
        .filter(Boolean)
        .join(' ')}
      data-dir={dir}
      aria-label={t(dir === 'up' ? 'ui.hc.rows-up' : 'ui.hc.rows-down')}
      disabled={!interactive || (dir === 'up' ? shownTop === 0 : shownTop + n >= c.rows)}
      onClick={() => stepRows(dir)}
    >
      <span className="ni-hc__stepicon ni-btn__icon">
        <MoveArrow dir={dir} />
      </span>
    </button>
  );

  const map =
    paged && plan.map ? (
      <span
        className="ni-hc__map"
        role="img"
        aria-label={t('ui.hc.window', { from: firstShown, to: lastShown })}
        style={{ width: 10 * MAP_CELL, height: c.rows * MAP_CELL }}
      >
        <span
          className="ni-hc__mapband"
          style={{ top: 4 + shownTop * MAP_CELL - 2, height: n * MAP_CELL + 4 }}
        />
      </span>
    ) : null;

  const moves =
    c.mode === 'move' && c.moves?.length ? (
      <ul className="ni-hc__moves" aria-label={t('ui.hc.moves')}>
        {c.moves.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: moves are positional
          <li key={i} className="ni-hc__move" aria-label={t(`ui.hc.move.${m}`)}>
            <MoveArrow dir={m} />
          </li>
        ))}
      </ul>
    ) : null;

  const checkEl = (
    <span ref={checkRef} className="ni-hc__checkslot">
      <CheckButton
        onPress={submit}
        disabled={!interactive || !ready}
        invited={cue?.at === 'check'}
        compact={plan.short}
      />
    </span>
  );

  const readout =
    !tap && !fill ? (
      <span ref={readoutRef} className="ni-hc__readout">
        <NumberDisplay
          value={answerText === '' ? null : answerText}
          digits={2}
          size={plan.short ? undefined : 'lg'}
          state={interactive ? 'active' : 'idle'}
          label="ui.widget.answer"
          speakOnTap={false}
        />
      </span>
    ) : null;

  const markEl =
    !tap && pattern ? (
      <button
        type="button"
        className={['ni-hc__mark', cue?.at === 'mark' ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        aria-label={t('ui.hc.mark')}
        disabled={!interactive || typedAnswer === null || !onChart(typedAnswer)}
        onClick={mark}
      >
        <span className="ni-hc__markicon ni-btn__icon" aria-hidden="true" />
      </button>
    ) : null;

  return (
    <div
      ref={rootRef}
      className="ni-hc"
      data-tier={tier}
      data-mode={c.mode}
      data-cells={plan.cells}
      data-layout={plan.layout}
      data-rows-shown={n}
      data-top={shownTop + 1}
      data-pad-shape={plan.pad?.shape}
      data-fits={plan.fits ? 'true' : plan.fitsAtRest ? 'at-rest' : 'false'}
      data-disabled={disabled ? 'true' : undefined}
      style={
        {
          '--pad-key': plan.pad ? `${plan.pad.key}px` : undefined,
          // A 64 px key (G1 minimum): a 36 px digit, so Pip's fingertip fits under it.
          '--pad-digit': plan.pad && plan.pad.key < 76 ? '36px' : undefined,
          '--hc-gap': `${plan.short ? TARGET_GAP_PX : 20}px`,
          ...handRootStyle,
        } as CSSProperties
      }
    >
      <div className="ni-hc__main">
        {moves}
        {/* biome-ignore lint/a11y/useSemanticElements: a CSS grid of cells with overlays, not a form group */}
        <div
          ref={gridRef}
          className="ni-hc__chart"
          role="group"
          aria-label={t('ui.hc.chart')}
          data-cells={plan.cells}
          style={{
            gridTemplateColumns: `repeat(10, ${plan.cellW}px)`,
            gridAutoRows: `${plan.cellH}px`,
            gap: plan.gap,
            width: gridW,
          }}
        >
          {cells}
          {bandStyle ? <span className="ni-hc__band" style={bandStyle} aria-hidden="true" /> : null}
          {token !== null && inWindow(token) ? (
            <span
              className="ni-hc__token"
              style={{ ...pos(token), width: plan.cellW, height: plan.cellH }}
              aria-hidden="true"
            />
          ) : null}
        </div>
        {plan.layout === 'side' ? (
          <div className="ni-hc__under">
            {paged ? stepBtn('up') : null}
            {paged ? stepBtn('down') : null}
            {map}
            {readout}
            {markEl}
            {checkEl}
          </div>
        ) : null}
      </div>
      {plan.layout === 'tap' ? (
        <div className="ni-hc__side">
          {paged ? (
            <>
              {stepBtn('up')}
              {map}
              {stepBtn('down')}
            </>
          ) : null}
          {checkEl}
        </div>
      ) : (
        <div className="ni-hc__entry">
          {plan.layout === 'stack' ? (
            <div className="ni-hc__left">
              {paged || markEl ? (
                <div className="ni-hc__under">
                  {paged ? stepBtn('up') : null}
                  {paged ? stepBtn('down') : null}
                  {map}
                  {markEl}
                </div>
              ) : null}
              <div className="ni-hc__answer">
                {readout}
                {checkEl}
              </div>
            </div>
          ) : null}
          <div className="ni-hc__padcell">
            <NumberPadKeys
              onKey={onKey}
              onEnter={submit}
              disabled={!interactive || (fill && active === null)}
              highlighted={pressedKey ?? (cue?.at === 'key' ? cue.key : null)}
              shape={plan.pad?.shape ?? '3x4'}
            />
          </div>
        </div>
      )}
      {inviteHand}
    </div>
  );
}

export default HundredChartWidget;
