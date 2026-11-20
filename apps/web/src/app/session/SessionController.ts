// The session lifecycle (W00; 04 §6.1, 05 §8, 02 §5.8): one child plays at a time on a device.
//
// - `canStart(childId)` says no during the child's quiet hours (local to the family time zone)
//   and once today's play has used up the daily cap.
// - `start()` appends `session.started` with `budgetMinutes = min(sessionMinutes, cap left)`.
// - Active time counts only while the page is visible. A checkpoint of it is saved to
//   localStorage every 15 s (and whenever the page hides), so a session that never ended (the tab
//   was closed, the tablet died) is closed at the next boot as `abandoned` with that time.
// - Tabs of one browser share the device, its log and the checkpoints. One device-wide Web Lock,
//   `ni.play`, is held while a session runs, so only one tab plays at a time: a start in another
//   tab is refused at once (`elsewhere`, and the picker says so). Closing abandoned sessions takes
//   the same lock, reads the log only once it holds it, and never closes a session whose
//   checkpoint is fresh (some tab may still be playing it, e.g. where Web Locks fail). The plan
//   counts such an open session's checkpointed time toward the daily cap.
// - The daily cap counts each session once, on the local day it started (./time.ts).
// - The wind-down signal fires once when the budget is used (`wind-down`), the daily cap is
//   reached (`daily-cap`) or quiet hours begin (`quiet-hours`). The screen in charge (later the
//   TaskRunner, I01/R01) lets the child finish the current item and then calls `end(reason)`
//   (05 §8: no overrun beyond the current item).
// - `end(reason)` appends `session.ended` with the active time, math time and item count.
//
// Framework-free: the clock, timers, page visibility and checkpoint storage are injected.

import type {
  AnyEventEnvelope,
  ChildId,
  EventEnvelope,
  EventPayloads,
} from '@number-island/shared';
import { newId as defaultNewId } from '@number-island/shared';
import { type DataStore, DataStoreError } from '@/data/store';
import { inQuietHours, isEventOf, localTime, playedMsOnDay, sameId } from './time';

export type SessionEndReason = EventPayloads['session.ended']['reason'];
export type WindDownReason = Extract<SessionEndReason, 'wind-down' | 'daily-cap' | 'quiet-hours'>;
export type BlockedReason = Extract<SessionEndReason, 'daily-cap' | 'quiet-hours'>;
export type SessionTrigger = EventPayloads['session.started']['trigger'];

export type CanStartResult =
  | { ok: true; budgetMinutes: number }
  | {
      ok: false;
      reason: BlockedReason;
      /** For quiet hours: when play opens again, "HH:MM" in the family time zone. */
      opensAt?: string;
    };
/**
 * Why `start()` refused: a blocked time, another tab kept playing (it didn't yield in time), or
 * the caller cancelled (its signal aborted).
 */
export type StartRefusal = BlockedReason | 'elsewhere' | 'cancelled';

export interface ActiveSession {
  sessionId: string;
  childId: ChildId;
  budgetMinutes: number;
  trigger: SessionTrigger;
  startedAt: number;
}

export type SessionSnapshot =
  | { status: 'idle' }
  | { status: 'active'; session: ActiveSession; windDown: WindDownReason | null };

export type SessionStore = Pick<
  DataStore,
  'now' | 'append' | 'events' | 'device' | 'familySettings' | 'childSettings'
>;

export interface SessionTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** Page visibility (`document.visibilityState`), injectable for tests. */
export interface PageVisibility {
  visible(): boolean;
  /** Calls `onChange` when visibility may have flipped (visibilitychange, pagehide). Returns the unsubscribe. */
  subscribe(onChange: () => void): () => void;
}

export type CheckpointStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Exclusive locks shared by the tabs of one browser profile (Web Locks). The browser releases a
 * held lock when its tab closes or crashes.
 */
export interface SessionLocks {
  /**
   * Takes the lock `name`: at once if it is free (`waitMs` 0), or waiting up to `waitMs`.
   * Resolves with the function that releases it, or null when it wasn't taken.
   */
  acquire(name: string, waitMs: number): Promise<(() => void) | null>;
}

