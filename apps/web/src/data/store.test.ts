// D01 data layer (02 §4): append/fold/cache, rebuilds on a version bump, out-of-order and clamped
// server copies, tombstones, LWW documents, re-homing, the push queue, reloads and isolation.
// fake-indexeddb gives every test its own IndexedDB; the store runs on it as in a browser.

import {
  ELO_FIRE_V1,
  foldCollection,
  foldGoals,
  foldInventory,
  foldIsland,
  foldLearnerState,
  type GoalSettings,
  sortEvents,
} from '@number-island/engine';
import {
  type AnyEventEnvelope,
  type EventPayloads,
  type EventType,
  UUID_V7_PATTERN,
} from '@number-island/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROJECTION_VERSION } from './projections';
import type { DataStore } from './store';
import { DataStoreError } from './store';
import {
  CHILD_G2,
  CHILD_K,
  DEVICE,
  FAMILY,
  fixtureContent,
  profile,
  replayEvents,
  testEnv,
} from './store.test-support';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const KIDS = [
  { id: CHILD_K, isK: true },
  { id: CHILD_G2, isK: false },
];
const GOALS: GoalSettings = { [CHILD_K]: { weeklyGoal: 5 }, [CHILD_G2]: { weeklyGoal: 6 } };

const open: DataStore[] = [];
async function track(p: Promise<DataStore>): Promise<DataStore> {
  const s = await p;
  open.push(s);
  return s;
}
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

/** A store whose two fixture children have profiles (K and G2), so isK and goals are known. */
async function familyStore(env = testEnv(), name = 'test') {
  const store = await track(env.open(name));
  await store.putProfile(profile(CHILD_K, 'K', 'Ada'));
  await store.putProfile(profile(CHILD_G2, '2', 'Ben'));
  return { env, store };
}

/** Every cached projection equals the engine's full fold over the stored log. */
async function expectCacheEqualsFold(store: DataStore, goals: GoalSettings = GOALS) {
  const events = await store.events();
  const { graph, gameData } = fixtureContent();
  expect(await store.island()).toEqual(foldIsland(events, gameData));
  expect(await store.inventory()).toEqual(foldInventory(events));
  expect(await store.collection()).toEqual(foldCollection(events, gameData));
  expect(await store.goals()).toEqual(foldGoals(events, goals));
  for (const kid of KIDS) {
    expect(await store.skillStates(kid.id)).toEqual(
      foldLearnerState(events, graph, { childId: kid.id, isK: kid.isK }),
    );
  }
}

let n = 0;
function serverEvent<T extends EventType>(
  type: T,
  payload: EventPayloads[T],
  ts: number,
  childId: string | null,
  extra: Partial<AnyEventEnvelope> = {},
): AnyEventEnvelope {
  n += 1;
  return {
    id: `019c0000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`,
    familyId: FAMILY,
    childId,
    deviceId: DEVICE,
    ts,
    type,
    v: 1,
    payload,
    contentVersion: 'server',
    ...extra,
  } as AnyEventEnvelope;
}

const named = (name: string): EventPayloads['island.named'] => ({ name });

describe('device and first run', () => {
  it('creates local UUIDv7 device and family ids once, and asks for persistent storage once', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    const env = testEnv();
    const a = await track(env.open());
    const dev = await a.device();
    expect(dev.deviceId).toMatch(UUID_V7_PATTERN);
    expect(dev.familyId).toMatch(UUID_V7_PATTERN);
    expect(dev.pairedAt).toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
    a.close();
    const b = await track(env.open());
    expect(await b.device()).toEqual(dev);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('requestPersistence never throws', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        persist: () => {
          throw new Error('no');
        },
      },
    });
    const store = await track(testEnv().open());
    await expect(store.requestPersistence()).resolves.toBe(false);
    vi.stubGlobal('navigator', {});
    await expect(store.requestPersistence()).resolves.toBe(false);
  });
});

