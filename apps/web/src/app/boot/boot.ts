// App startup (02 §3, §4.4; apps/web/src/data/README.md): load the content, open the data store,
// create the AudioManager, and start syncing when this device is already paired.
//
// Boot never needs the API: a paired device that starts offline opens straight into play, and the
// sync client retries on its own (08 §4). Only missing content (never precached, and no network)
// or unusable storage stops it, with a `BootError` the boot screen explains.

import { createAudioManager, loadAudioManifest, type WebAudioManager } from '@number-island/ui';
import { createDb, type NumberIslandDb } from '@/data/db';
import { createDataStore, type DataStore } from '@/data/store';
import { type AppContent, ContentLoadError, loadContent } from './content';
import {
  createSyncLifecycle,
  type SyncLifecycle,
  type SyncLifecycleOptions,
} from './syncLifecycle';

export interface AppServices {
  content: AppContent;
  store: DataStore;
  audio: WebAudioManager;
  sync: SyncLifecycle;
  /** The fetch every client of the app uses (tests inject a fake network). */
  fetch: FetchLike;
  /** Stops syncing and audio and closes the database. */
  dispose(): void;
}

export type BootErrorCode = 'content_unreachable' | 'content_invalid' | 'storage';

export class BootError extends Error {
  constructor(
    readonly code: BootErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'BootError';
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface BootOptions {
  /** Used for content, the audio manifest and `/api/sync`. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Tests inject a fake-IndexedDB database. Defaults to the browser's `number-island`. */
  db?: NumberIslandDb;
  now?: () => number;
  newId?: () => string;
  timezone?: string;
  /** Extra sync-client options (timers, online check) for tests. */
  sync?: Omit<SyncLifecycleOptions, 'fetch'>;
  /** Tests replace the Web Audio manager. */
  createAudio?: (content: AppContent, fetchImpl: FetchLike) => WebAudioManager;
}

const defaultAudio = (content: AppContent, fetchImpl: FetchLike): WebAudioManager =>
  createAudioManager({
    narration: content.narration,
    manifest: () => loadAudioManifest('/audio/manifest.json', fetchImpl as typeof fetch),
  });

export async function bootApp(opts: BootOptions = {}): Promise<AppServices> {
  const fetchImpl: FetchLike = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));

  let content: AppContent;
  try {
    content = await loadContent(fetchImpl);
  } catch (e) {
    if (e instanceof ContentLoadError) {
      throw new BootError(
        e.code === 'unreachable' ? 'content_unreachable' : 'content_invalid',
        e.message,
        e,
      );
    }
    throw e;
  }

  let store: DataStore;
  try {
    store = await createDataStore({
      db: opts.db ?? createDb(),
      content: content.store,
      ...(opts.now ? { now: opts.now } : {}),
      ...(opts.newId ? { newId: opts.newId } : {}),
      ...(opts.timezone ? { timezone: opts.timezone } : {}),
    });
  } catch (e) {
    throw new BootError('storage', `could not open local storage: ${String(e)}`, e);
  }

  const audio = (opts.createAudio ?? defaultAudio)(content, fetchImpl);
  audio.applyFamilySettings(await store.familySettings());

  const sync = createSyncLifecycle(store, { ...opts.sync, fetch: fetchImpl });
  await sync.resume();

  return {
    content,
    store,
    audio,
    sync,
    fetch: fetchImpl,
    dispose() {
      sync.stop();
      audio.stop();
      store.close();
    },
  };
}
