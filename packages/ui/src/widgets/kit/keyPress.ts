import { useCallback, useEffect, useRef } from 'react';

const ACTIVATES = (key: string) => key === 'Enter' || key === ' ';

/** The logic of `useOncePerKeyPress`, independent of React (unit-tested). */
export function createKeyPressGate() {
  let held = false;
  let used = false;
  return {
    keyDown(key: string) {
      if (ACTIVATES(key)) held = true;
    },
    keyUp(key: string) {
      if (!ACTIVATES(key)) return;
      held = false;
      used = false;
    },
    /** Focus left the page: no keyup will come. */
    reset() {
      held = false;
      used = false;
    },
    /** May this action run? Yes with no key down, and once per press while one is held. */
    take() {
      if (!held) return true;
      if (used) return false;
      used = true;
      return true;
    },
  };
}

/**
 * One action per key press, for controls that hand the focus to each other (a build step's Next
 * and the answer step's Back): a held Enter repeats its keydown, and each repeat activates the
 * button that has the focus by then, so without this the steps flip back and forth and every flip
 * leaves a trace event. `take()` answers whether the action may run: always with no key down
 * (pointer and touch), and once for each Enter or Space press until that key is released.
 */
export function useOncePerKeyPress(): () => boolean {
  const gate = useRef<ReturnType<typeof createKeyPressGate> | null>(null);
  if (gate.current === null) gate.current = createKeyPressGate();
  useEffect(() => {
    const g = gate.current;
    if (!g) return;
    const down = (e: KeyboardEvent) => g.keyDown(e.key);
    const up = (e: KeyboardEvent) => g.keyUp(e.key);
    const reset = () => g.reset();
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up, true);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('keydown', down, true);
      document.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return useCallback(() => gate.current?.take() ?? true, []);
}
