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
