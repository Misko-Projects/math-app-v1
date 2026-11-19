import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { ArrowIcon, CheckIcon } from '../../primitives/icons';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  fitCell,
  minObjectStep,
  NumberPadKeys,
  NumeralTray,
  numeralCardPx,
  type ObjectLayout,
  ObjectSetView,
  ObjectSprite,
  objectSetLayout,
  type PadKey,
  type PlacedObject,
  padValue,
  spriteNameKey,
  TRAY_PANEL_EDGES_PX,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './tap-count.css';

/**
 * `tap-count` (03 §5.5): count a set of objects.
 *
 * - **Concrete** (C): every object is a tap target. A tapped object gets a numbered pebble badge
 *   with the count it was given (`marks`, never colour alone), and `countAloud` speaks the running
 *   count. Tapping a counted object again speaks its number and is traced again (the trace drives
 *   MC.off-by-one-counting and MC.recount-from-one). Distractors can be tapped to hear their name,
 *   but they are never counted or marked.
 * - **Pictorial** (P): a static picture; the child only answers.
 *
 * Answer controls: `input: 'auto'` shows a numeral tray (0–10, or 0–20 above 10) once every object
 * has been counted (straight away in P); `'pad'` is the number pad with a big answer slot; `'pick'`
 * is a numeral tray of `pickOptions`. `mode: 'ordinal'` answers `choice obj-<i>`: the child taps
 * the k-th object from the side marked by a "start here" arrow; the tapped object is ringed. The
 * response always comes from the engine model (`formatModel('tap-count')`) on "check".
 *
 * Demo ops (03 §5.5): `tap {index}`, `count-aloud {upTo}`, `ring {index}`, `say-total`, plus
 * `answer {value | id}`.
 *
 * Invites (03 §6.3) ring and point at the ONE control the child should press next, and only while
 * that control is enabled (nothing shows while the widget is disabled; the invite is kept and
 * shows once input is back): `tap` / `count-aloud` → the object (the next uncounted one);
 * `ring` / `answer {id}` → that object, then Check once it is ringed; `answer {value}` and
 * `say-total` → the next object to count while the tray is still hidden, then the next pad key
 * (backspace after a wrong digit) or the right card, then Check. Answer and ring cues follow the
 * child's taps.
 *
 * Layout is container-relative (06 §1): the widget measures its own width. A row of objects that
 * cannot keep full-size targets in one row at that width wraps into rows in reading order (ten
 * K shells at the 960 × 600 minimum: 5 + 5), the "start here" arrow before the first row.
 * Ordinal objects render in counting order from the arrow, so Tab and screen readers start at the
 * marked object and follow the count whatever the rows look like.
 */

const OPS = ['tap', 'count-aloud', 'ring', 'say-total', 'answer'] as const;
const COUNT_MS = 650;

// Ordinal layout budget, in px (tap-count.css): at most this wide even when the widget area is
// wider (the 1280 × 800 tablet's area is ~1146–1226 px), with room to spare on both sides.
const ORDINAL_AREA_W = 1080;
/** `.ni-tapc[data-mode="ordinal"]` side padding, the row card's padding + border, the cue gap. */
const ORDINAL_CHROME_W = 2 * 16 + 2 * (20 + 3) + 16;
/** The Check pill beside the row (G1+ shows its word; K is icon-only and narrower) + column gap. */
const ORDINAL_CHECK_W = 200 + 56;
/**
 * The how-many budgets below (a ~1100 px widget area) assume the widget is at least this wide:
 * the stacked picture's 1000 px set plus its card (2 × (28 + 3)) and the widget's 2 × 24 padding.
 * A narrower widget takes the shortfall off every budget.
 */
const HOW_MANY_AREA_W = 1000 + 2 * (28 + 3) + 2 * 24;

/** Where an invite points: one pressable control. */
type Cue =
  | { at: 'obj'; index: number }
  | { at: 'key'; key: PadKey }
  | { at: 'card'; value: number }
  | { at: 'check' };

