import {
  type DeviceIdParams,
  type DevicesListResponse,
  deviceIdParamsSchema,
  newId,
  type OkResponse,
  type PairCompleteRequest,
  type PairCompleteResponse,
  type PairStartResponse,
  pairCompleteRequestSchema,
} from '@number-island/shared';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireParent } from '../auth/middleware';
import { batchSql } from '../db/client';
import { devices, pairCodes } from '../db/schema';
import type { AppBindings } from '../env';
import { randomPairCode, randomToken, sha256Hex } from '../lib/crypto';
import { ApiError } from '../lib/errors';
import { clientIp, jsonBody, KB, limitBody, pathParams, requireJsonContentType } from '../lib/http';
import { hitRateLimit, PAIR_LIMIT } from '../lib/rate-limit';

// Device pairing and management (08 §2, §3).

export const PAIR_CODE_TTL_MS = 10 * 60 * 1000;
export const PAIR_CODE_MAX_TRIES = 5;

export const deviceRoutes = new Hono<AppBindings>();

/** Parent: a fresh single-use 6-digit code valid for 10 minutes. */
deviceRoutes.post(
  '/devices/pair/start',
  requireJsonContentType,
  limitBody(1 * KB),
  requireParent,
  async (c) => {
    const db = c.get('db');
    const now = c.get('now');
    const familyId = c.get('familyId');
    await db.delete(pairCodes).where(lte(pairCodes.expiresAt, now));

    const expiresAt = now + PAIR_CODE_TTL_MS;
    // A collision with another live code is astronomically unlikely; retry rather than reuse.
    for (let i = 0; i < 5; i++) {
      const code = randomPairCode();
      const inserted = await db
        .insert(pairCodes)
        .values({ codeHash: await sha256Hex(code), familyId, expiresAt, attempts: 0 })
        .onConflictDoNothing()
        .returning({ codeHash: pairCodes.codeHash });
      if (inserted.length === 1) {
        const res: PairStartResponse = { code, expiresAt };
        return c.json(res, 201);
      }
    }
    throw new ApiError('internal', 'Could not create a pairing code.');
  },
);

/**
 * Code → a new device token. A code still within its 5 tries is consumed; a wrong code counts a
 * try against every live code (a guesser cannot know which one it targets). Both happen in one
 * transaction, so a code takes at most 5 wrong tries however many requests race, and a success
 * charges nothing. The per-IP rate limit bounds guessing on top.
 */
deviceRoutes.post(
  '/devices/pair/complete',
  requireJsonContentType,
  limitBody(1 * KB),
  jsonBody(pairCompleteRequestSchema),
  async (c) => {
    const db = c.get('db');
    const now = c.get('now');
    const body: PairCompleteRequest = c.req.valid('json');
    await hitRateLimit(db, PAIR_LIMIT, clientIp(c), now);

    const codeHash = await sha256Hex(body.code);
    // Claim and charge in one transaction (D1 serialises transactions): the claim sees every
    // earlier failure's charge, so racing guesses cannot exceed 5 tries per code. Only a failed
    // try is charged to the live codes (`changes()` is the claim's row count), so a successful
    // pairing never spends another code's budget.
    const [claim] = await batchSql(db, [
      sql`DELETE FROM pair_codes
          WHERE code_hash = ${codeHash} AND expires_at > ${now} AND attempts < ${PAIR_CODE_MAX_TRIES}
          RETURNING family_id`,
      sql`UPDATE pair_codes SET attempts = attempts + 1 WHERE expires_at > ${now} AND changes() = 0`,
    ]);
    const claimed = (claim?.results as { family_id: string }[] | undefined)?.[0];

    if (!claimed) {
      const [stale] = await db
        .select({ expiresAt: pairCodes.expiresAt })
        .from(pairCodes)
        .where(eq(pairCodes.codeHash, codeHash))
        .limit(1);
      if (stale && stale.expiresAt <= now) {
        throw new ApiError('pair_code_expired', 'That code has expired. Ask for a new one.');
      }
      throw new ApiError('pair_code_invalid', 'That code is not right.');
    }

    const deviceId = newId();
    const deviceToken = randomToken();
    await db.insert(devices).values({
      id: deviceId,
      familyId: claimed.family_id,
      name: body.deviceName,
      tokenHash: await sha256Hex(deviceToken),
      createdAt: now,
    });
    const res: PairCompleteResponse = { deviceId, deviceToken, familyId: claimed.family_id };
    return c.json(res, 201);
  },
);

/** Parent: every device of the family, revoked ones included (they show `revokedAt`). */
deviceRoutes.get('/devices', requireParent, async (c) => {
  const rows = await c
    .get('db')
    .select({
      id: devices.id,
      name: devices.name,
      createdAt: devices.createdAt,
      lastSeenAt: devices.lastSeenAt,
      revokedAt: devices.revokedAt,
    })
    .from(devices)
    .where(eq(devices.familyId, c.get('familyId')))
    .orderBy(asc(devices.createdAt), asc(devices.id));
  const res: DevicesListResponse = { devices: rows };
  return c.json(res);
});

/** Parent: revoke a device. Its token stops working at once; its events stay. Idempotent. */
deviceRoutes.delete(
  '/devices/:id',
  requireJsonContentType,
  limitBody(1 * KB),
  requireParent,
  pathParams(deviceIdParamsSchema),
  async (c) => {
    const db = c.get('db');
    const { id }: DeviceIdParams = c.req.valid('param');
    const familyId = c.get('familyId');
    const [device] = await db
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.id, id), eq(devices.familyId, familyId)))
      .limit(1);
    if (!device) throw new ApiError('not_found', 'No such device.');
    await db
      .update(devices)
      .set({ revokedAt: c.get('now') })
      .where(and(eq(devices.id, id), isNull(devices.revokedAt)));
    const res: OkResponse = { ok: true };
    return c.json(res);
  },
);
