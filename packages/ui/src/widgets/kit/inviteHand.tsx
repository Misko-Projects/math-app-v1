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
].join(', ');

interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * `target`'s box and its glyphs' boxes relative to `host`'s padding edge (where the absolutely
 * placed hand's left/top are measured from), in sub-pixel CSS px. They are measured AT REST, as
 * the target will settle: every animation on the target, its glyphs or an ancestor inside `host`
 * is held for the measurement, a loop (the invite ring's pulse) at its start and a finite one (a
 * tray rising in, a card popping in) at its end. A transform fires no resize, so measuring
 * mid-entrance would leave the hand where the target was, not where it comes to rest.
 */
function measure(target: HTMLElement, host: HTMLElement): { t: Edges; glyphs: Edges[] } {
  const all = typeof host.getAnimations === 'function' ? host.getAnimations({ subtree: true }) : [];
  // Only running ones: a finished one already shows its end, a paused one is held on purpose.
  const moving = all.filter((a) => {
    const el = (a.effect as KeyframeEffect | null)?.target ?? null;
    return a.playState === 'running' && el !== null && (el.contains(target) || target.contains(el));
  });
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
    return {
      t: rel(target.getBoundingClientRect()),
      glyphs: [...target.querySelectorAll(INVITE_GLYPH_SELECTOR)].map((g) =>
        rel(g.getBoundingClientRect()),
      ),
    };
  } finally {
    moving.forEach((a, i) => {
      a.currentTime = saved[i] ?? 0;
      a.play();
    });
  }
}

export interface InviteHandPlacement {
  /** The hand's box, relative to `host`'s border box. */
  left: number;
  top: number;
  /** Extra px `host` needs at its bottom so the hand (and its bob) stays inside it. */
  room: number;
}

/**
 * Where the hand goes for `target`, relative to `host` (the widget root, `position: relative`).
 * `hostExtra` is bottom room `host` already adds for the hand (not counted as its own height).
 * Left/top are from `host`'s padding edge, as an absolutely placed child's are.
 */
export function placeInviteHand(
  target: HTMLElement,
  host: HTMLElement,
  hostExtra = 0,
): InviteHandPlacement {
  const S = INVITE_HAND_PX;
  const tip = { x: HAND_POINTER_TIP.up.x * S, y: HAND_POINTER_TIP.up.y * S };
  const { t, glyphs } = measure(target, host);
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
  const room = Math.max(0, Math.ceil(top + S + BOB.y + EDGE - ownHeight));
  return { left, top, room };
}

/**
 * Places Pip's up-pointing hand on the control `target(root)` finds (null: no hand), measured
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
  cue?: ReactNode,
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
    const p = placeInviteHand(el, root, applied.current);
    const padBase =
      (Number.parseFloat(getComputedStyle(root).paddingBottom) || 0) - applied.current;
    setPlaced((prev) =>
      prev &&
      prev.left === p.left &&
      prev.top === p.top &&
      prev.room === p.room &&
      prev.padBase === padBase
        ? prev
        : { ...p, padBase },
    );
  };
  // After every render: the control may have moved without resizing (a tray appearing, a row
  // re-flowing). Unchanged placements don't re-render.
  useLayoutEffect(() => place.current());
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
        <HandPointerIcon direction="up" />
        {cue ? <span className="ni-hand__cue">{cue}</span> : null}
      </span>
    ),
    rootStyle: placed.room > 0 ? { paddingBottom: placed.padBase + placed.room } : undefined,
  };
}
