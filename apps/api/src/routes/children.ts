import {
  type ChildIdParams,
  childIdParamsSchema,
  newId,
  type OkResponse,
} from '@number-island/shared';
import { Hono } from 'hono';
import { requireParent } from '../auth/middleware';
import type { AppBindings } from '../env';
import { KB, limitBody, pathParams, requireJsonContentType } from '../lib/http';
import { purgeChild, tombstonedChildIds, tombstoneEvent } from '../services/event-store';

// DELETE /children/:id (08 §2, §4): purge a child everywhere and propagate a tombstone.

export const childRoutes = new Hono<AppBindings>();

/**
 * Deletes the child's events, settings and profile data, and appends one `child.deleted`
 * tombstone (02 §5.9 S2) that every device pulls and folds into a local purge. Idempotent: a
 * repeated delete re-purges (catching events pushed by a stale device) without a second tombstone.
 * A child the server has never seen still gets a tombstone, because the profile may exist only on
 * devices that have not synced yet.
 */
childRoutes.delete(
  '/children/:id',
  requireJsonContentType,
  limitBody(1 * KB),
  requireParent,
  pathParams(childIdParamsSchema),
  async (c) => {
    const db = c.get('db');
    const now = c.get('now');
    const familyId = c.get('familyId');
    const { id }: ChildIdParams = c.req.valid('param');
    const already = (await tombstonedChildIds(db, familyId)).has(id);
    const tombstone = already ? null : tombstoneEvent(newId(), familyId, id, now);
    await purgeChild(db, familyId, id, now, tombstone);
    const res: OkResponse = { ok: true };
    return c.json(res);
  },
);
