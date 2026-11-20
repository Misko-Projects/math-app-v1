import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataStore } from '@/data/store';
import { CHILD_K, profile, testEnv } from '@/data/store.test-support';
import { type CheckpointStorage, LIVE_CHECKPOINT_MS, SessionController } from './SessionController';
import { FOLLOW_UP_SWEEP_MS, SessionProvider } from './SessionProvider';

const stores: DataStore[] = [];
const controllers: SessionController[] = [];
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const c of controllers.splice(0)) c.dispose();
  for (const s of stores.splice(0)) s.close();
});

describe('<SessionProvider>', () => {
  it('closes a session that died just before boot once its checkpoint goes quiet, with no visit or start', async () => {
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
    const make = () => {
      const c = new SessionController({ store, storage, locks: null });
      controllers.push(c);
      return c;
    };
    // A tab starts a session and dies; the app reopens seconds later.
    const dead = make();
    expect(await dead.start(CHILD_K)).toMatchObject({ ok: true });
    dead.dispose();
    env.clock.advance(5_000);
    const ends = async () => (await store.events()).filter((e) => e.type === 'session.ended');

    // Only the provider's follow-up timer is faked; IndexedDB keeps its real scheduling.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const booted = make();
    const sweep = vi.spyOn(booted, 'closeAbandoned');
    const view = render(
      <SessionProvider controller={booted}>
        <p>picker</p>
      </SessionProvider>,
    );
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(await sweep.mock.results[0]?.value).toBe(0); // its checkpoint is still fresh
    expect(await ends()).toEqual([]);

    // The child stays on the picker. Just before the checkpoint goes quiet nothing runs yet.
    env.clock.advance(LIVE_CHECKPOINT_MS);
    vi.advanceTimersByTime(FOLLOW_UP_SWEEP_MS - 1);
    expect(sweep).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(await sweep.mock.results[1]?.value).toBe(1);
    expect((await ends()).map((e) => e.payload)).toEqual([
      expect.objectContaining({ reason: 'abandoned' }),
    ]);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops the follow-up sweep when it unmounts first', async () => {
    const env = testEnv();
    const store = await env.open();
    stores.push(store);
    const c = new SessionController({ store, storage: null, locks: null });
    controllers.push(c);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const sweep = vi.spyOn(c, 'closeAbandoned');
    const view = render(
      <SessionProvider controller={c}>
        <p>picker</p>
      </SessionProvider>,
    );
    view.unmount();
    vi.advanceTimersByTime(FOLLOW_UP_SWEEP_MS * 2);
    expect(sweep).toHaveBeenCalledTimes(1);
    await sweep.mock.results[0]?.value;
  });
});
