import {
  type ApiRouteName,
  apiErrorBodySchema,
  apiRoutes,
  BACKUP_FORMAT,
  newId,
  settingsKey,
  withSettingDefaults,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  api,
  type Family,
  json,
  PASSPHRASE,
  PIN,
  profileFor,
  roadEvent,
  sessionCookie,
} from './helpers';

// 08 §9: every route's request and response match the shared Zod schemas (02 §5.7 `apiRoutes`).

/** AI routes are delivered by AI1 (feedback, summary) and AI2 (photo to avatar), not S01. */
const OWNED_ELSEWHERE: ReadonlySet<ApiRouteName> = new Set([
  'aiFeedback',
  'aiAvatarFromPhoto',
  'aiParentSummary',
]);

interface Ctx {
  family: Family;
}

/** `params` fill the shared route template (`route.path`); request URLs are never hard-coded. */
type Case = (
  ctx: Ctx,
) => Promise<{ params?: { id: string }; body?: unknown; cookie?: string; token?: string }>;

/** A representative valid call per route; each request body must satisfy the route's schema. */
const CASES: Partial<Record<ApiRouteName, Case>> = {
  health: async () => ({}),
  setup: async () => ({
    body: { familyName: 'Second', passphrase: PASSPHRASE, pin: PIN, deviceName: 'X' },
  }),
  login: async () => ({ body: { passphrase: PASSPHRASE } }),
  logout: async ({ family }) => ({ cookie: family.cookie }),
  pin: async ({ family }) => ({
    token: family.deviceToken,
    body: { pin: PIN },
  }),
  pairStart: async ({ family }) => ({ cookie: family.cookie }),
  pairComplete: async ({ family }) => {
    const res = await api('/api/devices/pair/start', { method: 'POST', cookie: family.cookie });
    const { code } = await json<{ code: string }>(res);
    return { body: { code, deviceName: 'Tablet' } };
  },
  listDevices: async ({ family }) => ({ cookie: family.cookie }),
  revokeDevice: async ({ family }) => ({
    params: { id: family.deviceId },
    cookie: family.cookie,
  }),
  sync: async ({ family }) => {
    const child = profileFor(family.familyId);
    return {
      token: family.deviceToken,
      body: {
        cursor: null,
        events: [
          roadEvent(family.familyId, family.deviceId, { childId: child.id }),
          { ...roadEvent(family.familyId, family.deviceId), type: 'kite.flown', payload: { h: 3 } },
        ],
        settings: [
          { key: 'family', value: withSettingDefaults({ kind: 'family' }), updatedAt: 1 },
          {
            key: settingsKey(child.id),
            value: withSettingDefaults({ kind: 'child', grade: '1' }),
            updatedAt: 1,
          },
        ],
        profiles: [child],
      },
    };
  },
  exportBackup: async ({ family }) => ({ cookie: family.cookie }),
  importBackup: async ({ family }) => ({
    cookie: family.cookie,
    body: {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      exportedAt: Date.now(),
      familyId: family.familyId,
      events: [roadEvent(family.familyId, family.deviceId)],
      settings: [],
      profiles: [profileFor(family.familyId)],
    },
  }),
  deleteChild: async ({ family }) => ({ params: { id: newId() }, cookie: family.cookie }),
};

/** Fills `:id` in a shared route template; a template without params is used as is. */
function urlFor(template: string, params?: { id: string }): string {
  if (!template.includes(':')) return template;
  if (!params) throw new Error(`${template} needs params`);
  return template.replace(':id', encodeURIComponent(params.id));
}

async function freshFamily(): Promise<Family> {
  const res = await api('/api/setup', {
    body: { familyName: 'Contract', passphrase: PASSPHRASE, pin: PIN, deviceName: 'Laptop' },
  });
  const body = await json<Omit<Family, 'cookie'>>(res);
  return { ...body, cookie: sessionCookie(res) };
}

describe('API contract (08 §9)', () => {
  it('covers every route in apiRoutes except those owned by AI issues', () => {
    const names = Object.keys(apiRoutes) as ApiRouteName[];
    const expected = names.filter((n) => !OWNED_ELSEWHERE.has(n));
    expect(Object.keys(CASES).sort()).toEqual(expected.sort());
  });

  for (const [name, route] of Object.entries(apiRoutes) as [
    ApiRouteName,
    (typeof apiRoutes)[ApiRouteName],
  ][]) {
    const makeCase = CASES[name];
    if (!makeCase) continue;

    it(`${route.method} ${route.path}: request and response match the shared schemas`, async () => {
      // `setup` must run against an empty database; every other route needs a family.
      const family = name === 'setup' ? (null as unknown as Family) : await freshFamily();
      const call = await makeCase({ family });
      if ('request' in route) expect(route.request.safeParse(call.body).success).toBe(true);
      if ('params' in route) expect(route.params.safeParse(call.params).success).toBe(true);
      const res = await api(urlFor(route.path, call.params), {
        method: route.method,
        body: call.body,
        cookie: call.cookie,
        token: call.token,
      });
      expect(res.status, await res.clone().text()).toBeLessThan(300);
      const parsed = route.response.safeParse(await res.json());
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    });

    if (route.auth === 'parent' || route.auth === 'device') {
      it(`${route.method} ${route.path}: requires ${route.auth} auth`, async () => {
        const family = await freshFamily();
        const call = await makeCase({ family });
        const res = await api(urlFor(route.path, call.params), {
          method: route.method,
          body: call.body,
        });
        expect(res.status).toBe(401);
        expect(apiErrorBodySchema.safeParse(await res.json()).success).toBe(true);
      });
    }
  }

  it('error bodies match apiErrorBodySchema', async () => {
    const responses = [
      await api('/api/nope'),
      await api('/api/auth/login', { body: { passphrase: 1 } }),
      await api('/api/auth/login', { body: 'x', contentType: 'text/plain' }),
    ];
    for (const res of responses) {
      expect(apiErrorBodySchema.safeParse(await res.json()).success).toBe(true);
    }
  });
});
