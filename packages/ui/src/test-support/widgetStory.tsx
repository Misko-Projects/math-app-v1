// Helpers for widget stories (not exported from the package). Widget stories render through
// WidgetHost and the production registry, so the lazy lookup is exercised exactly as in the app.
import type { InteractionEvent, WidgetConfig } from '@number-island/shared';
import { expect, type fn, waitFor } from 'storybook/test';
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
 * Pip's pointer is ON its target: the fingertip (≈ 42 % across, 8 px down the hand) lies inside
 * the target's box, the hand overlaps the target, and the hand stays inside the widget.
 */
export async function expectPointerOn(hand: HTMLElement, target: HTMLElement, widget: HTMLElement) {
  const h = hand.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const w = widget.getBoundingClientRect();
  const tip = { x: h.left + h.width * 0.42, y: h.top + 8 };
  await expect(tip.x).toBeGreaterThanOrEqual(t.left);
  await expect(tip.x).toBeLessThanOrEqual(t.right);
  await expect(tip.y).toBeGreaterThanOrEqual(t.top);
  await expect(tip.y).toBeLessThanOrEqual(t.bottom);
  await expect(h.left).toBeGreaterThanOrEqual(w.left);
  await expect(h.right).toBeLessThanOrEqual(w.right);
  await expect(h.bottom).toBeLessThanOrEqual(w.bottom);
}