/** The pressable element a cue points at. */
function cueTarget(root: HTMLElement, cue: Cue): HTMLElement | null {
  switch (cue.at) {
    case 'obj':
      return root.querySelector(`[data-obj="obj-${cue.index}"]`);
    case 'key':
      return root.querySelector(`.ni-pad__key[data-key="${cue.key}"]`);
    case 'card':
      return root.querySelector(`.ni-pick[data-id="opt-${cue.value}"]`);
    case 'check':
      return root.querySelector('.ni-tapc__check .ni-btn');
  }
}

/** Invites that follow the child's input (the rest are done once the child acts). */
const followsInput = (inv: WidgetAction | null) =>
  inv?.op === 'answer' || inv?.op === 'say-total' || inv?.op === 'ring';

/**
 * A one-row line layout wrapped into `rows` rows in reading order. From the left, each row
 * continues left to right under the one above; from the right, the first row holds the objects
 * counted first (the rightmost) and every row is right-aligned, under the "start here" arrow's
 * side. Spacing inside a row is kept.
 */
function wrapRow(layout: ObjectLayout, rows: number, from: 'left' | 'right'): ObjectLayout {
  const slots = [...layout.objects].sort((a, b) => a.x - b.x);
  if (from === 'right') slots.reverse();
  const perRow = Math.ceil(slots.length / rows);
  const base = (o: PlacedObject) => o.x - (1 - o.scale) / 2;
  const chunks = Array.from({ length: rows }, (_, r) =>
    slots.slice(r * perRow, (r + 1) * perRow),
  ).filter((c) => c.length > 0);
  const span = (c: PlacedObject[]) => {
    const lo = Math.min(...c.map(base));
    return { lo, hi: Math.max(...c.map((o) => base(o) + 1)) };
  };
  const width = Math.max(...chunks.map((c) => span(c).hi - span(c).lo));
  const moved = new Map<PlacedObject, PlacedObject>();
  chunks.forEach((c, r) => {
    const { lo, hi } = span(c);
    const shift = from === 'right' ? width - hi : -lo;
    for (const o of c) moved.set(o, { ...o, x: o.x + shift, y: o.y + r * 1.2 });
  });
  return {
    ...layout,
    // Same order as given (the counting order, see `inCountingOrder`), so DOM order, focus order
    // and keys are unchanged by the wrap.
    objects: layout.objects.map((o) => moved.get(o) ?? o),
    width,
    height: (chunks.length - 1) * 1.2 + layout.height,
  };
}

/**
 * An ordinal line's objects in the order a child counts them from the "start here" arrow (left to
 * right, or right to left), positions unchanged. The objects render in this order, so Tab and a
 * screen reader start at the marked object and follow the count, however the rows are drawn.
 * Ids stay `obj-<index>`. The order comes from the line's own reading-order index (`obj-0` is the
 * first object along the line), never from drawn positions: a line the kit wraps into a second row
 * (more than ten objects) must still go obj-0, obj-1, … rather than column by column. Distractors
 * follow the counted objects, in their own order.
 */
function inCountingOrder(layout: ObjectLayout, from: 'left' | 'right'): ObjectLayout {
  const dir = from === 'right' ? -1 : 1;
  const rank = (o: PlacedObject) => (o.kind === 'object' ? 0 : 1);
  const objects = [...layout.objects].sort(
    (a, b) => rank(a) - rank(b) || (a.kind === 'object' ? dir : 1) * (a.index - b.index),
  );
  return { ...layout, objects };
}

/**
 * A `line` layout as ONE row in slot order (the kit breaks lines into rows of ten). Ordinal rows
 * are then wrapped by `wrapRow`, so any length wraps in reading order from the start marker.
 */
function flattenLine(layout: ObjectLayout): ObjectLayout {
  if (layout.height <= 1) return layout;
  const inset = (o: PlacedObject) => (1 - o.scale) / 2;
  const slots = [...layout.objects].sort(
    (a, b) => a.y - inset(a) - (b.y - inset(b)) || a.x - inset(a) - (b.x - inset(b)),
  );
  const flat = new Map(
    slots.map((o, i) => [o, { ...o, x: i * 1.12 + inset(o), y: inset(o) }] as const),
  );
  return {
    ...layout,
    objects: layout.objects.map((o) => flat.get(o) ?? o),
    width: (slots.length - 1) * 1.12 + 1,
    height: 1,
  };
}

