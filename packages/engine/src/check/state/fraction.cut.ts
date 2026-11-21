// fraction.cut `{ parts, shade, acceptNonCongruent }` (03 §5.5 fraction-cut). K01 response shape
// (engine README): `{ regions: number[], shaded: number[] }`, where `regions` lists each cut
// region's share of the whole shape's area (in any order, summing to 1) and `shaded` the indices of
// the shaded regions. Correct when there are exactly `parts` regions, each within
// FRACTION_AREA_TOLERANCE (3% of the whole area) of 1/parts, and exactly `shade` distinct regions
// are shaded (any of them: shading the first or the last part is the same answer). The response
// carries areas only, so `acceptNonCongruent` (equal areas of different shapes, FRA.14, FRA.16) is
// a widget rule: guided cuts are always congruent. `thenName` adds `name: [a, b]`, which must equal
// `[shade, parts]` when the target asks for it.
import { nums, type StateChecker } from './types';

/** Each region may differ from 1/parts by this share of the whole area (03 §5.5: ±3%). */
export const FRACTION_AREA_TOLERANCE = 0.03;

/** Whether every region is within the tolerance of an equal share. */
export function equalRegions(regions: readonly number[], parts: number): boolean {
  return regions.every((r) => Math.abs(r - 1 / parts) <= FRACTION_AREA_TOLERANCE + 1e-9);
}

/** The regions cover the whole shape once (shares sum to 1, none empty). */
export function coversWhole(regions: readonly number[]): boolean {
  const sum = regions.reduce((a, b) => a + b, 0);
  return regions.every((r) => r > 0) && Math.abs(sum - 1) <= 0.01;
}

export const fractionCut: StateChecker = {
  id: 'fraction.cut',
  check(target, value) {
    const parts = target.parts;
    const shade = typeof target.shade === 'number' ? target.shade : 0;
    const regions = nums(value.regions);
    const shaded = nums(value.shaded) ?? [];
    if (typeof parts !== 'number' || !regions) return false;
    if (regions.length !== parts || !coversWhole(regions) || !equalRegions(regions, parts)) {
      return false;
    }
    if (!shaded.every((i) => Number.isInteger(i) && i >= 0 && i < parts)) return false;
    if (new Set(shaded).size !== shaded.length || shaded.length !== shade) return false;
    if (target.thenName === true) {
      const name = nums(value.name);
      return name !== undefined && name.length === 2 && name[0] === shade && name[1] === parts;
    }
    return true;
  },
  // Shading another region (same count) is the same answer.
  exempt: (target, original, mutated) => {
    const a = nums(original.shaded) ?? [];
    const b = nums(mutated.shaded) ?? [];
    return (
      a.length === b.length &&
      JSON.stringify(original.regions) === JSON.stringify(mutated.regions) &&
      fractionCut.check(target, mutated)
    );
  },
};
