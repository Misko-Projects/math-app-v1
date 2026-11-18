// D01 sync client (08 §4): pushes the local event queue, settings and profiles to `POST /api/sync`
// and pulls the other devices' events by cursor, looping until both directions are drained. It
// applies the clamp echo (02 §5.9 S3), the per-event rejections (S1), the server's LWW settings and
// profiles, and pulled tombstones (through the store). It never throws to its callers and never
// blocks gameplay: everything runs in the background, and a failure only schedules a retry.

import {
  type AnyEventEnvelope,
  apiErrorBodySchema,
  SYNC_MAX_PUSH_EVENTS,
  type SyncClampedEvent,
  type SyncRequest,
  type SyncResponse,
  syncResponseSchema,
} from '@number-island/shared';
import type { DataStore } from './store';

/** 08 §4: every 60 s while online. */
export const SYNC_INTERVAL_MS = 60_000;
/** Backoff after a failed sync: 5 s doubling to 5 min, with ±20 % jitter. */
export const SYNC_BACKOFF_BASE_MS = 5_000;
export const SYNC_BACKOFF_MAX_MS = 5 * 60_000;
/** Upper bound on push/pull round trips in one sync, so a misbehaving server cannot spin us. */
export const SYNC_MAX_ROUNDS = 50;

/** Why a sync started (08 §4 triggers), recorded for diagnostics. */
export type SyncReason =
  | 'start'
  | 'interval'
  | 'request-completed'
  | 'wind-down'
  | 'online'
  | 'retry'
  | 'manual';

export type SyncOutcome =
  | { kind: 'synced'; pushed: number; pulled: number; rounds: number }
  | { kind: 'unpaired' } // no device token yet: setup or pairing has not happened
  | { kind: 'offline' }
  | { kind: 'revoked'; code: string } // the server no longer accepts this device
  | { kind: 'failed'; error: string }
  | { kind: 'deferred' } // an automatic trigger inside the backoff window: the retry timer will sync
  | { kind: 'stopped' }; // an automatic trigger after stop(): nothing was sent

/** A sync exchange (request and response body) that takes longer than this fails and is retried. */
export const SYNC_REQUEST_TIMEOUT_MS = 30_000;

/** Reasons that run even inside the backoff window: an explicit call, and the network returning. */
const BYPASSES_BACKOFF: ReadonlySet<SyncReason> = new Set(['manual', 'online', 'retry']);

export interface SyncClientOptions {
  store: DataStore;
  /** Defaults to `globalThis.fetch`. Tests pass the Worker's fetch. */
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  /** Origin prefix for `/api/sync`; '' (same origin) by default. */
  baseUrl?: string;
  now?: () => number;
  /** Whether the browser reports a connection; defaults to `navigator.onLine` (true if unknown). */
  online?: () => boolean;
  /** Timer functions (tests use fake timers). */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** 0..1, for backoff jitter; defaults to `Math.random`. */
  random?: () => number;
  intervalMs?: number;
  /** Deadline for one exchange, request and response body (default 30 s). */
  requestTimeoutMs?: number;
}

export interface SyncClient {
  /**
   * Runs one sync now (or joins the one in flight and runs once more after it, so a trigger that
   * arrives mid-sync is never lost). Never rejects.
   */
  syncNow(reason?: SyncReason): Promise<SyncOutcome>;
  /** Syncs on start, then every 60 s (backing off on errors), after each completed request, on
   *  wind-down (`session.ended`, page hidden) and when the browser comes back online. */
  start(): void;
  stop(): void;
}

/** Thrown inside a sync to stop it with a given outcome. */
class SyncStop extends Error {
  constructor(readonly outcome: SyncOutcome) {
    super(outcome.kind);
  }
}

/** The local copy with the server's stored time (02 §5.9 S3): `clientTs` only when the server has one. */
export function withServerTime(
  local: AnyEventEnvelope,
  echo: Pick<SyncClampedEvent, 'ts' | 'clientTs'>,
): AnyEventEnvelope {
  const { clientTs: _local, ...rest } = local;
  return {
    ...rest,
    ts: echo.ts,
    ...(echo.clientTs === undefined ? {} : { clientTs: echo.clientTs }),
  } as AnyEventEnvelope;
}

