import { describe, expect, it, vi } from 'vitest';
import { type LaunchContainer, launchApp, SW_URL } from './launch';

/** Resolves once pending promise callbacks (such as a registration rejection) have run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function fakeContainer(registerFails = false) {
  return {
    register: vi.fn(async () => {
      if (registerFails) throw new Error('offline');
      return {};
    }),
  } satisfies LaunchContainer;
}

describe('launchApp (update on next launch, 06 §8)', () => {
  it('renders without a service worker', () => {
    const render = vi.fn();
    const afterLoad = vi.fn();
    expect(launchApp({ container: undefined, render, afterLoad })).toBe('no-service-worker');
    expect(render).toHaveBeenCalledOnce();
    expect(afterLoad).not.toHaveBeenCalled();
  });

  it('renders, then registers /sw.js after load', () => {
    const container = fakeContainer();
    const order: string[] = [];
    const render = vi.fn(() => order.push('render'));
    container.register.mockImplementation(async () => {
      order.push('register');
      return {};
    });
    let loaded: (() => void) | undefined;
    const result = launchApp({ container, render, afterLoad: (run) => (loaded = run) });

    expect(result).toBe('started');
    expect(render).toHaveBeenCalledOnce();
    // Not registered until the page has loaded.
    expect(container.register).not.toHaveBeenCalled();
    loaded?.();
    expect(container.register).toHaveBeenCalledExactlyOnceWith(SW_URL, { scope: '/' });
    expect(order).toEqual(['render', 'register']);
  });

  it('registers immediately when no load hook is given', () => {
    const container = fakeContainer();
    launchApp({ container, render: vi.fn() });
    expect(container.register).toHaveBeenCalledExactlyOnceWith('/sw.js', { scope: '/' });
  });

  it('warns on a registration failure and the app still renders', async () => {
    const container = fakeContainer(true);
    const render = vi.fn();
    const warn = vi.fn();
    expect(launchApp({ container, render, warn })).toBe('started');
    await settle();
    expect(render).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'service worker: registration failed',
      expect.any(Error),
    );
  });

  it('never messages a waiting worker and never reloads, even when an update is waiting', async () => {
    const postMessage = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    // A real container controlled by the old worker, with an installed update waiting.
    const waiting = { postMessage, state: 'installed' };
    const registration = { waiting, active: {}, installing: null };
    const container = {
      ...fakeContainer(),
      controller: {},
      ready: Promise.resolve(registration),
      getRegistration: vi.fn(async () => registration),
      addEventListener: vi.fn(),
    };
    container.register.mockImplementation(async () => registration);
    const render = vi.fn();
    const warn = vi.fn();

    expect(launchApp({ container, render, warn })).toBe('started');
    await settle();

    expect(render).toHaveBeenCalledOnce();
    expect(container.register).toHaveBeenCalledOnce();
    expect(postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(container.addEventListener).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
