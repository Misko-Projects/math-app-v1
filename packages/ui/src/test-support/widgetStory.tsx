// Helpers for widget stories (not exported from the package). Widget stories render through
// WidgetHost and the production registry, so the lazy lookup is exercised exactly as in the app.
import type { InteractionEvent, WidgetConfig } from '@number-island/shared';
import { expect, type fn, waitFor } from 'storybook/test';
import { HAND_POINTER_TIP } from '../primitives/icons';
import { type AgeMode, TARGET_GAP_PX } from '../tokens/tokens';
import { INVITE_GLYPH_SELECTOR, INVITE_TARGET_SELECTOR } from '../widgets/kit';
import type { WidgetHostProps } from '../widgets/WidgetHost';
import { WidgetHost } from '../widgets/WidgetHost';
import { expectTargetGaps, expectTargetSize } from './storyHelpers';

/** The widget area of a workshop (06 §2: ≥ 60% of the screen), as a fixed story stage. */
export function renderWidget(args: WidgetHostProps) {
  return (
    <div className="story-widget-stage">
      <WidgetHost {...args} />
    </div>
  );
}

/** Waits for the registered widget's chunk to load and returns its root element. */
export async function findWidget(
  canvasElement: HTMLElement,
  selector: string,
): Promise<HTMLElement> {
  await waitFor(
    () => expect(canvasElement.querySelector(selector), `${selector} rendered`).not.toBeNull(),
    { timeout: 10_000 },
  );
  return canvasElement.querySelector(selector) as HTMLElement;
}

/** The interaction trace a story's `onInteract` spy received, in order. */
export function traceOf(onInteract: unknown): InteractionEvent[] {
  return (onInteract as ReturnType<typeof fn>).mock.calls.map(([e]) => e as InteractionEvent);
}

/** Every event's ms is non-decreasing (one widget instance, one clock). */
export async function expectTraceOrdered(trace: InteractionEvent[]) {
  for (let i = 1; i < trace.length; i++) {
    await expect((trace[i] as InteractionEvent).ms).toBeGreaterThanOrEqual(
      (trace[i - 1] as InteractionEvent).ms,
    );
  }
}

export type { WidgetConfig };
/**
 * Pip's pointer is ON its target, measured at rest (the hand's tap bob and the ring's pulse paused
 * at their start): the DRAWN fingertip (`HAND_POINTER_TIP` for the icon's direction) lies inside
 * the target's box, the hand box overlaps none of the target's glyphs (icon, numeral, digit or
 * word: `INVITE_GLYPH_SELECTOR`), and the hand, bob included, stays inside the widget.
 */
export async function expectPointerOn(hand: HTMLElement, target: HTMLElement, widget: HTMLElement) {
  const loops = widget
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
  for (const a of loops) {
    a.pause();
    a.currentTime = 0;
  }
  try {
    const svg = hand.querySelector('svg');
    const named = svg?.dataset.direction ?? 'down';
    const direction = (named in HAND_POINTER_TIP ? named : 'down') as keyof typeof HAND_POINTER_TIP;
    const h = (svg ?? hand).getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const w = widget.getBoundingClientRect();
    const ratio = HAND_POINTER_TIP[direction];
    const tip = { x: h.left + h.width * ratio.x, y: h.top + h.height * ratio.y };
    await expect(tip.x, 'fingertip x inside the target').toBeGreaterThanOrEqual(t.left);
    await expect(tip.x, 'fingertip x inside the target').toBeLessThanOrEqual(t.right);
    await expect(tip.y, 'fingertip y inside the target').toBeGreaterThanOrEqual(t.top);
    await expect(tip.y, 'fingertip y inside the target').toBeLessThanOrEqual(t.bottom);
    for (const glyph of target.querySelectorAll(INVITE_GLYPH_SELECTOR)) {
      const g = glyph.getBoundingClientRect();
      const apart =
        h.right <= g.left || g.right <= h.left || h.bottom <= g.top || g.bottom <= h.top;
      const at = (r: DOMRect) =>
        [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 10) / 10).join(',');
      await expect(
        apart,
        `hand [${at(h)}] clear of the glyph ${glyph.className} [${at(g)}] in [${at(t)}]`,
      ).toBe(true);
    }
    // The bob moves the hand 6 px left and 8 px down.
    await expect(h.left - 6).toBeGreaterThanOrEqual(w.left);
    await expect(h.right).toBeLessThanOrEqual(w.right);
    await expect(h.bottom + 8).toBeLessThanOrEqual(w.bottom);
  } finally {
    for (const a of loops) a.play();
  }
}

