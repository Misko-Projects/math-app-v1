// Simulated devices for the D01 sync integration tests: each device is its own fake IndexedDB
// with a Dexie store and a sync client, talking to the real API Worker through `exports.default`.

import { env, exports } from 'cloudflare:workers';
import { buildSkillGraph } from '@number-island/engine';
import type {
  AnyEventEnvelope,
  GameData,
  PairCompleteResponse,
  PairStartResponse,
  SetupResponse,
} from '@number-island/shared';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect } from 'vitest';
import { createDb } from '@/data/db';
import type { StoreContent } from '@/data/projections';
import { createDataStore, type DataStore } from '@/data/store';
import { createSyncClient, type SyncClient, type SyncClientOptions } from '@/data/sync';
import replayLog from '../../../packages/engine/test/golden/replay-log.jsonl?raw';

export const ORIGIN = 'http://island.test';
export const DAY = 24 * 3600_000;

interface TestContent {
  contentVersion: string;
  skills: Parameters<typeof buildSkillGraph>[0]['skills'];
  templates: Parameters<typeof buildSkillGraph>[0]['templates'];
  graph: Parameters<typeof buildSkillGraph>[0]['graph'];
  game: GameData;
}

let content: StoreContent | null = null;

/** The compiled content (vitest.sync.config.ts hands it over as a binding). */
export function storeContent(): StoreContent {
  if (content) return content;
  const c = JSON.parse((env as unknown as { TEST_CONTENT: string }).TEST_CONTENT) as TestContent;
  content = {
    contentVersion: c.contentVersion,
    gameData: c.game,
    graph: buildSkillGraph({
      contentVersion: c.contentVersion,
      skills: c.skills,
      templates: c.templates,
      graph: c.graph,
    }),
  };
  return content;
}

/** The Worker, as the browser's same-origin `fetch` would reach it. */
export const workerFetch = (path: string, init: RequestInit) =>
  exports.default.fetch(`${ORIGIN}${path}`, init);

export async function api(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') headers.set('content-type', 'application/json');
  if (init.cookie) headers.set('cookie', init.cookie);
  return workerFetch(path, { ...init, headers });
}

export interface Family extends SetupResponse {
  cookie: string;
}

export async function setupFamily(): Promise<Family> {
  const res = await api('/api/setup', {
    method: 'POST',
    body: JSON.stringify({
      familyName: 'The Rivers',
      passphrase: 'correct horse battery',
      pin: '2468',
      deviceName: 'Laptop',
    }),
  });
  expect(res.status).toBe(201);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  return { ...((await res.json()) as SetupResponse), cookie };
}

export async function pair(cookie: string): Promise<PairCompleteResponse> {
  const start = await api('/api/devices/pair/start', { method: 'POST', body: '{}', cookie });
  expect(start.status).toBe(201);
  const { code } = (await start.json()) as PairStartResponse;
  const done = await api('/api/devices/pair/complete', {
    method: 'POST',
    body: JSON.stringify({ code, deviceName: 'Tablet' }),
  });
  expect(done.status).toBe(201);
  return (await done.json()) as PairCompleteResponse;
}

export interface Device {
  store: DataStore;
  sync: SyncClient;
  /** Closes the store and opens it again over the same IndexedDB: a page reload. */
  reload(): Promise<Device>;
}

export interface DeviceOptions {
  /** Clock offset from real time (a device with a wrong clock). */
  skewMs?: number;
  sync?: Partial<Omit<SyncClientOptions, 'store'>>;
}

/** A fresh device: its own IndexedDB, store and sync client (not started: tests drive syncNow). */
export async function newDevice(
  name: string,
  opts: DeviceOptions = {},
  factory = new IDBFactory(),
): Promise<Device> {
  const now = () => Date.now() + (opts.skewMs ?? 0);
  const store = await createDataStore({
    db: createDb({ name, indexedDB: factory, IDBKeyRange }),
    content: storeContent(),
    now,
    timezone: 'America/Chicago',
  });
  const sync = createSyncClient({ store, fetch: workerFetch, now, ...opts.sync });
  return {
    store,
    sync,
    async reload() {
      store.close();
      return newDevice(name, opts, factory);
    },
  };
}

/**
 * The engine's golden log (two siblings, six weeks), moved into `familyId` and shifted so that its
 * last event is two days ago: the server keeps every `ts` as recorded (none is clamped).
 */
export function goldenEvents(familyId: string): AnyEventEnvelope[] {
  const events = replayLog
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as AnyEventEnvelope);
  const shift = Date.now() - 2 * DAY - Math.max(...events.map((e) => e.ts));
  return events.map((e) => ({ ...e, familyId, ts: e.ts + shift }));
}

/** Everything a device shows: its log and every projection the hooks read. */
export async function snapshot(store: DataStore) {
  const events = await store.events();
  const children = [...new Set(events.flatMap((e) => (e.childId ? [e.childId] : [])))].sort();
  const skills: Record<string, unknown> = {};
  for (const c of children) skills[c] = await store.skillStates(c);
  return {
    events,
    island: await store.island(),
    inventory: await store.inventory(),
    collection: await store.collection(),
    goals: await store.goals(),
    skills,
    profiles: (await store.allProfiles()).sort((a, b) => (a.id < b.id ? -1 : 1)),
    settings: (await store.allSettings()).sort((a, b) => (a.key < b.key ? -1 : 1)),
  };
}

/** Syncs every device in turn until a full pass moves no events (at least two passes, so a
 * settings or profile change one device pushed reaches every other device). */
export async function syncAll(...devices: Device[]): Promise<void> {
  for (let pass = 0; pass < 5; pass++) {
    let moved = 0;
    for (const d of devices) {
      const outcome = await d.sync.syncNow('manual');
      expect(outcome.kind).toBe('synced');
      if (outcome.kind === 'synced') moved += outcome.pushed + outcome.pulled;
    }
    if (moved === 0 && pass > 0) return;
  }
  throw new Error('devices did not settle');
}
