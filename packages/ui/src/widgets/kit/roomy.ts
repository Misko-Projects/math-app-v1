import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

/**
 * The widget area is roomy: at least `ROOMY_WIDTH_PX` wide on a screen at least
 * `ROOMY_HEIGHT_PX` tall (a 1280 × 800 tablet's area and up, never the smallest landscape area).
 * The time and money widgets (U05 #14) draw their clock and coins larger there, so the working
 * area still fills the space (06 §2) instead of sitting small in the middle of it.
 */
export const ROOMY_WIDTH_PX = 1100;
export const ROOMY_HEIGHT_PX = 760;

/** Whether an area `width` px wide on a screen `screenHeight` px tall is roomy. */
export const isRoomy = (width: number, screenHeight: number): boolean =>
  width >= ROOMY_WIDTH_PX && screenHeight >= ROOMY_HEIGHT_PX;

/**
 * `[roomy, ref]`: put `ref` on the widget's root (it is as wide as its area). Follows resizes of
 * the root and of the window.
 */
export function useRoomy<E extends HTMLElement = HTMLDivElement>(): [boolean, RefObject<E | null>] {
  const ref = useRef<E | null>(null);
  const [roomy, setRoomy] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setRoomy(isRoomy(el.clientWidth, window.innerHeight));
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, []);
  return [roomy, ref];
}
