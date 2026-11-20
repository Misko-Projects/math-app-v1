import {
  type AnyEventEnvelope,
  type ChildSettings,
  defaultChildSettings,
  defaultFamilySettings,
  type EventPayloads,
  settingsKey,
} from '@number-island/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataStore } from '@/data/store';
import {
  CHILD_G2,
  CHILD_K,
  FAMILY,
  fixtureContent,
  profile,
  testEnv,
} from '@/data/store.test-support';
import {
  CHECKPOINT_PREFIX,
  type CheckpointStorage,
  LIVE_CHECKPOINT_MS,
  NO_CHECKPOINT_MS,
  type PageVisibility,
  SessionController,
  type SessionLocks,
  type SessionStore,
  type SessionTimers,
  type WindDownReason,
} from './SessionController';
import { inQuietHours, localTime, playedMsOnDay } from './time';

const MIN = 60_000;
// testClock starts at 2026-11-18 15:00 UTC = 09:00 in Chicago (the test stores' family zone).
const T0 = Date.UTC(2026, 10, 18, 15);

function fakeTimers() {
  const handlers = new Map<number, () => void>();
  let next = 1;
  const timers: SessionTimers = {
    setInterval(fn) {
      handlers.set(next, fn);
      return next++;
    },
    clearInterval(h) {
      handlers.delete(h as number);
    },
  };
  const tick = () => {
    for (const fn of [...handlers.values()]) fn();
  };
  return { timers, tick, handlers };
}

