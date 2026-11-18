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
  canonicalJson,
  envelopeStringBytes,
  type HeldEvent,
  identityGuardSql,
  importConflictIdFromError,
  insertEventsSql,
  MAX_EVENT_ENVELOPE_STRING_BYTES,
  mergeProfilesSql,
  mergeSettingsSql,
  purgeChildSql,
  readProfiles,
  readSettings,
  rowToEnvelope,
  storedEventsById,
  tombstoneChildOf,
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

/**
 * Restores a backup into the signed-in family, all or nothing. Idempotent: events merge by id,
 * settings and profiles by LWW, so importing the same file twice changes nothing.
 *
 * - A backup from another family id (for example after the server's data was lost and setup ran
 *   again) is re-homed: its events and profiles take the current family id, and its tombstones
 *   take the current family's server pseudo-device (02 §5.9 S2).
 * - Tombstones must look server-authored (`childId: null`, `deviceId` = the backup's family id);
 *   anything else is refused before any write.
 * - An event id already stored as a different event (another family, type or deleted child), or
 *   used twice in the file for different events, is a `conflict`: refused before any write.
 * - The events, the purges of every child the backup tombstones, and the settings and profiles go
 *   in one D1 transaction, so a tombstone is never visible without its purge (or vice versa). Each
 *   purge statement also requires the child's tombstone to be stored, inside that transaction.
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

    // One id, one event: within the file (compared as canonical JSON, so key order is irrelevant),
    // and against what is stored (for a tombstone, the same deleted child too). Checked here to
    // fail fast, and again inside the write transaction (`identityGuardSql`).
    const identities = rehomed.map((e) => ({
      id: e.id,
      type: e.type,
      deletedChild: tombstoneChildOf(e),
    }));
    const loadStored = () =>
      storedEventsById(
        db,
        rehomed.map((e) => e.id),
      );
    const storedConflict = (stored: Map<string, HeldEvent>): string | null => {
      for (const want of identities) {
        const h = stored.get(want.id);
        if (
          h &&
          (h.familyId !== familyId || h.type !== want.type || h.deletedChild !== want.deletedChild)
        ) {
          return want.id;
        }
      }
      return null;
    };
    const held = await loadStored();
    const seen = new Map<string, string>();
    for (const e of rehomed) {
      const json = canonicalJson(e);
      const prior = seen.get(e.id);
      if (prior !== undefined && prior !== json) {
        throw new ApiError(
          'conflict',
          `event ${e.id}: the backup holds two different events with this id`,
        );
      }
      seen.set(e.id, json);
    }
    const conflictBefore = storedConflict(held);
    if (conflictBefore !== null) {
      throw new ApiError(
        'conflict',
        `event ${conflictBefore}: that id is already used by another event`,
      );
    }

    const fileTombstones = [
      ...new Set(rehomed.map(tombstoneChildOf).filter((id): id is string => id !== null)),
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
    const guardSql = identityGuardSql(familyId, identities);
    let results: D1Result[];
    try {
      results = await batchSql(db, [
        ...insertSql,
        ...guardSql,
        ...purgeSql,
        ...settingsSql,
        ...profilesSql,
      ]);
    } catch (err) {
      // The guard rolled the batch back because a conflicting event landed after our read. Its
      // error names the event, so the answer does not depend on a re-read (the conflicting row
      // may itself be gone by now); the re-read only covers errors that carry no marker.
      const conflictAfter = importConflictIdFromError(err) ?? storedConflict(await loadStored());
      if (conflictAfter !== null) {
        throw new ApiError(
          'conflict',
          `event ${conflictAfter}: that id is already used by another event`,
        );
      }
      throw err;
    }
    const changes = (from: number, count: number) =>
      results.slice(from, from + count).reduce((n, r) => n + r.meta.changes, 0);
    const settingsFrom = insertSql.length + guardSql.length + purgeSql.length;

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
