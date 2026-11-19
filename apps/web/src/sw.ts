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
import {
  answerSkipWaiting,
  isSkipWaitingGo,
  isSkipWaitingQuery,
  SKIP_WAITING_GO_WAIT_MS,
} from './app/pwa/protocol';

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
// does not call skipWaiting() on install; it waits. At launch, before the page renders, it runs a
// two-phase handshake with the page (src/app/pwa/protocol.ts): QUERY → READY → GO. The worker
// activates only on GO, which the page sends only while it has not rendered, committing to a
// reload. Activating switches every open window, so it also requires the app's only window.
const appWindows = async () =>
  (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).length;

self.addEventListener('message', (event) => {
  const query = event.data;
  if (!isSkipWaitingQuery(query)) return;
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil(
    (async () => {
      const answer = answerSkipWaiting(query, Date.now(), await appWindows());
      port.postMessage(answer);
      if (!answer.ready) return;
      const go = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), SKIP_WAITING_GO_WAIT_MS);
        port.onmessage = (e: MessageEvent) => {
          if (!isSkipWaitingGo(e.data)) return;
          clearTimeout(timer);
          resolve(true);
        };
      });
      port.close();
      if (go && (await appWindows()) <= 1) await self.skipWaiting();
    })(),
  );
});

// On the very first install, take control of already-open pages so offline works without a reload.
// (After an update this runs only through the launch handshake above, with a single window open.)
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
