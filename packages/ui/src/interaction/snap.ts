/** Pure geometry for drag-and-drop snapping (06 §4: snap to targets within 48 px). */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SnapCandidate<T extends string = string> {
  id: T;
  rect: Rect;
  /** Targets that can't take the item right now are skipped. */
  enabled?: boolean;
}

/** The centre of a rect. */
export function rectCenter(r: Rect): Point {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Distance from a point to the nearest edge of a rect; 0 when the point is inside it. */
export function distanceToRect(p: Point, r: Rect): number {
  const dx = Math.max(r.left - p.x, 0, p.x - (r.left + r.width));
  const dy = Math.max(r.top - p.y, 0, p.y - (r.top + r.height));
  return Math.hypot(dx, dy);
}

/**
 * The target a dropped item snaps to: the nearest enabled target whose rect lies within
 * `radiusPx` of the point (the dragged item's centre). Ties keep the earlier target. A target the
 * point is inside always wins over one it is merely near. Returns null when nothing is in reach.
 */
export function findSnapTarget<T extends string>(
  point: Point,
  candidates: readonly SnapCandidate<T>[],
  radiusPx: number,
): T | null {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (c.enabled === false) continue;
    const d = distanceToRect(point, c.rect);
    if (d <= Math.max(0, radiusPx) && d < bestDistance) {
      best = c.id;
      bestDistance = d;
    }
  }
  return best;
}

/** Where an element ends up after a drag delta: its rect moved by (dx, dy). */
export function translateRect(r: Rect, dx: number, dy: number): Rect {
  return { left: r.left + dx, top: r.top + dy, width: r.width, height: r.height };
}
