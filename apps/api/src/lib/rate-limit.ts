import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { rateLimits } from '../db/schema';
import { sha256Hex } from './crypto';
import { ApiError } from './errors';

// Fixed-window rate limits kept in D1 (08 §2, §3), so they hold across Worker isolates.

export interface RateLimitRule {
  bucket: string;
  limit: number;
  windowMs: number;
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** 08 §2: 5 login attempts per 15 min per IP. */
export const LOGIN_LIMIT: RateLimitRule = { bucket: 'login', limit: 5, windowMs: FIFTEEN_MINUTES };
/** 08 §3: the parent PIN is rate-limited; 5 attempts per 15 min per device. */
export const PIN_LIMIT: RateLimitRule = { bucket: 'pin', limit: 5, windowMs: FIFTEEN_MINUTES };
/** Pair-code guessing per IP, on top of each code's own 5-try cap (08 §2). */
export const PAIR_LIMIT: RateLimitRule = { bucket: 'pair', limit: 10, windowMs: FIFTEEN_MINUTES };
/** Setup hashes two secrets; keep a stray client from burning CPU before a family exists. */
export const SETUP_LIMIT: RateLimitRule = { bucket: 'setup', limit: 10, windowMs: FIFTEEN_MINUTES };

/**
 * Counts one attempt for `subject` and throws 429 `rate_limited` (with `Retry-After`) once the
 * window's count exceeds the limit. The subject is hashed, so IPs are never stored.
 */
export async function hitRateLimit(
  db: Db,
  rule: RateLimitRule,
  subject: string,
  now: number,
): Promise<void> {
  const key = await sha256Hex(`${rule.bucket}:${subject}`);
  const expired = now - rule.windowMs;
  const [row] = await db
    .insert(rateLimits)
    .values({ bucket: rule.bucket, key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.key],
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStart} <= ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${rateLimits.windowStart} <= ${expired} THEN ${now} ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
  if (row && row.count > rule.limit) {
    const retryAfter = Math.max(1, Math.ceil((row.windowStart + rule.windowMs - now) / 1000));
    throw new ApiError('rate_limited', 'Too many attempts. Try again later.', {
      'Retry-After': String(retryAfter),
    });
  }
}

/** Clears a subject's window after a success (a correct passphrase or PIN). */
export async function clearRateLimit(db: Db, rule: RateLimitRule, subject: string): Promise<void> {
  const key = await sha256Hex(`${rule.bucket}:${subject}`);
  await db
    .delete(rateLimits)
    .where(and(eq(rateLimits.bucket, rule.bucket), eq(rateLimits.key, key)));
}
