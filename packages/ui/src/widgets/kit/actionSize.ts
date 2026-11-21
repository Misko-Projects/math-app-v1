import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { useNarrationText, useUiPreferences } from '../../preferences/UiProvider';
import { type AgeMode, TARGET_PX } from '../../tokens/tokens';
import type { Size } from './arrange';

/** The measured action buttons, by their cue (`next`, `back`, `check`). */
export type ActionSizes = Readonly<Record<string, Size>>;

/**
 * Records one button's measured size. A re-measure that differs by a pixel (the same button read
 * at another zoom) keeps the larger value, so rounding never moves the plan.
 */
export function recordActionSize(seen: ActionSizes, cue: string, size: Size): ActionSizes {
  const was = seen[cue];
  const keep = (a: number, b: number) => (Math.abs(a - b) <= 1 ? Math.max(a, b) : b);
  const next = was ? { w: keep(was.w, size.w), h: keep(was.h, size.h) } : size;
  if (was && was.w === next.w && was.h === next.h) return seen;
  return { ...seen, [cue]: next };
}

/** The one action size a plan works with: the largest of the buttons measured so far. */
export function largestActionSize(seen: ActionSizes, fallback: Size): Size {
  const all = Object.values(seen);
  if (all.length === 0) return fallback;
  return {
    w: Math.max(...all.map((s) => s.w)),
    h: Math.max(...all.map((s) => s.h)),
  };
}

/** What decides how the action buttons are drawn: the age mode, text labels, the language. */
export interface ActionLabels {
  ageMode: AgeMode;
  textLabels: boolean;
  /** The narration text lookup (a new one when the language changes). */
  text: unknown;
}

/**
 * The sizes still true for the buttons as they are drawn now: none of them once the age mode, the
 * text labels or the language has changed (a button not in view would keep its old size, and with
 * it a layout a fresh widget would not choose).
 */
export function keepActionSizes(
  seen: ActionSizes,
  was: ActionLabels | null,
  now: ActionLabels,
): ActionSizes {
  const same =
    was === null ||
    (was.ageMode === now.ageMode && was.textLabels === now.textLabels && was.text === now.text);
  return same ? seen : {};
}

/**
 * The action button size a widget's plan uses, measured as drawn (in design px: the zoom the parts
 * are drawn at is undone; the 6 px ledge under a button is included).
 *
 * A widget's layouts show different buttons (Next on the build step, Check in the one-step layout,
 * Back and Check on the answer step), and in the text modes their widths differ. A plan fed only
 * the button on screen could choose one layout with Next's width, measure Check there, choose the
 * other, and so on without end. So every button measured is remembered by its cue and the plan
 * gets the largest: once both have been seen the size no longer depends on the layout in view.
 * The memory starts again when the buttons themselves change (age mode, text labels, language).
 */
export function useActionSize(
  actRef: RefObject<HTMLElement | null>,
  zoomRef: RefObject<number>,
  ageMode: AgeMode,
): Size {
  const seen = useRef<ActionSizes>({});
  const { textLabels } = useUiPreferences();
  const text = useNarrationText();
  const labels = useRef<ActionLabels | null>(null);
  const [button, setButton] = useState<Size>(() => ({
    w: TARGET_PX[ageMode].big * 1.5,
    h: TARGET_PX[ageMode].big,
  }));
  useLayoutEffect(() => {
    const btn = actRef.current?.querySelector<HTMLElement>('.ni-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const z = zoomRef.current || 1;
    const cue = btn.closest<HTMLElement>('[data-cue]')?.dataset.cue ?? '';
    const now: ActionLabels = { ageMode, textLabels, text };
    const kept = keepActionSizes(seen.current, labels.current, now);
    labels.current = now;
    seen.current = recordActionSize(kept, cue, {
      w: Math.ceil(r.width / z),
      h: Math.ceil(r.height / z) + 6,
    });
    setButton((b) => {
      const next = largestActionSize(seen.current, b);
      return b.w === next.w && b.h === next.h ? b : next;
    });
  });
  return button;
}
