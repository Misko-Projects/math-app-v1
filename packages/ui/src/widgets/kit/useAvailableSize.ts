import { type RefObject, useLayoutEffect, useState } from 'react';

export interface AvailableSize {
  width: number;
  height: number;
}

/**
 * The content box of the widget area: the element WidgetHost's `.ni-widget` sits in (the widget's
 * grandparent), kept up to date with a ResizeObserver. `.ni-widget` itself grows with its content,
 * so the area is what a layout must fit. Widgets use it to pick a compact layout on the smallest
 * landscape area (06 §1: 960 × 600 → about 906 × 373) so nothing scrolls. `null` until measured.
 */
export function useAvailableSize(root: RefObject<HTMLElement | null>): AvailableSize | null {
  const [size, setSize] = useState<AvailableSize | null>(null);
  useLayoutEffect(() => {
    const host = root.current?.parentElement?.parentElement ?? root.current?.parentElement;
    if (!host) return;
    const measure = () => {
      const cs = getComputedStyle(host);
      const n = (v: string) => Number.parseFloat(v) || 0;
      const width = host.clientWidth - n(cs.paddingLeft) - n(cs.paddingRight);
      const height = host.clientHeight - n(cs.paddingTop) - n(cs.paddingBottom);
      setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [root]);
  return size;
}
