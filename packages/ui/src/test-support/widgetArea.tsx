// Story helpers for the workshop widget area (U05 #14), after PR #76's `inArea` pattern in the
// make-set stories: render a widget in a card exactly the size of the workshop's widget area at a
// viewport, then prove nothing scrolls and every control lies inside the area.
import { expect } from 'storybook/test';
import type { WidgetHostProps } from '../widgets/WidgetHost';
import { WidgetHost } from '../widgets/WidgetHost';
import { expectTargetGaps, expectTargetSize } from './storyHelpers';

/**
 * The workshop's widget area at a viewport: the width less the workshop frame's 2 × 24 px padding
 * and the stage's 2 × 3 px border; the height is the 06 §2 minimum, 60 % of the screen over that
 * width, less the border. 1280 × 800 → 1226 × 493, 960 × 600 (06 §1 minimum) → 906 × 373,
 * 800 × 1280 → 746 × 812.
 */
export function widgetArea(vw: number, vh: number) {
  const outer = vw - 2 * 24;
  return { width: outer - 2 * 3, height: Math.ceil((0.6 * vw * vh) / outer) - 2 * 3 };
}

export const AREA = {
  landscapeMin: widgetArea(960, 600),
  portrait: widgetArea(800, 1280),
  tablet: widgetArea(1280, 800),
} as const;

/**
 * Renders the widget in the warm widget card (as `.story-widget-stage`: a 3 px tan border, 24 px
 * padding, sand), the card exactly the area's size, so the widget gets the inner area
 * (906 × 373 → 852 × 319). The card is a scroll box, so a play function can prove nothing scrolls.
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

/** `inner` lies inside `outer` (with `margin` px to spare on every side). */
export async function expectInside(inner: Edges, outer: Edges, what: string, margin = 0) {
  await expect(inner.left - outer.left, `${what}: left`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(inner.top - outer.top, `${what}: top`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(outer.right - inner.right, `${what}: right`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(outer.bottom - inner.bottom, `${what}: bottom`).toBeGreaterThanOrEqual(margin - 0.5);
}

const describe = (el: Element | null) =>
  el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? el?.tagName ?? 'nothing';

/** A real touch (the browser's hit test) at the element's centre lands on it. */
export async function expectHit(el: Element) {
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  await expect(
    hit !== null && el.contains(hit),
    `a touch on ${describe(el)} hits ${describe(hit)}`,
  ).toBe(true);
}

/**
 * The widget fits the area card with no scroll (06 §1, §2): at scrollTop 0 the card scrolls
 * neither way, every control lies inside its inner area and takes a real touch at its centre, and
 * the controls keep their age-mode size and 12 px gaps.
 */
export async function expectFitsArea(
  box: HTMLElement,
  controls: HTMLElement[],
  ageMode: 'k' | 'g1-up',
  pictures: HTMLElement[] = [],
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
  const inner = contentBox(box);
  await expect(controls.length).toBeGreaterThan(0);
  for (const el of [...controls, ...pictures]) {
    await expectInside(el.getBoundingClientRect(), inner, `${describe(el)} in the area`);
  }
  for (const el of controls) {
    await expectHit(el);
    await expectTargetSize(el, ageMode);
  }
  await expectTargetGaps(controls);
}

/**
 * Maths truth in the DOM (U05 #14): a chart shows exactly `values` (slot id → count). Bars end on
 * their value's gridline, picture graphs hold value / scale symbols (the last one cut to its
 * part), tally rows hold one stroke per count in groups of five, line plots one X per count.
 */
export async function expectChartShows(
  root: HTMLElement,
  values: Record<string, number>,
  scale = 1,
) {
  const chart = root.querySelector('.ni-chart') as HTMLElement;
  await expect(chart).not.toBeNull();
  const kind = chart.getAttribute('data-kind');
  for (const [id, v] of Object.entries(values)) {
    if (kind === 'bar') {
      const bar = chart.querySelector<SVGRectElement>(`.ni-chart__bar[data-slot="${id}"]`);
      if (v === 0) {
        await expect(bar).toBeNull();
        continue;
      }
      await expect(bar?.getAttribute('data-value')).toBe(String(v));
      const grid = chart.querySelector<SVGLineElement>(`.ni-chart__grid[data-value="${v}"]`);
      if (grid && bar) {
        const b = bar.getBoundingClientRect();
        const g = grid.getBoundingClientRect();
        const vertical = chart.getAttribute('data-orientation') === 'vertical';
        // The bar's end (its top, or its right end) is on the gridline of its value (the boxes
        // are the shapes' geometry; a stroke straddles it).
        const end = vertical ? b.top : b.right;
        const line = vertical ? g.top + g.height / 2 : g.left + g.width / 2;
        await expect(Math.abs(end - line), `${id} bar ends on ${v}`).toBeLessThanOrEqual(1.5);
      }
    } else if (kind === 'picture') {
      const row = chart.querySelector(`.ni-chart__symbols[data-slot="${id}"]`);
      const symbols = [...(row?.querySelectorAll<HTMLElement>('.ni-chart__symbol') ?? [])];
      await expect(Number(row?.getAttribute('data-symbols') ?? 0), `${id} symbols`).toBe(v / scale);
      await expect(symbols).toHaveLength(Math.ceil(v / scale));
      const last = symbols.at(-1);
      // A whole symbol's width is its drawing's (a cut symbol keeps a full-size drawing inside).
      const whole = last?.querySelector('.ni-chart__symbolart')?.getBoundingClientRect().width ?? 0;
      const part = v / scale - Math.floor(v / scale);
      if (last && part > 0) {
        await expect(last.getBoundingClientRect().width / whole).toBeCloseTo(part, 1);
      }
    } else if (kind === 'tally') {
      const group = chart.querySelector(`.ni-chart__tally[data-slot="${id}"]`);
      await expect(group?.querySelectorAll('line').length ?? 0, `${id} marks`).toBe(v);
      const sizes = [...(group?.querySelectorAll('[data-group-size]') ?? [])].map((g) =>
        Number(g.getAttribute('data-group-size')),
      );
      await expect(sizes).toEqual([
        ...Array.from({ length: Math.floor(v / 5) }, () => 5),
        ...(v % 5 ? [v % 5] : []),
      ]);
      await expect(group?.querySelectorAll('[data-gate="true"]').length ?? 0).toBe(
        Math.floor(v / 5),
      );
    } else if (kind === 'line-plot') {
      const xs = chart.querySelector(`.ni-chart__xs[data-slot="${id}"]`);
      await expect(xs?.querySelectorAll('.ni-chart__x').length ?? 0, `Xs at ${id}`).toBe(v);
    } else if (kind === 'table') {
      const cell = chart.querySelector(`text[data-slot="${id}"]`);
      await expect(cell?.textContent).toBe(String(v));
    }
  }
}
