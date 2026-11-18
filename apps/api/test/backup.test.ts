import { env } from 'cloudflare:workers';
import {
  type BackupFile,
  backupFileSchema,
  importResponseSchema,
  newId,
  settingsKey,
  withSettingDefaults,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { batchSql, createDb } from '../src/db/client';
import { TABLE_NAMES } from '../src/db/schema';
import {
  identityGuardSql,
  importConflictIdFromError,
  insertEvents,
  insertEventsSql,
  mergeSettingsSql,
  purgeChildSql,
  tombstoneEvent,
  toStoredEvent,
} from '../src/services/event-store';
import {
  api,
  expectError,
  pairDevice,
  profileFor,
  pullAll,
  roadEvent,
  setupFamily,
  syncOk,
} from './helpers';

async function exportBackup(cookie: string): Promise<BackupFile> {
  const res = await api('/api/export', { cookie });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-disposition')).toMatch(
    /^attachment; filename="number-island-backup-\d{4}-\d{2}-\d{2}\.json"$/,
  );
  return backupFileSchema.parse(await res.json());
}

const importBackup = (cookie: string, body: unknown) => api('/api/import', { cookie, body });

async function wipeAll() {
  await env.DB.batch(TABLE_NAMES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
}

async function seededFamily() {
  const family = await setupFamily();
  const kid = profileFor(family.familyId, { name: 'Ada' });
  const gone = profileFor(family.familyId, { name: 'Bo' });
  const events = [
    roadEvent(family.familyId, family.deviceId, { childId: kid.id }),
    { ...roadEvent(family.familyId, family.deviceId), type: 'boat.launched', payload: { boat: 1 } },
    roadEvent(family.familyId, family.deviceId, { childId: gone.id }),
    roadEvent(family.familyId, family.deviceId, { ts: Date.now() + 30 * 3600_000 }), // clamped
  ];
  const settings = [
    { key: 'family' as const, value: withSettingDefaults({ kind: 'family' }), updatedAt: 5 },
    {
      key: settingsKey(kid.id),
      value: withSettingDefaults({ kind: 'child', grade: 'K' }),
      updatedAt: 6,
    },
  ];
  await syncOk(family.deviceToken, { events, profiles: [kid, gone], settings });
  await api(`/api/children/${gone.id}`, { method: 'DELETE', cookie: family.cookie });
  return { family, kid, gone };
}

describe('GET /api/export', () => {
  it('exports every event in server order, the settings and live profiles', async () => {
    const { family, kid, gone } = await seededFamily();
    const backup = await exportBackup(family.cookie);
    expect(backup.format).toBe('number-island-backup');
    expect(backup.formatVersion).toBe(1);
    expect(backup.familyId).toBe(family.familyId);
    expect(backup.events.map((e) => e.type)).toEqual([
      'road.extended',
      'boat.launched',
      'road.extended',
      'child.deleted',
    ]);
    expect(backup.events.some((e) => e.childId === gone.id)).toBe(false);
    expect(backup.events[2]?.clientTs).toBeGreaterThan(Date.now());
    expect(backup.profiles).toEqual([kid]);
    expect(backup.settings.map((s) => s.key).sort()).toEqual(
      [settingsKey(kid.id), 'family'].sort(),
    );
  });

  it('requires a parent session', async () => {
    const { deviceToken } = await setupFamily();
    await expectError(await api('/api/export'), 401, 'unauthorized');
    await expectError(await api('/api/export', { token: deviceToken }), 401, 'unauthorized');
  });
});

describe('POST /api/import', () => {
  it('round-trips: export, wipe the server, set up again, import, state restored', async () => {
    const { family } = await seededFamily();
    const backup = await exportBackup(family.cookie);

    await wipeAll();
    const fresh = await setupFamily(); // a new family id after data loss
    const res = await importBackup(fresh.cookie, backup);
    expect(res.status).toBe(200);
    expect(importResponseSchema.parse(await res.json())).toEqual({
      imported: { events: 4, settings: 2, profiles: 1 },
    });

    const restored = await exportBackup(fresh.cookie);
    // Re-homed into the new family; otherwise identical.
    const rehome = (b: BackupFile) => ({
      events: b.events.map((e) => ({
        ...e,
        familyId: fresh.familyId,
        deviceId: e.deviceId === family.familyId ? fresh.familyId : e.deviceId,
      })),
      settings: b.settings,
      profiles: b.profiles.map((p) => ({ ...p, familyId: fresh.familyId })),
    });
    expect({
      events: restored.events,
      settings: restored.settings,
      profiles: restored.profiles,
    }).toEqual(rehome(backup));

    // A newly paired device receives the restored log, tombstone included.
    const tablet = await pairDevice(fresh.cookie);
    const pulled = await pullAll(tablet.deviceToken);
    expect(pulled.events.map((e) => e.id)).toEqual(backup.events.map((e) => e.id));
  });

  it('is idempotent: importing into the same family twice writes nothing new', async () => {
    const { family } = await seededFamily();
    const backup = await exportBackup(family.cookie);
    const res = await importBackup(family.cookie, backup);
    expect(importResponseSchema.parse(await res.json())).toEqual({
      imported: { events: 0, settings: 0, profiles: 0 },
    });
  });

  it("applies the backup's tombstones to data already on the server", async () => {
    const family = await setupFamily();
    const child = profileFor(family.familyId);
    await syncOk(family.deviceToken, {
      profiles: [child],
      events: [roadEvent(family.familyId, family.deviceId, { childId: child.id })],
    });
    const tombstone = {
      ...roadEvent(family.familyId, family.familyId),
      type: 'child.deleted',
      payload: { childId: child.id },
    };
    const backup: BackupFile = {
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: Date.now(),
      familyId: family.familyId,
      events: [tombstone as BackupFile['events'][number]],
      settings: [],
      profiles: [],
    };
    const res = await importBackup(family.cookie, backup);
    expect(res.status).toBe(200);
    const left = await env.DB.prepare('SELECT type FROM events ORDER BY seq').all<{
      type: string;
    }>();
    expect(left.results.map((r) => r.type)).toEqual(['child.deleted']);
    expect((await syncOk(family.deviceToken)).profiles).toEqual([]);
  });

  it('refuses, before any write, a tombstone whose id is held by a different event', async () => {
    const family = await setupFamily();
    const child = profileFor(family.familyId);
    const ordinary = roadEvent(family.familyId, family.deviceId, { childId: child.id });
    await syncOk(family.deviceToken, { profiles: [child], events: [ordinary] });
    const backup: BackupFile = {
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: Date.now(),
      familyId: family.familyId,
      events: [
        {
          ...roadEvent(family.familyId, family.familyId),
          id: ordinary.id,
          type: 'child.deleted',
          payload: { childId: child.id },
        } as BackupFile['events'][number],
      ],
      settings: [],
      profiles: [],
    };
    await expectError(await importBackup(family.cookie, backup), 409, 'conflict');
    expect((await syncOk(family.deviceToken)).profiles).toEqual([child]);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM events').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("refuses a tombstone that reuses another child's tombstone id, leaving that child intact", async () => {
    const family = await setupFamily();
    const a = profileFor(family.familyId, { name: 'A' });
    const b = profileFor(family.familyId, { name: 'B' });
    const bEvent = roadEvent(family.familyId, family.deviceId, { childId: b.id });
    await syncOk(family.deviceToken, { profiles: [a, b], events: [bEvent] });
    await api(`/api/children/${a.id}`, { method: 'DELETE', cookie: family.cookie });
    const aTomb = (await exportBackup(family.cookie)).events.find(
      (e) => e.type === 'child.deleted',
    );
    if (!aTomb) throw new Error('expected a tombstone');
    const forged = { ...aTomb, payload: { childId: b.id } } as BackupFile['events'][number];
    const backup: BackupFile = {
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: Date.now(),
      familyId: family.familyId,
      events: [forged],
      settings: [],
      profiles: [],
    };
    await expectError(await importBackup(family.cookie, backup), 409, 'conflict');
    expect((await syncOk(family.deviceToken)).profiles).toEqual([b]);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE child_id = ?')
      .bind(b.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(1);
  });

  it('rolls the whole import back when a conflicting event lands after its read', async () => {
    const family = await setupFamily();
    const x = newId(); // a child with an ordinary event
    const b = newId(); // the child the import wants to tombstone
    const db = createDb(env.DB);
    // After the import's read, a sync stores an ordinary event of child X under the id the import
    // will use for its tombstone of child B.
    const clash = toStoredEvent(
      roadEvent(family.familyId, family.deviceId, { childId: x }),
      Date.now(),
    );
    await insertEvents(db, family.familyId, [clash], Date.now());
    const importTomb = tombstoneEvent(clash.id, family.familyId, b, Date.now());
    const fresh = toStoredEvent(roadEvent(family.familyId, family.deviceId), Date.now());
    const settingsDoc = {
      key: 'family' as const,
      value: withSettingDefaults({ kind: 'family' }),
      updatedAt: 42,
    };
    const failure = await batchSql(db, [
      // `fresh` comes before the guard: it proves earlier writes of the batch are undone too.
      ...insertEventsSql(family.familyId, [fresh, importTomb], Date.now()),
      ...identityGuardSql(family.familyId, [
        { id: fresh.id, type: fresh.type, deletedChild: null },
        { id: clash.id, type: 'child.deleted', deletedChild: b },
      ]),
      ...purgeChildSql(family.familyId, b, Date.now(), null),
      ...mergeSettingsSql(family.familyId, [settingsDoc]),
    ]).then(
      () => null,
      (err: unknown) => err,
    );
    expect(failure).not.toBeNull();
    expect(importConflictIdFromError(failure)).toBe(clash.id);
    const rows = await env.DB.prepare(
      'SELECT (SELECT COUNT(*) FROM events WHERE id = ?1) AS fresh, (SELECT COUNT(*) FROM settings) AS settings',
    )
      .bind(fresh.id)
      .first<{ fresh: number; settings: number }>();
    expect(rows).toEqual({ fresh: 0, settings: 0 });

    // A concurrent delete of child X now removes the conflicting row, so a re-read would find no
    // conflict; the error still names it, which is what the route answers 409 from.
    await api(`/api/children/${x}`, { method: 'DELETE', cookie: family.cookie });
    const gone = await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE id = ?')
      .bind(clash.id)
      .first<{ n: number }>();
    expect(gone?.n).toBe(0);
    expect(importConflictIdFromError(failure)).toBe(clash.id);
    expect(importConflictIdFromError(new Error('D1_ERROR: something else'))).toBeNull();

    // A matching identity passes the guard.
    await batchSql(db, [
      ...identityGuardSql(family.familyId, [
        { id: fresh.id, type: fresh.type, deletedChild: null },
      ]),
      ...mergeSettingsSql(family.familyId, [settingsDoc]),
    ]);
    const m = await env.DB.prepare('SELECT COUNT(*) AS n FROM settings').first<{ n: number }>();
    expect(m?.n).toBe(1);
  });

  it('lets only one of two racing imports with clashing tombstone ids apply', async () => {
    const family = await setupFamily();
    const tombId = newId();
    const make = (child: string, music: boolean): BackupFile => ({
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: Date.now(),
      familyId: family.familyId,
      events: [
        {
          ...roadEvent(family.familyId, family.familyId),
          id: tombId,
          type: 'child.deleted',
          payload: { childId: child },
        } as BackupFile['events'][number],
      ],
      settings: [
        {
          key: 'family',
          value: { ...withSettingDefaults({ kind: 'family' }), music },
          updatedAt: 7,
        },
      ],
      profiles: [],
    });
    const [r1, r2] = await Promise.all([
      importBackup(family.cookie, make(newId(), true)),
      importBackup(family.cookie, make(newId(), false)),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const winnerMusic = r1.status === 200;
    const docs = (await syncOk(family.deviceToken)).settings;
    expect(docs).toHaveLength(1);
    expect(docs[0]?.value).toMatchObject({ music: winnerMusic });
  });

  it('treats duplicate events that differ only in key order as the same event', async () => {
    const family = await setupFamily();
    const base = { ...roadEvent(family.familyId, family.deviceId), type: 'kite.flown' };
    const one = { ...base, payload: { a: 1, b: { c: 2, d: 3 } } };
    const reordered = { ...base, payload: { b: { d: 3, c: 2 }, a: 1 } };
    const backup = {
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: Date.now(),
      familyId: family.familyId,
      events: [one, reordered],
      settings: [],
      profiles: [],
    };
    const ok = await importBackup(family.cookie, backup);
    expect(ok.status).toBe(200);
    expect(importResponseSchema.parse(await ok.json()).imported.events).toBe(1);
    const changed = { ...base, id: newId(), payload: { a: 1 } };
    const changedTwin = { ...changed, payload: { a: 2 } };
    await expectError(
      await importBackup(family.cookie, { ...backup, events: [changed, changedTwin] }),
      409,
      'conflict',
    );
  });

  it('refuses a backup with two different events under one id', async () => {
    const family = await setupFamily();
    const e = roadEvent(family.familyId, family.deviceId);
    const twin = { ...e, payload: { to: 99 } };
    const backup = {
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: Date.now(),
      familyId: family.familyId,
      events: [e, twin],
      settings: [],
      profiles: [],
    };
    await expectError(await importBackup(family.cookie, backup), 409, 'conflict');
    // An exact duplicate is harmless.
    const res = await importBackup(family.cookie, { ...backup, events: [e, e] });
    expect(importResponseSchema.parse(await res.json()).imported.events).toBe(1);
  });

  it('refuses tombstones that are not server-authored', async () => {
    const family = await setupFamily();
    const child = profileFor(family.familyId);
    await syncOk(family.deviceToken, { profiles: [child] });
    const base = {
      format: 'number-island-backup' as const,
      formatVersion: 1 as const,
      exportedAt: Date.now(),
      familyId: family.familyId,
      settings: [],
      profiles: [],
    };
    const tomb = (overrides: object) =>
      ({
        ...roadEvent(family.familyId, family.familyId),
        type: 'child.deleted',
        payload: { childId: child.id },
        ...overrides,
      }) as BackupFile['events'][number];
    for (const bad of [{ childId: child.id }, { deviceId: family.deviceId }]) {
      const res = await importBackup(family.cookie, { ...base, events: [tomb(bad)] });
      await expectError(res, 400, 'validation_failed');
    }
    expect((await syncOk(family.deviceToken)).profiles).toEqual([child]);
  });

  it('keeps newer server settings and profiles (LWW)', async () => {
    const { family, kid } = await seededFamily();
    const backup = await exportBackup(family.cookie);
    const newer = { ...kid, name: 'Ada Lovelace', updatedAt: kid.updatedAt + 10 };
    await syncOk(family.deviceToken, { profiles: [newer] });
    const res = await importBackup(family.cookie, backup);
    expect(importResponseSchema.parse(await res.json()).imported.profiles).toBe(0);
    expect((await syncOk(family.deviceToken)).profiles).toEqual([newer]);
  });

  it('validates the whole file strictly', async () => {
    const family = await setupFamily();
    const bad = {
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: 1,
      familyId: family.familyId,
      events: [{ ...roadEvent(family.familyId, family.deviceId), payload: { to: 'x' } }],
      settings: [],
      profiles: [],
    };
    await expectError(await importBackup(family.cookie, bad), 400, 'validation_failed');
    await expectError(
      await importBackup(family.cookie, { ...bad, events: [], format: 'zip' }),
      400,
      'validation_failed',
    );
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM events').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('requires a parent session', async () => {
    const { deviceToken, familyId } = await setupFamily();
    const body = {
      format: 'number-island-backup',
      formatVersion: 1,
      exportedAt: 1,
      familyId,
      events: [],
      settings: [],
      profiles: [],
    };
    await expectError(await api('/api/import', { body }), 401, 'unauthorized');
    await expectError(await api('/api/import', { body, token: deviceToken }), 401, 'unauthorized');
    expect(newId()).toBeTruthy();
  });
});
