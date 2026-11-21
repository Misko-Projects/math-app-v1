// Salted local hashes (08 §3): the picture password is a local convenience lock kept on the
// device (ChildProfile.picturePasswordHash), not a security boundary. Nine pictures, three in
// order with no repeats, give only 504 sequences, so no iteration count could make the hash
// strong; the salt and PBKDF2 only keep the stored value from reading as the answer at a glance.
//
// Format: `pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>`, a 16-byte random salt and a
// 32-byte derived key, computed with WebCrypto (no dependency).
//
// Iterations: 50 000, chosen for responsiveness. PBKDF2-SHA-256 at 50k runs in roughly 20–60 ms
// on a mid-range Android tablet, so checking a child's pictures never feels slow. The count is
// stored in each hash, so it can change later without breaking stored hashes.

export const LOCAL_HASH_ITERATIONS = 50_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const PREFIX = 'pbkdf2-sha256';
/** Refuse absurd counts read from a stored hash (a corrupt document must not hang the picker). */
const MAX_ITERATIONS = 2_000_000;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto is unavailable (a secure context is needed)');
  return s;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function derive(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const s = subtle();
  const key = await s.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await s.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Hashes `secret` with a fresh random salt (tests may pass a salt). */
export async function hashLocalSecret(
  secret: string,
  opts: { iterations?: number; salt?: Uint8Array } = {},
): Promise<string> {
  const iterations = opts.iterations ?? LOCAL_HASH_ITERATIONS;
  const salt = opts.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(secret, salt, iterations);
  return `${PREFIX}$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/** Equal-length byte compare that looks at every byte whatever the first difference. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/** True when `secret` matches `stored`. A malformed stored hash never matches (and never throws). */
export async function verifyLocalSecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return false;
  const salt = fromBase64Url(parts[2] as string);
  const expected = fromBase64Url(parts[3] as string);
  if (!salt || salt.length === 0 || !expected || expected.length !== KEY_BITS / 8) return false;
  const actual = await derive(secret, salt, iterations);
  return constantTimeEqual(actual, expected);
}
