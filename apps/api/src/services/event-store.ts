import {
  type AnyEventEnvelope,
  type ChildProfile,
  childProfileSchema,
  type SettingsDocument,
  settingsDocumentSchema,
  settingsKey,
  utf8ByteLength,
} from '@number-island/shared';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { batchSql, type Db } from '../db/client';
import { type events, profiles, settings } from '../db/schema';
import { CONTENT_VERSION } from '../version';

// The family event log, settings and profiles in D1 (02 §4, 08 §4–§5). Shared by /sync, /import,
// /export and DELETE /children/:id.

/** 08 §4: a `ts` more than 24 h ahead of the server is clamped to `receivedAt`. */
export const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/** A validated event ready to store. */
export interface StoredEvent {
  id: string;
  familyId: string;
  childId: string | null;
  deviceId: string;
  ts: number;
  clientTs: number | null;
  type: string;
  payloadJson: string;
  contentVersion: string;
}

/**
 * Applies the clock-skew clamp (08 §4): a future `ts` beyond 24 h becomes `receivedAt` and the
 * device's original time is kept in `clientTs`. An event that already carries `clientTs` (relayed
 * after an earlier clamp) keeps it.
 */
export function toStoredEvent(e: AnyEventEnvelope, receivedAt: number): StoredEvent {
  const clamp = e.ts > receivedAt + MAX_FUTURE_SKEW_MS;
  return {
    id: e.id,
    familyId: e.familyId,
    childId: e.childId,
    deviceId: e.deviceId,
    ts: clamp ? receivedAt : e.ts,
    clientTs: clamp ? e.ts : (e.clientTs ?? null),
    type: e.type,
    payloadJson: JSON.stringify(e.payload),
    contentVersion: e.contentVersion,
  };
}

type EventRow = typeof events.$inferSelect;

/** Rebuilds the wire envelope from a stored row (the payload exactly as stored). */
export function rowToEnvelope(row: EventRow): AnyEventEnvelope {
  const envelope = {
    id: row.id,
    familyId: row.familyId,
    childId: row.childId,
    deviceId: row.deviceId,
    ts: row.ts,
    ...(row.clientTs === null ? {} : { clientTs: row.clientTs }),
    type: row.type,
    v: 1 as const,
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    contentVersion: row.contentVersion,
  };
  // Rows were validated on the way in; known types keep their parsed (stripped) payload shape.
  return envelope as AnyEventEnvelope;
}

/**
 * D1 allows 100 bound parameters per statement, so rows travel as one JSON array parameter and
 * are expanded with `json_each`: one statement per ~512 KB chunk instead of one per 9 rows.
 */
const CHUNK_BYTES = 512 * 1024;

function chunkByJsonSize<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let size = 2;
  for (const item of items) {
    const bytes = utf8ByteLength(JSON.stringify(item)) + 1;
    if (current.length > 0 && size + bytes > CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(item);
    size += bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * `INSERT OR IGNORE` (08 §4): idempotent by event id, in array order (so `seq` follows it).
 * Returns how many rows were new.
 */
export async function insertEvents(
  db: Db,
  rows: StoredEvent[],
  receivedAt: number,
): Promise<number> {
  if (rows.length === 0) return 0;
  const statements = chunkByJsonSize(rows).map(
    (chunk) => sql`
      INSERT OR IGNORE INTO events
        (id, family_id, child_id, device_id, ts, client_ts, type, payload_json, content_version, received_at)
      SELECT
        json_extract(value, '$.id'), json_extract(value, '$.familyId'), json_extract(value, '$.childId'),
        json_extract(value, '$.deviceId'), json_extract(value, '$.ts'), json_extract(value, '$.clientTs'),
        json_extract(value, '$.type'), json_extract(value, '$.payloadJson'),
        json_extract(value, '$.contentVersion'), ${receivedAt}
      FROM json_each(${JSON.stringify(chunk)})
      ORDER BY key`,
  );
  const results = await batchSql(db, statements);
  return results.reduce((n, r) => n + r.meta.changes, 0);
}

/** Which of `ids` exist: the family and type of each stored event. */
export async function storedEventsById(
  db: Db,
  ids: string[],
): Promise<Map<string, { familyId: string; type: string }>> {
  const out = new Map<string, { familyId: string; type: string }>();
  for (const chunk of chunkByJsonSize(ids)) {
    const rows = await db.all<{ id: string; family_id: string; type: string }>(
      sql`SELECT id, family_id, type FROM events
          WHERE id IN (SELECT value FROM json_each(${JSON.stringify(chunk)}))`,
    );
    for (const row of rows) out.set(row.id, { familyId: row.family_id, type: row.type });
  }
  return out;
}

/**
 * Canonical form of a UUID for comparisons. The shared id grammar accepts either case (02 §5.9),
 * and ids are relayed exactly as pushed, so every server-side identity check (reserved device id,
 * deleted children) compares canonical forms; otherwise `ABC…` would slip past a check for `abc…`.
 */
export function canonId(id: string): string {
  return id.toLowerCase();
}

/**
 * Children of this family deleted through DELETE /children/:id (or an imported tombstone), as
 * canonical (lower-case) ids; test membership with `canonId`.
 */
export async function deletedChildIds(db: Db, familyId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.familyId, familyId), isNotNull(profiles.deletedAt)));
  return new Set(rows.map((r) => canonId(r.id)));
}

/** Tombstone events already stored for this family, as canonical deleted-child ids. */
export async function tombstonedChildIds(db: Db, familyId: string): Promise<Set<string>> {
  const rows = await db.all<{ child: string }>(
    sql`SELECT json_extract(payload_json, '$.childId') AS child FROM events
        WHERE family_id = ${familyId} AND type = 'child.deleted'`,
  );
  return new Set(rows.map((r) => canonId(r.child)));
}

