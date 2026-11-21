// D01 backup (02 §4.4, 02 §5.9 F5/S2): export → import round trip into a second device, idempotent
// re-import, re-homing a file from another family, refusal of invalid files without writes,
// tombstones (purged, never pushed), the push queue and LWW documents.

import {
  type AnyEventEnvelope,
  type BackupFile,
  backupFileSchema,
  type EventPayloads,
  type EventType,
} from '@number-island/shared';
import Dexie, { type Transaction } from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackupError,
  backupFileName,
  backupToJson,
  downloadBackup,
  exportBackup,
  importBackup,
  parseBackup,
  readBackupFile,
} from './backup';
import type { DataStore } from './store';
import {
  CHILD_G2,
  CHILD_K,
  DEVICE,
  FAMILY,
  profile,
  replayEvents,
  type TestEnv,
  testEnv,
} from './store.test-support';

const DAY = 86_400_000;
const CHILD_GONE = '019a0000-0000-7000-8000-00000000c003';
const OTHER_DEVICE = '019a0000-0000-7000-8000-00000000d002';

const open: DataStore[] = [];
async function track(p: Promise<DataStore>): Promise<DataStore> {
  const s = await p;
  open.push(s);
  return s;
}
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

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

const session = (sessionId: string): EventPayloads['session.started'] => ({
  sessionId,
  budgetMinutes: 10,
  trigger: 'child',
});

/** Events of a third child, who is then deleted by the server (02 §5.9 S2). */
function goneChild(ts: number) {
  const events = [serverEvent('session.started', session('gone'), ts, CHILD_GONE)];
  const tomb = serverEvent('child.deleted', { childId: CHILD_GONE }, ts + 1, null, {
    deviceId: FAMILY,
  });
  return { events, tomb };
}

/**
 * The exporting device, paired to FAMILY: the golden replay (two children, many event types),
 * an event of an unknown type, a never-synced local event, three profiles and settings, and a
 * tombstoned third child.
 */
async function sourceStore(env: TestEnv) {
  const store = await track(env.open('source'));
  await store.adoptFamily({ familyId: FAMILY, deviceId: DEVICE, deviceToken: 'tok' });
  await store.putProfile(profile(CHILD_K, 'K', 'Ada'));
  await store.putProfile(profile(CHILD_G2, '2', 'Ben'));
  await store.putProfile(profile(CHILD_GONE, '1', 'Cy'));
  await store.ingest(replayEvents(), { source: 'server' });
  const unknown = serverEvent(
    'future.thing' as EventType,
    { anything: [1, 2] } as never,
    env.clock.now() - DAY,
    CHILD_G2,
  );
  await store.ingest([unknown], { source: 'server' });
  await store.putSettings({
    key: `child:${CHILD_K}`,
    value: { ...(await store.childSettings(CHILD_K)), weeklyGoal: 3 },
  });
  await store.putSettings({
    key: 'family',
    value: { ...(await store.familySettings()), music: false },
  });
  const gone = goneChild(env.clock.now() - DAY / 2);
  await store.ingest(gone.events, { source: 'server' });
  await store.putSettings({
    key: `child:${CHILD_GONE}`,
    value: { ...(await store.childSettings(CHILD_GONE)), weeklyGoal: 2 },
  });
  await store.ingest([gone.tomb], { source: 'server' });
  env.clock.advance(1000);
  const local = await store.append('session.started', session('local'), { childId: CHILD_G2 });
  return { store, unknown, tomb: gone.tomb, local };
}

/** Everything a parent or child can see, for comparing two devices. */
async function snapshot(store: DataStore) {
  return {
    events: await store.events(),
    profiles: await store.allProfiles(),
    settings: await store.allSettings(),
    ...(await projections(store)),
  };
}

async function projections(store: DataStore) {
  return {
    island: await store.island(),
    inventory: await store.inventory(),
    collection: await store.collection(),
    goals: await store.goals(),
    skills: {
      k: await store.skillStates(CHILD_K),
      g2: await store.skillStates(CHILD_G2),
      gone: await store.skillStates(CHILD_GONE),
    },
    deleted: await store.deletedChildren(),
    view: await store.settingsView(),
  };
}

