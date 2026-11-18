/**
 * Demo and hop motion shared by the line widgets (U03): an element that just moved (React
 * re-rendered it somewhere else) flies there from where it was drawn before, along a gentle arc
 * (FLIP). Uses the Web Animations API on the CSS `translate` property, so it never fights a
 * widget's own `transform` positioning. Never put it on a `useDragToTarget` item itself (the hook
 * owns that element's `translate`); animate a wrapper instead.
 */

export interface FlyOptions {
  /** Duration in ms; 0 (reduced motion) skips the animation. */
  ms: number;
  /** Peak height of the arc above the straight path, in px (0 = a straight glide). */
  lift?: number;
}

const SAMPLES = 12;

/**
 * Animates `el` from the rect it had before the move (`from`) to where it is drawn now. Resolves
 * when the flight ends (at once when there is nothing to animate).
 */
export function flyFrom(el: Element, from: DOMRect | null, { ms, lift = 0 }: FlyOptions) {
  if (!from || ms <= 0 || typeof el.animate !== 'function') return Promise.resolve();
  const to = el.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return Promise.resolve();
  const frames: Keyframe[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const x = dx * (1 - t);
    const y = dy * (1 - t) - lift * 4 * t * (1 - t);
    frames.push({ translate: `${x.toFixed(2)}px ${y.toFixed(2)}px`, offset: t });
  }
  const animation = el.animate(frames, { duration: ms, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' });
  return animation.finished.then(
    () => undefined,
    () => undefined,
  );
}
