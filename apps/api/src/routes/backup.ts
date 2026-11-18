import {
  type AnyEventEnvelope,
  BACKUP_FORMAT,
  type BackupFile,
  backupFileSchema,
  type ImportResponse,
} from '@number-island/shared';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireParent } from '../auth/middleware';
import { batchSql } from '../db/client';
import { events } from '../db/schema';
import type { AppBindings } from '../env';
import { ApiError } from '../lib/errors';
import { jsonBody, limitBody, MB, requireJsonContentType } from '../lib/http';
import {
  canonId,
  envelopeStringBytes,
  insertEventsSql,
  MAX_EVENT_ENVELOPE_STRING_BYTES,
  mergeProfilesSql,
  mergeSettingsSql,
  purgeChildSql,
  readProfiles,
  readSettings,
  rowToEnvelope,
  storedEventsById,
  toStoredEvent,
} from '../services/event-store';

// GET /export and POST /import (08 §2): the full family backup (02 §4.4, 02 §5.9 F5).

export const backupRoutes = new Hono<AppBindings>();

/** The whole family: every event in server order, every settings document, live profiles. */
backupRoutes.get('/export', requireParent, async (c) => {
  const db = c.get('db');
  const now = c.get('now');
  const familyId = c.get('familyId');
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.familyId, familyId))
    .orderBy(asc(events.seq));
  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: 1,
    exportedAt: now,
    familyId,
    events: rows.map(rowToEnvelope),
    settings: await readSettings(db, familyId),
    profiles: await readProfiles(db, familyId),
  };
  const day = new Date(now).toISOString().slice(0, 10);
  c.header('Content-Disposition', `attachment; filename="number-island-backup-${day}.json"`);
  c.header('Cache-Control', 'no-store');
  return c.json(backup);
});

function deletedChildOf(e: AnyEventEnvelope): string | null {
  if (e.type !== 'child.deleted') return null;
  const child = (e.payload as { childId?: unknown }).childId;
  return typeof child === 'string' ? canonId(child) : null;
}

/**
 * Restores a backup into the signed-in family, all or nothing. Idempotent: events merge by id,
 * settings and profiles by LWW, so importing the same file twice changes nothing.
 *
 * - A backup from another family id (for example after the server's data was lost and setup ran
 *   again) is re-homed: its events and profiles take the current family id, and its tombstones
 *   take the current family's server pseudo-device (02 §5.9 S2).
 * - Tombstones must look server-authored (`childId: null`, `deviceId` = the backup's family id);
 *   anything else is refused before any write.
 * - An event id already stored with another type, or by another family, is a `conflict`: the
 *   import is refused before any write.
 * - The events, the purges of every child the backup tombstones, and the settings and profiles go
 *   in one D1 transaction, so a tombstone is never visible without its purge (or vice versa).
 *
 * `imported` counts what was written: new events, and settings and profiles that were newer.
 */
backupRoutes.post(
  '/import',
  requireJsonContentType,
  limitBody(64 * MB),
  requireParent,
  jsonBody(backupFileSchema),
  async (c) => {
    const db = c.get('db');
    const now = c.get('now');
    const familyId = c.get('familyId');
    const backup: BackupFile = c.req.valid('json');

    for (const e of backup.events) {
      if (envelopeStringBytes(e) > MAX_EVENT_ENVELOPE_STRING_BYTES) {
        throw new ApiError(
          'validation_failed',
          `event ${e.id}: type and contentVersion exceed 1024 bytes`,
        );
      }
      if (
        e.type === 'child.deleted' &&
        (e.childId !== null || canonId(e.deviceId) !== canonId(backup.familyId))
      ) {
        throw new ApiError('validation_failed', `event ${e.id}: not a server-authored tombstone`);
      }
    }
    const rehomed = backup.events.map((e): AnyEventEnvelope => {
      const deviceId = e.type === 'child.deleted' ? familyId : e.deviceId;
      return { ...e, familyId, deviceId } as AnyEventEnvelope;
    });

    const held = await storedEventsById(
      db,
      rehomed.map((e) => e.id),
    );
    for (const e of rehomed) {
      const h = held.get(e.id);
      if (h && (h.familyId !== familyId || h.type !== e.type)) {
        throw new ApiError('conflict', `event ${e.id}: that id is already used by another event`);
      }
    }

    const fileTombstones = [
      ...new Set(rehomed.map(deletedChildOf).filter((id): id is string => id !== null)),
    ];
    const tombstoned = new Set(fileTombstones);
    const toInsert = rehomed
      .filter((e) => !held.has(e.id))
      .filter((e) => !(e.childId !== null && tombstoned.has(canonId(e.childId))))
      .map((e) => toStoredEvent(e, now));

    const insertSql = insertEventsSql(familyId, toInsert, now);
    const purgeSql = fileTombstones.flatMap((child) => purgeChildSql(familyId, child, now, null));
    const settingsSql = mergeSettingsSql(familyId, backup.settings);
    const profilesSql = mergeProfilesSql(familyId, backup.profiles);
    const results = await batchSql(db, [...insertSql, ...purgeSql, ...settingsSql, ...profilesSql]);
    const changes = (from: number, count: number) =>
      results.slice(from, from + count).reduce((n, r) => n + r.meta.changes, 0);
    const settingsFrom = insertSql.length + purgeSql.length;

    const res: ImportResponse = {
      imported: {
        events: changes(0, insertSql.length),
        settings: changes(settingsFrom, settingsSql.length),
        profiles: changes(settingsFrom + settingsSql.length, profilesSql.length),
      },
    };
    return c.json(res);
  },
);
