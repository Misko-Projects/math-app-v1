// The in-app parent gate (06 §3): hold the gate button for 2 s, then enter the parent PIN. The
// gate session ends after 10 minutes without parent activity; it is separate from the 12 h
// passphrase cookie of parent devices (08 §3).
//
// The PIN is checked only by the server (`POST /auth/pin`, rate-limited, 08 §3), which also
// grants the 10-minute parent session the parent routes need. Nothing about the PIN is kept on
// the device: a cached hash of a 4–6 digit PIN could be guessed offline in seconds, and it would
// outlive a sign-out or a revocation. So the parent area needs the island server (and a paired
// device) to open; play itself stays fully offline (06 §8).

import type { DataStore } from '@/data/store';
import { ApiError, type ParentApi } from './api';

export const PARENT_GATE_HOLD_MS = 2000;
export const PARENT_GATE_IDLE_MS = 10 * 60_000;
/** `POST /auth/pin` grants a 10-minute parent session (08 §2). */
export const PARENT_PIN_SESSION_MS = 10 * 60_000;
const CLOCK_MARGIN_MS = 5_000;

export type PinResult =
  | { ok: true }
  | { ok: false; reason: 'wrong' }
  | { ok: false; reason: 'rate_limited'; retryAfterSeconds: number | null }
  /** The island server can't be reached (or failed). */
  | { ok: false; reason: 'unavailable' }
  /** This device holds no device token (never paired, signed out) or was removed. */
  | { ok: false; reason: 'not_paired' };

export interface ParentGate {
  isUnlocked(): boolean;
  /**
   * Opens the gate (a verified PIN, or `/setup`, which signs the parent in). `expiresAt` is the
   * server parent session's end: the gate closes then at the latest.
   */
  unlock(expiresAt?: number): void;
  lock(): void;
  /** Parent activity: restarts the 10-minute idle timer, never past `expiresAt`. */
  touch(): void;
  verifyPin(pin: string): Promise<PinResult>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export interface ParentGateOptions {
  store: DataStore;
  api: ParentApi;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

export function createParentGate(opts: ParentGateOptions): ParentGate {
  const now = opts.now ?? (() => Date.now());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const listeners = new Set<() => void>();
  let unlocked = false;
  let timer: unknown = null;

  /** The server parent session's end (ms epoch); activity never keeps the gate open past it. */
  let deadline: number | null = null;

  const emit = () => {
    for (const l of listeners) l();
  };
  const arm = () => {
    if (timer !== null) clearTimer(timer);
    const left = deadline === null ? PARENT_GATE_IDLE_MS : Math.max(0, deadline - now());
    timer = setTimer(
      () => {
        timer = null;
        lock();
      },
      Math.min(PARENT_GATE_IDLE_MS, left),
    );
  };
  function unlock(expiresAt?: number) {
    deadline = expiresAt ?? null;
    arm();
    if (!unlocked) {
      unlocked = true;
      emit();
    }
  }
  function lock() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    deadline = null;
    if (unlocked) {
      unlocked = false;
      emit();
    }
  }

  return {
    isUnlocked: () => unlocked,
    unlock,
    lock,
    touch() {
      if (unlocked) arm();
    },
    async verifyPin(pin) {
      const device = await opts.store.device();
      if (!device.deviceToken) return { ok: false, reason: 'not_paired' };
      const askedAt = now();
      try {
        await opts.api.pin(device.deviceToken, pin);
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === 'invalid_pin') return { ok: false, reason: 'wrong' };
          if (e.code === 'rate_limited') {
            return { ok: false, reason: 'rate_limited', retryAfterSeconds: e.retryAfterSeconds };
          }
          if (e.code === 'device_revoked' || e.code === 'unauthorized') {
            return { ok: false, reason: 'not_paired' };
          }
        }
        return { ok: false, reason: 'unavailable' };
      }
      // The server's PIN session lasts 10 minutes from when it answered (08 §2). Its `expiresAt` is
      // on the server's clock, which a tablet's may not match, so the deadline is measured on this
      // device's clock from when the request was sent: never later than the server's.
      unlock(askedAt + PARENT_PIN_SESSION_MS - CLOCK_MARGIN_MS);
      return { ok: true };
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
