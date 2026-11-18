import { env } from 'cloudflare:workers';
import { newId, settingsKey, withSettingDefaults } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  api,
  expectError,
  json,
  pairDevice,
  profileFor,
  pullAll,
  roadEvent,
  setupFamily,
  syncOk,
} from './helpers';

const del = (id: string, cookie?: string) =>
  api(`/api/children/${id}`, { method: 'DELETE', cookie });

async function familyWithChild() {
  const family = await setupFamily();
  const tablet = await pairDevice(family.cookie);
  const child = profileFor(family.familyId);
  const childEvents = [
    roadEvent(family.familyId, family.deviceId, { childId: child.id }),
    roadEvent(family.familyId, family.deviceId, { childId: child.id }),
  ];
  const familyEvent = roadEvent(family.familyId, family.deviceId);
  await syncOk(family.deviceToken, {
    events: [...childEvents, familyEvent],
    profiles: [child],
    settings: [
      {
        key: settingsKey(child.id),
        value: withSettingDefaults({ kind: 'child', grade: 'K' }),
        updatedAt: 1,
      },
    ],
  });
  return { family, tablet, child, childEvents, familyEvent };
}

describe('DELETE /api/children/:id', () => {
  it("purges the child's events, settings and profile and keeps one tombstone", async () => {
    const { family, tablet, child, familyEvent } = await familyWithChild();
    const before = Date.now();
    const res = await del(child.id, family.cookie);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });

    const stored = await env.DB.prepare(
      'SELECT type, child_id, device_id, payload_json, ts FROM events ORDER BY seq',
    ).all<{
      type: string;
      child_id: string | null;
      device_id: string;
      payload_json: string;
      ts: number;
    }>();
    expect(stored.results.map((r) => r.type)).toEqual(['road.extended', 'child.deleted']);
    const tomb = stored.results[1];
    expect(tomb?.child_id).toBeNull();
    expect(tomb?.device_id).toBe(family.familyId); // the server pseudo-device (02 §5.9 S2)
    expect(JSON.parse(tomb?.payload_json ?? '{}')).toEqual({ childId: child.id });
    expect(tomb?.ts).toBeGreaterThanOrEqual(before);

    const profile = await env.DB.prepare('SELECT data_json, deleted_at FROM profiles WHERE id = ?')
      .bind(child.id)
      .first<{ data_json: string | null; deleted_at: number | null }>();
    expect(profile?.data_json).toBeNull(); // the name and avatar are gone
    expect(profile?.deleted_at).toBeGreaterThan(0);

    // Every device, including the one that pushed the child's events, pulls the tombstone.
    const pulled = await pullAll(tablet.deviceToken);
    expect(pulled.events.map((e) => e.type)).toEqual(['road.extended', 'child.deleted']);
    expect(pulled.events[0]).toEqual(familyEvent);
    expect(pulled.events[1]).toMatchObject({
      childId: null,
      deviceId: family.familyId,
      familyId: family.familyId,
      type: 'child.deleted',
      v: 1,
      payload: { childId: child.id },
    });
    const own = await syncOk(family.deviceToken);
    expect(own.events.map((e) => e.type)).toEqual(['child.deleted']);
    expect(own.profiles).toEqual([]);
    expect(own.settings).toEqual([]);
  });

  it('keeps stale devices from resurrecting the child', async () => {
    const { family, tablet, child } = await familyWithChild();
    await del(child.id, family.cookie);
    const late = roadEvent(family.familyId, tablet.deviceId, { childId: child.id });
    const res = await syncOk(tablet.deviceToken, {
      events: [late],
      profiles: [{ ...child, updatedAt: child.updatedAt + 1000 }],
      settings: [
        {
          key: settingsKey(child.id),
          value: withSettingDefaults({ kind: 'child', grade: 'K' }),
          updatedAt: 99,
        },
      ],
    });
    // Accepted (so the device stops re-pushing), but not stored.
    expect(res.accepted).toEqual([late.id]);
    expect(res.profiles).toEqual([]);
    expect(res.settings).toEqual([]);
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE child_id = ?')
      .bind(child.id)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('is idempotent: a repeat purges again without a second tombstone', async () => {
    const { family, child } = await familyWithChild();
    await del(child.id, family.cookie);
    // A row that slipped in another way is still purged by the repeat.
    await env.DB.prepare(
      `INSERT INTO events (id, family_id, child_id, device_id, ts, type, payload_json, content_version, received_at)
       VALUES (?, ?, ?, ?, 1, 'road.extended', '{"to":1}', 'x', 1)`,
    )
      .bind(newId(), family.familyId, child.id, family.deviceId)
      .run();
    expect((await del(child.id, family.cookie)).status).toBe(200);
    const rows = await env.DB.prepare(
      "SELECT SUM(type = 'child.deleted') AS tombs, SUM(child_id IS NOT NULL) AS childRows FROM events",
    ).first<{ tombs: number; childRows: number }>();
    expect(rows).toEqual({ tombs: 1, childRows: 0 });
  });

  it('tombstones a child the server has never seen (it may exist only on devices)', async () => {
    const { cookie, deviceToken, familyId } = await setupFamily();
    const unseen = newId();
    expect((await del(unseen, cookie)).status).toBe(200);
    const tablet = await pairDevice(cookie);
    const pulled = await syncOk(tablet.deviceToken);
    expect(pulled.events).toHaveLength(1);
    expect(pulled.events[0]).toMatchObject({ type: 'child.deleted', payload: { childId: unseen } });
    expect(deviceToken && familyId).toBeTruthy();
  });

  it('accepts a relayed copy of the server tombstone but forbids device-made ones', async () => {
    const { family, tablet, child } = await familyWithChild();
    await del(child.id, family.cookie);
    const [tomb] = (await syncOk(tablet.deviceToken)).events.filter(
      (e) => e.type === 'child.deleted',
    );
    const relay = await syncOk(tablet.deviceToken, { events: [tomb] });
    expect(relay.accepted).toEqual([tomb?.id]);
    expect(relay.rejected).toEqual([]);

    const forged = {
      ...roadEvent(family.familyId, tablet.deviceId),
      type: 'child.deleted',
      payload: { childId: newId() },
    };
    const res = await syncOk(tablet.deviceToken, { events: [forged] });
    expect(res.rejected).toEqual([
      { id: forged.id, index: 0, code: 'forbidden', message: expect.any(String) },
    ]);

    // Reusing the id of a stored ordinary event does not make it a relay.
    const ordinary = roadEvent(family.familyId, tablet.deviceId);
    await syncOk(tablet.deviceToken, { events: [ordinary] });
    const disguised = { ...forged, id: ordinary.id };
    const res2 = await syncOk(tablet.deviceToken, { events: [disguised] });
    expect(res2.accepted).toEqual([]);
    expect(res2.rejected).toEqual([
      { id: ordinary.id, index: 0, code: 'forbidden', message: expect.any(String) },
    ]);
  });

  it('requires a parent session and a valid child id', async () => {
    const { cookie, deviceToken } = await setupFamily();
    await expectError(await del(newId()), 401, 'unauthorized');
    await expectError(
      await api(`/api/children/${newId()}`, { method: 'DELETE', token: deviceToken }),
      401,
      'unauthorized',
    );
    await expectError(await del('not-a-child', cookie), 404, 'not_found');
  });
});
