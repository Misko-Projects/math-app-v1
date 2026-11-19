// When the app syncs (08 §4, D01's sync client). One rule: the sync client runs exactly while this
// device holds a device token, which it gets when the family is adopted (`/setup` or pairing).
// - A returning, paired device starts syncing at boot (`resume`).
// - A fresh device stays local-only until `adopt`, which runs `adoptFamily` and then starts.
// - `signOut` stops the client and forgets the token; the family's data stays on the device.

import type { DeviceRecord } from '@/data/db';
import type { DataStore } from '@/data/store';
import {
  createSyncClient,
  type SyncClient,
  type SyncClientOptions,
  type SyncOutcome,
  type SyncReason,
} from '@/data/sync';

export interface AdoptIds {
  familyId: string;
  deviceId: string;
  deviceToken: string;
}

export interface SyncLifecycle {
  /** Whether the sync client is running (it syncs on its own triggers, 08 §4). */
  isRunning(): boolean;
  /** Starts syncing when this device already holds a token. Returns whether it started. */
  resume(): Promise<boolean>;
  /** After `/setup` or pairing: moves local data to the server's ids, then starts syncing. */
  adopt(ids: AdoptIds): Promise<DeviceRecord>;
  /** Stops syncing and removes the device token. Local data (events, profiles) stays. */
  signOut(): Promise<void>;
  /** One sync now (`manual` by default). Never rejects. */
  syncNow(reason?: SyncReason): Promise<SyncOutcome>;
  /**
   * App teardown: stops the client for good (a pending `adopt` or `resume` cannot restart it).
   * The token stays, so the next launch resumes.
   */
  stop(): void;
  /** Called when `isRunning()` changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export type SyncLifecycleOptions = Omit<SyncClientOptions, 'store'> & {
  /** Tests may replace the client; defaults to D01's `createSyncClient`. */
  createClient?: (opts: SyncClientOptions) => SyncClient;
};

export function createSyncLifecycle(
  store: DataStore,
  opts: SyncLifecycleOptions = {},
): SyncLifecycle {
  const { createClient = createSyncClient, ...clientOpts } = opts;
  const client = createClient({ store, ...clientOpts });
  const listeners = new Set<() => void>();
  let running = false;

  const setRunning = (next: boolean) => {
    if (next === running) return;
    running = next;
    for (const l of listeners) l();
  };
  /** Set by `stop()` (app teardown): nothing starts the client again. */
  let closed = false;
  /** Starts the client unless torn down; returns whether it is running. */
  const start = (): boolean => {
    if (closed) return false;
    if (!running) {
      client.start();
      setRunning(true);
    }
    return true;
  };
  /**
   * Stops the client and waits until its run in flight has ended. Always told to the client: a
   * manual sync may be in flight even while automatic sync is off. Once this resolves, nothing
   * the old credentials fetch can still be sent or written (sync.ts, `generation`).
   */
  const pause = async () => {
    const settled = client.stop();
    setRunning(false);
    await settled;
  };

  // resume, adopt and signOut change the device's credentials, so they run one at a time in the
  // order they were asked for: the last request wins (an adoption still in progress can never
  // restore a token that a later sign-out removed).
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    isRunning: () => running,
    resume: () =>
      serial(async () => {
        const device = await store.device();
        if (!device.deviceToken) return false;
        return start();
      }),
    adopt: (ids) =>
      serial(async () => {
        // A re-pair must not sync with the old token while the ids move.
        const wasRunning = running;
        await pause();
        try {
          const record = await store.adoptFamily(ids);
          start();
          return record;
        } catch (e) {
          // Nothing changed (bad ids, or the write rolled back): keep the pairing we had.
          if (wasRunning && (await store.device()).deviceToken) start();
          throw e;
        }
      }),
    signOut: () =>
      serial(async () => {
        await pause();
        await store.db.transaction('rw', store.db.device, async () => {
          const device = await store.db.device.get('device');
          if (device?.deviceToken === undefined) return;
          const { deviceToken: _dropped, ...rest } = device;
          await store.db.device.put(rest);
        });
      }),
    // Waits for a credential change in progress (it never runs between a sign-out's stop and its
    // token removal), without holding up the changes queued after it.
    // After teardown nothing runs, including a sync asked for just before it.
    syncNow: (reason) =>
      queue.then(() => (closed ? ({ kind: 'stopped' } as const) : client.syncNow(reason))),
    stop() {
      closed = true;
      void pause();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
