// Decorate mode's controls (06 §2 "Build / Decorate"; #22 part 4), loaded when the mode is first
// opened. They stand in the request row's place while the requests step aside.
//
// - The tray: every piece the family owns, as a picture button (80 px, 12 px apart). One that is
//   on the island wears a ring. It pages and never scrolls. A tap takes the piece in hand; the
//   island then offers the plots where it fits.
// - A piece in hand that is on the island can be put away. "Okay" leaves the mode.
// - `DecorDrag`: a piece on the map can also be pressed and dragged; it snaps to the nearest
//   offered plot when it is let go (06 §2 "drag decor with snap").

import type { Plot } from '@number-island/shared';
import {
  decorArtFor,
  IconButton,
  ISLAND_LAYOUT,
  icons,
  plotBox,
  useNarrationText,
} from '@number-island/ui';
import { type PointerEvent as ReactPointerEvent, useEffect, useState } from 'react';
import type { SceneMap } from '../building/PlotTargets';
import type { DecorItem } from './rules';

/** A tray button, each way: the kindergarten tap target (06 §4). */
const ITEM = 80;
const GAP = 12;

/** How many pieces a tray `width` px wide shows on a page. */
export const trayPageSize = (width: number) =>
  Math.max(1, Math.floor((width + GAP) / (ITEM + GAP)));