/**
 * Purges a child (08 §2, §4): deletes their events and settings, and leaves a purged profile row
 * (no data, `deleted_at` set) so stale devices cannot resurrect the profile. Idempotent. A
 * `tombstone` is inserted in the same transaction, so the family's highest `seq` never drops
 * (sync treats a cursor past the end as a server reset). Matching is case-insensitive (`canonId`).
 */
export async function purgeChild(
  db: Db,
  familyId: string,
  childId: string,
  now: number,
  tombstone: StoredEvent | null,
): Promise<void> {
  const insertTombstone = tombstone
    ? [
        sql`
          INSERT OR IGNORE INTO events
            (id, family_id, child_id, device_id, ts, client_ts, type, payload_json, content_version, received_at)
          VALUES (${tombstone.id}, ${tombstone.familyId}, NULL, ${tombstone.deviceId}, ${tombstone.ts},
            ${tombstone.clientTs}, ${tombstone.type}, ${tombstone.payloadJson},
            ${tombstone.contentVersion}, ${now})`,
      ]
    : [];
  const child = canonId(childId);
  await batchSql(db, [
    ...insertTombstone,
    sql`DELETE FROM events WHERE family_id = ${familyId} AND lower(child_id) = ${child}`,
    sql`DELETE FROM settings WHERE family_id = ${familyId} AND lower(key) = ${settingsKey(child)}`,
    // Purge every stored casing of the profile, then make sure a purged row exists.
    sql`
      UPDATE profiles SET data_json = NULL, updated_at = ${now},
        deleted_at = COALESCE(deleted_at, ${now})
      WHERE family_id = ${familyId} AND lower(id) = ${child}`,
    sql`
      INSERT INTO profiles (id, family_id, data_json, updated_at, deleted_at)
      SELECT ${child}, ${familyId}, NULL, ${now}, ${now}
      WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE lower(id) = ${child})`,
  ]);
}

/** The server-authored tombstone (02 §5.9 S2): `deviceId = familyId`, `childId: null`. */
export function tombstoneEvent(id: string, familyId: string, childId: string, now: number) {
  return {
    id,
    familyId,
    childId: null,
    deviceId: familyId,
    ts: now,
    clientTs: null,
    type: 'child.deleted',
    payloadJson: JSON.stringify({ childId }),
    contentVersion: CONTENT_VERSION,
  } satisfies StoredEvent;
}

/**
 * Settings LWW per whole document (08 §4): the incoming document wins only when strictly newer.
 * Documents of deleted children are ignored. Returns how many documents were written.
 */
export async function mergeSettings(
  db: Db,
  familyId: string,
  docs: SettingsDocument[],
  deleted: ReadonlySet<string>,
): Promise<number> {
  const live = docs.filter(
    (d) => !(d.key.startsWith('child:') && deleted.has(canonId(d.key.slice(6)))),
  );
  if (live.length === 0) return 0;
  const statements = live.map(
    (d) => sql`
      INSERT INTO settings (family_id, key, value_json, updated_at)
      VALUES (${familyId}, ${d.key}, ${JSON.stringify(d.value)}, ${d.updatedAt})
      ON CONFLICT(family_id, key) DO UPDATE SET value_json = excluded.value_json,
        updated_at = excluded.updated_at
      WHERE excluded.updated_at > settings.updated_at`,
  );
  const results = await batchSql(db, statements);
  return results.reduce((n, r) => n + r.meta.changes, 0);
}

/**
 * Profiles LWW by `updatedAt` (08 §4). A purged (deleted) child's row is never overwritten, and a
 * profile id held by another family is left alone. Returns how many profiles were written.
 */
export async function mergeProfiles(
  db: Db,
  familyId: string,
  incoming: ChildProfile[],
  deleted: ReadonlySet<string>,
): Promise<number> {
  const live = incoming.filter((p) => !deleted.has(canonId(p.id)));
  if (live.length === 0) return 0;
  const statements = live.map(
    (p) => sql`
      INSERT INTO profiles (id, family_id, data_json, updated_at, deleted_at)
      VALUES (${p.id}, ${familyId}, ${JSON.stringify({ ...p, familyId })}, ${p.updatedAt}, NULL)
      ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
      WHERE profiles.family_id = excluded.family_id AND profiles.deleted_at IS NULL
        AND excluded.updated_at > profiles.updated_at`,
  );
  const results = await batchSql(db, statements);
  return results.reduce((n, r) => n + r.meta.changes, 0);
}

/** Every settings document of the family (the server LWW result). */
export async function readSettings(db: Db, familyId: string): Promise<SettingsDocument[]> {
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.familyId, familyId))
    .orderBy(asc(settings.key));
  const out: SettingsDocument[] = [];
  for (const row of rows) {
    const doc = settingsDocumentSchema.safeParse({
      key: row.key,
      value: JSON.parse(row.valueJson),
      updatedAt: row.updatedAt,
    });
    if (doc.success) out.push(doc.data);
  }
  return out;
}

/** Every live (not purged) child profile of the family. */
export async function readProfiles(db: Db, familyId: string): Promise<ChildProfile[]> {
  const rows = await db
    .select({ dataJson: profiles.dataJson })
    .from(profiles)
    .where(and(eq(profiles.familyId, familyId), sql`${profiles.deletedAt} IS NULL`))
    .orderBy(asc(profiles.id));
  const out: ChildProfile[] = [];
  for (const row of rows) {
    if (row.dataJson === null) continue;
    const profile = childProfileSchema.safeParse(JSON.parse(row.dataJson));
    if (profile.success) out.push(profile.data);
  }
  return out;
}
