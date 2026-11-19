// Service worker registration and the update-on-next-launch rule (06 §8: "a new service worker
// activates on the next app launch, never mid-session").
//
// At launch, before the app renders:
//   1. Look up the existing registration (no network).
//   2. If an update is already installed and waiting, and this page is controlled by the old
//      worker, this launch is the "next launch": ask the waiting worker to take over (the
//      handshake in ./protocol.ts).
//      - The worker answers within SKIP_WAITING_ANSWER_MS or never acts on the request (it ignores
//        requests older than SKIP_WAITING_MAX_AGE_MS), so a page that gave up waiting can render
//        without a late takeover under it.
//      - If it declines (other app windows are open) or doesn't answer, the update keeps waiting
//        and the app starts normally on the current version.
//      - If it agrees, the page never renders the old build: it reloads once the new worker
//        controls it, or after TAKEOVER_WAIT_MS at the latest, and the next load runs the new build.
//   3. Otherwise render, then register /sw.js. On a first install the worker claims the page, so
//      offline works without a reload. An update found later, while the app runs, installs and
//      waits: no reload and no prompt (children never see update UI).

import { SKIP_WAITING_ANSWER_MS, skipWaitingRequest } from './protocol';

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
  /** Non-fatal problems (registration failures). Default: console.warn. */
  warn?: (message: string, error: unknown) => void;
  createChannel?: () => MessageChannel;
}

export type LaunchOutcome = 'no-service-worker' | 'reloading' | 'started';

export const SW_URL = '/sw.js';
export const TAKEOVER_WAIT_MS = 15_000;

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
      const data = event.data as { activating?: unknown } | null;
      if (!data || typeof data.activating !== 'boolean') return;
      if (!data.activating) {
        finish('declined');
        return;
      }
      if (tookOver) return;
      // Agreed: from now on the old build is never rendered.
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => finish('agreed-no-takeover'), opts.takeoverTimeoutMs);
    };
    waiting.postMessage(skipWaitingRequest(opts.now()), [channel.port2]);
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
  if (waiting && container.controller) {
    const result = await activateWaitingWorker(container, waiting, {
      answerTimeoutMs: opts.answerTimeoutMs ?? SKIP_WAITING_ANSWER_MS,
      takeoverTimeoutMs: opts.takeoverTimeoutMs ?? TAKEOVER_WAIT_MS,
      now: opts.now ?? (() => Date.now()),
      createChannel: opts.createChannel ?? (() => new MessageChannel()),
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
