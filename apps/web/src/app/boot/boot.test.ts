import { afterEach, describe, expect, it } from 'vitest';
import { profile } from '@/data/store.test-support';
import { type AppServices, BootError } from './boot';
import { SERVER_DEVICE, SERVER_FAMILY, TOKEN, testDevice } from './boot.test-support';

// The three boot paths of the app shell (W00): a fresh device that is set up, a returning family,
// and a paired device starting offline. The sync client runs exactly while the device holds a
// token (apps/web/src/data/README.md: create it after adoptFamily, then start).

const open: AppServices[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.dispose();
});
async function track(p: Promise<AppServices>): Promise<AppServices> {
  const s = await p;
  open.push(s);
  return s;
}

describe('boot: fresh setup', () => {
  it('opens a local-only device that does not sync until the family is adopted', async () => {
    const device = testDevice();
    const app = await track(device.boot());

    expect(app.content.contentVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(app.content.store.graph.skills).not.toEqual({});
    expect(app.content.narration['ui.btn.home']).toBeDefined();
    expect(app.sync.isRunning()).toBe(false);
    expect((await app.store.device()).pairedAt).toBeNull();
    expect(await app.sync.syncNow()).toEqual({ kind: 'unpaired' });
    expect(device.net.syncRequests).toEqual([]);
  });

  it('starts syncing with the device token right after adoptFamily (setup or pairing)', async () => {
    const device = testDevice();
    const app = await track(device.boot());
    // Something recorded before setup moves to the server's family and is pushed.
    await app.store.putProfile({
      ...profile('019a0000-0000-7000-8000-0000000ac001', 'K'),
      familyId: (await app.store.device()).familyId,
    });

    const changes: boolean[] = [];
    app.sync.subscribe(() => changes.push(app.sync.isRunning()));
    const record = await app.sync.adopt({
      familyId: SERVER_FAMILY,
      deviceId: SERVER_DEVICE,
      deviceToken: TOKEN,
    });

    expect(record).toMatchObject({ familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE });
    expect(record.pairedAt).not.toBeNull();
    expect(app.sync.isRunning()).toBe(true);
    expect(changes).toEqual([true]);
    await app.sync.syncNow();
    expect(device.net.syncRequests.length).toBeGreaterThan(0);
    const first = device.net.syncRequests[0];
    expect(first?.authorization).toBe(`Bearer ${TOKEN}`);
    expect(first?.body.profiles.map((p) => p.familyId)).toEqual([SERVER_FAMILY]);
  });
});

describe('boot: returning family', () => {
  it('resumes syncing at launch and keeps the family data', async () => {
    const device = testDevice();
    const first = await device.boot();
    await first.sync.adopt({
      familyId: SERVER_FAMILY,
      deviceId: SERVER_DEVICE,
      deviceToken: TOKEN,
    });
    await first.store.putProfile({
      ...profile('019a0000-0000-7000-8000-0000000ac002', '2'),
      familyId: SERVER_FAMILY,
    });
    await first.sync.syncNow();
    first.dispose();
    const before = device.net.syncRequests.length;

    const app = await track(device.boot());
    expect(app.sync.isRunning()).toBe(true);
    expect((await app.store.allProfiles()).map((p) => p.id)).toEqual([
      '019a0000-0000-7000-8000-0000000ac002',
    ]);
    await app.sync.syncNow();
    expect(device.net.syncRequests.length).toBeGreaterThan(before);
    expect(device.net.syncRequests.at(-1)?.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('stays signed out after a sign-out, keeping the local data', async () => {
    const device = testDevice();
    const first = await device.boot();
    await first.sync.adopt({
      familyId: SERVER_FAMILY,
      deviceId: SERVER_DEVICE,
      deviceToken: TOKEN,
    });
    await first.store.putProfile({
      ...profile('019a0000-0000-7000-8000-0000000ac003', 'K'),
      familyId: SERVER_FAMILY,
    });
    await first.sync.signOut();
    expect(first.sync.isRunning()).toBe(false);
    expect((await first.store.device()).deviceToken).toBeUndefined();
    first.dispose();
    const before = device.net.syncRequests.length;

    const app = await track(device.boot());
    expect(app.sync.isRunning()).toBe(false);
    expect(await app.sync.syncNow()).toEqual({ kind: 'unpaired' });
    expect(device.net.syncRequests.length).toBe(before);
    expect(await app.store.allProfiles()).toHaveLength(1);
    // Pairing again starts syncing again.
    await app.sync.adopt({ familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE, deviceToken: TOKEN });
    expect(app.sync.isRunning()).toBe(true);
  });
});

describe('boot: offline start', () => {
  it('opens a paired device with no server and queues play until the server is back', async () => {
    const device = testDevice();
    const first = await device.boot();
    await first.sync.adopt({
      familyId: SERVER_FAMILY,
      deviceId: SERVER_DEVICE,
      deviceToken: TOKEN,
    });
    first.dispose();

    device.net.apiReachable = false;
    device.setOnline(false);
    const app = await track(device.boot());
    expect(app.sync.isRunning()).toBe(true);
    expect(await app.sync.syncNow()).toEqual({ kind: 'offline' });

    // Play still records locally.
    await app.store.append(
      'session.started',
      { sessionId: 's1', budgetMinutes: 10, trigger: 'child' },
      { childId: null },
    );
    expect(await app.store.unsynced()).toHaveLength(1);

    // The browser says online but the server is still unreachable: a failure, not a crash.
    device.setOnline(true);
    expect((await app.sync.syncNow()).kind).toBe('failed');

    device.net.apiReachable = true;
    expect((await app.sync.syncNow()).kind).toBe('synced');
    expect(await app.store.unsynced()).toHaveLength(0);
  });

  it('explains when the content was never downloaded', async () => {
    const device = testDevice();
    device.net.contentReachable = false;
    const err = await device.boot().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BootError);
    expect((err as BootError).code).toBe('content_unreachable');
  });

  it('reports damaged content', async () => {
    const device = testDevice();
    device.net.assets['/content/game.json'] = '{"buildings": 3}';
    const err = await device.boot().catch((e: unknown) => e);
    expect((err as BootError).code).toBe('content_invalid');
  });
});
