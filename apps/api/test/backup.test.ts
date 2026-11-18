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
import { TABLE_NAMES } from '../src/db/schema';
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
