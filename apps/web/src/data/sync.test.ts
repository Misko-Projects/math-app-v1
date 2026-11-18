import { type SyncRequest, type SyncResponse, syncRequestSchema } from '@number-island/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataStore } from './store';
import { DEVICE, FAMILY, testEnv } from './store.test-support';
import {
  backoffDelay,
  createSyncClient,
  SYNC_BACKOFF_BASE_MS,
  SYNC_BACKOFF_MAX_MS,
  SYNC_INTERVAL_MS,
  type SyncClientOptions,
  withServerTime,
} from './sync';

// Unit tests for the sync client's own logic against a scripted server. The end-to-end behaviour
// against the real API Worker is in apps/web/sync-test (Workers pool).

const TOKEN = 'a'.repeat(43);

type Handler = (body: SyncRequest) => Partial<SyncResponse> | Response | Promise<never>;

/** A fake `/api/sync`: records requests; each call answers with the next handler (or the last). */
function fakeServer(...handlers: Handler[]) {
  const requests: { body: SyncRequest; headers: Headers }[] = [];
  const fetch: NonNullable<SyncClientOptions['fetch']> = async (_url, init) => {
    const body = syncRequestSchema.parse(JSON.parse(String(init.body)));
    requests.push({ body, headers: new Headers(init.headers) });
    const handler = handlers[Math.min(requests.length - 1, handlers.length - 1)];
    const out = await (handler ?? (() => ({})))(body);
    if (out instanceof Response) return out;
    const res: SyncResponse = {
      accepted: body.events.map((e) => e.id),
      rejected: [],
      clamped: [],
      events: [],
      cursor: String(requests.length),
      more: false,
      settings: [],
      profiles: [],
      ...out,
    };
    return new Response(JSON.stringify(res), { status: 200 });
  };
  return { fetch, requests };
}

async function pairedStore(): Promise<{ store: DataStore; env: ReturnType<typeof testEnv> }> {
  const env = testEnv();
  const store = await env.open();
  await store.adoptFamily({ familyId: FAMILY, deviceId: DEVICE, deviceToken: TOKEN });
  return { store, env };
}

/** Manual timers: `fire()` runs the pending callback. */
function manualTimers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    setTimer: (fn: () => void, ms: number) => {
      const h = next++;
      pending.set(h, { fn, ms });
      return h;
    },
    clearTimer: (h: unknown) => {
      pending.delete(h as number);
    },
    delays: () => [...pending.values()].map((p) => p.ms),
    fire() {
      const [h, p] = [...pending.entries()][0] ?? [];
      if (h === undefined || !p) throw new Error('no timer pending');
      pending.delete(h);
      p.fn();
    },
  };
}

const stores: DataStore[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
});

