import { formatModel } from '@number-island/engine';
import type { StimulusSpec, WidgetAction } from '@number-island/shared';
import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { MIN_TARGET_PX, TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo, wait } from '../demo';
import {
  CheckButton,
  cellToFit,
  countLayout,
  describeCoins,
  FitPicture,
  FracNumeral,
  fractionLabel,
  fractionWords,
  LINE_BARE_PAD,
  naturalPictureSize,
  numberLineHeight,
  type ObjectLayout,
  spriteNameKey,
  stepsBetween,
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
import './order.css';

/**
 * `order` (03 §5.5): numeral cards (or small pictures) start in a tray in the item's shuffled
 * order; the child puts each into the row of slots, left to right. Growing (or shrinking) pebbles
 * above the slots show the direction without words: small → big for `asc`, big → small for
 * `desc`. Drag, tap-to-place and keyboard all come from `useDragToTarget`; tapping a placed card
 * sends it back to the tray (trace `undo`). `fixed` slots hold a pinned card that cannot move.
 * "Check" waits until every slot is full, then answers `{ kind: 'numbers', values }` (values in
 * slot order) through the format model.
 *
 * Layout (06 §1, container-relative): the widget measures its room (`useWidgetRoom`) and picks the
 * biggest card (age target to 1.5 × target tall; picture cards may be wider than tall so a number
 * line, ten-frame or blocks stay readable) that fits with the direction cue, slots, tray and
 * Check, Check beside the tray when that fits; a short room gets a compact cue and tighter board.
 *
 * Demo ops (03 §5.5): `drag {id, slot}`, `highlight {id}`, plus `answer {values}`. An invite rings
 * ONE control and Pip's hand points at it (kit `useInviteHand`): `drag` the card, then (once the
 * child has picked it up) its slot; `highlight` the card; `answer` the next card the model's
 * solution puts in the first slot that is not yet right (then that slot).
 */

const OPS = ['drag', 'highlight', 'answer'] as const;
/** Place names for a `places` cue, from the ones up. */
const PLACE_WORDS = ['ones', 'tens', 'hundreds'] as const;
const FLY_MS = 480;

type Config = ConfigFor<'order'>;
type Item = Config['items'][number];
type SlotId = `slot-${number}`;

const slotId = (k: number): SlotId => `slot-${k}`;
const slotIndex = (id: SlotId) => Number(id.slice(5));
const isNumeral = (label: string | undefined) => label !== undefined && /^-?\d+$/.test(label);

// ---------- layout ----------

/**
 * Between cards (≥ the 12 px target gap, 06 §4). The invite ring on a card or slot is drawn over
 * its own edge (no reach), so it stays ≥ 12 px clear of its neighbours, the board's and tray's
 * edges and the cue arrow (one ring at a time).
 */
const CARD_GAP = 14;
/** A card's border (3) and padding (5) around its numeral. */
const CARD_PAD = 8;
/** A numeral or picture keeps ≥ 16 px from its card's outer edge (sides). */
const FACE_MARGIN = 16;
/** Around a picture: the 16 px margin (left/right; top/bottom too on an untagged card). */
const PIC_PAD = FACE_MARGIN;
/** The numeral above a picture (40 px numeral: well above the 32 px floor, 05 §11). */
const TAG_H = 40;
/** Between a fraction and its strip on a card (the fraction stands at the strip's left). */
const FRAC_SIDE_GAP = 10;
/** Type size of a stacked fraction on a card: its digits are 0.62 em, so ≥ 28 px. */
const FRAC_PX = 46;
/**
 * Above and below a tagged picture (number-path cards): the card border and padding, and 2 px more
 * below, so Pip's hand under the card (fingertip just inside its bottom edge) stays off the path.
 */
const TAG_PAD_Y = 8;
const TAG_PAD_BOTTOM = 10;
/** Drawn px between a path's ticks: closer than this, the path keeps every 5th tick (5s and 10s). */
const MIN_TICK_PITCH = 8;
/** A compact path's numeral (≥ 32 px, 05 §11), beside the path with this gap. */
const SIDE_TAG_PX = 32;
const SIDE_TAG_GAP = 6;

/**
 * A compact number path for a small card, in fixed screen-px ink so it reads at K size however
 * small the card (the card-scaled path would be hairlines): a 4 px track, ticks 3.5 px wide and
 * ≥ 12 px tall (14 at 5s, 18 at 10s), the mark an 18 × 18 px pointer standing ≥ 6 px above the
 * tallest tick, end arrows 10 px long ≥ 6 px from any pointer. The ticks stay evenly spaced on
 * the largest step of 10, 5, 2, 1 that divides the span with ticks ≥ 8 px apart, ranked by value;
 * a span no such step divides keeps 5s (or the first step ≥ 8 px apart) and both ends as long
 * ticks of their own. The pointer sits exactly over its own value's place. Same classes as
 * NumberLineView.
 */
const PATH = {
  pad: 16,
  axis: 4,
  tick: 3.5,
  half: { one: 6, five: 7, ten: 9 },
  pointer: 18,
  pointerStroke: 2.5,
  gap: 7,
  cap: { from: 4, to: 14, half: 6 },
} as const;
/** Line y: room above for the tallest tick, the gap and the pointer (all with their strokes). */
const PATH_TIP = PATH.half.ten + PATH.tick / 2 + PATH.gap + PATH.pointerStroke / 2;
const PATH_Y = Math.ceil(PATH_TIP + PATH.pointer + PATH.pointerStroke / 2 + 1);
const PATH_H = PATH_Y + Math.ceil(PATH.half.ten + PATH.tick / 2 + 1);

function CardPath({
  spec,
  width,
}: {
  spec: Extract<StimulusSpec, { kind: 'number-line' }>;
  width: number;
}) {
  const { min, max } = spec;
  const unit = spec.ticksEvery ?? 1;
  const span = Math.max(unit, max - min);
  const inner = width - 2 * PATH.pad;
  const x = (v: number) => PATH.pad + ((v - min) / span) * inner;
  // The step: the largest of 10, 5, 2, 1 units that divides the span with ticks ≥ 8 px apart;
  // when none divides it (a 0–11 ruler), the one with ticks ≥ 8 px apart (5s first), and the two
  // ends get ticks of their own, so the whole path always shows from its first value to its last.
  const wide = (k: number) => (inner * unit * k) / span >= MIN_TICK_PITCH;
  const divides = (k: number) => Math.abs(span / (unit * k) - Math.round(span / (unit * k))) < 1e-9;
  const k = [10, 5, 2, 1].find((f) => wide(f) && divides(f)) ?? [5, 10, 2, 1].find(wide) ?? 10;
  const steps = stepsBetween(min, max, unit * k);
  const ends = [min, max].filter((v) => !steps.some((g) => Math.abs(g - v) < 1e-9));
  // A step tick that would crowd an end's own tick (10 beside 11: under 8 px apart) is left out:
  // every drawn tick keeps the minimum pitch from its neighbours.
  const grid = steps.filter((g) => ends.every((e) => Math.abs(x(g) - x(e)) >= MIN_TICK_PITCH));
  const ticks = [...grid, ...ends].sort((a, b) => a - b);
  const y = PATH_Y;
  return (
    <svg
      className="ni-numberline ni-ord__path"
      width={width}
      height={PATH_H}
      viewBox={`0 0 ${width} ${PATH_H}`}
      aria-hidden="true"
      focusable="false"
    >
      <line
        className="ni-numberline__axis"
        x1={PATH.pad - PATH.cap.from - 2}
        x2={width - PATH.pad + PATH.cap.from + 2}
        y1={y}
        y2={y}
      />
      <path
        className="ni-numberline__cap"
        data-end="min"
        d={`M${PATH.pad - PATH.cap.to} ${y}l${PATH.cap.to - PATH.cap.from} -${PATH.cap.half}v${2 * PATH.cap.half}z`}
      />
      <path
        className="ni-numberline__cap"
        data-end="max"
        d={`M${width - PATH.pad + PATH.cap.to} ${y}l-${PATH.cap.to - PATH.cap.from} -${PATH.cap.half}v${2 * PATH.cap.half}z`}
      />
      {ticks.map((v) => {
        const step = Math.round(v / unit);
        // An end off the step's grid is a long tick of its own (`end`).
        const end = ends.includes(v);
        const rank = end ? 'end' : step % 10 === 0 ? 'ten' : step % 5 === 0 ? 'five' : 'one';
        const h = PATH.half[end ? 'ten' : (rank as 'ten' | 'five' | 'one')];
        return (
          <line
            key={`t${v}`}
            className="ni-numberline__tick"
            data-rank={rank}
            data-step={unit * k}
            data-at={v}
            x1={x(v)}
            x2={x(v)}
            y1={y - h}
            y2={y + h}
          />
        );
      })}
      {(spec.marks ?? []).map((m) => (
        <g key={`m${m.at}`} className="ni-numberline__mark" data-at={m.at}>
          <path
            className="ni-numberline__pointer"
            d={`M${x(m.at)} ${y - PATH_TIP}l-${PATH.pointer / 2} -${PATH.pointer}h${PATH.pointer}z`}
          />
        </g>
      ))}
    </svg>
  );
}
const ROOT_PAD = { x: 8, y: 4 };
const BORDER = 3;
const CHROME = {
  normal: {
    board: { top: 14, x: 24, bottom: 18 },
    cue: 74,
    cueGap: 14,
    tray: { top: 16, bottom: 14, x: 18 },
    gap: 24,
  },
  compact: {
    board: { top: 4, x: 14, bottom: 12 },
    cue: 38,
    cueGap: 12,
    // 16 px over the cards: a picked-up card (lifted 3 px, 2 % bigger) stays ≥ 12 px inside.
    tray: { top: 16, bottom: 12, x: 14 },
    gap: 6,
  },
  // Tall and narrow rooms (portrait): the full cue and spacing, the compact sides (the cards get
  // every pixel of the row).
  tall: {
    board: { top: 14, x: 14, bottom: 18 },
    cue: 74,
    cueGap: 14,
    tray: { top: 16, bottom: 14, x: 14 },
    gap: 24,
  },
} as const;
type Chrome = keyof typeof CHROME;
const CHECK_GAP = 24;
/**
 * How far Pip's hand reaches below a card's bottom edge (kit useInviteHand: the 56 px hand, its
 * fingertip ~18 px up the card, its 8 px bob and 10 px edge margin), so a tray card's invite
 * needs no more room than the layout has.
 */
const HAND_REACH = 57;

interface Plan {
  w: number;
  h: number;
  chrome: Chrome;
  check: 'beside' | 'below';
  /** Bottom room held for Pip's hand under a tray card, so an invite never moves or scrolls. */
  handPad?: number;
}

interface Shape {
  n: number;
  /** Cards in the tray (the unpinned ones). */
  tray: number;
  /** The card widths a card height allows (picture cards: up to what the picture can use). */
  width: (h: number) => { min: number; max: number };
  target: number;
  /** The tallest card worth drawing (picture cards grow to use the room). */
  maxH: number;
  /** Take the compact cue only when it buys at least this much card height (pictures). */
  compactGain: number;
  check: { w: number; h: number };
  /**
   * When set, the plan that fits (room for Pip's hand first) with the best score wins over the
   * tallest card (number-path cards: the widest tick pitch).
   */
  score?: (p: Plan, size: { w: number; h: number }) => number;
}

function sizeOf(s: Shape, p: Plan) {
  const c = CHROME[p.chrome];
  const row = (k: number) => k * p.w + Math.max(0, k - 1) * CARD_GAP;
  const boardW = row(s.n) + 2 * (c.board.x + BORDER);
  const boardH = 2 * BORDER + c.board.top + c.cue + c.cueGap + p.h + c.board.bottom;
  const trayW = s.tray > 0 ? row(s.tray) + 2 * (c.tray.x + BORDER) : 0;
  const trayH = c.tray.top + c.tray.bottom + 2 * BORDER + p.h;
  // Board and tray share one column (the tray right under the board); Check beside the tray in a
  // column of its own, or below.
  const colW = Math.max(boardW, trayW);
  const width = p.check === 'beside' ? colW + CHECK_GAP + s.check.w : Math.max(colW, s.check.w);
  const bottomH = p.check === 'beside' ? Math.max(trayH, s.check.h) : trayH + c.gap + s.check.h;
  // Below the tray's cards: its padding and border, then Check (when below) and the widget's edge.
  const underTray =
    c.tray.bottom + BORDER + ROOT_PAD.y + (p.check === 'below' ? c.gap + s.check.h : 0);
  return {
    w: width + 2 * ROOT_PAD.x,
    h: boardH + c.gap + bottomH + 2 * ROOT_PAD.y,
    hand: s.tray > 0 ? Math.max(0, HAND_REACH - underTray) : 0,
  };
}

/**
 * The biggest card that fits the room with room held for Pip's hand under a tray card: the
 * tallest card, Check beside the tray when it fits, the widest card its picture can use; the full
 * cue unless the compact one buys clearly bigger cards (or the full one fits nothing). Nothing
 * fits: the smallest layout (the area then scrolls; targets never shrink below the minimum).
 */
function planLayout(s: Shape, room: WidgetRoom | null): Plan {
  const W = room?.width ?? 1180;
  const H = room?.height ?? Number.POSITIVE_INFINITY;
  const best = (chrome: Chrome, withHand: boolean): Plan | null => {
    for (let h = s.maxH; h >= s.target; h -= 2) {
      const { min, max } = s.width(h);
      for (const check of ['beside', 'below'] as const) {
        for (let w = max; w >= min; w = w > min && w - 4 < min ? min : w - 4) {
          const p = { w, h, chrome, check };
          const size = sizeOf(s, p);
          if (size.w <= W + 0.5 && size.h + (withHand ? size.hand : 0) <= H + 0.5) {
            return { ...p, handPad: withHand ? size.hand : 0 };
          }
          if (w === min) break;
        }
      }
    }
    return null;
  };
  if (s.score) {
    const score = s.score;
    for (const withHand of [true, false]) {
      let top: Plan | null = null;
      let topScore = Number.NEGATIVE_INFINITY;
      for (const chrome of ['normal', 'tall', 'compact'] as const) {
        for (let h = s.maxH; h >= s.target; h -= 2) {
          const { min, max } = s.width(h);
          for (const check of ['beside', 'below'] as const) {
            // 1 px steps: a number-path card takes every pixel of width the row allows.
            for (let w = max; w >= min; w -= 1) {
              const p = { w, h, chrome, check };
              const size = sizeOf(s, p);
              if (size.w <= W + 0.5 && size.h + (withHand ? size.hand : 0) <= H + 0.5) {
                const v = score(p, size);
                if (v > topScore + 0.01) {
                  top = { ...p, handPad: withHand ? size.hand : 0 };
                  topScore = v;
                }
                break;
              }
              if (w === min) break;
            }
          }
        }
      }
      if (top) return top;
    }
  }
  for (const withHand of [true, false]) {
    const normal = best('normal', withHand);
    const compact = best('compact', withHand);
    if (normal && (!compact || compact.h < normal.h + s.compactGain)) return normal;
    if (compact) return compact;
  }
  const smallest = { w: s.width(s.target).min, h: s.target, chrome: 'compact' as const };
  const beside = { ...smallest, check: 'beside' as const };
  return sizeOf(s, beside).w <= W + 0.5 ? beside : { ...smallest, check: 'below' };
}

/**
 * A number line on a card keeps its ticks and mark (the place is the picture) but not its tick
 * numerals: drawn card-small they would be unreadable, and the card's own numeral (or the mark's
 * label) names it. Text a card shows is then exactly its name (axe label-content-name-mismatch).
 */
const cardPicture = (spec: StimulusSpec): StimulusSpec =>
  spec.kind === 'number-line' ? { ...spec, labelsEvery: null } : spec;

/** The number a number-line picture already prints at its mark (so the card needn't repeat it). */
const markShows = (spec: StimulusSpec | undefined, label: string | undefined) =>
  spec?.kind === 'number-line' && (spec.marks ?? []).some((m) => m.label === label);

/** A card's label as drawn: a fraction "a/b" stacked (K02 slice 5a), anything else as it is. */
const fracGlyph = (label: string | undefined) => {
  const f = fractionLabel(label);
  return f ? <FracNumeral a={f.a} b={f.b} className="ni-ord__fracnum" drawn /> : label;
};

// ---------- art ----------

/** A pebble for the direction cue (decorative; the cue row carries the name). */
function CuePebble({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="ni-ord__pebble"
    >
      <path
        d="M8 36c0-14 11-26 25-26 13 0 23 9 23 22 0 13-10 22-24 22S8 49 8 36Z"
        fill="var(--color-sunshine)"
        stroke="var(--color-ink)"
        strokeWidth="4"
      />
      <path
        d="M20 26c3-4 7-6 12-6"
        stroke="var(--color-cloud)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** A push pin: this card is fixed in its slot. */
function PinIcon() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path d="M24 30v14" stroke="var(--color-ink)" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M14 8h20l-3 10 6 8H11l6-8-3-10Z"
        fill="var(--color-coral)"
        stroke="var(--color-ink)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M19 12h10" stroke="var(--color-cloud)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface Flight {
  item: Item;
  from: DOMRect;
  to: DOMRect;
  moving: boolean;
}

/** Where a demo invite points: a card (in the tray or placed) or an empty slot. */
type Cue = { kind: 'card'; id: string } | { kind: 'slot'; slot: number };

function initialSlots(config: Config): (string | null)[] {
  const slots: (string | null)[] = config.items.map(() => null);
  for (const [slot, id] of Object.entries(config.fixed ?? {})) slots[Number(slot)] = id;
  return slots;
}

export function OrderWidget({
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
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const [slots, setSlots] = useState<(string | null)[]>(() => initialSlots(config));
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const [highlight, setHighlight] = useState<string | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const checkRef = useRef<HTMLSpanElement | null>(null);
  const room = useWidgetRoom(rootRef);
  // Drawn-to-size card pictures (blocks, lines) share one scale: size is never a false cue.
  const shared = useSharedScale();

  const interactive = !disabled && !demoBusy;
  const fixed = config.fixed ?? {};
  const fixedSlots = new Set(Object.keys(fixed).map(Number));
  const fixedIds = new Set(Object.values(fixed));
  const itemById = new Map(config.items.map((it) => [it.id, it]));
  const n = config.items.length;
  const complete = slots.every((s) => s !== null);

  const itemName = (it: Item) => {
    // A fraction is named as it is said ("three eighths"), never "3/8" (03 §8.3).
    const frac = fractionLabel(it.label);
    return frac ? fractionWords(t, frac.a, frac.b) : itemNameOf(it);
  };
  const itemNameOf = (it: Item) =>
    it.label ??
    (it.stimulus?.kind === 'coins'
      ? describeCoins(it.stimulus.coins, it.stimulus.bills ?? [], t)
      : it.stimulus
        ? t('ui.order.picture', { n: config.items.indexOf(it) + 1 })
        : String(it.value));
  const speakItem = (it: Item, byDemo = false) => {
    if (!speakOnTap) return;
    // Numerals speak their name (06 §5): the numeral the card shows, which need not be the value
    // it sorts by (FRA.08.t4 shows a part count and sorts by piece size). A card of objects names
    // its thing ("apple"), never how many or how much: a picture's quantity is the child's to find.
    const frac = fractionLabel(it.label);
    if (frac) say('ui.frac.value', { f: `${frac.a}/${frac.b}` });
    else if (it.label !== undefined && isNumeral(it.label)) sayNumber(Number(it.label));
    else if (!it.label && !it.stimulus) sayNumber(it.value);
    else if (it.stimulus?.kind === 'objects') say(spriteNameKey(it.stimulus.set.sprite));
    // Money (MON.08, PR #132 review): an amount card says its amount; a purse card says how many
    // pieces it shows, never their total. On a child's tap only: a demo move plays under its own
    // lesson line, which a card's speech would cut off (review round 2). The cards above speak
    // in a demo as they did before (review round 3).
    else if (byDemo) return;
    else if (it.label !== undefined && /^\d+¢$/.test(it.label)) {
      say('ui.money.amount', { cents: Number.parseInt(it.label, 10) });
    } else if (it.stimulus?.kind === 'coins') {
      const n = it.stimulus.coins.length + (it.stimulus.bills?.length ?? 0);
      say(n === 1 ? 'ui.coin.count-one' : 'ui.coin.count', { n });
    }
  };

  /** Puts an item in a slot: its old slot frees up and the slot's occupant goes back to the tray. */
  const placeIn = (id: string, k: number) => {
    if (fixedSlots.has(k) || fixedIds.has(id) || k < 0 || k >= n) return;
    const next = slotsRef.current.map((x, i) => (x === id && !fixedSlots.has(i) ? null : x));
    next[k] = id;
    slotsRef.current = next;
    setSlots(next);
  };

  const dnd = useDragToTarget<string, SlotId>({
    disabled: !interactive,
    trace,
    // One card per slot: a full slot takes no card until its card is tapped back to the tray.
    // Keyboard play therefore jumps straight to the first empty slot.
    canPlace: (_item, target) => slotsRef.current[slotIndex(target)] === null,
    onSelect: (id) => {
      const it = id === null ? undefined : itemById.get(id);
      if (it) speakItem(it);
    },
    onPlace: ({ item, target }) => {
      // A drag or answer invite follows the row (its cue moves on by itself); a highlight ends.
      setInvite((cur) => (cur?.op === 'highlight' ? null : cur));
      placeIn(item, slotIndex(target));
    },
  });

  const sendBack = (k: number) => {
    const id = slots[k];
    if (!interactive || id === null || id === undefined || fixedSlots.has(k)) return;
    trace('undo', id);
    // A tapped card speaks wherever it lies (06 §5), in a box as in the tray.
    const it = itemById.get(id);
    if (it) speakItem(it);
    const next = [...slotsRef.current];
    next[k] = null;
    slotsRef.current = next;
    setSlots(next);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || !complete) return false;
    const model = formatModel('order');
    if (!model) return false;
    let state = model.initialState(config);
    slots.forEach((id, slot) => {
      if (id !== null && !fixedSlots.has(slot)) {
        state = model.apply(state, { op: 'drag', args: { id, slot } });
      }
    });
    const response = model.toResponse(state);
    if (!response) return false;
    setInvite(null);
    onResponse(response);
    return true;
  });

  /** The slots the model's solution fills for an `answer {values}` action, or null. */
  const solutionSlots = (action: WidgetAction): (string | null)[] | null => {
    const model = formatModel('order');
    if (!model) return null;
    const state = model.apply(model.initialState(config), action);
    if (model.toResponse(state) === null || !('slots' in state)) return null;
    return state.slots as (string | null)[];
  };

  // ---------- demo mode (03 §6.3) ----------

  const rectOf = (pick: (root: HTMLElement) => HTMLElement | undefined) => {
    const root = rootRef.current;
    return root ? (pick(root)?.getBoundingClientRect() ?? null) : null;
  };
  const byData = (root: HTMLElement, key: string, value: string) =>
    [...root.querySelectorAll<HTMLElement>(`[data-${key}]`)].find(
      (el) => el.dataset[key.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] === value,
    );

  /** Flies an item's card to slot k (instant with reduced motion), then places it. */
  const demoDrag = async (id: string, k: number) => {
    const it = itemById.get(id);
    if (!it || fixedSlots.has(k) || fixedIds.has(id) || k < 0 || k >= n) return;
    setHighlight(id);
    speakItem(it, true);
    await pause(350);
    if (!alive.current) return;
    const from = rectOf((r) => byData(r, 'card', id) ?? byData(r, 'placed', id));
    const to = rectOf((r) => byData(r, 'slot-pad', String(k)));
    if (!reduced && from && to) {
      setFlight({ item: it, from, to, moving: false });
      await wait(20);
      if (!alive.current) return;
      setFlight({ item: it, from, to, moving: true });
      await wait(FLY_MS);
      if (!alive.current) return;
    }
    placeIn(id, k);
    setFlight(null);
    setHighlight(null);
    await pause(200);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'drag') {
          const id = action.args?.id;
          const k = Number(action.args?.slot);
          if (typeof id === 'string' && Number.isInteger(k)) await demoDrag(id, k);
        } else if (action.op === 'highlight') {
          const id = action.args?.id;
          const it = typeof id === 'string' ? itemById.get(id) : undefined;
          if (!it) return;
          setHighlight(it.id);
          speakItem(it, true);
          await pause(1200);
          if (alive.current) setHighlight(null);
        } else if (action.op === 'answer') {
          // The model decides which item goes where (equal values may swap, fixed slots stay).
          const target = solutionSlots(action);
          if (!target) return;
          for (let k = 0; k < target.length; k++) {
            const id = target[k];
            if (id === null || id === undefined || fixedSlots.has(k)) continue;
            if (slotsRef.current[k] === id) continue;
            await demoDrag(id, k);
            if (!alive.current) return;
          }
        }
      } finally {
        setFlight(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  /** The one control the invite rings, only while the child can act (03 §6.3). */
  const cue: Cue | null = (() => {
    if (!invite || !interactive) return null;
    const args = invite.args ?? {};
    /** Card `id` for slot k: the card until the child picks it up, then the slot. */
    const cardThenSlot = (id: string, k: number): Cue | null => {
      if (!itemById.has(id) || fixedIds.has(id) || fixedSlots.has(k) || k < 0 || k >= n) {
        return null;
      }
      if (slots[k] === id) return null;
      if (dnd.selected !== id) return { kind: 'card', id };
      // Picked up: the slot, or (taken by another card) that card, to tap back to the tray.
      const occupant = slots[k];
      return occupant === null || occupant === undefined
        ? { kind: 'slot', slot: k }
        : { kind: 'card', id: occupant };
    };
    switch (invite.op) {
      case 'highlight':
        return typeof args.id === 'string' && itemById.has(args.id)
          ? { kind: 'card', id: args.id }
          : null;
      case 'drag': {
        const k = Number(args.slot);
        return typeof args.id === 'string' && Number.isInteger(k) ? cardThenSlot(args.id, k) : null;
      }
      case 'answer': {
        const target = solutionSlots(invite);
        if (!target) return null;
        // Cards of one value are interchangeable (the format accepts either): a box is right when
        // it holds the value that belongs there, whichever card shows it.
        const val = (id: string | null | undefined) =>
          id === null || id === undefined ? undefined : itemById.get(id)?.value;
        const k = target.findIndex((id, i) => !fixedSlots.has(i) && val(slots[i]) !== val(id));
        if (k < 0) return null;
        // The card to move: one of that value not already lying where its value belongs; the one
        // the child has picked up, when it is such a card.
        const settled = new Set(slots.filter((id, i) => val(id) === val(target[i])));
        const fits = (it: Item) =>
          it.value === val(target[k]) && !settled.has(it.id) && !fixedIds.has(it.id);
        const held = dnd.selected === null ? undefined : itemById.get(dnd.selected);
        const id = (held && fits(held) ? held : config.items.find(fits))?.id ?? target[k];
        return id === null || id === undefined ? null : cardThenSlot(id, k);
      }
      default:
        return null;
    }
  })();
  const cueKey = cue === null ? '' : cue.kind === 'card' ? `card:${cue.id}` : `slot:${cue.slot}`;
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) =>
      cue === null
        ? null
        : cue.kind === 'card'
          ? (byData(root, 'card', cue.id) ?? byData(root, 'placed', cue.id) ?? null)
          : (byData(root, 'slot-pad', String(cue.slot)) ?? null),
    cueKey,
    // An open box is empty: Pip points down into it ("put it here"), the whole hand inside the
    // box, so it covers neither the cue's pebbles and arrow above it nor the tray below it.
    cue?.kind === 'slot' ? 'inside' : undefined,
  );
  const cardLit = (id: string) => highlight === id || (cue?.kind === 'card' && cue.id === id);

  // ---------- layout ----------

  const baseTarget = MIN_TARGET_PX[ageMode];
  const [checkSize, setCheckSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = checkRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // The button's ledge sits below its box (margin).
      const next = { w: Math.ceil(r.width), h: Math.ceil(r.height) + 6 };
      setCheckSize((c) => (c && c.w === next.w && c.h === next.h ? c : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasPictures = config.items.some((it) => it.stimulus && it.stimulus.kind !== 'none');
  // Fraction labels (K02 slice 5a) are drawn stacked: at a strip's left (a tag above it would
  // make the card too tall for two rows at 960 × 600), or alone on a card two rows high.
  const fractions = config.items.every((it) => fractionLabel(it.label) !== null);
  const fracSide = fractions && hasPictures;
  const tagRow =
    hasPictures &&
    !fracSide &&
    config.items.some((it) => it.label && !markShows(it.stimulus, it.label));
  // A stacked fraction is as wide as its longer number.
  const longest = Math.max(
    ...config.items.map((it) => {
      const f = fractionLabel(it.label);
      return f
        ? Math.max(String(f.a).length, String(f.b).length)
        : (it.label ?? String(it.value)).length;
    }),
  );
  const words =
    !hasPictures && !fractions && config.items.some((it) => it.label && !isNumeral(it.label));
  // The room a fraction takes at its strip's left: its widest number (46 px type) and the gap.
  const fracSideW = fracSide ? Math.ceil(longest * 0.62 * FRAC_PX) + 4 + FRAC_SIDE_GAP : 0;
  /** Inside a card: its 5 px padding and 3 px border each side (a strip card fills it). */
  const cardInset = fracSide ? 16 : 2 * PIC_PAD;
  // A fraction card is at least as tall as its stacked fraction needs (two 0.8 em rows and the
  // bar, inside the card's padding), so its digits never drop under 28 px.
  const target = fractions
    ? Math.max(baseTarget, Math.ceil(1.8 * FRAC_PX) + 2 * (hasPictures ? PIC_PAD : FACE_MARGIN))
    : baseTarget;
  const cardPics = config.items.map((it) =>
    it.stimulus && it.stimulus.kind !== 'none' ? cardPicture(it.stimulus) : null,
  );
  /** The picture box of an h-tall card (its width is the card's less PIC_PAD each side). */
  const picHeight = (h: number) => h - (tagRow ? TAG_PAD_Y + TAG_PAD_BOTTOM + TAG_H : 2 * PIC_PAD);
  // Picture cards are all one size: as wide as the widest picture wants for the card's height (at
  // most 2.4 × the height); a number line takes what width there is (its height is fixed).
  const aspect = Math.min(
    2.4,
    Math.max(
      0.8,
      ...cardPics.map((spec) => {
        if (!spec) return 1;
        const nat = naturalPictureSize(spec, true);
        return nat.flexWidth ? 0.8 : nat.w / Math.max(1, nat.h);
      }),
    ),
  );
  const lines = cardPics.filter(
    (spec): spec is Extract<StimulusSpec, { kind: 'number-line' }> => spec?.kind === 'number-line',
  );
  /** Width a card's number line reads well at: ~22 px a tick at full size (plus end room). */
  const lineWidth = (h: number) =>
    Math.max(
      0,
      ...lines.map((spec) => {
        const span = spec.max - spec.min;
        const ticks = Math.min(40, span / (spec.ticksEvery ?? span / 10));
        const scale = Math.min(1, picHeight(h) / numberLineHeight(spec, true));
        return Math.round(scale * (2 * LINE_BARE_PAD + ticks * 22)) + 2 * PIC_PAD;
      }),
    );
  /** A numeral card fits its longest label at ≥ 32 px (0.62 em a digit). */
  const numeralW = (h: number) =>
    Math.max(h, Math.ceil(longest * 0.62 * (fractions ? FRAC_PX : 32)) + 2 * FACE_MARGIN);

  const cardWidth = (pictures: boolean) => (h: number) => {
    if (words) {
      const w = Math.max(h, longest * 14 + 2 * CARD_PAD + 8);
      return { min: w, max: w };
    }
    // Cards may be up to 1.6 × as wide as tall where the row has room (06 §1: use the room).
    if (!pictures) {
      const w = numeralW(h);
      return { min: w, max: Math.max(w, Math.round(1.6 * h)) };
    }
    // A strip with its fraction at its left: the strip is short, so the card's height does not
    // set its width; it takes what the row has, at least 120 px of strip.
    if (fracSide) {
      const min = fracSideW + cardInset + 176;
      return { min, max: Math.max(min, Math.round(3.4 * h)) };
    }
    const pic = Math.min(
      Math.round((fracSide ? 3.4 : 2.4) * h),
      Math.max(h, Math.round(picHeight(h) * aspect) + 2 * PIC_PAD + fracSideW),
    );

    if (lines.length === 0) return { min: pic, max: Math.max(pic, Math.round(1.6 * h)) };
    const max = Math.max(pic, Math.min(3 * h, lineWidth(h)));
    return { min: Math.min(max, Math.max(pic, Math.round(1.4 * h))), max };
  };
  /** A plan's content covers ≥ 62 % of a bounded room (60 % measured, with a margin). */
  const covers = (size: { w: number; h: number }) =>
    room !== null &&
    Number.isFinite(room.height) &&
    (size.w * size.h) / (room.width * room.height) >= 0.62;
  /** The drawn pitch between a card's unit ticks under a plan (the tightest of the cards). */
  const linePitch = (p: Pick<Plan, 'w' | 'h'>) => {
    const w = p.w - 2 * PIC_PAD;
    const h = picHeight(p.h);
    return Math.min(
      ...lines.map((spec) => {
        const scale = Math.min(1, h / numberLineHeight(spec, true));
        const span = spec.max - spec.min;
        return (w - 2 * LINE_BARE_PAD * scale) / Math.max(1, span / (spec.ticksEvery ?? span));
      }),
    );
  };
  /** How much of its natural size a card's path is drawn at under a plan (the smallest). */
  const lineScale = (p: Pick<Plan, 'h'>) =>
    Math.min(1, ...lines.map((spec) => picHeight(p.h) / numberLineHeight(spec, true)));
  const planFor = (pictures: boolean) =>
    planLayout(
      {
        n,
        tray: n - fixedIds.size,
        width: cardWidth(pictures),
        target,
        // Picture cards grow to 2.2 × the target where the room allows (a ten-frame, blocks or
        // a number line read at that size); numeral cards to 1.8 ×.
        maxH: pictures ? Math.round(Math.max(target * 2.2, 150)) : Math.round(target * 1.8),
        compactGain: pictures ? 12 : Number.POSITIVE_INFINITY,
        // Number-path cards: a plan that covers ≥ 60 % of the room if any does, then one whose
        // unit ticks are ≥ 8 px apart (every tick drawn) if any is, then the biggest path (a
        // path whose unit ticks would be closer keeps only its 5s and 10s, so it is the size that
        // makes it readable); other cards: the plan that covers the most of the room (06 §1),
        // the full cue unless the compact one buys clearly more.
        score:
          pictures && lines.length > 0
            ? (p, size) =>
                (covers(size) ? 1000 : 0) +
                (linePitch(p) >= MIN_TICK_PITCH ? 500 : 0) +
                lineScale(p) * 100
            : (p, size) => size.w * size.h * (p.chrome === 'compact' ? 1 : 1.15),
        check: checkSize ?? { w: TARGET_PX[ageMode].big + 8, h: TARGET_PX[ageMode].big + 6 },
      },
      room,
    );
  // Every card keeps its picture at every size: a number-path card is the path (CMP.06's hint
  // points at it), drawn with every unit tick and its numeral, as wide as the row allows.
  const pictures = hasPictures;
  const plan = planFor(pictures);
  const picW = plan.w - cardInset - fracSideW;
  const picH = picHeight(plan.h);
  /**
   * A card's path: drawn to the card's scale with every unit tick when they are ≥ 8 px apart;
   * otherwise a compact path (`CardPath`) in fixed screen-px ink, its numeral beside it.
   */
  const compactLine = (spec: Extract<StimulusSpec, { kind: 'number-line' }>) => {
    const every = spec.ticksEvery;
    if (every === null || every <= 0) return false;
    const span = spec.max - spec.min;
    const scale = Math.min(1, picH / numberLineHeight(spec, true));
    const pitch = ((picW - 2 * LINE_BARE_PAD * scale) * every) / Math.max(every, span);
    return pitch < MIN_TICK_PITCH;
  };
  /** The numeral beside a compact path: as wide as the longest label at 32 px (none: no room). */
  const labelled = config.items.some((it) => it.label !== undefined);
  const sideTagW = labelled ? Math.ceil(longest * 0.62 * SIDE_TAG_PX) + 2 : 0;
  const compactW = Math.max(40, plan.w - 2 * PIC_PAD - (labelled ? sideTagW + SIDE_TAG_GAP : 0));
  // A plain line of more than five objects may wrap into two rows of reading order (as tap-count
  // wraps lines) when that draws every card bigger, unless the set's look is the point (spread
  // versus bunched, drawn big: compare.sets conflict items keep their pictures as given).
  const lookMatters = cardPics.some(
    (spec) => spec?.kind === 'objects' && (spec.set.layout !== 'line' || spec.set.sizeVaries),
  );
  const cardLayouts = (wrap: boolean) =>
    cardPics.map((spec) => {
      const layout = spec ? countLayout(spec, true) : null;
      return layout &&
        wrap &&
        spec?.kind === 'objects' &&
        layout.height === 1 &&
        layout.objects.length > 5
        ? wrapLine(layout, 5)
        : layout;
    });
  const cellOf = (layouts: (ObjectLayout | null)[]) =>
    Math.min(...layouts.map((l) => (l ? cellToFit(l, picW, picH) : Number.POSITIVE_INFINITY)));
  const flatLayouts = cardLayouts(false);
  const wrappedLayouts = lookMatters ? flatLayouts : cardLayouts(true);
  const wrap = !lookMatters && cellOf(wrappedLayouts) > cellOf(flatLayouts);
  const layouts = wrap ? wrappedLayouts : flatLayouts;
  // Countable pictures share one cell, so a picture's size is never a cue its count doesn't give.
  const sharedCell = cellOf(layouts);
  const layoutOf = new Map(config.items.map((it, i) => [it.id, layouts[i] ?? undefined]));
  // One numeral size for every card, as big as the longest label lets it be (≥ 32 px, 05 §11).
  const numeralPx = Math.max(
    32,
    Math.min(
      64,
      Math.floor(0.55 * plan.h),
      Math.floor((plan.w - 2 * FACE_MARGIN) / (0.62 * longest)),
    ),
  );

  // ---------- render ----------

  const face = (it: Item) => {
    const spec = it.stimulus;
    if (pictures && spec && spec.kind !== 'none') {
      const tag = it.label !== undefined && !markShows(spec, it.label);
      const pic = cardPicture(spec);
      // The numeral and the picture are the card's glyphs: Pip's hand stays off both.
      if (pic.kind === 'number-line' && compactLine(pic)) {
        return (
          <span className="ni-ord__face" data-face="side">
            {it.label !== undefined ? (
              <span
                className="ni-ord__tag ni-invite-glyph"
                aria-hidden="true"
                style={{ width: sideTagW }}
              >
                {it.label}
              </span>
            ) : null}
            <span className="ni-ord__pic ni-invite-glyph">
              <CardPath spec={pic} width={compactW} />
            </span>
          </span>
        );
      }
      if (fracSide) {
        return (
          <span className="ni-ord__face" data-face="frac">
            <span className="ni-ord__fracside ni-invite-glyph" aria-hidden="true">
              {fracGlyph(it.label)}
            </span>
            <span className="ni-ord__pic ni-invite-glyph">
              <FitPicture
                spec={pic}
                maxWidth={picW}
                maxHeight={picH}
                // A strip grows to the card's width: every strip shares one scale (one whole).
                maxScale={4}
                scale={shared.scale}
                onFit={shared.report(it.id)}
              />
            </span>
          </span>
        );
      }
      return (
        <span className="ni-ord__face">
          {tagRow ? (
            <span
              className="ni-ord__tag ni-invite-glyph"
              aria-hidden="true"
              data-frac={fractions ? 'true' : undefined}
            >
              {tag ? fracGlyph(it.label) : ''}
            </span>
          ) : null}
          <span className="ni-ord__pic ni-invite-glyph">
            <FitPicture
              spec={pic}
              // 5s and 10s are longer to read at a glance on a small card; the mark is a pointer
              // standing clear above the ticks (never on one, never at the end arrow).
              tickRhythm
              pointerMarks
              maxWidth={picW}
              maxHeight={picH}
              cell={Number.isFinite(sharedCell) ? sharedCell : undefined}
              layout={layoutOf.get(it.id) ?? undefined}
              maxScale={spec.kind === 'base-ten' ? 1.5 : 1}
              stackFrames
              scale={shared.scale}
              onFit={shared.report(it.id)}
            />
          </span>
        </span>
      );
    }
    if (fractionLabel(it.label)) {
      return <span className="ni-ord__frac ni-invite-glyph">{fracGlyph(it.label)}</span>;
    }
    return it.label !== undefined && !isNumeral(it.label) ? (
      <span className="ni-ord__word ni-invite-glyph">{it.label}</span>
    ) : (
      <span className="ni-ord__numeral ni-invite-glyph">{it.label ?? it.value}</span>
    );
  };

  const asc = config.direction === 'asc';
  // `places`: each slot's place in words over it (the last slot is the ones), no size cue.
  const places =
    config.cue === 'places'
      ? Array.from({ length: n }, (_, k) => PLACE_WORDS[n - 1 - k] ?? 'ones')
      : null;
  const compact = plan.chrome === 'compact';
  const [cueMin, cueMax] = compact ? [14, 26] : [20, 50];
  const cueSizes = Array.from({ length: n }, (_, k) => {
    const f = n === 1 ? 1 : k / (n - 1);
    return Math.round(cueMin + (cueMax - cueMin) * (asc ? f : 1 - f));
  });

  const flightStyle: CSSProperties | undefined = flight
    ? {
        left: flight.moving ? flight.to.left : flight.from.left,
        top: flight.moving ? flight.to.top : flight.from.top,
        width: flight.from.width,
        height: flight.from.height,
        transitionDuration: `${FLY_MS}ms`,
      }
    : undefined;

  const vars = {
    '--n': n,
    '--ord-w': `${plan.w}px`,
    '--ord-h': `${plan.h}px`,
    '--ord-gap': `${CARD_GAP}px`,
    '--ord-numeral': `${numeralPx}px`,
    '--ord-cue-cell': `${cueMax + 4}px`,
    '--ord-pad-x': `${ROOT_PAD.x}px`,
    '--ord-pad-y': `${ROOT_PAD.y}px`,
    '--ord-pad-bottom': `${ROOT_PAD.y + (plan.handPad ?? 0)}px`,
    '--ord-gap-main': `${CHROME[plan.chrome].gap}px`,
    '--ord-board-pad': `${CHROME[plan.chrome].board.top}px ${CHROME[plan.chrome].board.x}px ${CHROME[plan.chrome].board.bottom}px`,
    '--ord-cue-gap': `${CHROME[plan.chrome].cueGap}px`,
    '--ord-tray-pad': `${CHROME[plan.chrome].tray.top}px ${CHROME[plan.chrome].tray.x}px ${CHROME[plan.chrome].tray.bottom}px`,
    '--ord-check-gap': `${CHECK_GAP}px`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className="ni-ord"
      data-tier={tier}
      data-direction={config.direction}
      data-chrome={plan.chrome}
      data-check={plan.check}
      data-cards={pictures ? 'picture' : 'numeral'}
      data-tagged={tagRow ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={{ ...vars, ...handRootStyle }}
    >
      <div className="ni-ord__board">
        {places ? (
          // Each slot's place, read left to right; the slots carry the names for screen readers.
          <div className="ni-ord__cue" data-cue="places" aria-hidden="true">
            {places.map((place, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: one place name per slot position
              <span key={k} className="ni-ord__cue-cell">
                <span className="ni-ord__place">{t(`ui.order.place.${place}`)}</span>
              </span>
            ))}
          </div>
        ) : (
          <div
            className="ni-ord__cue"
            role="img"
            aria-label={t(asc ? 'ui.order.small-to-big' : 'ui.order.big-to-small')}
          >
            {cueSizes.map((size, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: one cue pebble per slot position
              <span key={k} className="ni-ord__cue-cell">
                <CuePebble size={size} />
              </span>
            ))}
            <svg
              className="ni-ord__arrow"
              viewBox="0 0 100 12"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M2 6h98" />
            </svg>
            <svg
              className="ni-ord__arrowhead"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 3l16 9-16 9V3Z" />
            </svg>
          </div>
        )}

        <div className="ni-ord__slots">
          {slots.map((id, k) => {
            const isFixed = fixedSlots.has(k);
            const it = id === null ? undefined : itemById.get(id);
            const padLit = cue?.kind === 'slot' && cue.slot === k;
            // A slot holding a card (placed or pinned) is no target: its pad is only the
            // backdrop, out of the tab order and of the arrow keys' way.
            const pad = it
              ? null
              : dnd.targetProps(slotId(k), {
                  label: places
                    ? t(`ui.order.slot.${places[k]}`)
                    : t('ui.widget.blank', { n: k + 1 }),
                });
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
              <div key={k} className="ni-ord__slot">
                {pad ? (
                  <div
                    {...pad}
                    className={[pad.className, 'ni-ord__pad', padLit ? 'ni-invite' : '']
                      .filter(Boolean)
                      .join(' ')}
                    data-slot-pad={k}
                  />
                ) : (
                  <div className="ni-ord__pad" data-slot-pad={k} aria-hidden="true" />
                )}
                {it && isFixed ? (
                  // A pinned card can't move, but it still speaks its name (06 §5): a button, so
                  // a tap, Enter and Space all reach it. While the widget is off it is disabled
                  // like the other cards (out of the Tab order; it looks the same).
                  <button
                    type="button"
                    className="ni-ord__card"
                    data-fixed="true"
                    aria-label={t('ui.order.fixed', { n: itemName(it) })}
                    disabled={!interactive}
                    onClick={() => speakItem(it)}
                  >
                    {face(it)}
                    <span className="ni-ord__pin">
                      <PinIcon />
                    </span>
                  </button>
                ) : it ? (
                  <button
                    type="button"
                    className={['ni-ord__card', cardLit(it.id) ? 'ni-invite' : '']
                      .filter(Boolean)
                      .join(' ')}
                    data-placed={it.id}
                    aria-label={
                      places ? t(`ui.order.in.${places[k]}`, { n: itemName(it) }) : itemName(it)
                    }
                    disabled={!interactive}
                    onClick={() => sendBack(k)}
                  >
                    {face(it)}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ni-ord__bottom">
        {fixedIds.size < n ? (
          <fieldset className="ni-ord__tray" aria-label={t('ui.widget.numbers')}>
            {config.items
              .filter((it) => !fixedIds.has(it.id))
              .map((it) => {
                if (slots.includes(it.id)) {
                  return <span key={it.id} className="ni-ord__ghost" aria-hidden="true" />;
                }
                const props = dnd.itemProps(it.id, { label: itemName(it) });
                return (
                  <div
                    key={it.id}
                    {...props}
                    className={[props.className, 'ni-ord__card', cardLit(it.id) ? 'ni-invite' : '']
                      .filter(Boolean)
                      .join(' ')}
                    data-card={it.id}
                    data-flying={flight?.item.id === it.id ? 'true' : undefined}
                  >
                    {face(it)}
                  </div>
                );
              })}
          </fieldset>
        ) : null}
        <span ref={checkRef} className="ni-ord__check">
          <CheckButton onPress={submit} disabled={!interactive || !complete} />
        </span>
      </div>

      {flight ? (
        <div className="ni-ord__card ni-ord__flight" style={flightStyle} aria-hidden="true">
          {face(flight.item)}
        </div>
      ) : null}
      {inviteHand}
    </div>
  );
}

export default OrderWidget;
