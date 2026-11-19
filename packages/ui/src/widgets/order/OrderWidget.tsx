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
  FitPicture,
  naturalPictureSize,
  numberLineHeight,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSharedScale,
  useSubmitGuard,
  useWidgetRoom,
  type WidgetRoom,
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
const FLY_MS = 480;

type Config = ConfigFor<'order'>;
type Item = Config['items'][number];
type SlotId = `slot-${number}`;

const slotId = (k: number): SlotId => `slot-${k}`;
const slotIndex = (id: SlotId) => Number(id.slice(5));
const isNumeral = (label: string | undefined) => label !== undefined && /^-?\d+$/.test(label);

// ---------- layout ----------

/**
 * Between cards: the 12 px target gap plus the invite ring's reach (4 px wide, 3 px out: 7 px),
 * so a ringed card stays ≥ 12 px clear of its neighbours (one ring at a time, 06 §4).
 */
const CARD_GAP = 20;
/** A card's border (3) and padding (5) around its numeral. */
const CARD_PAD = 8;
/** Around a picture: the border plus a margin, so a picture never touches the card's edge. */
const PIC_PAD = 11;
/** The numeral above a picture (32 px numeral, 05 §11). */
const TAG_H = 30;
const ROOT_PAD = { x: 8, y: 4 };
const BORDER = 3;
const CHROME = {
  normal: {
    board: { top: 14, x: 24, bottom: 18 },
    cue: 74,
    cueGap: 10,
    tray: { y: 14, x: 18 },
    gap: 24,
  },
  compact: {
    board: { top: 4, x: 16, bottom: 12 },
    cue: 32,
    cueGap: 8,
    tray: { y: 8, x: 14 },
    gap: 8,
  },
} as const;
type Chrome = keyof typeof CHROME;
const CHECK_GAP = 28;
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
  check: { w: number; h: number };
}

function sizeOf(s: Shape, p: Plan) {
  const c = CHROME[p.chrome];
  const row = (k: number) => k * p.w + Math.max(0, k - 1) * CARD_GAP;
  const boardW = row(s.n) + 2 * (c.board.x + BORDER);
  const boardH = 2 * BORDER + c.board.top + c.cue + c.cueGap + p.h + c.board.bottom;
  const trayW = s.tray > 0 ? row(s.tray) + 2 * (c.tray.x + BORDER) : 0;
  const trayH = 2 * (c.tray.y + BORDER) + p.h;
  const bottomW = p.check === 'beside' ? trayW + CHECK_GAP + s.check.w : Math.max(trayW, s.check.w);
  const bottomH = p.check === 'beside' ? Math.max(trayH, s.check.h) : trayH + c.gap + s.check.h;
  // Below the tray's cards: its padding and border, then Check (when below) and the widget's edge.
  const underTray = c.tray.y + BORDER + ROOT_PAD.y + (p.check === 'below' ? c.gap + s.check.h : 0);
  return {
    w: Math.max(boardW, bottomW) + 2 * ROOT_PAD.x,
    h: boardH + c.gap + bottomH + 2 * ROOT_PAD.y,
    hand: s.tray > 0 ? Math.max(0, HAND_REACH - underTray) : 0,
  };
}

/**
 * The biggest card that fits the room: the full cue first (the compact one only when the height
 * is short), then the tallest card, Check beside the tray when it fits, the widest card its
 * picture can use; room for Pip's hand under a numeral card when there is some. Nothing fits: the
 * smallest layout (the area then scrolls; targets never shrink below the minimum).
 */
