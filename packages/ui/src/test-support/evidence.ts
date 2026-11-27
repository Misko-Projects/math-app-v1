// Evidence-review helpers for story play functions (U05 #14, PR #88 evidence review): measured
// control sizes and gaps, one invite ring with clearance, numerals measured as rendered, and
// parts that must not touch.
import { expect } from 'storybook/test';
import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX } from '../tokens/tokens';
import { expectAreaCentred } from './storyHelpers';

type Rect = { left: number; top: number; right: number; bottom: number };

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

/** Edge-to-edge distance between two boxes (negative when they overlap). */
export function boxGap(a: Rect, b: Rect): number {
  return Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
}

/** The box an element's outline paints (its border box grown by outline-offset + width). */
export function outlineBox(el: Element): Rect {
  const r = rectOf(el);
  const cs = getComputedStyle(el);
  // Only a ring that shows counts (a transparent or zero-width outline paints nothing).
  const invisible = /rgba\([^)]*,\s*0\)$|transparent/.test(cs.outlineColor);
  if (cs.outlineStyle === 'none' || invisible || Number.parseFloat(cs.outlineWidth) === 0) {
    return r;
  }
  const grow = Math.max(
    0,
    (Number.parseFloat(cs.outlineOffset) || 0) + (Number.parseFloat(cs.outlineWidth) || 0),
  );
  return {
    left: r.left - grow,
    top: r.top - grow,
    right: r.right + grow,
    bottom: r.bottom + grow,
  };
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Evidence capture: merges `entries` (live measurements, CSS px at the viewport the story runs
 * in) into a compact JSON string in `data-evidence` on the story's area (or stage) element, so a
 * capture script reads exactly what the drawing shows at its own viewport.
 */
export function recordEvidence(anchor: Element | null, entries: Record<string, unknown>) {
  const host =
    anchor?.closest('.story-widget-area') ??
    anchor?.closest('.story-widget-stage') ??
    document.querySelector('.story-widget-area, .story-widget-stage') ??
    document.body;
  let prev: Record<string, unknown> = {};
  try {
    prev = JSON.parse(host.getAttribute('data-evidence') ?? '{}');
  } catch {
    prev = {};
  }
  host.setAttribute('data-evidence', JSON.stringify({ ...prev, ...entries }));
}

/** What `recordKeyRects` measures: every control, the invite ring and the guide's hand. */
const KEY_PARTS =
  'button, [role="button"], [role="slider"], [role="application"], .ni-invite, .ni-hand';

/**
 * Evidence for every story (a story meta's `afterEach`): the live rects of the widget's key
 * parts (every control, the invite ring, the guide's hand) as `"x,y,w,h"` in CSS px from the story's
 * area (or stage) box, under `rects` in its `data-evidence`. Names are the part's accessible
 * name (or its first class), numbered when repeated; the ring is `ring:…`, the hand `hand`.
 */
export function recordKeyRects(canvasElement: Element, rootSelector: string) {
  const root = canvasElement.querySelector(rootSelector);
  if (!root) return;
  const host =
    root.closest('.story-widget-area') ?? root.closest('.story-widget-stage') ?? canvasElement;
  const h = host.getBoundingClientRect();
  const rects: Record<string, string> = {};
  const seen = new Map<string, number>();
  for (const el of root.querySelectorAll(KEY_PARTS)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);
    let base = el.classList.contains('ni-hand') ? 'hand' : label || el.classList[0] || el.tagName;
    if (el.classList.contains('ni-invite')) base = `ring:${base}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    rects[n > 1 ? `${base}#${n}` : base] = [r.left - h.left, r.top - h.top, r.width, r.height]
      .map((v) => Math.round(v))
      .join(',');
  }
  recordEvidence(root, { rects });
}

/**
 * A story meta's `afterEach`: the area card is centred in the stage on both axes (#92's
 * `expectAreaCentred`), and the key rects of the widget under `rootSelector` are recorded.
 */
