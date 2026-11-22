import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { HAND_POINTER_TIP, HandPointerIcon } from '../../primitives/icons';

/**
 * Pip's pointing hand for a demo invite (03 §6.3), placed the same way in every widget: an
 * UP-pointing hand hangs below the invited control, its drawn fingertip just inside the control's
 * bottom edge (about 10 px up), at the control's lower-right third. The control's glyph (icon,
 * numeral, digit or word, `INVITE_GLYPH_SELECTOR`) stays fully visible: the hand never overlaps it.
 * Objects (sprites, hand cards, frames) have no glyph: the hand points at their lower edge.
 * When the hand below would cover another target (`INVITE_TARGET_SELECTOR`) or glyph (a control in
 * the next row), it points from beside the control, or from above, instead.
 */

/** The `.ni-hand` box (primitives.css), in px. */
export const INVITE_HAND_PX = 56;
/** The hand's tap bob (`ni-hand-tap`) moves it this far down and left from its rest position. */
const BOB = { x: 6, y: 8 } as const;
/** The hand keeps this far inside the widget's edges. */
const EDGE = 10;
/** Where the fingertip rests above the control's bottom edge, and how close it may get to it. */
const TIP_ABOVE_BOTTOM = 10;
const TIP_MIN_INSIDE = 1;
/** Sub-pixel margin between the hand and a glyph. */
const CLEAR = 0.25;

/** What a control shows (its glyph): the hand must leave all of it visible. */
export const INVITE_GLYPH_SELECTOR = [
  '.ni-btn__icon',
  '.ni-btn__label',
  '.ni-pad__digit',
  '.ni-pad__icon',
  '.ni-pick__face',
  '.ni-number > span:not(.ni-number__caret):not(.ni-number__sparkle):not(.ni-number__slot)',
  // A widget's own numeral or label on a control (e.g. make-set's "10" tag on the tied ten).
  '[data-invite-glyph]',
  // A widget's own glyph (a card's numeral or picture) opts in with this class.
  '.ni-invite-glyph',
].join(', ');

interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Every other thing a child can use (06 §4): Pip's hand stays clear of all of them, the invited
 * control excluded. Buttons (enabled or not: a disabled Check is still drawn), role=button items,
 * drag items and drop boxes, pick and numeral cards, pad keys, and anything a widget marks with
 * `data-invite-target`.
 */
export const INVITE_TARGET_SELECTOR = [
  'button',
  '[role="button"]',
  '[data-invite-target]',
  '.ni-draggable',
  '.ni-drop-target',
  '.ni-pick',
  '.ni-pad__key',
].join(', ');

/** How far Pip's hand keeps from every other target, when the widget has the room (06 §4). */
const TARGET_CLEAR = 12;

interface Measured {
  t: Edges;
  /** The target's own glyphs. */
  glyphs: Edges[];
  /** Every other target, and every glyph outside the target. */
  others: Edges[];
  marks: Edges[];
}

/**
 * `target`'s box, its glyphs' boxes and the other targets' and glyphs' boxes, relative to
 * `host`'s padding edge (where the absolutely placed hand's left/top are measured from), in
 * sub-pixel CSS px. They are measured AT REST, as everything will settle: every running animation
 * inside `host` is held for the measurement, a loop (the invite ring's pulse, the hand's bob) at
 * its start and a finite one (a tray rising in, a card popping in) at its end. A transform fires
 * no resize, so measuring mid-entrance would leave the hand where the target was, not where it
 * comes to rest.
 */
