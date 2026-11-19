// The launch-time update handshake between the page (src/app/pwa/launch.ts) and the service worker
// (src/sw.ts). No DOM or worker types: both builds import it.
//
// The page asks a waiting worker to take over only while it has not rendered yet. Two bounds keep
// a slow worker from switching a page that has already started (06 §8: never mid-session):
// - the worker acts only on a request younger than SKIP_WAITING_MAX_AGE_MS;
// - the page waits SKIP_WAITING_ANSWER_MS (longer) for the worker's answer before it renders.
// So a request the page has given up on is always stale by the time the worker could act on it.
// Once the worker says it is activating, the page never renders the old build: it reloads.

export const SKIP_WAITING = 'SKIP_WAITING';
export const SKIP_WAITING_MAX_AGE_MS = 3000;
export const SKIP_WAITING_ANSWER_MS = 4000;

export interface SkipWaitingRequest {
  type: typeof SKIP_WAITING;
  /** Page clock (ms epoch) when sent; page and worker share the device clock. */
  sentAt: number;
}

export interface SkipWaitingAnswer {
  type: 'SKIP_WAITING_RESULT';
  activating: boolean;
}

export function skipWaitingRequest(now: number): SkipWaitingRequest {
  return { type: SKIP_WAITING, sentAt: now };
}

/**
 * The worker's decision: activate only for a fresh request from the app's only window (activating
 * also switches every other open window, possibly mid-session). `null` when `data` is not a
 * request at all.
 */
export function decideSkipWaiting(
  data: unknown,
  now: number,
  windowCount: number,
): SkipWaitingAnswer | null {
  if (!data || typeof data !== 'object' || (data as { type?: unknown }).type !== SKIP_WAITING) {
    return null;
  }
  const sentAt = (data as { sentAt?: unknown }).sentAt;
  const fresh =
    typeof sentAt === 'number' && now - sentAt >= 0 && now - sentAt <= SKIP_WAITING_MAX_AGE_MS;
  return { type: 'SKIP_WAITING_RESULT', activating: fresh && windowCount <= 1 };
}
