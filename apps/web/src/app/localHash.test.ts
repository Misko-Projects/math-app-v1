import { describe, expect, it } from 'vitest';
import { CHILD_G2, CHILD_K } from '@/data/store.test-support';
import {
  constantTimeEqual,
  fromBase64Url,
  hashLocalSecret,
  LOCAL_HASH_ITERATIONS,
  toBase64Url,
  verifyLocalSecret,
} from './localHash';
import {
  checkPicturePassword,
  hashPicturePassword,
  isCompletePassword,
  picturePasswordSecret,
} from './picker/picturePassword';

describe('localHash', () => {
  it('round-trips: the same secret verifies, in the documented format', async () => {
    const stored = await hashLocalSecret('shell,boat,sun', { iterations: 1000 });
    expect(stored).toMatch(/^pbkdf2-sha256\$1000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(await verifyLocalSecret('shell,boat,sun', stored)).toBe(true);
  });

  it('rejects a wrong secret', async () => {
    const stored = await hashLocalSecret('shell,boat,sun', { iterations: 1000 });
    expect(await verifyLocalSecret('shell,sun,boat', stored)).toBe(false);
    expect(await verifyLocalSecret('', stored)).toBe(false);
  });

  it('salts every hash (16 random bytes) and defaults to 50 000 iterations', async () => {
    const a = await hashLocalSecret('same');
    const b = await hashLocalSecret('same');
    expect(a).not.toBe(b);
    expect(a.split('$')[1]).toBe(String(LOCAL_HASH_ITERATIONS));
    expect(fromBase64Url(a.split('$')[2] as string)?.length).toBe(16);
    expect(await verifyLocalSecret('same', b)).toBe(true);
  });

  it('is deterministic for a given salt', async () => {
    const salt = new Uint8Array(16).fill(7);
    expect(await hashLocalSecret('x', { iterations: 10, salt })).toBe(
      await hashLocalSecret('x', { iterations: 10, salt }),
    );
  });

  it('never matches (or throws on) a malformed stored hash', async () => {
    for (const bad of [
      '',
      'nope',
      'sha1$1000$AAAA$AAAA',
      'pbkdf2-sha256$0$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
      'pbkdf2-sha256$abc$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
      'pbkdf2-sha256$99999999$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
      'pbkdf2-sha256$1000$!!$AAAA',
      'pbkdf2-sha256$1000$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
    ]) {
      expect(await verifyLocalSecret('x', bad)).toBe(false);
    }
  });

  it('base64url and the constant-time compare', () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    expect(toBase64Url(bytes)).not.toMatch(/[+/=]/);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1]))).toBe(false);
  });
});

describe('picture passwords', () => {
  it('are exactly three different known pictures', () => {
    expect(isCompletePassword(['shell', 'boat', 'sun'])).toBe(true);
    expect(isCompletePassword(['shell', 'boat'])).toBe(false);
    expect(isCompletePassword(['shell', 'shell', 'sun'])).toBe(false);
    expect(isCompletePassword(['shell', 'boat', 'moon'])).toBe(false);
    expect(() => picturePasswordSecret(CHILD_K, ['shell', 'shell', 'sun'])).toThrow();
  });

  it('check the order, and are bound to the child', async () => {
    const stored = await hashPicturePassword(CHILD_K, ['crab', 'kite', 'sun'], {
      iterations: 1000,
    });
    expect(await checkPicturePassword(CHILD_K, ['crab', 'kite', 'sun'], stored)).toBe(true);
    expect(await checkPicturePassword(CHILD_K.toUpperCase(), ['crab', 'kite', 'sun'], stored)).toBe(
      true,
    );
    expect(await checkPicturePassword(CHILD_K, ['kite', 'crab', 'sun'], stored)).toBe(false);
    expect(await checkPicturePassword(CHILD_G2, ['crab', 'kite', 'sun'], stored)).toBe(false);
    expect(await checkPicturePassword(CHILD_K, ['crab', 'kite'], stored)).toBe(false);
  });
});
