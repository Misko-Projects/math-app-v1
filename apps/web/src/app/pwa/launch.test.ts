import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LaunchContainer, type LaunchOptions, type LaunchWorker, launchApp } from './launch';

/** A MessageChannel stand-in: whatever is posted on port2 arrives at port1.onmessage. */
function fakeChannel() {
  const port1 = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    close: vi.fn(),
  };
  const port2 = {
    postMessage: (data: unknown) => port1.onmessage?.({ data } as MessageEvent),
  };
  return { port1, port2 } as unknown as MessageChannel;
}

type WorkerAnswer = 'accept' | 'decline' | 'silent' | 'accept-no-takeover';

interface FakeOptions {
  controlled?: boolean;
  waiting?: WorkerAnswer | null;
  registration?: 'none' | 'present' | 'throws';
  registerFails?: boolean;
}

function fakeContainer(opts: FakeOptions = {}) {
  const listeners = new Set<() => void>();
  const messages: unknown[] = [];
  const fireControllerChange = () => {
    for (const l of [...listeners]) l();
  };
  const waiting: LaunchWorker | null = opts.waiting
    ? {
        postMessage(message, transfer) {
          messages.push(message);
          const port = transfer[0] as unknown as MessagePort;
          const answer = opts.waiting;
          // The worker answers asynchronously, like the real one in src/sw.ts.
          queueMicrotask(() => {
            if (answer === 'decline') port.postMessage({ activating: false });
            if (answer === 'accept' || answer === 'accept-no-takeover') {
              port.postMessage({ activating: true });
            }
            if (answer === 'accept') queueMicrotask(fireControllerChange);
          });
        },
      }
    : null;
  const container = {
    controller: opts.controlled ? {} : null,
    getRegistration: vi.fn(async () => {
      if (opts.registration === 'throws') throw new Error('storage blocked');
      if (opts.registration === 'none') return undefined;
      return { waiting };
    }),
    register: vi.fn(async () => {
      if (opts.registerFails) throw new Error('offline');
      return {};
    }),
    addEventListener: (_type: 'controllerchange', l: () => void) => listeners.add(l),
    removeEventListener: (_type: 'controllerchange', l: () => void) => listeners.delete(l),
  } satisfies LaunchContainer;
  return { container, messages, listeners, fireControllerChange };
}

function launch(container: LaunchContainer | undefined, extra: Partial<LaunchOptions> = {}) {
  const render = vi.fn();
  const reload = vi.fn();
  const warn = vi.fn();
  const result = launchApp({
    container,
    render,
    reload,
    warn,
    createChannel: fakeChannel,
    ...extra,
  });
  return { result, render, reload, warn };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('launchApp (update on next launch, 06 §8)', () => {
  it('renders without a service worker where none is available', async () => {
    const { result, render, reload } = launch(undefined);
    await expect(result).resolves.toBe('no-service-worker');
    expect(render).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('first install: renders, then registers /sw.js after load', async () => {
    const { container } = fakeContainer({ registration: 'none' });
    let afterLoadRun: (() => void) | undefined;
    const { result, render, reload } = launch(container, {
      afterLoad: (run) => {
        afterLoadRun = run;
      },
    });
    await expect(result).resolves.toBe('started');
    expect(render).toHaveBeenCalledOnce();
    expect(container.register).not.toHaveBeenCalled();
    afterLoadRun?.();
    expect(container.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('a controlled launch with no waiting update starts normally', async () => {
    const { container, messages } = fakeContainer({ controlled: true, waiting: null });
    const { result, render, reload } = launch(container);
    await expect(result).resolves.toBe('started');
    expect(messages).toEqual([]);
    expect(render).toHaveBeenCalledOnce();
    expect(container.register).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('a waiting update at launch takes over and the page reloads once, before rendering', async () => {
    const { container, messages, listeners } = fakeContainer({
      controlled: true,
      waiting: 'accept',
    });
    const { result, render, reload } = launch(container);
    await expect(result).resolves.toBe('reloading');
    expect(messages).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(reload).toHaveBeenCalledOnce();
    expect(render).not.toHaveBeenCalled();
    expect(container.register).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it('keeps waiting when the worker declines (other app windows are open)', async () => {
    const { container, messages } = fakeContainer({ controlled: true, waiting: 'decline' });
    const { result, render, reload } = launch(container);
    await expect(result).resolves.toBe('started');
    expect(messages).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(render).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('starts normally when the takeover does not happen in time', async () => {
    vi.useFakeTimers();
    const { container } = fakeContainer({ controlled: true, waiting: 'accept-no-takeover' });
    const { result, render, reload } = launch(container, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(4999);
    expect(render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('started');
    expect(render).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not activate a waiting worker for an uncontrolled page', async () => {
    const { container, messages } = fakeContainer({ controlled: false, waiting: 'accept' });
    const { result, render, reload } = launch(container);
    await expect(result).resolves.toBe('started');
    expect(messages).toEqual([]);
    expect(render).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('an update that arrives mid-session never reloads the page', async () => {
    const { container, fireControllerChange } = fakeContainer({ controlled: true, waiting: null });
    const { result, reload } = launch(container);
    await expect(result).resolves.toBe('started');
    fireControllerChange();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reports registration problems without failing the launch', async () => {
    const broken = fakeContainer({ registration: 'throws', registerFails: true });
    const { result, render, warn } = launch(broken.container);
    await expect(result).resolves.toBe('started');
    expect(render).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
  });
});
