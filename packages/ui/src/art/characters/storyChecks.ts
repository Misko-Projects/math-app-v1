import { expect } from 'storybook/test';

// Play-function checks shared by the character stories (stories only, not exported).

/** Lit pebbles inside an element. */
export function litCount(el: Element): number {
  return el.querySelectorAll('[data-pebble="lit"]').length;
}

/**
 * How many ten-frames a Pebbling with number `n` shows: one for a single critter (0–10), one per
 * Ten Turtle plus one for a friend carrying the ones, and always ten for the Hundred Whale.
 */
export function expectedFrames(n: number, family: string | undefined): number {
  if (family === 'hundreds') return 10;
  if (family === 'tens') return Math.max(1, Math.floor(n / 10) + (n % 10 > 0 ? 1 : 0));
  return 1;
}

/** Every Pebbling in the canvas shows exactly its number as lit pebbles (0–20 and tens families). */
export async function expectLitMatchesNumber(root: HTMLElement) {
  const all = [...root.querySelectorAll<SVGSVGElement>('svg[data-pebbling]')];
  await expect(all.length).toBeGreaterThan(0);
  for (const svg of all) {
    const family = svg.dataset.family;
    if (family && family !== 'tens' && family !== 'hundreds') continue;
    const n = Number(svg.dataset.number);
    const where = `${svg.dataset.pebbling} ${n}`;
    await expect(litCount(svg), where).toBe(n);
    // The right number of ten-frames (a zero still shows its one empty frame), each with ten
    // sockets, so a frame that goes missing can't pass as "nothing lit" (review s_eab7ff900e77 #6).
    const frames = [...svg.querySelectorAll('[data-part="ten-frame"]')];
    await expect(frames.length, `${where} frames`).toBe(expectedFrames(n, family));
    for (const f of frames)
      await expect(f.querySelectorAll('[data-pebble]').length, where).toBe(10);
    if (family === 'tens' && n > 10 && n < 20) {
      const ten = svg.querySelector('[data-role="ten"]') as Element;
      const ones = svg.querySelector('[data-role="ones"]') as Element;
      await expect(litCount(ten)).toBe(10);
      await expect(litCount(ones)).toBe(n - 10);
    }
  }
  await expectTenMarksOnlyOnTenTurtles(root);
}

/**
 * The Ten Turtle is the in-world ten (05 §5), so it must never be mistaken for a plain turtle: every
 * Ten Turtle in a tens family wears the ten-mark (golden rim and star), and no other critter does.
 */
export async function expectTenMarksOnlyOnTenTurtles(root: HTMLElement) {
  for (const ten of root.querySelectorAll('[data-role="ten"]')) {
    await expect(ten.querySelectorAll('[data-part="ten-mark"]').length, 'Ten Turtle mark').toBe(1);
  }
  for (const critter of root.querySelectorAll('[data-critter]:not([data-role="ten"])')) {
    const where = `${critter.getAttribute('data-critter')} (not a Ten Turtle)`;
    await expect(critter.querySelector('[data-part="ten-mark"]'), where).toBeNull();
  }
}

/** A ten-frame fills its top row left → right before the bottom row. */
export async function expectTopRowFirst(root: HTMLElement) {
  for (const frame of root.querySelectorAll<SVGGElement>('[data-part="ten-frame"]')) {
    const marks = [...frame.querySelectorAll<SVGGraphicsElement>('[data-pebble]')].map((m) => ({
      lit: m.dataset.pebble === 'lit',
      box: m.getBoundingClientRect(),
    }));
    const lit = marks.filter((m) => m.lit);
    const empty = marks.filter((m) => !m.lit);
    const top = Math.min(...marks.map((m) => m.box.top));
    const isTop = (b: DOMRect) => Math.abs(b.top - top) < b.height / 2;
    if (lit.length > 0 && lit.length < 5) {
      await expect(lit.every((m) => isTop(m.box))).toBe(true);
      // Left to right: every lit mark is left of every empty one in the top row.
      const maxLit = Math.max(...lit.map((m) => m.box.left));
      const topEmpty = empty.filter((m) => isTop(m.box));
      await expect(topEmpty.every((m) => m.box.left > maxLit)).toBe(true);
    }
    if (lit.length >= 5) {
      await expect(marks.filter((m) => isTop(m.box)).every((m) => m.lit)).toBe(true);
    }
  }
}

/** Art cells in a sheet never overlap each other. */
export async function expectCellsApart(root: HTMLElement, selector = 'figure.story-cell > svg') {
  const boxes = [...root.querySelectorAll(selector)].map((s) => s.getBoundingClientRect());
  await expect(boxes.length).toBeGreaterThan(0);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i] as DOMRect;
      const b = boxes[j] as DOMRect;
      const overlap =
        a.left < b.right - 1 &&
        b.left < a.right - 1 &&
        a.top < b.bottom - 1 &&
        b.top < a.bottom - 1;
      await expect(overlap, `cells ${i} and ${j} overlap`).toBe(false);
    }
  }
}

/**
 * Every visible shape of each character stays inside its own picture (so nothing is clipped by, or
 * spills into, a neighbouring cell). Invisible helper shapes (fill and stroke both none) are skipped.
 */
export async function expectArtInsideBox(root: HTMLElement, selector: string, slack = 2) {
  for (const svg of root.querySelectorAll<SVGSVGElement>(selector)) {
    const box = svg.getBoundingClientRect();
    for (const el of svg.querySelectorAll<SVGGraphicsElement>(
      'path, circle, ellipse, rect, text',
    )) {
      if (el.getAttribute('fill') === 'none' && !el.getAttribute('stroke')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const inside =
        r.left >= box.left - slack &&
        r.right <= box.right + slack &&
        r.top >= box.top - slack &&
        r.bottom <= box.bottom + slack;
      await expect(inside, `${svg.getAttribute('aria-label')}: a shape leaves the picture`).toBe(
        true,
      );
    }
  }
}

/** Captions of cells on the same grid row share one baseline. */
export async function expectCaptionsAligned(root: HTMLElement) {
  const caps = [...root.querySelectorAll('figure.story-cell > figcaption')].map((c) =>
    c.getBoundingClientRect(),
  );
  for (let i = 1; i < caps.length; i++) {
    const a = caps[i - 1] as DOMRect;
    const b = caps[i] as DOMRect;
    if (b.left > a.left) await expect(Math.abs(a.bottom - b.bottom)).toBeLessThanOrEqual(1);
  }
}

export async function expectNoSidewaysScroll() {
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
}

/** 06 §7: with reduced motion no infinite animation runs anywhere on the page. */
export async function expectNoLoops() {
  const running = document
    .getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
  await expect(running.length).toBe(0);
}

/** With motion allowed, idle loops do run (so the reduced-motion check is meaningful). */
export async function expectSomeLoops() {
  const running = document
    .getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
  await expect(running.length).toBeGreaterThan(0);
}
