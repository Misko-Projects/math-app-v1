import { env } from 'cloudflare:workers';
import {
  devicesListResponseSchema,
  newId,
  pairCompleteResponseSchema,
  pairStartResponseSchema,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { api, expectError, json, pairDevice, setupFamily, syncOk } from './helpers';

const start = (cookie: string) => api('/api/devices/pair/start', { method: 'POST', cookie });
const complete = (code: string, ip = '198.51.100.1') =>
  api('/api/devices/pair/complete', {
    body: { code, deviceName: 'Tablet' },
    headers: { 'cf-connecting-ip': ip },
  });

describe('POST /api/devices/pair/start', () => {
  it('returns a 6-digit code valid for 10 minutes', async () => {
    const { cookie } = await setupFamily();
    const res = await start(cookie);
    expect(res.status).toBe(201);
    const { code, expiresAt } = pairStartResponseSchema.parse(await res.json());
    expect(code).toMatch(/^\d{6}$/);
    expect(expiresAt).toBeGreaterThan(Date.now() + 9.9 * 60_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 10 * 60_000);
    // Only a hash is stored.
    const row = await env.DB.prepare('SELECT code_hash FROM pair_codes').first<{
      code_hash: string;
    }>();
    expect(row?.code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('requires a parent session', async () => {
    await setupFamily();
    await expectError(
      await api('/api/devices/pair/start', { method: 'POST' }),
      401,
      'unauthorized',
    );
  });
});

describe('POST /api/devices/pair/complete', () => {
  it('pairs a device that can then sync, and the code is single-use', async () => {
    const { cookie, familyId } = await setupFamily();
    const { code } = pairStartResponseSchema.parse(await (await start(cookie)).json());
    const res = await complete(code);
    expect(res.status).toBe(201);
    const paired = pairCompleteResponseSchema.parse(await res.json());
    expect(paired.familyId).toBe(familyId);
    await syncOk(paired.deviceToken);

    await expectError(await complete(code), 400, 'pair_code_invalid');
  });

  it('rejects an expired code', async () => {
    const { cookie } = await setupFamily();
    const { code } = pairStartResponseSchema.parse(await (await start(cookie)).json());
    await env.DB.prepare('UPDATE pair_codes SET expires_at = ?')
      .bind(Date.now() - 1)
      .run();
    await expectError(await complete(code), 410, 'pair_code_expired');
  });

  it('kills a code after 5 wrong tries', async () => {
    const { cookie } = await setupFamily();
    const { code } = pairStartResponseSchema.parse(await (await start(cookie)).json());
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) await expectError(await complete(wrong), 400, 'pair_code_invalid');
    await expectError(await complete(code), 400, 'pair_code_invalid');
  });

  it('rate-limits guessing per IP', async () => {
    const { cookie } = await setupFamily();
    const ip = '198.51.100.77';
    for (let i = 0; i < 10; i++) await complete('123456', ip);
    // Even a fresh valid code is refused from that IP for the rest of the window.
    const { code } = pairStartResponseSchema.parse(await (await start(cookie)).json());
    await expectError(await complete(code, ip), 429, 'rate_limited');
    expect((await complete(code, '198.51.100.78')).status).toBe(201);
  });

  it('validates the code format', async () => {
    await expectError(await complete('12ab'), 400, 'validation_failed');
  });
});

describe('GET /api/devices and DELETE /api/devices/:id', () => {
  it('lists devices and revokes one; a revoked token stops working', async () => {
    const { cookie, deviceId } = await setupFamily();
    const tablet = await pairDevice(cookie, 'Kids tablet');
    await syncOk(tablet.deviceToken); // records last_seen_at

    const list = devicesListResponseSchema.parse(
      await (await api('/api/devices', { cookie })).json(),
    );
    expect(list.devices.map((d) => d.name)).toEqual(['Laptop', 'Kids tablet']);
    const seen = list.devices.find((d) => d.id === tablet.deviceId);
    expect(seen?.lastSeenAt).toBeGreaterThan(0);
    expect(seen?.revokedAt).toBeNull();

    const del = await api(`/api/devices/${tablet.deviceId}`, { method: 'DELETE', cookie });
    expect(del.status).toBe(200);
    expect(await json(del)).toEqual({ ok: true });
    await expectError(
      await api('/api/sync', {
        token: tablet.deviceToken,
        body: { cursor: null, events: [], settings: [], profiles: [] },
      }),
      401,
      'device_revoked',
    );

    const after = devicesListResponseSchema.parse(
      await (await api('/api/devices', { cookie })).json(),
    );
    expect(after.devices.find((d) => d.id === tablet.deviceId)?.revokedAt).toBeGreaterThan(0);
    // Revoking again is harmless; the first revocation time stays.
    const firstRevokedAt = after.devices.find((d) => d.id === tablet.deviceId)?.revokedAt;
    await api(`/api/devices/${tablet.deviceId}`, { method: 'DELETE', cookie });
    const again = devicesListResponseSchema.parse(
      await (await api('/api/devices', { cookie })).json(),
    );
    expect(again.devices.find((d) => d.id === tablet.deviceId)?.revokedAt).toBe(firstRevokedAt);
    // The setup device still works.
    expect(again.devices.find((d) => d.id === deviceId)?.revokedAt).toBeNull();
  });

  it('answers 404 for unknown or malformed device ids', async () => {
    const { cookie } = await setupFamily();
    await expectError(
      await api(`/api/devices/${newId()}`, { method: 'DELETE', cookie }),
      404,
      'not_found',
    );
    await expectError(
      await api('/api/devices/not-an-id', { method: 'DELETE', cookie }),
      404,
      'not_found',
    );
  });

  it('require a parent session', async () => {
    const { deviceToken } = await setupFamily();
    await expectError(await api('/api/devices'), 401, 'unauthorized');
    // A device token is not a parent session.
    await expectError(await api('/api/devices', { token: deviceToken }), 401, 'unauthorized');
  });
});