function measure(target: HTMLElement, host: HTMLElement): Measured {
  const all = typeof host.getAnimations === 'function' ? host.getAnimations({ subtree: true }) : [];
  // Only running ones: a finished one already shows its end, a paused one is held on purpose.
  const moving = all.filter((a) => a.playState === 'running');
  const saved = moving.map((a) => a.currentTime);
  for (const a of moving) {
    const timing = a.effect?.getComputedTiming();
    const end = Number(timing?.endTime ?? 0);
    a.pause();
    a.currentTime =
      timing?.iterations === Number.POSITIVE_INFINITY || !Number.isFinite(end) ? 0 : end;
  }
  try {
    const hb = host.getBoundingClientRect();
    const ox = hb.left + host.clientLeft;
    const oy = hb.top + host.clientTop;
    const rel = (r: DOMRect): Edges => ({
      left: r.left - ox,
      top: r.top - oy,
      right: r.right - ox,
      bottom: r.bottom - oy,
    });
    const shown = (el: Element) => {
      if (el.closest('.ni-hand')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    // A zone the target sits in (a boat or a supply tray around an object) is where the hand
    // points, not something it covers.
    const tb = target.getBoundingClientRect();
    const encloses = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.left <= tb.left && r.top <= tb.top && r.right >= tb.right && r.bottom >= tb.bottom;
    };
    const others = [...host.querySelectorAll(INVITE_TARGET_SELECTOR)].filter(
      (el) =>
        el !== target && !el.contains(target) && !target.contains(el) && !encloses(el) && shown(el),
    );
    const marks = [...host.querySelectorAll(INVITE_GLYPH_SELECTOR)].filter(
      (el) => !target.contains(el) && shown(el),
    );
    return {
      t: rel(target.getBoundingClientRect()),
      glyphs: [...target.querySelectorAll(INVITE_GLYPH_SELECTOR)].map((g) =>
        rel(g.getBoundingClientRect()),
      ),
      others: others.map((el) => rel(el.getBoundingClientRect())),
      marks: marks.map((el) => rel(el.getBoundingClientRect())),
    };
  } finally {
    moving.forEach((a, i) => {
      a.currentTime = saved[i] ?? 0;
      a.play();
    });
  }
}

/** Which way Pip's finger points: up from below, down from above, or sideways from beside. */
export type InviteHandDirection = 'up' | 'down' | 'left' | 'right';

export interface InviteHandPlacement {
  /** The hand's box, relative to `host`'s border box. */
  left: number;
  top: number;
  /** Extra px `host` needs at its bottom so the hand (and its bob) stays inside it. */
  room: number;
  /** Which way the finger points (default `up`, from below the control). */
  direction?: InviteHandDirection;
}

/**
 * Where Pip's hand goes. Left out (`auto`): below the control pointing up, unless the hand there
 * would cover another target or glyph; then beside it (right, then left, pointing at it
 * sideways), then above it pointing down; the first that covers nothing and stays inside the
 * widget, else below. Given explicitly, that side only: `below`, `above` (pointing down, for a
 * control with no room below it), or `inside` an empty box (a drop box with no glyph), pointing
 * down into it ("put it here"): the whole hand, its bob included, stays inside the box.
 */
export type InviteHandSide = 'below' | 'above' | 'inside';

/** The hand's box with its tap bob (6 px left, 8 px down), for a placement. */
const reach = (p: { left: number; top: number }): Edges => ({
  left: p.left - BOB.x,
  top: p.top,
  right: p.left + INVITE_HAND_PX,
  bottom: p.top + INVITE_HAND_PX + BOB.y,
});
/** The gap between two boxes (negative: they overlap). */
const gap = (a: Edges, b: Edges) =>
  Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);