describe('append', () => {
  it('validates, stamps the envelope and queues the event', async () => {
    const { env, store } = await familyStore();
    const dev = await store.device();
    const e = await store.append(
      'session.started',
      // Unknown payload fields are stripped by the shared schema (02 §4.2).
      { sessionId: 's1', budgetMinutes: 10, trigger: 'child', extra: 1 } as never,
      { childId: CHILD_K },
    );
    expect(e).toEqual({
      id: expect.stringMatching(UUID_V7_PATTERN),
      familyId: dev.familyId,
      childId: CHILD_K,
      deviceId: dev.deviceId,
      ts: env.clock.now(),
      type: 'session.started',
      v: 1,
      payload: { sessionId: 's1', budgetMinutes: 10, trigger: 'child' },
      contentVersion: fixtureContent().contentVersion,
    });
    expect(await store.unsynced()).toEqual([e]);
    expect((await store.db.events.get(e.id))?.synced).toBe(0);

    const bad = store.append('road.extended', { to: -1 }, { childId: null });
    await expect(bad).rejects.toBeInstanceOf(DataStoreError);
    await expect(bad).rejects.toMatchObject({ code: 'invalid_event' });
    await expect(
      store.append('child.deleted' as never, { childId: CHILD_K } as never, { childId: null }),
    ).rejects.toMatchObject({ code: 'forbidden_type' });
    expect(await store.events()).toHaveLength(1);
  });

  it('keeps every cached projection equal to the full engine fold (incremental path)', async () => {
    const { env, store } = await familyStore();
    const log = sortEvents(replayEvents()).slice(0, 260);
    for (const e of log) {
      env.clock.set(e.ts);
      // Replays the golden log's payloads through the device API, one append at a time.
      await store.append(e.type as never, e.payload as never, { childId: e.childId });
    }
    const events = await store.events();
    expect(events).toHaveLength(log.length);
    await expectCacheEqualsFold(store);
    for (const kid of KIDS) {
      const state = await store.skillStates(kid.id);
      expect(Object.keys(state?.skills ?? {}).length).toBeGreaterThan(0);
    }
    const island = await store.db.projections.get('island');
    expect(island?.upToEventId).toBe(events[events.length - 1]?.id);
    expect(island?.version).toBe(
      `p${PROJECTION_VERSION}|${ELO_FIRE_V1}|${fixtureContent().contentVersion}`,
    );
  });

  it('notifies onAppend listeners after the commit, until unsubscribed', async () => {
    const store = await track(testEnv().open());
    const seen: string[] = [];
    const off = store.onAppend((e) => seen.push(e.id));
    const a = await store.append('island.named', named('A'), { childId: null });
    off();
    await store.append('island.named', named('B'), { childId: null });
    expect(seen).toEqual([a.id]);
  });
});

