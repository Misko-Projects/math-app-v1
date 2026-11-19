import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LaunchContainer, type LaunchOptions, type LaunchWorker, launchApp } from './launch';
import {
  answerSkipWaiting,
  isSkipWaitingGo,
  SKIP_WAITING_ANSWER_MS,
  SKIP_WAITING_MAX_AGE_MS,
  skipWaitingQuery,
} from './protocol';

/**
 * A MessageChannel stand-in. port2 is the worker's end: what it posts arrives at port1.onmessage
 * (asynchronously, like a real port), and what the page posts on port1 is recorded for the worker.
 */
function fakeChannel(sentToWorker: unknown[]) {
  const port1 = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: (data: unknown) => sentToWorker.push(data),
    close: vi.fn(),
  };
  const port2 = {
    postMessage: (data: unknown) =>
      queueMicrotask(() => port1.onmessage?.({ data } as MessageEvent)),
  };
  return { port1, port2 } as unknown as MessageChannel;
}

type WorkerAnswer = 'ready' | 'decline' | 'silent' | 'ready-no-takeover' | 'ready-late';

interface FakeOptions {
  controlled?: boolean;
  waiting?: WorkerAnswer | null;
  registration?: 'none' | 'present' | 'throws';
  registerFails?: boolean;
  /** For 'ready-late': how long the READY answer takes to arrive. */
  lateMs?: number;
}

function fakeContainer(opts: FakeOptions = {}) {
  const listeners = new Set<() => void>();
  const queries: unknown[] = [];
  const sentToWorker: unknown[] = [];
  const fireControllerChange = () => {
    for (const l of [...listeners]) l();
  };
  const answer = opts.waiting;
  const waiting: LaunchWorker | null = answer
    ? {
        postMessage(message, transfer) {
          queries.push(message);
          const port = transfer[0] as unknown as MessagePort;
          if (answer === 'decline') port.postMessage({ type: 'SKIP_WAITING_ANSWER', ready: false });
          if (answer === 'ready' || answer === 'ready-no-takeover') {
            port.postMessage({ type: 'SKIP_WAITING_ANSWER', ready: true });
          }
          if (answer === 'ready-late') {
            setTimeout(
              () => port.postMessage({ type: 'SKIP_WAITING_ANSWER', ready: true }),
              opts.lateMs ?? 0,
            );
          }
        },
      }
    : null;
  // The worker activates only on GO (src/sw.ts); 'ready-no-takeover' never does.
  const goes = () => sentToWorker.filter(isSkipWaitingGo).length;
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
  const createChannel = () => {
    const ch = fakeChannel(sentToWorker);
    const realPost = (ch.port1 as unknown as { postMessage: (d: unknown) => void }).postMessage;
    (ch.port1 as unknown as { postMessage: (d: unknown) => void }).postMessage = (d: unknown) => {
      realPost(d);
      if (isSkipWaitingGo(d) && answer !== 'ready-no-takeover')
        queueMicrotask(fireControllerChange);
    };
    return ch;
  };
  return { container, queries, goes, listeners, fireControllerChange, createChannel };
}

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

