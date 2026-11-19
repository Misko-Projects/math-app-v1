// Story helpers for the fraction widgets (U05, #14; not exported from the package). The widget
// area pattern is #76's `inArea` (MakeSetWidget.stories.tsx on feat/issue-12-counting), copied
// here until it moves to a shared helper; `measuredShares` measures the drawn parts themselves.
import { expect } from 'storybook/test';
import type { WidgetHostProps } from '../widgets/WidgetHost';
import { WidgetHost } from '../widgets/WidgetHost';
import { center, expectTargetGaps, expectTargetSize } from './storyHelpers';

/** The widget area of a workshop at a viewport (06 §2: ≥ 60 % of the screen, inside the chrome). */
export function widgetArea(vw: number, vh: number) {
  const outer = vw - 2 * 24;
  return { width: outer - 2 * 3, height: Math.ceil((0.6 * vw * vh) / outer) - 2 * 3 };
}

export const AREA = {
  /** 960 × 600 → 906 × 373 (852 × 319 inside the card). */
  landscapeMin: widgetArea(960, 600),
  portrait: widgetArea(800, 1280),
  /** 1280 × 800 → 1226 × 493 (1172 × 439 inside the card). */
  tablet: widgetArea(1280, 800),
} as const;

/**
 * Renders the widget in the warm widget card (as `.story-widget-stage`: a 3 px tan border, 24 px
 * padding, sand), the card exactly the area's size. The card is a scroll box like a stage, so the
 * play functions can prove nothing scrolls: it never grows to fit the widget.
 */
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
        placeItems: 'center',
        overflow: 'auto',
        padding: 24,
        border: '3px solid var(--color-sand-deep)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-sand)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      {/* #76 makes this the host's own rule (main still has a flat 360 px minimum, taller than the
          smallest landscape area); until it lands, the story applies it so it measures the widget. */}
      <style>{'.story-widget-area > .ni-widget { min-height: min(360px, 100%); }'}</style>
      <WidgetHost {...args} />
    </div>
  );
}

export const areaBox = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.story-widget-area') as HTMLElement;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** An element's content box: inside its border and padding. */
export function contentBox(el: Element) {
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

type Edges = { left: number; top: number; right: number; bottom: number };

export async function expectInside(inner: Edges, outer: Edges, margin: number, what: string) {
  await expect(inner.left - outer.left, `${what}: left`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(inner.top - outer.top, `${what}: top`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(outer.right - inner.right, `${what}: right`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(outer.bottom - inner.bottom, `${what}: bottom`).toBeGreaterThanOrEqual(margin - 0.5);
}

const describeEl = (el: Element) =>
  el.getAttribute('aria-label') ?? el.getAttribute('data-id') ?? el.tagName;

/** A real touch at `at` lands on `el` (or inside it): nothing covers it. */
export async function expectHit(el: Element, at: { x: number; y: number }, what: string) {
  const hit = document.elementFromPoint(at.x, at.y);
  await expect(hit !== null && (hit === el || el.contains(hit)), `${what} is hit`).toBe(true);
}

/**
 * The whole widget fits its card's inner area with no scroll (06 §1, §2): the card scrolls
 * neither way; every control lies inside the inner area; a real touch at each control's centre
 * lands on it; and the controls keep their size and 12 px gaps.
 */
export async function expectFitsArea(
  root: HTMLElement,
  box: HTMLElement,
  ageMode: 'k' | 'g1-up',
  controls: Element[],
  { gaps = true }: { gaps?: boolean } = {},
) {
  box.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  box.scrollTop = 0;
  box.scrollLeft = 0;
  await nextFrame();
  await expect(box.scrollHeight, 'the area does not scroll down').toBeLessThanOrEqual(
    box.clientHeight + 1,
  );
  await expect(box.scrollWidth, 'the area does not scroll across').toBeLessThanOrEqual(
    box.clientWidth + 1,
  );
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  const inner = contentBox(box);
  await expect(controls.length).toBeGreaterThan(0);
  for (const el of controls) {
    await expectInside(el.getBoundingClientRect(), inner, 0, `${describeEl(el)} in the area`);
    await expectHit(el, center(el), describeEl(el));
    await expectTargetSize(el, ageMode);
  }
  if (gaps) await expectTargetGaps(controls);
}

/**
 * Each drawn part's share of all the parts' area, measured from the rendered SVG paths with the
 * browser's own hit test (`isPointInFill` on a fine grid), in part order (`data-part`). This
 * checks the picture the child sees, not the numbers it was drawn from.
 */
export function measuredShares(root: Element, step = 1): number[] {
  const paths = [...root.querySelectorAll<SVGPathElement>('path.ni-fraction__part')].sort(
    (a, b) => Number(a.dataset.part) - Number(b.dataset.part),
  );
  const svg = paths[0]?.ownerSVGElement;
  if (!svg) return [];
  const vb = svg.viewBox.baseVal;
  const counts = paths.map(() => 0);
  const pt = svg.createSVGPoint();
  for (let y = vb.y + step / 2; y < vb.y + vb.height; y += step) {
    for (let x = vb.x + step / 2; x < vb.x + vb.width; x += step) {
      pt.x = x;
      pt.y = y;
      paths.forEach((p, i) => {
        // Parts may be moved apart: test the point in the part's own (untranslated) space.
        if (p.isPointInFill(pt)) counts[i] = (counts[i] as number) + 1;
      });
    }
  }
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((c) => c / total);
}

/** Every share is 1/n within `tol` (sampling error), and there are n of them. */
export async function expectEqualShares(shares: number[], n: number, tol = 0.005) {
  await expect(shares).toHaveLength(n);
  for (const s of shares) await expect(Math.abs(s - 1 / n), `share ${s}`).toBeLessThan(tol);
}

/** Waits until every animation and transition inside `el` has finished (parts moving apart).*/
export async function settle(el: Element) {
  await nextFrame();
  await Promise.all(
    el
      .getAnimations({ subtree: true })
      .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
      .map((a) => a.finished.catch(() => undefined)),
  );
}
