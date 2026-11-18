import { exports } from 'cloudflare:workers';
import {
  type AnyEventEnvelope,
  type ChildProfile,
  type EventEnvelope,
  newId,
  type PairCompleteResponse,
  type PairStartResponse,
  type SetupResponse,
  type SyncResponse,
} from '@number-island/shared';
import { expect } from 'vitest';

// Requests go through the real Worker entrypoint (wrangler.jsonc bindings, migrated local D1).

export const ORIGIN = 'http://island.test';
export const PASSPHRASE = 'correct horse battery';
export const PIN = '2468';

export interface ApiInit {
  method?: string;
  body?: unknown;
  cookie?: string;
  token?: string;
  headers?: Record<string, string>;
  /** Overrides the default `application/json` content type; `null` sends none. */
  contentType?: string | null;
  origin?: string;
}

export async function api(path: string, init: ApiInit = {}): Promise<Response> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  const headers: Record<string, string> = { ...init.headers };
  const contentType = init.contentType === undefined ? 'application/json' : init.contentType;
  if (method !== 'GET' && contentType !== null) headers['content-type'] = contentType;
  if (init.cookie) headers.cookie = init.cookie;
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  return exports.default.fetch(`${init.origin ?? ORIGIN}${path}`, {
    method,
    headers,
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === 'string'
          ? init.body
          : JSON.stringify(init.body),
  });
}

/** The `name=value` part of the parent session cookie from a response. */
export function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie');
  expect(header, 'expected a Set-Cookie header').toBeTruthy();
  const pair = (header as string).split(';')[0] as string;
  expect(pair.startsWith('ni_parent=')).toBe(true);
  return pair;
}

export async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function expectError(res: Response, status: number, code: string): Promise<void> {
  expect(res.status).toBe(status);
  const body = await json<{ error: { code: string; message: string } }>(res);
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
  expect(JSON.stringify(body)).not.toMatch(/at .+\.ts:\d+/); // never a stack trace
}

export interface Family extends SetupResponse {
  cookie: string;
}

export async function setupFamily(): Promise<Family> {
  const res = await api('/api/setup', {
    body: { familyName: 'The Rivers', passphrase: PASSPHRASE, pin: PIN, deviceName: 'Laptop' },
  });
  expect(res.status).toBe(201);
  const cookie = sessionCookie(res);
  return { ...(await json<SetupResponse>(res)), cookie };
}

export async function pairDevice(cookie: string, deviceName = 'Tablet') {
  const start = await api('/api/devices/pair/start', { method: 'POST', cookie });
  expect(start.status).toBe(201);
  const { code } = await json<PairStartResponse>(start);
  const done = await api('/api/devices/pair/complete', { body: { code, deviceName } });
  expect(done.status).toBe(201);
  return json<PairCompleteResponse>(done);
}

export function profileFor(familyId: string, overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    id: newId(),
    familyId,
    name: 'Ada',
    birthYear: 2020,
    grade: 'K',
    advanced: false,
    avatar: {
      skinTone: 's03',
      faceShape: 'oval',
      hairStyle: 'braids',
      hairColor: 'h01',
      eyeShape: 'round',
      eyeColor: 'e05',
      eyebrows: 'e-soft',
      glasses: null,
      freckles: false,
      beautyMark: false,
      top: 'hoodie',
      topColor: 'c02',
      bottom: 'leggings',
      bottomColor: 'c03',
      shoes: 'boots',
      shoesColor: 'c07',
      hat: null,
      accessory: null,
      buddy: 'shelly',
    },
    picturePasswordHash: null,
    createdAt: 1_763_000_000_000,
    updatedAt: 1_763_400_000_000,
    ...overrides,
  };
}

/** A valid known event (`road.extended`). */
export function roadEvent(
  familyId: string,
  deviceId: string,
  overrides: Partial<EventEnvelope<'road.extended'>> = {},
): EventEnvelope<'road.extended'> {
  return {
    id: newId(),
    familyId,
    childId: null,
    deviceId,
    ts: 1_763_452_800_000,
    type: 'road.extended',
    v: 1,
    payload: { to: 5 },
    contentVersion: 'c0ffee12',
    ...overrides,
  };
}

export interface SyncBody {
  cursor?: string | null;
  events?: unknown[];
  settings?: unknown[];
  profiles?: unknown[];
}

export async function sync(token: string, body: SyncBody = {}) {
  const res = await api('/api/sync', {
    token,
    body: {
      cursor: body.cursor ?? null,
      events: body.events ?? [],
      settings: body.settings ?? [],
      profiles: body.profiles ?? [],
    },
  });
  return res;
}

export async function syncOk(token: string, body: SyncBody = {}): Promise<SyncResponse> {
  const res = await sync(token, body);
  expect(res.status).toBe(200);
  return json<SyncResponse>(res);
}

/** Pulls every page from `cursor` and returns all events plus the final cursor. */
export async function pullAll(token: string, cursor: string | null = null) {
  const all: AnyEventEnvelope[] = [];
  let next = cursor;
  for (let page = 0; page < 100; page++) {
    const res = await syncOk(token, { cursor: next });
    all.push(...res.events);
    next = res.cursor;
    if (!res.more) return { events: all, cursor: next, pages: page + 1 };
  }
  throw new Error('too many pages');
}
