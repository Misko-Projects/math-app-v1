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
  /** Stops the client (app teardown); the token stays. */
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
  const start = () => {
    if (running) return;
    client.start();
    setRunning(true);
  };
  const stop = () => {
    if (!running) return;
    client.stop();
    setRunning(false);
  };

  return {
    isRunning: () => running,
    async resume() {
      const device = await store.device();
      if (!device.deviceToken) return false;
      start();
      return true;
    },
    async adopt(ids) {
      // A re-pair (after a sign-out or revocation) must not sync with the old token mid-move.
      stop();
      const record = await store.adoptFamily(ids);
      start();
      return record;
    },
    async signOut() {
      stop();
      await store.db.transaction('rw', store.db.device, async () => {
        const device = await store.db.device.get('device');
        if (device?.deviceToken === undefined) return;
        const { deviceToken: _dropped, ...rest } = device;
        await store.db.device.put(rest);
      });
    },
    syncNow: (reason) => client.syncNow(reason),
    stop,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
