// The in-app parent gate (06 §3): hold the gate button for 2 s, then enter the parent PIN. The
// gate session ends after 10 minutes without parent activity; it is separate from the 12 h
// passphrase cookie of parent devices (08 §3).
//
// The PIN is checked by the server (`POST /auth/pin`, which also grants the 10-minute parent
// session the parent routes need). After a server-confirmed PIN, a salted local hash of it is
// kept on the device, so the gate still opens when the server is unreachable (06 §8: everything
// but AI and sync works offline). The server's answer always wins over the cached hash.

import { hashLocalSecret, verifyLocalSecret } from '@/app/localHash';
import type { DataStore } from '@/data/store';
import { ApiError, type ParentApi } from './api';

export const PARENT_GATE_HOLD_MS = 2000;
export const PARENT_GATE_IDLE_MS = 10 * 60_000;
/** Offline (local) PIN attempts allowed per window, like the server's 5 per 15 min (08 §3). */
export const LOCAL_PIN_ATTEMPTS = 5;
export const LOCAL_PIN_WINDOW_MS = 15 * 60_000;
export const PARENT_PIN_STORAGE_KEY = 'number-island.parent-pin';

export type PinResult =
  | { ok: true; online: boolean }
  | { ok: false; reason: 'wrong' }
  | { ok: false; reason: 'rate_limited'; retryAfterSeconds: number | null }
  /** The server can't be reached and this device has never had the PIN confirmed. */
  | { ok: false; reason: 'unavailable' };

export interface ParentGate {
  isUnlocked(): boolean;
  /** Opens the gate (a verified PIN, or `/setup`, which signs the parent in). */
  unlock(): void;
  lock(): void;
  /** Parent activity: restarts the 10-minute idle timer while unlocked. */
  touch(): void;
  verifyPin(pin: string): Promise<PinResult>;
  /** Keeps a local hash of a PIN the parent just chose or the server confirmed. */
  rememberPin(pin: string): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ParentGateOptions {
  store: DataStore;
  api: ParentApi;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  storage?: KeyValueStorage | null;
  /** Tests pass a low iteration count. */
  hash?: (secret: string) => Promise<string>;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createParentGate(opts: ParentGateOptions): ParentGate {
  const now = opts.now ?? (() => Date.now());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const hash = opts.hash ?? ((s: string) => hashLocalSecret(s));
  const listeners = new Set<() => void>();
  let unlocked = false;
  let timer: unknown = null;
  let localFailures: number[] = [];

  const emit = () => {
    for (const l of listeners) l();
  };
  const arm = () => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      lock();
    }, PARENT_GATE_IDLE_MS);
  };
  function unlock() {
    arm();
    if (!unlocked) {
      unlocked = true;
      emit();
    }
  }
  function lock() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (unlocked) {
      unlocked = false;
      emit();
    }
  }

  async function rememberPin(pin: string) {
    if (!storage) return;
    try {
      storage.setItem(PARENT_PIN_STORAGE_KEY, await hash(pin));
    } catch {
      // Storage full or blocked: the gate then needs the server, which is still correct.
    }
  }

  async function verifyLocally(pin: string): Promise<PinResult> {
    const stored = storage?.getItem(PARENT_PIN_STORAGE_KEY) ?? null;
    if (!stored) return { ok: false, reason: 'unavailable' };
    const t = now();
    localFailures = localFailures.filter((f) => t - f < LOCAL_PIN_WINDOW_MS);
    if (localFailures.length >= LOCAL_PIN_ATTEMPTS) {
      const oldest = localFailures[0] as number;
      return {
        ok: false,
        reason: 'rate_limited',
        retryAfterSeconds: Math.ceil((oldest + LOCAL_PIN_WINDOW_MS - t) / 1000),
      };
    }
    if (await verifyLocalSecret(pin, stored)) {
      localFailures = [];
      unlock();
      return { ok: true, online: false };
    }
    localFailures.push(t);
    return { ok: false, reason: 'wrong' };
  }

  return {
    isUnlocked: () => unlocked,
    unlock,
    lock,
    touch() {
      if (unlocked) arm();
    },
    rememberPin,
    async verifyPin(pin) {
      const device = await opts.store.device();
      if (!device.deviceToken) return verifyLocally(pin);
      try {
        await opts.api.pin(device.deviceToken, pin);
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === 'invalid_pin') {
            // The server's PIN changed (or this guess is wrong): a stale cached hash must not open.
            storage?.removeItem(PARENT_PIN_STORAGE_KEY);
            return { ok: false, reason: 'wrong' };
          }
          if (e.code === 'rate_limited') {
            return { ok: false, reason: 'rate_limited', retryAfterSeconds: e.retryAfterSeconds };
          }
        }
        // Unreachable, revoked or failing server: fall back to the PIN this device last confirmed.
        return verifyLocally(pin);
      }
      await rememberPin(pin);
      unlock();
      return { ok: true, online: true };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      listeners.clear();
    },
  };
}