describe('projection cache rebuilds', () => {
  it('rebuilds only rows whose version differs (contentVersion or PROJECTION_VERSION)', async () => {
    const env = testEnv();
    const a = await track(env.open('test', { contentVersion: 'content-a' }));
    await a.putProfile(profile(CHILD_K, 'K'));
    await a.putProfile(profile(CHILD_G2, '2'));
    await a.ingest(replayEvents(), { source: 'server' });
    a.close();

    // A row with the current version is trusted as is (no rebuild on open).
    const db = env.db();
    const row = await db.projections.get('island');
    if (!row) throw new Error('no island row');
    await db.projections.put({ ...row, data: { ...(row.data as object), name: 'Stale' } });
    // A row written by an older fold version is rebuilt.
    const inv = await db.projections.get('inventory');
    if (!inv) throw new Error('no inventory row');
    await db.projections.put({ ...inv, version: 'p0|elo-fire-v0|content-a', data: {} });
    db.close();

    const b = await track(env.open('test', { contentVersion: 'content-a' }));
    expect((await b.island()).name).toBe('Stale');
    const events = await b.events();
    expect(await b.inventory()).toEqual(foldInventory(events));
    b.close();

    // A new content build rebuilds every row.
    const c = await track(env.open('test', { contentVersion: 'content-b' }));
    await expectCacheEqualsFold(c);
    for (const r of await c.db.projections.toArray()) expect(r.version).toContain('|content-b');
  });

  it('out-of-order ingest rebuilds and equals the full fold', async () => {
    const { store } = await familyStore();
    const log = sortEvents(replayEvents());
    const half = Math.floor(log.length / 2);
    const r1 = await store.ingest(log.slice(half), { source: 'server' });
    expect(r1).toMatchObject({ added: expect.any(Array), replaced: [], dropped: 0, invalid: 0 });
    await expectCacheEqualsFold(store);
    await store.ingest(log.slice(0, half), { source: 'server' });
    expect(await store.events()).toHaveLength(log.length);
    await expectCacheEqualsFold(store);
    // Re-ingesting the same copies changes nothing.
    expect(await store.ingest(log.slice(0, 10), { source: 'server' })).toMatchObject({
      added: [],
      replaced: [],
    });
  });

  it("a server copy with a clamped ts replaces the local copy; folds order by the server's ts", async () => {
    const { env, store } = await familyStore();
    const t0 = env.clock.now();
    // This device's clock runs 48 h ahead (08 §4).
    env.clock.set(t0 + 48 * HOUR);
    const local = await store.append('island.named', named('Future'), { childId: CHILD_K });
    // Another device names the island an hour after the real time.
    const other = serverEvent('island.named', named('Real'), t0 + HOUR, CHILD_G2, {
      deviceId: '019a0000-0000-7000-8000-00000000d002',
    });
    await store.ingest([other], { source: 'server' });
    expect((await store.island()).name).toBe('Future');

    // The server clamped the push to its receive time and kept the device's time in clientTs.
    const clamped = { ...local, ts: t0 + HOUR / 2, clientTs: local.ts };
    const r = await store.ingest([clamped], { source: 'server' });
    expect(r.replaced).toEqual([local.id]);
    const stored = await store.db.events.get(local.id);
    expect(stored).toMatchObject({ ts: t0 + HOUR / 2, clientTs: local.ts, synced: 1 });
    expect(await store.unsynced()).toEqual([]);
    expect((await store.island()).name).toBe('Real');
    await expectCacheEqualsFold(store);
    const { gameData } = fixtureContent();
    expect(await store.island()).toEqual(foldIsland([other, clamped], gameData));
  });

  it('a backup copy replaces a local one only per the folds preference (sortEvents)', async () => {
    const store = await track(testEnv().open());
    const e = serverEvent('island.named', named('X'), 10 * DAY, null);
    const clamped = { ...e, ts: 9 * DAY, clientTs: 10 * DAY };
    await store.ingest([clamped], { source: 'server' });
    // The unclamped copy from an old backup loses to the clamped copy.
    expect((await store.ingest([e], { source: 'backup' })).replaced).toEqual([]);
    expect(await store.db.events.get(e.id)).toMatchObject({ ts: 9 * DAY, synced: 1 });

    const f = serverEvent('island.named', named('Y'), 20 * DAY, null);
    await store.ingest([f], { source: 'backup' });
    expect((await store.db.events.get(f.id))?.synced).toBe(0);
    const fClamped = { ...f, ts: 19 * DAY, clientTs: 20 * DAY };
    expect((await store.ingest([fClamped], { source: 'backup' })).replaced).toEqual([f.id]);
    expect(await store.db.events.get(f.id)).toMatchObject({ ts: 19 * DAY, synced: 0 });
    expect((await store.island()).name).toBe('Y');
  });

  it('stores and relays unknown event types, which folds ignore', async () => {
    const store = await track(testEnv().open());
    const future = {
      ...serverEvent('island.named', named('Z'), DAY, null),
      type: 'future.thing',
      payload: { anything: [1, 2] },
    };
    const r = await store.ingest([future, { not: 'an event' }], { source: 'backup' });
    expect(r).toMatchObject({ added: [future.id], invalid: 1 });
    expect(await store.unsynced()).toEqual([future]);
    expect((await store.island()).name).toBeNull();
  });
});

