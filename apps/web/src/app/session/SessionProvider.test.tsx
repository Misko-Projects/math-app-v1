import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataStore } from '@/data/store';
import { CHILD_K, profile, testEnv } from '@/data/store.test-support';
import {
  type CheckpointStorage,
  LIVE_CHECKPOINT_MS,
  SessionController,
  type SessionLocks,
  type SessionStore,
  type SessionTimers,
} from './SessionController';
import { FOLLOW_UP_SWEEP_MS, SessionProvider } from './SessionProvider';

const stores: DataStore[] = [];
const controllers: SessionController[] = [];
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const c of controllers.splice(0)) c.dispose();
  for (const s of stores.splice(0)) s.close();
});

/** A device where a tab started a session and died; the app reopens five seconds later. */
async function deadSession() {
  const env = testEnv();
  const store = await env.open();
  stores.push(store);
  await store.putProfile(profile(CHILD_K, 'K', 'Mia'));
  const map = new Map<string, string>();
  const storage: CheckpointStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  const make = (
    tabStore: SessionStore = store,
    timers?: SessionTimers,
    locks: SessionLocks | null = null,
  ) => {
    // Real time follows the test clock (no clock correction happens here).
    const c = new SessionController({
      store: tabStore,
      now: () => env.clock.now(),
      storage,
      locks,
      monotonic: () => env.clock.now(),
      ...(timers ? { timers } : {}),
    });
    controllers.push(c);
    return c;
  };
  const dead = make();
  expect(await dead.start(CHILD_K)).toMatchObject({ ok: true });
  dead.dispose();
  env.clock.advance(5_000);
  const ends = async () => (await store.events()).filter((e) => e.type === 'session.ended');
  /** Real time passes: the clock moves and the provider's timers with it. */
  const pass = (ms: number) => {
    env.clock.advance(ms);
    vi.advanceTimersByTime(ms);
  };
  return { env, store, make, ends, pass };
}

/** Lets a finished sweep's result reach the provider (its next timer is set in a microtask). */
const settle = async (sweep: { mock: { results: Array<{ value: unknown }> } }) => {
  await Promise.all(sweep.mock.results.map((r) => r.value));
  await Promise.resolve();
};

