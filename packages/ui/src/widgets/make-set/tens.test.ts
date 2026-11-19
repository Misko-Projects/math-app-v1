import { describe, expect, it } from 'vitest';
import { besideFrame, pageAfter, shownPage, type TenPage } from './tens';

/** Runs counts through pageAfter from an empty container; returns the page after each. */
function pages(counts: number[], start: TenPage = 0): TenPage[] {
  let page = start;
  let before = 0;
  return counts.map((after) => {
    page = pageAfter(page, before, after);
    before = after;
    return page;
  });
}

describe('one ten-frame at a time', () => {
  it('shows the first frame under ten', () => {
    expect(pages([1, 2, 5, 9])).toEqual([0, 0, 0, 0]);
    expect(besideFrame(0, 9)).toBeNull();
  });

  it('ties the first ten when it fills, and keeps filling the ones', () => {
    expect(pages([8, 9, 10, 11, 14])).toEqual([0, 0, 1, 1, 1]);
    expect(besideFrame(1, 10)).toBe('bundle');
    expect(besideFrame(1, 14)).toBe('bundle');
  });

  it('starts on the ones when the container starts with a full ten', () => {
    expect(pageAfter(0, 0, 12)).toBe(1);
  });

  it('keeps the ten tied while ones are taken out, and unties it under ten', () => {
    expect(pageAfter(1, 14, 13)).toBe(1);
    expect(pageAfter(1, 11, 10)).toBe(1);
    expect(pageAfter(1, 10, 9)).toBe(0);
  });

  it('after untying (page 0), taking out keeps the ten in view; putting in ties it again', () => {
    expect(pageAfter(0, 14, 13)).toBe(0);
    expect(besideFrame(0, 13)).toBe('ones');
    expect(besideFrame(0, 10)).toBe('ones');
    expect(pageAfter(0, 10, 11)).toBe(1);
    expect(pageAfter(0, 13, 14)).toBe(1);
  });

  it('never shows the ones page without a full ten', () => {
    expect(shownPage(1, 9)).toBe(0);
    expect(shownPage(1, 10)).toBe(1);
    expect(shownPage(0, 15)).toBe(0);
  });
});
