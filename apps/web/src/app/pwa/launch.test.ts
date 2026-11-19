import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LaunchContainer, type LaunchOptions, type LaunchWorker, launchApp } from './launch';
import {
  decideSkipWaiting,
  SKIP_WAITING_ANSWER_MS,
  SKIP_WAITING_MAX_AGE_MS,
  skipWaitingRequest,
} from './protocol';

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
    expect(messages).toEqual([{ type: 'SKIP_WAITING', sentAt: expect.any(Number) }]);
    expect(reload).toHaveBeenCalledOnce();
    expect(render).not.toHaveBeenCalled();
    expect(container.register).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it('keeps waiting when the worker declines (other app windows are open)', async () => {
    const { container, messages } = fakeContainer({ controlled: true, waiting: 'decline' });
    const { result, render, reload } = launch(container);
    await expect(result).resolves.toBe('started');
    expect(messages).toEqual([{ type: 'SKIP_WAITING', sentAt: expect.any(Number) }]);
    expect(render).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('starts normally when the worker does not answer in time (it then ignores the stale request)', async () => {
    vi.useFakeTimers();
    const { container } = fakeContainer({ controlled: true, waiting: 'silent' });
    const { result, render, reload } = launch(container);
    await vi.advanceTimersByTimeAsync(SKIP_WAITING_ANSWER_MS - 1);
    expect(render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('started');
    expect(render).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    // The worker would refuse the request by now: it is older than its freshness window.
    expect(SKIP_WAITING_ANSWER_MS).toBeGreaterThan(SKIP_WAITING_MAX_AGE_MS);
  });

  it('never renders the old build once the worker agreed, even if the takeover is slow', async () => {
    vi.useFakeTimers();
    const { container } = fakeContainer({ controlled: true, waiting: 'accept-no-takeover' });
    const { result, render, reload } = launch(container, { takeoverTimeoutMs: 15_000 });
    await vi.advanceTimersByTimeAsync(SKIP_WAITING_ANSWER_MS + 5_000);
    expect(render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(result).resolves.toBe('reloading');
    expect(render).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
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

describe('the worker side of the handshake (src/sw.ts)', () => {
  const t = 1_000_000;
  it('activates for a fresh request from the only window', () => {
    expect(decideSkipWaiting(skipWaitingRequest(t), t + 500, 1)).toEqual({
      type: 'SKIP_WAITING_RESULT',
      activating: true,
    });
  });
  it('declines while other app windows are open', () => {
    expect(decideSkipWaiting(skipWaitingRequest(t), t + 500, 2)?.activating).toBe(false);
  });
  it('declines a request the page may already have given up on', () => {
    expect(
      decideSkipWaiting(skipWaitingRequest(t), t + SKIP_WAITING_MAX_AGE_MS + 1, 1)?.activating,
    ).toBe(false);
    // Unstamped (older pages) or future-dated requests are not fresh either.
    expect(decideSkipWaiting({ type: 'SKIP_WAITING' }, t, 1)?.activating).toBe(false);
    expect(decideSkipWaiting(skipWaitingRequest(t + 10), t, 1)?.activating).toBe(false);
  });
  it('ignores other messages', () => {
    expect(decideSkipWaiting({ type: 'OTHER' }, t, 1)).toBeNull();
    expect(decideSkipWaiting(null, t, 1)).toBeNull();
  });
});
