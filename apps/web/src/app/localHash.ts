// Salted local hashes for convenience locks that live on the device (08 §3): the picture password
// (`ChildProfile.picturePasswordHash`) and the cached parent PIN that lets the parent gate open
// offline. PBKDF2-SHA-256 through WebCrypto, in the server's self-describing format
// (`pbkdf2-sha256$<iterations>$<salt>$<hash>`, base64url). These are not security boundaries:
// the parent passphrase and the server-side PIN check are.

export const LOCAL_HASH_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function fromB64url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function derive(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashLocalSecret(
  secret: string,
  iterations: number = LOCAL_HASH_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_BYTES)));
  const hash = await derive(secret, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(hash)}`;
}

/** Constant-time comparison of a secret with a stored hash. A malformed hash never matches. */
export async function verifyLocalSecret(secret: string, stored: string): Promise<boolean> {
  const [scheme, iter, saltText, hashText] = stored.split('$');
  const iterations = Number(iter);
  if (scheme !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 1) return false;
  const salt = saltText ? fromB64url(saltText) : null;
  const expected = hashText ? fromB64url(hashText) : null;
  if (!salt || !expected || expected.length * 8 !== HASH_BITS) return false;
  const actual = await derive(secret, salt, iterations);
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= (actual[i] as number) ^ (expected[i] as number);
  return diff === 0;
}