/** Backoff delay after `failures` consecutive failed syncs (1 = first failure). */
export function backoffDelay(failures: number, random: () => number = Math.random): number {
  const base = Math.min(SYNC_BACKOFF_MAX_MS, SYNC_BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(base * (0.8 + 0.4 * random()));
}

const errorCode = (json: unknown) => apiErrorBodySchema.safeParse(json).data?.error.code;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export function createSyncClient(opts: SyncClientOptions): SyncClient {
  const { store } = opts;
  const doFetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const url = `${opts.baseUrl ?? ''}/api/sync`;
  const now = opts.now ?? (() => Date.now());
  const online =
    opts.online ??
    (() => (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== false);
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const random = opts.random ?? Math.random;
  const intervalMs = opts.intervalMs ?? SYNC_INTERVAL_MS;
  const requestTimeoutMs = opts.requestTimeoutMs ?? SYNC_REQUEST_TIMEOUT_MS;

  let inFlight: Promise<SyncOutcome> | null = null;
  let again: Promise<SyncOutcome> | null = null;
  let failures = 0;
  /** While failures > 0, automatic triggers wait until the retry timer fires at this time. */
  let retryAt = 0;
  let running = false;
  let timer: unknown = null;
  const cleanups: (() => void)[] = [];

  /**
   * One push/pull exchange under one deadline covering the request and the response body, so a
   * stalled connection fails (and is retried) instead of holding the client forever. Returns the
   * parsed response or stops the sync.
   */
  async function exchange(token: string, body: SyncRequest): Promise<SyncResponse> {
    const controller = new AbortController();
    let timedOut = false;
    let handle: unknown = null;
    const deadline = new Promise<never>((_, reject) => {
      handle = setTimer(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('timeout'));
      }, requestTimeoutMs);
    });
    deadline.catch(() => undefined); // settled by the race below; never an unhandled rejection
    const timeout = () =>
      new SyncStop({ kind: 'failed', error: `timeout after ${requestTimeoutMs} ms` });
    let res: Response;
    let json: unknown;
    try {
      try {
        res = await Promise.race([
          doFetch(url, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify(body),
            cache: 'no-store',
            signal: controller.signal,
          }),
          deadline,
        ]);
      } catch (e) {
        throw timedOut
          ? timeout()
          : new SyncStop({ kind: 'failed', error: `network: ${errorMessage(e)}` });
      }
      try {
        json = await Promise.race([res.json().catch(() => null), deadline]);
      } catch {
        throw timeout();
      }
    } finally {
      clearTimer(handle);
    }
    if (res.status === 401) {
      const code = errorCode(json) ?? 'unauthorized';
      throw new SyncStop({ kind: 'revoked', code });
    }
    if (!res.ok) {
      const code = errorCode(json) ?? 'unknown';
      throw new SyncStop({ kind: 'failed', error: `HTTP ${res.status} ${code}` });
    }
    const parsed = syncResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new SyncStop({ kind: 'failed', error: 'the server sent an invalid sync response' });
    }
    return parsed.data;
  }

  /** Applies one response: echo, acknowledgements, rejections, pulled events, documents, cursor. */
  async function apply(pushed: AnyEventEnvelope[], res: SyncResponse): Promise<void> {
    // The server's stored copy wins (02 §5.9 S3): replace the local copy's times, then rebuild.
    if (res.clamped.length > 0) {
      const byId = new Map(pushed.map((e) => [e.id, e]));
      const corrected = res.clamped.flatMap((c) => {
        const local = byId.get(c.id);
        return local ? [withServerTime(local, c)] : [];
      });
      await store.ingest(corrected, { source: 'server' });
    }
    await store.markSynced(res.accepted);
    if (res.rejected.length > 0) await store.markRejected(res.rejected, pushed);
    if (res.events.length > 0) await store.ingest(res.events, { source: 'server' });
    await store.mergeSettings(res.settings, { source: 'server' });
    await store.mergeProfiles(res.profiles, { source: 'server' });
    await store.updateSyncState({ cursor: res.cursor });
  }

  async function run(reason: SyncReason): Promise<SyncOutcome> {
    const device = await store.device();
    if (!device.deviceToken) return { kind: 'unpaired' };
    if (!online()) return { kind: 'offline' };
    let pushedTotal = 0;
    let pulledTotal = 0;
    try {
      for (let round = 1; round <= SYNC_MAX_ROUNDS; round++) {
        const { cursor } = await store.syncState();
        const events = await store.unsynced(SYNC_MAX_PUSH_EVENTS);
        const body: SyncRequest = {
          cursor,
          events,
          settings: await store.allSettings(),
          profiles: await store.allProfiles(),
        };
        const res = await exchange(device.deviceToken, body);
        await apply(events, res);
        pushedTotal += events.length;
        pulledTotal += res.events.length;
        const morePush = events.length === SYNC_MAX_PUSH_EVENTS;
        if (!res.more && !morePush) {
          await store.updateSyncState({ lastSyncAt: now(), lastError: null });
          return { kind: 'synced', pushed: pushedTotal, pulled: pulledTotal, rounds: round };
        }
      }
      throw new SyncStop({
        kind: 'failed',
        error: `still not drained after ${SYNC_MAX_ROUNDS} rounds`,
      });
    } catch (e) {
      const outcome: SyncOutcome =
        e instanceof SyncStop ? e.outcome : { kind: 'failed', error: errorMessage(e) };
      const message =
        outcome.kind === 'revoked'
          ? `device not accepted (${outcome.code})`
          : outcome.kind === 'failed'
            ? outcome.error
            : outcome.kind;
      await store.updateSyncState({ lastError: `${reason}: ${message}` }).catch(() => undefined);
      return outcome;
    }
  }

  function schedule(outcome: SyncOutcome | null): void {
    if (!running) return;
    if (timer !== null) clearTimer(timer);
    let delay = intervalMs;
    if (outcome?.kind === 'failed') {
      failures += 1;
      delay = backoffDelay(failures, random);
      retryAt = now() + delay;
    } else if (outcome !== null) failures = 0;
    timer = setTimer(() => {
      timer = null;
      void syncNow(failures > 0 ? 'retry' : 'interval');
    }, delay);
  }

  function syncNow(reason: SyncReason = 'manual'): Promise<SyncOutcome> {
    // An automatic trigger never sends after stop() (a follow-up queued before it included), and
    // inside the backoff window it leaves the next attempt to the retry timer.
    if (reason !== 'manual' && !running) return Promise.resolve({ kind: 'stopped' });
    if (!BYPASSES_BACKOFF.has(reason) && failures > 0 && now() < retryAt) {
      return Promise.resolve({ kind: 'deferred' });
    }
    if (inFlight) {
      // Coalesce: at most one follow-up run, which starts after the current one finishes.
      again ??= inFlight.then(() => {
        again = null;
        return syncNow(reason);
      });
      return again;
    }
    const current = run(reason)
      .catch((e: unknown): SyncOutcome => ({ kind: 'failed', error: errorMessage(e) }))
      .then((outcome) => {
        inFlight = null;
        schedule(outcome);
        return outcome;
      });
    inFlight = current;
    return current;
  }

  function listen(target: EventTarget | undefined, type: string, fn: () => void): void {
    if (!target?.addEventListener) return;
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  }

  return {
    syncNow,
    start() {
      if (running) return;
      running = true;
      const unsubscribe = store.onAppend((e) => {
        // 08 §4: after each request completes, and on wind-down.
        if (e.type === 'request.completed') void syncNow('request-completed');
        else if (e.type === 'session.ended') void syncNow('wind-down');
      });
      cleanups.push(unsubscribe);
      const g = globalThis as { window?: EventTarget; document?: Document };
      listen(g.window, 'online', () => void syncNow('online'));
      listen(g.document, 'visibilitychange', () => {
        if (g.document?.visibilityState === 'hidden') void syncNow('wind-down');
      });
      void syncNow('start');
    },
    stop() {
      running = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
      for (const c of cleanups.splice(0)) c();
    },
  };
}
