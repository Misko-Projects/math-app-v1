// Test support for the boot path (never imported by app code): the compiled content served as the
// app's `/content/*` assets, a scripted `/api/sync`, and a fresh fake IndexedDB per test.

import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import { type SyncRequest, type SyncResponse, syncRequestSchema } from '@number-island/shared';
import { createAudioManager } from '@number-island/ui';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createDb } from '@/data/db';
import { testClock, testIds } from '@/data/store.test-support';
import { type BootOptions, bootApp } from './boot';

let compiled: { contentVersion: string; outputs: Record<string, string> } | null = null;

/** `pnpm content:build`'s outputs, compiled in memory once. */
export function compiledContent(): { contentVersion: string; outputs: Record<string, string> } {
  if (compiled) return compiled;
  const result = compileContent(readContentFiles());
  if (!result.outputs || !result.contentVersion) throw new Error('the content does not compile');
  compiled = { contentVersion: result.contentVersion, outputs: { ...result.outputs } };
  return compiled;
}

/** What the dev server and the production build serve under `/content/`. */
export function contentAssets(): Record<string, string> {
  const { contentVersion, outputs } = compiledContent();
  const names = Object.keys(outputs).filter((n) => n.endsWith('.json') && n !== 'manifest.json');
  const assets: Record<string, string> = {
    '/content/index.json': JSON.stringify({
      contentVersion,
      files: Object.fromEntries(names.map((n) => [n, `/content/${n}`])),
    }),
  };
  for (const n of names) assets[`/content/${n}`] = outputs[n] as string;
  return assets;
}

export const TOKEN = 'b'.repeat(43);
export const SERVER_FAMILY = '019a0000-0000-7000-8000-0000000af001';
export const SERVER_DEVICE = '019a0000-0000-7000-8000-0000000ad001';

export interface FakeNetwork {
  fetch: NonNullable<BootOptions['fetch']>;
  /** Every `/api/sync` request, with its Authorization header. */
  syncRequests: { body: SyncRequest; authorization: string | null }[];
  /** Every URL requested. */
  urls: string[];
  /** false: every `/api/*` request fails as a network error (the server is unreachable). */
  apiReachable: boolean;
  /** false: content requests fail too (nothing precached, no network). */
  contentReachable: boolean;
  /** Overrides an asset's body. */
  assets: Record<string, string>;
  /** Answers for other `/api/*` routes, by path (e.g. `/api/auth/pin`). */
  api: Record<string, (init: RequestInit | undefined) => Response | Promise<Response>>;
}

/** A JSON response, as the API sends it. */
export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function fakeNetwork(): FakeNetwork {
  const net: FakeNetwork = {
    syncRequests: [],
    urls: [],
    apiReachable: true,
    contentReachable: true,
    assets: contentAssets(),
    api: {},
    fetch: async (input, init) => {
      const url = String(input);
      net.urls.push(url);
      if (url.startsWith('/api/')) {
        if (!net.apiReachable) throw new TypeError('Failed to fetch');
        const handler = net.api[url];
        if (handler) return handler(init);
        if (url === '/api/sync') {
          const body = syncRequestSchema.parse(JSON.parse(String(init?.body)));
          net.syncRequests.push({
            body,
            authorization: new Headers(init?.headers).get('authorization'),
          });
          const res: SyncResponse = {
            accepted: body.events.map((e) => e.id),
            rejected: [],
            clamped: [],
            events: [],
            cursor: String(net.syncRequests.length),
            more: false,
            settings: [],
            profiles: [],
          };
          return new Response(JSON.stringify(res), { status: 200 });
        }
        return new Response('{}', { status: 404 });
      }
      if (!net.contentReachable) throw new TypeError('Failed to fetch');
      const body = net.assets[url];
      return body === undefined
        ? new Response('not found', { status: 404 })
        : new Response(body, { status: 200 });
    },
  };
  return net;
}

/** One simulated device: its IndexedDB survives `boot()` calls, like a browser across launches. */
export function testDevice(net: FakeNetwork = fakeNetwork()) {
  const factory = new IDBFactory();
  const clock = testClock();
  const ids = testIds('b');
  let online = true;
  const boot = (extra: Partial<BootOptions> = {}) =>
    bootApp({
      fetch: net.fetch,
      db: createDb({ name: 'number-island', indexedDB: factory, IDBKeyRange }),
      now: clock.now,
      newId: ids,
      timezone: 'America/Chicago',
      sync: {
        online: () => online,
        // The interval and retry timers never fire on their own in these tests.
        setTimer: () => 0,
        clearTimer: () => {},
      },
      createAudio: (content) =>
        createAudioManager({ narration: content.narration, manifest: null }),
      ...extra,
    });
  return {
    net,
    clock,
    boot,
    /**
     * Dexie's liveQuery stays idle unless it sees an IndexedDB global (always present in a browser,
     * absent in jsdom): points Dexie at this device's fake one. Returns the restore.
     */
    enableLiveQueries(): () => void {
      const deps = Dexie.dependencies;
      const before = { indexedDB: deps.indexedDB, IDBKeyRange: deps.IDBKeyRange };
      deps.indexedDB = factory;
      deps.IDBKeyRange = IDBKeyRange;
      return () => Object.assign(deps, before);
    },
    setOnline(next: boolean) {
      online = next;
    },
  };
}
