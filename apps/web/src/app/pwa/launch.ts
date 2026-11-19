// Service worker registration and the update-on-next-launch rule (06 §8: "a new service worker
// activates on the next app launch, never mid-session").
//
// At launch, before the app renders:
//   1. Look up the existing registration (no network).
//   2. If an update is already installed and waiting, and this page is controlled by the old
//      worker, this launch is the "next launch": run the two-phase handshake in ./protocol.ts.
//      - QUERY; the worker answers READY or DECLINED. Without an answer within
//        SKIP_WAITING_ANSWER_MS, or with DECLINED (other app windows are open), the page renders
//        on the current version and never sends GO, so the worker never activates under it.
//      - On READY the page commits: it sends GO (the only thing that lets the worker activate),
//        never renders the old build, and reloads once the new worker controls it, or after
//        TAKEOVER_WAIT_MS at the latest. A tab that committed within the last minute without a
//        takeover renders normally next time instead of looping.
//   3. Otherwise render, then register /sw.js. On a first install the worker claims the page, so
//      offline works without a reload. An update found later, while the app runs, installs and
//      waits: no reload and no prompt (children never see update UI).

import { SKIP_WAITING_ANSWER_MS, skipWaitingGo, skipWaitingQuery } from './protocol';

/** The parts of `ServiceWorker` the launch logic uses. */
export interface LaunchWorker {
  postMessage(message: unknown, transfer: Transferable[]): void;
}

/** The parts of `ServiceWorkerContainer` the launch logic uses. */
export interface LaunchContainer {
  readonly controller: unknown;
  getRegistration(
    clientURL?: string,
  ): Promise<{ readonly waiting: LaunchWorker | null } | undefined>;
  register(scriptURL: string, options?: RegistrationOptions): Promise<unknown>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
  removeEventListener(type: 'controllerchange', listener: () => void): void;
}

export interface LaunchOptions {
  /** `navigator.serviceWorker`; undefined where service workers are unavailable. */
  container: LaunchContainer | undefined;
  /** Renders the app. Not called when the launch reloads into a new worker. */
  render: () => void;
  /** `location.reload()`. */
  reload: () => void;
  /** Delays registration until the page has loaded. Default: run immediately. */
  afterLoad?: (run: () => void) => void;
  /** How long to wait for the worker's answer. Default SKIP_WAITING_ANSWER_MS. */
  answerTimeoutMs?: number;
  /** After the worker agreed, how long to wait for it to take control before reloading anyway. */
  takeoverTimeoutMs?: number;
  /** Clock for the request's timestamp. Default `Date.now`. */
  now?: () => number;
  /** Where a committed takeover attempt is remembered (this tab). Default `sessionStorage`. */
  attemptStore?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Non-fatal problems (registration failures). Default: console.warn. */
  warn?: (message: string, error: unknown) => void;
  createChannel?: () => MessageChannel;
}

export type LaunchOutcome = 'no-service-worker' | 'reloading' | 'started';

export const SW_URL = '/sw.js';
export const TAKEOVER_WAIT_MS = 15_000;
const ATTEMPT_KEY = 'number-island.sw-takeover-attempt';
const RETRY_AFTER_MS = 60_000;

type AttemptStore = Pick<Storage, 'getItem' | 'setItem'>;
function defaultAttemptStore(): AttemptStore | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export type TakeoverResult = 'took-over' | 'agreed-no-takeover' | 'declined' | 'no-answer';

/**
 * Asks the waiting worker to activate. Resolves `declined` or `no-answer` (render normally), or,
 * once it agreed, `took-over` when it controls the page or `agreed-no-takeover` after the wait.
 */
export function activateWaitingWorker(
  container: LaunchContainer,
  waiting: LaunchWorker,
  opts: {
    answerTimeoutMs: number;
    takeoverTimeoutMs: number;
    now: () => number;
    createChannel: () => MessageChannel;
    /** Called just before GO is sent (the page has committed to reloading). */
    onCommit?: () => void;
  },
): Promise<TakeoverResult> {
  return new Promise<TakeoverResult>((resolve) => {
    const channel = opts.createChannel();
    let settled = false;
    let tookOver = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (result: TakeoverResult) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      container.removeEventListener('controllerchange', onControllerChange);
      channel.port1.close();
      resolve(result);
    };
    // Listen before asking, so a fast takeover (even before the answer arrives) is not missed.
    const onControllerChange = () => {
      tookOver = true;
      finish('took-over');
    };
    container.addEventListener('controllerchange', onControllerChange);
    timer = setTimeout(() => finish('no-answer'), opts.answerTimeoutMs);
    channel.port1.onmessage = (event: MessageEvent) => {
      // Once finished (the answer timeout fired), the page renders: it must never send GO.
      if (settled || tookOver) return;
      const data = event.data as { type?: unknown; ready?: unknown } | null;
      if (data?.type !== 'SKIP_WAITING_ANSWER' || typeof data.ready !== 'boolean') return;
      if (!data.ready) {
        finish('declined');
        return;
      }
      // Commit: from here on the old build is never rendered; only GO lets the worker activate.
      if (timer !== null) clearTimeout(timer);
      opts.onCommit?.();
      channel.port1.postMessage(skipWaitingGo());
      timer = setTimeout(() => finish('agreed-no-takeover'), opts.takeoverTimeoutMs);
    };
    waiting.postMessage(skipWaitingQuery(opts.now()), [channel.port2]);
  });
}

/** Runs once from main.tsx. See the file comment for the flow. */
export async function launchApp(opts: LaunchOptions): Promise<LaunchOutcome> {
  const { container, render, reload } = opts;
  const warn = opts.warn ?? ((message, error) => console.warn(message, error));
  if (!container) {
    render();
    return 'no-service-worker';
  }

  let registration: Awaited<ReturnType<LaunchContainer['getRegistration']>>;
  try {
    registration = await container.getRegistration('/');
  } catch (e) {
    warn('service worker: could not read the registration', e);
  }
  const waiting = registration?.waiting;
  const now = opts.now ?? (() => Date.now());
  const marker = opts.attemptStore === undefined ? defaultAttemptStore() : opts.attemptStore;
  // A takeover this tab committed to moments ago did not happen (the worker never activated):
  // render on the current version rather than reloading in a loop. The update keeps waiting.
  const lastAttempt = Number(marker?.getItem(ATTEMPT_KEY) ?? Number.NaN);
  const recentlyTried = Number.isFinite(lastAttempt) && now() - lastAttempt < RETRY_AFTER_MS;
  if (waiting && container.controller && !recentlyTried) {
    const result = await activateWaitingWorker(container, waiting, {
      answerTimeoutMs: opts.answerTimeoutMs ?? SKIP_WAITING_ANSWER_MS,
      takeoverTimeoutMs: opts.takeoverTimeoutMs ?? TAKEOVER_WAIT_MS,
      now,
      createChannel: opts.createChannel ?? (() => new MessageChannel()),
      onCommit: () => {
        try {
          marker?.setItem(ATTEMPT_KEY, String(now()));
        } catch {
          // Storage blocked: at worst one more attempt on the next load.
        }
      },
    });
    if (result === 'took-over' || result === 'agreed-no-takeover') {
      reload();
      return 'reloading';
    }
  }

  render();
  const register = () => {
    container.register(SW_URL, { scope: '/' }).catch((e: unknown) => {
      warn('service worker: registration failed', e);
    });
  };
  (opts.afterLoad ?? ((run) => run()))(register);
  return 'started';
}
