import {
  type AnyEventEnvelope,
  type ApiErrorCode,
  eventEnvelopeSchemaFor,
  eventIdSchema,
  eventPayloadBytes,
  inboundEventEnvelopeSchema,
  isKnownEventType,
  MAX_EVENT_PAYLOAD_BYTES,
  type SyncRejection,
} from '@number-island/shared';
import type { Db } from '../db/client';
import { describeZodError } from '../lib/errors';
import {
  canonId,
  envelopeStringBytes,
  insertEvents,
  MAX_EVENT_ENVELOPE_STRING_BYTES,
  type StoredEvent,
  storedEventsById,
  toStoredEvent,
} from './event-store';

// Per-event validation and storage of pushed events (08 §4, 02 §5.9 S1).

export interface PushResult {
  accepted: string[];
  rejected: SyncRejection[];
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
  const toInsert: StoredEvent[] = [];
  for (const { index, raw, event } of valid) {
    const held = stored.get(event.id);
    if (held !== undefined && held.familyId !== familyId) {
      reject(index, raw, 'conflict', 'That event id is already in use.');
      continue;
    }
    if (event.type === 'child.deleted') {
      // Only a relay of a tombstone this family already holds (02 §5.9 S2 b).
      if (held?.type === 'child.deleted') accepted.push(event.id);
      else reject(index, raw, 'forbidden', 'Only a parent can delete a child.');
      continue;
    }
    accepted.push(event.id);
    if (held === undefined) toInsert.push(toStoredEvent(event, receivedAt));
  }
  await insertEvents(db, familyId, toInsert, receivedAt);
  // An id pushed twice in one call is stored once and reported once. Rejections in request order.
  rejected.sort((x, y) => x.index - y.index);
  return { accepted: [...new Set(accepted)], rejected };
}
