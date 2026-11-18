import { DEVICE_TOKEN_PATTERN } from '@number-island/shared';
import { and, eq, gt } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { devices, parentSessions } from '../db/schema';
import type { AppBindings } from '../env';
import { sha256Hex } from '../lib/crypto';
import { ApiError } from '../lib/errors';
import { readParentCookie } from './session';

/** Parent routes (08 §2 "parent"): a live parent session cookie. Sets `familyId`. */
export const requireParent: MiddlewareHandler<AppBindings> = async (c, next) => {
  const cookie = readParentCookie(c);
  if (!cookie) throw new ApiError('unauthorized', 'Parent sign-in required.');
  const db = c.get('db');
  const [session] = await db
    .select({ familyId: parentSessions.familyId })
    .from(parentSessions)
    .where(
      and(
        eq(parentSessions.idHash, await sha256Hex(cookie)),
        gt(parentSessions.expiresAt, c.get('now')),
      ),
    )
    .limit(1);
  if (!session) throw new ApiError('unauthorized', 'Parent sign-in required.');
  c.set('familyId', session.familyId);
  await next();
};

/**
 * Device routes (08 §2 "device"): `Authorization: Bearer <deviceToken>` of a paired, unrevoked
 * device. Sets `familyId` and `deviceId`, and records `last_seen_at`.
 */
export const requireDevice: MiddlewareHandler<AppBindings> = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/i.exec(header.trim());
  const token = match?.[1];
  if (!token || !DEVICE_TOKEN_PATTERN.test(token)) {
    throw new ApiError('unauthorized', 'Device token required.');
  }
  const db = c.get('db');
  const [device] = await db
    .select({ id: devices.id, familyId: devices.familyId, revokedAt: devices.revokedAt })
    .from(devices)
    .where(eq(devices.tokenHash, await sha256Hex(token)))
    .limit(1);
  if (!device) throw new ApiError('unauthorized', 'Unknown device.');
  if (device.revokedAt !== null) throw new ApiError('device_revoked', 'This device was removed.');
  await db
    .update(devices)
    .set({ lastSeenAt: c.get('now') })
    .where(eq(devices.id, device.id));
  c.set('familyId', device.familyId);
  c.set('deviceId', device.id);
  await next();
};
