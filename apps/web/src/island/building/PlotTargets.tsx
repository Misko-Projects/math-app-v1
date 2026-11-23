// Where a new building may go (05 §6 "tap a highlighted plot"; #22 part 2): one real button over
// each highlighted plot of the island scene. The scene draws the highlight (the kit's plot
// marker); the button is the target, at least 64 px each way (06 §4) however small the map is
// drawn. Where the map is so small that two targets would touch, only plots whose targets keep a
// 12 px gap are offered, back rows first.

import type { Plot } from '@number-island/shared';
import { plotBox, useNarrationText } from '@number-island/ui';
import { type RefObject, useCallback, useLayoutEffect, useState } from 'react';

const TARGET = 64;
const GAP = 12;

/** Scene units → CSS px inside the container, as the scene is drawn now. */
export interface SceneMap {
  scale: number;
  point(x: number, y: number): { left: number; top: number };
}

/** The island scene's mapping, measured from its SVG; null until it is laid out (and in jsdom). */
export function useSceneMap(
  container: RefObject<HTMLElement | null>,
  key: unknown,
): SceneMap | null {
  const [map, setMap] = useState<SceneMap | null>(null);
  const measure = useCallback(() => {
    const el = container.current;
    const m = el?.querySelector<SVGSVGElement>('svg[data-scene="island"]')?.getScreenCTM();
    if (!el || !m) return;
    const box = el.getBoundingClientRect();
    const [a, d, e, f] = [m.a, m.d, m.e - box.left, m.f - box.top];
    setMap((prev) =>
      prev && prev.scale === a && prev.point(0, 0).left === e && prev.point(0, 0).top === f
        ? prev
        : { scale: a, point: (x, y) => ({ left: a * x + e, top: d * y + f }) },
    );
  }, [container]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` (the crop) moves the scene
  useLayoutEffect(() => {
    measure();
    const el = container.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, key]);
  return map;
}

export interface PlotTarget {
  plot: Plot;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The plots offered: every anchor whose target keeps its gap from the ones already offered. */
export function offeredPlots(
  anchors: readonly Plot[],
  footprint: readonly [number, number],
  map: SceneMap | null,
): PlotTarget[] {
  const out: PlotTarget[] = [];
  for (const plot of anchors) {
    const b = plotBox(plot, footprint);
    if (!map) {
      out.push({ plot, left: 0, top: 0, width: TARGET, height: TARGET });
      continue;
    }
    const c = map.point(b.x + b.w / 2, b.y + b.h / 2);
    const width = Math.max(TARGET, b.w * map.scale - GAP);
    const height = Math.max(TARGET, b.h * map.scale - GAP);
    const t = { plot, left: c.left - width / 2, top: c.top - height / 2, width, height };
    const clear = out.every(
      (o) =>
        t.left >= o.left + o.width + GAP ||
        o.left >= t.left + t.width + GAP ||
        t.top >= o.top + o.height + GAP ||
        o.top >= t.top + t.height + GAP,
    );
    if (clear) out.push(t);
  }
  return out;
}

export function PlotTargets({
  targets,
  onPick,
}: {
  targets: readonly PlotTarget[];
  onPick: (plot: Plot) => void;
}) {
  const text = useNarrationText();
  return (
    <ul className="absolute inset-0 z-20" data-testid="plot-targets">
      {targets.map((t, i) => (
        <li key={`${t.plot[0]},${t.plot[1]}`}>
          <button
            type="button"
            className="absolute cursor-pointer rounded-[16px] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
            style={{ left: t.left, top: t.top, width: t.width, height: t.height }}
            aria-label={text('ui.build.spot', { n: i + 1 })}
            data-plot={`${t.plot[0]},${t.plot[1]}`}
            onClick={() => onPick(t.plot)}
          />
        </li>
      ))}
    </ul>
  );
}
