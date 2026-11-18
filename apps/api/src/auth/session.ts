import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Db } from '../db/client';
import { parentSessions } from '../db/schema';
import type { AppBindings } from '../env';
import { randomToken, sha256Hex } from '../lib/crypto';
import { requestIsHttps } from '../lib/http';

// Parent sessions (08 §2, §3): an opaque random cookie whose SHA-256 is stored in D1.

export const PARENT_COOKIE = 'ni_parent';
/** Passphrase login: 12 h (`Max-Age=43200`, 08 §2). */
export const PARENT_SESSION_MS = 12 * 60 * 60 * 1000;
/** PIN gate: a short-lived parent session (10 min, 08 §2). */
export const PIN_SESSION_MS = 10 * 60 * 1000;
const COOKIE_PATH = '/api';

/** Creates a session row and sets the cookie. Returns its expiry (ms epoch). */
export async function startParentSession(
  c: Context<AppBindings>,
  db: Db,
  familyId: string,
  lifetimeMs: number,
): Promise<number> {
  const now = c.get('now');
  const id = randomToken();
  const expiresAt = now + lifetimeMs;
  await db
    .insert(parentSessions)
    .values({ idHash: await sha256Hex(id), familyId, expiresAt, createdAt: now });
  setParentCookie(c, id, lifetimeMs);
  return expiresAt;
}

/** `HttpOnly; SameSite=Strict; Max-Age`, plus `Secure` iff the request arrived over HTTPS. */
export function setParentCookie(c: Context<AppBindings>, value: string, lifetimeMs: number): void {
  setCookie(c, PARENT_COOKIE, value, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: requestIsHttps(c),
    path: COOKIE_PATH,
    maxAge: Math.floor(lifetimeMs / 1000),
  });
}

export function clearParentCookie(c: Context<AppBindings>): void {
  deleteCookie(c, PARENT_COOKIE, {
    path: COOKIE_PATH,
    httpOnly: true,
    sameSite: 'Strict',
    secure: requestIsHttps(c),
  });
}

export function readParentCookie(c: Context<AppBindings>): string | undefined {
  return getCookie(c, PARENT_COOKIE);
}