export default function DecorTray({
  items,
  selected,
  width,
  onSelect,
  onPutAway,
  onDone,
}: {
  items: readonly DecorItem[];
  selected: DecorItem | null;
  /** The room the tray has, in px. */
  width: number;
  onSelect: (instanceId: string | null) => void;
  onPutAway: () => void;
  onDone: () => void;
}) {
  const text = useNarrationText();
  const size = trayPageSize(width);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const [page, setPage] = useState(0);
  const at = Math.min(page, pages - 1);
  // The piece in hand is on the page shown: picked on the map, the tray turns to it.
  const selectedAt = selected ? items.findIndex((i) => i.instanceId === selected.instanceId) : -1;
  useEffect(() => {
    if (selectedAt >= 0) setPage(Math.floor(selectedAt / size));
  }, [selectedAt, size]);
  const shown = items.slice(at * size, (at + 1) * size);
  return (
    <div
      className="flex h-full flex-col items-center justify-end gap-3"
      data-testid="decor-tray"
      data-pieces={items.length}
      data-spare={items.filter((i) => i.pos === null).length}
      data-page={at}
      data-pages={pages}
    >
      <ul className="flex justify-center" style={{ gap: GAP }} aria-label={text('ui.decor.open')}>
        {shown.map((item) => {
          const Icon = decorArtFor(item.def.art);
          const inHand = selected?.instanceId === item.instanceId;
          const n = items.indexOf(item) + 1;
          return (
            <li key={item.instanceId}>
              <button
                type="button"
                className={`flex cursor-pointer items-center justify-center rounded-[18px] bg-paper/95 shadow-soft ring-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  inHand ? 'ring-sunshine' : item.pos ? 'ring-leaf' : 'ring-sand-deep'
                }`}
                style={{ width: ITEM, height: ITEM }}
                aria-label={text('ui.decor.item', { n })}
                aria-pressed={inHand}
                data-decor-item={item.instanceId}
                data-state={item.pos ? 'placed' : 'spare'}
                onClick={() => onSelect(inHand ? null : item.instanceId)}
              >
                {Icon ? <Icon size={60} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-start justify-center gap-4">
        {pages > 1 ? (
          <>
            <IconButton
              label="ui.build.prev"
              icon={<icons.BackIcon />}
              tone="cloud"
              disabled={at === 0}
              onPress={() => setPage(at - 1)}
              data={{ 'data-testid': 'decor-prev' }}
            />
            <IconButton
              label="ui.btn.next"
              icon={<icons.ArrowIcon />}
              tone="cloud"
              disabled={at === pages - 1}
              onPress={() => setPage(at + 1)}
              data={{ 'data-testid': 'decor-next' }}
            />
          </>
        ) : null}
        <IconButton
          label="ui.decor.away"
          icon={<icons.CloseIcon />}
          tone="cloud"
          disabled={!selected?.pos}
          onPress={onPutAway}
          data={{ 'data-testid': 'decor-away' }}
        />
        <IconButton
          label="ui.btn.okay"
          icon={<icons.CheckIcon tone="light" />}
          tone="leaf"
          onPress={onDone}
          data={{ 'data-testid': 'decor-done' }}
        />
      </div>
    </div>
  );
}

/** Scene units → the plot whose footprint box holds the point, or null. */
function itemAt(items: readonly DecorItem[], x: number, y: number): DecorItem | null {
  for (const item of items) {
    if (!item.pos) continue;
    const b = plotBox(item.pos, item.def.footprint);
    // A piece rises above its plots: a press on its picture counts.
    if (x >= b.x && x <= b.x + b.w && y >= b.y - ISLAND_LAYOUT.cellH && y <= b.y + b.h) return item;
  }
  return null;
}

/** The offered plot nearest to a point (the middle of the piece's footprint), within reach. */
function nearest(
  anchors: readonly Plot[],
  footprint: readonly [number, number],
  x: number,
  y: number,
): Plot | null {
  let best: { plot: Plot; d: number } | null = null;
  for (const plot of anchors) {
    const b = plotBox(plot, footprint);
    const d = Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
    if (!best || d < best.d) best = { plot, d };
  }
  return best && best.d <= 1.5 * ISLAND_LAYOUT.cellW ? best.plot : null;
}

/**
 * Lies over the map in decorate mode, under the plot buttons: pressing a piece takes it in hand,
 * and dragging it shows it under the finger until it is let go on (or near) an offered plot.
 */
export function DecorDrag({
  map,
  items,
  selected,
  anchors,
  onSelect,
  onDrop,
}: {
  map: SceneMap | null;
  items: readonly DecorItem[];
  selected: DecorItem | null;
  anchors: readonly Plot[];
  onSelect: (instanceId: string) => void;
  onDrop: (plot: Plot) => void;
}) {
  const [drag, setDrag] = useState<{
    id: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  if (!map) return null;
  const origin = map.point(0, 0);
  const local = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { left: e.clientX - box.left, top: e.clientY - box.top };
  };
  const scene = (p: { left: number; top: number }) => ({
    x: (p.left - origin.left) / map.scale,
    y: (p.top - origin.top) / map.scale,
  });
  const Icon = selected ? decorArtFor(selected.def.art) : undefined;
  return (
    <div
      className="absolute inset-0 z-10 touch-none"
      data-testid="decor-drag"
      onPointerDown={(e) => {
        const at = local(e);
        const s = scene(at);
        const item = itemAt(items, s.x, s.y);
        if (!item) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (item.instanceId !== selected?.instanceId) onSelect(item.instanceId);
        setDrag({ id: e.pointerId, ...at, moved: false });
      }}
      onPointerMove={(e) => {
        if (drag?.id !== e.pointerId) return;
        const at = local(e);
        const moved = drag.moved || Math.hypot(at.left - drag.left, at.top - drag.top) > 8;
        if (moved) setDrag({ id: drag.id, ...at, moved });
      }}
      onPointerUp={(e) => {
        if (drag?.id !== e.pointerId) return;
        setDrag(null);
        if (!drag.moved || !selected) return;
        const s = scene(local(e));
        const plot = nearest(anchors, selected.def.footprint, s.x, s.y);
        if (plot) onDrop(plot);
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {drag?.moved && Icon ? (
        <span
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 opacity-80"
          style={{ left: drag.left, top: drag.top }}
          data-testid="decor-ghost"
        >
          <Icon size={72} />
        </span>
      ) : null}
    </div>
  );
}