/** A second device of the same family (paired, so its family id is FAMILY). */
async function sameFamilyDevice(env: TestEnv, name = 'target') {
  const store = await track(env.open(name));
  await store.adoptFamily({ familyId: FAMILY, deviceId: OTHER_DEVICE, deviceToken: 'tok2' });
  return store;
}

const ZERO = {
  events: { added: 0, replaced: 0, dropped: 0, invalid: 0 },
  profiles: 0,
  settings: 0,
};

describe('export', () => {
  it('writes every event as a wire envelope, the settings and profiles, in the shared format', async () => {
    const env = testEnv();
    const { store, unknown, tomb, local } = await sourceStore(env);
    const file = await exportBackup(store);
    expect(backupFileSchema.parse(file)).toEqual(file);
    expect(file).toMatchObject({
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: env.clock.now(),
      familyId: FAMILY,
    });
    expect(file.events).toEqual(await store.events());
    expect(file.events.length).toBe(replayEvents().length + 3);
    for (const e of file.events) {
      expect(e).not.toHaveProperty('synced');
      expect(e).not.toHaveProperty('_rejected');
    }
    expect(file.events).toContainEqual(unknown);
    expect(file.events).toContainEqual(tomb);
    expect(file.events).toContainEqual(local);
    expect(file.profiles.map((p) => p.id).sort()).toEqual([CHILD_K, CHILD_G2].sort());
    expect(file.settings.map((s) => s.key).sort()).toEqual([`child:${CHILD_K}`, 'family']);
    expect(backupFileName(file)).toBe('number-island-backup-2026-11-18.json');
    expect(backupFileName({ exportedAt: Date.UTC(2026, 0, 2, 23, 59) })).toBe(
      'number-island-backup-2026-01-02.json',
    );
    expect(parseBackup(backupToJson(file))).toEqual(file);
  });

  it('never writes a picture-password hash: it is a device-local lock (08 §3)', async () => {
    const env = testEnv();
    const { store } = await sourceStore(env);
    const ada = (await store.allProfiles()).find((p) => p.id === CHILD_K);
    if (!ada) throw new Error('no Ada');
    await store.putProfile({ ...ada, picturePasswordHash: 'pbkdf2-sha256$1$eA$eA' });
    const file = await exportBackup(store);
    expect(file.profiles.map((p) => p.picturePasswordHash)).toEqual([null, null]);
    // The device keeps its own.
    const kept = (await store.allProfiles()).find((p) => p.id === CHILD_K);
    expect(kept?.picturePasswordHash).toBe('pbkdf2-sha256$1$eA$eA');
  });

  it('never drops an event: a row no import could accept (over 8 KB) fails the export', async () => {
    const env = testEnv();
    const store = await track(env.open());
    const ok = await store.append('session.started', session('ok'), { childId: CHILD_K });
    const big = {
      ...ok,
      id: '019b0000-0000-7000-8000-0000000000ff',
      type: 'future.big',
      payload: { blob: 'x'.repeat(9000) },
    } as AnyEventEnvelope;
    // Seeded straight into IndexedDB: `append` refuses such a payload itself.
    await store.db.events.put({ ...big, synced: 0 });
    const err = await exportBackup(store).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BackupError);
    expect(err).toMatchObject({
      code: 'export_failed',
      message: expect.stringMatching(/backup could not be made.*limit is 8192/),
    });
    await store.db.events.delete(big.id);
    // The same for the server's envelope cap: type + contentVersion over 1024 bytes.
    const long = { ...ok, id: big.id, contentVersion: 'v'.repeat(1025) } as AnyEventEnvelope;
    await store.db.events.put({ ...long, synced: 0 });
    await expect(exportBackup(store)).rejects.toMatchObject({
      code: 'export_failed',
      message: expect.stringMatching(/backup could not be made.*exceed 1024 bytes/),
    });
    await store.db.events.delete(long.id);
    expect((await exportBackup(store)).events).toEqual([ok]);
  });

  it('reads the device, events, settings and profiles in one read transaction', async () => {
    const env = testEnv();
    const { store } = await sourceStore(env);
    const seen: (Transaction | null)[] = [];
    for (const method of ['events', 'allSettings', 'allProfiles'] as const) {
      const original = store[method].bind(store);
      vi.spyOn(store, method).mockImplementation((async () => {
        seen.push(Dexie.currentTransaction);
        return original();
      }) as never);
    }
    await exportBackup(store);
    expect(seen).toHaveLength(3);
    expect(seen[0]).not.toBeNull();
    expect(seen[0]?.mode).toBe('readonly');
    expect(new Set(seen).size).toBe(1);
  });

  it('a deletion racing the export (second connection) is in the file entirely or not at all', async () => {
    /** One device holding a live third child, and a second connection (another tab) to its IDB. */
    async function race() {
      const env = testEnv();
      const a = await track(env.open('shared'));
      await a.adoptFamily({ familyId: FAMILY, deviceId: DEVICE, deviceToken: 'tok' });
      await a.putProfile(profile(CHILD_GONE, '1', 'Cy'));
      await a.putSettings({
        key: `child:${CHILD_GONE}`,
        value: { ...(await a.childSettings(CHILD_GONE)), weeklyGoal: 2 },
      });
      const gone = goneChild(env.clock.now() - DAY);
      await a.ingest(gone.events, { source: 'server' });
      const b = await track(env.open('shared'));
      return { a, deletion: () => b.ingest([gone.tomb], { source: 'server' }), tomb: gone.tomb };
    }
    /** [has the tombstone, child events, child profiles, child settings] */
    const state = (file: BackupFile, tombId: string) => [
      file.events.some((e) => e.id === tombId),
      file.events.filter((e) => e.childId === CHILD_GONE).length,
      file.profiles.filter((p) => p.id === CHILD_GONE).length,
      file.settings.filter((s) => s.key === `child:${CHILD_GONE}`).length,
    ];
    const BEFORE = [false, 1, 1, 1];
    const AFTER = [true, 0, 0, 0];

    for (let round = 0; round < 4; round += 1) {
      const { a, deletion, tomb } = await race();
      const file =
        round % 2 === 0
          ? (await Promise.all([exportBackup(a), deletion()]))[0]
          : (await Promise.all([deletion(), exportBackup(a)]))[1];
      expect([BEFORE, AFTER], `round ${round}`).toContainEqual(state(file, tomb.id));
      for (const s of open.splice(0)) s.close();
    }

    // Forced interleaving: the deletion is requested right after the export has read the events.
    // It must wait for the export's read transaction, so the file is the pre-deletion state.
    const { a, deletion, tomb } = await race();
    const readEvents = a.events.bind(a);
    let pending: Promise<unknown> | null = null;
    vi.spyOn(a, 'events').mockImplementation(async () => {
      const events = await readEvents();
      // Requested outside the read transaction's zone, as another tab would.
      pending ??= Dexie.ignoreTransaction(deletion);
      return events;
    });
    const file = await exportBackup(a);
    await pending;
    expect(state(file, tomb.id)).toEqual(BEFORE);
    expect(await a.deletedChildren()).toEqual(new Set([CHILD_GONE]));
  });
});

