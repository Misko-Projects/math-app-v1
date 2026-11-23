// The long-idle signal (04 §6.4 rule 4: "2 idle periods > 45 s"). An idle period is a stretch
// with no touch while an item waits for an answer; it is reported once, when it passes the
// threshold, and the next one can only start after a touch.
//
// Time comes from the caller: `now` is the visible clock (a tablet asleep is not an idle child),
// and `schedule` is the timer, so tests drive both.

/** 04 §6.4 rule 4. */
export const LONG_IDLE_MS = 45_000;

export interface IdleWatchDeps {
  now(): number;
  /** Calls `fn` after about `ms`; returns the cancel. */
  schedule(fn: () => void, ms: number): () => void;
  onIdle(): void;
  thresholdMs?: number;
}

export interface IdleWatch {
  /** An item is waiting for an answer: start watching (a fresh period). */
  start(): void;
  /** The child did something. */
  touch(): void;
  /** No item is waiting (feedback, a hint playing, the request over). */
  stop(): void;
}

export function createIdleWatch(deps: IdleWatchDeps): IdleWatch {
  const threshold = deps.thresholdMs ?? LONG_IDLE_MS;
  let cancel: (() => void) | null = null;
  let since = 0;

  const clear = () => {
    cancel?.();
    cancel = null;
  };
  const arm = (ms: number) => {
    clear();
    cancel = deps.schedule(() => {
      cancel = null;
      // The timer runs on wall time and `now` only while the page is visible: wait out the rest.
      const idle = deps.now() - since;
      if (idle >= threshold) deps.onIdle();
      else arm(threshold - idle);
    }, ms);
  };
  const begin = () => {
    since = deps.now();
    arm(threshold);
  };
  let watching = false;
  return {
    start() {
      watching = true;
      begin();
    },
    touch() {
      if (watching) begin();
    },
    stop() {
      watching = false;
      clear();
    },
  };
}