/** `navigator.locks` (Web Locks API) as SessionLocks; null where the browser lacks it. */
export function webLocks(): SessionLocks | null {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return null;
  return {
    acquire(name, waitMs) {
      return new Promise<(() => void) | null>((resolve, reject) => {
        let release: () => void = () => {};
        const released = new Promise<void>((r) => {
          release = r;
        });
        const abort = waitMs > 0 ? new AbortController() : null;
        const timer = abort ? setTimeout(() => abort.abort(), waitMs) : null;
        const options: LockOptions = abort ? { signal: abort.signal } : { ifAvailable: true };
        locks
          .request(name, options, (lock) => {
            if (timer !== null) clearTimeout(timer);
            if (!lock) {
              resolve(null);
              return undefined;
            }
            resolve(release);
            return released;
          })
          .catch((e: unknown) => {
            if (timer !== null) clearTimeout(timer);
            if (e instanceof DOMException && e.name === 'AbortError') resolve(null);
            else reject(e);
          });
      });
    },
  };
}

export interface SessionCheckpoint {
  activeMs: number;
  mathMs: number;
  items: number;
  at: number;
}

export interface SessionControllerOptions {
  store: SessionStore;
  /** Clock (ms epoch). Default `store.now`. */
  now?: () => number;
  /** Elapsed real time (ms) that no clock correction moves. Default `performance.now`. */
  monotonic?: () => number;
  timers?: SessionTimers;
  visibility?: PageVisibility;
  /** Where activity checkpoints go. Default `localStorage` (null: none). */
  storage?: CheckpointStorage | null;
  /** Cross-tab play lock. Default `webLocks()` (null: none, as in browsers without it). */
  locks?: SessionLocks | null;
  newId?: () => string;
  /** How often the clock is checked against the budget, cap and quiet hours. */
  tickMs?: number;
  /** How often a checkpoint is saved while playing. */
  checkpointMs?: number;
  /** A failed write (storage full, a deleted child) is reported here, never thrown at a tick. */
  onError?: (scope: string, error: unknown) => void;
}

const MINUTE = 60_000;
export const SESSION_TICK_MS = 1_000;
export const CHECKPOINT_MS = 15_000;
/** Less than a minute of the daily cap left counts as reached: no 20-second sessions. */
export const MIN_SESSION_MINUTES = 1;
export const CHECKPOINT_PREFIX = 'ni.session.';
/** The device-wide Web Lock held while a session runs in some tab (one player per device). */
export const PLAY_LOCK = 'ni.play';
/**
 * A session whose checkpoint is younger than this may still be playing in some tab (checkpoints
 * are saved every 15 s, and at least every minute in a hidden tab), so no sweep closes it.
 */
export const LIVE_CHECKPOINT_MS = 2 * 60_000;
/**
 * A session with no checkpoint at all shows no sign of life or of death: its tab couldn't save one
 * (no storage, or every write failed) and may be playing still. No sweep closes it until its start
 * is this old, far longer than a child plays.
 */
export const NO_CHECKPOINT_MS = 24 * 60 * 60_000;

export function documentVisibility(): PageVisibility {
  return {
    visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    subscribe(onChange) {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('visibilitychange', onChange);
      window.addEventListener('pagehide', onChange);
      return () => {
        document.removeEventListener('visibilitychange', onChange);
        window.removeEventListener('pagehide', onChange);
      };
    },
  };
}

/** Lowercased ids of the sessions `events` has an end for. */
function endedSessions(events: readonly AnyEventEnvelope[]): Set<string> {
  const ended = new Set<string>();
  for (const e of events) {
    if (isEventOf(e, 'session.ended')) ended.add(e.payload.sessionId.toLowerCase());
  }
  return ended;
}

/** The store's refusal of a second `session.ended` for one session. */
function alreadyEnded(e: unknown): boolean {
  return e instanceof DataStoreError && e.code === 'session_ended';
}

/** `fn` that runs at most once (a lock released twice would be harmless, but explicit is clearer). */
function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}

function defaultStorage(): CheckpointStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // storage disabled (some private modes)
  }
}

interface Running {
  session: ActiveSession;
  windDown: WindDownReason | null;
  /** Active ms banked before the current visible stretch. */
  bankedMs: number;
  /** Start of the current visible stretch, or null while hidden. */
  visibleSince: number | null;
  mathMs: number;
  items: number;
  lastCheckpointAt: number;
  /** Settings and play-before-this-session, as read at start. */
  quietHours: { start: string; end: string } | null;
  timeZone: string;
  capMs: number | null;
  /** The budget is what was left of the daily cap: reaching it means the cap is reached. */
  budgetIsCap: boolean;
  playedBefore: { day: string; ms: number };
  tick: unknown;
  unsubscribeVisibility: () => void;
  /** Releases the device's play lock (a no-op without locks). */
  releaseLock: () => void;
}

