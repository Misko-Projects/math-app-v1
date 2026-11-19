import { type PointerEvent, useEffect, useState } from 'react';

/**
 * A small draggable thing with a larger hit area (a 26 px sprite inside its 64 px target): while
 * it is pressed it is drawn under the finger, wherever in the hit area the press began. A drag
 * then snaps from where the finger is (`useDragToTarget` snaps from the item's rendered centre),
 * so a drop never lands on a neighbour of the target under the finger.
 *
 * `start(id, event)` goes on the item's pointerdown, before the drag hook's own handler;
 * `offsetOf(id)` is added to the item's position while it is pressed. The offset ends with the
 * press (after the drag hook has measured the drop: its listeners are older).
 */
export function useGrabUnderFinger() {
  const [grab, setGrab] = useState<{ id: string; dx: number; dy: number } | null>(null);
  useEffect(() => {
    if (!grab) return;
    const clear = () => setGrab(null);
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
    };
  }, [grab]);
  return {
    start(id: string, e: PointerEvent<Element>) {
      const r = e.currentTarget.getBoundingClientRect();
      setGrab({
        id,
        dx: e.clientX - (r.left + r.width / 2),
        dy: e.clientY - (r.top + r.height / 2),
      });
    },
    offsetOf(id: string): { dx: number; dy: number } {
      return grab?.id === id ? grab : { dx: 0, dy: 0 };
    },
  };
}
