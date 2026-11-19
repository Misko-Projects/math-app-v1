// The app-wide providers (02 §2 `src/app`): the booted services, D01's DataProvider, and the UI
// preferences with the AudioManager and narration text (U01, A01). Family audio settings follow
// the stored settings document live.

import type { NarrationKey } from '@number-island/shared';
import { planLine, UiProvider } from '@number-island/ui';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';
import { DataProvider, useSettings } from '@/data/hooks';
import type { AppServices } from './boot/boot';

const ServicesContext = createContext<AppServices | null>(null);

/** The booted services. Only valid below `<AppProviders>`. */
export function useAppServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useAppServices must be used inside <AppProviders>');
  return services;
}

/** Whether the sync client is running (re-renders when it starts or stops). */
export function useSyncRunning(): boolean {
  const { sync } = useAppServices();
  return useSyncExternalStore(sync.subscribe, sync.isRunning, sync.isRunning);
}

/** Keeps the AudioManager's volumes, voice rate and music flag in step with family settings. */
function FamilyAudioSettings() {
  const { audio } = useAppServices();
  const settings = useSettings();
  const family = settings?.family;
  useEffect(() => {
    if (family) audio.applyFamilySettings(family);
  }, [audio, family]);
  return null;
}

export function AppProviders({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  const { narration } = services.content;
  const narrationText = useCallback(
    (key: NarrationKey, vars?: Record<string, string | number>) =>
      planLine(narration, key, vars)?.text,
    [narration],
  );
  return (
    <ServicesContext.Provider value={services}>
      <DataProvider store={services.store}>
        <UiProvider audio={services.audio} narrationText={narrationText}>
          <FamilyAudioSettings />
          {children}
        </UiProvider>
      </DataProvider>
    </ServicesContext.Provider>
  );
}