/** The play lock's release (a no-op where Web Locks are missing or failed). */
type PlayLock = () => void;
const NO_LOCK: PlayLock = () => {};

interface Plan {
  result: CanStartResult;
  quietHours: Running['quietHours'];
  timeZone: string;
  capMs: number | null;
  budgetIsCap: boolean;
  playedToday: { day: string; ms: number };
}

export class SessionController {
  readonly #store: SessionStore;
  readonly #now: () => number;
  readonly #monotonic: () => number;
  /** Future-stamped checkpoints this controller's sweeps have seen: which one, and since when. */
  readonly #futureSeen = new Map<string, { at: number; since: number }>();
  readonly #timers: SessionTimers;
  readonly #visibility: PageVisibility;
  readonly #storage: CheckpointStorage | null;
  readonly #locks: SessionLocks | null;
  readonly #newId: () => string;
  readonly #tickMs: number;
  readonly #checkpointMs: number;
  readonly #onError: (scope: string, error: unknown) => void;
  readonly #listeners = new Set<() => void>();
  readonly #windDownListeners = new Set<(reason: WindDownReason, session: ActiveSession) => void>();
  #running: Running | null = null;
  #snapshot: SessionSnapshot = { status: 'idle' };
  #chain: Promise<unknown> = Promise.resolve();
  #disposed = false;

  constructor(opts: SessionControllerOptions) {
    this.#store = opts.store;
    this.#now = opts.now ?? (() => opts.store.now());
    this.#monotonic = opts.monotonic ?? (() => performance.now());
    this.#timers = opts.timers ?? (globalThis as unknown as SessionTimers);
    this.#visibility = opts.visibility ?? documentVisibility();
    this.#storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    this.#locks = opts.locks === undefined ? webLocks() : opts.locks;
    this.#newId = opts.newId ?? defaultNewId;
    this.#tickMs = opts.tickMs ?? SESSION_TICK_MS;
    this.#checkpointMs = opts.checkpointMs ?? CHECKPOINT_MS;
    this.#onError = opts.onError ?? (() => {});
  }

  // ---------- observing ----------

  /** Re-render hook for `useSyncExternalStore`: called when the snapshot changes. */
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot => this.#snapshot;

  /**
   * The wind-down hook (04 §6.4): called once per session when it should wind down. The listener
   * lets the child finish the current item, then calls `end(reason)`. A listener added after the
   * signal fired is called at once.
   */
  onWindDown(listener: (reason: WindDownReason, session: ActiveSession) => void): () => void {
    this.#windDownListeners.add(listener);
    const r = this.#running;
    if (r?.windDown) listener(r.windDown, r.session);
    return () => this.#windDownListeners.delete(listener);
  }

