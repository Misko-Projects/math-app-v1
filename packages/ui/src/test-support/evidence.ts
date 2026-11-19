// Evidence-review helpers for story play functions (U05 #14, PR #88 evidence review): measured
// control sizes and gaps, one invite ring with clearance, numerals measured as rendered, and
// parts that must not touch.
import { expect } from 'storybook/test';
import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX } from '../tokens/tokens';

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

/**
 * Records each group's measured CSS size (the smallest width × height in the group) and the
 * smallest edge-to-edge gap inside the group and to every other listed control, asserts them
 * (≥ the age mode's target size, ≥ 12 px apart), logs a one-line summary and returns it, e.g.
 * `keys 80×80 gap 12; check 120×80`.
 */
export async function expectControls(
  story: string,
  ageMode: AgeMode,
  groups: Record<string, readonly Element[]>,
): Promise<string> {
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
        gap = Math.min(gap, boxGap(rectOf(el), rectOf(other.el)));
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
