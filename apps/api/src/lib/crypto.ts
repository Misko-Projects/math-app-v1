// WebCrypto helpers (08 §3). Self-contained, with no imports, so the local seed script
// (scripts/db-seed.ts, run by Node) hashes secrets exactly as the Worker verifies them.

/** workerd caps PBKDF2 at 100,000 iterations (08 §3). */
export const PBKDF2_MAX_ITERATIONS = 100_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BYTES = 32;
const HASH_PREFIX = 'pbkdf2-sha256';

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Uint8Array {
  const b64 = text.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** 32 random bytes, base64url without padding: device tokens and session ids (43 chars). */
export function randomToken(): string {
  return base64UrlEncode(randomBytes(32));
}

/** Uniform random integer in [0, max) by rejection sampling. */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new RangeError('bad max');
  const limit = 2 ** 32 - (2 ** 32 % max);
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] as number;
    if (v < limit) return v % max;
  }
}

/** A 6-digit pairing code, uniformly distributed (leading zeros kept). */
export function randomPairCode(): string {
  return randomInt(1_000_000).toString().padStart(6, '0');
}

/** Hex SHA-256 of a UTF-8 string. For high-entropy tokens and lookup keys, not passwords. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/** Constant-time comparison of equal-length byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/** Clamps a configured iteration count into [1, 100,000]; invalid values use the maximum. */
export function clampIterations(configured: string | number | undefined): number {
  const n = typeof configured === 'number' ? configured : Number.parseInt(configured ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return PBKDF2_MAX_ITERATIONS;
  return Math.min(Math.floor(n), PBKDF2_MAX_ITERATIONS);
}

async function pbkdf2(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    PBKDF2_HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/**
 * PBKDF2-SHA-256 with a random 16-byte salt (08 §3). Self-describing format, so the iteration
 * count can change later without invalidating stored hashes:
 * `pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>`.
 */
export async function hashSecret(secret: string, iterations: number): Promise<string> {
  const iters = clampIterations(iterations);
  const salt = randomBytes(PBKDF2_SALT_BYTES);
  const hash = await pbkdf2(secret, salt, iters);
  return `${HASH_PREFIX}$${iters}$${base64UrlEncode(salt)}$${base64UrlEncode(hash)}`;
}

/** Verifies a secret against `hashSecret` output. Malformed stored hashes never verify. */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== HASH_PREFIX) return false;
  const iters = Number.parseInt(parts[1] as string, 10);
  if (!Number.isInteger(iters) || iters < 1 || iters > PBKDF2_MAX_ITERATIONS) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64UrlDecode(parts[2] as string);
    expected = base64UrlDecode(parts[3] as string);
  } catch {
    return false;
  }
  if (expected.length !== PBKDF2_HASH_BYTES) return false;
  return timingSafeEqual(await pbkdf2(secret, salt, iters), expected);
}
