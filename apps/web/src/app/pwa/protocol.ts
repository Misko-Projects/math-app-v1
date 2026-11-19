// The launch-time update handshake between the page (src/app/pwa/launch.ts) and the service worker
// (src/sw.ts). No DOM or worker types: both builds import it.
//
// A two-phase commit, so a waiting worker can never take over a page that has rendered
// (06 §8: never mid-session):
//   1. The page, before rendering, sends QUERY on a MessageChannel.
//   2. The worker answers READY (it may activate: the request is fresh and this is the app's only
//      window) or DECLINED. It does not activate yet.
//   3. If the page receives READY before its answer timeout, it sends GO and commits: from then on
//      it never renders the old build (it reloads). If the timeout fires first, it renders and
//      closes the channel, so it never sends GO.
//   4. The worker activates (skipWaiting) only on GO, after checking the windows again.
// Whatever the timing, activation happens only after the page has committed not to render.

export const SKIP_WAITING_QUERY = 'SKIP_WAITING_QUERY';
export const SKIP_WAITING_GO = 'SKIP_WAITING_GO';
/** The worker answers only a query at most this old (a page this slow renders anyway). */
export const SKIP_WAITING_MAX_AGE_MS = 3000;
/** How long the page waits for the worker's answer before it renders. */
export const SKIP_WAITING_ANSWER_MS = 4000;
/** How long the worker waits for GO after READY. */
export const SKIP_WAITING_GO_WAIT_MS = 5000;

export interface SkipWaitingQuery {
  type: typeof SKIP_WAITING_QUERY;
  /** Page clock (ms epoch) when sent; page and worker share the device clock. */
  sentAt: number;
}
export interface SkipWaitingAnswer {
  type: 'SKIP_WAITING_ANSWER';
  ready: boolean;
}

export const skipWaitingQuery = (now: number): SkipWaitingQuery => ({
  type: SKIP_WAITING_QUERY,
  sentAt: now,
});
export const skipWaitingGo = () => ({ type: SKIP_WAITING_GO }) as const;

export function isSkipWaitingQuery(data: unknown): data is SkipWaitingQuery {
  return (
    !!data && typeof data === 'object' && (data as { type?: unknown }).type === SKIP_WAITING_QUERY
  );
}

export function isSkipWaitingGo(data: unknown): boolean {
  return (
    !!data && typeof data === 'object' && (data as { type?: unknown }).type === SKIP_WAITING_GO
  );
}

/** The worker's answer to a query: ready only when fresh and from the app's only window. */
export function answerSkipWaiting(
  query: SkipWaitingQuery,
  now: number,
  windowCount: number,
): SkipWaitingAnswer {
  const age = now - query.sentAt;
  const fresh = Number.isFinite(age) && age >= 0 && age <= SKIP_WAITING_MAX_AGE_MS;
  return { type: 'SKIP_WAITING_ANSWER', ready: fresh && windowCount <= 1 };
}
