import {
  type AnyEventEnvelope,
  type ChildProfile,
  childProfileSchema,
  type SettingsDocument,
  settingsDocumentSchema,
  settingsKey,
  utf8ByteLength,
} from '@number-island/shared';
import { and, asc, eq, type SQL, sql } from 'drizzle-orm';
import { batchSql, type Db } from '../db/client';
import { type events, profiles, settings } from '../db/schema';
import { CONTENT_VERSION } from '../version';

// The family event log, settings and profiles in D1 (02 §4, 08 §4–§5). Shared by /sync, /import,
// /export and DELETE /children/:id.
//
// A child is *deleted* exactly when the family's log holds a `child.deleted` tombstone for it
// (02 §5.9 S2). Every write that could bring a deleted child's data back (events, settings,
// profiles) re-checks that inside its own SQL statement, so a sync racing a parent's delete can
// never resurrect the child: D1 runs each statement atomically and serialises transactions.

/** 08 §4: a `ts` more than 24 h ahead of the server is clamped to `receivedAt`. */
export const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * Cap on an event's free-form envelope strings (`type` + `contentVersion`, UTF-8 bytes). The
 * shared schema bounds only the payload (8 KB), and D1 rejects oversized rows for the whole batch,
 * so larger envelopes are refused per event before any write.
 */
export const MAX_EVENT_ENVELOPE_STRING_BYTES = 1024;

export function envelopeStringBytes(e: { type: string; contentVersion: string }): number {
  return utf8ByteLength(e.type) + utf8ByteLength(e.contentVersion);
}

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
 * after an earlier clamp) keeps that original time, even when it is clamped again.
 */