describe('sync client: one sync', () => {
  it('does nothing before setup or pairing, and nothing while offline', async () => {
    const env = testEnv();
    const store = await env.open();
    stores.push(store);
    const server = fakeServer();
    expect(await createSyncClient({ store, fetch: server.fetch }).syncNow()).toEqual({
      kind: 'unpaired',
    });
    await store.adoptFamily({ familyId: FAMILY, deviceId: DEVICE, deviceToken: TOKEN });
    const offline = createSyncClient({ store, fetch: server.fetch, online: () => false });
    expect(await offline.syncNow()).toEqual({ kind: 'offline' });
    expect(server.requests).toHaveLength(0);
  });

  it('pushes the queue with the device token, settings and profiles, and marks it synced', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    await store.append('road.extended', { to: 3 }, { childId: null });
    await store.putSettings({ key: 'family', value: await store.familySettings() });
    const server = fakeServer();
    const outcome = await createSyncClient({ store, fetch: server.fetch }).syncNow();
    expect(outcome).toEqual({ kind: 'synced', pushed: 1, pulled: 0, rounds: 1 });
    const [req] = server.requests;
    expect(req?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(req?.headers.get('content-type')).toBe('application/json');
    expect(req?.body.cursor).toBeNull();
    expect(req?.body.events.map((e) => e.type)).toEqual(['road.extended']);
    expect(req?.body.settings.map((s) => s.key)).toEqual(['family']);
    expect(await store.unsynced()).toEqual([]);
    const state = await store.syncState();
    expect(state.cursor).toBe('1');
    expect(state.lastError).toBeNull();
    expect(state.lastSyncAt).not.toBeNull();
  });

  it('loops until the push queue and the pull are drained, carrying the cursor', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    for (let i = 0; i < 501; i++) await store.append('road.extended', { to: i }, { childId: null });
    const server = fakeServer(
      () => ({ more: true }),
      () => ({}),
      () => ({}),
    );
    const outcome = await createSyncClient({ store, fetch: server.fetch }).syncNow();
    expect(outcome).toMatchObject({ kind: 'synced', pushed: 501, rounds: 2 });
    expect(server.requests.map((r) => r.body.events.length)).toEqual([500, 1]);
    expect(server.requests.map((r) => r.body.cursor)).toEqual([null, '1']);
  });

  it("applies the clamp echo: the local copy takes the server's ts and clientTs", async () => {
    const { store, env } = await pairedStore();
    stores.push(store);
    const early = await store.append('island.named', { name: 'Early' }, { childId: null });
    env.clock.advance(48 * 3600_000); // the device clock jumps two days ahead
    const late = await store.append('island.named', { name: 'Late' }, { childId: null });
    expect((await store.island()).name).toBe('Late');
    // The server clamps the late event to a receive time before the early one's ts.
    const server = fakeServer(() => ({
      clamped: [{ id: late.id, ts: early.ts - 1, clientTs: late.ts }],
    }));
    await createSyncClient({ store, fetch: server.fetch }).syncNow();
    const stored = (await store.events()).find((e) => e.id === late.id);
    expect(stored).toEqual({ ...late, ts: early.ts - 1, clientTs: late.ts });
    expect((await store.island()).name).toBe('Early'); // folds follow the server-bounded ts
    expect(await store.unsynced()).toEqual([]);
  });

  it('stops re-pushing rejected events and ingests pulled events and documents', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    const bad = await store.append('road.extended', { to: 1 }, { childId: null });
    const pulled = { ...bad, id: '019b0000-7000-7000-8000-0000000000ff', payload: { to: 9 } };
    const server = fakeServer(() => ({
      accepted: [],
      rejected: [{ id: null, index: 0, code: 'validation_failed', message: 'nope' }],
      events: [pulled],
    }));
    const client = createSyncClient({ store, fetch: server.fetch });
    await client.syncNow();
    expect(await store.unsynced()).toEqual([]);
    expect((await store.island()).roadLength).toBe(9);
    await client.syncNow();
    expect(server.requests[1]?.body.events).toEqual([]); // never pushed again
  });

  it('reports a revoked device, an HTTP error and a malformed answer without throwing', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    await store.append('road.extended', { to: 1 }, { childId: null });
    const errorBody = (code: string, status: number) =>
      new Response(JSON.stringify({ error: { code, message: code } }), { status });
    const revoked = fakeServer(() => errorBody('device_revoked', 401));
    expect(await createSyncClient({ store, fetch: revoked.fetch }).syncNow()).toEqual({
      kind: 'revoked',
      code: 'device_revoked',
    });
    const broken = fakeServer(() => errorBody('internal', 500));
    expect(await createSyncClient({ store, fetch: broken.fetch }).syncNow()).toEqual({
      kind: 'failed',
      error: 'HTTP 500 internal',
    });
    expect((await store.syncState()).lastError).toBe('manual: HTTP 500 internal');
    const garbage = fakeServer(() => new Response('{"accepted":"x"}', { status: 200 }));
    expect((await createSyncClient({ store, fetch: garbage.fetch }).syncNow()).kind).toBe('failed');
    const down: SyncClientOptions['fetch'] = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await createSyncClient({ store, fetch: down }).syncNow()).toEqual({
      kind: 'failed',
      error: 'network: Failed to fetch',
    });
    expect(await store.unsynced()).toHaveLength(1); // the queue is intact
  });

  it('coalesces triggers that arrive mid-sync into one follow-up run', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    const server = fakeServer(async () => {
      calls += 1;
      if (calls === 1) await gate;
      return {} as never;
    });
    const client = createSyncClient({ store, fetch: server.fetch });
    const first = client.syncNow();
    const second = client.syncNow();
    const third = client.syncNow();
    release();
    const outcomes = await Promise.all([first, second, third]);
    expect(server.requests).toHaveLength(2); // the two waiting calls shared one follow-up run
    expect(outcomes[1]).toEqual(outcomes[2]);
  });
});

