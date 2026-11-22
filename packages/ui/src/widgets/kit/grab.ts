import { type PointerEvent, useEffect, useState } from 'react';

/**
 * A small draggable thing with a larger hit area (a 26 px sprite inside its 64 px target): while
 * it is pressed it is drawn under the finger, wherever in the hit area the press began. A drag
 * then snaps from where the finger is (`useDragToTarget` snaps from the item's rendered centre),
 * so a drop never lands on a neighbour of the target under the finger.
 *
 * `start(id, event)` goes on the item's pointerdown, before the drag hook's own handler;
 * `offsetOf(id)` is added to the item's position while it is pressed. The offset belongs to the
 * pointer that began it: it ends when that pointer is lifted or cancelled (after the drag hook
 * has measured the drop: its listeners are older), and no other finger starts or ends it.
 */
export function useGrabUnderFinger() {
  const [grab, setGrab] = useState<{
    id: string;
    pointerId: number;
    dx: number;
    dy: number;
  } | null>(null);
  const pointerId = grab?.pointerId;
  useEffect(() => {
    if (pointerId === undefined) return;
    const clear = (e: globalThis.PointerEvent) => {
      if (e.pointerId === pointerId) setGrab(null);
    };
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
    };
  }, [pointerId]);
  return {
    start(id: string, e: PointerEvent<Element>) {
      const r = e.currentTarget.getBoundingClientRect();
      const next = {
        id,
        pointerId: e.pointerId,
        dx: e.clientX - (r.left + r.width / 2),
        dy: e.clientY - (r.top + r.height / 2),
      };
      // One press at a time: a second finger never takes over the first one's item (the same
      // pointer pressing again starts afresh).
      setGrab((held) => (held && held.pointerId !== e.pointerId ? held : next));
    },
    offsetOf(id: string): { dx: number; dy: number } {
      return grab?.id === id ? grab : { dx: 0, dy: 0 };
    },
  };
}
