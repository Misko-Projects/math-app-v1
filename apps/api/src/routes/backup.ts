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
import { events } from '../db/schema';
import type { AppBindings } from '../env';
import { jsonBody, limitBody, MB, requireJsonContentType } from '../lib/http';
import {
  canonId,
  deletedChildIds,
  insertEvents,
  mergeProfiles,
  mergeSettings,
  purgeChild,
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
 * Restores a backup into the signed-in family. Idempotent: events merge by id, settings and
 * profiles by LWW, so importing the same file twice changes nothing.
 *
 * A backup from another family id (for example after the server's data was lost and setup ran
 * again) is re-homed: its events and profiles take the current family id, and its tombstones take
 * the current family's server pseudo-device (02 §5.9 S2). Tombstones in the file are applied:
 * those children's stored events, settings and profile data are purged here too.
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

    const rehomed = backup.events.map((e): AnyEventEnvelope => {
      const deviceId =
        e.type === 'child.deleted' && canonId(e.deviceId) === canonId(backup.familyId)
          ? familyId
          : e.deviceId;
      return { ...e, familyId, deviceId } as AnyEventEnvelope;
    });
    const fileTombstones = new Set(
      rehomed.map(deletedChildOf).filter((id): id is string => id !== null),
    );
    const alreadyDeleted = await deletedChildIds(db, familyId);
    const deleted = new Set([...alreadyDeleted, ...fileTombstones]);

    // Ids another family holds are skipped (they cannot be ours).
    const owners = await storedEventsById(
      db,
      rehomed.map((e) => e.id),
    );
    const toInsert = rehomed
      .filter((e) => !(e.childId !== null && deleted.has(canonId(e.childId))))
      .filter((e) => {
        const owner = owners.get(e.id);
        return owner === undefined;
      })
      .map((e) => toStoredEvent(e, now));
    const insertedEvents = await insertEvents(db, toInsert, now);

    for (const childId of fileTombstones) {
      if (!alreadyDeleted.has(childId)) await purgeChild(db, familyId, childId, now, null);
    }
    const settingsWritten = await mergeSettings(db, familyId, backup.settings, deleted);
    const profilesWritten = await mergeProfiles(db, familyId, backup.profiles, deleted);

    const res: ImportResponse = {
      imported: { events: insertedEvents, settings: settingsWritten, profiles: profilesWritten },
    };
    return c.json(res);
  },
);
