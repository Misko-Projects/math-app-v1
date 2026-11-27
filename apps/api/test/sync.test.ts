import { env } from 'cloudflare:workers';
import { newId, settingsKey, syncResponseSchema, withSettingDefaults } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  api,
  expectError,
  pairDevice,
  profileFor,
  pullAll,
  roadEvent,
  setupFamily,
  sync,
  syncOk,
} from './helpers';

async function twoDevices() {
  const family = await setupFamily();
  const tablet = await pairDevice(family.cookie);
  return {
    family,
    a: { token: family.deviceToken, id: family.deviceId },
    b: { token: tablet.deviceToken, id: tablet.deviceId },
  };
}

async function eventCount(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM events').first<{ n: number }>();
  return row?.n ?? 0;
}

describe('POST /api/sync: push and pull', () => {
  it('relays events to other devices, never echoing a device its own', async () => {
    const { family, a, b } = await twoDevices();
    const e1 = roadEvent(family.familyId, a.id, { payload: { to: 3 } });
    const e2 = roadEvent(family.familyId, a.id, { payload: { to: 4 } });

    const pushed = syncResponseSchema.parse(
      await (await sync(a.token, { events: [e1, e2] })).json(),
    );
    expect(pushed.accepted).toEqual([e1.id, e2.id]);
    expect(pushed.rejected).toEqual([]);
    expect(pushed.events).toEqual([]); // nothing from other devices yet
    expect(pushed.more).toBe(false);

    const pulled = await syncOk(b.token);
    expect(pulled.events).toEqual([e1, e2]);
    expect(pulled.more).toBe(false);

    // B's cursor is past everything; A's next sync gets B's event only.
    const fromB = roadEvent(family.familyId, b.id, { payload: { to: 9 } });
    const bAgain = await syncOk(b.token, { cursor: pulled.cursor, events: [fromB] });
    expect(bAgain.events).toEqual([]);
    const aAgain = await syncOk(a.token, { cursor: pushed.cursor });
    expect(aAgain.events).toEqual([fromB]);
  });

  it('is idempotent: a re-pushed event is accepted again and stored once', async () => {
    const { family, a, b } = await twoDevices();
    const events = [roadEvent(family.familyId, a.id), roadEvent(family.familyId, a.id)];
    const first = await syncOk(a.token, { events });
    const second = await syncOk(a.token, { events, cursor: first.cursor });
    expect(second.accepted).toEqual(events.map((e) => e.id));
    expect(await eventCount()).toBe(2);
    // The same id twice in one push is stored and reported once.
    const dup = roadEvent(family.familyId, a.id);
    const third = await syncOk(a.token, { events: [dup, dup] });
    expect(third.accepted).toEqual([dup.id]);
    expect(await eventCount()).toBe(3);
    expect((await pullAll(b.token)).events).toHaveLength(3);
  });

  it('pages more than 1,000 events with an opaque cursor, in server order', async () => {
    const { family, a, b } = await twoDevices();
    const all = Array.from({ length: 1205 }, (_, i) =>
      roadEvent(family.familyId, a.id, { payload: { to: i } }),
    );
    for (let i = 0; i < all.length; i += 500) {
      const res = await syncOk(a.token, { events: all.slice(i, i + 500) });
      expect(res.accepted).toHaveLength(Math.min(500, all.length - i));
    }

    const page1 = await syncOk(b.token);
    expect(page1.events).toHaveLength(1000);
    expect(page1.more).toBe(true);
    const page2 = await syncOk(b.token, { cursor: page1.cursor });
    expect(page2.events).toHaveLength(205);
    expect(page2.more).toBe(false);
    expect([...page1.events, ...page2.events].map((e) => e.id)).toEqual(all.map((e) => e.id));

    const page3 = await syncOk(b.token, { cursor: page2.cursor });
    expect(page3.events).toEqual([]);
    expect(page3.cursor).toBe(page2.cursor);
  });

  it('skips past its own events when the page is not full', async () => {
    const { family, a } = await twoDevices();
    const res = await syncOk(a.token, { events: [roadEvent(family.familyId, a.id)] });
    expect(Number(res.cursor)).toBeGreaterThan(0);
    const again = await syncOk(a.token, { cursor: res.cursor });
    expect(again.cursor).toBe(res.cursor);
  });

  it('relays an unknown event type unchanged (forward compatibility, 02 §4.2)', async () => {
    const { family, a, b } = await twoDevices();
    const future = {
      ...roadEvent(family.familyId, a.id),
      type: 'boat.launched',
      payload: {
        boatId: 'b-1',
        crew: [{ name: 'guide', n: 2 }],
        meta: { big: 12345678901, ok: true },
      },
    };
    const res = await syncOk(a.token, { events: [future] });
    expect(res.accepted).toEqual([future.id]);
    const pulled = await syncOk(b.token);
    expect(pulled.events).toEqual([future]);
  });

  it('strips unknown payload fields of known types', async () => {
    const { family, a, b } = await twoDevices();
    const e = roadEvent(family.familyId, a.id);
    await syncOk(a.token, { events: [{ ...e, payload: { to: 5, extra: 'dropped' } }] });
    expect((await syncOk(b.token)).events).toEqual([e]);
  });

  it('stamps receivedAt and keeps contentVersion', async () => {
    const { family, a } = await twoDevices();
    const before = Date.now();
    await syncOk(a.token, { events: [roadEvent(family.familyId, a.id)] });
    const row = await env.DB.prepare('SELECT received_at, content_version FROM events').first<{
      received_at: number;
      content_version: string;
    }>();
    expect(row?.received_at).toBeGreaterThanOrEqual(before);
    expect(row?.content_version).toBe('c0ffee12');
  });
});

