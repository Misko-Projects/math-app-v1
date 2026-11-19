import { expect } from 'storybook/test';

// Story-only layout checks shared by the Materials, Decor and Effects galleries (not exported).

/**
 * The galleries' target screen, a 1280 × 800 tablet. Every Materials, Decor and Effects story is
 * exactly one screen there (and at 1440 × 900), with no scrolling: a page lays out in GALLERY_ROOM,
 * the screen less the story stage's 40 px padding. Story tests run at this viewport.
 */
export const GALLERY_VIEWPORT = {
  parameters: {
    viewport: {
      options: {
        tablet: {
          name: 'Tablet 1280 × 800',
          styles: { width: '1280px', height: '800px' },
          type: 'tablet',
        },
      },
    },
  },
  globals: { viewport: { value: 'tablet', isRotated: false } },
};

/** The room a gallery page lays out in: the tablet screen less the stage's 40 px padding. */
export const GALLERY_ROOM = { w: 1200, h: 720 } as const;

/** 06 §4 layouts never scroll sideways. */
export async function expectNoSidewaysScroll() {
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
}

/** The story is exactly one screen: no page scroll either way. */
export async function expectOneScreen() {
  const doc = document.documentElement;
  await expect(doc.scrollWidth, 'no sideways scroll').toBeLessThanOrEqual(window.innerWidth);
  await expect(doc.scrollHeight, 'no page scroll').toBeLessThanOrEqual(window.innerHeight);
}

/** No two gallery cells overlap (each `[data-cell]` box is disjoint, 1 px tolerance). */
export async function expectCellsApart(root: HTMLElement, selector = '[data-cell]') {
  const boxes = [...root.querySelectorAll<HTMLElement>(selector)].map((c) => ({
    name: c.dataset.cell ?? '',
    r: c.getBoundingClientRect(),
  }));
  await expect(boxes.length).toBeGreaterThan(0);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = (boxes[i] as (typeof boxes)[number]).r;
      const b = (boxes[j] as (typeof boxes)[number]).r;
      const overlap =
        a.left < b.right - 1 &&
        b.left < a.right - 1 &&
        a.top < b.bottom - 1 &&
        b.top < a.bottom - 1;
      await expect(overlap, `${boxes[i]?.name} overlaps ${boxes[j]?.name}`).toBe(false);
    }
  }
}

/**
 * Every art root inside a cell, and every shape it draws, stays inside its cell on all four sides
 * (nothing clipped by the card, nothing spilling onto a neighbour).
 */
export async function expectArtInsideCells(root: HTMLElement, art = 'svg[role="img"]') {
  const problems: string[] = [];
  const cells = [...root.querySelectorAll<HTMLElement>('[data-cell]')];
  await expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) {
    const c = cell.getBoundingClientRect();
    for (const svg of cell.querySelectorAll<SVGSVGElement>(art)) {
      for (const el of [svg, ...svg.children]) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const name = `${cell.dataset.cell} ${el === svg ? 'box' : 'drawing'}`;
        if (r.left < c.left - 1) problems.push(`${name} spills left`);
        if (r.right > c.right + 1) problems.push(`${name} spills right`);
        if (r.top < c.top - 1) problems.push(`${name} spills above`);
        if (r.bottom > c.bottom + 1) problems.push(`${name} spills below`);
      }
    }
  }
  await expect([...new Set(problems)]).toEqual([]);
}

/** No idle loop or effect is running forever (06 §7 reduced motion). */
export function infiniteAnimations(): Animation[] {
  return document
    .getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
}
