import {
  type AnyEventEnvelope,
  type ChildSettings,
  defaultChildSettings,
  defaultFamilySettings,
  type EventPayloads,
  settingsKey,
} from '@number-island/shared';
import { afterEach, describe, expect, it } from 'vitest';
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
  type PageVisibility,
  SessionController,
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

async function setup(opts: { child?: Partial<ChildSettings>; timezone?: string } = {}) {
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
  const make = () => {
    const c = new SessionController({
      store,
      timers: timers.timers,
      visibility: vis.visibility,
      storage,
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
  const sessionEvents = async () =>
    (await store.events()).filter((e) => e.type.startsWith('session.'));
  return { env, store, controller, make, timers, vis, storage, windDowns, advance, sessionEvents };
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

  it('counts the played time of the local day only, per child', () => {
    const ev = (ts: number, childId: string, activeMs: number) =>
      ({
        type: 'session.ended',
        ts,
        childId,
        payload: { sessionId: 's', reason: 'wind-down', activeMs, mathMs: 0, items: 0 },
      }) as unknown as AnyEventEnvelope;
    const events = [
      ev(T0, CHILD_K, 5 * MIN),
      ev(Date.UTC(2026, 10, 18, 3), CHILD_K, 7 * MIN), // 21:00 on the 17th in Chicago
      ev(T0, CHILD_G2, 9 * MIN),
      ev(T0, CHILD_K.toUpperCase(), MIN),
    ];
    expect(playedMsOnDay(events, CHILD_K, '2026-11-18', 'America/Chicago')).toBe(6 * MIN);
    expect(playedMsOnDay(events, CHILD_K, '2026-11-18', 'UTC')).toBe(13 * MIN);
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
      expect(await s.controller.canStart(CHILD_K)).toEqual({ ok: false, reason: 'quiet-hours' });
      s.env.clock.set(Date.UTC(2026, 10, 19, 12, 59));
      expect(await s.controller.start(CHILD_K)).toEqual({ ok: false, reason: 'quiet-hours' });
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
      expect(await s.controller.canStart(CHILD_K)).toEqual({ ok: false, reason: 'quiet-hours' });
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
    it('closes this device’s unended sessions with the last checkpoint, once', async () => {
      const s = await setup();
      await s.controller.start(CHILD_K);
      s.advance(14_000);
      s.controller.recordItem();
      s.advance(2_000); // 16 s: the 15 s checkpoint is saved
      s.advance(5_000); // then the tab dies (no end)
      const [key] = [...s.storage.map.keys()];
      expect(key?.startsWith(CHECKPOINT_PREFIX)).toBe(true);

      const next = s.make(); // the next boot
      expect(await next.closeAbandoned()).toBe(1);
      const ended = (await s.sessionEvents()).find((e) => e.type === 'session.ended');
      expect(ended?.payload).toMatchObject({ reason: 'abandoned', activeMs: 16_000, items: 1 });
      expect(ended?.childId).toBe(CHILD_K);
      expect(s.storage.map.size).toBe(0);
      expect(await next.closeAbandoned()).toBe(0);
    });

    it('uses 0 without a checkpoint, saves one when the page hides, and skips the running session', async () => {
      const s = await setup();
      await s.controller.start(CHILD_K);
      s.advance(40_000);
      s.storage.map.clear();
      // The running session is not abandoned.
      expect(await s.controller.closeAbandoned()).toBe(0);
      const other = s.make();
      expect(await other.closeAbandoned()).toBe(1);
      const ended = (await s.sessionEvents()).find((e) => e.type === 'session.ended');
      expect(ended?.payload).toMatchObject({ reason: 'abandoned', activeMs: 0 });

      const t = await setup();
      await t.controller.start(CHILD_K);
      t.advance(5_000);
      t.vis.set(false); // pagehide / visibilitychange: checkpoint now
      expect(await t.make().closeAbandoned()).toBe(1);
      const e2 = (await t.sessionEvents()).find((e) => e.type === 'session.ended');
      expect(e2?.payload).toMatchObject({ activeMs: 5_000 });
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
    expect(await s.make().closeAbandoned()).toBe(1);
    const ended = (await s.sessionEvents()).find((e) => e.type === 'session.ended');
    expect(ended?.payload).toMatchObject({ reason: 'abandoned', activeMs: 3_000 });
  });
});