describe('tombstones (08 §4)', () => {
  it("purges the child's events, profile, settings and skills row, keeps the tombstone, and refuses the child", async () => {
    const { env, store } = await familyStore();
    await store.ingest(replayEvents(), { source: 'server' });
    await store.putSettings({
      key: `child:${CHILD_K}`,
      value: { ...(await store.childSettings(CHILD_K)), weeklyGoal: 3 },
    });
    const unsynced = await store.append(
      'session.started',
      {
        sessionId: 'late',
        budgetMinutes: 10,
        trigger: 'child',
      },
      { childId: CHILD_K },
    );
    await store.logAi({ childId: CHILD_K, skillId: null, text: 'Nice counting!' });

    // Server-authored tombstone (02 §5.9 S2); the id case differs (compared case-insensitively).
    const tomb = serverEvent(
      'child.deleted',
      { childId: CHILD_K.toUpperCase() },
      env.clock.now(),
      null,
      {
        deviceId: FAMILY,
      },
    );
    await store.ingest([tomb], { source: 'server' });

    const events = await store.events();
    expect(events.some((e) => e.childId?.toLowerCase() === CHILD_K)).toBe(false);
    expect(events.some((e) => e.id === unsynced.id)).toBe(false);
    expect(events.find((e) => e.id === tomb.id)).toEqual(tomb);
    expect((await store.allProfiles()).map((p) => p.id)).toEqual([CHILD_G2]);
    expect(await store.allSettings()).toEqual([]);
    expect(await store.aiLog()).toEqual([]);
    expect(await store.skillStates(CHILD_K)).toBeNull();
    expect(await store.deletedChildren()).toEqual(new Set([CHILD_K]));
    expect(await store.db.projections.get(`skills:${CHILD_K}`)).toBeUndefined();

    const { gameData } = fixtureContent();
    expect(await store.island()).toEqual(foldIsland(events, gameData));
    expect(await store.goals()).toEqual(foldGoals(events, { [CHILD_G2]: { weeklyGoal: 6 } }));

    await expect(
      store.append(
        'session.started',
        { sessionId: 'x', budgetMinutes: 10, trigger: 'child' },
        {
          childId: CHILD_K,
        },
      ),
    ).rejects.toMatchObject({ code: 'child_deleted' });
    await expect(store.putProfile(profile(CHILD_K, 'K'))).rejects.toMatchObject({
      code: 'child_deleted',
    });
    expect(await store.mergeProfiles([{ ...profile(CHILD_K, 'K'), updatedAt: 9e12 }])).toBe(0);
    const late = serverEvent('island.named', named('Ghost'), env.clock.now() + DAY, CHILD_K);
    expect((await store.ingest([late], { source: 'server' })).dropped).toBe(1);
    expect((await store.settingsView()).children).not.toHaveProperty(CHILD_K);
  });

  it('applies a tombstone already in the log on open', async () => {
    const env = testEnv();
    const db = env.db();
    await db.open();
    const tomb = serverEvent('child.deleted', { childId: CHILD_K }, 5 * DAY, null, {
      deviceId: FAMILY,
    });
    const stray = serverEvent('island.named', named('Stray'), 6 * DAY, CHILD_K);
    await db.events.bulkPut([
      { ...tomb, synced: 1 },
      { ...stray, synced: 1 },
    ]);
    db.close();
    const store = await track(env.open());
    expect((await store.events()).map((e) => e.id)).toEqual([tomb.id]);
    expect((await store.island()).name).toBeNull();
  });
});

