// What loads on demand, so the initial JS stays within 02 §6's 350 KB: the routes that are neither
// the app shell nor the island (first run and the parent area). Everything a child needs to play,
// the picture-password pad included, stays in the initial JS, so a child never waits on the network.
//
// The parent pages are one file (`@/parent/area`): whatever opened the parent area also brought
// Diagnostics, so it opens after the connection drops. Once the app is up, `warmLazyRoutes` also
// fetches every on-demand file while the browser is idle, ahead of the first visit.

import type { ComponentType } from 'react';
import { WORKSHOPS } from '@/workshops/registry';

type RouteModule = () => Promise<{ Component: ComponentType }>;

const parentArea = () => import('@/parent/area');

export const lazyRoute = {
  welcome: async () => ({ Component: (await import('./WelcomePage')).WelcomePage }),
  setup: async () => ({ Component: (await import('@/parent/setup/SetupWizard')).SetupWizard }),
  join: async () => ({ Component: (await import('./JoinPage')).JoinPage }),
  parentLayout: async () => ({ Component: (await parentArea()).ParentLayout }),
  parentHome: async () => ({ Component: (await parentArea()).ParentHome }),
  pairDevice: async () => ({ Component: (await parentArea()).PairDevicePage }),
  diagnostics: async () => ({ Component: (await parentArea()).DiagnosticsPage }),
  // The dev content browser (#20). It shares the Practice Pier's chunk (02 §6).
  pier: async () => ({
    Component: (await import('@/workshops/practice-pier/PierPage')).PierPage,
  }),
} satisfies Record<string, RouteModule>;

/** Every registered workshop's screen (02 §5.6 `load`), so a tapped request never waits for it. */
const workshopChunks = WORKSHOPS.map((w) => w.load);

type Idle = (run: () => void) => void;

/** `requestIdleCallback` where the browser has it (not every Safari does), else a short delay. */
const whenIdle: Idle = (run) => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 1500);
  }
};

let warmed = false;

/**
 * Fetches every lazy route's file once, when the browser is idle. A failed fetch (offline at boot)
 * is ignored here: opening that route later tries again, and shows the route error screen if it
 * still can't load.
 */
export function warmLazyRoutes(idle: Idle = whenIdle): void {
  if (warmed) return;
  warmed = true;
  idle(() => {
    for (const load of [...Object.values(lazyRoute), ...workshopChunks]) {
      void load().catch(() => {});
    }
  });
}

/** Tests only: lets `warmLazyRoutes` run again. */
export function resetLazyRouteWarmingForTests(): void {
  warmed = false;
}