describe('sync client: triggers and backoff (08 §4)', () => {
  it('syncs on start, after a completed request, on wind-down and every 60 s', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    const timers = manualTimers();
    const server = fakeServer();
    const client = createSyncClient({ store, fetch: server.fetch, ...timers });
    client.start();
    await settle();
    expect(server.requests).toHaveLength(1);
    expect(timers.delays()).toEqual([SYNC_INTERVAL_MS]);

    await store.append('request.completed', requestCompleted(), { childId: null });
    await settle();
    expect(server.requests).toHaveLength(2);
    await store.append('road.extended', { to: 2 }, { childId: null }); // not a trigger
    await settle();
    expect(server.requests).toHaveLength(2);
    await store.append('session.ended', sessionEnded(), { childId: null });
    await settle();
    expect(server.requests).toHaveLength(3);

    timers.fire(); // the 60 s tick
    await settle();
    expect(server.requests).toHaveLength(4);

    client.stop();
    expect(timers.delays()).toEqual([]);
    await store.append('request.completed', requestCompleted(), { childId: null });
    await settle();
    expect(server.requests).toHaveLength(4);
  });

  it('syncs when the browser comes back online and when the page is hidden', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    const server = fakeServer();
    const client = createSyncClient({ store, fetch: server.fetch, ...manualTimers() });
    client.start();
    await settle();
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(server.requests).toHaveLength(2);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(server.requests).toHaveLength(3);
    client.stop();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('backs off after failures and returns to the interval after a success', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    const timers = manualTimers();
    let ok = false;
    const server = fakeServer(() =>
      ok ? {} : new Response('{"error":{"code":"internal","message":"x"}}', { status: 500 }),
    );
    const client = createSyncClient({ store, fetch: server.fetch, random: () => 0.5, ...timers });
    client.start();
    await settle();
    expect(timers.delays()).toEqual([SYNC_BACKOFF_BASE_MS]);
    timers.fire();
    await settle();
    expect(timers.delays()).toEqual([2 * SYNC_BACKOFF_BASE_MS]);
    ok = true;
    timers.fire();
    await settle();
    expect(timers.delays()).toEqual([SYNC_INTERVAL_MS]);
    client.stop();
  });

  it('caps the backoff at five minutes, with jitter', () => {
    expect(backoffDelay(1, () => 0.5)).toBe(SYNC_BACKOFF_BASE_MS);
    expect(backoffDelay(3, () => 0.5)).toBe(4 * SYNC_BACKOFF_BASE_MS);
    expect(backoffDelay(30, () => 0.5)).toBe(SYNC_BACKOFF_MAX_MS);
    expect(backoffDelay(1, () => 0)).toBe(0.8 * SYNC_BACKOFF_BASE_MS);
    expect(backoffDelay(1, () => 1)).toBe(1.2 * SYNC_BACKOFF_BASE_MS);
  });

  it('withServerTime drops a local clientTs the server does not have', () => {
    const e = {
      id: '019b0000-7000-7000-8000-000000000001',
      familyId: FAMILY,
      childId: null,
      deviceId: DEVICE,
      ts: 5,
      clientTs: 3,
      type: 'road.extended' as const,
      v: 1 as const,
      payload: { to: 1 },
      contentVersion: 'c',
    };
    expect(withServerTime(e, { ts: 7 })).toEqual({ ...e, ts: 7, clientTs: undefined });
    expect('clientTs' in withServerTime(e, { ts: 7 })).toBe(false);
  });
});

