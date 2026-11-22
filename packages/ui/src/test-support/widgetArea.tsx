// Area checks of the U05 time and money stories: the stage itself (`AREA`, `inArea`) is the kit's
// one widget area (areaStory.tsx); this file adds the checks that read a whole widget's controls.
import { expect } from 'storybook/test';
import { AREA, inArea, widgetArea } from './areaStory';
import { controlSummary, controlsOf, expectNumerals, isPad, settled } from './controlChecks';
import { expectTargetGaps } from './storyHelpers';

export { AREA, inArea, widgetArea };

export const areaBox = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.story-widget-area') as HTMLElement;

/**
 * Nothing in the area scrolls (scroll size ≤ client size + 1) and every control of the widget lies
 * inside the area's padding box.
 */
export async function expectFitsArea(canvasElement: HTMLElement, root: HTMLElement) {
  await settled(root);
  const box = areaBox(canvasElement);
  await expect(box.scrollWidth, 'area scrolls sideways').toBeLessThanOrEqual(box.clientWidth + 1);
  await expect(box.scrollHeight, 'area scrolls down').toBeLessThanOrEqual(box.clientHeight + 1);
  for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible') {
      await expect(el.scrollHeight, `${el.className} scrolls`).toBeLessThanOrEqual(
        el.clientHeight + 1,
      );
    }
  }
  const b = box.getBoundingClientRect();
  const controls = root.querySelectorAll<HTMLElement>('button, [role="button"], output');
  for (const c of controls) {
    const r = c.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const what = c.getAttribute('aria-label') ?? c.textContent?.trim() ?? c.tagName;
    await expect(r.left, `${what} left`).toBeGreaterThanOrEqual(b.left + 3 - 0.5);
    await expect(r.top, `${what} top`).toBeGreaterThanOrEqual(b.top + 3 - 0.5);
    await expect(r.right, `${what} right`).toBeLessThanOrEqual(b.right - 3 + 0.5);
    await expect(r.bottom, `${what} bottom`).toBeLessThanOrEqual(b.bottom - 3 + 0.5);
  }
  await expectCentred(canvasElement, root);
  await expectNumerals(root);
  await expectTargetGaps(controlsOf(root).filter((el) => !isPad(el)));
  controlSummary(root, box.dataset.areaSize ?? '');
}

/**
 * The widget's content sits in the middle of the area (Orchestrator audit 1): the left and right
 * margins between the area's content box and the content's outer edges differ by ≤ 8 px.
 */
export async function expectCentred(canvasElement: HTMLElement, root: HTMLElement, tol = 8) {
  const box = areaBox(canvasElement);
  const b = box.getBoundingClientRect();
  const cs = getComputedStyle(box);
  const inner = {
    left: b.left + box.clientLeft + (Number.parseFloat(cs.paddingLeft) || 0),
    right: b.left + box.clientLeft + box.clientWidth - (Number.parseFloat(cs.paddingRight) || 0),
  };
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const el of root.querySelectorAll<HTMLElement>(':scope > *')) {
    if (getComputedStyle(el).position === 'absolute') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  }
  const l = left - inner.left;
  const rr = inner.right - right;
  await expect(
    Math.abs(l - rr),
    `centred: left ${Math.round(l)} px, right ${Math.round(rr)} px`,
  ).toBeLessThanOrEqual(tol);
}
