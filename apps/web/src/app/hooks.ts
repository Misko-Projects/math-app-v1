import type { AudioState } from '@number-island/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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

/** The AudioManager's state, live: `locked` until a tap unlocks it (06 §5 "Tap to start"). */
export function useAudioState(): AudioState {
  const { audio } = useAppServices();
  const subscribe = useCallback((onChange: () => void) => audio.subscribe(onChange), [audio]);
  const get = useCallback(() => audio.state, [audio]);
  return useSyncExternalStore(subscribe, get, get);
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