describe('sync client: review round 1 regressions', () => {
  const okBody = (body: SyncRequest): SyncResponse => ({
    accepted: body.events.map((e) => e.id),
    rejected: [],
    clamped: [],
    events: [],
    cursor: '1',
    more: false,
    settings: [],
    profiles: [],
  });
  const respond = (init: RequestInit, status = 200) =>
    new Response(
      JSON.stringify(
        status === 200
          ? okBody(JSON.parse(String(init.body)) as SyncRequest)
          : { error: { code: 'internal', message: 'x' } },
      ),
      { status },
    );

  it('R1-1. a stalled request or response body fails at the deadline and keeps the queue', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    await store.append('road.extended', { to: 1 }, { childId: null });
    const timers = manualTimers();
    let mode: 'stall-request' | 'stall-body' | 'ok' = 'stall-request';
    const fetch: SyncClientOptions['fetch'] = async (_url, init) => {
      if (mode === 'stall-request') return new Promise<Response>(() => undefined);
      if (mode === 'stall-body') {
        return { ok: true, status: 200, json: () => new Promise(() => undefined) } as Response;
      }
      return respond(init);
    };
    const client = createSyncClient({ store, fetch, ...timers, requestTimeoutMs: 1000 });
    for (const stall of ['stall-request', 'stall-body'] as const) {
      mode = stall;
      const pending = client.syncNow();
      await settle();
      expect(timers.delays()).toEqual([1000]); // the exchange deadline
      timers.fire();
      expect(await pending).toEqual({ kind: 'failed', error: 'timeout after 1000 ms' });
      expect(await store.unsynced()).toHaveLength(1);
    }
    mode = 'ok';
    expect((await client.syncNow()).kind).toBe('synced');
    expect(await store.unsynced()).toEqual([]);
  });

  it('R1-2. automatic triggers wait out the backoff window; the retry timer syncs', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    const timers = manualTimers();
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    const fetch: SyncClientOptions['fetch'] = async (_url, init) => {
      calls += 1;
      if (calls === 1) {
        await held;
        return respond(init, 500);
      }
      return respond(init);
    };
    const client = createSyncClient({ store, fetch, random: () => 0.5, ...timers });
    client.start();
    await settle();
    await store.append('request.completed', requestCompleted(), { childId: null }); // queued
    await settle();
    release();
    await settle();
    expect(calls).toBe(1); // the queued follow-up waits for the retry timer
    await store.append('session.ended', sessionEnded(), { childId: null });
    await settle();
    expect(calls).toBe(1); // so does a trigger after the failure settled
    timers.fire(); // the retry timer
    await settle();
    expect(calls).toBe(2);
    expect(await store.unsynced()).toEqual([]);
    client.stop();
  });

  it('R1-3. a follow-up queued before stop() never sends; a restart syncs normally', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    const fetch: SyncClientOptions['fetch'] = async (_url, init) => {
      calls += 1;
      if (calls === 1) await held;
      return respond(init);
    };
    const client = createSyncClient({ store, fetch, ...manualTimers() });
    client.start();
    await settle();
    await store.append('request.completed', requestCompleted(), { childId: null }); // queued
    await settle();
    client.stop();
    release();
    await settle();
    expect(calls).toBe(1);
    client.start();
    await settle();
    expect(calls).toBe(2);
    client.stop();
  });
});

