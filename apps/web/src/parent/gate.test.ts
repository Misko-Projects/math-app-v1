import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/boot/boot';
import { SERVER_DEVICE, SERVER_FAMILY, TOKEN, testDevice } from '@/app/boot/boot.test-support';
import { ApiError, type ParentApi } from './api';
import { createParentGate, PARENT_GATE_IDLE_MS } from './gate';

const open: AppServices[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.dispose();
  localStorage.clear();
});

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

const failWith = (code: ApiError['code'], status: number, retry: number | null = null) =>
  fakeApi(async () => {
    throw new ApiError(code, status, code, retry);
  });

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
  return app;
}

describe('parent gate', () => {
  it('opens only with a PIN the server confirms, and keeps nothing about it on the device', async () => {
    const app = await setup();
    const api = fakeApi(async () => ({ expiresAt: 1 }));
    const gate = createParentGate({ store: app.store, api });
    const changes: boolean[] = [];
    gate.subscribe(() => changes.push(gate.isUnlocked()));

    expect(gate.isUnlocked()).toBe(false);
    expect(await gate.verifyPin('2468')).toEqual({ ok: true });
    expect(api.pin).toHaveBeenCalledWith(TOKEN, '2468');
    expect(gate.isUnlocked()).toBe(true);
    expect(changes).toEqual([true]);
    // No PIN, hash or counter is persisted (08 §3: the server checks and rate-limits the PIN).
    expect(localStorage.length).toBe(0);
    expect(JSON.stringify(await app.store.device())).not.toContain('2468');
    gate.dispose();
  });

  it.each([
    ['a wrong PIN', failWith('invalid_pin', 401), { ok: false, reason: 'wrong' }],
    [
      'the server’s rate limit',
      failWith('rate_limited', 429, 600),
      { ok: false, reason: 'rate_limited', retryAfterSeconds: 600 },
    ],
    ['an unreachable server', failWith('network', 0), { ok: false, reason: 'unavailable' }],
    ['a server error', failWith('internal', 500), { ok: false, reason: 'unavailable' }],
    ['a removed device', failWith('device_revoked', 401), { ok: false, reason: 'not_paired' }],
  ])('stays shut for %s', async (_name, api, result) => {
    const app = await setup();
    const gate = createParentGate({ store: app.store, api });
    expect(await gate.verifyPin('2468')).toEqual(result);
    expect(gate.isUnlocked()).toBe(false);
    gate.dispose();
  });

  it('stays shut on a device with no family token, without asking the server', async () => {
    const app = await setup({ paired: false });
    const api = fakeApi(async () => ({ expiresAt: 1 }));
    const gate = createParentGate({ store: app.store, api });
    expect(await gate.verifyPin('2468')).toEqual({ ok: false, reason: 'not_paired' });
    expect(api.pin).not.toHaveBeenCalled();
    expect(gate.isUnlocked()).toBe(false);
    gate.dispose();
  });

  it('locks after 10 idle minutes; parent activity restarts the clock', async () => {
    const app = await setup();
    const timers = manualTimers();
    const gate = createParentGate({
      store: app.store,
      api: fakeApi(async () => ({ expiresAt: 1 })),
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
