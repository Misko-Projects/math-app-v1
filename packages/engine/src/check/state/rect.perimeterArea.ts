// rect.perimeterArea `{ perimeter?, area?, differentFrom? }` (03 §5.5 perimeter-walk, design mode;
// MEA.14). Response `{ w, h }`: the rectangle the child built, its side lengths in grid units.
// Correct when w and h are whole numbers ≥ 1, the perimeter 2 × (w + h) equals `perimeter` (when
// given), the area w × h equals `area` (when given), and the rectangle is not `differentFrom`
// (`{ w, h }`, in either orientation: a turned rectangle is the same one). With the same area, a
// different rectangle always has a different perimeter (and the other way round), so "same area,
// different perimeter" is `{ area, differentFrom }`. At least one of `perimeter` and `area` is
// required. Any rectangle meeting them is correct (state equivalence).
import { num, type StateChecker } from './types';

export interface RectSize {
  w: number;
  h: number;
}

const size = (v: unknown): RectSize | undefined => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const r = v as Record<string, unknown>;
  const w = num(r.w);
  const h = num(r.h);
  return w === undefined || h === undefined ? undefined : { w, h };
};

/** Whether two rectangles are the same up to turning. */
export const sameRect = (a: RectSize, b: RectSize): boolean =>
  (a.w === b.w && a.h === b.h) || (a.w === b.h && a.h === b.w);

export function meetsPerimeterArea(
  target: Readonly<Record<string, unknown>>,
  rect: RectSize,
): boolean {
  const perimeter = num(target.perimeter);
  const area = num(target.area);
  if (perimeter === undefined && area === undefined) return false;
  const { w, h } = rect;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) return false;
  if (perimeter !== undefined && 2 * (w + h) !== perimeter) return false;
  if (area !== undefined && w * h !== area) return false;
  if (target.differentFrom !== undefined) {
    const other = size(target.differentFrom);
    if (!other || sameRect(rect, other)) return false;
  }
  return true;
}

export const rectPerimeterArea: StateChecker = {
  id: 'rect.perimeterArea',
  check(target, value) {
    const rect = size(value);
    return rect !== undefined && meetsPerimeterArea(target, rect);
  },
  // A turned rectangle (w and h swapped) is the same answer, so that mutation stays correct.
  exempt(target, original, mutated) {
    const a = size(original);
    const b = size(mutated);
    return a !== undefined && b !== undefined && sameRect(a, b) && meetsPerimeterArea(target, b);
  },
};
