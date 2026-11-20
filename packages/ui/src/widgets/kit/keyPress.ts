import { useCallback, useEffect, useRef } from 'react';

const ACTIVATES = (key: string) => key === 'Enter' || key === ' ';

/** The logic of `useOncePerKeyPress`, independent of React (unit-tested). */
export function createKeyPressGate() {
  /** Enter and Space, each on its own: down now, and already used for an action. */
  const held = new Set<string>();
  const used = new Set<string>();
  /** What the child did last: the key that went down (or repeated), or a pointer press. */
  let last: string | 'pointer' | null = null;
  return {
    keyDown(key: string) {
      if (!ACTIVATES(key)) return;
      held.add(key);
      last = key;
    },
    keyUp(key: string) {
      if (!ACTIVATES(key)) return;
      held.delete(key);
      used.delete(key);
    },
    /** A mouse button or a finger went down: what follows is that pointer's own action. */
    pointerDown() {
      last = 'pointer';
    },
    /** Focus left the page: no keyup will come. */
    reset() {
      held.clear();
      used.clear();
      last = null;
    },
    /**
     * May this action run? Always for a pointer press, also while a key is held. For a key: once
     * for each press of that key, until that same key is released.
     */
    take() {
      if (last === null || last === 'pointer' || !held.has(last)) return true;
      if (used.has(last)) return false;
      used.add(last);
      return true;
    },
  };
}

/**
 * One action per key press, for controls that hand the focus to each other (a build step's Next
 * and the answer step's Back): a held Enter repeats its keydown, and each repeat activates the
 * button that has the focus by then, so without this the steps flip back and forth and every flip
 * leaves a trace event. `take()` answers whether the action may run: always for a pointer press
 * (mouse or touch, also while a key is held down), and once for each press of Enter or of Space
 * until that same key is released.
 */
export function useOncePerKeyPress(): () => boolean {
  const gate = useRef<ReturnType<typeof createKeyPressGate> | null>(null);
  if (gate.current === null) gate.current = createKeyPressGate();
  useEffect(() => {
    const g = gate.current;
    if (!g) return;
    const down = (e: KeyboardEvent) => g.keyDown(e.key);
    const up = (e: KeyboardEvent) => g.keyUp(e.key);
    const pointer = () => g.pointerDown();
    const reset = () => g.reset();
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up, true);
    document.addEventListener('pointerdown', pointer, true);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('keydown', down, true);
      document.removeEventListener('keyup', up, true);
      document.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return useCallback(() => gate.current?.take() ?? true, []);
}
