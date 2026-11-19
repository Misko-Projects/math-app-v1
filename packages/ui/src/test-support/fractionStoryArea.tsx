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
  await expectCentred(root, box);
  controlSummary(`${root.className.split(' ')[0]} @ ${box.dataset.areaSize ?? 'stage'}`, controls);
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

/** The visible controls in `root` (buttons, tap targets, sliders), as the child sees them. */
export function visibleControls(root: Element): Element[] {
  return [...root.querySelectorAll('button, [role="button"], [role="slider"]')].filter((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0;
  });
}

/**
 * The invite state (03 §6.3, evidence rule): exactly ONE invited target (`.ni-invite` or an SVG
 * part with `data-invite`), and its ring (outline plus offset, or the outer half of a stroke) at
 * least 12 px clear of every other visible control.
 */
export async function expectSingleInvite(root: Element) {
  const invited = [...root.querySelectorAll('.ni-invite, [data-invite="true"]')];
  await expect(invited, 'one invited target').toHaveLength(1);
  const target = invited[0] as Element;
  const cs = getComputedStyle(target);
  const ring =
    target instanceof SVGElement
      ? (Number.parseFloat(cs.strokeWidth) || 0) / 2
      : (Number.parseFloat(cs.outlineWidth) || 0) + (Number.parseFloat(cs.outlineOffset) || 0);
  const t = target.getBoundingClientRect();
  const r = {
    left: t.left - ring,
    top: t.top - ring,
    right: t.right + ring,
    bottom: t.bottom + ring,
  };
  for (const el of visibleControls(root)) {
    if (el === target || el.contains(target) || target.contains(el)) continue;
    const b = el.getBoundingClientRect();
    const gap = Math.max(b.left - r.right, r.left - b.right, b.top - r.bottom, r.top - b.bottom);
    await expect(
      gap,
      `ring clear of ${el.getAttribute('aria-label') ?? el.tagName}`,
    ).toBeGreaterThanOrEqual(11.5);
  }
}

/**
 * The widget's content is centred in its area: the left and right margins between what it draws
 * (its children, the hand aside) and the area's inner box differ by at most 8 px.
 */
export async function expectCentred(root: HTMLElement, box: HTMLElement) {
  const parts = [...root.children].filter(
    (c) => !c.classList.contains('ni-hand') && c.getBoundingClientRect().width > 0,
  );
  const left = Math.min(...parts.map((p) => p.getBoundingClientRect().left));
  const right = Math.max(...parts.map((p) => p.getBoundingClientRect().right));
  const inner = contentBox(box);
  const l = left - inner.left;
  const r = inner.right - right;
  await expect(
    Math.abs(l - r),
    `centred: left ${l.toFixed(1)} vs right ${r.toFixed(1)} px`,
  ).toBeLessThanOrEqual(8);
}

/**
 * The INK height of each element's digits as rendered (canvas `measureText` with the element's
 * computed font: the drawn glyph box, not the font-size or the line box), in px.
 */
export async function numeralInk(el: Element): Promise<number> {
  await document.fonts.ready;
  const cs = getComputedStyle(el);
  const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const text = (el.textContent ?? '').replace(/[^0-9]/g, '') || '0';
  const m = ctx.measureText(text);
  // The rendered size: any CSS / SVG scaling between the font size and the screen.
  const scale = el instanceof SVGGraphicsElement ? (el.getScreenCTM()?.a ?? 1) : 1;
  return (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) * scale;
}

/** Every numeral the child reads has digits at least `min` px tall as drawn (05 §11: 32 px). */
export async function expectNumeralInk(els: Iterable<Element>, min = 32) {
  const list = [...els];
  await expect(list.length).toBeGreaterThan(0);
  for (const el of list) {
    const ink = await numeralInk(el);
    await expect(
      ink,
      `digits of "${el.textContent}" drawn ${ink.toFixed(1)} px tall`,
    ).toBeGreaterThanOrEqual(min);
  }
}

/**
 * A one-line record of the controls' measured CSS sizes and their smallest gap, for the evidence
 * (logged to the test output): "Check 120×80; 1 64×64; … | min gap 12".
 */
export function controlSummary(story: string, controls: Element[]): string {
  const rects = controls.map((c) => c.getBoundingClientRect());
  const sizes = controls.map((c, i) => {
    const r = rects[i] as DOMRect;
    const name = c.getAttribute('aria-label') ?? c.textContent?.trim() ?? c.tagName;
    return `${name} ${Math.round(r.width)}×${Math.round(r.height)}`;
  });
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i] as DOMRect;
      const b = rects[j] as DOMRect;
      gap = Math.min(
        gap,
        Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom),
      );
    }
  }
  const line = `[controls] ${story}: ${sizes.join('; ')} | min gap ${Number.isFinite(gap) ? Math.round(gap) : '-'}`;
  console.info(line);
  return line;
}