function launch(
  fake: ReturnType<typeof fakeContainer> | undefined,
  extra: Partial<LaunchOptions> = {},
) {
  const render = vi.fn();
  const reload = vi.fn();
  const warn = vi.fn();
  const result = launchApp({
    container: fake?.container,
    render,
    reload,
    warn,
    createChannel: fake?.createChannel ?? (() => fakeChannel([])),
    attemptStore: memoryStore(),
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
    const fake = fakeContainer({ registration: 'none' });
    let afterLoadRun: (() => void) | undefined;
    const { result, render, reload } = launch(fake, {
      afterLoad: (run) => {
        afterLoadRun = run;
      },
    });
    await expect(result).resolves.toBe('started');
    expect(render).toHaveBeenCalledOnce();
    expect(fake.container.register).not.toHaveBeenCalled();
    afterLoadRun?.();
    expect(fake.container.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('a controlled launch with no waiting update starts normally', async () => {
    const fake = fakeContainer({ controlled: true, waiting: null });
    const { result, render, reload } = launch(fake);
    await expect(result).resolves.toBe('started');
    expect(fake.queries).toEqual([]);
    expect(render).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('a waiting update: QUERY, READY, GO, takeover, one reload, never a render', async () => {
    const fake = fakeContainer({ controlled: true, waiting: 'ready' });
    const { result, render, reload } = launch(fake);
    await expect(result).resolves.toBe('reloading');
    expect(fake.queries).toEqual([{ type: 'SKIP_WAITING_QUERY', sentAt: expect.any(Number) }]);
    expect(fake.goes()).toBe(1);
    expect(reload).toHaveBeenCalledOnce();
    expect(render).not.toHaveBeenCalled();
    expect(fake.container.register).not.toHaveBeenCalled();
    expect(fake.listeners.size).toBe(0);
  });

  it('keeps waiting when the worker declines (other app windows are open)', async () => {
    const fake = fakeContainer({ controlled: true, waiting: 'decline' });
    const { result, render, reload } = launch(fake);
    await expect(result).resolves.toBe('started');
    expect(fake.goes()).toBe(0);
    expect(render).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('renders without an answer in time, and never sends GO for a late one', async () => {
    vi.useFakeTimers();
    const fake = fakeContainer({
      controlled: true,
      waiting: 'ready-late',
      lateMs: SKIP_WAITING_ANSWER_MS + 50,
    });
    const { result, render, reload } = launch(fake);
    await vi.advanceTimersByTimeAsync(SKIP_WAITING_ANSWER_MS);
    await expect(result).resolves.toBe('started');
    expect(render).toHaveBeenCalledOnce();
    // The READY queued behind the timeout arrives now: no GO, so the worker never activates.
    await vi.advanceTimersByTimeAsync(100);
    expect(fake.goes()).toBe(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it('never renders the old build once committed, even if the takeover is slow', async () => {
    vi.useFakeTimers();
    const fake = fakeContainer({ controlled: true, waiting: 'ready-no-takeover' });
    const { result, render, reload } = launch(fake, { takeoverTimeoutMs: 15_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toBe('reloading');
    expect(render).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('after a committed attempt without a takeover, the next load renders instead of looping', async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    const fake = fakeContainer({ controlled: true, waiting: 'ready-no-takeover' });
    const first = launch(fake, { attemptStore: store, takeoverTimeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(first.result).resolves.toBe('reloading');
    const second = launch(fake, { attemptStore: store });
    await expect(second.result).resolves.toBe('started');
    expect(second.render).toHaveBeenCalledOnce();
    expect(fake.queries).toHaveLength(1); // the second load did not ask again
  });

  it('does not activate a waiting worker for an uncontrolled page', async () => {
    const fake = fakeContainer({ controlled: false, waiting: 'ready' });
    const { result, render, reload } = launch(fake);
    await expect(result).resolves.toBe('started');
    expect(fake.queries).toEqual([]);
    expect(render).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('an update that arrives mid-session never reloads the page', async () => {
    const fake = fakeContainer({ controlled: true, waiting: null });
    const { result, reload } = launch(fake);
    await expect(result).resolves.toBe('started');
    fake.fireControllerChange();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reports registration problems without failing the launch', async () => {
    const broken = fakeContainer({ registration: 'throws', registerFails: true });
    const { result, render, warn } = launch(broken);
    await expect(result).resolves.toBe('started');
    expect(render).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
  });
});

describe('the worker side of the handshake (src/sw.ts)', () => {
  const t = 1_000_000;
  it('is ready for a fresh query from the only window', () => {
    expect(answerSkipWaiting(skipWaitingQuery(t), t + 500, 1)).toEqual({
      type: 'SKIP_WAITING_ANSWER',
      ready: true,
    });
  });
  it('declines while other app windows are open', () => {
    expect(answerSkipWaiting(skipWaitingQuery(t), t + 500, 2).ready).toBe(false);
  });
  it('declines a stale or future-dated query', () => {
    expect(answerSkipWaiting(skipWaitingQuery(t), t + SKIP_WAITING_MAX_AGE_MS + 1, 1).ready).toBe(
      false,
    );
    expect(answerSkipWaiting(skipWaitingQuery(t + 10), t, 1).ready).toBe(false);
  });
});