/** Below the control, pointing up (the kit's first choice). */
function below(
  m: Measured,
  host: HTMLElement,
  hostExtra: number,
  overhang: number,
): InviteHandPlacement {
  const S = INVITE_HAND_PX;
  const tip = { x: HAND_POINTER_TIP.up.x * S, y: HAND_POINTER_TIP.up.y * S };
  const { t, glyphs } = m;
  const glyph =
    glyphs.length === 0
      ? null
      : {
          right: Math.max(...glyphs.map((g) => g.right)),
          bottom: Math.max(...glyphs.map((g) => g.bottom)),
        };
  const { bottom, right } = t;
  const width = t.right - t.left;
  // The fingertip rests ~10 px above the bottom edge, in the lower-right third (centred on a
  // glyph-less object, so the hand reads as pointing at the whole thing).
  let tipY = bottom - TIP_ABOVE_BOTTOM;
  let tipX = glyph ? t.left + (width * 2) / 3 : t.left + width / 2;
  if (glyph && tipY - tip.y < glyph.bottom) {
    // Lower, so the hand starts under the glyph (the fingertip still inside the control) ...
    tipY = Math.min(bottom - TIP_MIN_INSIDE, glyph.bottom + tip.y + CLEAR);
    // ... or, if the control is too short for that, beside the glyph (right of it).
    if (tipY - tip.y < glyph.bottom) {
      const besideX = glyph.right + BOB.x + tip.x + CLEAR;
      if (besideX <= right - TIP_MIN_INSIDE) tipX = Math.max(tipX, besideX);
    }
  }
  const maxLeft = host.clientWidth - S - EDGE;
  const left = Math.max(EDGE + BOB.x, Math.min(tipX - tip.x, maxLeft));
  const top = tipY - tip.y;
  // The hand (with its bob) stays inside the widget: below a control at the bottom, the widget
  // makes room for it.
  const ownHeight = host.clientHeight - hostExtra;
  const room = Math.max(0, Math.ceil(top + S + BOB.y + EDGE - ownHeight - overhang));
  return { left, top, room, direction: 'up' };
}

/** Above the control, pointing down: the fingertip ~10 px inside its top edge, off its glyph. */
function above(m: Measured): InviteHandPlacement | null {
  const S = INVITE_HAND_PX;
  const tip = { x: HAND_POINTER_TIP.down.x * S, y: HAND_POINTER_TIP.down.y * S };
  const { t, glyphs } = m;
  const tipX = t.left + (t.right - t.left) / 2;
  let tipY = t.top + TIP_ABOVE_BOTTOM;
  // The hand at rest ends above the glyph (its tap bob dips onto its own control).
  const glyphTop = glyphs.length ? Math.min(...glyphs.map((g) => g.top)) : Number.POSITIVE_INFINITY;
  const handBelowTip = S - tip.y + CLEAR;
  if (tipY + handBelowTip > glyphTop) tipY = glyphTop - handBelowTip;
  if (tipY < t.top + TIP_MIN_INSIDE) return null;
  return { left: tipX - tip.x, top: tipY - tip.y, room: 0, direction: 'down' };
}

/**
 * Beside the control, pointing at it sideways: from its right (`left`-pointing) or its left
 * (`right`-pointing), the fingertip ~10 px inside that edge at mid-height, off its glyph.
 */
function beside(m: Measured, from: 'right' | 'left'): InviteHandPlacement | null {
  const S = INVITE_HAND_PX;
  const direction = from === 'right' ? 'left' : 'right';
  const tip = { x: HAND_POINTER_TIP[direction].x * S, y: HAND_POINTER_TIP[direction].y * S };
  const { t, glyphs } = m;
  const tipY = (t.top + t.bottom) / 2;
  if (from === 'right') {
    const glyphRight = glyphs.length ? Math.max(...glyphs.map((g) => g.right)) : -Infinity;
    // The hand at rest starts right of the glyph (its tap bob dips onto its own control).
    const tipX = Math.max(t.right - TIP_ABOVE_BOTTOM, glyphRight + tip.x + CLEAR);
    if (tipX > t.right - TIP_MIN_INSIDE) return null;
    return { left: tipX - tip.x, top: tipY - tip.y, room: 0, direction };
  }
  const glyphLeft = glyphs.length ? Math.min(...glyphs.map((g) => g.left)) : Infinity;
  const tipX = Math.min(t.left + TIP_ABOVE_BOTTOM, glyphLeft - (S - tip.x) - CLEAR);
  if (tipX < t.left + TIP_MIN_INSIDE) return null;
  return { left: tipX - tip.x, top: tipY - tip.y, room: 0, direction };
}

