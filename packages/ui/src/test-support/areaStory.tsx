// Widget-area story helpers (U05 #14; the pattern of #76's make-set stories): a story stage the
// exact size of a workshop's widget area (06 §2: 60 % of the screen, inside the 24 px frame) and
// assertions that nothing scrolls and every control sits inside it.
import { expect } from 'storybook/test';
import { WidgetHost, type WidgetHostProps } from '../widgets/WidgetHost';
import { expectPointerOn } from './widgetStory';

/** The widget area of a viewport: 60 % of the screen at full width, minus frame and border. */
export function widgetArea(vw: number, vh: number) {
  const outer = vw - 2 * 24;
  return { width: outer - 2 * 3, height: Math.ceil((0.6 * vw * vh) / outer) - 2 * 3 };
}

export const AREA = {
  /** 960 × 600, the smallest landscape screen (06 §1): about 906 × 373. */
  landscapeMin: widgetArea(960, 600),
  /** 1280 × 800 tablet: about 1226 × 493. */
  tablet: widgetArea(1280, 800),
} as const;

/** Renders the widget inside a fixed widget area (the story's `render`). */
export function inArea(area: keyof typeof AREA) {
  return (args: WidgetHostProps) => (
    <div
      className="story-widget-area"
      data-area-size={area}
      style={{
        ...AREA[area],
        maxWidth: 'none',
        boxSizing: 'border-box',
        display: 'grid',
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

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function areaBox(canvasElement: HTMLElement): HTMLElement {
  return canvasElement.querySelector('.story-widget-area') as HTMLElement;
}

function contentBox(el: Element) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const n = (v: string) => Number.parseFloat(v) || 0;
  return {
    left: r.left + n(cs.borderLeftWidth) + n(cs.paddingLeft),
    top: r.top + n(cs.borderTopWidth) + n(cs.paddingTop),
    right: r.right - n(cs.borderRightWidth) - n(cs.paddingRight),
    bottom: r.bottom - n(cs.borderBottomWidth) - n(cs.paddingBottom),
  };
}

/**
 * Nothing in the area scrolls, and every listed part (controls, pictures) lies inside the area's
 * content box.
 */
export async function expectFitsArea(box: HTMLElement, parts: readonly Element[]) {
  box.scrollTop = 0;
  box.scrollLeft = 0;
  await nextFrame();
  await expect(box.scrollHeight, 'the area does not scroll down').toBeLessThanOrEqual(
    box.clientHeight + 1,
  );
  await expect(box.scrollWidth, 'the area does not scroll across').toBeLessThanOrEqual(
    box.clientWidth + 1,
  );
  const inner = contentBox(box);
  await expect(parts.length, 'parts to check').toBeGreaterThan(0);
  for (const part of parts) {
    const r = part.getBoundingClientRect();
    const name = part.getAttribute('aria-label') ?? part.className.toString();
    await expect(r.left, `${name} left`).toBeGreaterThanOrEqual(inner.left - 0.5);
    await expect(r.right, `${name} right`).toBeLessThanOrEqual(inner.right + 0.5);
    await expect(r.top, `${name} top`).toBeGreaterThanOrEqual(inner.top - 0.5);
    await expect(r.bottom, `${name} bottom`).toBeLessThanOrEqual(inner.bottom + 0.5);
  }
}

/**
 * The settled end of a DemoInvite story: after the widget has had time to re-render and re-measure,
 * Pip's hand is still there, visible (non-zero size) and pointing at `target`.
 */
export async function expectHandStays(root: HTMLElement, target: () => HTMLElement) {
  await new Promise((r) => setTimeout(r, 600));
  await nextFrame();
  const hand = root.querySelector<HTMLElement>('.ni-hand');
  await expect(hand, 'the hand is still shown').not.toBeNull();
  const r = (hand as HTMLElement).getBoundingClientRect();
  await expect(r.width * r.height, 'the hand has a size').toBeGreaterThan(0);
  await expect(getComputedStyle(hand as HTMLElement).visibility).toBe('visible');
  await expectPointerOn(hand as HTMLElement, target(), root);
}

/** Every numeral (SVG text or element) under `root` matching `selector` renders at ≥ 32 px. */
export async function expectNumeralsAtLeast32(root: Element, selector: string) {
  const els = [...root.querySelectorAll(selector)];
  await expect(els.length, `numerals (${selector})`).toBeGreaterThan(0);
  for (const el of els) {
    const size = Number.parseFloat(getComputedStyle(el).fontSize);
    // SVG text: the font size is in user units; the screen matrix scales it (viewBox, transforms).
    const px =
      el instanceof SVGGraphicsElement
        ? size * Math.hypot(el.getScreenCTM()?.a ?? 1, el.getScreenCTM()?.b ?? 0)
        : size;
    await expect(px, `${el.textContent} size`).toBeGreaterThanOrEqual(31.5);
  }
}