describe('POST /api/sync: per-event rejection (02 §5.9 S1)', () => {
  it('rejects bad events individually and accepts the rest', async () => {
    const { family, a, b } = await twoDevices();
    const good = roadEvent(family.familyId, a.id);
    const badPayload = { ...roadEvent(family.familyId, a.id), payload: { to: 'far' } };
    const badEnvelope = { ...roadEvent(family.familyId, a.id), surprise: true };
    const tooBig = {
      ...roadEvent(family.familyId, a.id),
      type: 'boat.launched',
      payload: { blob: 'x'.repeat(9000) },
    };
    const otherFamily = roadEvent(newId(), a.id);
    const tombstone = {
      ...roadEvent(family.familyId, a.id),
      type: 'child.deleted',
      payload: { childId: newId() },
    };
    const notAnObject = 'hello';
    const badId = { ...roadEvent(family.familyId, a.id), id: 'nope' };

    const res = await syncOk(a.token, {
      events: [good, badPayload, badEnvelope, tooBig, otherFamily, tombstone, notAnObject, badId],
    });
    expect(res.accepted).toEqual([good.id]);
    expect(res.rejected.map((r) => [r.index, r.code])).toEqual([
      [1, 'validation_failed'],
      [2, 'validation_failed'],
      [3, 'payload_too_large'],
      [4, 'unknown_family'],
      [5, 'forbidden'],
      [6, 'validation_failed'],
      [7, 'validation_failed'],
    ]);
    const byIndex = new Map(res.rejected.map((r) => [r.index, r]));
    expect(byIndex.get(1)?.id).toBe(badPayload.id);
    expect(byIndex.get(6)?.id).toBeNull();
    expect(byIndex.get(7)?.id).toBeNull();
    expect(byIndex.get(1)?.message).toContain('payload.to');
    expect((await syncOk(b.token)).events).toEqual([good]);
  });

  it("forbids authoring as the server's pseudo-device, but allows relays of other devices", async () => {
    const { family, a, b } = await twoDevices();
    const spoofed = roadEvent(family.familyId, family.familyId.toUpperCase());
    const relayed = roadEvent(family.familyId, newId()); // e.g. recorded before a re-pair
    const res = await syncOk(a.token, { events: [spoofed, relayed] });
    expect(res.accepted).toEqual([relayed.id]);
    expect(res.rejected).toEqual([
      { id: spoofed.id, index: 0, code: 'forbidden', message: expect.any(String) },
    ]);
    expect((await syncOk(b.token)).events).toEqual([relayed]);
  });

  it('rejects an oversized envelope per event, keeping its siblings', async () => {
    const { family, a, b } = await twoDevices();
    const good = roadEvent(family.familyId, a.id);
    const huge = roadEvent(family.familyId, a.id, { contentVersion: 'v'.repeat(1100) });
    const res = await syncOk(a.token, { events: [huge, good] });
    expect(res.accepted).toEqual([good.id]);
    expect(res.rejected).toEqual([
      { id: huge.id, index: 0, code: 'payload_too_large', message: expect.any(String) },
    ]);
    expect((await syncOk(b.token)).events).toEqual([good]);
  });

  it('still validates the outer body strictly', async () => {
    const { a } = await twoDevices();
    await expectError(await sync(a.token, { cursor: 'abc' }), 400, 'validation_failed');
    const tooMany = Array.from({ length: 501 }, () => ({}));
    await expectError(await sync(a.token, { events: tooMany }), 400, 'validation_failed');
    await expectError(
      await sync(a.token, { settings: [{ key: 'family', value: {}, updatedAt: 1 }] }),
      400,
      'validation_failed',
    );
  });

  it('rejects an event id another family already holds', async () => {
    const { family, a } = await twoDevices();
    const e = roadEvent(family.familyId, a.id);
    // Simulate another family's copy of the same id.
    await env.DB.prepare(
      `INSERT INTO events (id, family_id, child_id, device_id, ts, type, payload_json, content_version, received_at)
       VALUES (?, ?, NULL, ?, 1, 'road.extended', '{"to":1}', 'x', 1)`,
    )
      .bind(e.id, newId(), newId())
      .run();
    const res = await syncOk(a.token, { events: [e] });
    expect(res.accepted).toEqual([]);
    expect(res.rejected).toEqual([
      { id: e.id, index: 0, code: 'conflict', message: expect.any(String) },
    ]);
  });
});

