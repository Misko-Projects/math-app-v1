import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { ArrowIcon, CheckIcon } from '../../primitives/icons';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  AskEntry,
  AskStep,
  applyPadKey,
  CheckButton,
  cellToFit,
  countLayout,
  FitPicture,
  fitCell,
  minObjectStep,
  NumberPadKeys,
  NumeralTray,
  numeralCardPx,
  numeralTraySize,
  type ObjectLayout,
  ObjectSetView,
  ObjectSprite,
  objectSetLayout,
  type PadKey,
  type PlacedObject,
  padValue,
  planAsk,
  type Size,
  StepActions,
  spriteNameKey,
  TRAY_MAX,
  TRAY_PANEL_EDGES_PX,
  trayColumnChoices,
  useActionSize,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
  useTwoStep,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './tap-count.css';

/**
 * `tap-count` (03 §5.5): count a set of objects.
 *
 * - **Concrete** (C): every object is a tap target. A tapped object gets a numbered pebble badge
 *   with the count it was given (`marks`, never colour alone), and `countAloud` speaks the running
 *   count. On a ten-frame picture no number goes on an object (the cell above holds the next
 *   row's): each counted cell gets a dot and the running count shows once, in the card's corner.
 *   Tapping a counted object again speaks its number and is traced again (the trace drives
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
/** The number pad column (slot over the 3 × 4 keys) and the widget's padding top and bottom. */
const PAD_H = 560;
const PAD_Y = 8;
/** The compact pad: the slot / Check column beside the keys, and the gap between them. */
const COMPACT_SLOT_W = 140;
const COMPACT_GAP = 16;
/** Check alone (K: icon-only, 96 px tall with its ledge). */
const CHECK_W = 120;
/** A height no host grows to unless it grows with its content (the room probe). */
const PROBE_PX = 100_000;
/**
 * The answer step's picture: its card's padding and border, and the least cell an object gets: the
 * 32 px a picture is never drawn under here (a leaf draws 0.74 of its cell wide, and a counted
 * object is at least 22 px: 05 §11).
 */
const ASK_CARD_EDGE = 2 * (12 + 3);
const ASK_MIN_CELL = 32;

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
 * An equal-groups layout (plates side by side, kit `objectSetLayout`) with its plates in rows of
 * `perRow`, each row centred under the widest; objects move with their plate. Distractors (a loose
 * row under the plates) go under the last row. Reading order and ids are unchanged.
 */
