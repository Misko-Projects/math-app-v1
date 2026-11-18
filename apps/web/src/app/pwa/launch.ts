// Service worker registration and the update-on-next-launch rule (06 §8: "a new service worker
// activates on the next app launch, never mid-session").
//
// At launch, before the app renders:
//   1. Look up the existing registration (no network).
//   2. If an update is already installed and waiting, and this page is controlled by the old
//      worker, this launch is the "next launch": ask the waiting worker to take over (SKIP_WAITING)
//      and, once it controls the page, reload once so the page runs the new build.
//      The worker declines when other app windows are open (src/sw.ts); the update then keeps
//      waiting and the app starts normally on the current version.
//   3. Otherwise render, then register /sw.js. On a first install the worker claims the page, so
//      offline works without a reload. An update found later, while the app runs, installs and
//      waits: no reload and no prompt (children never see update UI).

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
  /** How long to wait for the waiting worker's answer and takeover. Default 5 s. */
  timeoutMs?: number;
  /** Non-fatal problems (registration failures). Default: console.warn. */
  warn?: (message: string, error: unknown) => void;
  createChannel?: () => MessageChannel;
}

export type LaunchOutcome = 'no-service-worker' | 'reloading' | 'started';

export const SW_URL = '/sw.js';
const SKIP_WAITING = { type: 'SKIP_WAITING' } as const;

/**
 * Asks the waiting worker to activate and resolves true once it controls the page. Resolves false
 * when it declines (other windows are open) or nothing happens within `timeoutMs`.
 */
export function activateWaitingWorker(
  container: LaunchContainer,
  waiting: LaunchWorker,
  timeoutMs: number,
  createChannel: () => MessageChannel,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const channel = createChannel();
    let settled = false;
    const finish = (tookOver: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      container.removeEventListener('controllerchange', onControllerChange);
      channel.port1.close();
      resolve(tookOver);
    };
    const onControllerChange = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    // Listen before asking, so a fast takeover is not missed.
    container.addEventListener('controllerchange', onControllerChange);
    channel.port1.onmessage = (event: MessageEvent) => {
      const data = event.data as { activating?: unknown } | null;
      if (data && data.activating === false) finish(false);
    };
    waiting.postMessage(SKIP_WAITING, [channel.port2]);
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
    const tookOver = await activateWaitingWorker(
      container,
      waiting,
      opts.timeoutMs ?? 5000,
      opts.createChannel ?? (() => new MessageChannel()),
    );
    if (tookOver) {
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
