// What loads on demand, so the initial JS stays within 02 §6's 350 KB: the routes that are neither
// the app shell nor the island (first run and the parent area), and the picture-password pad. Once
// the app is up, `warmLazyRoutes` fetches them all while the browser is idle: a parent who loaded
// the app online still opens Diagnostics after the connection drops, whether or not a service
// worker has precached them.

import type { ComponentType } from 'react';

type RouteModule = () => Promise<{ Component: ComponentType }>;

export const lazyRoute = {
  welcome: async () => ({ Component: (await import('./WelcomePage')).WelcomePage }),
  setup: async () => ({ Component: (await import('@/parent/setup/SetupWizard')).SetupWizard }),
  join: async () => ({ Component: (await import('./JoinPage')).JoinPage }),
  parentLayout: async () => ({ Component: (await import('@/parent/ParentLayout')).ParentLayout }),
  parentHome: async () => ({ Component: (await import('@/parent/ParentHome')).ParentHome }),
  pairDevice: async () => ({
    Component: (await import('@/parent/PairDevicePage')).PairDevicePage,
  }),
  diagnostics: async () => ({
    Component: (await import('@/parent/DiagnosticsPage')).DiagnosticsPage,
  }),
} satisfies Record<string, RouteModule>;

/**
 * The picture-password pad and its pictures, shown only after a child with a picture password is
 * tapped. The picker starts this while it speaks the child's name, so the pad opens without a wait.
 */
export const loadPicturePad = () => import('./picker/PicturePad');

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
 * Fetches every lazy route's chunk once, when the browser is idle. A failed fetch (offline at
 * boot) is ignored here: opening that route later tries again, and shows the route error screen
 * if it still can't load.
 */
export function warmLazyRoutes(idle: Idle = whenIdle): void {
  if (warmed) return;
  warmed = true;
  idle(() => {
    for (const load of [...Object.values(lazyRoute), loadPicturePad]) void load().catch(() => {});
  });
}

/** Tests only: lets `warmLazyRoutes` run again. */
export function resetLazyRouteWarmingForTests(): void {
  warmed = false;
}
