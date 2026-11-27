// The app-wide providers (02 §2 `src/app`): the booted services, D01's DataProvider, and the UI
// preferences with the AudioManager and narration text (U01, A01). Family audio settings follow
// the stored settings document live.

import type { NarrationKey } from '@number-island/shared';
import { type AgeMode, planLine, UiProvider } from '@number-island/ui';
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
import { SessionProvider } from './session/SessionProvider';

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

function useNarrationResolver(services: AppServices) {
  const { narration } = services.content;
  return useCallback(
    (key: NarrationKey, vars?: Record<string, string | number>) =>
      planLine(narration, key, vars)?.text,
    [narration],
  );
}

/**
 * Child screens' UI preferences (06 §4 target sizes, §5 reading rules): `k` makes every control
 * K-sized, icon-only and spoken on tap. The Profile Picker uses `k` (anyone may be about to play).
 */
export function ChildUi({ ageMode, children }: { ageMode: AgeMode; children: ReactNode }) {
  const services = useAppServices();
  const narrationText = useNarrationResolver(services);
  return (
    <UiProvider ageMode={ageMode} audio={services.audio} narrationText={narrationText}>
      {children}
    </UiProvider>
  );
}

export function AppProviders({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  const narrationText = useNarrationResolver(services);
  return (
    <ServicesContext.Provider value={services}>
      <DataProvider store={services.store}>
        <UiProvider audio={services.audio} narrationText={narrationText}>
          <FamilyAudioSettings />
          <SessionProvider controller={services.session}>{children}</SessionProvider>
        </UiProvider>
      </DataProvider>
    </ServicesContext.Provider>
  );
}
