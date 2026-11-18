import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useUiPreferences } from '../preferences/UiProvider';
import { DRAG_START_PX } from '../tokens/tokens';
import { findSnapTarget, rectCenter, type SnapCandidate } from './snap';
import {
  isElementDisabled,
  type PlaceItemOptions,
  type PlaceItemProps,
  type TapToPlace,
  type TapToPlaceOptions,
  usePlacementCore,
} from './useTapToPlace';

export interface DragToTargetOptions<I extends string, T extends string>
  extends TapToPlaceOptions<I, T> {
  /** Snap distance in CSS px. Defaults to the child's setting (06 §7, default 48). */
  snapRadiusPx?: number;
  /** Disable dragging; tap-to-place and keyboard still work. Defaults to the child's setting. */
  tapOnly?: boolean;
  /** A drag ended away from every target; the item glides back (no sound penalty, 06 §4). */
  onMiss?: (item: I) => void;
}

/** Item props plus the pointer handlers that make it draggable. */
export interface DragItemProps extends PlaceItemProps {
  className: string;
  'data-tap-only'?: 'true';
  onPointerDown: (e: ReactPointerEvent) => void;
}

export interface DragToTarget<I extends string, T extends string>
  extends Omit<TapToPlace<I, T>, 'itemProps'> {
  itemProps: (id: I, opts: PlaceItemOptions) => DragItemProps;
}

interface ActiveDrag<I extends string> {
  id: I;
  el: HTMLElement | SVGElement;
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  /** The drag offset the item already had at pointerdown (non-zero only mid-glide home). */
  base: { x: number; y: number };
  dragging: boolean;
  /** The item's rendered centre when the drag started; it then moves by exactly (dx, dy). */
  startCenter: { x: number; y: number } | null;
  over: string | null;
  cleanup: () => void;
}

/*
 * How the item moves. The hook never writes the item's inline `transform` or `transition`, which
 * belong to the widget (a tilt, its own animation). It sets only two custom properties that
 * .ni-draggable maps to the independent CSS `translate` property, and two data attributes:
 * - `data-held`: pressed; the translate transition is off so the item stays exactly under the
 *   finger (a glide home in progress stops where it is);
 * - `data-dragging`: dragging (lifted look).
 * Clearing the offset without `data-held` lets the CSS transition glide the item home.
 */
const OFFSET_X = '--ni-drag-x';
const OFFSET_Y = '--ni-drag-y';

function setOffset(el: HTMLElement | SVGElement, x: number, y: number) {
  if (x === 0 && y === 0) {
    el.style.removeProperty(OFFSET_X);
    el.style.removeProperty(OFFSET_Y);
  } else {
    el.style.setProperty(OFFSET_X, `${x}px`);
    el.style.setProperty(OFFSET_Y, `${y}px`);
  }
}

/** The drag offset as currently rendered: mid-glide, the animated value; otherwise 0, 0. */
function renderedOffset(el: HTMLElement | SVGElement): { x: number; y: number } {
  const value = getComputedStyle(el).translate;
  if (!value || value === 'none') return { x: 0, y: 0 };
  const [x = '0', y = '0'] = value.trim().split(/\s+/);
  return { x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 };
}

/**
 * Drag an item onto a target, with tap-to-place and keyboard as equal alternatives (06 §4).
 *
 * - **Drag** (mouse, touch or pen; one pointer, no multi-finger gestures): the item follows the
 *   pointer; the target it would snap to lights up (`data-over`). On release it snaps to the nearest
 *   target within the snap radius of the item's centre, or glides back to where it started.
 * - **Tap-to-place** and **keyboard**: as useTapToPlace. A press that moves less than 8 px is a tap.
 * - **Tap-only mode** (06 §7): no dragging at all.
 *
 * The hook keeps no item positions: on `onPlace` the widget moves the item in its own state (and
 * through the format's state model).
 */