/**
 * Where the hand goes for `target`, relative to `host` (the widget root, `position: relative`).
 * `hostExtra` is bottom room `host` already adds for the hand (not counted as its own height).
 * Left/top are from `host`'s padding edge, as an absolutely placed child's are. Without a `side`,
 * the first placement that covers no other target or glyph (≥ 12 px from every other target
 * where there is room, else just clear of them) and stays inside `host`: below, beside (right,
 * then left), above; none: below.
 */
export function placeInviteHand(
  target: HTMLElement,
  host: HTMLElement,
  hostExtra = 0,
  side?: InviteHandSide,
  /** See `useInviteHand`: px the hand may hang below the widget (default 0). */
  overhang = 0,
): InviteHandPlacement {
  const S = INVITE_HAND_PX;
  const m = measure(target, host);
  if (side === 'inside') {
    // The hand and its bob (6 px left, 8 px down) centred in the box, pointing down: the
    // fingertip lands in the box's lower half, the hand above it, all of it inside the box.
    const tipDown = { x: HAND_POINTER_TIP.down.x * S, y: HAND_POINTER_TIP.down.y * S };
    const { t } = m;
    const spanW = S + BOB.x;
    const spanH = S + BOB.y;
    const left = t.left + (t.right - t.left - spanW) / 2 + BOB.x;
    const top = t.top + (t.bottom - t.top - spanH) / 2;
    // Never above the box's top edge or past its bottom (a box shorter than the hand: the tip
    // stays inside it).
    const tipY = Math.min(t.bottom - TIP_MIN_INSIDE, top + tipDown.y);
    return { left, top: tipY - tipDown.y, room: 0, direction: 'down' };
  }
  if (side === 'above') {
    // Mirrored: the hand stands above the control, its drawn fingertip ~10 px inside the top
    // edge at the middle (a glyph-less box), wholly above it otherwise.
    const tipDown = { x: HAND_POINTER_TIP.down.x * S, y: HAND_POINTER_TIP.down.y * S };
    const { t } = m;
    const tipX = t.left + (t.right - t.left) / 2;
    const tipY = t.top + TIP_ABOVE_BOTTOM;
    const maxLeft = host.clientWidth - S - EDGE;
    return {
      left: Math.max(EDGE + BOB.x, Math.min(tipX - tipDown.x, maxLeft)),
      top: tipY - tipDown.y,
      room: 0,
      direction: 'down',
    };
  }
  const first = below(m, host, hostExtra, overhang);
  if (side === 'below') return first;
  const W = host.clientWidth;
  const H = host.clientHeight;
  const fits = (p: InviteHandPlacement, margin: number, inHost: boolean) => {
    const r = reach(p);
    if (inHost && (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H)) return false;
    return (
      m.others.every((o) => gap(r, o) >= margin - 0.01) &&
      m.marks.every((g) => gap(r, g) >= 0) &&
      // Its own glyphs: clear at rest (the tap bob dips onto its own control).
      m.glyphs.every((g) => gap({ ...r, left: p.left, bottom: p.top + S }, g) >= 0)
    );
  };
  // Below again, the hand (and its bob) kept within the control's width, so it reaches no
  // neighbour in the same row (the default sits at the lower-right third, a little past the edge).
  const minLeft = m.t.left + BOB.x;
  const maxLeft = m.t.right - S;
  const within =
    maxLeft >= minLeft
      ? { ...first, left: Math.min(maxLeft, Math.max(minLeft, first.left)) }
      : null;
  // ... or slid along a wide control's bottom edge (nearest first), past a control below it.
  const slid: InviteHandPlacement[] = [];
  if (within) {
    for (let x = minLeft; x <= maxLeft; x += 8) slid.push({ ...first, left: x });
    slid.sort((a, b) => Math.abs(a.left - within.left) - Math.abs(b.left - within.left));
  }
  // Below may add room under the widget for itself; the others must fit as it is.
  const candidates: [InviteHandPlacement | null, boolean][] = [
    [first, false],
    [within, false],
    ...slid.map((p): [InviteHandPlacement, boolean] => [p, false]),
    [beside(m, 'right'), true],
    [beside(m, 'left'), true],
    [above(m), true],
  ];
  for (const margin of [TARGET_CLEAR, 0]) {
    for (const [p, inHost] of candidates) if (p && fits(p, margin, inHost)) return p;
  }
  return first;
}

