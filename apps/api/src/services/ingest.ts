import {
  type AnyEventEnvelope,
  type ApiErrorCode,
  eventEnvelopeSchemaFor,
  eventIdSchema,
  eventPayloadBytes,
  inboundEventEnvelopeSchema,
  isKnownEventType,
  MAX_EVENT_PAYLOAD_BYTES,
  type SyncClampedEvent,
  type SyncRejection,
} from '@number-island/shared';
import type { Db } from '../db/client';
import { describeZodError } from '../lib/errors';
import {
  canonId,
  envelopeStringBytes,
  type HeldEvent,
  insertEvents,
  MAX_EVENT_ENVELOPE_STRING_BYTES,
  type StoredEvent,
  storedEventsById,
  tombstoneChildOf,
  toStoredEvent,
} from './event-store';

// Per-event validation and storage of pushed events (08 §4, 02 §5.9 S1).

export interface PushResult {
  accepted: string[];
  rejected: SyncRejection[];
  clamped: SyncClampedEvent[];
}

function rawId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || !('id' in raw)) return null;
  const parsed = eventIdSchema.safeParse((raw as { id: unknown }).id);
  return parsed.success ? parsed.data : null;
}

/**
 * Validates each pushed event on its own and stores the valid ones idempotently.
 *
 * - Envelope strict, known payloads strict (unknown fields stripped), unknown types opaque, 8 KB
 *   payload cap and 1 KB envelope-string cap: failures are `validation_failed` /
 *   `payload_too_large`.
 * - Another family's event: `unknown_family`.
 * - `child.deleted` comes only from the parent route (02 §5.9 S2). A pushed one is accepted only
 *   as a relay of a `child.deleted` this family already holds under that id; otherwise `forbidden`.
 * - Events of a deleted child count as accepted, so devices stop re-pushing them (the tombstone
 *   makes them purge locally), but the insert statement itself skips them.
 * - An id already held by another family: `conflict`.
 * - `clamped` (02 §5.9 S3) echoes the stored `ts`/`clientTs` of every accepted, stored event whose
 *   stored time differs from the pushed copy's: this call's clamp (08 §4), or the copy stored by an
 *   earlier push of that id. It is read back after the insert, so it reports what is stored.
 */
export async function ingestPushedEvents(
  db: Db,
  familyId: string,
  rawEvents: unknown[],
  receivedAt: number,
): Promise<PushResult> {
  const rejected: SyncRejection[] = [];
  const reject = (index: number, raw: unknown, code: ApiErrorCode, message: string) => {
    rejected.push({ id: rawId(raw), index, code, message });
  };

  const valid: { index: number; raw: unknown; event: AnyEventEnvelope }[] = [];
  rawEvents.forEach((raw, index) => {
    const parsed = inboundEventEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      const bytes = eventPayloadBytes(raw);
      if (bytes !== null && bytes > MAX_EVENT_PAYLOAD_BYTES) {
        reject(index, raw, 'payload_too_large', `payload is ${bytes} bytes; the limit is 8192`);
      } else {
        // For a known type, the per-type schema names the failing field (the union cannot).
        const type = (raw as { type?: unknown } | null)?.type;
        const specific =
          typeof type === 'string' && isKnownEventType(type)
            ? eventEnvelopeSchemaFor(type).safeParse(raw)
            : null;
        const error = specific && !specific.success ? specific.error : parsed.error;
        reject(index, raw, 'validation_failed', describeZodError(error));
      }
      return;
    }
    if (envelopeStringBytes(parsed.data) > MAX_EVENT_ENVELOPE_STRING_BYTES) {
      reject(index, raw, 'payload_too_large', 'type and contentVersion exceed 1024 bytes');
      return;
    }
    if (parsed.data.familyId !== familyId) {
      reject(index, raw, 'unknown_family', 'The event belongs to another family.');
      return;
    }
    // `deviceId = familyId` is the server's pseudo-device (02 §5.9 S2); devices may not author as
    // it. Tombstone relays are checked below. Other device ids are allowed: a re-paired device or
    // a restored local log legitimately relays events recorded under an earlier device id.
    if (
      canonId(parsed.data.deviceId) === canonId(familyId) &&
      parsed.data.type !== 'child.deleted'
    ) {
      reject(index, raw, 'forbidden', 'That device id is reserved for the server.');
      return;
    }
    valid.push({ index, raw, event: parsed.data });
  });

  const stored = await storedEventsById(
    db,
    valid.map((v) => v.event.id),
  );
  const accepted: string[] = [];
  // The first accepted copy of each id: the one the clamp echo (S3) compares with the stored row.
  const firstCopy = new Map<string, AnyEventEnvelope>();
  const accept = (event: AnyEventEnvelope) => {
    if (!firstCopy.has(event.id)) firstCopy.set(event.id, event);
    accepted.push(event.id);
  };
  const toInsert: StoredEvent[] = [];
  for (const { index, raw, event } of valid) {
    const held = stored.get(event.id);
    if (held !== undefined && held.familyId !== familyId) {
      reject(index, raw, 'conflict', 'That event id is already in use.');
      continue;
    }
    if (event.type === 'child.deleted') {
      // Only a relay of the very tombstone this family holds under that id (02 §5.9 S2 b).
      if (held !== undefined && isSameEvent(held, event)) accept(event);
      else reject(index, raw, 'forbidden', 'Only a parent can delete a child.');
      continue;
    }
    accept(event);
    if (held === undefined) toInsert.push(toStoredEvent(event, receivedAt));
  }
  await insertEvents(db, familyId, toInsert, receivedAt);
  // An id pushed twice in one call is stored once and reported once. Rejections in request order.
  rejected.sort((x, y) => x.index - y.index);
  const unique = [...new Set(accepted)];
  const clamped = await clampedEcho(db, familyId, unique, firstCopy);
  return { accepted: unique, rejected, clamped };
}

/**
 * The stored time of each accepted event whose stored copy differs in `ts` or `clientTs` from the
 * pushed copy (02 §5.9 S3), in `accepted` order. The row is read back after the insert, so the
 * times are exactly what other devices pull, and it counts only when it is this very event
 * (`isSameEvent`): a deleted child's push is not stored, and a row that another event (in this
 * call or before it) holds under the id is never echoed.
 */
async function clampedEcho(
  db: Db,
  familyId: string,
  accepted: string[],
  firstCopy: Map<string, AnyEventEnvelope>,
): Promise<SyncClampedEvent[]> {
  const stored = await storedEventsById(db, accepted);
  const out: SyncClampedEvent[] = [];
  for (const id of accepted) {
    const held = stored.get(id);
    const sent = firstCopy.get(id);
    if (held === undefined || held.familyId !== familyId || sent === undefined) continue;
    if (!isSameEvent(held, sent)) continue;
    if (held.ts === sent.ts && held.clientTs === (sent.clientTs ?? null)) continue;
    out.push({ id, ts: held.ts, ...(held.clientTs === null ? {} : { clientTs: held.clientTs }) });
  }
  return out;
}

/**
 * Whether a stored row is the same event as a pushed copy of its id (copies may differ in time):
 * the same type and child, or for a tombstone the same deleted child (02 §5.9 S2 b). The one
 * identity rule both relay acceptance and the clamp echo use.
 */
function isSameEvent(held: HeldEvent, e: AnyEventEnvelope): boolean {
  if (held.type !== e.type) return false;
  if (e.type === 'child.deleted') return held.deletedChild === tombstoneChildOf(e);
  return sameChild(held.childId, e.childId);
}

const sameChild = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : canonId(a) === canonId(b);
