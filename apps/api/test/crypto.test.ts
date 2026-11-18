import { describe, expect, it } from 'vitest';
import {
  base64UrlDecode,
  base64UrlEncode,
  clampIterations,
  hashSecret,
  PBKDF2_MAX_ITERATIONS,
  randomPairCode,
  randomToken,
  verifySecret,
} from '../src/lib/crypto';

describe('PBKDF2 secret hashing (08 §3)', () => {
  it('hashes and verifies at the 100k production default inside workerd', async () => {
    const hash = await hashSecret('correct horse battery', 100_000);
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(await verifySecret('correct horse battery', hash)).toBe(true);
    expect(await verifySecret('correct horse batterz', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([hashSecret('1234', 1000), hashSecret('1234', 1000)]);
    expect(a).not.toBe(b);
    expect(await verifySecret('1234', a)).toBe(true);
    expect(await verifySecret('1234', b)).toBe(true);
  });

  it('caps iterations at 100k, the workerd limit', () => {
    expect(PBKDF2_MAX_ITERATIONS).toBe(100_000);
    expect(clampIterations('250000')).toBe(100_000);
    expect(clampIterations('5000')).toBe(5000);
    expect(clampIterations('0')).toBe(100_000);
    expect(clampIterations('nope')).toBe(100_000);
    expect(clampIterations(undefined)).toBe(100_000);
  });

  it('never verifies malformed or over-cap stored hashes', async () => {
    expect(await verifySecret('x', '')).toBe(false);
    expect(await verifySecret('x', 'bcrypt$10$abc$def')).toBe(false);
    expect(await verifySecret('x', 'pbkdf2-sha256$200000$AAAA$AAAA')).toBe(false);
    expect(await verifySecret('x', 'pbkdf2-sha256$1000$AAAA$AAAA')).toBe(false); // short hash
    expect(await verifySecret('x', 'pbkdf2-sha256$1000$!!$!!')).toBe(false);
  });
});

describe('random values', () => {
  it('device tokens are 32 bytes of base64url (43 chars)', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(base64UrlDecode(token)).toHaveLength(32);
    expect(randomToken()).not.toBe(token);
  });

  it('base64url round-trips', () => {
    const bytes = new Uint8Array([0, 255, 62, 63, 128, 1]);
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
  });

  it('pair codes are 6 digits, leading zeros kept', () => {
    for (let i = 0; i < 200; i++) expect(randomPairCode()).toMatch(/^\d{6}$/);
  });
});
