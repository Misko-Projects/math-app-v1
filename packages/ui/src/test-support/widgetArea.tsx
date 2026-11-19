// Story helpers for the workshop widget area (U05 #14), after PR #76's `inArea` pattern in the
// make-set stories: render a widget in a card exactly the size of the workshop's widget area at a
// viewport, then prove nothing scrolls and every control lies inside the area.
import type { ReactElement } from 'react';
import { expect } from 'storybook/test';
import type { WidgetHostProps } from '../widgets/WidgetHost';
import { WidgetHost } from '../widgets/WidgetHost';
import { expectTargetGaps, expectTargetSize } from './storyHelpers';

/** Every numeral the child reads in these widgets (05 §11: ≥ 32 px). */
const NUMERALS = [
  '.ni-chart__numeral',
  '.ni-chart__key',
  '.ni-number',
  '.ni-pad__digit',
  '.ni-pattern__numeral',
  '.ni-bgb__length',
].join(', ');

/** Every numeral in `root` (axis labels, table counts, the key, entries, pad digits) is ≥ 32 px. */
export async function expectNumeralsReadable(root: HTMLElement) {
  const els = [...root.querySelectorAll<Element>(NUMERALS)].filter((e) =>
    /\d/.test(e.textContent ?? ''),
  );
  for (const el of els) {
    const what = `${el.getAttribute('class')} "${el.textContent?.trim()}"`;
    // The rendered size, not the attribute: a scaled SVG would shrink a "32 px" numeral.
    const size = Number.parseFloat(getComputedStyle(el).fontSize);
    await expect(size, `${what} font size`).toBeGreaterThanOrEqual(32);
    // The digits' rendered glyph box (a Range over the text, as drawn on screen).
    const range = document.createRange();
    range.selectNodeContents(el);
    const glyphs = range.getBoundingClientRect();
    await expect(glyphs.height, `${what} rendered height`).toBeGreaterThanOrEqual(32);
  }
}

/** The widget's content sits centred in the area: left and right margins within 4 px. */
export async function expectCentred(box: HTMLElement, parts: Element[]) {
  const inner = contentBox(box);
  const rects = parts.map((p) => p.getBoundingClientRect()).filter((r) => r.width > 0);
  const left = Math.min(...rects.map((r) => r.left)) - inner.left;
  const right = inner.right - Math.max(...rects.map((r) => r.right));
  await expect(
    Math.abs(left - right),
    `margins ${left.toFixed(1)} / ${right.toFixed(1)} px`,
  ).toBeLessThanOrEqual(4);
}

/**
 * Records the measured CSS size of each group of controls and the smallest edge-to-edge gap to
 * any other control, for the evidence ("keys 80×80, gaps 12; check 120×80"), logged as
 * `[controls] <story>: …` and returned.
 */
export function recordControls(story: string, groups: Record<string, Element[]>): string {
  const all = Object.values(groups).flat();
  const gapTo = (el: Element) => {
    const a = el.getBoundingClientRect();
    let best = Number.POSITIVE_INFINITY;
    for (const other of all) {
      if (other === el) continue;
      const b = other.getBoundingClientRect();
      const dx = Math.max(b.left - a.right, a.left - b.right);
      const dy = Math.max(b.top - a.bottom, a.top - b.bottom);
      best = Math.min(best, Math.max(dx, dy));
    }
    return best;
  };
  const parts = Object.entries(groups)
    .filter(([, els]) => els.length > 0)
    .map(([name, els]) => {
      const sizes = [
        ...new Set(
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return `${Math.round(r.width)}×${Math.round(r.height)}`;
          }),
        ),
      ];
      const gap = Math.min(...els.map(gapTo));
      return `${name} ${sizes.join('/')}${Number.isFinite(gap) ? `, gap ≥ ${Math.floor(gap)}` : ''}`;
    });
  const line = `${story}: ${parts.join('; ')}`;
  console.log(`[controls] ${line}`);
  return line;
}

/**
 * Demo invite (03 §6.3): exactly one invited control and one ring, drawn inside the control's own
 * box (outline offset ≤ −width), so the full 12 px target gap stays clear of every other outline;
 * Pip's hand is visible.
 */
export async function expectOneInvite(root: HTMLElement) {
  const invited = [...root.querySelectorAll<HTMLElement>('.ni-invite')];
  await expect(invited, 'invited controls').toHaveLength(1);
  const cs = getComputedStyle(invited[0] as HTMLElement);
  const offset = Number.parseFloat(cs.outlineOffset);
  const width = Number.parseFloat(cs.outlineWidth);
  await expect(offset + width, 'the ring stays inside its control').toBeLessThanOrEqual(0);
  await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
  await expect(root.querySelector('.ni-hand')).toBeVisible();
}

/** Picture-graph symbols are one size in every row (true relative scale). */
export async function expectSymbolsOneSize(root: HTMLElement) {
  const sizes = new Set(
    [...root.querySelectorAll('.ni-chart__symbolart')].map((el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    }),
  );
  await expect(sizes.size).toBe(1);
}

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
  // The content sits centred in the area, and the measured control sizes go to the evidence log.
  const widget = controls[0]?.closest('.ni-widget > *') ?? controls[0];
  const content = widget
    ? [...widget.querySelectorAll(CONTENT)].filter((el) => el.getBoundingClientRect().width > 0)
    : [];
  await expectCentred(box, content.length > 0 ? content : controls);
  if (widget instanceof HTMLElement) await expectNumeralsReadable(widget);
  // On the area card too (`data-controls`), so the evidence can read it off the rendered story.
  box.dataset.controls = recordControls(currentStory, groupControls(controls));
}

/** The outermost visible parts of the U05 widgets (boards, strips, answer panels, tools). */
const CONTENT = [
  '.ni-bgr__board',
  '.ni-bgr__answer',
  '.ni-bgb__board',
  '.ni-bgb__tools',
  '.ni-pattern__rows',
  '.ni-pattern__table',
  '.ni-pattern__controls',
].join(', ');

let currentStory = '';

/** A story decorator that names the running story for `recordControls` (evidence log lines). */
export function namedStory(Story: () => ReactElement, ctx: { title: string; name: string }) {
  currentStory = `${ctx.title} › ${ctx.name}`;
  return <Story />;
}

/** Controls grouped by what they are, for the evidence line. */
function groupControls(controls: HTMLElement[]): Record<string, HTMLElement[]> {
  const name = (el: HTMLElement): string => {
    if (el.getAttribute('aria-label') === 'Check' || el.textContent?.trim() === 'Check') {
      return 'check';
    }
    if (el.closest('.ni-stepper')) return 'stepper keys';
    if (el.classList.contains('ni-pad__key') && el.closest('.ni-pad')) return 'pad keys';
    if (el.classList.contains('ni-bgb__back')) return 'take back';
    if (el.classList.contains('ni-bgb__chip')) return 'mark chips';
    if (el.classList.contains('ni-bgb__lane')) return 'rows';
    if (el.matches('.ni-bgr__name, .ni-bgr__cat')) return 'category labels';
    if (el.classList.contains('ni-pattern__unit')) return 'pieces';
    if (el.classList.contains('ni-pattern__blank')) return 'blanks';
    if (el.classList.contains('ni-pattern__cell')) return 'pattern units';
    return 'controls';
  };
  const out: Record<string, HTMLElement[]> = {};
  for (const el of controls) {
    const key = name(el);
    out[key] ??= [];
    (out[key] as HTMLElement[]).push(el);
  }
  return out;
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
