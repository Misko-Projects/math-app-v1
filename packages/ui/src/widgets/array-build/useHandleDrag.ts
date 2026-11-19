import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react';
import { DRAG_START_PX } from '../../tokens/tokens';

export interface HandleDragOptions {
  /** Dragging allowed now (not disabled, not in demo playback, not tap-only mode). */
  enabled: boolean;
  /** The pointer moved past the tap threshold: a drag began. */
  onStart: () => void;
  /** The finger is `dx`, `dy` px from where it went down. */
  onMove: (dx: number, dy: number) => void;
  /** The drag ended (released, cancelled, or switched off mid-drag). */
  onEnd: () => void;
}

interface Active {
  pointerId: number;
  x: number;
  y: number;
  dragging: boolean;
  cleanup: () => void;
}

/**
 * Pointer tracking for a resize handle (the array's corner, the split line). Unlike
 * `useDragToTarget`, which moves an item onto a separate target and glides it home on a miss, a
 * handle reshapes the array live: every move snaps to the grid through the state model, so the
 * child sees the rectangle grow under the finger, and there is nothing to miss. The tap and
 * keyboard alternatives live on the widget (tap a cell or a gap; arrow keys on the handle).
 *
 * One pointer only; a press that moves less than DRAG_START_PX is a tap. The click a browser fires
 * after a drag is reported by `consumeClick()` so it doesn't also count as a tap.
 */
export function useHandleDrag(options: HandleDragOptions) {
  const latest = useRef(options);
  latest.current = options;
  const active = useRef<Active | null>(null);
  const suppressed = useRef(false);

  const finish = useCallback(() => {
    const a = active.current;
    if (!a) return;
    active.current = null;
    a.cleanup();
    if (a.dragging) {
      suppressed.current = true;
      setTimeout(() => {
        suppressed.current = false;
      }, 0);
      latest.current.onEnd();
    }
  }, []);

  useEffect(() => {
    if (!options.enabled) finish();
  }, [options.enabled, finish]);
  useEffect(() => finish, [finish]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!latest.current.enabled || active.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.currentTarget;
      const pointerId = e.pointerId;
      const onMove = (ev: PointerEvent) => {
        const a = active.current;
        if (!a || ev.pointerId !== a.pointerId) return;
        const dx = ev.clientX - a.x;
        const dy = ev.clientY - a.y;
        if (!a.dragging) {
          if (Math.hypot(dx, dy) < DRAG_START_PX) return;
          a.dragging = true;
          latest.current.onStart();
        }
        ev.preventDefault();
        latest.current.onMove(dx, dy);
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId === active.current?.pointerId) finish();
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      try {
        el.setPointerCapture?.(pointerId);
      } catch {
        // Synthetic pointers (tests) have no capturable id; the window listeners still see them.
      }
      active.current = {
        pointerId,
        x: e.clientX,
        y: e.clientY,
        dragging: false,
        cleanup: () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          try {
            if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
          } catch {
            // Already released.
          }
        },
      };
    },
    [finish],
  );

  /** False for the click that ends a drag (it is not a tap). */
  const consumeClick = useCallback(() => !suppressed.current, []);

  return { onPointerDown, consumeClick };
}