/**
 * Pip's hand at rest, its bob included, covers no other control: it stays ≥ `margin` px (default
 * 12, 06 §4) from every target but `target` (the kit's `INVITE_TARGET_SELECTOR`) and overlaps no
 * glyph outside `target`. Returns the smallest gap to another target.
 */
export async function expectHandClearOfOthers(
  widget: HTMLElement,
  target: HTMLElement,
  margin = TARGET_GAP_PX,
): Promise<number> {
  const loops = widget
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
  for (const a of loops) {
    a.pause();
    a.currentTime = 0;
  }
  try {
    const h = (widget.querySelector('.ni-hand svg') as SVGElement).getBoundingClientRect();
    const reach = { left: h.left - 6, top: h.top, right: h.right, bottom: h.bottom + 8 };
    const gapTo = (r: DOMRect) =>
      Math.max(
        r.left - reach.right,
        reach.left - r.right,
        r.top - reach.bottom,
        reach.top - r.bottom,
      );
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    // A zone the target sits in (a boat, a supply tray) is where the hand points, not a neighbour.
    const tb = target.getBoundingClientRect();
    const encloses = (r: DOMRect) =>
      r.left <= tb.left && r.top <= tb.top && r.right >= tb.right && r.bottom >= tb.bottom;
    let min = Number.POSITIVE_INFINITY;
    for (const el of widget.querySelectorAll(INVITE_TARGET_SELECTOR)) {
      if (el === target || el.contains(target) || target.contains(el) || !shown(el)) continue;
      if (encloses(el.getBoundingClientRect())) continue;
      const g = gapTo(el.getBoundingClientRect());
      min = Math.min(min, g);
      await expect(g, `the hand ≥ ${margin} px from ${describeEl(el)}`).toBeGreaterThanOrEqual(
        margin - 0.5,
      );
    }
    for (const el of widget.querySelectorAll(INVITE_GLYPH_SELECTOR)) {
      if (target.contains(el) || !shown(el)) continue;
      await expect(
        gapTo(el.getBoundingClientRect()),
        `the hand off ${describeEl(el)}`,
      ).toBeGreaterThanOrEqual(0);
    }
    return min;
  } finally {
    for (const a of loops) a.play();
  }
}

// ---------- the workshop's widget area (shared by every widget's area stories) ----------

/**
 * The workshop's widget area at a viewport: the width less the workshop frame's 2 × 24 px padding
 * and the stage's 2 × 3 px border; the height is the 06 §2 minimum, 60 % of the screen over that
 * width, less the border. 1280 × 800 → 1226 × 493, 960 × 600 (06 §1 minimum) → 906 × 373,
 * 800 × 1280 → 746 × 812. (Today's WorkshopFrame chrome leaves less than 60 %; that is the
 * frame's to fix, not the widget's.) Same numbers as tap-count's and make-set's area stories.
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
 * Renders the widget in the normal warm widget card (as `.story-widget-stage`: a 3 px tan border,
 * 24 px padding, sand), the card exactly the area's size, so the widget gets the inner area
 * (906 × 373 → 852 × 319). The card is a scroll box like a stage, so a play function can prove
 * nothing scrolls: it never grows to fit the widget.
 */
