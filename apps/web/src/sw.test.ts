// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: vi.fn((url: string) => ({ shell: url })),
  precacheAndRoute: vi.fn(),
}));
vi.mock('workbox-routing', () => ({
  NavigationRoute: class {
    handler: unknown;
    options: { denylist?: RegExp[] };
    constructor(handler: unknown, options: { denylist?: RegExp[] }) {
      this.handler = handler;
      this.options = options;
    }
  },
  registerRoute: vi.fn(),
}));

type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;

/** Evaluates src/sw.ts against a fake ServiceWorkerGlobalScope. */
async function loadWorker() {
  const listeners = new Map<string, Listener[]>();
  const manifest = [{ url: 'index.html', revision: '1' }];
  const scope = {
    __WB_MANIFEST: manifest,
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []) },
  };
  vi.stubGlobal('self', scope);
  vi.resetModules();
  await import('./sw');
  const precaching = await import('workbox-precaching');
  const routing = await import('workbox-routing');
  return { scope, listeners, manifest, precaching, routing };
}

describe('service worker (02 §1, 06 §8)', () => {
  it('precaches the build and serves the shell for every navigation except /api', async () => {
    const { manifest, precaching, routing } = await loadWorker();
    expect(precaching.cleanupOutdatedCaches).toHaveBeenCalledOnce();
    expect(precaching.precacheAndRoute).toHaveBeenCalledExactlyOnceWith(manifest);
    expect(precaching.createHandlerBoundToURL).toHaveBeenCalledWith('index.html');

    const route = vi.mocked(routing.registerRoute).mock.calls[0]?.[0] as unknown as {
      handler: unknown;
      options: { denylist?: RegExp[] };
    };
    expect(route.handler).toEqual({ shell: 'index.html' });
    const denied = (path: string) => (route.options.denylist ?? []).some((re) => re.test(path));
    expect(denied('/api')).toBe(true);
    expect(denied('/api/sync')).toBe(true);
    expect(denied('/play')).toBe(false);
    expect(denied('/apiary')).toBe(false);
  });

  it('never skips waiting: no message handler, so an update activates only on the next launch', async () => {
    const { scope, listeners } = await loadWorker();
    expect([...listeners.keys()]).toEqual(['activate']);
    expect(scope.skipWaiting).not.toHaveBeenCalled();
  });

  it('claims open pages on activate', async () => {
    const { scope, listeners } = await loadWorker();
    const waitUntil = vi.fn();
    for (const listener of listeners.get('activate') ?? []) listener({ waitUntil });
    expect(scope.clients.claim).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]?.[0];
    expect(scope.skipWaiting).not.toHaveBeenCalled();
  });
});
