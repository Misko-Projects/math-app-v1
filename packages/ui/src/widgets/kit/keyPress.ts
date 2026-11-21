import { useCallback, useEffect, useRef } from 'react';

const ACTIVATES = (key: string) => key === 'Enter' || key === ' ';

/** The logic of `useOncePerKeyPress`, independent of React (unit-tested). */
export function createKeyPressGate() {
  /** Enter and Space, each on its own: down now, and already used for an action. */
  const held = new Set<string>();
  const used = new Set<string>();
  /** What the child did last: the key that went down (or repeated), or a pointer press. */
  let last: string | 'pointer' | null = null;
  /** The click being delivered right now, by what made it; null outside a click. */
  let activation: 'pointer' | 'key' | null = null;
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
      // A button answers Space when the key comes up: the click that follows is that
      // press's own, whatever key repeated meanwhile (Enter answers on its keydown).
      if (key === ' ') last = key;
    },
    /** A mouse button or a finger went down: what follows is that pointer's own action. */
    pointerDown() {
      last = 'pointer';
    },
    /**
     * A click is being delivered. A mouse or a finger makes a click with `detail` ≥ 1; a key
     * (Enter, Space) makes one with `detail` 0. The click itself says what activated the control:
     * the last input event does not, because a held Enter keeps repeating between a pointer's
     * press and its click.
     */
    clickStart(detail: number) {
      activation = detail >= 1 ? 'pointer' : 'key';
    },
    clickEnd() {
      activation = null;
    },
    /** Focus left the page: no keyup will come. */
    reset() {
      held.clear();
      used.clear();
      last = null;
      activation = null;
    },
    /**
     * May this action run? Always for a pointer press, also while a key is held. For a key: once
     * for each press of that key, until that same key is released.
     */
    take() {
      if (activation === 'pointer') return true;
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
 * leaves a trace event. `take()` answers whether the action may run: always for a pointer's click
 * (mouse or touch, also while a key is held down and repeating), and once for each press of Enter
 * or of Space until that same key is released.
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
    // The click's own `detail`, for the handlers that run while it is delivered (capture on the
    // document comes first, bubble on the window last; the timer covers a stopped propagation).
    let clear: ReturnType<typeof setTimeout> | undefined;
    const clickEnd = () => {
      clearTimeout(clear);
      g.clickEnd();
    };
    const clickStart = (e: MouseEvent) => {
      g.clickStart(e.detail);
      clearTimeout(clear);
      clear = setTimeout(clickEnd, 0);
    };
    const reset = () => g.reset();
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up, true);
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('click', clickStart, true);
    window.addEventListener('click', clickEnd);
    window.addEventListener('blur', reset);
    return () => {
      clickEnd();
      document.removeEventListener('click', clickStart, true);
      window.removeEventListener('click', clickEnd);
      document.removeEventListener('keydown', down, true);
      document.removeEventListener('keyup', up, true);
      document.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return useCallback(() => gate.current?.take() ?? true, []);
}