function planLayout(s: Shape, room: WidgetRoom | null): Plan {
  const W = room?.width ?? 1180;
  const H = room?.height ?? Number.POSITIVE_INFINITY;
  const hi = Math.round(s.target * 1.5);
  for (const withHand of [true, false]) {
    for (const chrome of ['normal', 'compact'] as const) {
      for (let h = hi; h >= s.target; h -= 2) {
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
    }
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
  const { sayNumber } = useSpeech();
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

  const itemName = (it: Item) =>
    it.label ??
    (it.stimulus ? t('ui.order.picture', { n: config.items.indexOf(it) + 1 }) : String(it.value));
  const speakItem = (it: Item) => {
    // Numerals speak their name (06 §5); a picture's quantity is the child's to find.
    if (speakOnTap && (isNumeral(it.label) || (!it.label && !it.stimulus))) sayNumber(it.value);
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
    speakItem(it);
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
          speakItem(it);
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
        const k = target.findIndex((id, i) => !fixedSlots.has(i) && slots[i] !== id);
        const id = target[k];
        return k < 0 || id === null || id === undefined ? null : cardThenSlot(id, k);
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
  );
  const cardLit = (id: string) => highlight === id || (cue?.kind === 'card' && cue.id === id);

  // ---------- layout ----------

  const target = MIN_TARGET_PX[ageMode];
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

  const pictures = config.items.some((it) => it.stimulus && it.stimulus.kind !== 'none');
  const tagRow =
    pictures && config.items.some((it) => it.label && !markShows(it.stimulus, it.label));
  const longest = Math.max(...config.items.map((it) => (it.label ?? String(it.value)).length));
  const words = !pictures && config.items.some((it) => it.label && !isNumeral(it.label));
  const cardPics = config.items.map((it) =>
    it.stimulus && it.stimulus.kind !== 'none' ? cardPicture(it.stimulus) : null,
  );
  /** The picture box of an h-tall card (its width is the card's less PIC_PAD each side). */
  const picHeight = (h: number) => h - 2 * PIC_PAD - (tagRow ? TAG_H : 0);
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
  /** Width a card's number line reads well at: ~16 px a tick at full size (plus end room). */
  const lineWidth = (h: number) =>
    Math.max(
      0,
      ...lines.map((spec) => {
        const span = spec.max - spec.min;
        const ticks = Math.min(40, span / (spec.ticksEvery ?? span / 10));
        const scale = Math.min(1, picHeight(h) / numberLineHeight(spec));
        return Math.round(scale * (80 + ticks * 16)) + 2 * PIC_PAD;
      }),
    );
  const cardWidth = (h: number) => {
    if (words) {
      const w = Math.max(h, longest * 14 + 2 * CARD_PAD + 8);
      return { min: w, max: w };
    }
    if (!pictures) return { min: h, max: h };
    const pic = Math.min(
      Math.round(2.4 * h),
      Math.max(h, Math.round(picHeight(h) * aspect) + 2 * PIC_PAD),
    );
    if (lines.length === 0) return { min: pic, max: pic };
    const max = Math.max(pic, Math.min(3 * h, lineWidth(h)));
    return { min: Math.min(max, Math.max(pic, Math.round(1.4 * h))), max };
  };
  const plan = planLayout(
    {
      n,
      tray: n - fixedIds.size,
      width: cardWidth,
      target,
      check: checkSize ?? { w: TARGET_PX[ageMode].big + 8, h: TARGET_PX[ageMode].big + 6 },
    },
    room,
  );
  const picW = plan.w - 2 * PIC_PAD;
  const picH = picHeight(plan.h);
  // Countable pictures share one cell, so a picture's size is never a cue its count doesn't give.
  const sharedCell = Math.min(
    ...cardPics.map((spec) => {
      const layout = spec ? countLayout(spec, true) : null;
      return layout ? cellToFit(layout, picW, picH) : Number.POSITIVE_INFINITY;
    }),
  );
  // One numeral size for every card, as big as the longest label lets it be (≥ 32 px, 05 §11).
  const numeralPx = Math.max(32, Math.min(48, Math.floor((plan.w - 18) / (0.62 * longest))));

  // ---------- render ----------

  const face = (it: Item) => {
    const spec = it.stimulus;
    if (spec && spec.kind !== 'none') {
      const tag = it.label !== undefined && !markShows(spec, it.label);
      return (
        <span className="ni-ord__face">
          {tagRow ? (
            <span className="ni-ord__tag" aria-hidden="true">
              {tag ? it.label : ''}
            </span>
          ) : null}
          <FitPicture
            spec={cardPicture(spec)}
            maxWidth={picW}
            maxHeight={picH}
            cell={Number.isFinite(sharedCell) ? sharedCell : undefined}
            stackFrames
            scale={shared.scale}
            onFit={shared.report(it.id)}
          />
        </span>
      );
    }
    return it.label !== undefined && !isNumeral(it.label) ? (
      <span className="ni-ord__word">{it.label}</span>
    ) : (
      <span className="ni-ord__numeral">{it.label ?? it.value}</span>
    );
  };

  const asc = config.direction === 'asc';
  const compact = plan.chrome === 'compact';
  const [cueMin, cueMax] = compact ? [10, 20] : [20, 50];
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
    '--ord-tray-pad': `${CHROME[plan.chrome].tray.y}px ${CHROME[plan.chrome].tray.x}px`,
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
      data-disabled={disabled ? 'true' : undefined}
      style={{ ...vars, ...handRootStyle }}
    >
      <div className="ni-ord__board">
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

        <div className="ni-ord__slots">
          {slots.map((id, k) => {
            const isFixed = fixedSlots.has(k);
            const it = id === null ? undefined : itemById.get(id);
            const pad = dnd.targetProps(slotId(k), {
              label: t('ui.widget.blank', { n: k + 1 }),
              disabled: isFixed,
            });
            const padLit = cue?.kind === 'slot' && cue.slot === k;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
              <div key={k} className="ni-ord__slot">
                <div
                  {...pad}
                  className={[pad.className, 'ni-ord__pad', padLit ? 'ni-invite' : '']
                    .filter(Boolean)
                    .join(' ')}
                  data-slot-pad={k}
                />
                {it && isFixed ? (
                  <div
                    className="ni-ord__card"
                    data-fixed="true"
                    role="img"
                    aria-label={t('ui.order.fixed', { n: itemName(it) })}
                  >
                    {face(it)}
                    <span className="ni-ord__pin">
                      <PinIcon />
                    </span>
                  </div>
                ) : it ? (
                  <button
                    type="button"
                    className={['ni-ord__card', cardLit(it.id) ? 'ni-invite' : '']
                      .filter(Boolean)
                      .join(' ')}
                    data-placed={it.id}
                    aria-label={itemName(it)}
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
