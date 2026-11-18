// 03 §5.3 RNG: xoshiro128** seeded through splitmix32, using 32-bit integer operations only, so
// every JS engine produces the same stream. `fork(label)` derives an independent stream by mixing an
// FNV-1a hash of the label into the state. That keeps streams stable when code adds draws elsewhere.
// This is the only source of randomness in the engine (02 §7: no Math.random).

export interface Rng {
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [0, 1). */
  float(): number;
  /** True with probability p. */
  bool(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
  weighted<T>(xs: readonly T[], ws: readonly number[]): T;
  /** A shuffled copy (Fisher–Yates). The input is not modified. */
  shuffle<T>(xs: readonly T[]): T[];
  /** An independent stream derived from this one and `label`. Does not advance this stream. */
  fork(label: string): Rng;
}

/** FNV-1a 32-bit over the UTF-8 bytes of `text`. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  const mix = (byte: number) => {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  // UTF-8 encode by hand (no TextEncoder: the engine targets plain ES2023).
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) mix(cp);
    else if (cp < 0x800) {
      mix(0xc0 | (cp >> 6));
      mix(0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      mix(0xe0 | (cp >> 12));
      mix(0x80 | ((cp >> 6) & 0x3f));
      mix(0x80 | (cp & 0x3f));
    } else {
      mix(0xf0 | (cp >> 18));
      mix(0x80 | ((cp >> 12) & 0x3f));
      mix(0x80 | ((cp >> 6) & 0x3f));
      mix(0x80 | (cp & 0x3f));
    }
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;
const TWO_32 = 0x100000000;

class Xoshiro128 implements Rng {
  private readonly s: Uint32Array;

  constructor(state: Uint32Array) {
    this.s = state;
    // An all-zero state is xoshiro's one fixed point. Seeding never produces it in practice, but
    // guard anyway so a stream can never get stuck.
    if (
      ((state[0] as number) |
        (state[1] as number) |
        (state[2] as number) |
        (state[3] as number)) ===
      0
    ) {
      this.s[0] = 1;
    }
  }

  private next(): number {
    const s = this.s;
    const s0 = s[0] as number;
    const s1 = s[1] as number;
    const s2 = s[2] as number;
    const s3 = s[3] as number;
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    const n2 = (s2 ^ s0) >>> 0;
    const n3 = (s3 ^ s1) >>> 0;
    s[0] = s0 ^ n3;
    s[1] = s1 ^ n2;
    s[2] = n2 ^ t;
    s[3] = rotl(n3, 11);
    return result;
  }

  int(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
      throw new RangeError(`rng.int: bad range [${min}, ${max}]`);
    }
    const span = max - min + 1;
    if (span > TWO_32) throw new RangeError('rng.int: range wider than 2^32');
    if (span === TWO_32) return min + this.next();
    // Rejection sampling removes modulo bias and stays integer-only.
    const limit = TWO_32 - (TWO_32 % span);
    let x = this.next();
    while (x >= limit) x = this.next();
    return min + (x % span);
  }

  float(): number {
    return this.next() / TWO_32;
  }

  bool(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.float() < p;
  }

  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new RangeError('rng.pick: empty list');
    return xs[this.int(0, xs.length - 1)] as T;
  }

  weighted<T>(xs: readonly T[], ws: readonly number[]): T {
    if (xs.length === 0 || xs.length !== ws.length) {
      throw new RangeError(
        'rng.weighted: values and weights must be non-empty and the same length',
      );
    }
    const total = ws.reduce((a, b) => a + b, 0);
    if (!(total > 0)) throw new RangeError('rng.weighted: weights must sum to more than 0');
    let x = this.float() * total;
    for (let i = 0; i < xs.length; i += 1) {
      x -= ws[i] as number;
      if (x < 0) return xs[i] as T;
    }
    return xs[xs.length - 1] as T;
  }

  shuffle<T>(xs: readonly T[]): T[] {
    const out = xs.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  fork(label: string): Rng {
    const h = fnv1a32(label);
    const s = this.s;
    const mix = splitmix32(((s[0] as number) ^ h ^ rotl(s[2] as number, 13)) | 0);
    const st = new Uint32Array(4);
    st[0] = mix() ^ (s[1] as number);
    st[1] = mix() ^ (s[3] as number);
    st[2] = mix() ^ h;
    st[3] = mix() ^ (s[0] as number);
    return new Xoshiro128(st);
  }
}

/** A fresh stream for an integer seed. Seeds are reduced to 32 bits. */
export function createRng(seed: number): Rng {
  if (!Number.isFinite(seed)) throw new RangeError(`createRng: seed must be finite, got ${seed}`);
  const sm = splitmix32(Math.trunc(seed) | 0);
  const st = new Uint32Array(4);
  for (let i = 0; i < 4; i += 1) st[i] = sm();
  return new Xoshiro128(st);
}
