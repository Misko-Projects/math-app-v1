// Tombstones in the projection folds (08 §4). A `child.deleted` tombstone is permanent. Every fold
// handles it in order, so the full fold and the incremental fold agree: events before the
// tombstone apply as usual; at the tombstone, the child's personal data (production tags, project
// badges, mastery badges, weekly goals) and its attributions (`placedBy`) are dropped, while the
// shared island it helped build stays (buildings are never un-built, 02 §4.3); from then on, every
// event of that child is ignored. Child ids compare case-insensitively, and the per-child maps of
// the projections are keyed by the lower-case id.

import type { AnyEventEnvelope } from '@number-island/shared';
import { isEvent } from './order';

export const childKey = (childId: string): string => childId.toLowerCase();

/** The lower-case ids of every child with a tombstone in the events. */
export function tombstonedChildren(events: readonly AnyEventEnvelope[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (isEvent(e, 'child.deleted')) out.add(childKey(e.payload.childId));
  return out;
}

/** The events with every event of a tombstoned child removed (the tombstones stay). */
export function withoutDeletedChildren<E extends AnyEventEnvelope>(events: readonly E[]): E[] {
  const deleted = tombstonedChildren(events);
  if (deleted.size === 0) return [...events];
  return events.filter((e) => e.childId === null || !deleted.has(childKey(e.childId)));
}

/** True when the event's child was tombstoned earlier in the fold. */
export const fromDeletedChild = (deleted: readonly string[] | undefined, e: AnyEventEnvelope) =>
  e.childId !== null && (deleted?.includes(childKey(e.childId)) ?? false);
