/**
 * make-set's "one ten-frame at a time" view (capacity 11–20 where two ten-frames don't fit): pure,
 * so it is unit-tested (tens.test.ts). Presentation only: the model, the response and the trace
 * never see it.
 *
 * The container shows one ten-frame. Page 0 is the first ten; page 1 is the ones, with the first
 * ten tied into a bundle beside them (the K teen-number idea: a full ten plus some ones). The
 * objects themselves stay in one list, slot `s` holding the `s`-th object, as with two frames.
 */

export type TenPage = 0 | 1;

/**
 * The page after the container's count goes from `before` to `after` (the child's move or a demo
 * op), from `page`:
 * - under ten: the first frame (nothing to tie);
 * - the first ten filling (10 or more from under 10) ties it into the bundle, showing the ones;
 * - an object put in while the full first ten is shown ties it again, so the new one is in view;
 * - taking objects out keeps the page: taking ones out never unties the ten.
 */
export function pageAfter(page: TenPage, before: number, after: number): TenPage {
  if (after < 10) return 0;
  if (after > before && (before < 10 || page === 0)) return 1;
  return page;
}

/** The page shown for a count: never the ones while there is no full ten. */
export function shownPage(page: TenPage, count: number): TenPage {
  return count < 10 ? 0 : page;
}

/**
 * What sits beside the shown frame: the tied ten (`bundle`, on the ones page), the ones in a small
 * frame (`ones`, while the full first ten is shown, so every object stays in view), or nothing
 * (under ten).
 */
export function besideFrame(page: TenPage, count: number): 'bundle' | 'ones' | null {
  if (count < 10) return null;
  return shownPage(page, count) === 1 ? 'bundle' : 'ones';
}
