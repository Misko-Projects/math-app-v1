import { useCallback, useLayoutEffect, useMemo, useState } from 'react';

/**
 * A demo `play` must resolve only once React has committed its last state change (#85): with
 * reduced motion an op is a plain state change, and a caller reading the DOM right after `play`
 * would otherwise race the render. `committed()` bumps a sequence number in state (batched with the
 * op's other updates) and resolves when a commit carrying that number (or a later one) lands, or
 * when the widget unmounts. After unmount it resolves at once and sets no state.
 */
export interface CommitBarrier {
  /** A promise for the next commit; resolved at once (no state change) once unmounted. */
  request(): Promise<void>;
  /** A commit carrying sequence number `seq` landed. */
  committed(seq: number): void;
  mount(): void;
  /** Resolves every waiter; later requests resolve at once. */
  unmount(): void;
}

/** The barrier's logic, independent of React (`bump` stores the sequence number in state). */
export function createCommitBarrier(bump: (seq: number) => void): CommitBarrier {
  let asked = 0;
  let alive = true;
  let waiters: { n: number; resolve: () => void }[] = [];
  return {
    request() {
      if (!alive) return Promise.resolve();
      asked += 1;
      const n = asked;
      const p = new Promise<void>((resolve) => waiters.push({ n, resolve }));
      bump(n);
      return p;
    },
    committed(seq) {
      waiters = waiters.filter((w) => {
        if (w.n > seq) return true;
        w.resolve();
        return false;
      });
    },
    mount() {
      alive = true;
    },
    unmount() {
      alive = false;
      for (const w of waiters) w.resolve();
      waiters = [];
    },
  };
}

export function useCommitBarrier(): () => Promise<void> {
  const [seq, setSeq] = useState(0);
  const barrier = useMemo(() => createCommitBarrier(setSeq), []);
  useLayoutEffect(() => {
    barrier.committed(seq);
  });
  useLayoutEffect(() => {
    barrier.mount();
    return () => barrier.unmount();
  }, [barrier]);
  return useCallback(() => barrier.request(), [barrier]);
}
