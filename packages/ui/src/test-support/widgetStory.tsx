// Helpers for widget stories (not exported from the package). Widget stories render through
// WidgetHost and the production registry, so the lazy lookup is exercised exactly as in the app.
import type { InteractionEvent, WidgetConfig } from '@number-island/shared';
import { expect, type fn, waitFor } from 'storybook/test';
import { HAND_POINTER_TIP } from '../primitives/icons';
import { INVITE_GLYPH_SELECTOR } from '../widgets/kit';
import type { WidgetHostProps } from '../widgets/WidgetHost';
import { WidgetHost } from '../widgets/WidgetHost';

/** The widget area of a workshop (06 §2: ≥ 60% of the screen), as a fixed story stage. */
export function renderWidget(args: WidgetHostProps) {
  return (
    <div className="story-widget-stage">
      <WidgetHost {...args} />
    </div>
  );
}

/** Waits for the registered widget's chunk to load and returns its root element. */
export async function findWidget(
  canvasElement: HTMLElement,
  selector: string,
): Promise<HTMLElement> {
  await waitFor(
    () => expect(canvasElement.querySelector(selector), `${selector} rendered`).not.toBeNull(),
    { timeout: 10_000 },
  );
  return canvasElement.querySelector(selector) as HTMLElement;
}

/** The interaction trace a story's `onInteract` spy received, in order. */
export function traceOf(onInteract: unknown): InteractionEvent[] {
  return (onInteract as ReturnType<typeof fn>).mock.calls.map(([e]) => e as InteractionEvent);
}

/** Every event's ms is non-decreasing (one widget instance, one clock). */
export async function expectTraceOrdered(trace: InteractionEvent[]) {
  for (let i = 1; i < trace.length; i++) {
    await expect((trace[i] as InteractionEvent).ms).toBeGreaterThanOrEqual(
      (trace[i - 1] as InteractionEvent).ms,
    );
  }
}

export type { WidgetConfig };
/**
 * Pip's pointer is ON its target, measured at rest (the hand's tap bob and the ring's pulse paused
 * at their start): the DRAWN fingertip (`HAND_POINTER_TIP` for the icon's direction) lies inside
 * the target's box, the hand box overlaps none of the target's glyphs (icon, numeral, digit or
 * word: `INVITE_GLYPH_SELECTOR`), and the hand, bob included, stays inside the widget.
 */
export async function expectPointerOn(hand: HTMLElement, target: HTMLElement, widget: HTMLElement) {
  const loops = widget
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
  for (const a of loops) {
    a.pause();
    a.currentTime = 0;
  }
  try {
    const svg = hand.querySelector('svg');
    const direction = svg?.dataset.direction === 'up' ? 'up' : 'down';
    const h = (svg ?? hand).getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const w = widget.getBoundingClientRect();
    const ratio = HAND_POINTER_TIP[direction];
    const tip = { x: h.left + h.width * ratio.x, y: h.top + h.height * ratio.y };
    await expect(tip.x, 'fingertip x inside the target').toBeGreaterThanOrEqual(t.left);
    await expect(tip.x, 'fingertip x inside the target').toBeLessThanOrEqual(t.right);
    await expect(tip.y, 'fingertip y inside the target').toBeGreaterThanOrEqual(t.top);
    await expect(tip.y, 'fingertip y inside the target').toBeLessThanOrEqual(t.bottom);
    for (const glyph of target.querySelectorAll(INVITE_GLYPH_SELECTOR)) {
      const g = glyph.getBoundingClientRect();
      const apart =
        h.right <= g.left || g.right <= h.left || h.bottom <= g.top || g.bottom <= h.top;
      const at = (r: DOMRect) =>
        [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 10) / 10).join(',');
      await expect(
        apart,
        `hand [${at(h)}] clear of the glyph ${glyph.className} [${at(g)}] in [${at(t)}]`,
      ).toBe(true);
    }
    // The bob moves the hand 6 px left and 8 px down.
    await expect(h.left - 6).toBeGreaterThanOrEqual(w.left);
    await expect(h.right).toBeLessThanOrEqual(w.right);
    await expect(h.bottom + 8).toBeLessThanOrEqual(w.bottom);
  } finally {
    for (const a of loops) a.play();
  }
}