/**
 * Places Pip's pointing hand on the control `target(root)` finds (null: no hand), measured
 * from the laid-out widget and kept in place as it resizes. `key` names the cue: the hand moves
 * when it changes (an empty key hides it). Render `hand` inside `rootRef`'s element (which must
 * be `position: relative`) and merge `rootStyle` into its style: it adds bottom room when the hand
 * needs it. `cue` (optional): a small badge on the hand's wrist saying what the invited action is
 * (e.g. "take one out" vs "count"), when a widget invites different actions on the same things.
 */
export function useInviteHand(
  rootRef: RefObject<HTMLElement | null>,
  target: (root: HTMLElement) => HTMLElement | null,
  key: string,
  /** A fixed side (`below`, `above`, `inside`); left out, the kit picks one that covers nothing. */
  side?: InviteHandSide,
  /** A small badge on the hand's wrist saying what the invited action is. */
  cue?: ReactNode,
  /**
   * How far the hand may hang below the widget's bottom edge before the widget grows to hold
   * it (default 0). Only for a widget whose host keeps free, uncovered room under it (the
   * workshop card's padding at the 960 × 600 minimum); the hand covers nothing there.
   */
  overhang = 0,
): { hand: ReactNode; rootStyle: CSSProperties | undefined } {
  const [placed, setPlaced] = useState<(InviteHandPlacement & { padBase: number }) | null>(null);
  /** The bottom room the committed DOM has for the hand (this render's value, once committed). */
  const applied = useRef(0);
  applied.current = placed?.room ?? 0;
  const find = useRef(target);
  find.current = target;
  const place = useRef<() => void>(() => {});
  place.current = () => {
    const root = rootRef.current;
    const el = root && key !== '' ? find.current(root) : null;
    if (!root || !el) {
      setPlaced(null);
      return;
    }
    const p = placeInviteHand(el, root, applied.current, side, overhang);
    const padBase =
      (Number.parseFloat(getComputedStyle(root).paddingBottom) || 0) - applied.current;
    setPlaced((prev) =>
      prev &&
      prev.left === p.left &&
      prev.top === p.top &&
      prev.room === p.room &&
      prev.direction === p.direction &&
      prev.padBase === padBase
        ? prev
        : { ...p, padBase },
    );
  };
  // After every render: the control may have moved without resizing (a tray appearing, a row
  // re-flowing). Unchanged placements don't re-render.
  useLayoutEffect(() => place.current());
  // Once the fonts have loaded (a glyph's box, and so the free room around it, can change).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the cue
  useLayoutEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) place.current();
    });
    return () => {
      live = false;
    };
  }, [key]);
  // And whenever the widget or the control resizes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the cue
  useLayoutEffect(() => {
    const root = rootRef.current;
    const el = root && key !== '' ? find.current(root) : null;
    if (!root || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place.current());
    ro.observe(root);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
  if (!placed) return { hand: null, rootStyle: undefined };
  return {
    hand: (
      <span
        className="ni-hand ni-invite-hand"
        aria-hidden="true"
        style={{ left: placed.left, top: placed.top }}
      >
        <HandPointerIcon direction={placed.direction ?? 'up'} />
        {cue ? <span className="ni-hand__cue">{cue}</span> : null}
      </span>
    ),
    rootStyle: placed.room > 0 ? { paddingBottom: placed.padBase + placed.room } : undefined,
  };
}