/**
 * A count badge's footprint around its object's box, in px (tap-count.css `.ni-tapc__mark`): it
 * sits on top of the box's right end (right edges flush, wide numbers growing left), from 48 px
 * above the box's top to 4 px inside it (a 52 px pebble, its 40 px numeral ≥ 32 px, 05 §11).
 * `w` allows for two-digit pebbles (≈ 66 px) and a margin.
 */
const BADGE = { w: 76, above: 48, below: 4, clear: 4 } as const;
/** The ordinal selection ring around an object's box (tap-count.css: 2 px offset + 6 px ink). */
const RING_OUT = 2 + 6;
/**
 * Ordinal badges sit higher, above the selection ring (`.ni-tapc[data-mode="ordinal"]
 * .ni-tapc__mark`): from 66 px above the box to 14 px above it, so a counted object's badge
 * clears its own ring by 6 px. They also clear the ring of a ringed object in the row above
 * (`clear` includes the ring).
 */
const BADGE_ORDINAL = { w: 76, above: 66, below: -14, clear: 4 + RING_OUT } as const;
type BadgeFootprint = typeof BADGE | typeof BADGE_ORDINAL;

/**
 * How much to stretch a layout's rows (its y axis) so that every count badge clears every other
 * object's box by `BADGE.clear`: the band above each row must hold the badges of the row below.
 * Because a badge never sticks out past its own box's sides, objects side by side never collide;
 * only objects above (or just below) within the badge's columns need room. Frame layouts
 * (ten-frames, dice, plates) keep their kit geometry: 1.
 */
function badgeRowStretch(
  layout: ObjectLayout,
  cell: number,
  box: number,
  badge: BadgeFootprint,
): number {
  if (layout.frames.length > 0) return 1;
  let stretch = 1;
  for (const a of layout.objects) {
    if (a.kind !== 'object') continue;
    const right = (a.x + a.scale / 2) * cell + box / 2;
    for (const b of layout.objects) {
      if (b === a) continue;
      const bx = (b.x + b.scale / 2) * cell;
      const apart =
        bx + box / 2 <= right - badge.w - badge.clear || bx - box / 2 >= right + badge.clear;
      const dy = (a.y - b.y) * cell;
      if (apart || dy === 0) continue;
      // Centre-to-centre offset beyond the rows' own spacing (objects of different sizes).
      const ds = ((a.scale - b.scale) * cell) / 2;
      const need =
        dy > 0
          ? (box + badge.above + badge.clear - ds) / dy // b above a: a's badge under b's box
          : (badge.below + badge.clear + ds) / -dy; // b below a: b's box under a's badge
      stretch = Math.max(stretch, need);
    }
  }
  return Math.min(stretch, 2.5);
}

/** The layout with its rows spread `stretch` times further apart (x unchanged). */
function stretchRows(layout: ObjectLayout, stretch: number): ObjectLayout {
  if (stretch <= 1) return layout;
  const lowest = Math.max(0, ...layout.objects.map((o) => o.y));
  return {
    ...layout,
    objects: layout.objects.map((o) => ({ ...o, y: o.y * stretch })),
    height: layout.height + lowest * (stretch - 1),
  };
}

type Config = ConfigFor<'tap-count'>;

/** The numeral tray for `input: 'auto'`: 0–10, 0–20, or on to the next ten for larger sets. */
export function autoTrayValues(count: number): number[] {
  const top = count <= 10 ? 10 : count <= 20 ? 20 : Math.ceil(count / 10) * 10;
  return Array.from({ length: top + 1 }, (_, i) => i);
}

/** Object indexes in the order they were first tapped (a double tap counts once). */
function countOrder(taps: readonly number[]): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const i of taps) {
    if (!seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  }
  return order;
}

