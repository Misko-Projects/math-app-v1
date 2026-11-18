import { type AvatarSpec, newId } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  api,
  DAY,
  goldenEvents,
  newDevice,
  pair,
  setupFamily,
  snapshot,
  syncAll,
  workerFetch,
} from './harness';

// D01 acceptance (#15): two simulated devices converge through the real S01 API (golden journey 6
// rests on this); queued events survive a reload and sync later; the clamp echo (02 §5.9 S3) makes
// a device with a clock 48 h ahead converge too, with folds ordered by the server-bounded ts.

const CHILD_A = '019a0000-0000-7000-8000-00000000c001';

/** A paired laptop and tablet of one family. */
async function family() {
  const fam = await setupFamily();
  const laptop = await newDevice('laptop');
  await laptop.store.adoptFamily(fam);
  const tablet = await newDevice('tablet');
  await tablet.store.adoptFamily(await pair(fam.cookie));
  return { fam, laptop, tablet };
}

describe('two devices converge (golden journey 6 foundation)', () => {
  it('ends with the identical log and identical island, inventory, collection, goals and skills', async () => {
    const { fam, laptop, tablet } = await family();
    // Each sibling plays on their own device; family-level events are recorded on the tablet.
    const golden = goldenEvents(fam.familyId);
    await laptop.store.ingest(
      golden.filter((e) => e.childId?.toLowerCase() === CHILD_A),
      { source: 'backup' },
    );
    await tablet.store.ingest(
      golden.filter((e) => e.childId?.toLowerCase() !== CHILD_A),
      { source: 'backup' },
    );
    expect((await laptop.store.unsynced(5000)).length).toBeGreaterThan(500); // several push rounds

    await syncAll(laptop, tablet);

    const a = await snapshot(laptop.store);
    const b = await snapshot(tablet.store);
    expect(a.events).toHaveLength(golden.length);
    expect(b).toEqual(a);
    expect(Object.keys(a.skills)).toHaveLength(2);
    expect(Object.keys(a.island.buildings).length).toBeGreaterThan(0);
    expect(await laptop.store.unsynced()).toEqual([]);
    expect(await tablet.store.unsynced()).toEqual([]);
  });

  it('converges events recorded offline before pairing, then appended live on both devices', async () => {
    const fam = await setupFamily();
    const laptop = await newDevice('laptop');
    const tablet = await newDevice('tablet');
    // Played before setup: the events carry the device's local family id ...
    await laptop.store.append('island.named', { name: 'Pebble Cove' }, { childId: null });
    expect((await laptop.sync.syncNow()).kind).toBe('unpaired');
    // ... and are moved to the server's ids when the device joins the family.
    await laptop.store.adoptFamily(fam);
    await tablet.store.adoptFamily(await pair(fam.cookie));
    await tablet.store.append('road.extended', { to: 3 }, { childId: null });
    await laptop.store.append('road.extended', { to: 5 }, { childId: null });
    await syncAll(laptop, tablet);
    const a = await snapshot(laptop.store);
    expect(await snapshot(tablet.store)).toEqual(a);
    expect(a.island.name).toBe('Pebble Cove');
    expect(a.island.roadLength).toBe(5);
    expect(a.events.every((e) => e.familyId === fam.familyId)).toBe(true);
  });

  it('converges profiles and settings by last writer, and a parent deletion purges everywhere', async () => {
    const { fam, laptop, tablet } = await family();
    const child = {
      id: newId(),
      familyId: fam.familyId,
      name: 'Mo',
      birthYear: 2019,
      grade: '1' as const,
      advanced: false,
      avatar: goldenAvatar(),
      picturePasswordHash: null,
      createdAt: 1,
      updatedAt: 1,
    };
    await laptop.store.putProfile(child);
    await laptop.store.append('session.started', sessionPayload(), { childId: child.id });
    await syncAll(laptop, tablet);
    expect((await tablet.store.allProfiles()).map((p) => p.id)).toEqual([child.id]);
    // A later edit on the tablet wins on both devices.
    await tablet.store.putSettings({
      key: 'family',
      value: { ...(await tablet.store.familySettings()), music: false },
    });
    await syncAll(laptop, tablet);
    expect((await laptop.store.familySettings()).music).toBe(false);

    // The parent deletes the child; the tablet still holds an unsynced event of theirs.
    await tablet.store.append('session.started', sessionPayload(), { childId: child.id });
    const del = await api(`/api/children/${child.id}`, {
      method: 'DELETE',
      body: '{}',
      cookie: fam.cookie,
    });
    expect(del.status).toBe(200);
    await syncAll(laptop, tablet);
    for (const d of [laptop, tablet]) {
      expect(await d.store.allProfiles()).toEqual([]);
      expect((await d.store.events()).filter((e) => e.childId === child.id)).toEqual([]);
      expect(await d.store.deletedChildren()).toEqual(new Set([child.id.toLowerCase()]));
      expect(await d.store.unsynced()).toEqual([]);
    }
    expect(await snapshot(tablet.store)).toEqual(await snapshot(laptop.store));
  });
});