describe('import', () => {
  it('round trip: a second device ends with the same log, documents and projections', async () => {
    const env = testEnv();
    const { store: source, tomb } = await sourceStore(env);
    const json = backupToJson(await exportBackup(source));
    const target = await sameFamilyDevice(env);

    const result = await importBackup(target, json);
    const file = parseBackup(json);
    expect(result).toEqual({
      events: { added: file.events.length, replaced: 0, dropped: 0, invalid: 0 },
      profiles: 2,
      settings: 2,
      rehomed: false,
    });
    const want = await snapshot(source);
    expect(await snapshot(target)).toEqual(want);
    expect(want.skills.k).not.toBeNull();
    expect(want.skills.g2).not.toBeNull();
    expect(want.deleted).toEqual(new Set([CHILD_GONE]));
    expect((await target.events()).find((e) => e.id === tomb.id)).toEqual(tomb);
    // The receiving device's export is the same file, apart from the time it was made.
    env.clock.advance(5000);
    const again = await exportBackup(target);
    expect({ ...again, exportedAt: 0 }).toEqual({ ...file, exportedAt: 0 });
  });

  it('re-importing the same file changes nothing', async () => {
    const env = testEnv();
    const { store: source } = await sourceStore(env);
    const file = await exportBackup(source);
    const target = await sameFamilyDevice(env);
    await importBackup(target, file);
    const before = await snapshot(target);
    const rows = await target.db.events.toArray();
    const cache = await target.db.projections.toArray();
    expect(await importBackup(target, backupToJson(file))).toEqual({ ...ZERO, rehomed: false });
    expect(await snapshot(target)).toEqual(before);
    expect(await target.db.events.toArray()).toEqual(rows);
    expect(await target.db.projections.toArray()).toEqual(cache);
    // Importing a device's own export is a no-op too.
    expect(await importBackup(source, file)).toEqual({ ...ZERO, rehomed: false });
  });

  it('re-homes a file from another family: events, tombstones and profiles', async () => {
    const env = testEnv();
    const { store: source, tomb } = await sourceStore(env);
    const file = await exportBackup(source);
    const target = await track(env.open('elsewhere'));
    const { familyId } = await target.device();
    expect(familyId).not.toBe(FAMILY);

    const result = await importBackup(target, backupToJson(file));
    expect(result.rehomed).toBe(true);
    expect(result.events.added).toBe(file.events.length);
    const events = await target.events();
    expect(events.length).toBe(file.events.length);
    for (const e of events) expect(e.familyId).toBe(familyId);
    expect(events.find((e) => e.id === tomb.id)).toEqual({ ...tomb, familyId, deviceId: familyId });
    expect(events.filter((e) => e.type !== 'child.deleted')).toEqual(
      file.events.filter((e) => e.type !== 'child.deleted').map((e) => ({ ...e, familyId })),
    );
    const profiles = await target.allProfiles();
    expect(profiles).toEqual(file.profiles.map((p) => ({ ...p, familyId })));
    expect(await target.allSettings()).toEqual(file.settings);
    expect(await projections(target)).toEqual(await projections(source));
    expect(await target.deletedChildren()).toEqual(new Set([CHILD_GONE]));
    expect((await target.unsynced(10_000)).some((e) => e.type === 'child.deleted')).toBe(false);

    expect(await importBackup(target, file)).toEqual({ ...ZERO, rehomed: true });
  });

  it('refuses an invalid file with a typed error and writes nothing', async () => {
    const env = testEnv();
    const { store: source } = await sourceStore(env);
    const file = await exportBackup(source);
    const target = await sameFamilyDevice(env);
    await target.append('session.started', session('mine'), { childId: CHILD_K });
    const before = await snapshot(target);
    const rows = await target.db.events.toArray();

    const oversized = serverEvent(
      'future.big' as EventType,
      { blob: 'x'.repeat(8 * 1024 + 1) } as never,
      1,
      null,
    );
    const forged = serverEvent('child.deleted', { childId: CHILD_K }, 2, null); // deviceId DEVICE
    const cases: [unknown, string, RegExp][] = [
      ['{"format": "number-island-backup",', 'invalid_json', /not valid JSON/],
      ['', 'invalid_json', /not valid JSON/],
      [null, 'not_a_backup', /not a Number Island backup/],
      [{ ...file, format: 'other-app' }, 'not_a_backup', /not a Number Island backup/],
      [{ ...file, formatVersion: 2 }, 'unsupported_version', /format version 2/],
      [{ ...file, familyId: 'nope' }, 'invalid_backup', /damaged \(familyId: /],
      [{ ...file, events: [...file.events, { not: 'an event' }] }, 'invalid_backup', /damaged/],
      [{ ...file, events: [...file.events, oversized] }, 'invalid_backup', /limit is 8192/],
      [backupToJson({ ...file, events: [...file.events, oversized] }), 'invalid_backup', /8192/],
      [{ ...file, profiles: [{ junk: true }] }, 'invalid_backup', /damaged \(profiles\.0/],
      [{ ...file, events: [...file.events, forged] }, 'invalid_tombstone', /server-authored/],
    ];
    for (const [input, code, message] of cases) {
      const err = await importBackup(target, input).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err, code).toBeInstanceOf(BackupError);
      expect(err).toMatchObject({ code, message: expect.stringMatching(message) });
    }
    expect(await snapshot(target)).toEqual(before);
    expect(await target.db.events.toArray()).toEqual(rows);
  });

  it("refuses an event over the server's envelope cap (type + contentVersion > 1024 bytes), writing nothing", async () => {
    const env = testEnv();
    const target = await sameFamilyDevice(env);
    await target.append('session.started', session('mine'), { childId: CHILD_K });
    const before = await snapshot(target);
    const rows = await target.db.events.toArray();
    const ok = serverEvent('session.started', session('tiny'), env.clock.now(), CHILD_G2);
    const long = { ...ok, contentVersion: 'v'.repeat(1025) } as AnyEventEnvelope;
    const file: BackupFile = {
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: env.clock.now(),
      familyId: FAMILY,
      events: [long],
      settings: [],
      profiles: [profile(CHILD_G2, '2', 'Ben')],
    };
    expect(backupFileSchema.safeParse(file).success).toBe(true); // only the cap refuses it
    for (const input of [file, backupToJson(file)]) {
      await expect(importBackup(target, input)).rejects.toMatchObject({
        name: 'BackupError',
        code: 'invalid_backup',
        message: expect.stringMatching(/exceed 1024 bytes/),
      });
    }
    expect(await snapshot(target)).toEqual(before);
    expect(await target.db.events.toArray()).toEqual(rows);
    // Exactly at the cap is accepted.
    const at = { ...ok, contentVersion: 'v'.repeat(1024 - 'session.started'.length) };
    await expect(importBackup(target, { ...file, events: [at] })).resolves.toMatchObject({
      events: { added: 1 },
    });
  });

  it('is all or nothing: a failure after the events were ingested rolls them back', async () => {
    const env = testEnv();
    const { store: source } = await sourceStore(env);
    const file = await exportBackup(source);
    const target = await sameFamilyDevice(env);
    const before = await snapshot(target);
    const cache = await target.db.projections.toArray();
    vi.spyOn(target, 'mergeSettings').mockRejectedValue(new Error('disk full'));
    await expect(importBackup(target, file)).rejects.toThrow('disk full');
    expect(await snapshot(target)).toEqual(before);
    expect(await target.db.events.count()).toBe(0);
    expect(await target.db.projections.toArray()).toEqual(cache);
  });

  /** A device with a queued event, and a minimal file around `events` that also updates settings. */
  async function conflictSetup(env: TestEnv) {
    const target = await sameFamilyDevice(env);
    const queued = await target.append('session.started', session('queued'), { childId: CHILD_K });
    const value = { ...(await target.familySettings()), music: true };
    const family = await target.putSettings({ key: 'family', value });
    const fileWith = (events: AnyEventEnvelope[]): BackupFile => ({
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: env.clock.now() + DAY,
      familyId: FAMILY,
      events,
      settings: [
        { key: 'family', value: { ...value, music: false }, updatedAt: family.updatedAt + DAY },
      ],
      profiles: [],
    });
    const expectUntouched = async (before: Awaited<ReturnType<typeof snapshot>>) => {
      expect(await snapshot(target)).toEqual(before);
      expect((await target.unsynced()).map((e) => e.id)).toEqual([queued.id]);
      expect(await target.allSettings()).toEqual([family]);
    };
    return { target, queued, fileWith, expectUntouched };
  }

  it('refuses a tombstone whose id is a queued ordinary event (conflict), writing nothing', async () => {
    const env = testEnv();
    const { target, queued, fileWith, expectUntouched } = await conflictSetup(env);
    const before = await snapshot(target);
    const tomb = serverEvent('child.deleted', { childId: CHILD_G2 }, env.clock.now(), null, {
      id: queued.id,
      deviceId: FAMILY,
    });
    const extra = serverEvent('session.started', session('new'), env.clock.now(), CHILD_G2);
    await expect(importBackup(target, fileWith([extra, tomb]))).rejects.toMatchObject({
      name: 'BackupError',
      code: 'conflict',
      message: expect.stringContaining(queued.id),
    });
    await expectUntouched(before);
    // An ordinary event of another child under that id is a conflict too.
    const other = { ...queued, childId: CHILD_G2 } as AnyEventEnvelope;
    await expect(importBackup(target, fileWith([other]))).rejects.toMatchObject({
      code: 'conflict',
    });
    await expectUntouched(before);
  });

  it('refuses two different events under one id in the file (conflict), writing nothing', async () => {
    const env = testEnv();
    const { target, fileWith, expectUntouched } = await conflictSetup(env);
    const before = await snapshot(target);
    const one = serverEvent('session.started', session('one'), env.clock.now(), CHILD_G2);
    const twin = { ...one, payload: session('two') } as AnyEventEnvelope;
    await expect(importBackup(target, fileWith([one, twin]))).rejects.toMatchObject({
      code: 'conflict',
      message: expect.stringContaining('two different events'),
    });
    await expectUntouched(before);
    // The same event twice (keys in another order) is one event, not a conflict.
    const reordered = Object.fromEntries(Object.entries(one).reverse()) as AnyEventEnvelope;
    const result = await importBackup(target, fileWith([one, reordered]));
    expect(result).toMatchObject({ events: { added: 1 }, settings: 1 });
  });

  it.each([
    ['never paired (a provisional family)', false],
    ['already paired, then switched to another family', true],
  ])(
    'restore → pair → export stays restorable, %s: the child stays deleted, its tombstone unpushed',
    async (_label, pairedFirst) => {
      const env = testEnv();
      const { store: source, tomb } = await sourceStore(env);
      const restored = await track(env.open('restored'));
      if (pairedFirst) {
        // Pairing re-homes only never-synced events: the synced tombstone stays on this family.
        await restored.adoptFamily({
          familyId: '019a0000-0000-7000-8000-0000000ff00b',
          deviceId: '019a0000-0000-7000-8000-0000000dd00b',
          deviceToken: 'tok2',
        });
      }
      await importBackup(restored, await exportBackup(source));
      const familyId = '019a0000-0000-7000-8000-0000000ff00a';
      await restored.adoptFamily({
        familyId,
        deviceId: '019a0000-0000-7000-8000-0000000dd00a',
        deviceToken: 'tok3',
      });
      expect((await restored.unsynced(10_000)).map((e) => e.id)).not.toContain(tomb.id);

      const file = await exportBackup(restored);
      expect(file.familyId).toBe(familyId);
      expect(file.events.find((e) => e.id === tomb.id)).toMatchObject({
        familyId,
        deviceId: familyId,
      });
      for (const e of file.events) expect(e.familyId).toBe(familyId);
      for (const p of file.profiles) expect(p.familyId).toBe(familyId);
      const fresh = await track(env.open('fresh'));
      const result = await importBackup(fresh, backupToJson(file));
      expect(result.events.added).toBe(file.events.length);
      expect(await fresh.deletedChildren()).toEqual(new Set([CHILD_GONE]));
      expect((await fresh.unsynced(10_000)).map((e) => e.id)).not.toContain(tomb.id);
      expect(await projections(fresh)).toEqual(await projections(source));
    },
  );

  it("an imported tombstone purges the child's local data and is never queued for push", async () => {
    const env = testEnv();
    const { store: source, tomb } = await sourceStore(env);
    const file = await exportBackup(source);
    // The target still holds the child: its profile, settings and events (synced and not).
    const target = await sameFamilyDevice(env);
    await target.putProfile(profile(CHILD_GONE, '1', 'Cy'));
    await target.ingest(goneChild(env.clock.now() - 2 * DAY).events, { source: 'server' });
    await target.append('session.started', session('late'), { childId: CHILD_GONE });
    await target.putSettings({
      key: `child:${CHILD_GONE}`,
      value: { ...(await target.childSettings(CHILD_GONE)), weeklyGoal: 4 },
    });
    expect(await target.skillStates(CHILD_GONE)).not.toBeNull();

    const result = await importBackup(target, file);
    expect(result.events.dropped).toBe(0);
    const events = await target.events();
    expect(events.some((e) => e.childId === CHILD_GONE)).toBe(false);
    expect((await target.allProfiles()).some((p) => p.id === CHILD_GONE)).toBe(false);
    expect((await target.allSettings()).some((s) => s.key === `child:${CHILD_GONE}`)).toBe(false);
    expect(await target.skillStates(CHILD_GONE)).toBeNull();
    expect(await target.deletedChildren()).toEqual(new Set([CHILD_GONE]));
    expect(await target.db.events.get(tomb.id)).toMatchObject({ synced: 1 });
    expect((await target.unsynced(10_000)).map((e) => e.id)).not.toContain(tomb.id);
    expect(await projections(target)).toEqual(await projections(source));
  });

  it('queues the imported ordinary events for push', async () => {
    const env = testEnv();
    const { store: source, tomb } = await sourceStore(env);
    const file = await exportBackup(source);
    const target = await sameFamilyDevice(env);
    await importBackup(target, file);
    const queued = (await target.unsynced(10_000)).map((e) => e.id);
    expect(queued).toEqual(file.events.filter((e) => e.id !== tomb.id).map((e) => e.id));
  });

  it('never downgrades newer (or equally new) local settings and profiles', async () => {
    const env = testEnv();
    const { store: source } = await sourceStore(env);
    const file = await exportBackup(source);
    const exported = file.profiles.find((p) => p.id === CHILD_K);
    const target = await sameFamilyDevice(env);
    // Same updatedAt as the file's copy, different content (and smaller as JSON): the local copy stays.
    env.clock.set(exported?.updatedAt ?? 0);
    const tie = await target.putProfile(profile(CHILD_K, 'K', 'Aa'));
    // Newer than the file's copies.
    env.clock.set(file.exportedAt + DAY);
    const newer = await target.putProfile(profile(CHILD_G2, '2', 'Local Ben'));
    const family = await target.putSettings({
      key: 'family',
      value: { ...(await target.familySettings()), voiceRate: 1.2 },
    });
    const kid = await target.putSettings({
      key: `child:${CHILD_K}`,
      value: { ...(await target.childSettings(CHILD_K)), weeklyGoal: 7 },
    });

    const result = await importBackup(target, file);
    expect(result.profiles).toBe(0);
    expect(result.settings).toBe(0);
    const profiles = await target.allProfiles();
    expect(profiles.find((p) => p.id === CHILD_K)).toEqual(tie);
    expect(profiles.find((p) => p.id === CHILD_G2)).toEqual(newer);
    expect(await target.allSettings()).toEqual(expect.arrayContaining([family, kid]));
    expect((await target.childSettings(CHILD_K)).weeklyGoal).toBe(7);
  });
});

describe('browser helpers', () => {
  it('downloadBackup saves the JSON through an object URL; readBackupFile reads it back', async () => {
    const env = testEnv();
    const { store } = await sourceStore(env);
    const file = await exportBackup(store);
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => {
      blob = b;
      return 'blob:backup';
    });
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    try {
      downloadBackup(file);
      expect(clicks).toHaveLength(1);
      expect(clicks[0]?.download).toBe('number-island-backup-2026-11-18.json');
      expect(clicks[0]?.href).toBe('blob:backup');
      expect(clicks[0]?.isConnected).toBe(false);
      await new Promise((r) => setTimeout(r, 0));
      expect(revoke).toHaveBeenCalledWith('blob:backup');
      expect(blob).not.toBeNull();
      const saved = blob as unknown as Blob;
      expect(saved.type).toBe('application/json');
      const text = await readBackupFile(new File([saved], 'backup.json'));
      expect(text).toBe(backupToJson(file));
      expect(parseBackup(text)).toEqual(file);
    } finally {
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });
});