describe('profiles and settings (LWW per document)', () => {
  it('putProfile stamps updatedAt; mergeProfiles keeps the newer whole document', async () => {
    const { env, store } = await familyStore();
    const mine = (await store.allProfiles()).find((p) => p.id === CHILD_K);
    expect(mine?.updatedAt).toBe(env.clock.now());
    const t = env.clock.now();
    const older = { ...profile(CHILD_K, '1', 'Old'), updatedAt: t - 1 };
    const newer = { ...profile(CHILD_K, '1', 'New'), updatedAt: t + 1 };
    expect(await store.mergeProfiles([older, { junk: true }])).toBe(0);
    expect(await store.mergeProfiles([newer])).toBe(1);
    expect((await store.allProfiles()).find((p) => p.id === CHILD_K)).toEqual(newer);
    // The grade moved from K to G1: the child's skills row and the goals row are rebuilt.
    const row = await store.db.projections.get(`skills:${CHILD_K}`);
    expect(row?.version).toMatch(/\|isK=0$/);
  });

  it('settings read with defaults; LWW merge; goal targets follow the settings', async () => {
    const { env, store } = await familyStore();
    await store.ingest(replayEvents(), { source: 'server' });
    const view = await store.settingsView();
    expect(view.family.timezone).toBe('America/Chicago');
    expect(view.family['ai.feedback']).toBe(false);
    expect(view.children[CHILD_K]?.weeklyGoal).toBe(5);
    expect(view.children[CHILD_G2]?.sessionMinutes).toBe(15);

    const t = env.clock.now();
    const doc = {
      key: `child:${CHILD_G2}` as const,
      value: { ...(await store.childSettings(CHILD_G2)), weeklyGoal: 2 },
    };
    const stale = { ...doc, value: { ...doc.value, weeklyGoal: 9 }, updatedAt: t - 5 };
    await store.putSettings(doc);
    expect(await store.mergeSettings([stale])).toBe(0);
    expect((await store.childSettings(CHILD_G2)).weeklyGoal).toBe(2);
    await expectCacheEqualsFold(store, { ...GOALS, [CHILD_G2]: { weeklyGoal: 2 } });

    const fresh = { ...doc, value: { ...doc.value, weeklyGoal: 4 }, updatedAt: t + 5 };
    expect(await store.mergeSettings([fresh])).toBe(1);
    expect(await store.allSettings()).toEqual([fresh]);
    await expectCacheEqualsFold(store, { ...GOALS, [CHILD_G2]: { weeklyGoal: 4 } });
    await expect(
      store.putSettings({ key: 'family', value: { ...view.family, voiceRate: 3 } }),
    ).rejects.toMatchObject({ code: 'invalid_settings' });
  });
});

