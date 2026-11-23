import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

/**
 * The room a widget has (06 §1: container-relative layout), measured from its root element:
 * `width` is the root's border-box width; `height` is the height its host gives it, or Infinity
 * when the host grows with its content (a plain story stage, a scrolling page).
 */
export interface WidgetRoom {
  width: number;
  height: number;
}

/** A root taller than any screen: a host with a set height does not grow to hold it. */
const PROBE_PX = 100_000;

/**
 * Measures the widget's room before the first paint and again whenever the root or its host
 * resizes; null until mounted. To tell a bounded host from one that grows with its content, the
 * root is grown for one synchronous layout (no paint): a host with a set height keeps it.
 * The root must fill its host's width (block or stretched flex item) for `width` to be the room.
 */
export function useWidgetRoom(rootRef: RefObject<HTMLElement | null>): WidgetRoom | null {
  const [room, setRoom] = useState<WidgetRoom | null>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const host = el.parentElement;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      let height = Number.POSITIVE_INFINITY;
      if (host) {
        const before = el.style.height;
        el.style.height = `${PROBE_PX}px`;
        const grown = host.clientHeight;
        el.style.height = before;
        if (grown < PROBE_PX) {
          const cs = getComputedStyle(host);
          const pad =
            (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0);
          height = host.clientHeight - pad;
        }
      }
      setRoom((r) => (r && r.width === width && r.height === height ? r : { width, height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (host) ro.observe(host);
    return () => ro.disconnect();
  }, [rootRef]);
  return room;
}

/** A drag in the child's hand, or a move still playing (idle loops such as a pulse do not count). */
function gestureInFlight(el: HTMLElement): boolean {
  if (el.querySelector('[data-dragging]')) return true;
  if (typeof el.getAnimations !== 'function') return false;
  return el
    .getAnimations({ subtree: true })
    .some(
      (a) =>
        a.playState === 'running' &&
        a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
    );
}

/**
 * The room an item's arrangement is chosen for: the smallest it has had (the narrowest width and
 * the shortest height measured since the widget mounted, which it does once per item). A room
 * that grows, or a prompt that un-wraps, re-sizes the parts and moves nothing; a room that shrinks
 * under the one the arrangement was chosen for gets the arrangement that fits it, so no control
 * is pushed out of the area. Sizes always follow the room as it is now. Null until measured.
 *
 * Nothing changes places under a child's finger: while a piece is being dragged or a move is
 * still playing inside `rootRef`, the room chosen for is kept, and the smaller one is taken up
 * when the gesture has ended.
 *
 * `follow`: start again from the room as it is now (a widget whose item did not fit the room it
 * had, so there is no arrangement to keep).
 */
export function useSmallestRoom(
  room: WidgetRoom | null,
  rootRef: RefObject<HTMLElement | null>,
  follow = false,
): WidgetRoom | null {
  const kept = useRef<WidgetRoom | null>(null);
  const [waiting, setWaiting] = useState(false);
  let held = false;
  if (room !== null) {
    const k = kept.current;
    const next =
      k === null || follow
        ? room
        : { width: Math.min(k.width, room.width), height: Math.min(k.height, room.height) };
    const changed = k === null || next.width !== k.width || next.height !== k.height;
    const el = rootRef.current;
    held = changed && k !== null && el !== null && gestureInFlight(el);
    if (changed && !held) kept.current = next;
  }
  // Held back: look again each frame until the gesture has ended, then render with the new room.
  useLayoutEffect(() => {
    if (held !== waiting) setWaiting(held);
  }, [held, waiting]);
  useLayoutEffect(() => {
    if (!waiting) return;
    let frame = requestAnimationFrame(function look() {
      const el = rootRef.current;
      if (el && gestureInFlight(el)) frame = requestAnimationFrame(look);
      else setWaiting(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [waiting, rootRef]);
  return kept.current;
}
