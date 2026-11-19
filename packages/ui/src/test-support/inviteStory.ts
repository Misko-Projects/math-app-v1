// Invite and target checks shared by the tenframe-fill, number-bond and rekenrek stories (not
// exported from the package).
import { expect, waitFor } from 'storybook/test';
import { waitForSettled } from './storyHelpers';
import { expectPointerOn, expectRingClear } from './widgetStory';

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
