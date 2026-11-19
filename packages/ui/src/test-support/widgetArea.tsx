// The workshop widget area as a story stage (06 §2: ≥ 60% of the screen), after #76's `inArea`
// pattern (MakeSetWidget.stories.tsx on feat/issue-12-counting): the U05 time and money stories use
// it to prove a widget fits the tablet and the smallest landscape area with nothing scrolling.
import { expect } from 'storybook/test';
import { WidgetHost, type WidgetHostProps } from '../widgets/WidgetHost';

/** The widget area inside a workshop at a viewport: 24 px margins, 60% of the screen's area. */
export function widgetArea(vw: number, vh: number) {
  const outer = vw - 2 * 24;
  return { width: outer - 2 * 3, height: Math.ceil((0.6 * vw * vh) / outer) - 2 * 3 };
}

export const AREA = {
  /** 960 × 600 → 906 × 373 (852 × 319 inside the card's padding). */
  landscapeMin: widgetArea(960, 600),
  /** 1280 × 800 → 1226 × 493 (1172 × 439 inside). */
  tablet: widgetArea(1280, 800),
} as const;

/**
 * WidgetHost's host is at least 360 px tall on main, taller than the 319 px inside the smallest
 * landscape area; #76 (U03) caps it at the area (`min(360px, 100%)`). Until that lands, the area
 * stage applies the same cap, so these stories measure the widget, not the host's floor.
 */
const HOST_CAP = '.story-widget-area > .ni-widget { min-height: min(360px, 100%); }';

/**
 * Renders the widget in the warm widget card (3 px tan border, 24 px padding, sand), the card
 * exactly the area's size. The card is a scroll box, so a play function can prove nothing scrolls.
 */
export function inArea(area: keyof typeof AREA) {
  return (args: WidgetHostProps) => (
    <>
      <style>{HOST_CAP}</style>
      <AreaCard area={area} args={args} />
    </>
  );
}

function AreaCard({ area, args }: { area: keyof typeof AREA; args: WidgetHostProps }) {
  return (
    <div
      className="story-widget-area"
      data-area-size={area}
      style={{
        ...AREA[area],
        maxWidth: 'none',
        boxSizing: 'border-box',
        display: 'grid',
        placeItems: 'center',
        overflow: 'auto',
        padding: 24,
        border: '3px solid var(--color-sand-deep)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-sand)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <WidgetHost {...args} />
    </div>
  );
}

export const areaBox = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.story-widget-area') as HTMLElement;

/**
 * Nothing in the area scrolls (scroll size ≤ client size + 1) and every control of the widget lies
 * inside the area's padding box.
 */
export async function expectFitsArea(canvasElement: HTMLElement, root: HTMLElement) {
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
}