  /** Active (visible) milliseconds of the running session; 0 when idle. */
  activeMs(): number {
    const r = this.#running;
    if (!r) return 0;
    return r.bankedMs + (r.visibleSince === null ? 0 : Math.max(0, this.#now() - r.visibleSince));
  }

  // ---------- starting ----------

  /** Whether `childId` may start a session now, and with what budget. */
  canStart(childId: ChildId): Promise<CanStartResult> {
    return this.#serial(async () => (await this.#plan(childId)).result);
  }

  /**
   * Starts a session for `childId` (ending another child's running session as `child-exit`
   * first). Resolves with the session, or with the reason it may not start. Starting the child
   * whose session is already running returns that session. While another tab is playing, the
   * start is refused at once (`elsewhere`). An aborted `signal` (the child closed the picture pad
   * meanwhile) refuses it (`cancelled`) before anything is written.
   */
  start(
    childId: ChildId,
    trigger: SessionTrigger = 'child',
    opts: { signal?: AbortSignal } = {},
  ): Promise<
    { ok: true; session: ActiveSession } | { ok: false; reason: StartRefusal; opensAt?: string }
  > {
    return this.#serial(async () => {
      if (opts.signal?.aborted) return { ok: false as const, reason: 'cancelled' as const };
      const current = this.#running;
      if (current && sameId(current.session.childId, childId) && current.windDown === null) {
        return { ok: true as const, session: current.session };
      }
      if (current) await this.#end(current.windDown ?? 'child-exit');
      // The play lock first: the plan below then sees every other tab's play, ended and written.
      const releaseLock = await this.#tryPlayLock();
      if (!releaseLock) return { ok: false as const, reason: 'elsewhere' as const };
      let plan: Plan;
      try {
        // Sessions left behind by a closed tab (their checkpoints gone quiet) are closed first.
        // One still fresh is left open, and the plan counts its checkpointed play instead.
        try {
          await this.#closeAbandoned();
        } catch (e) {
          this.#onError('session.abandoned', e);
        }
        plan = await this.#plan(childId);
      } catch (e) {
        releaseLock();
        throw e;
      }
      if (!plan.result.ok) {
        releaseLock();
        return plan.result;
      }
      if (opts.signal?.aborted) {
        releaseLock();
        return { ok: false as const, reason: 'cancelled' as const };
      }
      const now = this.#now();
      const session: ActiveSession = {
        sessionId: this.#newId(),
        childId,
        budgetMinutes: plan.result.budgetMinutes,
        trigger,
        startedAt: now,
      };
      // A fresh checkpoint exists before the start is in the log: a sweep in another tab (one that
      // got the lock this tab's failed request missed) sees a live session, never an abandoned one.
      this.#writeCheckpoint(session.sessionId, { activeMs: 0, mathMs: 0, items: 0, at: now });
      try {
        await this.#store.append(
          'session.started',
          { sessionId: session.sessionId, budgetMinutes: session.budgetMinutes, trigger },
          { childId },
        );
      } catch (e) {
        this.#removeCheckpoint(session.sessionId);
        releaseLock();
        throw e;
      }
      if (this.#disposed) {
        releaseLock();
        return { ok: true as const, session };
      }
      const visible = this.#visibility.visible();
      const running: Running = {
        session,
        windDown: null,
        bankedMs: 0,
        visibleSince: visible ? now : null,
        mathMs: 0,
        items: 0,
        lastCheckpointAt: now,
        quietHours: plan.quietHours,
        timeZone: plan.timeZone,
        capMs: plan.capMs,
        budgetIsCap: plan.budgetIsCap,
        playedBefore: plan.playedToday,
        tick: null,
        unsubscribeVisibility: () => {},
        releaseLock,
      };
      this.#running = running;
      // Cancelled during the start write (the picker closed or unmounted): end what just started
      // at once, so nothing plays off screen holding the play lock.
      if (opts.signal?.aborted) {
        await this.#end('child-exit');
        return { ok: false as const, reason: 'cancelled' as const };
      }
      running.unsubscribeVisibility = this.#visibility.subscribe(() => this.#onVisibility());
      running.tick = this.#timers.setInterval(() => this.#tick(), this.#tickMs);
      this.#saveCheckpoint(running);
      this.#publish();
      return { ok: true as const, session };
    });
  }

  /**
   * The checkpointed play of `childId`'s sessions that started on `day` and have no end in
   * `events`, other than this controller's own, by lowercased session id. A session another tab
   * may still be playing is left open by the sweep, and its time so far counts toward the cap.
   */
  #openCheckpoints(
    events: readonly AnyEventEnvelope[],
    childId: ChildId,
    day: string,
    timeZone: string,
  ): Map<string, number> {
    const ended = endedSessions(events);
    const own = this.#running?.session.sessionId.toLowerCase();
    const open = new Map<string, number>();
    for (const e of events) {
      if (!isEventOf(e, 'session.started') || !sameId(e.childId, childId)) continue;
      const key = e.payload.sessionId.toLowerCase();
      if (ended.has(key) || key === own) continue;
      if (localTime(e.ts, timeZone).day !== day) continue;
      open.set(key, this.#readCheckpoint(e.payload.sessionId)?.activeMs ?? 0);
    }
    return open;
  }

  async #plan(childId: ChildId): Promise<Plan> {
    const [family, child, first] = await Promise.all([
      this.#store.familySettings(),
      this.#store.childSettings(childId),
      this.#store.events(),
    ]);
    const now = this.#now();
    const timeZone = family.timezone;
    const day = localTime(now, timeZone).day;
    const r = this.#running;
    const runningMs = r && sameId(r.session.childId, childId) ? this.activeMs() : 0;
    // Open sessions' checkpoints first, then the log again: a tab that ends its session in
    // between writes the end before it removes the checkpoint, so its time is in one or the
    // other (counted once: from the end if the second read has it, else from the checkpoint).
    const open = this.#openCheckpoints(first, childId, day, timeZone);
    const events = open.size > 0 ? await this.#store.events() : first;
    const ended = endedSessions(events);
    let openMs = 0;
    for (const [key, ms] of open) if (!ended.has(key)) openMs += ms;
    const playedMs = playedMsOnDay(events, childId, day, timeZone) + runningMs + openMs;
    const base = {
      quietHours: child.quietHours,
      timeZone,
      capMs: child.dailyCapMinutes === null ? null : child.dailyCapMinutes * MINUTE,
      playedToday: { day, ms: playedMs },
    };
    if (inQuietHours(now, child.quietHours, timeZone)) {
      return {
        ...base,
        budgetIsCap: false,
        result: { ok: false, reason: 'quiet-hours', opensAt: child.quietHours?.end ?? '' },
      };
    }
    if (base.capMs === null) {
      return {
        ...base,
        budgetIsCap: false,
        result: { ok: true, budgetMinutes: child.sessionMinutes },
      };
    }
    const leftMinutes = Math.floor((base.capMs - playedMs) / MINUTE);
    if (leftMinutes < MIN_SESSION_MINUTES) {
      return { ...base, budgetIsCap: false, result: { ok: false, reason: 'daily-cap' } };
    }
    const budgetMinutes = Math.min(child.sessionMinutes, leftMinutes);
    return {
      ...base,
      budgetIsCap: budgetMinutes < child.sessionMinutes,
      result: { ok: true, budgetMinutes },
    };
  }

  // ---------- hooks for the TaskRunner ----------

  /** Adds time spent on math items (the TaskRunner reports it per item; 04 §7 math density). */
  recordMath(ms: number): void {
    const r = this.#running;
    if (!r || !Number.isFinite(ms) || ms <= 0) return;
    r.mathMs += ms;
  }

  /** Counts one finished item. */
  recordItem(): void {
    const r = this.#running;
    if (r) r.items += 1;
  }

  // ---------- ending ----------

  /** Ends the running session with `reason` and appends `session.ended`. Null when idle. */
  end(reason: SessionEndReason): Promise<EventEnvelope<'session.ended'> | null> {
    return this.#serial(() => this.#end(reason));
  }

  async #end(reason: SessionEndReason): Promise<EventEnvelope<'session.ended'> | null> {
    const r = this.#running;
    if (!r) return null;
    this.#bank(r);
    this.#stopTracking(r);
    this.#running = null;
    // If the write below fails, this checkpoint lets the next boot close it as abandoned.
    this.#saveCheckpoint(r);
    this.#publish();
    const payload = this.#payload(r, reason);
    try {
      const event = await this.#store.append('session.ended', payload, {
        childId: r.session.childId,
      });
      this.#removeCheckpoint(r.session.sessionId);
      return event;
    } catch (e) {
      // The log already holds this session's end (a sweep in a tab that saw no sign of this one
      // wrote it): the session is closed, and the store keeps that one end.
      if (!alreadyEnded(e)) throw e;
      this.#removeCheckpoint(r.session.sessionId);
      return null;
    } finally {
      // Released only once the end is written (or failed, leaving the checkpoint for recovery).
      r.releaseLock();
    }
  }

  #payload(r: Running, reason: SessionEndReason): EventPayloads['session.ended'] {
    const activeMs = Math.round(r.bankedMs);
    return {
      sessionId: r.session.sessionId,
      reason,
      activeMs,
      mathMs: Math.round(Math.min(r.mathMs, activeMs)),
      items: r.items,
    };
  }

  /**
   * Closes this device's sessions that started but never ended (a closed tab, a dead battery):
   * each gets `session.ended` with reason `abandoned` and the last saved checkpoint (else 0).
   * The running session is left alone. Returns how many were closed.
   *
   * It runs holding the play lock and reads the log only then: no other tab is playing, and any
   * session another tab ended is already in the log. While another tab plays, nothing is closed
   * (the next sweep, at the next picker visit or boot, tries again). A session whose checkpoint is
   * fresh (younger than LIVE_CHECKPOINT_MS) is never closed: a tab that couldn't take the lock
   * may still be playing it. It is closed once its checkpoint has gone quiet. One with no
   * checkpoint at all is closed only after NO_CHECKPOINT_MS. Sweeps in two tabs without locks may
   * race: the store keeps one end per session, and only the sweep that wrote it counts it.
   */
  closeAbandoned(): Promise<number> {
    return this.#serial(async () => {
      // A running session here means this controller already holds the play lock (if it could).
      // A running session here means this controller already holds the play lock (if it could).
      const release = this.#running ? NO_LOCK : await this.#tryPlayLock();
      if (!release) return 0;
      try {
        return await this.#closeAbandoned();
      } finally {
        release();
      }
    });
  }

  async #closeAbandoned(): Promise<number> {
    const [events, device] = await Promise.all([this.#store.events(), this.#store.device()]);
    const ended = endedSessions(events);
    let closed = 0;
    for (const e of events) {
      if (!isEventOf(e, 'session.started') || !sameId(e.deviceId, device.deviceId)) continue;
      const { sessionId } = e.payload;
      const key = sessionId.toLowerCase();
      if (ended.has(key) || this.#running?.session.sessionId === sessionId) continue;
      const cp = this.#readCheckpoint(sessionId);
      // A checkpoint saved recently means some tab may still be playing it (one whose lock request
      // failed, or a browser without Web Locks): leave it open; plans count its time. A session
      // with no checkpoint is left open for a day: its tab can't save one (no storage, or a failed
      // write), so nothing here tells a live session from a dead one.
      const now = this.#now();
      if (cp) {
        if (cp.at - now >= LIVE_CHECKPOINT_MS) {
          // Stamped by a clock that has since been set back: its age can't be read from any
          // wall clock. This controller notes (in memory, nothing is written) when it first saw
          // this exact checkpoint, on a clock no correction moves. A tab still playing saves a
          // new checkpoint at its next tick; a dead one is closed once it has been seen
          // unchanged for LIVE_CHECKPOINT_MS of real time (the follow-up sweep after boot).
          const seen = this.#futureSeen.get(key);
          const elapsed = this.#monotonic();
          if (!seen || seen.at !== cp.at) {
            this.#futureSeen.set(key, { at: cp.at, since: elapsed });
            continue;
          }
          if (elapsed - seen.since < LIVE_CHECKPOINT_MS) continue;
        } else if (now - cp.at < LIVE_CHECKPOINT_MS) {
          continue;
        }
      } else if (now - (e.clientTs ?? e.ts) < NO_CHECKPOINT_MS) {
        continue;
      }
      ended.add(key);
      const activeMs = Math.round(cp?.activeMs ?? 0);
      try {
        await this.#store.append(
          'session.ended',
          {
            sessionId,
            reason: 'abandoned',
            activeMs,
            mathMs: Math.round(Math.min(cp?.mathMs ?? 0, activeMs)),
            items: cp?.items ?? 0,
          },
          { childId: e.childId },
        );
        closed += 1;
        this.#removeCheckpoint(sessionId);
      } catch (err) {
        if (alreadyEnded(err)) {
          // Another tab's sweep closed it since this one read the log: the store keeps one end.
          this.#removeCheckpoint(sessionId);
          continue;
        }
        // A deleted child's session can't be closed (and no longer matters); others retry later.
        this.#onError('session.abandoned', err);
      }
    }
    return closed;
  }

  /** Stops the clock without ending the session (app teardown); the checkpoint stays. */
  dispose(): void {
    this.#disposed = true;
    const r = this.#running;
    if (r) {
      this.#bank(r);
      this.#saveCheckpoint(r);
      this.#stopTracking(r);
      r.releaseLock();
    }
    this.#running = null;
    this.#snapshot = { status: 'idle' };
    this.#listeners.clear();
    this.#windDownListeners.clear();
  }

  // ---------- internals ----------

  /**
   * The play lock if it is free now; null while another tab holds it. Without Web Locks, or if
   * the lock API fails, a no-op lock: play goes on, and only the fresh-checkpoint rule protects
   * other tabs' sessions.
   */
  async #tryPlayLock(): Promise<PlayLock | null> {
    if (!this.#locks) return NO_LOCK;
    try {
      const release = await this.#locks.acquire(PLAY_LOCK, 0);
      return release ? once(release) : null;
    } catch (e) {
      this.#onError('session.lock', e);
      return NO_LOCK;
    }
  }

  #serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#chain.then(fn, fn);
    this.#chain = run.catch(() => {});
    return run;
  }

  /** Moves the current visible stretch into the bank (the stretch restarts now if visible). */
  #bank(r: Running): void {
    if (r.visibleSince === null) return;
    const now = this.#now();
    r.bankedMs += Math.max(0, now - r.visibleSince);
    r.visibleSince = now;
  }

  #stopTracking(r: Running): void {
    r.visibleSince = null;
    r.unsubscribeVisibility();
    if (r.tick !== null) this.#timers.clearInterval(r.tick);
    r.tick = null;
  }

  #onVisibility(): void {
    const r = this.#running;
    if (!r) return;
    const visible = this.#visibility.visible();
    if (visible && r.visibleSince === null) {
      r.visibleSince = this.#now();
    } else if (!visible && r.visibleSince !== null) {
      this.#bank(r);
      r.visibleSince = null;
      this.#saveCheckpoint(r);
    }
  }

  #tick(): void {
    const r = this.#running;
    if (!r) return;
    const now = this.#now();
    // Either way round: after the device clock moves back, the next tick saves a checkpoint with
    // the corrected time rather than waiting for the clock to catch up with the old one.
    if (Math.abs(now - r.lastCheckpointAt) >= this.#checkpointMs) {
      this.#bank(r);
      this.#saveCheckpoint(r);
    }
    if (r.windDown !== null) return;
    const active = this.activeMs();
    const reason = this.#windDownReason(r, now, active);
    if (reason) this.#fireWindDown(r, reason);
  }

  #windDownReason(r: Running, now: number, active: number): WindDownReason | null {
    if (inQuietHours(now, r.quietHours, r.timeZone)) return 'quiet-hours';
    if (r.capMs !== null) {
      // Past local midnight the earlier sessions belong to yesterday.
      const day = localTime(now, r.timeZone).day;
      const before = day === r.playedBefore.day ? r.playedBefore.ms : 0;
      if (before + active >= r.capMs) return 'daily-cap';
    }
    if (active >= r.session.budgetMinutes * MINUTE)
      return r.budgetIsCap ? 'daily-cap' : 'wind-down';
    return null;
  }

  #fireWindDown(r: Running, reason: WindDownReason): void {
    r.windDown = reason;
    this.#publish();
    for (const listener of [...this.#windDownListeners]) {
      try {
        listener(reason, r.session);
      } catch (e) {
        this.#onError('session.wind-down', e);
      }
    }
  }

  #publish(): void {
    const r = this.#running;
    this.#snapshot = r
      ? { status: 'active', session: r.session, windDown: r.windDown }
      : { status: 'idle' };
    for (const listener of [...this.#listeners]) listener();
  }

  #saveCheckpoint(r: Running): void {
    r.lastCheckpointAt = this.#now();
    this.#writeCheckpoint(r.session.sessionId, {
      activeMs: Math.round(r.bankedMs),
      mathMs: Math.round(r.mathMs),
      items: r.items,
      at: r.lastCheckpointAt,
    });
  }

  #writeCheckpoint(sessionId: string, cp: SessionCheckpoint): void {
    if (!this.#storage) return;
    try {
      this.#storage.setItem(CHECKPOINT_PREFIX + sessionId, JSON.stringify(cp));
    } catch (e) {
      this.#onError('session.checkpoint', e);
    }
  }

  #readCheckpoint(sessionId: string): SessionCheckpoint | null {
    try {
      const raw = this.#storage?.getItem(CHECKPOINT_PREFIX + sessionId);
      if (!raw) return null;
      const cp = JSON.parse(raw) as Partial<SessionCheckpoint>;
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
      return {
        activeMs: num(cp.activeMs),
        mathMs: num(cp.mathMs),
        items: Math.floor(num(cp.items)),
        at: num(cp.at),
      };
    } catch {
      return null;
    }
  }

  #removeCheckpoint(sessionId: string): void {
    this.#futureSeen.delete(sessionId.toLowerCase());
    try {
      this.#storage?.removeItem(CHECKPOINT_PREFIX + sessionId);
    } catch {
      // Nothing to do: a stale checkpoint is ignored once its session has ended.
    }
  }
}