function wrapPlates(layout: ObjectLayout, perRow: number): ObjectLayout {
  const plates = [...layout.frames].sort((a, b) => a.x - b.x);
  if (perRow >= plates.length || plates.length === 0) return layout;
  const rows = Math.ceil(plates.length / perRow);
  const rowH = Math.max(...plates.map((p) => p.rows));
  const rowOf = (i: number) => plates.slice(i * perRow, (i + 1) * perRow);
  const span = (row: typeof plates) => {
    const first = row[0] as (typeof plates)[number];
    const last = row[row.length - 1] as (typeof plates)[number];
    return { x0: first.x, w: last.x + last.cols - first.x };
  };
  const width = Math.max(...Array.from({ length: rows }, (_, r) => span(rowOf(r)).w));
  const moveOf = plates.map((_, i) => {
    const r = Math.floor(i / perRow);
    const { x0, w } = span(rowOf(r));
    return { dx: (width - w) / 2 - x0, dy: r * (rowH + 0.6) };
  });
  const plateOf = (o: PlacedObject) =>
    plates.findIndex((p) => o.x + o.scale / 2 >= p.x && o.x + o.scale / 2 <= p.x + p.cols);
  const lastDy = (rows - 1) * (rowH + 0.6);
  // Distractors (a loose row under the plates): re-flowed in rows that fit the wrapped width,
  // centred, under the last row of plates, in their own order.
  const loose = layout.objects.filter((o) => o.kind !== 'object' || plateOf(o) < 0);
  const perLine = Math.max(1, Math.floor((width + 0.12) / 1.12));
  const looseTop = lastDy + rowH + 0.4;
  const looseAt = new Map(
    loose.map((o, k) => {
      const line = Math.floor(k / perLine);
      const inLine = Math.min(perLine, loose.length - line * perLine);
      const lineW = inLine * 1.12 - 0.12;
      const x0 = (width - lineW) / 2;
      const inset = (1 - o.scale) / 2;
      return [o, { x: x0 + (k % perLine) * 1.12 + inset, y: looseTop + line * 1.12 + inset }];
    }),
  );
  const objects = layout.objects.map((o) => {
    const at = looseAt.get(o);
    if (at) return { ...o, ...at };
    const m = moveOf[plateOf(o)] as { dx: number; dy: number };
    return { ...o, x: o.x + m.dx, y: o.y + m.dy };
  });
  const frames = plates.map((p, i) => {
    const m = moveOf[i] as { dx: number; dy: number };
    return { ...p, x: p.x + m.dx, y: p.y + m.dy };
  });
  const height = Math.max(lastDy + rowH, ...objects.map((o) => o.y + o.scale + (1 - o.scale) / 2));
  return { ...layout, objects, frames, width, height };
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
 * .ni-tapc__mark`, a 44 px pebble with a 32 px numeral): from 64 px above the box to 20 px above
 * it, so a counted object's badge clears its own ring by 12 px. They also clear the ring of a
 * ringed object in the row above by 12 px (`clear` includes the ring).
 */
const BADGE_ORDINAL = { w: 76, above: 64, below: -20, clear: 12 + RING_OUT } as const;
type BadgeFootprint = typeof BADGE | typeof BADGE_ORDINAL;

/**
 * Pictures whose objects sit in places (ten-frames' cells, equal-groups plates): the next row's
 * object is right above, and a plate's rim is right beside, so no numbered badge goes on an
 * object. Every counted object gets a dot in its own place and the running count shows once, in
 * the picture card's top-right corner (`.ni-tapc__count`, in the card's top padding, ≥ 12 px clear
 * of the card's edges and of every frame and plate). Every other layout keeps the numbered badge
 * above each object.
 */
const DOT_LAYOUTS: ReadonlySet<string> = new Set(['ten-frame', 'double-ten-frame', 'groups']);
/** Ten-frame cells: the kit draws each frame with a 4 px border and 1.5 px cell lines (kit.css). */
const FRAME_BORDER = 4;
const CELL_LINE = 1.5;
/** Inside a place: the drawing's top inset, and the least room between drawing, dot and edge. */
const SPRITE_INSET = 3;
const DOT_ROOM = 3;
const dotSize = (box: number) => Math.max(8, Math.round(0.2 * box));
/** The picture card's left padding (tap-count.css), where the set starts. */
const CARD_PAD_X = 28;
/** Beside a compact pad the card keeps 16 px at its sides (tap-count.css), so the picture grows. */
const CARD_PAD_X_COMPACT = 16;
/**
 * Half the widest running count (a 60 px pebble for two digits) plus 9 px: its centre keeps this
 * far in from the card's padding edges, so the pebble stays ≥ 12 px in from the card's outer
 * edges (3 px border).
 */
const COUNT_HALF = 30 + 9;

/** The part of a sprite's 64-unit box its drawing covers (with its outline), as fractions. */
export interface DrawnBox {
  top: number;
  bottom: number;
}
/** Until a sprite's drawing is measured: assume it fills its box. */
const FULL_BOX: DrawnBox = { top: 0, bottom: 1 };

/**
 * Where an object's drawing and its count dot go inside its box (px, box-relative), for a picture
 * in places. `band` is the part of the box inside the object's place (a ten-frame cell inside its
 * lines; a plate's object: the whole box). Every object gets the same drawing size, so counted and
 * uncounted ones match. The DRAWING (`drawn`, measured from the sprite, not its box) starts
 * `SPRITE_INSET` below the band's top, and the dot is centred in the free space under it (≥
 * `DOT_ROOM` from the drawing and from the band's bottom), on the place's centre line. Small
 * places (a box under 64 px) get an 8 px dot, so the drawing keeps its size.
 */
function dotPlacement(
  box: number,
  sprite: number,
  band: { top: number; bottom: number; centreX: number },
  drawn: DrawnBox,
) {
  const dot = box < 64 ? 8 : dotSize(box);
  const span = Math.max(0.1, drawn.bottom - drawn.top);
  const size = Math.max(
    0,
    Math.min(sprite, (band.bottom - band.top - SPRITE_INSET - dot - 2 * DOT_ROOM) / span),
  );
  const spriteTop = band.top + SPRITE_INSET - drawn.top * size;
  const drawnBottom = spriteTop + drawn.bottom * size;
  const dotTop = (drawnBottom + band.bottom - dot) / 2;
  return { dot, size, spriteTop, dotTop, dotLeft: band.centreX - dot / 2 };
}

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
  /** A picture in places (DOT_LAYOUTS): a dot per counted object and one running count. */
  const onDots = DOT_LAYOUTS.has(config.set.layout);
  const onGrid = onDots && config.set.layout !== 'groups';
  /** While marks can show, every object keeps the room for its dot (one drawing size for all). */
  const dotRoom = onDots && showMarks;
  /**
   * Equal groups with the numeral tray appearing once all are counted: the hidden tray takes no
   * room, so Check sits beside the plates while the child counts (a big tray, 0–30, would leave
   * an empty half under them); the tray comes in under the picture once every object is counted.
   */
  const collapseTray = onDots && config.input === 'auto' && concrete && !ordinal;
  /**
   * Tappable ten-frame cells (C): each cell is drawn as its own target, the size of the object's
   * box with 12 px between cells, inside a frame that stands 12 px out from the cells' grid
   * (tap-count.css `data-cells="targets"`), so a ring in a cell stays ≥ 12 px from the frame.
   */
  const targetCells = onGrid && concrete;
  /** Each sprite's measured drawing (its top and bottom in its box), for the dot placement. */
  const [drawnBoxes, setDrawnBoxes] = useState<Record<string, DrawnBox>>({});
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !onDots) return;
    let next: Record<string, DrawnBox> | null = null;
    for (const svg of root.querySelectorAll<SVGSVGElement>('.ni-tapc__sprite svg[data-sprite]')) {
      const id = svg.dataset.sprite;
      if (!id || drawnBoxes[id] || next?.[id] || typeof svg.getBBox !== 'function') continue;
      const vb = svg.viewBox.baseVal;
      const bb = svg.getBBox();
      if (!vb || vb.height === 0 || bb.height === 0) continue;
      // Outlines are up to 3.5 units wide: half of one beyond the geometry.
      const pad = 2;
      next = {
        ...(next ?? drawnBoxes),
        [id]: {
          top: Math.max(0, (bb.y - pad) / vb.height),
          bottom: Math.min(1, (bb.y + bb.height + pad) / vb.height),
        },
      };
    }
    if (next) setDrawnBoxes(next);
  });

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
  // "Start here" pebble: not a target, so it stays compact enough for a row of ten K targets.
  const cueSize = Math.min(64, Math.round(target * 0.9));
  const empty = baseLayout.objects.length === 0;
  // The widget's own width and the height its host gives it (container-relative, 06 §1),
  // measured before the first paint; until they are known, the 1280 × 800 budgets apply. The
  // height is Infinity where the host grows with its content (a plain story stage).
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [widgetW, setWidgetW] = useState<number | null>(null);
  const [hostH, setHostH] = useState(Number.POSITIVE_INFINITY);
  /**
   * Count, then answer (kit two-step). Where the area cannot hold the objects at full target size
   * together with the numeral tray, the tray gets a step of its own: the child counts with the
   * whole area, a Next arrow comes once every object is counted, and the answer step shows the
   * picture small beside the numerals, with Back to count again. Decided from the widget as laid
   * out (the effect below), once: when the item is first laid out in a room with a set height.
   * The arrangement then stays for the item, whatever the room does later (a resize or a rotation
   * never swaps the child's screen mid-item; a room that got smaller scrolls instead).
   */
  const [split, setSplit] = useState<boolean | null>(null);
  const splitSteps = split === true;
  const canSplit = concrete && !ordinal && config.input === 'auto';
  const two = useTwoStep(rootRef, {
    interactive,
    trace,
    guard: (to) => to === 'build' || allCounted,
  });
  const asking = splitSteps && two.step === 'ask';
  const stepOnly = splitSteps && two.step === 'build';
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || split !== null || !Number.isFinite(hostH) || widgetW === null) return;
    // Equal groups mount their tray only with the last count (`collapseTray`), under the picture:
    // its height counts now, so the answer never arrives below the fold of an item that began
    // on one screen.
    const trayToCome =
      collapseTray && !trayShown
        ? 16 + Math.ceil(trayValues.length / trayCols) * (target + TARGET_GAP_PX + 6) + 30
        : 0;
    const tall = el.getBoundingClientRect().height + trayToCome > hostH + 1;
    const wide = el.scrollWidth > el.clientWidth + 1;
    // A set above 20 needs its own tray in the answer step: where none fits, one screen (as before
    // the steps existed), which scrolls from its top-left corner with everything reachable.
    setSplit(canSplit && (tall || wide) && (!ownTray || ownTrayFits));
  });
  const actRef = useRef<HTMLDivElement | null>(null);
  const unzoomed = useRef(1);
  const stepButton = useActionSize(actRef, unzoomed, ageMode);
  /**
   * Check as it is drawn: icon-only in K, with its word from Grade 1 on (so it is wider). Measured
   * on the button itself, whenever it mounts or changes size (its word's font arriving, the age
   * mode switching): the widget's own size does not change then.
   */
  const [checkW, setCheckW] = useState(0);
  const checkObserver = useRef<ResizeObserver | null>(null);
  const checkRef = useCallback((node: HTMLSpanElement | null) => {
    checkObserver.current?.disconnect();
    checkObserver.current = null;
    const button = node?.querySelector('.ni-btn');
    if (!button) return;
    const read = () => setCheckW(Math.ceil(button.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    checkObserver.current = new ResizeObserver(read);
    checkObserver.current.observe(button);
  }, []);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const host = el.parentElement;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidgetW(w);
      // Does the host bound the widget's height? Grow the root for one synchronous layout (no
      // paint): a host sized by its content grows with it; a host with a set height does not.
      let h = Number.POSITIVE_INFINITY;
      if (host) {
        const before = el.style.height;
        el.style.height = `${PROBE_PX}px`;
        const grown = host.clientHeight;
        el.style.height = before;
        if (grown < PROBE_PX) h = host.clientHeight;
      }
      setHostH(h);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (host) ro.observe(host);
    return () => ro.disconnect();
  }, []);
  /**
   * The number pad where the host is too short for it (the normal pad column is ~560 px; the
   * 960 × 600 minimum gives 373): the keys at the age's minimum target size in a 4 × 3 block,
   * the answer slot and Check in a column beside it (tap-count.css `data-pad="compact"`).
   */
  const compactPad = config.input === 'pad' && !ordinal && hostH < PAD_H + 2 * PAD_Y;
  const compactKeysW = 4 * target + 3 * TARGET_GAP_PX;
  // The slot / Check column is as wide as the wider of the two: Check with its word (Grade 1+)
  // is wider than the slot, and the picture beside the pad gets only what is left.
  const compactSlotW = Math.max(COMPACT_SLOT_W, checkW);
  const trayShown =
    config.input !== 'pad' &&
    !ordinal &&
    !stepOnly &&
    (config.input === 'pick' || !concrete || allCounted);
  /** No tray in view and none held room for: the answer column is one button. */
  const buttonOnly = (collapseTray && !trayShown) || stepOnly;
  const answerW =
    config.input === 'pad'
      ? compactPad
        ? compactSlotW + COMPACT_GAP + compactKeysW
        : 3 * (target + 16) + 2 * TARGET_GAP_PX + padCheckW
      : buttonOnly
        ? CHECK_W
        : trayW;
  const answerH =
    config.input === 'pad'
      ? compactPad
        ? 3 * (target + 4) + 2 * TARGET_GAP_PX
        : PAD_H
      : buttonOnly
        ? CHECK_W
        : Math.ceil(trayValues.length / trayCols) * (target + TARGET_GAP_PX + 6) + 30;
  /** The picture card's padding and border top to bottom (tap-count.css), and the column gap. */
  const cardY = (onDots ? 68 : 52) + 20 + 2 * 3 + (targetCells ? 24 : 0);
  const gapX = compactPad ? 32 : 56;
  const cardPadX = compactPad ? CARD_PAD_X_COMPACT : CARD_PAD_X;
  /** The largest cell a picture in places may take (frames and plates grow into the room). */
  const fitPicture = (set: ObjectLayout, w: number, h: number) =>
    onDots
      ? Math.max(32, Math.floor(Math.min(w / set.width, h / set.height, 140)))
      : fitCell(set, w, h, 32);
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
  // So is a how-many line whose rows of ten are wider than the widget at full target size (ten K
  // targets are 920 px): it wraps into rows that fit instead of running off the side.
  const reflowLine =
    config.set.layout === 'line' && (ordinal || baseLayout.width * minCell > rowLimit);
  const lineLayout = useMemo(
    () => (reflowLine ? flattenLine(baseLayout) : baseLayout),
    [baseLayout, reflowLine],
  );
  /**
   * An ordinal line in a host that sets a height (a widget area) grows into the room: the rows,
   * arrangement (Check beside or under) and cell that give the biggest objects inside the area
   * (≤ 112 px cells), each row's badges 12 px clear (BADGE_ORDINAL), more rows only for objects
   * ≥ 8 % bigger. A host that grows with its content keeps the designed one-row layout.
   */
  const ordinalFit = (() => {
    if (!ordinal || config.set.layout !== 'line' || !Number.isFinite(hostH) || widgetW === null) {
      return null;
    }
    const count = lineLayout.objects.length;
    const w = Math.min(ORDINAL_AREA_W, widgetW) - 2 * 16;
    const pitchExtra = BADGE_ORDINAL.above + BADGE_ORDINAL.clear;
    const cardW = cueSize + 16 + 2 * (20 + 3);
    const cardH = 76 + 24 + 2 * 3;
    // Check as drawn (K: icon-only, narrower than the designed pill) and the column gap.
    const checkBeside = checkW > 0 ? Math.min(ORDINAL_CHECK_W, checkW + 56) : ORDINAL_CHECK_W;
    const search = (h: number, flush: boolean) => {
      let best: {
        rows: number;
        arrange: 'side' | 'stack';
        cell: number;
        flush: boolean;
      } | null = null;
      for (let rows = 1; rows <= Math.min(4, count); rows++) {
        const perRow = Math.ceil(count / rows);
        const units = (perRow - 1) * 1.12 + 1;
        for (const arrange of ['side', 'stack'] as const) {
          const cw = ((arrange === 'side' ? w - checkBeside : w) - cardW) / units;
          const ch =
            ((arrange === 'side' ? h : h - 16 - CHECK_W) - cardH - (rows - 1) * pitchExtra) / rows;
          const c = Math.floor(Math.min(cw, ch, 112));
          if (c < minCell) continue;
          if (!best || c > best.cell * (rows > best.rows ? 1.08 : 1))
            best = { rows, arrange, cell: c, flush };
        }
      }
      return best;
    };
    // With the widget's padding top and bottom; where that leaves no full-size targets (ten K
    // objects in two rows on the smallest landscape area), with the area's whole height.
    return search(hostH - 2 * PAD_Y, false) ?? search(hostH, true);
  })();
  const wrapRows = (() => {
    if (ordinalFit) return ordinalFit.rows;
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
  // Equal-groups plates side by side that cannot keep full-size targets in one row at this width
  // go into as few rows of plates as fit, each row centred (29 crabs on three G1 plates: 2 + 1).
  const platesPerRow = (() => {
    if (config.set.layout !== 'groups' || baseLayout.frames.length < 2) return Infinity;
    for (let per = baseLayout.frames.length; per > 1; per--) {
      if (wrapPlates(baseLayout, per).width * minCell <= stackW) return per;
    }
    return 1;
  })();
  const fitLayout = useMemo(() => {
    // Ordinal objects render in counting order (DOM = Tab = reading order), from the marker.
    const counted = ordinal ? inCountingOrder(lineLayout, from) : lineLayout;
    if (platesPerRow < counted.frames.length) return wrapPlates(counted, platesPerRow);
    return wrapRows > 1 ? wrapRow(counted, wrapRows, ordinal ? from : 'left') : counted;
  }, [lineLayout, wrapRows, ordinal, from, platesPerRow]);
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
    if (ordinal && ordinalFit) return { arrange: ordinalFit.arrange, cell: ordinalFit.cell };
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
    // A picture in places, or any picture beside a compact pad, in a narrow widget (the 960 × 600
    // minimum) takes the width actually left beside the answer: the widget's padding (2 × 24),
    // the column gap, the card's padding and border (2 × 31) and 8 px to spare. Where the host
    // sets a height, the picture also keeps inside it.
    const sideW =
      (onDots || compactPad || stepOnly) && widgetW !== null
        ? widgetW - answerW - 2 * (compactPad ? 12 : 24) - gapX - 2 * (cardPadX + 3) - 8
        : 1100 - answerW - 240 - shortfall;
    const roomH = Number.isFinite(hostH) ? hostH - 2 * PAD_Y - cardY : Number.POSITIVE_INFINITY;
    const sideH = Math.min(340, roomH);
    const sideCell = Math.max(minCell, Math.min(wrappedCap, fitPicture(set, sideW, sideH)));
    if (set.width * sideCell <= sideW) return { arrange: 'side', cell: sideCell };
    const stackH = Math.min(Math.max(120, 520 - answerH), roomH - answerH - 16);
    return {
      arrange: 'stack',
      cell: Math.max(minCell, Math.min(wrappedCap, fitPicture(set, stackW, stackH))),
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

  /**
   * The part of an object's box (at `left`, `top` in the set, `hitSize` square) inside its place:
   * on a ten-frame, its cell inside the frame's 4 px border and the 1.5 px cell lines (an edge
   * cell's box reaches over the border); on a plate, the whole box.
   */
  const placeBand = (o: PlacedObject, left: number, top: number) => {
    if (!onGrid) return { top: 0, bottom: hitSize, centreX: hitSize / 2 };
    // A target cell is the object's box, drawn with a 3 px line.
    if (targetCells) return { top: 3, bottom: hitSize - 3, centreX: hitSize / 2 };
    const inset = (1 - o.scale) / 2;
    const col = Math.round(o.x - inset);
    const y = o.y - inset;
    const f = Math.floor((y + 0.01) / 2.5);
    const row = Math.round(y - f * 2.5);
    const cw = cell - (2 * FRAME_BORDER) / 5;
    const ch = cell - FRAME_BORDER;
    const cellLeft = FRAME_BORDER + col * cw;
    const cellTop = f * 2.5 * cell + FRAME_BORDER + row * ch;
    return {
      top: Math.max(0, cellTop + CELL_LINE - top),
      bottom: Math.min(hitSize, cellTop + ch - CELL_LINE - top),
      centreX: cellLeft + cw / 2 - left,
    };
  };

  /**
   * The object counted last, and where the running count goes: above that object's place (its
   * column), in the card's top padding, so the number is tied to the object it was counted on.
   * `countX` is the place's centre measured from the laid-out card (its padding edge), so a start
   * marker or any padding before the set is counted in; CSS keeps the badge ≥ 12 px in from the
   * card's sides.
   */
  const latestIndex = order.at(-1) ?? null;
  const [countX, setCountX] = useState<number | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || latestIndex === null || !onDots) return;
    const card = root.querySelector<HTMLElement>('.ni-tapc__picture');
    const obj = root.querySelector<HTMLElement>(`.ni-tapc__obj[data-obj="obj-${latestIndex}"]`);
    if (!card || !obj) return;
    const frames = onGrid ? [...root.querySelectorAll('.ni-objects__frame')] : [];
    const place = onGrid
      ? (frames[Math.floor(latestIndex / 10)]?.querySelectorAll('.ni-objects__cell')[
          latestIndex % 10
        ] ?? obj)
      : obj;
    const p = place.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const x = Math.round((p.left + p.width / 2 - (c.left + card.clientLeft)) * 2) / 2;
    setCountX((prev) => (prev === x ? prev : x));
  });

  const renderObject = (o: PlacedObject, style: CSSProperties) => {
    const left = Number(style.left) + Number(style.width) / 2 - hitSize / 2;
    const top = Number(style.top) + Number(style.height) / 2 - hitSize / 2;
    const spriteSize = Math.min(hitSize, Number(style.width));
    const isObject = o.kind === 'object';
    const mark = isObject ? markOf.get(o.index) : undefined;
    const box: CSSProperties = { left, top, width: hitSize, height: hitSize };
    // A picture in places while marks can show: every object's drawing at the top of its place,
    // the room under it for its count dot (dotPlacement).
    const placed =
      dotRoom && isObject
        ? dotPlacement(
            hitSize,
            spriteSize,
            placeBand(o, left, top),
            drawnBoxes[o.sprite] ?? FULL_BOX,
          )
        : null;
    const sprite = (
      <span
        className="ni-tapc__sprite"
        style={
          placed
            ? {
                width: placed.size,
                height: placed.size,
                alignSelf: 'start',
                marginTop: placed.spriteTop,
              }
            : { width: spriteSize, height: spriteSize }
        }
      >
        <ObjectSprite sprite={o.sprite} tone={o.tone} />
      </span>
    );
    const badge =
      mark === undefined || !showMarks ? null : placed ? (
        <span
          className="ni-tapc__dot"
          data-latest={o.index === latestIndex ? 'true' : undefined}
          aria-hidden="true"
          style={{
            width: placed.dot,
            height: placed.dot,
            top: placed.dotTop,
            left: placed.dotLeft,
          }}
        />
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
          data-obj={isObject ? `obj-${o.index}` : `distractor-${o.index}`}
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

  // ---------- count, then answer: the answer step ----------

  const askSpec = useMemo(() => ({ kind: 'objects' as const, set: config.set }), [config.set]);
  const askMax = trayValues.at(-1) ?? 0;
  const askInput = {
    ageMode,
    max: askMax,
    button: stepButton,
    actions: 2 as const,
    room: { w: (widgetW ?? HOW_MANY_AREA_W) - 2 * 24, h: hostH - 2 * PAD_Y },
    pictureScore: (box: Size) => {
      const set = countLayout(askSpec);
      if (!set) return 0;
      const c = cellToFit(set, box.w - ASK_CARD_EDGE, box.h - ASK_CARD_EDGE);
      return c >= ASK_MIN_CELL ? Math.min(c, 96) : 0;
    },
  };
  /**
   * The answer is a pick among numeral cards on every screen (the same `opt-<n>` trace). Up to 20
   * that is the kit's tray; above it (0–30 for sets of 21 to 30) the kit would hand out the number
   * pad, so the step draws the cards itself: the widest tray that fits, with the picture if one
   * of them leaves it room.
   */
  const ownTray = askMax > TRAY_MAX;
  const ownTrayPlans = ownTray
    ? trayColumnChoices(trayValues.length)
        .filter((cols) => cols >= 3)
        .map((cols) => ({
          cols,
          plan: planAsk({
            ...askInput,
            control: numeralTraySize(trayValues.length, trayDigits, cols, target, TARGET_GAP_PX),
          }),
        }))
    : [];
  const ownTrayFits = ownTrayPlans.some((c) => c.plan.fits);
  // The steps are chosen only where one of these fits; in a room that shrank afterwards, the
  // narrowest (it overflows downwards, where the area scrolls).
  const ownTrayPick =
    ownTrayPlans.find((c) => c.plan.fits && c.plan.picture) ??
    ownTrayPlans.find((c) => c.plan.fits) ??
    ownTrayPlans.at(-1);
  const askPlan = ownTrayPick?.plan ?? planAsk({ ...askInput, trayOnly: true });
  const stepActions = (
    <StepActions
      actRef={actRef}
      step={two.step}
      back
      dir={asking && askPlan.act === 'row' ? 'row' : 'column'}
      interactive={interactive}
      ready={canCheck}
      onStep={two.goTo}
      onCheck={submit}
      invited={cue?.at === 'check' ? 'check' : null}
      compact
    />
  );
  if (asking) {
    return (
      <div
        ref={rootRef}
        className="ni-tapc"
        data-tier={tier}
        data-mode="how-many"
        data-step="ask"
        data-disabled={disabled ? 'true' : undefined}
        style={handRootStyle}
      >
        <AskStep
          plan={askPlan}
          picture={
            <div className="ni-tapc__askpic">
              <FitPicture
                spec={askSpec}
                maxWidth={Math.max(1, (askPlan.picture?.w ?? 0) - ASK_CARD_EDGE)}
                maxHeight={Math.max(1, (askPlan.picture?.h ?? 0) - ASK_CARD_EDGE)}
                label={t('ui.widget.picture')}
              />
            </div>
          }
          entry={
            ownTrayPick ? (
              <div className="ni-tapc__asktray">
                <NumeralTray
                  values={trayValues}
                  selected={picked}
                  highlighted={cueCard}
                  onPick={pick}
                  disabled={!interactive}
                  columns={ownTrayPick.cols}
                />
              </div>
            ) : (
              <AskEntry
                plan={askPlan}
                max={askMax}
                value={picked}
                onChange={(v) => {
                  setInvite((inv) => (followsInput(inv) ? inv : null));
                  setPicked(v);
                }}
                disabled={!interactive}
                highlighted={cueCard}
                trace={trace}
                onEnter={submit}
                actions={stepActions}
              />
            )
          }
          actions={stepActions}
        />
        {inviteHand}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="ni-tapc"
      data-tier={tier}
      data-mode={ordinal ? 'ordinal' : 'how-many'}
      data-arrange={arrange}
      data-dots={onDots ? 'true' : undefined}
      data-cells={targetCells ? 'targets' : undefined}
      data-pad={compactPad ? 'compact' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      data-step={stepOnly ? 'build' : undefined}
      style={ordinalFit?.flush ? { ...handRootStyle, paddingBlock: 0 } : handRootStyle}
    >
      <div className="ni-tapc__picture" data-from={ordinal ? from : undefined}>
        {onDots && showMarks && order.length > 0 ? (
          // The running count, once, outside every place (the count is also spoken).
          <span
            key={order.length}
            className="ni-tapc__count"
            aria-hidden="true"
            style={
              countX === null
                ? undefined
                : { left: `clamp(${COUNT_HALF}px, ${countX}px, calc(100% - ${COUNT_HALF}px))` }
            }
          >
            {order.length}
          </span>
        ) : null}
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

      <div
        className="ni-tapc__answer"
        data-check={checkBesidePad ? 'beside' : undefined}
        data-pad={compactPad ? 'compact' : undefined}
      >
        {config.input === 'pad' && !ordinal ? (
          <div className="ni-tapc__pad">
            <span className="ni-tapc__slot">
              <NumberDisplay
                value={padText === '' ? null : padText}
                digits={maxDigits}
                size={compactPad ? 'md' : 'lg'}
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
        {config.input !== 'pad' && !ordinal && !stepOnly && (trayShown || !collapseTray) ? (
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
        {stepOnly ? (
          // Next comes once every object is counted (as the tray does on one screen).
          allCounted ? (
            stepActions
          ) : (
            <span className="ni-tapc__step-room" aria-hidden="true" />
          )
        ) : (
          <span className="ni-tapc__check" ref={checkRef}>
            <CheckButton onPress={submit} disabled={!canCheck} invited={cue?.at === 'check'} />
          </span>
        )}
      </div>
      {inviteHand}
    </div>
  );
}

export default TapCountWidget;
