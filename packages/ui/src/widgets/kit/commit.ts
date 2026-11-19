import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A demo op that changes state without animating (reduced motion) must not resolve before React
 * has committed that state (a demo `play` resolves after its commit). `waitForCommit()` schedules a
 * render together with the state updates made just before it (they batch) and resolves once that
 * render has committed; it resolves at once after the widget unmounts.
 */
export function useCommitWait(): () => Promise<void> {
  const [seq, setSeq] = useState(0);
  const waiters = useRef<(() => void)[]>([]);
  const alive = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `seq` is the commit being waited for
  useLayoutEffect(() => {
    const ready = waiters.current;
    waiters.current = [];
    for (const resolve of ready) resolve();
  }, [seq]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const ready = waiters.current;
      waiters.current = [];
      for (const resolve of ready) resolve();
    };
  }, []);
  return useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (!alive.current) {
          resolve();
          return;
        }
        waiters.current.push(resolve);
        setSeq((n) => n + 1);
      }),
    [],
  );
}
