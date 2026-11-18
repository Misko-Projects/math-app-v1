import { env } from 'cloudflare:workers';
import { childProfileSchema, syncResponseSchema, uuidV7Schema } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { buildSeed, SEED_PASSPHRASE, SEED_PIN, seedUuidV7 } from '../src/db/seed';
import { hashSecret } from '../src/lib/crypto';
import { api, json, pairDevice, sessionCookie } from './helpers';

// `pnpm db:seed` (scripts/db-seed.ts) runs exactly these statements against local D1.

async function runSeed() {
  const seed = await buildSeed({ now: Date.now(), hash: (s) => hashSecret(s, 1000) });
  for (const statement of seed.statements) await env.DB.prepare(statement).run();
  return seed;
}

describe('local dev seed', () => {
  it('creates a family the real routes accept, with valid child profiles', async () => {
    const seed = await runSeed();
    const login = await api('/api/auth/login', { body: { passphrase: SEED_PASSPHRASE } });
    expect(login.status).toBe(200);
    const cookie = sessionCookie(login);

    const device = await pairDevice(cookie);
    expect(device.familyId).toBe(seed.familyId);
    const pin = await api('/api/auth/pin', { token: device.deviceToken, body: { pin: SEED_PIN } });
    expect(pin.status).toBe(200);

    const res = syncResponseSchema.parse(
      await json(
        await api('/api/sync', {
          token: device.deviceToken,
          body: { cursor: null, events: [], settings: [], profiles: [] },
        }),
      ),
    );
    expect(res.profiles.map((p) => [p.name, p.grade, p.advanced])).toEqual([
      ['Mia', 'K', false],
      ['Leo', '2', true],
    ]);
    for (const p of res.profiles) expect(childProfileSchema.safeParse(p).success).toBe(true);
  });

  it('changes nothing once the island is set up', async () => {
    const first = await runSeed();
    await runSeed();
    const families = await env.DB.prepare('SELECT id FROM families').all<{ id: string }>();
    expect(families.results.map((f) => f.id)).toEqual([first.familyId]);
    const profiles = await env.DB.prepare('SELECT COUNT(*) AS n FROM profiles').first<{
      n: number;
    }>();
    expect(profiles?.n).toBe(2);
  });

  it('mints valid UUIDv7 ids', () => {
    for (let i = 0; i < 50; i++)
      expect(uuidV7Schema.safeParse(seedUuidV7(Date.now())).success).toBe(true);
  });
});