describe('POST /api/sync: clock skew (08 §4)', () => {
  it('clamps ts more than 24 h ahead to receivedAt and keeps the original as clientTs', async () => {
    const { family, a, b } = await twoDevices();
    const future = Date.now() + 25 * 3600_000;
    const nearFuture = Date.now() + 23 * 3600_000;
    const far = roadEvent(family.familyId, a.id, { ts: future });
    const near = roadEvent(family.familyId, a.id, { ts: nearFuture });
    const before = Date.now();
    await syncOk(a.token, { events: [far, near] });
    const after = Date.now();
    const [gotFar, gotNear] = (await syncOk(b.token)).events;
    expect(gotFar?.clientTs).toBe(future);
    expect(gotFar?.ts).toBeGreaterThanOrEqual(before);
    expect(gotFar?.ts).toBeLessThanOrEqual(after);
    expect(gotNear).toEqual(near); // within the bound: untouched, no clientTs
  });

  it('keeps the original clientTs when a relayed event is clamped again', async () => {
    const { family, a, b } = await twoDevices();
    const original = 1_700_000_000_000;
    const relayed = roadEvent(family.familyId, a.id, {
      ts: Date.now() + 48 * 3600_000,
      clientTs: original,
    });
    await syncOk(a.token, { events: [relayed] });
    const [got] = (await syncOk(b.token)).events;
    expect(got?.clientTs).toBe(original);
    expect(got?.ts).toBeLessThanOrEqual(Date.now());
  });

  it('keeps clientTs on a relayed, already-clamped event', async () => {
    const { family, a, b } = await twoDevices();
    const relayed = roadEvent(family.familyId, a.id, {
      ts: 1_763_000_000_000,
      clientTs: 1_999_000_000_000,
    });
    await syncOk(a.token, { events: [relayed] });
    expect((await syncOk(b.token)).events).toEqual([relayed]);
  });
});

