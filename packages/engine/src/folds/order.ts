// Event ordering shared by every projection (02 §4.3): folds are deterministic and
// order-independent given the same set, because they sort by `ts`, then `id`.

import type { AnyEventEnvelope, EventEnvelope, EventType } from '@number-island/shared';

export function compareEvents(
  a: Pick<AnyEventEnvelope, 'ts' | 'id'>,
  b: Pick<AnyEventEnvelope, 'ts' | 'id'>,
): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A sorted copy, with duplicate ids (the same event delivered twice) kept once. */
export function sortEvents<E extends AnyEventEnvelope>(events: readonly E[]): E[] {
  const sorted = [...events].sort(compareEvents);
  return sorted.filter((e, i) => i === 0 || (sorted[i - 1] as E).id !== e.id);
}

/** Narrows an envelope of any type (known or opaque) to a known event type. */
export function isEvent<T extends EventType>(
  e: AnyEventEnvelope,
  type: T,
): e is AnyEventEnvelope & EventEnvelope<T> {
  return e.type === type;
}
