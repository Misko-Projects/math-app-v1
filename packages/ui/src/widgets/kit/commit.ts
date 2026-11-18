import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * A demo `play` must resolve only once React has committed its last state change (#85): with
 * reduced motion an op is a plain state change, and a caller reading the DOM right after `play`
 * would otherwise race the render. `committed()` bumps a sequence number in state (batched with the
 * op's other updates) and resolves when a commit carrying that number (or a later one) lands, or
 * when the widget unmounts. Every call changes state, so a commit always follows.
 */
export function useCommitBarrier(): () => Promise<void> {
  const [seq, setSeq] = useState(0);
  const asked = useRef(0);
  const waiters = useRef<{ n: number; resolve: () => void }[]>([]);
  useLayoutEffect(() => {
    waiters.current = waiters.current.filter((w) => {
      if (w.n > seq) return true;
      w.resolve();
      return false;
    });
  });
  useLayoutEffect(
    () => () => {
      for (const w of waiters.current) w.resolve();
      waiters.current = [];
    },
    [],
  );
  return useCallback(
    () =>
      new Promise<void>((resolve) => {
        asked.current += 1;
        const n = asked.current;
        waiters.current.push({ n, resolve });
        setSeq(n);
      }),
    [],
  );
}