describe('POST /api/sync: clamp echo (02 §5.9 S3)', () => {
  const HOUR = 3600_000;

  it('echoes the stored ts and clientTs of a clamped push, and only of that event', async () => {
    const { family, a } = await twoDevices();
    const future = Date.now() + 48 * HOUR;
    const far = roadEvent(family.familyId, a.id, { ts: future });
    const near = roadEvent(family.familyId, a.id, { ts: Date.now() + 23 * HOUR });
    const before = Date.now();
    const res = syncResponseSchema.parse(
      await (await sync(a.token, { events: [near, far] })).json(),
    );
    const after = Date.now();
    expect(res.accepted).toEqual([near.id, far.id]);
    expect(res.clamped).toEqual([{ id: far.id, ts: expect.any(Number), clientTs: future }]);
    const [echo] = res.clamped;
    expect(echo?.ts).toBeGreaterThanOrEqual(before);
    expect(echo?.ts).toBeLessThanOrEqual(after);
  });

  it('is empty when nothing was clamped', async () => {
    const { family, a } = await twoDevices();
    const res = await syncOk(a.token, { events: [roadEvent(family.familyId, a.id)] });
    expect(res.clamped).toEqual([]);
    expect((await syncOk(a.token)).clamped).toEqual([]); // a pull-only call
  });

  it('gives the origin device the same copy another device pulls (convergence)', async () => {
    const { family, a, b } = await twoDevices();
    const far = roadEvent(family.familyId, a.id, { ts: Date.now() + 48 * HOUR });
    const res = await syncOk(a.token, { events: [far] });
    const [echo] = res.clamped;
    if (!echo) throw new Error('expected a clamp echo');
    // The origin device applies the echo to its local copy ...
    const { clientTs: _none, ...rest } = far;
    const local = {
      ...rest,
      ts: echo.ts,
      ...(echo.clientTs === undefined ? {} : { clientTs: echo.clientTs }),
    };
    // ... and ends up with exactly the copy the second device pulls.
    const [pulled] = (await syncOk(b.token)).events;
    expect(pulled).toEqual(local);
  });

  it('echoes again when the unclamped copy is re-pushed (a lost response), then stops', async () => {
    const { family, a } = await twoDevices();
    const far = roadEvent(family.familyId, a.id, { ts: Date.now() + 48 * HOUR });
    const first = await syncOk(a.token, { events: [far] });
    const second = await syncOk(a.token, { events: [far], cursor: first.cursor });
    expect(second.accepted).toEqual([far.id]);
    expect(second.clamped).toEqual(first.clamped); // the stored copy, not a second clamp
    // Once the device holds the stored copy, re-pushing it needs no echo.
    const [echo] = first.clamped;
    if (!echo) throw new Error('expected a clamp echo');
    const stored = { ...far, ts: echo.ts, clientTs: echo.clientTs };
    expect((await syncOk(a.token, { events: [stored] })).clamped).toEqual([]);
  });

  it('echoes the stored copy when an id is pushed again with another ts', async () => {
    const { family, a } = await twoDevices();
    const e = roadEvent(family.familyId, a.id, { ts: 1_763_000_000_000 });
    await syncOk(a.token, { events: [e] });
    const moved = { ...e, ts: 1_763_000_500_000 };
    const res = await syncOk(a.token, { events: [moved] });
    expect(res.accepted).toEqual([e.id]);
    expect(res.clamped).toEqual([{ id: e.id, ts: e.ts }]); // stored copy has no clientTs
    // Two copies of one id in one push: the first is stored, the echo corrects the second.
    const dup = roadEvent(family.familyId, a.id, { ts: 1_763_000_000_000 });
    const both = await syncOk(a.token, { events: [dup, { ...dup, ts: 1_763_000_900_000 }] });
    expect(both.accepted).toEqual([dup.id]);
    expect(both.clamped).toEqual([]); // the stored copy equals the first pushed copy
  });

  it('keeps a relayed clientTs and echoes the re-clamped ts', async () => {
    const { family, a } = await twoDevices();
    const original = 1_700_000_000_000;
    const relayed = roadEvent(family.familyId, a.id, {
      ts: Date.now() + 48 * HOUR,
      clientTs: original,
    });
    const res = await syncOk(a.token, { events: [relayed] });
    expect(res.clamped).toEqual([{ id: relayed.id, ts: expect.any(Number), clientTs: original }]);
    expect(res.clamped[0]?.ts).toBeLessThanOrEqual(Date.now());
  });

  it("leaves out a deleted child's events, which are accepted but not stored", async () => {
    const { family, a, b } = await twoDevices();
    const child = profileFor(family.familyId);
    await syncOk(a.token, { profiles: [child] });
    const del = await api(`/api/children/${child.id}`, { method: 'DELETE', cookie: family.cookie });
    expect(del.status).toBe(200);
    const late = roadEvent(family.familyId, a.id, {
      childId: child.id,
      ts: Date.now() + 48 * HOUR,
    });
    const res = await syncOk(a.token, { events: [late] });
    expect(res.accepted).toEqual([late.id]);
    expect(res.clamped).toEqual([]);
    // Same when the id is already held by another (surviving) event of the family: that row is
    // not this event's stored copy, so its time is never echoed for it.
    const survivor = roadEvent(family.familyId, a.id, { ts: 1_763_000_000_000 });
    await syncOk(a.token, { events: [survivor] });
    const reused = { ...late, id: survivor.id, ts: 1_763_000_500_000 };
    const again = await syncOk(a.token, { events: [reused] });
    expect(again.accepted).toEqual([survivor.id]);
    expect(again.clamped).toEqual([]);
    // And within one push: the deleted child's copy is skipped, a family-level event under the
    // same unused id is stored, and its time is not echoed for the skipped copy.
    const sharedId = roadEvent(family.familyId, a.id).id;
    const skipped = { ...late, id: sharedId, ts: 1_763_000_000_000 };
    const kept = roadEvent(family.familyId, a.id, { id: sharedId, ts: 1_763_000_700_000 });
    const mixed = await syncOk(a.token, { events: [skipped, kept] });
    expect(mixed.accepted).toEqual([sharedId]);
    expect(mixed.clamped).toEqual([]);
    const [pulled] = (await pullAll(b.token)).events.filter((e) => e.id === sharedId);
    expect(pulled).toEqual(kept);
  });

  it('echoes the stored time of an accepted tombstone relay pushed with another ts', async () => {
    const { family, a, b } = await twoDevices();
    const child = profileFor(family.familyId);
    await syncOk(a.token, { profiles: [child] });
    const del = await api(`/api/children/${child.id}`, { method: 'DELETE', cookie: family.cookie });
    expect(del.status).toBe(200);
    const tomb = (await pullAll(b.token)).events.find((e) => e.type === 'child.deleted');
    if (!tomb) throw new Error('expected the tombstone');
    // An exact relay needs no echo; a relay with a moved ts gets the stored ts back.
    expect((await syncOk(b.token, { events: [tomb] })).clamped).toEqual([]);
    const moved = { ...tomb, ts: tomb.ts + 5_000 };
    const res = await syncOk(b.token, { events: [moved] });
    expect(res.accepted).toEqual([tomb.id]);
    expect(res.clamped).toEqual([{ id: tomb.id, ts: tomb.ts }]);
    // A relay is the same tombstone by its id and deleted child (S2 b), whatever its envelope
    // childId: if it is accepted, it is echoed.
    const odd = { ...moved, id: tomb.id, childId: child.id };
    const oddRes = await syncOk(b.token, { events: [odd] });
    expect(oddRes.accepted).toEqual([tomb.id]);
    expect(oddRes.clamped).toEqual([{ id: tomb.id, ts: tomb.ts }]);
  });
});

