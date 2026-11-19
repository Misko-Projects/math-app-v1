import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { DeviceRecord, SyncStateRow } from '@/data/db';
import { useAppServices } from './AppServices';

/** This device's record (ids, token, pairedAt); `undefined` while the first read is in flight. */
export function useDeviceRecord(): DeviceRecord | undefined {
  const { store } = useAppServices();
  return useLiveQuery(() => store.db.device.get('device'), [store]);
}

/** The sync cursor, last sync time and last error (02 §4.4). */
export function useSyncState(): SyncStateRow | undefined {
  const { store } = useAppServices();
  return useLiveQuery(() => store.db.syncState.get('sync'), [store]);
}

/** `navigator.onLine`, live. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => globalThis.navigator?.onLine ?? true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