describe('sync client: review round 2 regressions', () => {
  const okOrFail =
    (fail: () => boolean): SyncClientOptions['fetch'] =>
    async (_url, init) => {
      if (fail()) {
        return new Response(JSON.stringify({ error: { code: 'internal', message: 'x' } }), {
          status: 500,
        });
      }
      const body = JSON.parse(String(init.body)) as SyncRequest;
      const res: SyncResponse = {
        accepted: body.events.map((e) => e.id),
        rejected: [],
        clamped: [],
        events: [],
        cursor: '1',
        more: false,
        settings: [],
        profiles: [],
      };
      return new Response(JSON.stringify(res), { status: 200 });
    };

  it('R2-1. restarting inside the backoff window still arms the retry timer', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    const timers = manualTimers();
    let calls = 0;
    let fail = true;
    const inner = okOrFail(() => fail);
    const fetch: SyncClientOptions['fetch'] = (u, i) => {
      calls += 1;
      return inner?.(u, i) ?? Promise.reject(new Error('no fetch'));
    };
    const client = createSyncClient({ store, fetch, random: () => 0.5, ...timers });
    client.start();
    await settle();
    expect(calls).toBe(1);
    client.stop();
    expect(timers.delays()).toEqual([]);
    client.start(); // inside the window: deferred, but the retry timer is armed again
    await settle();
    expect(calls).toBe(1);
    expect(timers.delays()).toHaveLength(1);
    fail = false;
    timers.fire();
    await settle();
    expect(calls).toBe(2);
    expect(timers.delays()).toEqual([SYNC_INTERVAL_MS]);
    client.stop();
  });

  it('R2-2. a manual or online request queued behind an automatic one is still forced', async () => {
    for (const forced of ['manual', 'online'] as const) {
      const { store } = await pairedStore();
      stores.push(store);
      let release: () => void = () => undefined;
      const held = new Promise<void>((r) => {
        release = r;
      });
      let calls = 0;
      const inner = okOrFail(() => calls === 1);
      const fetch: SyncClientOptions['fetch'] = async (u, i) => {
        calls += 1;
        if (calls === 1) await held;
        return (await inner?.(u, i)) as Response;
      };
      const client = createSyncClient({ store, fetch, ...manualTimers() });
      client.start();
      await settle();
      await store.append('request.completed', requestCompleted(), { childId: null }); // queued
      await settle();
      if (forced === 'manual') void client.syncNow();
      else window.dispatchEvent(new Event('online'));
      release(); // the first request fails, opening a backoff window
      await settle();
      expect(calls).toBe(2); // the forced request ran anyway, serving the queued one too
      client.stop();
    }
  });

  it('R2-3. no stale retry fires during a manual run; a newer failure backs off again', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    const timers = manualTimers();
    let calls = 0;
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const inner = okOrFail(() => true);
    const fetch: SyncClientOptions['fetch'] = async (u, i) => {
      calls += 1;
      if (calls === 2) await held; // the manual run stays in flight
      return (await inner?.(u, i)) as Response;
    };
    // A long exchange deadline, so the only short timer is the retry under test.
    const client = createSyncClient({
      store,
      fetch,
      random: () => 0.5,
      requestTimeoutMs: 600_000,
      ...timers,
    });
    client.start();
    await settle();
    expect(timers.delays()).toEqual([SYNC_BACKOFF_BASE_MS]); // the first retry
    const manual = client.syncNow(); // a manual run inside the window
    await settle();
    // While it is in flight, the old retry timer must not be pending (only the exchange deadline).
    expect(timers.delays()).toEqual([600_000]);
    release(); // the manual run fails too
    await manual;
    await settle();
    expect(calls).toBe(2); // no stale retry ran after it
    expect(timers.delays()).toEqual([2 * SYNC_BACKOFF_BASE_MS]); // only the newer window remains
    await store.append('request.completed', requestCompleted(), { childId: null });
    await settle();
    expect(calls).toBe(2); // deferred inside the newer window
    client.stop();
  });
});

describe('sync client: review round 3 regressions', () => {
  const failing = (): SyncClientOptions['fetch'] => async () =>
    new Response(JSON.stringify({ error: { code: 'internal', message: 'x' } }), { status: 500 });

  it('R3-1. an automatic request made while stopped stays stopped across a quick restart', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    const fail = failing();
    const fetch: SyncClientOptions['fetch'] = async (u, i) => {
      calls += 1;
      if (calls === 1) await held;
      return (await fail?.(u, i)) as Response;
    };
    const client = createSyncClient({ store, fetch, random: () => 0.5, ...manualTimers() });
    client.start();
    await settle();
    client.stop();
    const online = client.syncNow('online'); // made while stopped
    client.start(); // restarted before the held sync returns
    release(); // ... which fails, opening a backoff window
    expect(await online).toEqual({ kind: 'stopped' });
    await settle();
    expect(calls).toBe(1); // nothing forced a request into the new window
    client.stop();
  });

  it('R3-2. a deferral keeps the armed retry timer when the clock jumps back', async () => {
    const { store } = await pairedStore();
    stores.push(store);
    const timers = manualTimers();
    let clock = Date.UTC(2026, 10, 20);
    const client = createSyncClient({
      store,
      fetch: failing(),
      now: () => clock,
      random: () => 0.5,
      ...timers,
    });
    client.start();
    await settle();
    expect(timers.delays()).toEqual([SYNC_BACKOFF_BASE_MS]); // retry in 5 s
    clock -= 48 * 3600_000; // the device clock was 48 h fast and gets corrected
    await store.append('request.completed', requestCompleted(), { childId: null }); // deferred
    await settle();
    expect(timers.delays()).toEqual([SYNC_BACKOFF_BASE_MS]); // the same 5 s retry, not 48 h
    client.stop();
  });
});

/** Lets queued promise chains (and IndexedDB work) run. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

function requestCompleted() {
  return {
    sessionId: 's-1',
    requestId: 'req-1',
    workshopId: 'bakery',
    items: 5,
    firstTryCorrect: 4,
    endedEarly: false,
  };
}

function sessionEnded() {
  return {
    sessionId: 's-1',
    reason: 'wind-down' as const,
    activeMs: 600_000,
    mathMs: 500_000,
    items: 12,
  };
}