describe('pairing and the push queue', () => {
  it('adoptFamily re-homes only never-synced events and local profiles', async () => {
    const { env, store } = await familyStore();
    const local = await store.device();
    const a = await store.append('island.named', named('A'), { childId: CHILD_K });
    env.clock.advance(1);
    const b = await store.append('island.named', named('B'), { childId: null });
    await store.markSynced([b.id]);
    const pulled = serverEvent('island.named', named('P'), env.clock.now() + 1, null);
    await store.ingest([pulled], { source: 'server' });

    const familyId = '019a0000-0000-7000-8000-0000000ff002';
    const deviceId = '019a0000-0000-7000-8000-0000000dd002';
    env.clock.advance(1000);
    const dev = await store.adoptFamily({ familyId, deviceId, deviceToken: 'tok' });
    expect(dev).toMatchObject({
      familyId,
      deviceId,
      deviceToken: 'tok',
      pairedAt: env.clock.now(),
    });
    expect(await store.device()).toEqual(dev);

    expect(await store.db.events.get(a.id)).toMatchObject({ familyId, deviceId, synced: 0 });
    expect(await store.db.events.get(b.id)).toMatchObject({
      familyId: local.familyId,
      deviceId: local.deviceId,
    });
    expect(await store.db.events.get(pulled.id)).toMatchObject({
      familyId: FAMILY,
      deviceId: DEVICE,
    });
    for (const p of await store.allProfiles()) expect(p.familyId).toBe(FAMILY);
    // Profiles stamped with the local family id are re-homed too.
    const fresh = await track(testEnv().open());
    const freshDev = await fresh.device();
    await fresh.putProfile({ ...profile(CHILD_K, 'K'), familyId: freshDev.familyId });
    await fresh.adoptFamily({ familyId, deviceId, deviceToken: 'tok' });
    expect((await fresh.allProfiles())[0]?.familyId).toBe(familyId);
    await expect(
      store.adoptFamily({ familyId: 'nope', deviceId, deviceToken: 'tok' }),
    ).rejects.toMatchObject({ code: 'invalid_ids' });
  });

  it('unsynced is oldest-first by (ts, id); markSynced and markRejected take events off the queue', async () => {
    const { env, store } = await familyStore();
    const t = env.clock.now();
    env.clock.set(t + 30);
    const late = await store.append('island.named', named('late'), { childId: null });
    env.clock.set(t + 10);
    const early = await store.append('island.named', named('early'), { childId: null });
    env.clock.set(t + 20);
    const mid = await store.append('island.named', named('mid'), { childId: null });
    env.clock.set(t + 20);
    const mid2 = await store.append('island.named', named('mid2'), { childId: null });
    expect((await store.unsynced()).map((e) => e.id)).toEqual([early.id, mid.id, mid2.id, late.id]);
    expect((await store.unsynced(2)).map((e) => e.id)).toEqual([early.id, mid.id]);
    // Out-of-order appends still leave the cache equal to the fold.
    await expectCacheEqualsFold(store);

    await store.markSynced([early.id]);
    const pushed = [mid, mid2, late];
    await store.markRejected(
      [
        { id: null, index: 0, code: 'validation_failed', message: 'bad' },
        { id: late.id, index: 2, code: 'forbidden', message: 'no' },
      ],
      pushed,
    );
    expect((await store.unsynced()).map((e) => e.id)).toEqual([mid2.id]);
    expect((await store.db.events.get(mid.id))?._rejected).toEqual({
      code: 'validation_failed',
      message: 'bad',
    });
    // Rejected events stay in the local log (and in the folds).
    expect(await store.events()).toHaveLength(4);
    // Queue entries are wire envelopes (no local fields).
    expect(Object.keys((await store.unsynced())[0] ?? {})).not.toContain('synced');
  });
});

describe('persistence and isolation', () => {
  it('events, the queue and the cache survive closing and reopening the database', async () => {
    const { env, store } = await familyStore();
    const a = await store.append('road.extended', { to: 3 }, { childId: CHILD_G2 });
    await store.ingest(replayEvents().slice(0, 300), { source: 'server' });
    const before = await store.db.projections.toArray();
    store.close();

    const again = await track(env.open());
    expect((await again.unsynced()).map((e) => e.id)).toEqual([a.id]);
    expect(await again.db.projections.toArray()).toEqual(before);
    await expectCacheEqualsFold(again);
  });

  it('two database names in one process are independent devices', async () => {
    const env = testEnv();
    const a = await track(env.open('device-a'));
    const b = await track(env.open('device-b'));
    await a.append('island.named', named('A'), { childId: null });
    expect(await b.events()).toEqual([]);
    expect((await b.island()).name).toBeNull();
    expect((await a.island()).name).toBe('A');
    expect((await a.device()).deviceId).not.toBe((await b.device()).deviceId);
  });
});

describe('AI line log', () => {
  it('prunes lines older than 90 days on open and on demand', async () => {
    const env = testEnv();
    const store = await track(env.open());
    await store.logAi({ childId: CHILD_K, skillId: 'CPS.01', text: 'old' });
    env.clock.advance(60 * DAY);
    const recent = await store.logAi({ childId: CHILD_K, skillId: null, text: 'recent' });
    env.clock.advance(31 * DAY);
    expect(await store.pruneAiLog()).toBe(1);
    expect(await store.aiLog()).toEqual([recent]);
    store.close();
    env.clock.advance(60 * DAY);
    const again = await track(env.open());
    expect(await again.aiLog()).toEqual([]);
  });
});
