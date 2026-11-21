// Invite and target checks shared by the tenframe-fill, number-bond and rekenrek stories (not
// exported from the package).
import { expect, waitFor } from 'storybook/test';
import { waitForSettled } from './storyHelpers';
import { contentBox, expectPointerOn, expectRingClear } from './widgetStory';

/** Waits until every finite animation and transition in `root` (its subtree too) has ended. */
export async function settledAll(root: HTMLElement) {
  await waitForSettled(root);
  await Promise.all(
    root
      .getAnimations({ subtree: true })
      .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
      .map((a) => a.finished.catch(() => undefined)),
  );
}

/**
 * Every numeral card's numeral lies inside its card with at least `margin` px on each side. The
 * numeral's ink box comes from its text (a Range for the sides; the font's ascent and the glyphs'
 * actual ascent and descent, via canvas measureText, for the top and bottom), so the font's tall
 * line box does not count, only what is drawn.
 */
export async function expectNumeralsInside(root: HTMLElement, margin = 4) {
  const ctx = document.createElement('canvas').getContext('2d');
  for (const card of root.querySelectorAll<HTMLElement>('.ni-pick')) {
    const numeral = card.querySelector<HTMLElement>('.ni-pick__numeral');
    const text = numeral?.firstChild;
    if (!numeral || !text || !ctx) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    const box = range.getBoundingClientRect();
    const cs = getComputedStyle(numeral);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText(numeral.textContent ?? '');
    const baseline = box.top + m.fontBoundingBoxAscent;
    const ink = {
      left: box.left,
      right: box.right,
      top: baseline - m.actualBoundingBoxAscent,
      bottom: baseline + m.actualBoundingBoxDescent,
    };
    const c = card.getBoundingClientRect();
    const what = `numeral ${numeral.textContent} inside its card`;
    await expect(ink.left - c.left, `${what}: left`).toBeGreaterThanOrEqual(margin);
    await expect(c.right - ink.right, `${what}: right`).toBeGreaterThanOrEqual(margin);
    await expect(ink.top - c.top, `${what}: top`).toBeGreaterThanOrEqual(margin);
    await expect(c.bottom - ink.bottom, `${what}: bottom`).toBeGreaterThanOrEqual(margin);
  }
}

/** The look of an element a disabled widget must not change: border, outline, shadow, transform. */
export function lookOf(el: Element): string {
  const cs = getComputedStyle(el);
  return [
    cs.borderTopWidth,
    cs.borderTopColor,
    cs.outlineStyle,
    cs.outlineWidth,
    cs.outlineColor,
    cs.boxShadow,
    cs.transform,
  ].join(' | ');
}

/**
 * How much of the area card's inner area the widget's content covers: the bounding box of its
 * drawn parts over the inner area (06 §2: use the room). Returns the fraction.
 */
export function fillOf(box: HTMLElement, parts: Element[]): number {
  const inner = contentBox(box);
  const rects = parts.map((p) => p.getBoundingClientRect()).filter((r) => r.width > 0);
  if (rects.length === 0) return 0;
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return (
    ((right - left) * (bottom - top)) / ((inner.right - inner.left) * (inner.bottom - inner.top))
  );
}

/** The widget's content covers at least `min` of the area's inner area. */
export async function expectFill(box: HTMLElement, parts: Element[], min = 0.6) {
  const fill = fillOf(box, parts);
  await expect(
    fill,
    `content covers ${(fill * 100).toFixed(1)} % of the area`,
  ).toBeGreaterThanOrEqual(min);
}

/** Every control the child can use now: enabled (also through a fieldset) and drawn. */
export function targetsOf(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, [role="button"], [role="slider"]')].filter(
    (el) =>
      !el.matches(':disabled') &&
      el.getAttribute('aria-disabled') !== 'true' &&
      el.getAttribute('data-target-disabled') !== 'true' &&
      el.getClientRects().length > 0,
  );
}

/**
 * The demo invite (03 §6.3) at rest: exactly one ring in the widget, on `ringed`; Pip's drawn
 * fingertip on it, clear of its glyph and inside the widget; the ring ≥ 12 px clear of every other
 * control.
 */
export async function expectOneInvite(root: HTMLElement, ringed: HTMLElement) {
  await waitForSettled(root);
  const rings = root.querySelectorAll('.ni-invite');
  await expect(rings).toHaveLength(1);
  await expect(rings[0]).toBe(ringed);
  const hand = await waitFor(() => {
    const h = root.querySelector<HTMLElement>('.ni-invite-hand');
    expect(h).not.toBeNull();
    return h as HTMLElement;
  });
  await expectPointerOn(hand, ringed, root);
  await expectRingClear(ringed, targetsOf(root));
}

/**
 * Enter held down on a button as a browser sends it: a keydown, then `repeats` keydowns with
 * `repeat: true`, then a keyup, each sent to whatever has the focus by then. A keydown nobody
 * prevents also activates the button (its default action: a click with `detail` 0), which a
 * dispatched event doesn't do by itself. `afterEach` runs after the first keydown and every repeat.
 */
export async function holdEnter(el: HTMLElement, repeats: number, afterEach: () => Promise<void>) {
  const key = { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, composed: true };
  for (let i = 0; i <= repeats; i++) {
    const target = (document.activeElement as HTMLElement | null) ?? el;
    const down = new KeyboardEvent('keydown', { ...key, repeat: i > 0 });
    target.dispatchEvent(down);
    if (!down.defaultPrevented) {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    }
    await new Promise((r) => setTimeout(r, 30));
    await afterEach();
  }
  ((document.activeElement as HTMLElement | null) ?? el).dispatchEvent(
    new KeyboardEvent('keyup', key),
  );
  await new Promise((r) => setTimeout(r, 30));
}
