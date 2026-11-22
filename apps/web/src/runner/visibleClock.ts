// A stopwatch that runs only while the page is visible. Latency is the time a child spent on an
// item (04 §2.3) and feeds the session's math time (04 §7), so time with the tablet asleep or the
// app in the background is not part of it. The session counts active time the same way.

export interface VisibleClock {
  /** Visible milliseconds since the clock was made. */
  now(): number;
  dispose(): void;
}

export interface VisibleClockEnv {
  now(): number;
  visible(): boolean;
  /** Calls `onChange` when visibility may have flipped; returns the unsubscribe. */
  subscribe(onChange: () => void): () => void;
}

const pageEnv = (): VisibleClockEnv => ({
  now: () => performance.now(),
  visible: () => document.visibilityState === 'visible',
  subscribe: (onChange) => {
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('pagehide', onChange);
    window.addEventListener('pageshow', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('pagehide', onChange);
      window.removeEventListener('pageshow', onChange);
    };
  },
});

export function createVisibleClock(env: VisibleClockEnv = pageEnv()): VisibleClock {
  let banked = 0;
  let since: number | null = env.visible() ? env.now() : null;
  const sync = () => {
    const t = env.now();
    if (since !== null) banked += t - since;
    since = env.visible() ? t : null;
  };
  const unsubscribe = env.subscribe(sync);
  return {
    now: () => banked + (since === null ? 0 : env.now() - since),
    dispose: unsubscribe,
  };
}
