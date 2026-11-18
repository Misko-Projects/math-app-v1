import { env } from 'cloudflare:workers';
import { parentSessionResponseSchema, setupResponseSchema } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  api,
  expectError,
  json,
  PASSPHRASE,
  PIN,
  pairDevice,
  sessionCookie,
  setupFamily,
} from './helpers';

const login = (
  passphrase: string,
  init: { origin?: string; headers?: Record<string, string> } = {},
) => api('/api/auth/login', { body: { passphrase }, ...init });

describe('POST /api/setup', () => {
  it('creates the family, the first device and a parent session, once', async () => {
    const res = await api('/api/setup', {
      body: { familyName: 'The Rivers', passphrase: PASSPHRASE, pin: PIN, deviceName: 'Laptop' },
    });
    expect(res.status).toBe(201);
    const body = setupResponseSchema.parse(await res.json());
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^ni_parent=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Max-Age=43200');
    expect(cookie).not.toContain('Secure'); // plain HTTP

    // Secrets are stored hashed (PBKDF2-SHA-256), the token as SHA-256.
    const creds = await env.DB.prepare(
      'SELECT passphrase_hash, pin_hash FROM parent_credentials',
    ).first<{
      passphrase_hash: string;
      pin_hash: string;
    }>();
    expect(creds?.passphrase_hash).toMatch(/^pbkdf2-sha256\$1000\$/);
    expect(creds?.pin_hash).toMatch(/^pbkdf2-sha256\$/);
    expect(JSON.stringify(creds)).not.toContain(PASSPHRASE);
    const device = await env.DB.prepare('SELECT token_hash, family_id FROM devices').first<{
      token_hash: string;
      family_id: string;
    }>();
    expect(device?.family_id).toBe(body.familyId);
    expect(device?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(device?.token_hash).not.toBe(body.deviceToken);

    const again = await api('/api/setup', {
      body: { familyName: 'Other', passphrase: PASSPHRASE, pin: PIN, deviceName: 'X' },
    });
    await expectError(again, 409, 'setup_closed');
  });

  it('lets only one of two racing setups win', async () => {
    const body = { familyName: 'Race', passphrase: PASSPHRASE, pin: PIN, deviceName: 'A' };
    const [a, b] = await Promise.all([api('/api/setup', { body }), api('/api/setup', { body })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM families').first<{ n: number }>();
    expect(count?.n).toBe(1);
    const devices = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices').first<{
      n: number;
    }>();
    expect(devices?.n).toBe(1);
  });

  it('validates the body with the shared schema', async () => {
    const res = await api('/api/setup', {
      body: { familyName: 'X', passphrase: 'short', pin: '12', deviceName: 'A' },
    });
    await expectError(res, 400, 'validation_failed');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with the passphrase and returns a 12 h session', async () => {
    await setupFamily();
    const res = await login(PASSPHRASE);
    expect(res.status).toBe(200);
    const { expiresAt } = parentSessionResponseSchema.parse(await res.json());
    expect(expiresAt).toBeGreaterThan(Date.now() + 11.9 * 3600_000);
    const cookie = sessionCookie(res);
    const devices = await api('/api/devices', { cookie });
    expect(devices.status).toBe(200);
  });

  it('works over plain HTTP on a LAN address: the cookie has no Secure flag', async () => {
    await setupFamily();
    const res = await login(PASSPHRASE, {
      origin: 'http://192.168.1.23:8787',
      headers: { 'cf-connecting-ip': '192.168.1.40' },
    });
    expect(res.status).toBe(200);
    const header = res.headers.get('set-cookie') ?? '';
    expect(header).not.toMatch(/;\s*Secure/i);
    // The browser sends it back on the next LAN request.
    const devices = await api('/api/devices', {
      origin: 'http://192.168.1.23:8787',
      cookie: sessionCookie(res),
    });
    expect(devices.status).toBe(200);
  });

  it('marks the cookie Secure when the request arrived over HTTPS', async () => {
    await setupFamily();
    const direct = await login(PASSPHRASE, { origin: 'https://island.example' });
    expect(direct.headers.get('set-cookie')).toMatch(/;\s*Secure/);
    // `pnpm dev:https`: Vite terminates TLS and forwards from loopback.
    const proxied = await login(PASSPHRASE, {
      headers: { 'cf-connecting-ip': '127.0.0.1', 'x-forwarded-proto': 'https' },
    });
    expect(proxied.headers.get('set-cookie')).toMatch(/;\s*Secure/);
    // A non-loopback peer cannot claim HTTPS through the header.
    const spoofed = await login(PASSPHRASE, {
      headers: { 'cf-connecting-ip': '192.168.1.40', 'x-forwarded-proto': 'https' },
    });
    expect(spoofed.headers.get('set-cookie')).not.toMatch(/;\s*Secure/i);
  });

  it('rejects a wrong passphrase', async () => {
    await setupFamily();
    await expectError(await login('wrong passphrase!'), 401, 'invalid_credentials');
  });

  it('rejects login before setup', async () => {
    await expectError(await login(PASSPHRASE), 401, 'invalid_credentials');
  });

  it('allows 5 attempts per 15 minutes per IP', async () => {
    await setupFamily();
    const from = (ip: string) => ({ headers: { 'cf-connecting-ip': ip } });
    for (let i = 0; i < 5; i++) {
      await expectError(
        await login('wrong passphrase!', from('203.0.113.7')),
        401,
        'invalid_credentials',
      );
    }
    const limited = await login(PASSPHRASE, from('203.0.113.7'));
    await expectError(limited, 429, 'rate_limited');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another IP is unaffected.
    expect((await login(PASSPHRASE, from('203.0.113.8'))).status).toBe(200);
  });

  it('counts LAN clients behind the Vite proxy separately (X-Forwarded-For from loopback)', async () => {
    await setupFamily();
    const via = (client: string) => ({
      headers: { 'cf-connecting-ip': '127.0.0.1', 'x-forwarded-for': client },
    });
    for (let i = 0; i < 5; i++) await login('wrong passphrase!', via('192.168.1.40'));
    await expectError(await login(PASSPHRASE, via('192.168.1.40')), 429, 'rate_limited');
    expect((await login(PASSPHRASE, via('192.168.1.41'))).status).toBe(200);
  });

  it('opens a new window once 15 minutes have passed', async () => {
    await setupFamily();
    const from = { headers: { 'cf-connecting-ip': '203.0.113.9' } };
    for (let i = 0; i < 6; i++) await login('wrong passphrase!', from);
    await expectError(await login(PASSPHRASE, from), 429, 'rate_limited');
    await env.DB.prepare('UPDATE rate_limits SET window_start = window_start - 900001').run();
    expect((await login(PASSPHRASE, from)).status).toBe(200);
  });

  it('clears the count after a successful login', async () => {
    await setupFamily();
    const from = { headers: { 'cf-connecting-ip': '203.0.113.10' } };
    for (let i = 0; i < 4; i++) await login('wrong passphrase!', from);
    expect((await login(PASSPHRASE, from)).status).toBe(200);
    for (let i = 0; i < 4; i++) await login('wrong passphrase!', from);
    expect((await login(PASSPHRASE, from)).status).toBe(200);
  });

  it('never stores client IPs', async () => {
    await setupFamily();
    await login('wrong passphrase!', { headers: { 'cf-connecting-ip': '203.0.113.11' } });
    const rows = await env.DB.prepare('SELECT * FROM rate_limits').all();
    expect(JSON.stringify(rows.results)).not.toContain('203.0.113.11');
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const { cookie } = await setupFamily();
    const res = await api('/api/auth/logout', { method: 'POST', cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('set-cookie')).toMatch(/ni_parent=;.*Max-Age=0/);
    await expectError(await api('/api/devices', { cookie }), 401, 'unauthorized');
  });

  it('requires a parent session', async () => {
    await expectError(await api('/api/auth/logout', { method: 'POST' }), 401, 'unauthorized');
  });
});

describe('parent sessions', () => {
  it('expire after their lifetime', async () => {
    const { cookie } = await setupFamily();
    await env.DB.prepare('UPDATE parent_sessions SET expires_at = ?')
      .bind(Date.now() - 1)
      .run();
    await expectError(await api('/api/devices', { cookie }), 401, 'unauthorized');
  });

  it('reject a forged cookie', async () => {
    await setupFamily();
    await expectError(
      await api('/api/devices', { cookie: `ni_parent=${'A'.repeat(43)}` }),
      401,
      'unauthorized',
    );
  });
});

describe('POST /api/auth/pin', () => {
  it('turns device + PIN into a 10-minute parent session', async () => {
    const { deviceToken } = await setupFamily();
    const res = await api('/api/auth/pin', { token: deviceToken, body: { pin: PIN } });
    expect(res.status).toBe(200);
    const { expiresAt } = parentSessionResponseSchema.parse(await res.json());
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 10 * 60_000);
    expect(expiresAt).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=600');
    expect((await api('/api/devices', { cookie: sessionCookie(res) })).status).toBe(200);
  });

  it('rejects a wrong PIN and rate-limits 5 attempts per device', async () => {
    const { deviceToken, cookie } = await setupFamily();
    for (let i = 0; i < 5; i++) {
      await expectError(
        await api('/api/auth/pin', { token: deviceToken, body: { pin: '0000' } }),
        401,
        'invalid_pin',
      );
    }
    await expectError(
      await api('/api/auth/pin', { token: deviceToken, body: { pin: PIN } }),
      429,
      'rate_limited',
    );
    // Another device has its own budget.
    const other = await pairDevice(cookie);
    const res = await api('/api/auth/pin', { token: other.deviceToken, body: { pin: PIN } });
    expect(res.status).toBe(200);
  });

  it('requires a device token', async () => {
    await setupFamily();
    await expectError(await api('/api/auth/pin', { body: { pin: PIN } }), 401, 'unauthorized');
  });
});

describe('CSRF and request hygiene (08 §3)', () => {
  it('requires application/json on mutating routes', async () => {
    const { cookie } = await setupFamily();
    const asForm = await api('/api/auth/login', {
      body: 'passphrase=x',
      contentType: 'application/x-www-form-urlencoded',
    });
    await expectError(asForm, 415, 'unsupported_media_type');
    const none = await api('/api/devices/pair/start', {
      method: 'POST',
      cookie,
      contentType: null,
    });
    await expectError(none, 415, 'unsupported_media_type');
    const asText = await api('/api/devices/pair/start', {
      method: 'POST',
      cookie,
      contentType: 'text/plain',
    });
    await expectError(asText, 415, 'unsupported_media_type');
    const withCharset = await api('/api/devices/pair/start', {
      method: 'POST',
      cookie,
      contentType: 'application/json; charset=utf-8',
    });
    expect(withCharset.status).toBe(201);
  });

  it('answers malformed JSON with bad_request, not a stack trace', async () => {
    await expectError(await api('/api/auth/login', { body: '{"passphrase":' }), 400, 'bad_request');
  });

  it('caps body sizes', async () => {
    const big = JSON.stringify({ passphrase: 'x'.repeat(10_000) });
    await expectError(await api('/api/auth/login', { body: big }), 413, 'payload_too_large');
  });

  it('marks responses no-store', async () => {
    const { cookie } = await setupFamily();
    const res = await api('/api/devices', { cookie });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await json(res)).toHaveProperty('devices');
  });
});