export const keyRectsAfterEach =
  (rootSelector: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expectAreaCentred(canvasElement);
    recordKeyRects(canvasElement, rootSelector);
  };

/** A rect as "W×H" (rounded CSS px), for evidence. */
export const sizeOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return `${Math.round(r.width)}x${Math.round(r.height)}`;
};

/**
 * How much of an area its widget's content uses (%): the union of `parts` against the area's box.
 * Records `fill_pct` and returns it.
 */
export function fillPercent(area: Element, parts: readonly Element[]): number {
  const rs = parts.map((p) => p.getBoundingClientRect());
  const w = Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left));
  const h = Math.max(...rs.map((r) => r.bottom)) - Math.min(...rs.map((r) => r.top));
  const a = area.getBoundingClientRect();
  const pct = Math.round(((w * h) / (a.width * a.height)) * 100);
  recordEvidence(area, { fill_pct: pct, content: `${Math.round(w)}x${Math.round(h)}` });
  console.info(`[fill] ${pct}% of the area (content ${Math.round(w)}x${Math.round(h)})`);
  return pct;
}

/**
 * Waits for the settled layout before measuring: fonts loaded, every finite animation and CSS
 * transition in the document finished (an outline colour fading, a card gliding), then two quiet
 * frames with no element resizing (ResizeObserver-driven layouts such as useAvailableSize).
 */
export async function settledLayout() {
  await document.fonts.ready;
  for (let round = 0; round < 5; round += 1) {
    const running = document
      .getAnimations()
      .filter(
        (a) =>
          a.playState === 'running' &&
          a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
      );
    if (running.length === 0) break;
    await Promise.all(running.map((a) => a.finished.catch(() => undefined)));
  }
  // Quiet: the widgets' layout is the same two frames apart (sizes measured by ResizeObserver
  // feed back into layouts, so wait until a round of them changes nothing).
  const snapshot = () =>
    [...document.querySelectorAll('.ni-widget, .ni-widget *')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
      })
      .join(';');
  for (let round = 0; round < 10; round += 1) {
    const before = snapshot();
    await frame();
    await frame();
    if (snapshot() === before) break;
  }
}

/**
 * The outermost box an element visibly paints: its border box, a visible outline, and any
 * outward (non-inset) box-shadow ring with its spread and blur. Gaps are measured from this.
 */
export function visibleBox(el: Element): Rect {
  const o = outlineBox(el);
  const cs = getComputedStyle(el);
  let grow = 0;
  if (cs.boxShadow && cs.boxShadow !== 'none') {
    // Each shadow: "<color> x y blur spread [inset]" (computed values list the colour first).
    for (const part of cs.boxShadow.split(/,(?![^(]*\))/)) {
      if (/inset/.test(part)) continue;
      if (/rgba\([^)]*,\s*0\)/.test(part)) continue;
      const nums = [...part.replace(/rgba?\([^)]*\)/, '').matchAll(/(-?[\d.]+)px/g)].map((m) =>
        Number(m[1]),
      );
      // A ring (spread > 0); an offset ledge (a card's base) is part of the object, not a ring.
      const [x = 0, y = 0, blur = 0, spread = 0] = nums;
      if (spread > 0) grow = Math.max(grow, spread + blur + Math.max(Math.abs(x), Math.abs(y)));
    }
  }
  const r = rectOf(el);
  return {
    left: Math.min(o.left, r.left - grow),
    top: Math.min(o.top, r.top - grow),
    right: Math.max(o.right, r.right + grow),
    bottom: Math.max(o.bottom, r.bottom + grow),
  };
}

/**
 * Records each group's measured CSS size (the smallest width × height in the group) and the
 * smallest edge-to-edge gap (between visible boxes: border, outline and ring) inside the group and to every other listed control, asserts them
 * (≥ the age mode's target size, ≥ 12 px apart), logs a one-line summary and returns it, e.g.
 * `keys 80×80 gap 12; check 120×80`.
 */