export function TapCountWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const n = Math.max(0, config.set.count);
  const ordinal = config.mode === 'ordinal';
  const concrete = tier === 'concrete';
  const baseLayout = useMemo(() => objectSetLayout(config.set), [config.set]);

  const [taps, setTaps] = useState<number[]>([]);
  const [ringed, setRinged] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [padText, setPadText] = useState('');
  const [demoBusy, setDemoBusy] = useState(false);
  const [counting, setCounting] = useState<number | null>(null);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoMarked, setDemoMarked] = useState(false);
  const tapsRef = useRef(taps);
  tapsRef.current = taps;

  const interactive = !disabled && !demoBusy;
  const order = countOrder(taps);
  const markOf = new Map(order.map((i, k) => [i, k + 1]));
  const allCounted = order.length >= n;
  /** Objects are buttons: always in C; in P only when the answer is an object (ordinal). */
  const objectsTappable = concrete || ordinal;
  // Pip's counting (demo) always marks, so a "show me" leaves the counted picture behind.
  const showMarks = (concrete && config.marks) || demoMarked;

  // ---------- sizes (06 §4: K ≥ 80 px, G1 ≥ 64 px, ≥ 12 px apart) ----------

  const target = MIN_TARGET_PX[ageMode];
  const step = Math.min(1.5, minObjectStep(baseLayout));
  // Tappable objects: a cell big enough that `step × cell − gap` is a full target.
  const minCell = objectsTappable
    ? Math.max(target, Math.ceil((target + TARGET_GAP_PX) / step))
    : 32;
  const trayValues = config.input === 'pick' ? (config.pickOptions ?? []) : autoTrayValues(n);
  // Numeral cards in an even grid (NumeralTray `columns`): 0–10 as 6 over 5, 0–20 as 7 × 3, pick
  // options up to 4 a row.
  const trayCols =
    config.input === 'pick' ? Math.min(4, trayValues.length) : trayValues.length > 11 ? 7 : 6;
  const trayDigits = Math.max(1, ...trayValues.map((v) => String(v).length));
  const card = numeralCardPx(trayDigits, target) + TARGET_GAP_PX;
  const trayW = trayCols * card - TARGET_GAP_PX + TRAY_PANEL_EDGES_PX;
  // The answer column of a how-many layout (ordinal layouts budget their own, below). In K the
  // number pad (96 px keys) has the icon-only Check beside it, not under it, so a K pad item fits
  // a 1280 × 800 screen; the shorter G1+ pad keeps Check under it.
  const checkBesidePad = config.input === 'pad' && !ordinal && ageMode === 'k';
  const padCheckW = checkBesidePad ? 40 + 120 : 0;
  const answerW =
    config.input === 'pad' ? 3 * (target + 16) + 2 * TARGET_GAP_PX + padCheckW : trayW;
  const answerH =
    config.input === 'pad'
      ? 560
      : Math.ceil(trayValues.length / trayCols) * (target + TARGET_GAP_PX + 6) + 30;
  // "Start here" pebble: not a target, so it stays compact enough for a row of ten K targets.
  const cueSize = Math.min(64, Math.round(target * 0.9));
  const empty = baseLayout.objects.length === 0;
  // The widget's own width (container-relative, 06 §1), measured before the first paint. Every
  // budget below is capped by it; until it is known, the 1280 × 800 budgets apply.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [widgetW, setWidgetW] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidgetW(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ordinalAreaW = Math.min(ORDINAL_AREA_W, widgetW ?? ORDINAL_AREA_W);
  const ordinalRowW = ordinalAreaW - ORDINAL_CHROME_W - cueSize;
  const shortfall = Math.max(0, HOW_MANY_AREA_W - (widgetW ?? HOW_MANY_AREA_W));
  const stackW = 1000 - shortfall;
  const from = config.ordinal?.from ?? 'left';
  // A single line of objects that cannot keep full-size targets in one row at this width wraps
  // into as few rows as fit (ten K targets in a 906 px widget: 5 + 5), in reading order.
  const rowLimit = ordinal ? ordinalRowW : stackW;
  // An ordinal line of any length is first laid out as one row (the kit's rows of ten would put
  // obj-10 under obj-0, away from a right-hand marker), then wrapped below in reading order.
  const lineLayout = useMemo(
    () => (ordinal && config.set.layout === 'line' ? flattenLine(baseLayout) : baseLayout),
    [baseLayout, ordinal, config.set.layout],
  );
  const wrapRows = (() => {
    if (config.set.layout !== 'line' || lineLayout.height > 1 || lineLayout.frames.length > 0) {
      return 1;
    }
    for (let rows = 1; rows < lineLayout.objects.length; rows++) {
      const perRow = Math.ceil(lineLayout.objects.length / rows);
      const w = rows === 1 ? lineLayout.width : (perRow - 1) * 1.12 + 1;
      if (w * minCell <= rowLimit) return rows;
    }
    return lineLayout.objects.length;
  })();
  const fitLayout = useMemo(() => {
    // Ordinal objects render in counting order (DOM = Tab = reading order), from the marker.
    const counted = ordinal ? inCountingOrder(lineLayout, from) : lineLayout;
    return wrapRows > 1 ? wrapRow(counted, wrapRows, ordinal ? from : 'left') : counted;
  }, [lineLayout, wrapRows, ordinal, from]);
  // Wrapped rows keep the size the one-row layout gets at 1280 × 800, so a narrower screen never
  // draws bigger objects than a wide one.
  const wrappedCap =
    wrapRows > 1
      ? Math.max(
          minCell,
          fitCell(
            lineLayout,
            ordinal ? ORDINAL_AREA_W - ORDINAL_CHROME_W - cueSize : 1000,
            ordinal ? 360 : Math.max(120, 520 - answerH),
            32,
          ),
        )
      : Number.POSITIVE_INFINITY;
  const sizeFor = (set: ObjectLayout): { arrange: 'side' | 'stack'; cell: number } => {
    // Nothing to count: an empty dish centred above the answer.
    if (empty) return { arrange: 'stack', cell: 32 };
    if (ordinal) {
      // The row card (cue + objects) and Check side by side when the row still gets full-size
      // targets; otherwise Check sits centred under the row, which then takes the full width.
      const sideW = ordinalRowW - ORDINAL_CHECK_W;
      const sideFit = Math.min(wrappedCap, fitCell(set, sideW, 360, 32));
      if (sideFit >= minCell && set.width * sideFit <= sideW) {
        return { arrange: 'side', cell: sideFit };
      }
      return {
        arrange: 'stack',
        cell: Math.max(minCell, Math.min(wrappedCap, fitCell(set, ordinalRowW, 360, 32))),
      };
    }
    // Side by side (picture left, answer right) when both fit the ~1100 px widget area; otherwise
    // the picture spans the width above the answer. Either way the objects grow into the room left.
    const sideW = 1100 - answerW - 240 - shortfall;
    const sideCell = Math.max(minCell, Math.min(wrappedCap, fitCell(set, sideW, 340, 32)));
    if (set.width * sideCell <= sideW) return { arrange: 'side', cell: sideCell };
    return {
      arrange: 'stack',
      cell: Math.max(
        minCell,
        Math.min(wrappedCap, fitCell(set, stackW, Math.max(120, 520 - answerH), 32)),
      ),
    };
  };
  // A picture (P) keeps full-size objects; tap targets leave the 12 px gap between them.
  const boxFor = (c: number) =>
    objectsTappable ? Math.min(c, Math.floor(step * c - TARGET_GAP_PX)) : c;
  // Rows get a band for the count badges (any tier: Pip's demo marks pictures too). Spreading the
  // rows can shrink the cell, which needs a little more spread: settle in a few passes.
  let layout = fitLayout;
  let { arrange, cell } = sizeFor(layout);
  for (let pass = 0; pass < 4; pass++) {
    const next = stretchRows(
      fitLayout,
      badgeRowStretch(fitLayout, cell, boxFor(cell), ordinal ? BADGE_ORDINAL : BADGE),
    );
    const sized = sizeFor(next);
    const settled = next === layout || sized.cell === cell;
    layout = next;
    ({ arrange, cell } = sized);
    if (settled) break;
  }
  const hitSize = boxFor(cell);

  // ---------- child actions ----------

  const objectName = (o: PlacedObject) => t(spriteNameKey(o.sprite));

  const tapObject = (o: PlacedObject) => {
    if (!interactive) return;
    if (o.kind === 'distractor') {
      trace('tap', `distractor-${o.index}`);
      if (speakOnTap) say(spriteNameKey(o.sprite));
      return;
    }
    const i = o.index;
    trace('tap', `obj-${i}`);
    setInvite((inv) => (followsInput(inv) ? inv : null));
    if (ordinal) setRinged(i);
    if (!concrete) {
      if (speakOnTap) say(spriteNameKey(o.sprite));
      return;
    }
    const mark = markOf.get(i) ?? order.length + 1;
    const next = [...tapsRef.current, i];
    tapsRef.current = next;
    setTaps(next);
    if (config.countAloud) sayNumber(mark);
    else if (speakOnTap) say(spriteNameKey(o.sprite));
  };

  const trayShown =
    config.input !== 'pad' && !ordinal && (config.input === 'pick' || !concrete || allCounted);

  const pick = (v: number) => {
    if (!interactive) return;
    trace('tap', `opt-${v}`);
    setInvite((inv) => (followsInput(inv) ? inv : null));
    setPicked(v);
  };

  const maxDigits = String(Math.max(20, n)).length;
  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite((inv) => (followsInput(inv) ? inv : null));
    setPadText((s) => applyPadKey(s, key, maxDigits));
  };

  const answerValue = config.input === 'pad' ? padValue(padText) : picked;
  const ready = ordinal ? ringed !== null : answerValue !== null;

  // One 400 ms debounce for Check and desktop Enter together (06 §4).
  const submit = useSubmitGuard(() => {
    if (!interactive || !ready) return false;
    const model = formatModel('tap-count');
    if (!model) return false;
    const actions: WidgetAction[] = tapsRef.current.map((index) => ({
      op: 'tap',
      args: { index },
    }));
    if (ordinal && ringed !== null) actions.push({ op: 'ring', args: { index: ringed } });
    if (!ordinal && answerValue !== null) {
      actions.push({ op: 'answer', args: { value: answerValue } });
    }
    const state = actions.reduce(model.apply, model.initialState(config));
    const response = model.toResponse(state);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const markDemo = async (i: number) => {
    if (i < 0 || i >= n) return;
    setDemoMarked(true);
    setCounting(i);
    const already = tapsRef.current.includes(i);
    const next = [...tapsRef.current, i];
    tapsRef.current = next;
    setTaps(next);
    sayNumber(already ? countOrder(next).indexOf(i) + 1 : countOrder(next).length);
    await pause(COUNT_MS);
  };

  const enterValue = async (v: number) => {
    sayNumber(v);
    if (config.input === 'pad') {
      // The answer replaces whatever was typed (like the engine model's `answer` op).
      let text = '';
      setPadText(text);
      for (const ch of String(v).split('') as PadKey[]) {
        setPressedKey(ch);
        await pause(340);
        if (!alive.current) return;
        text = applyPadKey(text, ch, maxDigits);
        setPadText(text);
      }
      setPressedKey(null);
    } else {
      setPicked(v);
    }
    await pause(400);
  };

  const indexArg = (action: WidgetAction) => {
    const v = action.args?.index;
    return typeof v === 'number' && Number.isInteger(v) ? v : null;
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'tap') {
          const i = indexArg(action);
          if (i !== null) await markDemo(i);
        } else if (action.op === 'count-aloud') {
          const upTo = Math.min(n, Number(action.args?.upTo ?? n) || n);
          for (let i = 0; i < upTo; i++) {
            if (tapsRef.current.includes(i)) continue;
            await markDemo(i);
            if (!alive.current) return;
          }
        } else if (action.op === 'ring') {
          const i = indexArg(action);
          if (i !== null && i >= 0 && i < n) {
            setCounting(i);
            setRinged(i);
            await pause(COUNT_MS);
          }
        } else if (action.op === 'say-total') {
          await enterValue(countOrder(tapsRef.current).length);
        } else if (action.op === 'answer') {
          const id = typeof action.args?.id === 'string' ? action.args.id : null;
          const m = id?.match(/^obj-(\d+)$/);
          if (m) {
            setRinged(Number(m[1]));
            await pause(COUNT_MS);
          } else if (typeof action.args?.value === 'number') {
            await enterValue(action.args.value);
          }
        }
      } finally {
        if (alive.current) {
          setCounting(null);
          setPressedKey(null);
          setDemoBusy(false);
        }
      }
    },
    invite: (action) => setInvite(action),
  });

  // The invite's ONE target, shown only while it can be pressed: a disabled widget shows no cue
  // (the invite is kept and appears once input is back). Answer and ring cues follow the input.
  const canCheck = interactive && ready;
  const cue: Cue | null = (() => {
    if (!invite || !interactive) return null;
    const check: Cue | null = canCheck ? { at: 'check' } : null;
    const objectCue = (i: number | null): Cue | null =>
      objectsTappable && i !== null && i >= 0 && i < n ? { at: 'obj', index: i } : null;
    const nextUncounted = () => {
      for (let i = 0; i < n; i++) if (!taps.includes(i)) return i;
      return null;
    };
    // Ring the k-th object, then Check once it is ringed.
    const ringCue = (i: number | null) => (i !== null && ringed === i ? check : objectCue(i));
    // Enter `target`: count first while the tray is hidden, then the next key or the card.
    const valueCue = (target: number | null): Cue | null => {
      if (ordinal) return null;
      if (config.input === 'pad') {
        const want = target === null ? null : String(target);
        if (want === null || padText === want) return check;
        if (want.startsWith(padText)) return { at: 'key', key: want[padText.length] as PadKey };
        return { at: 'key', key: 'back' };
      }
      if (!trayShown) return objectCue(nextUncounted());
      if (target === null || !trayValues.includes(target)) return check;
      return picked === target ? check : { at: 'card', value: target };
    };
    switch (invite.op) {
      case 'tap':
        return objectCue(indexArg(invite));
      case 'count-aloud':
        return objectCue(nextUncounted());
      case 'ring':
        return ringCue(indexArg(invite));
      case 'say-total':
        return valueCue(n);
      case 'answer': {
        const id = typeof invite.args?.id === 'string' ? invite.args.id : null;
        if (id !== null) {
          const m = id.match(/^obj-(\d+)$/);
          return ordinal && m ? ringCue(Number(m[1])) : null;
        }
        const v = invite.args?.value;
        return valueCue(typeof v === 'number' && Number.isFinite(v) ? v : null);
      }
      default:
        return null;
    }
  })();
  const cueObject = cue?.at === 'obj' ? cue.index : null;
  const cueKey = cue?.at === 'key' ? cue.key : null;
  const cueCard = cue?.at === 'card' ? cue.value : null;
  const cueId = cue ? `${cue.at}:${cueObject ?? cueKey ?? cueCard ?? ''}` : '';

  // Pip's hand sits on the invited control, measured from the laid-out widget.
  // Pip's up-pointing hand hangs below the invited control (kit `useInviteHand`), its fingertip
  // inside the control's bottom edge and clear of its glyph; it re-measures when the layout moves.
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => (cue ? cueTarget(root, cue) : null),
    cue ? `${cueId}|${cell}|${arrange}|${wrapRows}` : '',
  );

  // ---------- render ----------

  const renderObject = (o: PlacedObject, style: CSSProperties) => {
    const left = Number(style.left) + Number(style.width) / 2 - hitSize / 2;
    const top = Number(style.top) + Number(style.height) / 2 - hitSize / 2;
    const spriteSize = Math.min(hitSize, Number(style.width));
    const isObject = o.kind === 'object';
    const mark = isObject ? markOf.get(o.index) : undefined;
    const box: CSSProperties = { left, top, width: hitSize, height: hitSize };
    const sprite = (
      <span className="ni-tapc__sprite" style={{ width: spriteSize, height: spriteSize }}>
        <ObjectSprite sprite={o.sprite} tone={o.tone} />
      </span>
    );
    // Ten-frame pictures (follow-up from #76): the cell above holds the next row's object, so a
    // badge above the box would cover it. Counted cells get a small dot inside the cell instead,
    // and only the latest count shows its number, centred in its own cell.
    const onFrames = layout.frames.length > 0;
    const badge =
      mark === undefined || !showMarks ? null : onFrames && mark !== order.length ? (
        <span className="ni-tapc__dot" aria-hidden="true" />
      ) : (
        <span className="ni-tapc__mark" aria-hidden="true">
          {mark}
        </span>
      );
    const isRinged = isObject && ringed === o.index;
    const invited = isObject && cueObject === o.index;
    const tappable = objectsTappable && (isObject || concrete);
    if (!tappable) {
      return (
        <span
          key={`${o.kind}-${o.index}`}
          className="ni-tapc__obj"
          style={box}
          data-kind={o.kind}
          data-counting={counting === o.index && isObject ? 'true' : undefined}
          data-ringed={isRinged ? 'true' : undefined}
          aria-hidden="true"
        >
          {sprite}
          {badge}
        </span>
      );
    }
    const name = objectName(o);
    const label =
      mark !== undefined && showMarks ? t('ui.count.marked', { thing: name, n: mark }) : name;
    return (
      <button
        key={`${o.kind}-${o.index}`}
        type="button"
        className={['ni-tapc__obj', invited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        style={box}
        data-kind={o.kind}
        data-obj={isObject ? `obj-${o.index}` : `distractor-${o.index}`}
        data-marked={mark !== undefined ? 'true' : undefined}
        data-counting={counting === o.index && isObject ? 'true' : undefined}
        data-ringed={isRinged ? 'true' : undefined}
        aria-label={label}
        aria-pressed={ordinal && isObject ? isRinged : undefined}
        disabled={!interactive}
        onClick={() => tapObject(o)}
      >
        {sprite}
        {badge}
        {isRinged ? (
          <span className="ni-tapc__ring-badge" aria-hidden="true">
            <CheckIcon tone="light" />
          </span>
        ) : null}
      </button>
    );
  };

  const firstRowTop = Math.min(...layout.objects.map((o) => o.y), 0);

  return (
    <div
      ref={rootRef}
      className="ni-tapc"
      data-tier={tier}
      data-mode={ordinal ? 'ordinal' : 'how-many'}
      data-arrange={arrange}
      data-frames={layout.frames.length > 0 ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={handRootStyle}
    >
      <div className="ni-tapc__picture" data-from={ordinal ? from : undefined}>
        {ordinal ? (
          // "Start here": an arrow on the counting side, level with the first row (no words).
          <span
            className="ni-tapc__cue"
            data-from={from}
            role="img"
            aria-label={t('ui.count.start')}
            style={{
              width: cueSize,
              height: cueSize,
              marginTop: firstRowTop * cell + (cell - cueSize) / 2,
            }}
          >
            <ArrowIcon />
          </span>
        ) : null}
        {empty ? (
          // Nothing to count (CNT.13): an empty dish, so the picture never reads as a missing image.
          <span className="ni-tapc__empty" role="img" aria-label={t('ui.widget.picture')} />
        ) : (
          <ObjectSetView
            layout={layout}
            cell={cell}
            label={t('ui.widget.picture')}
            renderObject={renderObject}
            className="ni-tapc__set"
          />
        )}
      </div>

      <div className="ni-tapc__answer" data-check={checkBesidePad ? 'beside' : undefined}>
        {config.input === 'pad' && !ordinal ? (
          <div className="ni-tapc__pad">
            <span className="ni-tapc__slot">
              <NumberDisplay
                value={padText === '' ? null : padText}
                digits={maxDigits}
                size="lg"
                state={interactive ? 'active' : 'idle'}
                label="ui.widget.answer"
              />
            </span>
            <NumberPadKeys
              onKey={onKey}
              onEnter={submit}
              disabled={!interactive}
              highlighted={pressedKey ?? cueKey}
            />
          </div>
        ) : null}
        {config.input !== 'pad' && !ordinal ? (
          <div
            className="ni-tapc__tray"
            data-shown={trayShown ? 'true' : 'false'}
            inert={!trayShown}
          >
            <NumeralTray
              values={trayValues}
              selected={picked}
              highlighted={cueCard}
              onPick={pick}
              disabled={!interactive || !trayShown}
              columns={trayCols}
            />
          </div>
        ) : null}
        <span className="ni-tapc__check">
          <CheckButton onPress={submit} disabled={!canCheck} invited={cue?.at === 'check'} />
        </span>
      </div>
      {inviteHand}
    </div>
  );
}

export default TapCountWidget;
