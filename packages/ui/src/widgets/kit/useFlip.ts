import { type RefObject, useCallback, useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from '../../preferences/UiProvider';

/**
 * FLIP glide for items that move between containers (a card into a bin, a piece onto an
 * outline): call `capture()` just before the state change; after React renders, every element
 * marked `data-flip="<id>"` inside `root` that moved glides from where it was (an independent
 * `transform` animation, so it composes with the drag hook's `translate`). Instant with reduced
 * motion (06 §7). Drag drops don't capture: the item is already where the finger left it.
 */
export function useFlip(root: RefObject<HTMLElement | null>, ms = 380) {
  const reduced = useReducedMotion();
  const before = useRef<Map<string, DOMRect> | null>(null);

  const capture = useCallback(() => {
    const el = root.current;
    if (!el || reduced) return;
    const map = new Map<string, DOMRect>();
    for (const item of el.querySelectorAll<HTMLElement>('[data-flip]')) {
      map.set(item.dataset.flip as string, item.getBoundingClientRect());
    }
    before.current = map;
  }, [root, reduced]);

  useLayoutEffect(() => {
    const map = before.current;
    const el = root.current;
    before.current = null;
    if (!map || !el) return;
    for (const item of el.querySelectorAll<HTMLElement>('[data-flip]')) {
      const old = map.get(item.dataset.flip as string);
      if (!old) continue;
      const now = item.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const sx = now.width > 0 ? old.width / now.width : 1;
      item.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx})`, transformOrigin: '0 0' },
          { transform: 'none', transformOrigin: '0 0' },
        ],
        { duration: ms, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
  });

  return capture;
}
