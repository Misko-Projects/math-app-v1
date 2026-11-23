// The clock of the island's short timed steps (the construction step, the counting walk along
// the road): real timers in the app, a clock the test moves in tests, so nothing asserts elapsed
// real time.

export interface BuildClock {
  /** Calls `fn` once after `ms`; the returned function cancels it. */
  after(ms: number, fn: () => void): () => void;
}

const real: BuildClock = {
  after(ms, fn) {
    const handle = window.setTimeout(fn, ms);
    return () => window.clearTimeout(handle);
  },
};

/** The clock in use: tests replace `current`. */
export const buildClock: { current: BuildClock } = { current: real };

/** The construction step's length (05 §6: at most 6 s, skippable). */
export const CONSTRUCTION_MS = 4000;
/** The time each stone of the counting walk is the counted one. */
export const COUNT_STEP_MS = 900;

/** A clock that only moves when told to, for tests. */
export function manualClock(): BuildClock & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let timers: { at: number; fn: () => void }[] = [];
  return {
    after(ms, fn) {
      const timer = { at: now + ms, fn };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        timers = timers.filter((t) => t !== next);
        now = next.at;
        next.fn();
      }
      now = until;
    },
    pending: () => timers.length,
  };
}