describe('<SessionProvider>', () => {
  it('closes a session that died just before boot once its checkpoint goes quiet, with no visit or start', async () => {
    const s = await deadSession();
    // Only the provider's timer is faked; IndexedDB keeps its real scheduling.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const booted = s.make();
    const sweep = vi.spyOn(booted, 'sweep');
    const view = render(
      <SessionProvider controller={booted}>
        <p>picker</p>
      </SessionProvider>,
    );
    expect(sweep).toHaveBeenCalledTimes(1);
    // Its checkpoint is still fresh: left open, to be looked at again.
    expect(await sweep.mock.results[0]?.value).toEqual({ closed: 0, watching: 1, skipped: false });
    await settle(sweep);
    expect(await s.ends()).toEqual([]);

    // The child stays on the picker. Just before the checkpoint goes quiet nothing runs yet.
    s.pass(FOLLOW_UP_SWEEP_MS - 1);
    expect(sweep).toHaveBeenCalledTimes(1);
    s.pass(1);
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(await sweep.mock.results[1]?.value).toEqual({ closed: 1, watching: 0, skipped: false });
    await settle(sweep);
    expect((await s.ends()).map((e) => e.payload)).toEqual([
      expect.objectContaining({ reason: 'abandoned' }),
    ]);
    // Nothing is left to watch: no further sweep is scheduled.
    expect(vi.getTimerCount()).toBe(0);
    view.unmount();
  });

  it('still closes it when the boot sweep’s log read is slow: the next sweep is timed from the end of that one', async () => {
    const s = await deadSession();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // The first read of the log takes two seconds; later reads are prompt.
    let release: () => void = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    let reads = 0;
    const slow: SessionStore = {
      now: () => s.store.now(),
      device: () => s.store.device(),
      familySettings: () => s.store.familySettings(),
      childSettings: (id) => s.store.childSettings(id),
      append: ((...args: Parameters<DataStore['append']>) =>
        s.store.append(...args)) as DataStore['append'],
      events: async () => {
        reads += 1;
        if (reads === 1) await held;
        return s.store.events();
      },
    };
    const booted = s.make(slow);
    const sweep = vi.spyOn(booted, 'sweep');
    render(
      <SessionProvider controller={booted}>
        <p>picker</p>
      </SessionProvider>,
    );
    await vi.waitFor(() => expect(reads).toBe(1));
    s.pass(2_000);
    release();
    expect(await sweep.mock.results[0]?.value).toEqual({ closed: 0, watching: 1, skipped: false });
    await settle(sweep);
    // 121 s after mount the session has been watched for 119 s only: nothing may run out here.
    s.pass(FOLLOW_UP_SWEEP_MS - 2_000);
    expect(sweep).toHaveBeenCalledTimes(1);
    s.pass(2_000);
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(await sweep.mock.results[1]?.value).toEqual({ closed: 1, watching: 0, skipped: false });
    expect(await s.ends()).toHaveLength(1);
  });

  it('tries again after a sweep skipped because another tab held the play lock, and closes what that tab left', async () => {
    const env = testEnv();
    const store = await env.open();
    stores.push(store);
    await store.putProfile(profile(CHILD_K, 'K', 'Mia'));
    const map = new Map<string, string>();
    const storage: CheckpointStorage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
    // Web Locks shared by the two tabs.
    const held = new Set<string>();
    const locks: SessionLocks = {
      acquire(name) {
        if (held.has(name)) return Promise.resolve(null);
        held.add(name);
        return Promise.resolve(() => void held.delete(name));
      },
    };
    const make = () => {
      const c = new SessionController({
        store,
        storage,
        locks,
        monotonic: () => env.clock.now(),
        timers: { setInterval: () => 0, clearInterval: () => {} },
      });
      controllers.push(c);
      return c;
    };
    const tabA = make();
    expect(await tabA.start(CHILD_K)).toMatchObject({ ok: true }); // tab A plays, holding the lock
    expect(held.size).toBe(1);
    const ends = async () => (await store.events()).filter((e) => e.type === 'session.ended');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const booted = make(); // tab B opens the picker
    const sweep = vi.spyOn(booted, 'sweep');
    render(
      <SessionProvider controller={booted}>
        <p>picker</p>
      </SessionProvider>,
    );
    // Skipped, not done: nothing was looked at.
    expect(await sweep.mock.results[0]?.value).toEqual({ closed: 0, watching: 0, skipped: true });
    await settle(sweep);
    expect(vi.getTimerCount()).toBe(1);

    // Tab A crashes seconds later: its lock goes, and no end is written. Tab B stays put.
    env.clock.advance(5_000);
    vi.advanceTimersByTime(5_000);
    held.clear();
    env.clock.advance(FOLLOW_UP_SWEEP_MS - 5_000);
    vi.advanceTimersByTime(FOLLOW_UP_SWEEP_MS - 5_000);
    expect(sweep).toHaveBeenCalledTimes(2);
    await settle(sweep);
    // If that sweep left it to watch (its checkpoint looked fresh), the next one closes it.
    env.clock.advance(FOLLOW_UP_SWEEP_MS);
    vi.advanceTimersByTime(FOLLOW_UP_SWEEP_MS);
    await settle(sweep);
    expect((await ends()).map((e) => e.payload)).toEqual([
      expect.objectContaining({ reason: 'abandoned' }),
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tries again after a sweep that failed', async () => {
    const s = await deadSession();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let reads = 0;
    const flaky: SessionStore = {
      now: () => s.store.now(),
      device: () => s.store.device(),
      familySettings: () => s.store.familySettings(),
      childSettings: (id) => s.store.childSettings(id),
      append: ((...args: Parameters<DataStore['append']>) =>
        s.store.append(...args)) as DataStore['append'],
      events: () => {
        reads += 1;
        return reads === 1 ? Promise.reject(new Error('read failed')) : s.store.events();
      },
    };
    const booted = s.make(flaky);
    const sweep = vi.spyOn(booted, 'sweep');
    render(
      <SessionProvider controller={booted}>
        <p>picker</p>
      </SessionProvider>,
    );
    await expect(sweep.mock.results[0]?.value).rejects.toThrow('read failed');
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    s.pass(FOLLOW_UP_SWEEP_MS);
    expect(sweep).toHaveBeenCalledTimes(2);
    // The dead session's checkpoint is old by now, and this is the first look at it: closed.
    expect(await sweep.mock.results[1]?.value).toEqual({ closed: 1, watching: 0, skipped: false });
  });

  it('keeps sweeping while a session stays live in another tab, and stops when it unmounts', async () => {
    const s = await deadSession();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Another tab (no Web Locks here) plays on, saving a checkpoint every 15 s.
    const ticks: Array<() => void> = [];
    const other = s.make(s.store, {
      setInterval: (fn) => ticks.push(fn),
      clearInterval: () => void ticks.splice(0),
    });
    expect(await other.start(CHILD_K)).toMatchObject({ ok: true });
    /** One second of real time, the other tab's 1 s tick included. */
    const second = () => {
      s.pass(1_000);
      for (const tick of ticks) tick();
    };
    const booted = s.make();
    const sweep = vi.spyOn(booted, 'sweep');
    const view = render(
      <SessionProvider controller={booted}>
        <p>picker</p>
      </SessionProvider>,
    );
    await settle(sweep);
    for (let round = 2; round <= 3; round += 1) {
      for (let t = 0; t < FOLLOW_UP_SWEEP_MS; t += 1_000) second();
      expect(sweep).toHaveBeenCalledTimes(round);
      await settle(sweep);
    }
    // The dead session was closed along the way; the live one never.
    expect((await s.ends()).map((e) => e.payload)).toEqual([
      expect.objectContaining({ reason: 'abandoned' }),
    ]);
    expect(other.getSnapshot().status).toBe('active');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    view.unmount();
    for (let t = 0; t < 2 * FOLLOW_UP_SWEEP_MS; t += 1_000) second();
    expect(sweep).toHaveBeenCalledTimes(3);
    expect(LIVE_CHECKPOINT_MS).toBeLessThan(FOLLOW_UP_SWEEP_MS);
  });
});
