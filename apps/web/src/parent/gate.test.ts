import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/boot/boot';
import { SERVER_DEVICE, SERVER_FAMILY, TOKEN, testDevice } from '@/app/boot/boot.test-support';
import { hashLocalSecret } from '@/app/localHash';
import { ApiError, type ParentApi } from './api';
import {
  createParentGate,
  type KeyValueStorage,
  LOCAL_PIN_ATTEMPTS,
  PARENT_GATE_IDLE_MS,
  PARENT_PIN_STORAGE_KEY,
} from './gate';

const open: AppServices[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.dispose();
});

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function fakeApi(pin: (token: string, pin: string) => Promise<{ expiresAt: number }>): ParentApi {
  const unused = () => Promise.reject(new Error('not used'));
  return {
    health: unused,
    setup: unused,
    pin: vi.fn(pin),
    logout: vi.fn(async () => {}),
    pairStart: unused,
    pairComplete: unused,
  };
}

/** Manual timers: `fire()` runs the pending callback. */
function manualTimers() {
  let pending: { fn: () => void; ms: number } | null = null;
  return {
    setTimer: (fn: () => void, ms: number) => {
      pending = { fn, ms };
      return 1;
    },
    clearTimer: () => {
      pending = null;
    },
    pending: () => pending,
    fire() {
      const p = pending;
      pending = null;
      p?.fn();
    },
  };
}

async function setup(opts: { paired?: boolean } = {}) {
  const device = testDevice();
  const app = await device.boot();
  open.push(app);
  if (opts.paired !== false) {
    await app.sync.adopt({ familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE, deviceToken: TOKEN });
  }
  return { app, clock: device.clock };
}

const fastHash = (s: string) => hashLocalSecret(s, 1000);

describe('parent gate', () => {
  it('opens with a PIN the server confirms, and remembers it for offline use', async () => {
    const { app } = await setup();
    const storage = memoryStorage();
    const api = fakeApi(async () => ({ expiresAt: 1 }));
    const gate = createParentGate({ store: app.store, api, storage, hash: fastHash });
    const changes: boolean[] = [];
    gate.subscribe(() => changes.push(gate.isUnlocked()));

    expect(gate.isUnlocked()).toBe(false);
    expect(await gate.verifyPin('2468')).toEqual({ ok: true, online: true });
    expect(api.pin).toHaveBeenCalledWith(TOKEN, '2468');
    expect(gate.isUnlocked()).toBe(true);
    expect(changes).toEqual([true]);
    expect(storage.data.get(PARENT_PIN_STORAGE_KEY)).toMatch(/^pbkdf2-sha256\$1000\$/);
    gate.dispose();
  });

  it('stays shut for a wrong PIN and drops a stale cached PIN', async () => {
    const { app } = await setup();
    const storage = memoryStorage();
    storage.setItem(PARENT_PIN_STORAGE_KEY, await fastHash('1111'));
    const api = fakeApi(async () => {
      throw new ApiError('invalid_pin', 401, 'That PIN is not right.');
    });
    const gate = createParentGate({ store: app.store, api, storage, hash: fastHash });
    expect(await gate.verifyPin('1111')).toEqual({ ok: false, reason: 'wrong' });
    expect(gate.isUnlocked()).toBe(false);
    expect(storage.data.has(PARENT_PIN_STORAGE_KEY)).toBe(false);
    gate.dispose();
  });

  it('passes on the server’s rate limit', async () => {
    const { app } = await setup();
    const api = fakeApi(async () => {
      throw new ApiError('rate_limited', 429, 'slow down', 600);
    });
    const gate = createParentGate({
      store: app.store,
      api,
      storage: memoryStorage(),
      hash: fastHash,
    });
    expect(await gate.verifyPin('2468')).toEqual({
      ok: false,
      reason: 'rate_limited',
      retryAfterSeconds: 600,
    });
    expect(gate.isUnlocked()).toBe(false);
    gate.dispose();
  });

  it('opens offline with the PIN this device last confirmed, and only that PIN', async () => {
    const { app } = await setup();
    const storage = memoryStorage();
    storage.setItem(PARENT_PIN_STORAGE_KEY, await fastHash('2468'));
    const api = fakeApi(async () => {
      throw new ApiError('network', 0, 'offline');
    });
    const gate = createParentGate({ store: app.store, api, storage, hash: fastHash });
    expect(await gate.verifyPin('1357')).toEqual({ ok: false, reason: 'wrong' });
    expect(gate.isUnlocked()).toBe(false);
    expect(await gate.verifyPin('2468')).toEqual({ ok: true, online: false });
    expect(gate.isUnlocked()).toBe(true);
    gate.dispose();
  });

  it('cannot open offline on a device that never had the PIN confirmed', async () => {
    const { app } = await setup();
    const api = fakeApi(async () => {
      throw new ApiError('network', 0, 'offline');
    });
    const gate = createParentGate({
      store: app.store,
      api,
      storage: memoryStorage(),
      hash: fastHash,
    });
    expect(await gate.verifyPin('2468')).toEqual({ ok: false, reason: 'unavailable' });
    expect(gate.isUnlocked()).toBe(false);
    gate.dispose();
  });

  it('limits offline guesses like the server does (5 per 15 minutes)', async () => {
    const { app, clock } = await setup({ paired: false });
    const storage = memoryStorage();
    storage.setItem(PARENT_PIN_STORAGE_KEY, await fastHash('2468'));
    const api = fakeApi(async () => ({ expiresAt: 1 }));
    const gate = createParentGate({
      store: app.store,
      api,
      storage,
      hash: fastHash,
      now: clock.now,
    });
    for (let i = 0; i < LOCAL_PIN_ATTEMPTS; i++) {
      expect(await gate.verifyPin(`000${i}`)).toEqual({ ok: false, reason: 'wrong' });
    }
    // Even the right PIN is refused until the window passes.
    expect(await gate.verifyPin('2468')).toMatchObject({ ok: false, reason: 'rate_limited' });
    expect(api.pin).not.toHaveBeenCalled(); // no device token: the server is never asked
    clock.advance(15 * 60_000);
    expect(await gate.verifyPin('2468')).toEqual({ ok: true, online: false });
    gate.dispose();
  });

  it('locks after 10 idle minutes; parent activity restarts the clock', async () => {
    const { app } = await setup();
    const timers = manualTimers();
    const gate = createParentGate({
      store: app.store,
      api: fakeApi(async () => ({ expiresAt: 1 })),
      storage: memoryStorage(),
      hash: fastHash,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });
    gate.unlock();
    expect(timers.pending()?.ms).toBe(PARENT_GATE_IDLE_MS);
    gate.touch();
    expect(timers.pending()?.ms).toBe(PARENT_GATE_IDLE_MS);
    timers.fire();
    expect(gate.isUnlocked()).toBe(false);
    // Activity while locked does nothing.
    gate.touch();
    expect(timers.pending()).toBeNull();
    gate.dispose();
  });
});
