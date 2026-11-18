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

/**
 * A sorted copy with each event id kept once. Copies of one event can differ in `ts` when the
 * server clamped it (08 §4: the clamped copy keeps the original time in `clientTs`); the copy
 * with `clientTs` wins, then the earliest `ts` (then the smaller JSON), so the choice does not
 * depend on input order.
 */
export function sortEvents<E extends AnyEventEnvelope>(events: readonly E[]): E[] {
  const byId = new Map<string, E>();
  for (const e of events) {
    const prev = byId.get(e.id);
    if (!prev || preferred(e, prev)) byId.set(e.id, e);
  }
  return [...byId.values()].sort(compareEvents);
}

function preferred(a: AnyEventEnvelope, b: AnyEventEnvelope): boolean {
  const ac = a.clientTs !== undefined;
  const bc = b.clientTs !== undefined;
  if (ac !== bc) return ac;
  if (a.ts !== b.ts) return a.ts < b.ts;
  return JSON.stringify(a) < JSON.stringify(b);
}

/** Ids are compared case-insensitively (08 §4: the UUID grammar accepts either case). */
export const sameId = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/** Narrows an envelope of any type (known or opaque) to a known event type. */
export function isEvent<T extends EventType>(
  e: AnyEventEnvelope,
  type: T,
): e is AnyEventEnvelope & EventEnvelope<T> {
  return e.type === type;
}
