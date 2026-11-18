import {
  type LoginRequest,
  loginRequestSchema,
  newId,
  type OkResponse,
  type ParentSessionResponse,
  type PinRequest,
  pinRequestSchema,
  type SetupRequest,
  type SetupResponse,
  setupRequestSchema,
} from '@number-island/shared';
import { eq, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireDevice, requireParent } from '../auth/middleware';
import {
  clearParentCookie,
  PARENT_SESSION_MS,
  PIN_SESSION_MS,
  readParentCookie,
  startParentSession,
} from '../auth/session';
import { batchSql } from '../db/client';
import { families, parentCredentials, parentSessions } from '../db/schema';
import type { AppBindings } from '../env';
import { clampIterations, hashSecret, randomToken, sha256Hex, verifySecret } from '../lib/crypto';
import { ApiError } from '../lib/errors';
import { clientIp, jsonBody, KB, limitBody, requireJsonContentType } from '../lib/http';
import {
  clearRateLimit,
  hitRateLimit,
  LOGIN_LIMIT,
  PIN_LIMIT,
  SETUP_LIMIT,
} from '../lib/rate-limit';

// POST /setup, /auth/login, /auth/logout, /auth/pin (08 §2, §3).

export const authRoutes = new Hono<AppBindings>();

/** Creates the family, parent credentials, the first device and a parent session. Once only. */
authRoutes.post(
  '/setup',
  requireJsonContentType,
  limitBody(4 * KB),
  jsonBody(setupRequestSchema),
  async (c) => {
    const db = c.get('db');
    const now = c.get('now');
    const body: SetupRequest = c.req.valid('json');
    await hitRateLimit(db, SETUP_LIMIT, clientIp(c), now);

    const existing = await db.select({ id: families.id }).from(families).limit(1);
    if (existing.length > 0) throw new ApiError('setup_closed', 'This island is already set up.');

    const iterations = clampIterations(c.env.PBKDF2_ITERATIONS);
    const [passphraseHash, pinHash] = await Promise.all([
      hashSecret(body.passphrase, iterations),
      hashSecret(body.pin, iterations),
    ]);
    const familyId = newId();
    const deviceId = newId();
    const deviceToken = randomToken();
    const tokenHash = await sha256Hex(deviceToken);

    // One transaction. The family insert is conditional, so two racing setups cannot both win: the
    // loser inserts nothing, and its dependent rows are gated on its own family row existing.
    const familyExists = sql`EXISTS (SELECT 1 FROM families WHERE id = ${familyId})`;
    const [familyInsert] = await batchSql(db, [
      sql`INSERT INTO families (id, name, created_at, setup_complete)
          SELECT ${familyId}, ${body.familyName}, ${now}, 1
          WHERE NOT EXISTS (SELECT 1 FROM families)`,
      sql`INSERT INTO parent_credentials (family_id, passphrase_hash, pin_hash, updated_at)
          SELECT ${familyId}, ${passphraseHash}, ${pinHash}, ${now} WHERE ${familyExists}`,
      sql`INSERT INTO devices (id, family_id, name, token_hash, created_at)
          SELECT ${deviceId}, ${familyId}, ${body.deviceName}, ${tokenHash}, ${now}
          WHERE ${familyExists}`,
    ]);
    if (familyInsert?.meta.changes !== 1) {
      throw new ApiError('setup_closed', 'This island is already set up.');
    }
    await startParentSession(c, db, familyId, PARENT_SESSION_MS);
    const res: SetupResponse = { familyId, deviceId, deviceToken };
    return c.json(res, 201);
  },
);

/** Passphrase → 12 h parent session. 5 attempts per 15 min per IP; a success clears the count. */
authRoutes.post(
  '/auth/login',
  requireJsonContentType,
  limitBody(4 * KB),
  jsonBody(loginRequestSchema),
  async (c) => {
    const db = c.get('db');
    const now = c.get('now');
    const body: LoginRequest = c.req.valid('json');
    const ip = clientIp(c);
    await hitRateLimit(db, LOGIN_LIMIT, ip, now);

    // One deployment = one family (08 §1).
    const [creds] = await db
      .select({ familyId: parentCredentials.familyId, hash: parentCredentials.passphraseHash })
      .from(parentCredentials)
      .limit(1);
    if (!creds || !(await verifySecret(body.passphrase, creds.hash))) {
      throw new ApiError('invalid_credentials', 'That passphrase is not right.');
    }
    await clearRateLimit(db, LOGIN_LIMIT, ip);
    await db.delete(parentSessions).where(lte(parentSessions.expiresAt, now));
    const expiresAt = await startParentSession(c, db, creds.familyId, PARENT_SESSION_MS);
    const res: ParentSessionResponse = { expiresAt };
    return c.json(res);
  },
);

/** Revokes the current parent session and clears the cookie. */
authRoutes.post(
  '/auth/logout',
  requireJsonContentType,
  limitBody(1 * KB),
  requireParent,
  async (c) => {
    const cookie = readParentCookie(c);
    if (cookie) {
      await c
        .get('db')
        .delete(parentSessions)
        .where(eq(parentSessions.idHash, await sha256Hex(cookie)));
    }
    clearParentCookie(c);
    const res: OkResponse = { ok: true };
    return c.json(res);
  },
);

/** In-app parent gate: device + PIN → 10 min parent session. 5 attempts per 15 min per device. */
authRoutes.post(
  '/auth/pin',
  requireJsonContentType,
  limitBody(1 * KB),
  requireDevice,
  jsonBody(pinRequestSchema),
  async (c) => {
    const db = c.get('db');
    const now = c.get('now');
    const familyId = c.get('familyId');
    const deviceId = c.get('deviceId');
    const body: PinRequest = c.req.valid('json');
    await hitRateLimit(db, PIN_LIMIT, deviceId, now);

    const [creds] = await db
      .select({ hash: parentCredentials.pinHash })
      .from(parentCredentials)
      .where(eq(parentCredentials.familyId, familyId))
      .limit(1);
    if (!creds || !(await verifySecret(body.pin, creds.hash))) {
      throw new ApiError('invalid_pin', 'That PIN is not right.');
    }
    await clearRateLimit(db, PIN_LIMIT, deviceId);
    const expiresAt = await startParentSession(c, db, familyId, PIN_SESSION_MS);
    const res: ParentSessionResponse = { expiresAt };
    return c.json(res);
  },
);
