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

/**
 * The room an item's arrangement is chosen in: the first one measured (a widget mounts once per
 * item). A later resize, or a prompt that wraps onto another line, changes the sizes the parts are
 * drawn at, never which arrangement they are in, so nothing changes places under a child's hand.
 * Null until measured.
 */
export function useFirstRoom(room: WidgetRoom | null): WidgetRoom | null {
  const first = useRef<WidgetRoom | null>(null);
  if (first.current === null && room !== null) first.current = room;
  return first.current;
}