export function inArea(area: keyof typeof AREA) {
  return (args: WidgetHostProps) => (
    <div
      className="story-widget-area"
      data-area-size={area}
      style={{
        ...AREA[area],
        maxWidth: 'none',
        // Centred in the stage even when wider than its padded content box (the 1226 px tablet
        // area in a 1280 px viewport): a grid item that overflows its track starts at the track's
        // left edge, so equal negative margins centre it on the viewport instead.
        justifySelf: 'center',
        marginInline: `min(0px, calc((100% - ${AREA[area].width}px) / 2))`,
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

/** The area card `inArea` renders. */
export const areaBox = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.story-widget-area') as HTMLElement;

/**
 * Records a value the play function measured (`data-m-<key>` on the area card, or on the canvas
 * outside an area), so evidence labels quote the browser's numbers, never a planned guess.
 */
export function noteMeasure(canvasElement: HTMLElement, key: string, value: string | number) {
  const el = areaBox(canvasElement) ?? canvasElement;
  el.setAttribute(`data-m-${key}`, String(value));
}

export type Edges = { left: number; top: number; right: number; bottom: number };

/** An element's content box: inside its border and padding. */
export function contentBox(el: Element): Edges {
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

/** `inner` lies inside `outer` with at least `margin` px on every side. */
export async function expectInside(inner: Edges, outer: Edges, margin: number, what: string) {
  await expect(inner.left - outer.left, `${what}: left margin`).toBeGreaterThanOrEqual(
    margin - 0.5,
  );
  await expect(inner.top - outer.top, `${what}: top margin`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(outer.right - inner.right, `${what}: right margin`).toBeGreaterThanOrEqual(
    margin - 0.5,
  );
  await expect(outer.bottom - inner.bottom, `${what}: bottom margin`).toBeGreaterThanOrEqual(
    margin - 0.5,
  );
}

const describeEl = (el: Element | null) =>
  el ? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}` : 'nothing';

/**
 * A real touch at `at` lands on `el`: the browser's hit test (`elementFromPoint`) returns `el` or
 * something inside it, so nothing covers it, it is not clipped away and it is on screen.
 */
export async function expectHit(el: Element, at: { x: number; y: number }, what: string) {
  const hit = document.elementFromPoint(at.x, at.y);
  await expect(
    hit !== null && el.contains(hit),
    `${what}: a touch at (${Math.round(at.x)}, ${Math.round(at.y)}) hits ${describeEl(hit)}, not ${describeEl(el)}`,
  ).toBe(true);
}

/** The area card is scrolled to its origin and scrolls neither way (06 §1: one screen). */
export async function expectNoScroll(box: HTMLElement) {
  box.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  box.scrollTop = 0;
  box.scrollLeft = 0;
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await expect(box.scrollHeight, 'the area does not scroll down').toBeLessThanOrEqual(
    box.clientHeight + 1,
  );
  await expect(box.scrollWidth, 'the area does not scroll across').toBeLessThanOrEqual(
    box.clientWidth + 1,
  );
}

/**
 * An invite ring (outline) stays ≥ 12 px clear of every other target: the ringed element's box,
 * grown by its outline's reach, against each other target's box.
 */
export async function expectRingClear(ringed: HTMLElement, others: Element[]) {
  const cs = getComputedStyle(ringed);
  await expect(cs.outlineStyle).toBe('solid');
  const reach = Math.max(
    0,
    Number.parseFloat(cs.outlineOffset) + Number.parseFloat(cs.outlineWidth),
  );
  const r = ringed.getBoundingClientRect();
  for (const other of others) {
    if (other === ringed || ringed.contains(other) || other.contains(ringed)) continue;
    const b = other.getBoundingClientRect();
    const dx = Math.max(b.left - (r.right + reach), r.left - reach - b.right);
    const dy = Math.max(b.top - (r.bottom + reach), r.top - reach - b.bottom);
    await expect(Math.max(dx, dy), `ring clearance to ${describeEl(other)}`).toBeGreaterThanOrEqual(
      TARGET_GAP_PX - 0.5,
    );
  }
}

/**
 * The whole widget fits the area card (06 §1, §2): nothing scrolls; every part lies inside the
 * card's inner area; a real touch at each target's centre lands on it; and the targets keep the
 * age mode's size and 12 px gaps (06 §4).
 */
export async function expectFitsArea(
  box: HTMLElement,
  parts: Element[],
  targets: Element[],
  ageMode: AgeMode,
) {
  await expectNoScroll(box);
  const inner = contentBox(box);
  for (const part of parts) {
    await expectInside(part.getBoundingClientRect(), inner, 0, `${describeEl(part)} in the area`);
  }
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    await expectHit(el, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, describeEl(el));
  }
  for (const el of targets) await expectTargetSize(el, ageMode);
  await expectTargetGaps(targets);
  await expect(box.scrollTop).toBe(0);
}

/**
 * How much of the area card's inner area (width × height) the widget's content covers: the
 * bounding box of its visible parts over the inner area, 0–1.
 */
export function widgetFill(box: HTMLElement, parts: Element[]): number {
  const inner = contentBox(box);
  const rects = parts.map((p) => p.getBoundingClientRect());
  const left = Math.max(inner.left, Math.min(...rects.map((r) => r.left)));
  const top = Math.max(inner.top, Math.min(...rects.map((r) => r.top)));
  const right = Math.min(inner.right, Math.max(...rects.map((r) => r.right)));
  const bottom = Math.min(inner.bottom, Math.max(...rects.map((r) => r.bottom)));
  const area = (inner.right - inner.left) * (inner.bottom - inner.top);
  return area > 0 ? (Math.max(0, right - left) * Math.max(0, bottom - top)) / area : 0;
}

/** The widget uses the room: its content covers at least `min` of the area's inner area. */
export async function expectFill(box: HTMLElement, parts: Element[], min = 0.6) {
  const fill = widgetFill(box, parts);
  box.dataset.fill = String(Math.round(fill * 100));
  await expect(fill, `widget fill ${Math.round(fill * 100)} %`).toBeGreaterThanOrEqual(min);
  return fill;
}
