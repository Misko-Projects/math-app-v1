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