export async function expectControls(
  story: string,
  ageMode: AgeMode,
  groups: Record<string, readonly Element[]>,
): Promise<string> {
  await settledLayout();
  const min = MIN_TARGET_PX[ageMode];
  const all = Object.entries(groups).flatMap(([name, els]) => els.map((el) => ({ name, el })));
  const parts: string[] = [];
  for (const [name, els] of Object.entries(groups)) {
    await expect(els.length, `${story}: ${name} present`).toBeGreaterThan(0);
    const rects = els.map(rectOf);
    const w = Math.min(...rects.map((r) => r.right - r.left));
    const h = Math.min(...rects.map((r) => r.bottom - r.top));
    await expect(Math.round(w), `${story}: ${name} width`).toBeGreaterThanOrEqual(min);
    await expect(Math.round(h), `${story}: ${name} height`).toBeGreaterThanOrEqual(min);
    let gap = Number.POSITIVE_INFINITY;
    for (const el of els) {
      for (const other of all) {
        if (other.el === el) continue;
        gap = Math.min(gap, boxGap(visibleBox(el), visibleBox(other.el)));
      }
    }
    if (Number.isFinite(gap)) {
      await expect(gap, `${story}: ${name} gap to the next control`).toBeGreaterThanOrEqual(
        TARGET_GAP_PX - 0.5,
      );
    }
    parts.push(
      `${name} ${Math.round(w)}×${Math.round(h)}${Number.isFinite(gap) ? ` gap ${Math.round(gap)}` : ''}`,
    );
    const key = name.replace(/\W+/g, '_');
    recordEvidence(els[0] ?? null, {
      [key]: `${Math.round(w)}x${Math.round(h)}`,
      ...(Number.isFinite(gap) ? { [`${key}_gap`]: Math.round(gap) } : {}),
    });
  }
  const line = `${story}: ${parts.join('; ')}`;
  console.info(`[controls] ${line}`);
  return line;
}

/**
 * Exactly one invited control under `root` (one `.ni-invite`, one ring), and its ring (outline
 * box) is ≥ 12 px clear of every element in `clearOf` (neighbouring controls, frames) and
 * ≥ 12 px inside every element in `inside` (the tray or bin around it).
 */
export async function expectOneInviteRing(
  root: Element,
  { clearOf = [], inside = [] }: { clearOf?: readonly Element[]; inside?: readonly Element[] } = {},
): Promise<Element> {
  const rings = [...root.querySelectorAll('.ni-invite')];
  await expect(rings.length, 'one invited control').toBe(1);
  const ring = rings[0] as Element;
  const box = outlineBox(ring);
  for (const el of clearOf) {
    if (el === ring || ring.contains(el) || el.contains(ring)) continue;
    await expect(boxGap(box, outlineBox(el)), 'ring clear of a neighbour').toBeGreaterThanOrEqual(
      TARGET_GAP_PX - 0.5,
    );
  }
  for (const el of inside) {
    const c = rectOf(el);
    const inner = Math.min(
      box.left - c.left,
      box.top - c.top,
      c.right - box.right,
      c.bottom - box.bottom,
    );
    await expect(inner, 'ring clear of its frame').toBeGreaterThanOrEqual(TARGET_GAP_PX - 0.5);
  }
  return ring;
}

/** Every numeral matching `selector` under `root` renders at least `min` CSS px tall (its box). */
export async function expectRenderedNumerals(root: Element, selector: string, min = 32) {
  const els = [...root.querySelectorAll(selector)];
  await expect(els.length, `numerals (${selector})`).toBeGreaterThan(0);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    await expect(r.height, `"${el.textContent}" rendered height`).toBeGreaterThanOrEqual(min - 0.5);
  }
}

/**
 * Every numeral matching `selector` draws digits at least `min` CSS px tall as SEEN: the ink of
 * its glyphs (canvas text metrics in its own computed font, times the SVG scale on screen), not
 * the font size (a Baloo 2 digit is about 0.65 em tall). Returns the smallest ink height.
 */
