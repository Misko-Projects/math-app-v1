/// <reference lib="webworker" />
// Number Island service worker (Workbox injectManifest; 02 §1, §3).
//
// - Precache: the built shell (HTML, JS, CSS, fonts, icons, web manifest), every content JSON file
//   (`content/index.json` and the content-hashed files it names) and the narration audio
//   (`audio/manifest.json` + clips). vite.config.ts selects the files and enforces the 02 §6 budget.
// - Navigations to app routes (deep links such as /play) get the precached index.html, so the app
//   starts offline from any URL. `/api/*` is never cached and never answered from a cache.
// - Updates (06 §8): see the message handler below and src/app/pwa/launch.ts.

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { decideSkipWaiting } from './app/pwa/protocol';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA deep links: the app shell answers every navigation except the API.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api(\/|$)/] }),
);

// Update flow (06 §8): a new worker activates on the next app launch, never mid-session, so it
// does not call skipWaiting() on install; it waits. At launch, before the app is in use, the page
// asks a waiting worker to take over (SKIP_WAITING) and then reloads once. The worker agrees only
// to a fresh request (a page that gave up waiting has rendered, so its request is stale by then)
// from the app's only window, because activating also switches every other open window, possibly
// mid-session. It answers on the message port. See src/app/pwa/protocol.ts.
self.addEventListener('message', (event) => {
  if (decideSkipWaiting(event.data, Date.now(), 0) === null) return;
  const reply = event.ports[0];
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Judged after the window lookup, so slow client enumeration counts against the request.
      const answer = decideSkipWaiting(event.data, Date.now(), windows.length);
      if (!answer) return;
      reply?.postMessage(answer);
      if (answer.activating) await self.skipWaiting();
    })(),
  );
});

// On the very first install, take control of already-open pages so offline works without a reload.
// (After an update this runs only through the launch handshake above, with a single window open.)
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
