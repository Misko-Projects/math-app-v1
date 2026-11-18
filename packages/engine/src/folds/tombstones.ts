// Tombstones in the projection folds (08 §4). A `child.deleted` tombstone is permanent: the server
// purges the child's events and every device does the same, then rebuilds. To agree with that
// purge whatever the timestamps, the full folds ignore every event whose envelope names a
// tombstoned child, and an incremental fold ignores the child's events from the tombstone on
// (the client rebuilds from the purged log, D01). Child ids compare case-insensitively, and the
// per-child maps of the projections are keyed by the lower-case id.

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

/** True when the event's child was tombstoned earlier in an incremental fold. */
export const fromDeletedChild = (deleted: readonly string[] | undefined, e: AnyEventEnvelope) =>
  e.childId !== null && deleted !== undefined && deleted.includes(childKey(e.childId));