export function useDragToTarget<I extends string, T extends string>(
  options: DragToTargetOptions<I, T>,
): DragToTarget<I, T> {
  const prefs = useUiPreferences();
  const snapRadius = options.snapRadiusPx ?? prefs.snapRadiusPx;
  const tapOnly = options.tapOnly ?? prefs.tapOnly;
  const core = usePlacementCore(options);
  const active = useRef<ActiveDrag<I> | null>(null);
  const settings = useRef({ snapRadius, tapOnly, onMiss: options.onMiss });
  settings.current = { snapRadius, tapOnly, onMiss: options.onMiss };

  const candidates = useCallback(
    (item: I): SnapCandidate<T>[] =>
      [...core.targets].map(([id, el]) => ({
        id,
        rect: el.getBoundingClientRect(),
        enabled: el.isConnected && core.isTargetOpen(item, id),
      })),
    [core],
  );

  const markOver = useCallback(
    (drag: ActiveDrag<I>, target: string | null) => {
      if (drag.over === target) return;
      if (drag.over !== null) core.targets.get(drag.over as T)?.removeAttribute('data-over');
      if (target !== null) core.targets.get(target as T)?.setAttribute('data-over', 'true');
      drag.over = target;
    },
    [core.targets],
  );

  const snapTargetFor = useCallback(
    (drag: ActiveDrag<I>): T | null => {
      if (!drag.startCenter) return null;
      const center = { x: drag.startCenter.x + drag.dx, y: drag.startCenter.y + drag.dy };
      return findSnapTarget(center, candidates(drag.id), settings.current.snapRadius);
    },
    [candidates],
  );

  const finish = useCallback(
    (commit: boolean) => {
      const drag = active.current;
      if (!drag) return;
      active.current = null;
      drag.cleanup();
      if (!drag.dragging) {
        // A tap or cancelled press: release the hold. An item stopped mid-glide glides on home.
        drag.el.removeAttribute('data-held');
        setOffset(drag.el, 0, 0);
        return;
      }
      core.suppressNextClick();
      // Commit only if the source is still there and enabled and dragging is still allowed: it may
      // have been removed, disabled, or tap-only mode switched on mid-drag.
      const sourceOk =
        core.items.get(drag.id) === drag.el &&
        core.isItemAvailable(drag.id) &&
        !settings.current.tapOnly &&
        !core.latest.current.disabled;
      const target = commit && sourceOk ? snapTargetFor(drag) : null;
      markOver(drag, null);
      const trace = core.latest.current.trace;
      if (target !== null) {
        trace?.('drop', target);
        // The widget re-renders the item at its new home: drop the offset while still held (no
        // glide), let that style apply, then release.
        setOffset(drag.el, 0, 0);
        void getComputedStyle(drag.el).translate;
        drag.el.removeAttribute('data-dragging');
        drag.el.removeAttribute('data-held');
        core.place(drag.id, target, 'drag');
      } else {
        trace?.('drop', 'none');
        // Mis-drop: release and glide home gently (instant with reduced motion).
        drag.el.removeAttribute('data-dragging');
        drag.el.removeAttribute('data-held');
        setOffset(drag.el, 0, 0);
        settings.current.onMiss?.(drag.id);
      }
    },
    [core, markOver, snapTargetFor],
  );

  // Abandon a drag in flight if the widget unmounts or interaction is switched off.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (options.disabled || tapOnly) finishRef.current(false);
  }, [options.disabled, tapOnly]);
  // The dragged item itself can unmount (it moved or the item changed): cancel after that commit.
  useEffect(() => {
    const drag = active.current;
    if (drag && (core.items.get(drag.id) !== drag.el || !core.isItemAvailable(drag.id))) {
      finishRef.current(false);
    }
  });
  useEffect(() => () => finishRef.current(false), []);

  const onPointerDown = useCallback(
    (id: I, e: ReactPointerEvent) => {
      const o = core.latest.current;
      if (o.disabled || settings.current.tapOnly || active.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = core.items.get(id);
      if (!el || isElementDisabled(el)) return;

      // Hold the item where it is drawn now: if it is still gliding home from a mis-drop, it stops
      // under the finger instead of sliding away from it.
      const base = renderedOffset(el);
      el.setAttribute('data-held', 'true');
      setOffset(el, base.x, base.y);

      const pointerId = e.pointerId;
      const onMove = (ev: PointerEvent) => {
        const drag = active.current;
        if (!drag || ev.pointerId !== drag.pointerId) return;
        drag.dx = ev.clientX - drag.startX;
        drag.dy = ev.clientY - drag.startY;
        if (!drag.dragging) {
          if (Math.hypot(drag.dx, drag.dy) < DRAG_START_PX) return;
          drag.dragging = true;
          drag.el.setAttribute('data-dragging', 'true');
          // Where the item is drawn now (offset still `base`), whatever layout or widget transform
          // got it there. Its offset becomes base + delta, so its centre is this plus the delta,
          // and snapping matches what the child sees.
          drag.startCenter = rectCenter(drag.el.getBoundingClientRect());
          core.select(null);
          core.latest.current.trace?.('drag', drag.id);
        }
        ev.preventDefault();
        setOffset(drag.el, drag.base.x + drag.dx, drag.base.y + drag.dy);
        markOver(drag, snapTargetFor(drag));
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId === active.current?.pointerId) finish(true);
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === active.current?.pointerId) finish(false);
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      try {
        // Keeps touch moves flowing to us even when the finger leaves the item.
        el.setPointerCapture?.(pointerId);
      } catch {
        // Synthetic pointers (tests) have no capturable id; the window listeners still see them.
      }
      active.current = {
        id,
        el,
        pointerId,
        startX: e.clientX,
        startY: e.clientY,
        dx: 0,
        dy: 0,
        base,
        dragging: false,
        startCenter: null,
        over: null,
        cleanup: () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onCancel);
          try {
            if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
          } catch {
            // Already released.
          }
        },
      };
    },
    [core, finish, markOver, snapTargetFor],
  );

  const itemProps = useCallback(
    (id: I, opts: PlaceItemOptions): DragItemProps => ({
      ...core.itemProps(id, opts),
      className: 'ni-draggable',
      'data-tap-only': tapOnly ? 'true' : undefined,
      onPointerDown: (e) => onPointerDown(id, e),
    }),
    [core, onPointerDown, tapOnly],
  );

  return useMemo(
    () => ({
      selected: core.selected,
      select: core.select,
      itemProps,
      targetProps: core.targetProps,
    }),
    [core.selected, core.select, core.targetProps, itemProps],
  );
}