describe('clamp convergence (02 §5.9 S3)', () => {
  it('a device 48 h ahead ends with the same learner and island projections as another device', async () => {
    const fam = await setupFamily();
    const ahead = await newDevice('ahead', { skewMs: 2 * DAY }); // clock 48 h fast
    await ahead.store.adoptFamily(fam);
    const tablet = await newDevice('tablet', { skewMs: 60_000 }); // a minute fast: within the bound
    await tablet.store.adoptFamily(await pair(fam.cookie));

    // The fast device names the island and starts a session for a child.
    const named = await ahead.store.append('island.named', { name: 'Sunny' }, { childId: null });
    await ahead.store.append('session.started', sessionPayload(), { childId: CHILD_A });
    expect((await ahead.sync.syncNow()).kind).toBe('synced');
    // The server clamped its ts to the receive time and echoed it; the local copy now matches.
    const local = (await ahead.store.events()).find((e) => e.id === named.id);
    expect(local?.clientTs).toBe(named.ts);
    expect(local?.ts).toBeLessThan(named.ts - DAY);

    // The tablet renames the island a minute later in real time, which sorts after the clamped
    // ts but long before the fast device's own clock: by the server-bounded ts, "Breezy" wins.
    await tablet.store.append('island.named', { name: 'Breezy' }, { childId: null });
    await tablet.store.append('session.started', sessionPayload(), { childId: CHILD_A });
    await syncAll(ahead, tablet);

    const a = await snapshot(ahead.store);
    const b = await snapshot(tablet.store);
    expect(a.island.name).toBe('Breezy');
    expect(b).toEqual(a);
    expect(a.skills[CHILD_A]).toEqual(b.skills[CHILD_A]);
  });
});

describe('offline behaviour', () => {
  it('queued events survive a reload and sync later', async () => {
    const { laptop, tablet } = await family();
    let up = false;
    const offline = await newDevice('offline-laptop', { sync: { online: () => up } });
    const fam = await laptop.store.device();
    await offline.store.adoptFamily({
      familyId: fam.familyId,
      deviceId: fam.deviceId,
      deviceToken: fam.deviceToken ?? '',
    });
    await offline.store.append('road.extended', { to: 7 }, { childId: null });
    expect((await offline.sync.syncNow()).kind).toBe('offline');

    const reloaded = await offline.reload();
    expect(await reloaded.store.unsynced()).toHaveLength(1);
    up = true;
    expect((await reloaded.sync.syncNow()).kind).toBe('synced');
    expect(await reloaded.store.unsynced()).toEqual([]);
    await syncAll(tablet);
    expect((await tablet.store.island()).roadLength).toBe(7);
  });

  it('keeps the queue through network failures and records the error', async () => {
    const { laptop, tablet } = await family();
    let fail = true;
    const flaky = await newDevice('flaky', {
      sync: {
        fetch: (path, init) =>
          fail ? Promise.reject(new TypeError('Failed to fetch')) : workerFetch(path, init),
      },
    });
    const ids = await laptop.store.device();
    await flaky.store.adoptFamily({
      familyId: ids.familyId,
      deviceId: ids.deviceId,
      deviceToken: ids.deviceToken ?? '',
    });
    await flaky.store.append('road.extended', { to: 4 }, { childId: null });
    const failed = await flaky.sync.syncNow();
    expect(failed.kind).toBe('failed');
    expect((await flaky.store.syncState()).lastError).toMatch(/network/);
    expect(await flaky.store.unsynced()).toHaveLength(1);
    fail = false;
    expect((await flaky.sync.syncNow()).kind).toBe('synced');
    expect((await flaky.store.syncState()).lastError).toBeNull();
    await syncAll(tablet);
    expect((await tablet.store.island()).roadLength).toBe(4);
  });
});

describe('server answers', () => {
  it('stops re-pushing an event the server rejects', async () => {
    const { laptop } = await family();
    // An event of another family (for example from someone else's backup) is refused (S1).
    const foreign = { ...goldenEvents(newId())[0], id: newId() };
    if (!foreign) throw new Error('no golden event');
    await laptop.store.ingest([foreign], { source: 'backup' });
    expect(await laptop.store.unsynced()).toHaveLength(1);
    expect((await laptop.sync.syncNow()).kind).toBe('synced');
    expect(await laptop.store.unsynced()).toEqual([]);
  });

  it('reports a revoked device and does not retry its push as a failure', async () => {
    const { fam, tablet } = await family();
    await tablet.store.append('road.extended', { to: 2 }, { childId: null });
    const { deviceId } = await tablet.store.device();
    const res = await api(`/api/devices/${deviceId}`, {
      method: 'DELETE',
      body: '{}',
      cookie: fam.cookie,
    });
    expect(res.status).toBe(200);
    const outcome = await tablet.sync.syncNow();
    expect(outcome.kind).toBe('revoked');
    expect(await tablet.store.unsynced()).toHaveLength(1); // kept for a re-paired device
  });
});

function sessionPayload() {
  return { sessionId: newId(), budgetMinutes: 10, trigger: 'child' as const };
}

function goldenAvatar(): AvatarSpec {
  return {
    skinTone: 's03',
    faceShape: 'round',
    hairStyle: 'short',
    hairColor: 'brown',
    eyeShape: 'round',
    eyeColor: 'brown',
    eyebrows: 'soft',
    glasses: null,
    freckles: false,
    beautyMark: false,
    top: 'tee',
    topColor: 'blue',
    bottom: 'shorts',
    bottomColor: 'green',
    shoes: 'sneakers',
    shoesColor: 'red',
    hat: null,
    accessory: null,
    buddy: 'pip',
  };
}