export async function expectNumeralInk(root: Element, selector: string, min = 32) {
  await document.fonts.ready;
  const els = [...root.querySelectorAll(selector)];
  await expect(els.length, `numerals (${selector})`).toBeGreaterThan(0);
  const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  let least = Number.POSITIVE_INFINITY;
  for (const el of els) {
    const cs = getComputedStyle(el);
    const scale =
      el instanceof SVGGraphicsElement
        ? Math.hypot(el.getScreenCTM()?.a ?? 1, el.getScreenCTM()?.b ?? 0)
        : 1;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText(el.textContent ?? '');
    const ink = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) * scale;
    least = Math.min(least, ink);
    await expect(ink, `"${el.textContent}" digit ink height`).toBeGreaterThanOrEqual(min - 0.5);
  }
  return least;
}

/**
 * The guide's whole hand (its box, and where its tap bob takes it: 6 px left, 8 px down) touches no
 * control but the invited one: every element of `others` (neighbouring controls, frames that are
 * not the invited control's own container) is clear of it. Returns the smallest clearance (px).
 */
export async function expectHandTouchesOnlyInvited(
  root: Element,
  others: readonly Element[],
  {
    min = 0,
    inside = [],
  }: {
    /** The least clearance (px) to every other control. */
    min?: number;
    /** Frames the hand lies in (the invited control's tray): it stays `min` px inside them. */
    inside?: readonly Element[];
  } = {},
): Promise<number> {
  const hand = root.querySelector('.ni-hand') as HTMLElement | null;
  await expect(hand, 'the hand is shown').not.toBeNull();
  const loops = (hand as HTMLElement).getAnimations({ subtree: true });
  for (const a of loops) {
    a.pause();
    a.currentTime = 0;
  }
  try {
    const h = (hand as HTMLElement).getBoundingClientRect();
    const box = { left: h.left - 6, top: h.top, right: h.right, bottom: h.bottom + 8 };
    let least = Number.POSITIVE_INFINITY;
    for (const o of others) {
      const g = boxGap(box, visibleBox(o));
      least = Math.min(least, g);
      await expect(g, `hand clear of ${o.className || o.tagName}`).toBeGreaterThanOrEqual(min);
    }
    for (const frame of inside) {
      const f = frame.getBoundingClientRect();
      const cs = getComputedStyle(frame);
      const bw = Number.parseFloat(cs.borderTopWidth) || 0;
      const g = Math.min(
        box.left - (f.left + bw),
        box.top - (f.top + bw),
        f.right - bw - box.right,
        f.bottom - bw - box.bottom,
      );
      least = Math.min(least, g);
      await expect(g, `hand inside ${frame.className}, clear of its border`).toBeGreaterThanOrEqual(
        min,
      );
    }
    console.info(`[hand] clearance to the nearest other control: ${Math.round(least)} px`);
    recordEvidence(hand, { hand_clear: Math.round(least) });
    return least;
  } finally {
    for (const a of loops) a.play();
  }
}

/**
 * Ends a story on its settled picture: focus moved off (no focus ring left on a control after
 * keyboard moves) and transitions finished.
 */
export async function settleFocus() {
  (document.activeElement as HTMLElement | null)?.blur();
  await new Promise((r) => setTimeout(r, 300));
}

/** The WCAG contrast ratio of two computed colours ("rgb(…)" / "rgba(…)"). */
export function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r = 0, g = 0, bl = 0] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const ch = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `a` and `b` do not touch: at least `gap` CSS px apart, edge to edge. */
export async function expectApart(a: Element, b: Element, gap: number, what: string) {
  await expect(boxGap(rectOf(a), rectOf(b)), what).toBeGreaterThanOrEqual(gap - 0.5);
}

/** `el` is centred in `box` horizontally (left and right margins within `tolerance` px). */
export async function expectCentred(el: Element, box: Element, tolerance = 4) {
  const a = rectOf(el);
  const b = rectOf(box);
  await expect(Math.abs(a.left - b.left - (b.right - a.right)), 'centred').toBeLessThanOrEqual(
    tolerance,
  );
}