export function toStoredEvent(e: AnyEventEnvelope, receivedAt: number): StoredEvent {
  const clamp = e.ts > receivedAt + MAX_FUTURE_SKEW_MS;
  return {
    id: e.id,
    familyId: e.familyId,
    childId: e.childId,
    deviceId: e.deviceId,
    ts: clamp ? receivedAt : e.ts,
    clientTs: e.clientTs ?? (clamp ? e.ts : null),
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
 * Canonical form of a UUID for comparisons. The shared id grammar accepts either case (02 §5.9),
 * and ids are relayed exactly as pushed, so every server-side identity check (reserved device id,
 * deleted children) compares canonical forms; otherwise `ABC…` would slip past a check for `abc…`.
 */
export function canonId(id: string): string {
  return id.toLowerCase();
}

/** SQL: true when the family's log holds a tombstone for the child id `child` (any casing). */
function isDeletedChild(familyId: string, child: SQL): SQL {
  return sql`EXISTS (SELECT 1 FROM events t
    WHERE t.family_id = ${familyId} AND t.type = 'child.deleted'
      AND lower(json_extract(t.payload_json, '$.childId')) = lower(${child}))`;
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

function sumChanges(results: D1Result[]): number {
  return results.reduce((n, r) => n + r.meta.changes, 0);
}

/**
 * Statements for `INSERT OR IGNORE` (08 §4): idempotent by event id, in array order (so `seq`
 * follows it). Events of a deleted child are skipped by the statement itself.
 */
export function insertEventsSql(familyId: string, rows: StoredEvent[], receivedAt: number): SQL[] {
  return chunkByJsonSize(rows).map(
    (chunk) => sql`
      INSERT OR IGNORE INTO events
        (id, family_id, child_id, device_id, ts, client_ts, type, payload_json, content_version, received_at)
      SELECT
        json_extract(value, '$.id'), json_extract(value, '$.familyId'), json_extract(value, '$.childId'),
        json_extract(value, '$.deviceId'), json_extract(value, '$.ts'), json_extract(value, '$.clientTs'),
        json_extract(value, '$.type'), json_extract(value, '$.payloadJson'),
        json_extract(value, '$.contentVersion'), ${receivedAt}
      FROM json_each(${JSON.stringify(chunk)})
      WHERE json_extract(value, '$.childId') IS NULL
        OR NOT ${isDeletedChild(familyId, sql`json_extract(value, '$.childId')`)}
      ORDER BY key`,
  );
}

/** Runs `insertEventsSql` in one transaction. Returns how many rows were new. */
export async function insertEvents(
  db: Db,
  familyId: string,
  rows: StoredEvent[],
  receivedAt: number,
): Promise<number> {
  return sumChanges(await batchSql(db, insertEventsSql(familyId, rows, receivedAt)));
}

/** A stored event's identity: family, type, and (for a tombstone) the canonical child id. */
export interface HeldEvent {
  familyId: string;
  type: string;
  deletedChild: string | null;
}

/** Which of `ids` exist, and as what. */
export async function storedEventsById(db: Db, ids: string[]): Promise<Map<string, HeldEvent>> {
  const out = new Map<string, HeldEvent>();
  for (const chunk of chunkByJsonSize(ids)) {
    const rows = await db.all<{
      id: string;
      family_id: string;
      type: string;
      deleted_child: string | null;
    }>(
      sql`SELECT id, family_id, type,
            CASE WHEN type = 'child.deleted' THEN json_extract(payload_json, '$.childId') END
              AS deleted_child
          FROM events
          WHERE id IN (SELECT value FROM json_each(${JSON.stringify(chunk)}))`,
    );
    for (const row of rows) {
      out.set(row.id, {
        familyId: row.family_id,
        type: row.type,
        deletedChild: row.deleted_child === null ? null : canonId(row.deleted_child),
      });
    }
  }
  return out;
}

/** The canonical child id a tombstone envelope deletes, or null for any other event. */
export function tombstoneChildOf(e: { type: string; payload: unknown }): string | null {
  if (e.type !== 'child.deleted') return null;
  const child = (e.payload as { childId?: unknown } | null)?.childId;
  return typeof child === 'string' ? canonId(child) : null;
}

/** What a stored event must be for an imported event with the same id to be "the same event". */
export interface EventIdentity {
  id: string;
  type: string;
  deletedChild: string | null;
}

/** Marks the error `identityGuardSql` raises; the conflicting event id follows it. */
export const IMPORT_CONFLICT_MARKER = 'import-identity-conflict:';

/**
 * Statements that fail (rolling back their whole batch) when any `identities` id is stored as a
 * different event: another family, another type, or a tombstone for another child. Placed after
 * the inserts of an import, they catch conflicts that appear between the import's read and its
 * write. SQLite has no RAISE outside triggers, so a matching row asks `json_extract` for an invalid
 * path built from `IMPORT_CONFLICT_MARKER` and the event id; SQLite's error ("bad JSON path: …")
 * carries that text, so the caller learns of the conflict from the transaction itself
 * (`importConflictIdFromError`). The row-dependent path keeps it from being evaluated when nothing
 * matches.
 */
export function identityGuardSql(familyId: string, identities: EventIdentity[]): SQL[] {
  return chunkByJsonSize(identities).map(
    (chunk) => sql`
      SELECT json_extract('{}', ${IMPORT_CONFLICT_MARKER} || json_extract(v.value, '$.id'))
      FROM json_each(${JSON.stringify(chunk)}) AS v
      WHERE EXISTS (SELECT 1 FROM events e
        WHERE e.id = json_extract(v.value, '$.id')
          AND (e.family_id != ${familyId}
            OR e.type != json_extract(v.value, '$.type')
            OR (e.type = 'child.deleted'
              AND lower(json_extract(e.payload_json, '$.childId'))
                IS NOT json_extract(v.value, '$.deletedChild'))))
      LIMIT 1`,
  );
}

/** The event id an `identityGuardSql` failure names, or null for any other error. */
export function importConflictIdFromError(err: unknown): string | null {
  const text = err instanceof Error ? err.message : String(err);
  const at = text.indexOf(IMPORT_CONFLICT_MARKER);
  if (at < 0) return null;
  const id = /^[0-9A-Za-z-]+/.exec(text.slice(at + IMPORT_CONFLICT_MARKER.length));
  return id ? id[0] : null;
}

/** JSON with object keys sorted at every level, so equal values compare equal as text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return Object.fromEntries(entries);
  });
}

/** Children this family has tombstoned, as canonical (lower-case) ids. */
export async function deletedChildIds(db: Db, familyId: string): Promise<Set<string>> {
  const rows = await db.all<{ child: string }>(
    sql`SELECT json_extract(payload_json, '$.childId') AS child FROM events
        WHERE family_id = ${familyId} AND type = 'child.deleted'`,
  );
  return new Set(rows.map((r) => canonId(r.child)));
}

/**
 * Statements that purge a child (08 §2, §4), every casing of their id, within this family only:
 * delete their events and settings, and leave a purged profile row (no data, `deleted_at` set).
 *
 * Every purge statement runs only while the family's log holds a tombstone for the child, so data
 * is never purged without a tombstone that devices can pull. A `tombstone`, when given, goes first
 * and is inserted only if the family has no tombstone for the child yet, so concurrent deletes leave
 * exactly one. Inserting it in the same transaction also keeps the family's highest `seq` from
 * dropping (sync treats a cursor past the end as a reset). Without one (import), the purge applies
 * only if a tombstone was stored earlier in the same transaction or before.
 */
export function purgeChildSql(
  familyId: string,
  childId: string,
  now: number,
  tombstone: StoredEvent | null,
): SQL[] {
  const child = canonId(childId);
  const deleted = isDeletedChild(familyId, sql`${child}`);
  const insertTombstone = tombstone
    ? [
        sql`
          INSERT OR IGNORE INTO events
            (id, family_id, child_id, device_id, ts, client_ts, type, payload_json, content_version, received_at)
          SELECT ${tombstone.id}, ${tombstone.familyId}, NULL, ${tombstone.deviceId}, ${tombstone.ts},
            ${tombstone.clientTs}, ${tombstone.type}, ${tombstone.payloadJson},
            ${tombstone.contentVersion}, ${now}
          WHERE NOT ${deleted}`,
      ]
    : [];
  return [
    ...insertTombstone,
    sql`DELETE FROM events
        WHERE family_id = ${familyId} AND lower(child_id) = ${child} AND ${deleted}`,
    sql`DELETE FROM settings
        WHERE family_id = ${familyId} AND lower(key) = ${settingsKey(child)} AND ${deleted}`,
    sql`
      UPDATE profiles SET data_json = NULL, updated_at = ${now},
        deleted_at = COALESCE(deleted_at, ${now})
      WHERE family_id = ${familyId} AND lower(id) = ${child} AND ${deleted}`,
    // A purged row for a child the server never saw. Ignored if any family already holds the id:
    // the tombstone, not this row, is what marks the child deleted.
    sql`
      INSERT OR IGNORE INTO profiles (id, family_id, data_json, updated_at, deleted_at)
      SELECT ${child}, ${familyId}, NULL, ${now}, ${now}
      WHERE ${deleted}
        AND NOT EXISTS (SELECT 1 FROM profiles WHERE family_id = ${familyId} AND lower(id) = ${child})`,
  ];
}

/** Runs `purgeChildSql` as one transaction. */
export async function purgeChild(
  db: Db,
  familyId: string,
  childId: string,
  now: number,
  tombstone: StoredEvent | null,
): Promise<void> {
  await batchSql(db, purgeChildSql(familyId, childId, now, tombstone));
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
 * Documents of deleted children are skipped by the statement itself.
 */
export function mergeSettingsSql(familyId: string, docs: SettingsDocument[]): SQL[] {
  return docs.map(
    (d) => sql`
      INSERT INTO settings (family_id, key, value_json, updated_at)
      SELECT ${familyId}, ${d.key}, ${JSON.stringify(d.value)}, ${d.updatedAt}
      WHERE NOT (${d.key} LIKE 'child:%' AND ${isDeletedChild(familyId, sql`substr(${d.key}, 7)`)})
      ON CONFLICT(family_id, key) DO UPDATE SET value_json = excluded.value_json,
        updated_at = excluded.updated_at
      WHERE excluded.updated_at > settings.updated_at`,
  );
}

/** Runs `mergeSettingsSql` in one transaction. Returns how many documents were written. */
export async function mergeSettings(
  db: Db,
  familyId: string,
  docs: SettingsDocument[],
): Promise<number> {
  return sumChanges(await batchSql(db, mergeSettingsSql(familyId, docs)));
}

/**
 * Profiles LWW by `updatedAt` (08 §4). A deleted child's profile is never written (checked in the
 * statement), a purged row is never overwritten, and a profile id held by another family is left
 * alone.
 */
export function mergeProfilesSql(familyId: string, incoming: ChildProfile[]): SQL[] {
  return incoming.map(
    (p) => sql`
      INSERT INTO profiles (id, family_id, data_json, updated_at, deleted_at)
      SELECT ${p.id}, ${familyId}, ${JSON.stringify({ ...p, familyId })}, ${p.updatedAt}, NULL
      WHERE NOT ${isDeletedChild(familyId, sql`${p.id}`)}
      ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
      WHERE profiles.family_id = excluded.family_id AND profiles.deleted_at IS NULL
        AND excluded.updated_at > profiles.updated_at`,
  );
}

/** Runs `mergeProfilesSql` in one transaction. Returns how many profiles were written. */
export async function mergeProfiles(
  db: Db,
  familyId: string,
  incoming: ChildProfile[],
): Promise<number> {
  return sumChanges(await batchSql(db, mergeProfilesSql(familyId, incoming)));
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
