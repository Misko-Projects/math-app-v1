import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TraceRecorder } from './trace';

/** How a placement happened. */
export type PlaceVia = 'drag' | 'tap' | 'keyboard';

export interface PlaceEvent<I extends string, T extends string> {
  item: I;
  target: T;
  via: PlaceVia;
}

export interface TapToPlaceOptions<I extends string, T extends string> {
  /** An item was placed on a target. The widget updates its state (the hook keeps none). */
  onPlace: (e: PlaceEvent<I, T>) => void;
  /** Whether `item` may go on `target` now (a full container, a used slot…). Default: yes. */
  canPlace?: (item: I, target: T) => boolean;
  /** Called when the selection changes (to speak the item's name, 06 §5). */
  onSelect?: (item: I | null) => void;
  /** No interaction at all (demo playback, feedback showing). */
  disabled?: boolean;
  /** Interaction trace recorder (useInteractionTrace). */
  trace?: TraceRecorder;
}

export interface PlaceItemOptions {
  /** Accessible name, e.g. "Pebble 3". */
  label: string;
  disabled?: boolean;
}

export interface PlaceTargetOptions {
  /** Accessible name, e.g. "Basket". */
  label: string;
  disabled?: boolean;
}

/** Props to spread on an item element (any element; it gets role="button"). */
export interface PlaceItemProps {
  ref: (el: HTMLElement | SVGElement | null) => void;
  role: 'button';
  tabIndex: 0 | -1;
  'aria-label': string;
  'aria-pressed': boolean;
  'aria-disabled'?: true;
  'data-place-item': string;
  'data-selected'?: 'true';
  onClick: (e: MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onKeyUp: (e: KeyboardEvent) => void;
}

/** Props to spread on a target element. */
export interface PlaceTargetProps {
  ref: (el: HTMLElement | SVGElement | null) => void;
  role: 'button';
  tabIndex: 0 | -1;
  'aria-label': string;
  'aria-disabled'?: true;
  'data-place-target': string;
  'data-target-disabled'?: 'true';
  'data-armed'?: 'true';
  className: string;
  onClick: (e: MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onKeyUp: (e: KeyboardEvent) => void;
}

export interface TapToPlace<I extends string, T extends string> {
  /** The item waiting to be placed, if any. */
  selected: I | null;
  select: (item: I | null) => void;
  itemProps: (id: I, opts: PlaceItemOptions) => PlaceItemProps;
  targetProps: (id: T, opts: PlaceTargetOptions) => PlaceTargetProps;
}

/** @internal State shared with useDragToTarget. */
export interface PlacementCore<I extends string, T extends string> extends TapToPlace<I, T> {
  items: Map<I, HTMLElement | SVGElement>;
  targets: Map<T, HTMLElement | SVGElement>;
  isTargetOpen: (item: I, target: T) => boolean;
  place: (item: I, target: T, via: PlaceVia) => void;
  /** Ignore the click that a browser fires after a drag ends. */
  suppressNextClick: () => void;
  latest: { current: TapToPlaceOptions<I, T> };
}

const ACTIVATE = new Set(['Enter', ' ']);
const NEXT = new Set(['ArrowRight', 'ArrowDown']);
const PREV = new Set(['ArrowLeft', 'ArrowUp']);

function focusSibling<K>(
  map: Map<K, HTMLElement | SVGElement>,
  current: K,
  step: 1 | -1 | 'first' | 'last',
) {
  // Document order, not registration order: items re-mount as they move between containers.
  const els = [...map.values()]
    .filter((el) => el.isConnected)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  if (els.length === 0) return;
  const at = els.indexOf(map.get(current) as HTMLElement | SVGElement);
  let next: number;
  if (step === 'first') next = 0;
  else if (step === 'last') next = els.length - 1;
  else next = (at + step + els.length) % els.length;
  els[next]?.focus();
}

/** @internal */
export function usePlacementCore<I extends string, T extends string>(
  options: TapToPlaceOptions<I, T>,
): PlacementCore<I, T> {
  const latest = useRef(options);
  latest.current = options;
  const [selected, setSelected] = useState<I | null>(null);
  const selectedRef = useRef<I | null>(null);
  selectedRef.current = selected;
  const items = useRef(new Map<I, HTMLElement | SVGElement>()).current;
  const targets = useRef(new Map<T, HTMLElement | SVGElement>()).current;
  const keyActivated = useRef(false);
  const clickSuppressed = useRef(false);
  const refCallbacks = useRef(
    new Map<string, (el: HTMLElement | SVGElement | null) => void>(),
  ).current;

  const select = useCallback((item: I | null) => {
    if (selectedRef.current === item) return;
    selectedRef.current = item;
    setSelected(item);
    latest.current.onSelect?.(item);
  }, []);

  // Deselect when interaction is switched off (demo playback) so no stale selection remains.
  useEffect(() => {
    if (options.disabled) select(null);
  }, [options.disabled, select]);

  const isTargetOpen = useCallback(
    (item: I, target: T) => {
      if (targets.get(target)?.getAttribute('data-target-disabled') === 'true') return false;
      return latest.current.canPlace ? latest.current.canPlace(item, target) : true;
    },
    [targets],
  );

  const place = useCallback(
    (item: I, target: T, via: PlaceVia) => {
      select(null);
      latest.current.onPlace({ item, target, via });
    },
    [select],
  );

  const suppressNextClick = useCallback(() => {
    clickSuppressed.current = true;
    setTimeout(() => {
      clickSuppressed.current = false;
    }, 0);
  }, []);

  /** A click that a key press already handled, or the click after a drag, does nothing. */
  const consumeClick = useCallback(() => {
    if (keyActivated.current || clickSuppressed.current) {
      return false;
    }
    return true;
  }, []);

  const releaseKey = useCallback(() => {
    setTimeout(() => {
      keyActivated.current = false;
    }, 0);
  }, []);

  const stableRef = useCallback(
    <K extends string>(kind: 'i' | 't', map: Map<K, HTMLElement | SVGElement>, id: K) => {
      const key = `${kind}:${id}`;
      let cb = refCallbacks.get(key);
      if (!cb) {
        cb = (el) => {
          if (el) map.set(id, el);
          else map.delete(id);
        };
        refCallbacks.set(key, cb);
      }
      return cb;
    },
    [refCallbacks],
  );

  const activateItem = useCallback(
    (id: I, via: 'tap' | 'keyboard') => {
      const o = latest.current;
      if (o.disabled) return;
      if (items.get(id)?.getAttribute('aria-disabled') === 'true') return;
      o.trace?.('tap', id);
      if (selectedRef.current === id) {
        select(null);
        return;
      }
      select(id);
      if (via === 'keyboard') {
        // Keyboard play: jump to the first target that can take this item.
        for (const [tid, el] of targets) {
          if (el.isConnected && isTargetOpen(id, tid)) {
            el.focus();
            break;
          }
        }
      }
    },
    [isTargetOpen, items, select, targets],
  );

  const activateTarget = useCallback(
    (id: T, via: 'tap' | 'keyboard') => {
      const o = latest.current;
      const item = selectedRef.current;
      if (o.disabled || item === null) return;
      if (!isTargetOpen(item, id)) return;
      o.trace?.('tap', id);
      place(item, id, via);
    },
    [isTargetOpen, place],
  );

  const itemProps = useCallback(
    (id: I, opts: PlaceItemOptions): PlaceItemProps => {
      const off = Boolean(options.disabled || opts.disabled);
      const isSelected = selected === id;
      return {
        ref: stableRef('i', items, id),
        role: 'button',
        tabIndex: off ? -1 : 0,
        'aria-label': opts.label,
        'aria-pressed': isSelected,
        'aria-disabled': off ? true : undefined,
        'data-place-item': id,
        'data-selected': isSelected ? 'true' : undefined,
        onClick: () => {
          if (!consumeClick()) return;
          activateItem(id, 'tap');
        },
        onKeyDown: (e) => {
          if (ACTIVATE.has(e.key)) {
            e.preventDefault();
            if (e.repeat) return;
            keyActivated.current = true;
            activateItem(id, 'keyboard');
          } else if (NEXT.has(e.key)) {
            e.preventDefault();
            focusSibling(items, id, 1);
          } else if (PREV.has(e.key)) {
            e.preventDefault();
            focusSibling(items, id, -1);
          } else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            focusSibling(items, id, e.key === 'Home' ? 'first' : 'last');
          } else if (e.key === 'Escape' && selectedRef.current !== null) {
            e.preventDefault();
            select(null);
          }
        },
        onKeyUp: releaseKey,
      };
    },
    [activateItem, consumeClick, items, options.disabled, releaseKey, select, selected, stableRef],
  );