function fakeVisibility() {
  let visible = true;
  const listeners = new Set<() => void>();
  const visibility: PageVisibility = {
    visible: () => visible,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return {
    visibility,
    set(v: boolean) {
      visible = v;
      for (const l of listeners) l();
    },
    listeners,
  };
}

/** Web Locks shared by the controllers of one test, like tabs of one browser profile. */
function fakeLocks() {
  const held = new Set<string>();
  const waiters = new Map<string, Array<() => void>>();
  const take = (name: string) => {
    held.add(name);
    return () => {
      held.delete(name);
      waiters.get(name)?.shift()?.();
    };
  };
  const locks: SessionLocks = {
    acquire(name, waitMs) {
      if (!held.has(name)) return Promise.resolve(take(name));
      if (waitMs === 0) return Promise.resolve(null);
      return new Promise((resolve) => {
        const queue = waiters.get(name) ?? [];
        waiters.set(name, queue);
        const grant = () => {
          clearTimeout(timer);
          resolve(take(name));
        };
        const timer = setTimeout(() => {
          queue.splice(queue.indexOf(grant), 1);
          resolve(null);
        }, waitMs);
        queue.push(grant);
      });
    },
  };
  return { locks, held };
}

/** A gate a test opens later: `wait()` resolves at once while open. */
function gate() {
  let open = true;
  let release: () => void = () => {};
  let waiting = Promise.resolve();
  return {
    close() {
      open = false;
      waiting = new Promise<void>((r) => {
        release = r;
      });
    },
    open() {
      open = true;
      release();
    },
    wait: () => (open ? Promise.resolve() : waiting),
  };
}

/** The store as one tab sees it, with its log reads or writes held at a gate. */
function gatedStore(
  store: DataStore,
  reads = gate(),
  writes = gate(),
): SessionStore & {
  reads: ReturnType<typeof gate>;
  writes: ReturnType<typeof gate>;
} {
  return {
    reads,
    writes,
    now: () => store.now(),
    device: () => store.device(),
    familySettings: () => store.familySettings(),
    childSettings: (id) => store.childSettings(id),
    events: async () => {
      await reads.wait();
      return store.events();
    },
    append: (async (type, payload, meta) => {
      await writes.wait();
      return store.append(type, payload, meta);
    }) as DataStore['append'],
  };
}

function memoryStorage(): CheckpointStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const stores: DataStore[] = [];
const controllers: SessionController[] = [];
afterEach(() => {
  for (const c of controllers.splice(0)) c.dispose();
  for (const s of stores.splice(0)) s.close();
});

async function setup(
  opts: {
    child?: Partial<ChildSettings>;
    timezone?: string;
    /** Shared by every controller of the test (tabs of one browser). Default: working locks; null: none. */
    locks?: SessionLocks | null;
  } = {},
) {
  const locks = opts.locks === undefined ? fakeLocks().locks : opts.locks;
  const env = testEnv();
  const store = await env.open();
  stores.push(store);
  await store.putProfile(profile(CHILD_K, 'K', 'Mia'));
  await store.putProfile(profile(CHILD_G2, '2', 'Leo'));
  await store.putSettings({
    key: 'family',
    value: defaultFamilySettings(opts.timezone ?? 'America/Chicago'),
  });
  if (opts.child) {
    await store.putSettings({
      key: settingsKey(CHILD_K),
      value: { ...defaultChildSettings('K'), ...opts.child },
    });
  }
  const timers = fakeTimers();
  const vis = fakeVisibility();
  const storage = memoryStorage();
  let corrected = 0;
  const make = (
    o: {
      store?: SessionStore;
      locks?: SessionLocks | null;
      storage?: CheckpointStorage;
      /** How long a start waits for the play lock. Default: a moment, so refusals stay quick. */
      startLockWaitMs?: number;
    } = {},
  ) => {
    const c = new SessionController({
      store: o.store ?? store,
      startLockWaitMs: o.startLockWaitMs ?? 20,
      // Real time: the test clock without the corrections made to it.
      monotonic: () => env.clock.now() - corrected,
      timers: timers.timers,
      visibility: vis.visibility,
      storage: o.storage ?? storage,
      locks: o.locks === undefined ? locks : o.locks,
    });
    controllers.push(c);
    return c;
  };
  const controller = make();
  const windDowns: WindDownReason[] = [];
  controller.onWindDown((r) => windDowns.push(r));
  /** Moves the clock and lets the controller's 1 s tick run. */
  const advance = (ms: number) => {
    env.clock.advance(ms);
    timers.tick();
  };
  /** The device clock is set forward or back by `ms`: the wall clock moves, real time doesn't. */
  const correctClock = (ms: number) => {
    env.clock.advance(ms);
    corrected += ms;
  };
  const sessionEvents = async () =>
    (await store.events()).filter((e) => e.type.startsWith('session.'));
  return {
    env,
    store,
    controller,
    make,
    timers,
    vis,
    storage,
    windDowns,
    advance,
    correctClock,
    sessionEvents,
  };
}

/** A whole session that ended at `endTs` with `activeMs`, appended by the store at that time. */
async function playedSession(
  s: Awaited<ReturnType<typeof setup>>,
  endTs: number,
  activeMs: number,
  childId = CHILD_K,
) {
  const at = s.env.clock.now();
  s.env.clock.set(endTs);
  await s.store.append(
    'session.ended',
    { sessionId: `old-${endTs}`, reason: 'child-exit', activeMs, mathMs: 0, items: 0 },
    { childId },
  );
  s.env.clock.set(at);
}

describe('local time and quiet hours', () => {
  it('reads the local day and minute in a time zone', () => {
    expect(localTime(T0, 'America/Chicago')).toEqual({ day: '2026-11-18', minute: 9 * 60 });
    expect(localTime(T0, 'Asia/Tokyo')).toEqual({ day: '2026-11-19', minute: 0 });
    expect(localTime(Date.UTC(2026, 10, 18, 3), 'America/Chicago').day).toBe('2026-11-17');
  });

  it('handles same-day ranges, ranges across midnight, and empty ranges', () => {
    const at = (h: number, m = 0) => Date.UTC(2026, 10, 18, h + 6, m); // Chicago = UTC-6
    const tz = 'America/Chicago';
    const day = { start: '12:00', end: '14:30' };
    expect(inQuietHours(at(11, 59), day, tz)).toBe(false);
    expect(inQuietHours(at(12), day, tz)).toBe(true);
    expect(inQuietHours(at(14, 29), day, tz)).toBe(true);
    expect(inQuietHours(at(14, 30), day, tz)).toBe(false);
    const night = { start: '20:00', end: '07:00' };
    expect(inQuietHours(at(19, 59), night, tz)).toBe(false);
    expect(inQuietHours(at(20), night, tz)).toBe(true);
    expect(inQuietHours(at(23, 59), night, tz)).toBe(true);
    expect(inQuietHours(at(0), night, tz)).toBe(true); // 00:00
    expect(inQuietHours(at(6, 59), night, tz)).toBe(true);
    expect(inQuietHours(at(7), night, tz)).toBe(false);
    expect(inQuietHours(at(9), { start: '08:00', end: '08:00' }, tz)).toBe(false);
    expect(inQuietHours(at(9), null, tz)).toBe(false);
  });

  const ended = (ts: number, childId: string, activeMs: number, sessionId: string) =>
    ({
      type: 'session.ended',
      ts,
      childId,
      payload: { sessionId, reason: 'wind-down', activeMs, mathMs: 0, items: 0 },
    }) as unknown as AnyEventEnvelope;
  const started = (ts: number, childId: string, sessionId: string) =>
    ({
      type: 'session.started',
      ts,
      childId,
      payload: { sessionId, budgetMinutes: 10, trigger: 'child' },
    }) as unknown as AnyEventEnvelope;

  it('counts the played time of the local day only, per child', () => {
    const events = [
      ended(T0, CHILD_K, 5 * MIN, 's1'),
      ended(Date.UTC(2026, 10, 18, 3), CHILD_K, 7 * MIN, 's2'), // 21:00 on the 17th in Chicago
      ended(T0, CHILD_G2, 9 * MIN, 's3'),
      ended(T0, CHILD_K.toUpperCase(), MIN, 's4'),
    ];
    expect(playedMsOnDay(events, CHILD_K, '2026-11-18', 'America/Chicago')).toBe(6 * MIN);
    expect(playedMsOnDay(events, CHILD_K, '2026-11-18', 'UTC')).toBe(13 * MIN);
  });

  it('counts a session on the day it started, once, with its largest time', () => {
    const evening = Date.UTC(2026, 10, 18, 3); // 21:00 on the 17th in Chicago
    const events = [
      started(evening, CHILD_K, 'night'),
      ended(T0, CHILD_K, 9 * MIN, 'night'), // closed as abandoned the next morning
      started(T0, CHILD_K, 'TWO-TABS'),
      ended(T0 + 2 * MIN, CHILD_K, 2 * MIN, 'two-tabs'), // another tab's abandoned close
      ended(T0 + 5 * MIN, CHILD_K, 5 * MIN, 'two-tabs'), // the playing tab's own end
    ];
    const tz = 'America/Chicago';
    expect(playedMsOnDay(events, CHILD_K, '2026-11-18', tz)).toBe(5 * MIN);
    expect(playedMsOnDay(events, CHILD_K, '2026-11-17', tz)).toBe(9 * MIN);
  });
});

describe('SessionController', () => {
  it('start appends session.started with the grade budget; end appends session.ended', async () => {
    const s = await setup();
    expect(s.controller.getSnapshot()).toEqual({ status: 'idle' });
    const started = await s.controller.start(CHILD_K, 'child');
    expect(started.ok).toBe(true);
    const snap = s.controller.getSnapshot();
    expect(snap.status).toBe('active');

    s.advance(3 * MIN);
    s.controller.recordItem();
    s.controller.recordItem();
    s.controller.recordMath(70_000);
    s.controller.recordMath(-5); // ignored
    const ended = await s.controller.end('child-exit');
    expect(ended?.payload).toMatchObject({
      reason: 'child-exit',
      activeMs: 3 * MIN,
      mathMs: 70_000,
      items: 2,
    });
    expect(s.controller.getSnapshot()).toEqual({ status: 'idle' });
    expect(await s.controller.end('child-exit')).toBeNull();

    const events = await s.sessionEvents();
    expect(events.map((e) => e.type)).toEqual(['session.started', 'session.ended']);
    const [start, end] = events as [AnyEventEnvelope, AnyEventEnvelope];
    expect(start.childId).toBe(CHILD_K);
    expect(start.payload).toEqual({
      sessionId: (end.payload as EventPayloads['session.ended']).sessionId,
      budgetMinutes: 10, // K default (04 §6.1)
      trigger: 'child',
    });
    // The timers and the visibility listener are gone, and the checkpoint is cleared.
    expect(s.timers.handlers.size).toBe(0);
    expect(s.vis.listeners.size).toBe(0);
    expect(s.storage.map.size).toBe(0);
  });

  it('uses the child’s sessionMinutes, and the G2 default', async () => {
    const s = await setup({ child: { sessionMinutes: 6 } });
    expect(await s.controller.canStart(CHILD_K)).toEqual({ ok: true, budgetMinutes: 6 });
    expect(await s.controller.canStart(CHILD_G2)).toEqual({ ok: true, budgetMinutes: 15 });
  });

  it('fires the wind-down signal once, when the budget is used up', async () => {
    const s = await setup();
    await s.controller.start(CHILD_K);
    s.advance(10 * MIN - 1000);
    expect(s.windDowns).toEqual([]);
    s.advance(1000);
    expect(s.windDowns).toEqual(['wind-down']);
    s.advance(MIN);
    expect(s.windDowns).toEqual(['wind-down']);
    const snap = s.controller.getSnapshot();
    expect(snap.status === 'active' && snap.windDown).toBe('wind-down');
    // A listener that subscribes late hears it at once.
    const late: WindDownReason[] = [];
    s.controller.onWindDown((r) => late.push(r));
    expect(late).toEqual(['wind-down']);
    // The item in progress finishes, then the screen ends the session with the reason.
    const ended = await s.controller.end('wind-down');
    expect(ended?.payload.reason).toBe('wind-down');
    expect(ended?.payload.activeMs).toBe(11 * MIN);
  });

  it('counts active time only while the page is visible', async () => {
    const s = await setup();
    await s.controller.start(CHILD_K);
    s.advance(MIN);
    s.vis.set(false);
    s.advance(30 * MIN); // hidden: no time, no wind-down
    expect(s.windDowns).toEqual([]);
    expect(s.controller.activeMs()).toBe(MIN);
    s.vis.set(true);
    s.advance(30_000);
    expect(s.controller.activeMs()).toBe(90_000);
    const ended = await s.controller.end('child-exit');
    expect(ended?.payload.activeMs).toBe(90_000);
  });

  it('starts paused when the page is hidden at start', async () => {
    const s = await setup();
    s.vis.set(false);
    await s.controller.start(CHILD_K);
    s.advance(5 * MIN);
    expect(s.controller.activeMs()).toBe(0);
  });

  it('caps mathMs at the active time', async () => {
    const s = await setup();
    await s.controller.start(CHILD_K);
    s.advance(MIN);
    s.controller.recordMath(5 * MIN);
    expect((await s.controller.end('child-exit'))?.payload.mathMs).toBe(MIN);
  });

  describe('daily cap', () => {
    it('limits the budget to what is left today, and winds down with daily-cap', async () => {
      const s = await setup({ child: { dailyCapMinutes: 15 } });
      await playedSession(s, T0 - 60 * MIN, 8 * MIN); // 08:00 today in Chicago
      expect(await s.controller.canStart(CHILD_K)).toEqual({ ok: true, budgetMinutes: 7 });
      const started = await s.controller.start(CHILD_K);
      expect(started.ok && started.session.budgetMinutes).toBe(7);
      s.advance(7 * MIN - 1000);
      expect(s.windDowns).toEqual([]);
      s.advance(1000);
      expect(s.windDowns).toEqual(['daily-cap']);
      await s.controller.end('daily-cap');
      // Today's cap is used up: no new session for this child, until tomorrow.
      expect(await s.controller.canStart(CHILD_K)).toEqual({ ok: false, reason: 'daily-cap' });
      expect((await s.controller.start(CHILD_K)).ok).toBe(false);
      expect((await s.sessionEvents()).filter((e) => e.type === 'session.started')).toHaveLength(1);
      // Another child is not affected.
      expect((await s.controller.canStart(CHILD_G2)).ok).toBe(true);
      // Tomorrow (local), the cap is fresh.
      s.env.clock.set(Date.UTC(2026, 10, 19, 14));
      expect(await s.controller.canStart(CHILD_K)).toEqual({ ok: true, budgetMinutes: 10 });
    });

    it('counts only today in the family time zone', async () => {
      // 03:00 UTC on the 18th is the evening of the 17th in Chicago, but the 18th in UTC.
      const chicago = await setup({ child: { dailyCapMinutes: 20 } });
      await playedSession(chicago, Date.UTC(2026, 10, 18, 3), 15 * MIN);
      expect(await chicago.controller.canStart(CHILD_K)).toEqual({ ok: true, budgetMinutes: 10 });

      const utc = await setup({ child: { dailyCapMinutes: 20 }, timezone: 'UTC' });
      await playedSession(utc, Date.UTC(2026, 10, 18, 3), 15 * MIN);
      expect(await utc.controller.canStart(CHILD_K)).toEqual({ ok: true, budgetMinutes: 5 });
    });

    it('treats less than a minute left as reached', async () => {
      const s = await setup({ child: { dailyCapMinutes: 10 } });
      await playedSession(s, T0 - MIN, 9 * MIN + 30_000);
      expect(await s.controller.canStart(CHILD_K)).toEqual({ ok: false, reason: 'daily-cap' });
    });

    it('counts the running session in canStart', async () => {
      const s = await setup({ child: { dailyCapMinutes: 12 } });
      await s.controller.start(CHILD_K);
      s.advance(4 * MIN);
      expect(await s.controller.canStart(CHILD_K)).toEqual({ ok: true, budgetMinutes: 8 });
    });
  });

  describe('quiet hours', () => {
    it('blocks a start during quiet hours, across midnight, in the family zone', async () => {
      const s = await setup({ child: { quietHours: { start: '20:00', end: '07:00' } } });
      // 09:00 in Chicago: fine.
      expect((await s.controller.canStart(CHILD_K)).ok).toBe(true);
      // 21:00 and 06:59 in Chicago: quiet.
      s.env.clock.set(Date.UTC(2026, 10, 19, 3));
      expect(await s.controller.canStart(CHILD_K)).toEqual({
        ok: false,
        reason: 'quiet-hours',
        opensAt: '07:00',
      });
      s.env.clock.set(Date.UTC(2026, 10, 19, 12, 59));
      expect(await s.controller.start(CHILD_K)).toEqual({
        ok: false,
        reason: 'quiet-hours',
        opensAt: '07:00',
      });
      expect(await s.sessionEvents()).toEqual([]);
      s.env.clock.set(Date.UTC(2026, 10, 19, 13));
      expect((await s.controller.canStart(CHILD_K)).ok).toBe(true);
      // Quiet hours are per child.
      s.env.clock.set(Date.UTC(2026, 10, 19, 3));
      expect((await s.controller.canStart(CHILD_G2)).ok).toBe(true);
    });

    it('follows the family time zone', async () => {
      // 15:00 UTC is 00:00 in Tokyo.
      const s = await setup({
        child: { quietHours: { start: '22:00', end: '06:00' } },
        timezone: 'Asia/Tokyo',
      });
      expect(await s.controller.canStart(CHILD_K)).toEqual({
        ok: false,
        reason: 'quiet-hours',
        opensAt: '06:00',
      });
    });

    it('winds down with quiet-hours when they begin mid-session', async () => {
      const s = await setup({ child: { quietHours: { start: '09:05', end: '10:00' } } });
      await s.controller.start(CHILD_K);
      s.advance(4 * MIN);
      expect(s.windDowns).toEqual([]);
      s.advance(MIN);
      expect(s.windDowns).toEqual(['quiet-hours']);
      expect((await s.controller.end('quiet-hours'))?.payload.reason).toBe('quiet-hours');
    });
  });

  it('ends another child’s running session as child-exit before starting', async () => {
    const s = await setup();
    const a = await s.controller.start(CHILD_K);
    s.advance(MIN);
    const b = await s.controller.start(CHILD_G2);
    expect(a.ok && b.ok && a.session.sessionId !== b.session.sessionId).toBe(true);
    // Starting the same child again keeps the running session.
    const again = await s.controller.start(CHILD_G2);
    expect(again.ok && b.ok && again.session.sessionId === b.session.sessionId).toBe(true);
    const events = await s.sessionEvents();
    expect(events.map((e) => `${e.type}:${e.childId === CHILD_K ? 'K' : 'G2'}`)).toEqual([
      'session.started:K',
      'session.ended:K',
      'session.started:G2',
    ]);
    expect(events[1]?.payload).toMatchObject({ reason: 'child-exit', activeMs: MIN });
  });

  describe('abandoned sessions', () => {
    /** Past LIVE_CHECKPOINT_MS: a checkpoint this old means no tab is playing that session. */
    const QUIET = LIVE_CHECKPOINT_MS + MIN;

    it('closes this device’s unended sessions with the last checkpoint, once', async () => {
      const { locks, held } = fakeLocks();
      const s = await setup({ locks });
      await s.controller.start(CHILD_K);
      s.advance(14_000);
      s.controller.recordItem();
      s.advance(2_000); // 16 s: the 15 s checkpoint is saved
      s.advance(5_000); // then the tab dies (no end); the browser drops its lock
      held.clear();
      const [key] = [...s.storage.map.keys()];
      expect(key?.startsWith(CHECKPOINT_PREFIX)).toBe(true);

      const next = s.make(); // the next boot
      expect(await next.closeAbandoned()).toBe(0); // its checkpoint is still fresh
      s.env.clock.advance(QUIET);
      expect(await next.closeAbandoned()).toBe(1);
      const ended = (await s.sessionEvents()).find((e) => e.type === 'session.ended');
      expect(ended?.payload).toMatchObject({ reason: 'abandoned', activeMs: 16_000, items: 1 });
      expect(ended?.childId).toBe(CHILD_K);
      expect(s.storage.map.size).toBe(0);
      expect(await next.closeAbandoned()).toBe(0);
    });

    it('uses 0 without a checkpoint, saves one when the page hides, and skips the running session', async () => {
      const { locks, held } = fakeLocks();
      const s = await setup({ locks });
      await s.controller.start(CHILD_K);
      s.advance(40_000);
      s.storage.map.clear();
      // The running session is not abandoned, here or from another tab while it plays.
      expect(await s.controller.closeAbandoned()).toBe(0);
      const other = s.make();
      expect(await other.closeAbandoned()).toBe(0);
      held.clear(); // the playing tab dies
      // Without a checkpoint nothing tells a live session from a dead one (its tab may be unable to
      // save any): it stays open long past the time a checkpoint would have gone quiet.
      expect(await other.closeAbandoned()).toBe(0);
      s.env.clock.advance(QUIET);
      expect(await other.closeAbandoned()).toBe(0);
      s.env.clock.advance(NO_CHECKPOINT_MS - QUIET - MIN);
      expect(await other.closeAbandoned()).toBe(0);
      s.env.clock.advance(MIN);
      expect(await other.closeAbandoned()).toBe(1); // a day-old start: no child plays that long
      const ended = (await s.sessionEvents()).find((e) => e.type === 'session.ended');
      expect(ended?.payload).toMatchObject({ reason: 'abandoned', activeMs: 0 });

      const t = fakeLocks();
      const u = await setup({ locks: t.locks });
      await u.controller.start(CHILD_K);
      u.advance(5_000);
      u.vis.set(false); // pagehide / visibilitychange: checkpoint now
      t.held.clear(); // then the tab dies
      u.env.clock.advance(QUIET);
      expect(await u.make().closeAbandoned()).toBe(1);
      const e2 = (await u.sessionEvents()).find((e) => e.type === 'session.ended');
      expect(e2?.payload).toMatchObject({ activeMs: 5_000 });
    });

    it('leaves a session another tab is playing alone, and it ends once', async () => {
      const { locks, held } = fakeLocks();
      const s = await setup({ child: { dailyCapMinutes: 30 }, locks });
      await s.controller.start(CHILD_K); // tab A
      s.advance(16_000); // a checkpoint is saved
      expect(held.size).toBe(1);
      const tabB = s.make();
      expect(await tabB.closeAbandoned()).toBe(0);
      s.advance(4_000);
      await s.controller.end('child-exit'); // back in tab A: Home
      expect(held.size).toBe(0);
      const ends = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
      expect(ends).toHaveLength(1);
      expect(ends[0]?.payload).toMatchObject({ reason: 'child-exit', activeMs: 20_000 });
      expect(await tabB.closeAbandoned()).toBe(0);
      const day = localTime(s.env.clock.now(), 'America/Chicago').day;
      expect(playedMsOnDay(await s.store.events(), CHILD_K, day, 'America/Chicago')).toBe(20_000);
    });

    it('two sweeps racing over a crashed session write one end in total', async () => {
      const { locks, held } = fakeLocks();
      const s = await setup({ locks });
      await s.controller.start(CHILD_K);
      s.advance(16_000);
      held.clear(); // crashed: the lock is gone, no end written
      s.env.clock.advance(QUIET);
      const [b, c] = [s.make(), s.make()];
      const closed = await Promise.all([b.closeAbandoned(), c.closeAbandoned()]);
      expect(closed[0] + closed[1]).toBe(1);
      expect(await b.closeAbandoned()).toBe(0);
      expect(await c.closeAbandoned()).toBe(0);
      const ends = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
      expect(ends).toHaveLength(1);
    });

    it('without Web Locks, two sweeps that read the same log write one end, counted once', async () => {
      const s = await setup({ locks: null });
      await s.controller.start(CHILD_K);
      s.advance(16_000); // then the tab dies
      s.env.clock.advance(QUIET);
      // Both tabs read the log (the crashed session unended in each) before either writes.
      const afterRead = gate();
      afterRead.close();
      let reads = 0;
      const stale = (): SessionStore => ({
        ...gatedStore(s.store),
        events: async () => {
          const events = await s.store.events();
          reads += 1;
          await afterRead.wait();
          return events;
        },
      });
      const [b, c] = [s.make({ store: stale() }), s.make({ store: stale() })];
      const sweeps = Promise.all([b.closeAbandoned(), c.closeAbandoned()]);
      await vi.waitFor(() => expect(reads).toBe(2));
      afterRead.open();
      const closed = await sweeps;
      expect(closed[0] + closed[1]).toBe(1);
      const ends = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
      expect(ends.map((e) => e.payload)).toEqual([
        expect.objectContaining({ reason: 'abandoned', activeMs: 16_000 }),
      ]);
      expect(s.storage.map.size).toBe(0);
    });

    it('a session a sweep already closed ends quietly in its own tab: the log keeps one end', async () => {
      const s = await setup({ locks: null });
      const tabA = s.make({ storage: failingStorage }); // no locks, no checkpoints: no sign of life
      await tabA.start(CHILD_K);
      s.advance(30_000);
      s.env.clock.advance(NO_CHECKPOINT_MS); // a day on, another tab takes it for dead
      expect(await s.controller.closeAbandoned()).toBe(1);
      expect(await tabA.end('child-exit')).toBeNull();
      expect(tabA.getSnapshot().status).toBe('idle');
      const ends = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
      expect(ends.map((e) => e.payload)).toEqual([
        expect.objectContaining({ reason: 'abandoned' }),
      ]);
    });

    it('closes a dead session whose checkpoint a clock a year ahead stamped, two minutes after the clock is right', async () => {
      const { locks, held } = fakeLocks();
      const s = await setup({ locks });
      const YEAR = 365 * 24 * 60 * MIN;
      s.correctClock(YEAR); // the device clock is a year ahead
      await s.controller.start(CHILD_K);
      s.advance(16_000);
      held.clear(); // the tab dies
      s.correctClock(-YEAR); // the clock is corrected
      const next = s.make();
      // Its checkpoint's age can't be read: the sweep notes when it first saw it, and waits for
      // real time to pass. Moving the wall clock again proves nothing and closes nothing.
      expect(await next.closeAbandoned()).toBe(0);
      s.correctClock(10 * MIN);
      expect(await next.closeAbandoned()).toBe(0);
      s.env.clock.advance(LIVE_CHECKPOINT_MS - 1);
      expect(await next.closeAbandoned()).toBe(0);
      s.env.clock.advance(1);
      expect(await next.closeAbandoned()).toBe(1);
      expect(await next.closeAbandoned()).toBe(0);
      const ends = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
      expect(ends.map((e) => e.payload)).toEqual([
        expect.objectContaining({ reason: 'abandoned', activeMs: 16_000 }),
      ]);
    });

    it('without Web Locks, a sweep after the clock moves back leaves a live session alone, and it ends once with all its time', async () => {
      const s = await setup({ locks: null });
      const tabA = s.controller;
      await tabA.start(CHILD_K);
      s.advance(16_000); // a checkpoint is saved
      // Before tab A's next tick the clock is set back ten minutes, then forward three: its
      // checkpoint stays in the future through both sweeps, and no time has really passed.
      s.correctClock(-10 * MIN);
      const tabB = s.make();
      expect(await tabB.closeAbandoned()).toBe(0);
      s.correctClock(3 * MIN);
      expect(await tabB.closeAbandoned()).toBe(0);
      expect((await s.sessionEvents()).map((e) => e.type)).toEqual(['session.started']);
      s.advance(4_000); // tab A's tick saves a checkpoint with the new time
      expect(await tabB.closeAbandoned()).toBe(0);
      s.advance(4_000); // the child plays on
      expect(await tabA.end('child-exit')).not.toBeNull();
      const ends = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
      // 16 s before the clock moved and 4 s after the tick that took up the new time.
      expect(ends.map((e) => e.payload)).toEqual([
        expect.objectContaining({ reason: 'child-exit', activeMs: 20_000 }),
      ]);
    });

    it('the same clock moves put right again close nothing either', async () => {
      const s = await setup({ locks: null });
      await s.controller.start(CHILD_K);
      s.advance(16_000);
      s.correctClock(-3 * MIN);
      const tabB = s.make();
      expect(await tabB.closeAbandoned()).toBe(0);
      s.correctClock(3 * MIN); // back where it was: the checkpoint is 0 s old again
      expect(await tabB.closeAbandoned()).toBe(0);
      s.advance(4_000);
      expect(await s.controller.end('child-exit')).not.toBeNull();
      const ends = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
      expect(ends.map((e) => e.payload)).toEqual([
        expect.objectContaining({ reason: 'child-exit', activeMs: 20_000 }),
      ]);
    });

    it('without Web Locks, a new checkpoint saved at a clock time seen before is not taken for the old one', async () => {
      const s = await setup({ locks: null });
      const tabA = s.controller;
      await tabA.start(CHILD_K);
      s.advance(16_000); // a checkpoint is saved at time T
      const T = s.env.clock.now();
      const [key] = [...s.storage.map.keys()];
      const raw = () => s.storage.map.get(key ?? '') ?? '';
      const first = raw();
      expect(JSON.parse(first)).toMatchObject({ at: T, activeMs: 16_000 });
      const tabB = s.make();
      expect(await tabB.closeAbandoned()).toBe(0); // tab B sees that checkpoint
      for (let t = 0; t < LIVE_CHECKPOINT_MS + MIN; t += 15_000) s.advance(15_000); // A plays on
      // The clock is set back so that tab A's next checkpoint is stamped T again...
      s.correctClock(T - 1_000 - s.env.clock.now());
      s.advance(1_000);
      expect(JSON.parse(raw())).toMatchObject({ at: T });
      expect(raw()).not.toBe(first);
      // ...and back three more minutes before its next tick. Tab B saw "a checkpoint at T" over
      // two minutes ago, but this is not that one.
      s.correctClock(-3 * MIN);
      expect(await tabB.closeAbandoned()).toBe(0);
      s.advance(1_000);
      expect(await tabB.closeAbandoned()).toBe(0);
      expect(await tabA.end('child-exit')).not.toBeNull();
      const ends = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
      expect(ends.map((e) => e.payload)).toEqual([
        expect.objectContaining({ reason: 'child-exit' }),
      ]);
    });

    it('numbers each save, so two saves at one clock time with no new play still differ', async () => {
      const s = await setup({ locks: null });
      await s.controller.start(CHILD_K);
      s.vis.set(false); // hidden: a checkpoint is saved, and no more play time accrues
      const [key] = [...s.storage.map.keys()];
      const first = s.storage.map.get(key ?? '');
      /** Twenty seconds pass, then the clock is set back by as much: a save at the same time. */
      const saveAtTheSameTime = () => {
        s.advance(20_000);
        s.correctClock(-20_000);
        s.advance(0);
        return s.storage.map.get(key ?? '');
      };
      const second = saveAtTheSameTime();
      const third = saveAtTheSameTime();
      expect(JSON.parse(second ?? '{}')).toMatchObject({ activeMs: 0 });
      expect(JSON.parse(third ?? '{}')).toMatchObject(
        (({ at, activeMs }) => ({ at, activeMs }))(JSON.parse(second ?? '{}')),
      );
      expect(new Set([first, second, third]).size).toBe(3);
    });

    it('without Web Locks, a clock set forward closes nothing in a tab that has seen the session live', async () => {
      const s = await setup({ locks: null });
      const tabA = s.controller;
      await tabA.start(CHILD_K);
      s.advance(16_000); // a checkpoint is saved
      const tabB = s.make();
      expect(await tabB.closeAbandoned()).toBe(0); // tab B sees it, fresh
      // Before tab A's next tick the clock jumps three minutes ahead: the checkpoint looks old.
      s.correctClock(3 * MIN);
      expect(await tabB.closeAbandoned()).toBe(0);
      s.advance(1_000); // tab A's tick saves a checkpoint with the new time
      expect(await tabB.closeAbandoned()).toBe(0);
      expect(await tabA.end('child-exit')).not.toBeNull();
      const ends = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
      expect(ends.map((e) => e.payload)).toEqual([
        expect.objectContaining({ reason: 'child-exit' }),
      ]);
      // A dead session is still closed: seen unchanged for two minutes of real time.
      const u = await setup({ locks: null });
      await u.controller.start(CHILD_K);
      u.advance(16_000); // then the tab dies
      const next = u.make();
      expect(await next.closeAbandoned()).toBe(0);
      u.correctClock(3 * MIN);
      expect(await next.closeAbandoned()).toBe(0);
      u.env.clock.advance(LIVE_CHECKPOINT_MS);
      expect(await next.closeAbandoned()).toBe(1);
    });

    it('after the clock moves back, the playing tab’s next tick saves a checkpoint with the new time', async () => {
      const s = await setup({ locks: null });
      await s.controller.start(CHILD_K);
      s.advance(16_000); // a checkpoint is saved
      const [key] = [...s.storage.map.keys()];
      const raw = () => s.storage.map.get(key ?? '');
      const before = raw();
      s.correctClock(-3 * MIN);
      // The other tab's sweep only reads: it can't put an older checkpoint over a newer one.
      let writes = 0;
      const tabB = s.make({
        storage: {
          getItem: (k) => s.storage.getItem(k),
          setItem: (k, v) => {
            writes += 1;
            s.storage.setItem(k, v);
          },
          removeItem: (k) => {
            writes += 1;
            s.storage.removeItem(k);
          },
        },
      });
      expect(await tabB.closeAbandoned()).toBe(0);
      expect(writes).toBe(0);
      expect(raw()).toBe(before);
      s.advance(1_000); // not three minutes later, when the clock catches up with the old one
      expect(JSON.parse(raw() ?? '{}')).toMatchObject({ at: s.env.clock.now() });
      // However long the other tab then waits, the session it sees is live.
      for (let t = 0; t < 2 * LIVE_CHECKPOINT_MS; t += 15_000) {
        s.advance(15_000);
        expect(await tabB.closeAbandoned()).toBe(0);
      }
      expect(s.controller.getSnapshot().status).toBe('active');
    });

    it('leaves a session with no checkpoint and a start in the future open: nothing shows it is dead', async () => {
      const s = await setup({ locks: null });
      const tabA = s.make({ storage: failingStorage }); // no locks, no checkpoints
      s.env.clock.set(T0 + 2 * 24 * 60 * MIN); // the device clock is two days ahead
      await tabA.start(CHILD_K);
      s.advance(30_000);
      s.env.clock.set(T0 + MIN); // the clock is corrected while the child plays
      expect(await s.controller.closeAbandoned()).toBe(0);
      expect((await s.sessionEvents()).map((e) => e.type)).toEqual(['session.started']);
      expect(tabA.getSnapshot().status).toBe('active');
    });

    it('a start waits out another tab’s sweep (it holds the play lock while it reads) instead of being refused', async () => {
      const { locks, held } = fakeLocks();
      const s = await setup({ locks });
      // Tab B's sweep takes the play lock, then its read of the log is slow.
      const slow = gatedStore(s.store);
      const tabB = s.make({ store: slow });
      slow.reads.close();
      const sweep = tabB.sweep();
      await vi.waitFor(() => expect(held.size).toBe(1));
      // Nobody is playing. A child starts in tab A meanwhile.
      const tabA = s.make({ startLockWaitMs: 5_000 });
      let settled = false;
      const start = tabA.start(CHILD_K).finally(() => {
        settled = true;
      });
      await new Promise((r) => setTimeout(r, 30));
      expect(settled).toBe(false); // waiting for the lock, not refused
      slow.reads.open();
      expect(await sweep).toEqual({ closed: 0, watching: 0, skipped: false });
      expect(await start).toMatchObject({ ok: true });
      expect(tabA.getSnapshot().status).toBe('active');
    });

    it('refuses a start in a second tab while another plays (elsewhere), and leaves it alone', async () => {
      const { locks, held } = fakeLocks();
      const s = await setup({ locks });
      await s.controller.start(CHILD_K); // tab A
      s.advance(30_000);
      const tabB = s.make();
      expect(await tabB.start(CHILD_K)).toEqual({ ok: false, reason: 'elsewhere' });
      expect(await tabB.start(CHILD_G2)).toEqual({ ok: false, reason: 'elsewhere' });
      expect(s.controller.getSnapshot().status).toBe('active');
      const started = (await s.sessionEvents()).filter((e) => e.type === 'session.started');
      expect(started).toHaveLength(1);
      expect((await s.sessionEvents()).filter((e) => e.type === 'session.ended')).toEqual([]);
      // Once A ends, B plays.
      await s.controller.end('child-exit');
      expect(held.size).toBe(0);
      expect(await tabB.start(CHILD_G2)).toMatchObject({ ok: true });
    });

    it('a start after the playing tab closed counts that tab’s checkpointed play', async () => {
      const { locks, held } = fakeLocks();
      const s = await setup({ child: { dailyCapMinutes: 10, sessionMinutes: 10 }, locks });
      const tabA = s.controller;
      const tabB = s.make();
      await tabA.start(CHILD_K);
      for (let t = 0; t < 5 * MIN; t += 15_000) s.advance(15_000); // five checkpointed minutes
      held.clear(); // A closes without an end; its lock goes
      // Its checkpoint is fresh, so it stays open, but its five minutes count.
      expect(await tabB.start(CHILD_K)).toMatchObject({ ok: true, session: { budgetMinutes: 5 } });
      expect((await s.sessionEvents()).filter((e) => e.type === 'session.ended')).toEqual([]);
      await tabB.end('child-exit');
      // Later, the quiet checkpoint is closed with its five minutes.
      s.env.clock.advance(QUIET);
      expect(await tabB.closeAbandoned()).toBe(1);
      const ended = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
      expect(ended.map((e) => e.payload)).toContainEqual(
        expect.objectContaining({ reason: 'abandoned', activeMs: 5 * MIN }),
      );
    });

    it('a tab playing without its lock (the lock request failed) keeps its session', async () => {
      const { locks } = fakeLocks();
      const failing: SessionLocks = {
        acquire: () => Promise.reject(new Error('locks unavailable')),
      };
      const s = await setup({ locks });
      const tabA = s.make({ locks: failing }); // plays in the fallback, holding no lock
      await tabA.start(CHILD_K);
      s.advance(16_000);
      const tabB = s.controller; // takes the free lock: exclusive, as far as it knows
      expect(await tabB.start(CHILD_G2)).toMatchObject({ ok: true });
      expect(tabA.getSnapshot().status).toBe('active');
      expect((await s.sessionEvents()).filter((e) => e.type === 'session.ended')).toEqual([]);
      const checkpoints = [...s.storage.map.keys()].filter((k) => k.startsWith(CHECKPOINT_PREFIX));
      expect(checkpoints).toHaveLength(2);
    });

    const failingStorage: CheckpointStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    it.each([
      ['its checkpoint saved', undefined],
      ['its checkpoint write failing', failingStorage],
    ])(
      'a sweep between a lockless start’s write and its play leaves the session alone (%s)',
      async (_, tabStorage) => {
        const { locks } = fakeLocks();
        const failing: SessionLocks = {
          acquire: () => Promise.reject(new Error('locks unavailable')),
        };
        const s = await setup({ locks });
        // Tab A's session.started commits, then its start pauses before it plays.
        const afterCommit = gate();
        afterCommit.close();
        const committing: SessionStore = {
          now: () => s.store.now(),
          device: () => s.store.device(),
          familySettings: () => s.store.familySettings(),
          childSettings: (id) => s.store.childSettings(id),
          events: () => s.store.events(),
          append: (async (type, payload, meta) => {
            const result = await s.store.append(type, payload, meta);
            if (type === 'session.started') await afterCommit.wait();
            return result;
          }) as DataStore['append'],
        };
        const tabA = s.make({
          store: committing,
          locks: failing,
          ...(tabStorage ? { storage: tabStorage } : {}),
        });
        const pending = tabA.start(CHILD_K);
        await vi.waitFor(async () =>
          expect((await s.sessionEvents()).map((e) => e.type)).toEqual(['session.started']),
        );
        // Tab B takes the free lock and sweeps in that window.
        expect(await s.controller.closeAbandoned()).toBe(0);
        afterCommit.open();
        expect(await pending).toMatchObject({ ok: true });
        expect(tabA.getSnapshot().status).toBe('active');
        // The child plays on, past the time a checkpoint takes to go quiet: still left alone.
        for (let t = 0; t < QUIET; t += 15_000) s.advance(15_000);
        expect(tabA.getSnapshot().status).toBe('active');
        expect(await s.controller.closeAbandoned()).toBe(0);
        expect((await s.sessionEvents()).map((e) => e.type)).toEqual(['session.started']);
        await tabA.end('child-exit');
        const ended = (await s.sessionEvents()).filter((e) => e.type === 'session.ended');
        expect(ended.map((e) => e.payload)).toEqual([
          expect.objectContaining({ reason: 'child-exit' }),
        ]);
      },
    );

    it('a start whose write fails leaves no checkpoint behind', async () => {
      const s = await setup();
      const broken: SessionStore = {
        now: () => s.store.now(),
        device: () => s.store.device(),
        familySettings: () => s.store.familySettings(),
        childSettings: (id) => s.store.childSettings(id),
        events: () => s.store.events(),
        append: (async () => {
          throw new Error('storage full');
        }) as DataStore['append'],
      };
      const tab = s.make({ store: broken });
      await expect(tab.start(CHILD_K)).rejects.toThrow('storage full');
      expect([...s.storage.map.keys()].filter((k) => k.startsWith(CHECKPOINT_PREFIX))).toEqual([]);
    });

    it('a plan reads an end written meanwhile, so the ended session still counts', async () => {
      const s = await setup({ locks: null, child: { dailyCapMinutes: 10, sessionMinutes: 10 } });
      const tabA = s.controller;
      await tabA.start(CHILD_K);
      for (let t = 0; t < 6 * MIN; t += 15_000) s.advance(15_000); // six checkpointed minutes
      let reads = 0;
      const racy: SessionStore = {
        now: () => s.store.now(),
        device: () => s.store.device(),
        familySettings: () => s.store.familySettings(),
        childSettings: (id) => s.store.childSettings(id),
        append: s.store.append.bind(s.store) as DataStore['append'],
        events: async () => {
          const log = await s.store.events();
          reads += 1;
          // Right after B's first read, A ends: its end is written and its checkpoint removed.
          if (reads === 1) await tabA.end('child-exit');
          return log;
        },
      };
      const tabB = s.make({ store: racy });
      expect(await tabB.canStart(CHILD_K)).toEqual({ ok: true, budgetMinutes: 4 });
      expect(reads).toBe(2);
    });

    it('a start cancelled before it runs, or during its write, writes nothing that keeps playing', async () => {
      const { locks, held } = fakeLocks();
      const s = await setup({ locks });
      const cancelled = new AbortController();
      cancelled.abort();
      expect(await s.controller.start(CHILD_K, 'child', { signal: cancelled.signal })).toEqual({
        ok: false,
        reason: 'cancelled',
      });
      expect(await s.sessionEvents()).toEqual([]);

      const slow = gatedStore(s.store);
      let writing = false;
      const tab = s.make({
        store: {
          ...slow,
          append: ((...args: Parameters<DataStore['append']>) => {
            writing = true;
            return slow.append(...args);
          }) as DataStore['append'],
        },
      });
      slow.writes.close();
      const cancel = new AbortController();
      const pending = tab.start(CHILD_K, 'child', { signal: cancel.signal });
      await vi.waitFor(() => expect(writing).toBe(true)); // now inside the session.started write
      cancel.abort(); // the picker unmounted (the route changed)
      slow.writes.open();
      expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
      expect(tab.getSnapshot()).toEqual({ status: 'idle' });
      expect(held.size).toBe(0);
      const types = (await s.sessionEvents()).map((e) => [e.type, e.payload]);
      expect(types).toEqual([
        ['session.started', expect.anything()],
        ['session.ended', expect.objectContaining({ reason: 'child-exit' })],
      ]);
    });

    it('without Web Locks, a start leaves another tab’s live session and checkpoint alone', async () => {
      const s = await setup({ locks: null });
      await s.controller.start(CHILD_K); // tab A, checkpoint saved at start
      s.advance(16_000);
      const tabB = s.make();
      expect(await tabB.start(CHILD_G2)).toMatchObject({ ok: true });
      expect((await s.sessionEvents()).filter((e) => e.type === 'session.ended')).toEqual([]);
      const keys = [...s.storage.map.keys()].filter((k) => k.startsWith(CHECKPOINT_PREFIX));
      expect(keys).toHaveLength(2);
      // Once A's checkpoint has gone quiet (the tab is gone), a sweep closes it.
      s.env.clock.advance(QUIET);
      await tabB.end('child-exit');
      expect(await tabB.closeAbandoned()).toBe(1);
    });

    it('without Web Locks, a live session in another tab still counts toward the daily cap', async () => {
      const s = await setup({ locks: null, child: { dailyCapMinutes: 10, sessionMinutes: 10 } });
      await s.controller.start(CHILD_K); // tab A plays the same child
      for (let t = 0; t < 6 * MIN; t += 15_000) s.advance(15_000); // six checkpointed minutes
      const tabB = s.make();
      expect(await tabB.canStart(CHILD_K)).toEqual({ ok: true, budgetMinutes: 4 });
      expect(await tabB.start(CHILD_K)).toMatchObject({ ok: true, session: { budgetMinutes: 4 } });
      expect((await s.sessionEvents()).filter((e) => e.type === 'session.ended')).toEqual([]);
    });

    it('charges a session recovered the next morning to the evening it was played', async () => {
      const s = await setup({ child: { dailyCapMinutes: 10 } });
      s.env.clock.set(Date.UTC(2026, 10, 18, 3)); // 21:00 on the 17th in Chicago
      await s.controller.start(CHILD_K);
      for (let t = 0; t < 570_000; t += 15_000) s.advance(15_000); // 9 min 30 s, checkpointed
      s.controller.dispose(); // closed without pressing Home
      s.env.clock.set(T0); // 09:00 the next morning
      const next = s.make();
      expect(await next.closeAbandoned()).toBe(1);
      const ended = (await s.sessionEvents()).find((e) => e.type === 'session.ended');
      expect(ended?.payload).toMatchObject({ reason: 'abandoned', activeMs: 570_000 });
      expect(await next.canStart(CHILD_K)).toEqual({
        ok: true,
        budgetMinutes: Math.min(defaultChildSettings('K').sessionMinutes, 10),
      });
    });

    it('leaves other devices’ sessions alone', async () => {
      const s = await setup();
      const res = await s.store.ingest(
        [
          {
            id: '019c0000-0000-7000-8000-0000000000a1',
            familyId: FAMILY,
            childId: CHILD_G2,
            deviceId: '019a0000-0000-7000-8000-0000000ad0ff',
            ts: T0 - MIN,
            type: 'session.started',
            v: 1,
            payload: { sessionId: 'elsewhere', budgetMinutes: 15, trigger: 'child' },
            contentVersion: fixtureContent().contentVersion,
          },
        ],
        { source: 'server' },
      );
      expect(res.added).toHaveLength(1);
      expect(await s.controller.closeAbandoned()).toBe(0);
    });
  });

  it('dispose stops the clock and keeps the checkpoint for the next boot', async () => {
    const s = await setup();
    await s.controller.start(CHILD_K);
    s.advance(3_000);
    s.controller.dispose();
    expect(s.timers.handlers.size).toBe(0);
    expect(s.controller.getSnapshot()).toEqual({ status: 'idle' });
    s.env.clock.advance(LIVE_CHECKPOINT_MS + MIN); // the next boot, once the checkpoint is quiet
    expect(await s.make().closeAbandoned()).toBe(1);
    const ended = (await s.sessionEvents()).find((e) => e.type === 'session.ended');
    expect(ended?.payload).toMatchObject({ reason: 'abandoned', activeMs: 3_000 });
  });
});
