import { afterEach, describe, expect, it, vi } from 'vitest';
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
    // The client's own start trigger syncs: no manual call.
    await vi.waitFor(() => expect(device.net.syncRequests.length).toBeGreaterThan(0));
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
    // Launch alone syncs (the client's start trigger), with no manual call.
    await vi.waitFor(() => expect(device.net.syncRequests.length).toBeGreaterThan(before));
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

describe('boot: damaged skill graph', () => {
  const graphWith = (
    device: ReturnType<typeof testDevice>,
    patch: (g: Record<string, unknown>) => void,
  ) => {
    const g = JSON.parse(device.net.assets['/content/graph.json'] as string) as Record<
      string,
      unknown
    >;
    patch(g);
    device.net.assets['/content/graph.json'] = JSON.stringify(g);
  };

  it.each([
    ['without gateways', (g: Record<string, unknown>) => delete g.gateways],
    ['with a bad depth map', (g: Record<string, unknown>) => (g.depth = { 'CNT.01': 'deep' })],
    ['with a missing descendants map', (g: Record<string, unknown>) => delete g.descendants2],
  ])('reports a graph %s as damaged content', async (_name, patch) => {
    const device = testDevice();
    graphWith(device, patch);
    const err = await device.boot().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BootError);
    expect((err as BootError).code).toBe('content_invalid');
  });

  it.each([
    ['a bad entry', '{"CNT.01.t1": {"min": "low"}}'],
    ['null', 'null'],
    ['false', 'false'],
    ['an array', '[]'],
  ])('reports template statistics holding %s as damaged content', async (_name, body) => {
    const device = testDevice();
    const index = JSON.parse(device.net.assets['/content/index.json'] as string) as {
      files: Record<string, string>;
    };
    index.files['template-stats.json'] = '/content/template-stats.json';
    device.net.assets['/content/index.json'] = JSON.stringify(index);
    device.net.assets['/content/template-stats.json'] = body;
    const err = await device.boot().catch((e: unknown) => e);
    expect((err as BootError).code).toBe('content_invalid');
  });

  it('boots with valid template statistics, and without the file', async () => {
    const device = testDevice();
    const index = JSON.parse(device.net.assets['/content/index.json'] as string) as {
      files: Record<string, string>;
    };
    index.files['template-stats.json'] = '/content/template-stats.json';
    device.net.assets['/content/index.json'] = JSON.stringify(index);
    device.net.assets['/content/template-stats.json'] = JSON.stringify({
      'CNT.01.t1': { min: 1, p10: 2, median: 3, p90: 4, max: 5, distinct: 6 },
    });
    const app = await track(device.boot());
    expect(app.content.store.graph.templateStats['CNT.01.t1']?.median).toBe(3);
    // (Every other test boots from an index that omits the file.)
  });
});

describe('sync lifecycle: sign-out and re-pairing', () => {
  const ids = { familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE, deviceToken: TOKEN };

  async function pairedApp() {
    const device = testDevice();
    const app = await track(device.boot());
    await app.sync.adopt(ids);
    await vi.waitFor(() => expect(device.net.syncRequests.length).toBeGreaterThan(0));
    await app.sync.syncNow();
    return { device, app };
  }

  it('applies nothing a sync in flight receives after sign-out, and sends nothing more', async () => {
    const { device, app } = await pairedApp();
    const cursorBefore = (await app.store.syncState()).cursor;
    let release = () => {};
    device.net.holdSync = new Promise<void>((r) => {
      release = r;
    });
    device.net.syncAnswer = {
      more: true,
      cursor: '999',
      profiles: [
        {
          ...profile('019a0000-0000-7000-8000-0000000ac0ff', 'K', 'Late'),
          familyId: SERVER_FAMILY,
        },
      ],
    };
    const before = device.net.syncRequests.length;
    const pending = app.sync.syncNow();
    await vi.waitFor(() => expect(device.net.syncRequests.length).toBe(before + 1));

    // Sign-out waits for the run in flight to end; the held answer then arrives too late.
    const signingOut = app.sync.signOut();
    release();
    await signingOut;
    expect(await pending).toEqual({ kind: 'stopped' });
    expect((await app.store.allProfiles()).map((p) => p.name)).not.toContain('Late');
    expect((await app.store.syncState()).cursor).toBe(cursorBefore);
    // No follow-up round with the removed token.
    expect(device.net.syncRequests.length).toBe(before + 1);
  });

  it('ends a manual sync queued behind the run in flight when signing out', async () => {
    const { device, app } = await pairedApp();
    let release = () => {};
    device.net.holdSync = new Promise<void>((r) => {
      release = r;
    });
    const before = device.net.syncRequests.length;
    const active = app.sync.syncNow();
    await vi.waitFor(() => expect(device.net.syncRequests.length).toBe(before + 1));
    const queued = app.sync.syncNow(); // waits behind the active run
    const signingOut = app.sync.signOut();
    release();
    await signingOut;
    expect(await active).toEqual({ kind: 'stopped' });
    expect(await queued).toEqual({ kind: 'stopped' });
    // A sync asked for after the sign-out started runs only once it finished: no token, no send.
    expect(await app.sync.syncNow()).toEqual({ kind: 'unpaired' });
    await new Promise((r) => setTimeout(r, 20));
    expect(device.net.syncRequests.length).toBe(before + 1);
  });

  it('reports that resume did not start when the app was torn down meanwhile', async () => {
    const device = testDevice();
    const first = await device.boot();
    await first.sync.adopt(ids);
    first.dispose();
    const app = await track(
      device.boot({ sync: { online: () => true, setTimer: () => 0, clearTimer: () => {} } }),
    );
    // Boot resumed it; tear down and ask again: the lookup resolves after the teardown.
    app.sync.stop();
    expect(await app.sync.resume()).toBe(false);
    expect(app.sync.isRunning()).toBe(false);
  });

  it('lets the last request win when adoption and sign-out overlap', async () => {
    const device = testDevice();
    const app = await track(device.boot());
    const adopting = app.sync.adopt(ids);
    const signingOut = app.sync.signOut();
    await Promise.all([adopting, signingOut]);
    expect((await app.store.device()).deviceToken).toBeUndefined();
    expect(app.sync.isRunning()).toBe(false);

    // And the other way round: sign-out first, then pairing, ends paired and syncing.
    const out = app.sync.signOut();
    const back = app.sync.adopt(ids);
    await Promise.all([out, back]);
    expect((await app.store.device()).deviceToken).toBe(TOKEN);
    expect(app.sync.isRunning()).toBe(true);
  });

  it('does not restart after app teardown, even for an adoption still in progress', async () => {
    const device = testDevice();
    const app = await track(device.boot());
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const adoptFamily = app.store.adoptFamily.bind(app.store);
    app.store.adoptFamily = async (x) => {
      const record = await adoptFamily(x);
      await held; // committed, not yet returned
      return record;
    };
    const adopting = app.sync.adopt(ids);
    app.sync.stop(); // app teardown
    release();
    await adopting;
    expect(app.sync.isRunning()).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(device.net.syncRequests).toHaveLength(0);
  });

  it('keeps the existing pairing syncing when a re-pair is refused', async () => {
    const { app } = await pairedApp();
    await expect(
      app.sync.adopt({ familyId: SERVER_FAMILY, deviceId: 'not-an-id', deviceToken: 'short' }),
    ).rejects.toThrow();
    expect((await app.store.device()).deviceToken).toBe(TOKEN);
    expect(app.sync.isRunning()).toBe(true);
  });
});
