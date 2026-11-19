import { expect } from 'storybook/test';

// Story-only layout checks shared by the Materials, Decor and Effects galleries (not exported).

/** 06 §4 layouts never scroll sideways. */
export async function expectNoSidewaysScroll() {
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
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

/** Every art root inside a cell stays inside its cell (nothing clipped into a neighbour). */
export async function expectArtInsideCells(root: HTMLElement, art = 'svg[role="img"]') {
  for (const cell of root.querySelectorAll<HTMLElement>('[data-cell]')) {
    const c = cell.getBoundingClientRect();
    for (const svg of cell.querySelectorAll<SVGSVGElement>(art)) {
      const r = svg.getBoundingClientRect();
      await expect(r.left, `${cell.dataset.cell} left`).toBeGreaterThanOrEqual(c.left - 1);
      await expect(r.right, `${cell.dataset.cell} right`).toBeLessThanOrEqual(c.right + 1);
    }
  }
}

/** No idle loop or effect is running forever (06 §7 reduced motion). */
export function infiniteAnimations(): Animation[] {
  return document
    .getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
}
