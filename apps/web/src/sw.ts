/// <reference lib="webworker" />
// Number Island service worker (Workbox injectManifest; 02 §1, §3).
//
// - Precache: the built shell (HTML, JS, CSS, fonts, icons, web manifest), every content JSON file
//   (`content/index.json` and the content-hashed files it names) and the narration audio
//   (`audio/manifest.json` + clips). vite.config.ts selects the files and enforces the 02 §6 budget.
// - Navigations to app routes (deep links such as /play) get the precached index.html, so the app
//   starts offline from any URL. `/api/*` is never cached and never answered from a cache.
// - Updates (06 §8): the browser's own lifecycle, with no messages to or from the page. See below.

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA deep links: the app shell answers every navigation except the API.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api(\/|$)/] }),
);

// Update flow (06 §8: "a new service worker activates on the next app launch, never
// mid-session"). This worker never calls skipWaiting(). An update installs and then waits; the
// browser activates it only once no window controlled by the old worker remains, which is the
// next launch after every app window has closed. It never replaces the worker under a live page.
//
// clients.claim() on activate: on a first install it takes control of the open page, so offline
// works without a reload. On an update, activation happens only when no old-worker window exists,
// so claiming cannot switch a running session.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