  const targetProps = useCallback(
    (id: T, opts: PlaceTargetOptions): PlaceTargetProps => {
      const off = Boolean(options.disabled || opts.disabled);
      const armed =
        !off && selected !== null && (options.canPlace ? options.canPlace(selected, id) : true);
      return {
        ref: stableRef('t', targets, id),
        role: 'button',
        tabIndex: off ? -1 : 0,
        'aria-label': opts.label,
        'aria-disabled': armed ? undefined : true,
        'data-place-target': id,
        'data-target-disabled': opts.disabled ? 'true' : undefined,
        'data-armed': armed ? 'true' : undefined,
        className: 'ni-drop-target',
        onClick: () => {
          if (!consumeClick()) return;
          activateTarget(id, 'tap');
        },
        onKeyDown: (e) => {
          if (ACTIVATE.has(e.key)) {
            e.preventDefault();
            if (e.repeat) return;
            keyActivated.current = true;
            activateTarget(id, 'keyboard');
          } else if (NEXT.has(e.key)) {
            e.preventDefault();
            focusSibling(targets, id, 1);
          } else if (PREV.has(e.key)) {
            e.preventDefault();
            focusSibling(targets, id, -1);
          } else if (e.key === 'Escape') {
            const item = selectedRef.current;
            if (item !== null) {
              e.preventDefault();
              select(null);
              items.get(item)?.focus();
            }
          }
        },
        onKeyUp: releaseKey,
      };
    },
    [
      activateTarget,
      consumeClick,
      items,
      options.canPlace,
      options.disabled,
      releaseKey,
      select,
      selected,
      stableRef,
      targets,
    ],
  );

  return useMemo(
    () => ({
      selected,
      select,
      itemProps,
      targetProps,
      items,
      targets,
      isTargetOpen,
      place,
      suppressNextClick,
      latest,
    }),
    [
      selected,
      select,
      itemProps,
      targetProps,
      items,
      targets,
      isTargetOpen,
      place,
      suppressNextClick,
    ],
  );
}

/**
 * Tap-to-select → tap-to-place (06 §4): tap an item to pick it up (it lifts with a sunshine ring),
 * then tap a target to put it there. Tapping the item again puts it back down.
 *
 * Keyboard (06 §7): items and targets are focusable buttons. Enter or Space picks an item up and
 * moves focus to the first target that can take it; Enter or Space on a target places it; arrow
 * keys move between items or between targets; Escape cancels.
 */
export function useTapToPlace<I extends string, T extends string>(
  options: TapToPlaceOptions<I, T>,
): TapToPlace<I, T> {
  const core = usePlacementCore(options);
  return useMemo(
    () => ({
      selected: core.selected,
      select: core.select,
      itemProps: core.itemProps,
      targetProps: core.targetProps,
    }),
    [core.selected, core.select, core.itemProps, core.targetProps],
  );
}
