import {
  SYNC_MAX_PULL_EVENTS,
  type SyncResponse,
  syncRequestIngressSchema,
} from '@number-island/shared';
import { and, asc, eq, gt, lte, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireDevice } from '../auth/middleware';
import { events } from '../db/schema';
import type { AppBindings } from '../env';
import { ApiError } from '../lib/errors';
import { jsonBody, limitBody, MB, requireJsonContentType } from '../lib/http';
import {
  mergeProfiles,
  mergeSettings,
  readProfiles,
  readSettings,
  rowToEnvelope,
} from '../services/event-store';
import { ingestPushedEvents } from '../services/ingest';

// POST /sync (08 §4): push events, settings and profiles; pull other devices' events by cursor.
// The body is parsed with `syncRequestIngressSchema` and each event on its own (02 §5.9 S1).

/** The opaque cursor is the decimal server `seq` of the last event the device has seen. */
const CURSOR_PATTERN = /^\d{1,15}$/;

function parseCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  if (!CURSOR_PATTERN.test(cursor)) throw new ApiError('validation_failed', 'cursor: invalid');
  return Number(cursor);
}

export const syncRoutes = new Hono<AppBindings>();

// 500 events × 8 KB payload, plus envelopes, settings and profiles.
syncRoutes.post(
  '/sync',
  requireJsonContentType,
  limitBody(6 * MB),
  requireDevice,
  jsonBody(syncRequestIngressSchema),
  async (c) => {
    const db = c.get('db');
    const now = c.get('now');
    const familyId = c.get('familyId');
    const deviceId = c.get('deviceId');
    const body = c.req.valid('json');
    let cursor = parseCursor(body.cursor);

    if (body.profiles.some((p) => p.familyId !== familyId)) {
      throw new ApiError('unknown_family', 'A profile belongs to another family.');
    }

    // Push.
    const push = await ingestPushedEvents(db, familyId, body.events, now);
    await mergeSettings(db, familyId, body.settings);
    await mergeProfiles(db, familyId, body.profiles);

    // Pull. The high-water mark is read first: D1 commits writes in `seq` order, so nothing at or
    // below it can appear later, and the device can skip to it when the page is not full.
    const [high] = await db.all<{ max: number | null }>(
      sql`SELECT MAX(seq) AS max FROM events WHERE family_id = ${familyId}`,
    );
    const highSeq = high?.max ?? 0;
    // A cursor past the end means the server's data was reset or restored: start over.
    if (cursor > highSeq) cursor = 0;
    const rows = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.familyId, familyId),
          gt(events.seq, cursor),
          lte(events.seq, highSeq),
          ne(events.deviceId, deviceId),
        ),
      )
      .orderBy(asc(events.seq))
      .limit(SYNC_MAX_PULL_EVENTS + 1);
    const more = rows.length > SYNC_MAX_PULL_EVENTS;
    const page = more ? rows.slice(0, SYNC_MAX_PULL_EVENTS) : rows;
    const nextCursor = more ? (page.at(-1)?.seq ?? cursor) : highSeq;

    const res: SyncResponse = {
      accepted: push.accepted,
      rejected: push.rejected,
      clamped: push.clamped,
      events: page.map(rowToEnvelope),
      cursor: String(nextCursor),
      more,
      settings: await readSettings(db, familyId),
      profiles: await readProfiles(db, familyId),
    };
    return c.json(res);
  },
);