describe('POST /api/sync: settings and profiles (LWW)', () => {
  it('resolves settings per document by updatedAt', async () => {
    const { family, a, b } = await twoDevices();
    const v1 = { ...withSettingDefaults({ kind: 'family' }), music: false };
    const v0 = { ...withSettingDefaults({ kind: 'family' }), music: true };
    const child = newId();
    const childDoc = {
      key: settingsKey(child),
      value: withSettingDefaults({ kind: 'child', grade: '2' }),
      updatedAt: 5,
    };
    const first = await syncOk(a.token, {
      settings: [{ key: 'family', value: v1, updatedAt: 10 }, childDoc],
    });
    // Every document of the family comes back, ordered by key.
    expect(first.settings).toEqual([childDoc, { key: 'family', value: v1, updatedAt: 10 }]);
    const familyDoc = (s: typeof first.settings) => s.find((d) => d.key === 'family');

    // An older write loses, an equal timestamp does not overwrite, a newer one wins.
    const older = await syncOk(b.token, { settings: [{ key: 'family', value: v0, updatedAt: 9 }] });
    expect(familyDoc(older.settings)).toEqual({ key: 'family', value: v1, updatedAt: 10 });
    const tie = await syncOk(b.token, { settings: [{ key: 'family', value: v0, updatedAt: 10 }] });
    expect(familyDoc(tie.settings)).toEqual({ key: 'family', value: v1, updatedAt: 10 });
    const newer = await syncOk(b.token, {
      settings: [{ key: 'family', value: v0, updatedAt: 11 }],
    });
    expect(familyDoc(newer.settings)).toEqual({ key: 'family', value: v0, updatedAt: 11 });
    expect(family.familyId).toBeTruthy();
  });

  it('resolves profiles by updatedAt', async () => {
    const { family, a, b } = await twoDevices();
    const p = profileFor(family.familyId, { updatedAt: 100 });
    expect((await syncOk(a.token, { profiles: [p] })).profiles).toEqual([p]);
    const stale = { ...p, name: 'Old', updatedAt: 50 };
    expect((await syncOk(b.token, { profiles: [stale] })).profiles).toEqual([p]);
    const renamed = { ...p, name: 'Addie', updatedAt: 200 };
    expect((await syncOk(b.token, { profiles: [renamed] })).profiles).toEqual([renamed]);
    expect((await syncOk(a.token)).profiles).toEqual([renamed]);
  });

  it('carries the chosen guide with the profile, and an older device without it does not undo it', async () => {
    const { family, a, b } = await twoDevices();
    const p = profileFor(family.familyId, { updatedAt: 100 });
    await syncOk(a.token, { profiles: [p] });
    const chose = { ...p, guide: '22', updatedAt: 150 };
    expect((await syncOk(b.token, { profiles: [chose] })).profiles).toEqual([chose]);
    // A stale copy without the field (a device that had not seen the choice) loses by LWW.
    expect((await syncOk(a.token, { profiles: [p] })).profiles).toEqual([chose]);
  });

  it("refuses another family's profile", async () => {
    const { a } = await twoDevices();
    await expectError(
      await sync(a.token, { profiles: [profileFor(newId())] }),
      403,
      'unknown_family',
    );
  });
});

describe('POST /api/sync: auth and cursors', () => {
  it('requires a device token', async () => {
    await setupFamily();
    await expectError(
      await api('/api/sync', { body: { cursor: null, events: [], settings: [], profiles: [] } }),
      401,
      'unauthorized',
    );
    await expectError(
      await api('/api/sync', {
        token: 'A'.repeat(43),
        body: { cursor: null, events: [], settings: [], profiles: [] },
      }),
      401,
      'unauthorized',
    );
  });

  it('starts over when a cursor is past the end (server data reset or restored)', async () => {
    const { family, a, b } = await twoDevices();
    const e = roadEvent(family.familyId, a.id);
    await syncOk(a.token, { events: [e] });
    const res = await syncOk(b.token, { cursor: '999999' });
    expect(res.events).toEqual([e]);
  });
});
