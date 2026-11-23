// "First problem within 10 s" (05 §2; #22): the time from the tap on a request to its first task
// on screen. The clock is `performance.now` unless one is injected, so a test measures it on a
// clock it controls.

/** The budget (05 §2). */
export const FIRST_PROBLEM_BUDGET_MS = 10_000;

export interface FirstProblemTimer {
  /** The child tapped a request. */
  tapped(): void;
  /** The request's first task is on screen. Counts once per tap. */
  shown(): void;
  /** The last tap-to-first-task time, or null before one was measured. */
  lastMs(): number | null;
}

export function createFirstProblemTimer(now: () => number): FirstProblemTimer {
  let tappedAt: number | null = null;
  let last: number | null = null;
  return {
    tapped() {
      tappedAt = now();
    },
    shown() {
      if (tappedAt === null) return;
      const start = tappedAt;
      tappedAt = null;
      last = now() - start;
    },
    lastMs: () => last,
  };
}

/** The app's timer. */
export const firstProblem = createFirstProblemTimer(() => performance.now());
