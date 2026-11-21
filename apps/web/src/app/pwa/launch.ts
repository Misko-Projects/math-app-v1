// Service worker registration (06 §8: "a new service worker activates on the next app launch,
// never mid-session").
//
// The app renders first, then registers /sw.js once the page has loaded. An update found later
// installs and waits; the browser activates it on the next launch, once every app window has
// closed (src/sw.ts never calls skipWaiting()). There is no prompt and no reload, and children
// never see update UI.

/** The parts of `ServiceWorkerContainer` the launch logic uses. */
export interface LaunchContainer {
  register(scriptURL: string, options?: RegistrationOptions): Promise<unknown>;
}

export interface LaunchOptions {
  /** `navigator.serviceWorker`; undefined where service workers are unavailable. */
  container: LaunchContainer | undefined;
  /** Renders the app. */
  render: () => void;
  /** Delays registration until the page has loaded. Default: run immediately. */
  afterLoad?: (run: () => void) => void;
  /** Non-fatal problems (registration failures). Default: console.warn. */
  warn?: (message: string, error: unknown) => void;
}

export type LaunchOutcome = 'no-service-worker' | 'started';

export const SW_URL = '/sw.js';

/** Runs once from main.tsx. */
export function launchApp(opts: LaunchOptions): LaunchOutcome {
  const { container, render } = opts;
  render();
  if (!container) return 'no-service-worker';

  const warn = opts.warn ?? ((message, error) => console.warn(message, error));
  const register = () => {
    container.register(SW_URL, { scope: '/' }).catch((e: unknown) => {
      warn('service worker: registration failed', e);
    });
  };
  (opts.afterLoad ?? ((run) => run()))(register);
  return 'started';
}
