/// <reference lib="webworker" />
// Number Island service worker (Workbox injectManifest; 02 §1).
// The precache manifest is empty in the scaffold; the offline issue fills it (shell, content, audio).

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Update flow (06 §8): a new worker activates on the next app launch, never mid-session, so we do
// not call skipWaiting() on install. The app may ask for it explicitly (e.g. from the parent area).
self.addEventListener('message', (event) => {
  if (event.data && typeof event.data === 'object' && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// On the very first install, take control of already-open pages so offline works without a reload.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
