// 03 §5.7 state checkers: one per `StateCheckerId`, in packages/engine/src/check/state/<id>.ts.
// A checker accepts ANY end state that satisfies it (state equivalence, 03 §5.5).

import type { StateCheckerId } from '@number-island/shared';

export interface StateChecker {
  id: StateCheckerId;
  check(
    target: Readonly<Record<string, unknown>>,
    value: Readonly<Record<string, unknown>>,
  ): boolean;
  /**
   * Near-miss exemption (03 §9.4 step 5): true when a mutated end state is a legitimate alternative
   * that the checker rightly accepts (for example, moving one counter from one part to the other
   * in a free split). The property test skips those mutations instead of expecting a rejection.
   */
  exempt?(
    target: Readonly<Record<string, unknown>>,
    original: Readonly<Record<string, unknown>>,
    mutated: Readonly<Record<string, unknown>>,
  ): boolean;
}

export const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export const nums = (v: unknown): number[] | undefined =>
  Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? (v as number[])
    : undefined;

export const grid = (v: unknown): number[][] | undefined =>
  Array.isArray(v) && v.every((f) => nums(f) !== undefined) ? (v as number[][]) : undefined;

/** Ten-frame cells: every entry is 0 (empty), 1 (colour a) or 2 (colour b). */
export const cellGrid = (v: unknown): number[][] | undefined => {
  const g = grid(v);
  return g?.every((f) => f.every((x) => x === 0 || x === 1 || x === 2)) ? g : undefined;
};

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * A mutation that only moves pieces between the parts of a state (same total, nothing negative,
 * the entered value unchanged). Checkers that accept any distribution use this as their near-miss
 * exemption (03 §9.4 step 5).
 */
export function isMoveOnly(
  original: Readonly<Record<string, unknown>>,
  mutated: Readonly<Record<string, unknown>>,
): boolean {
  if (num(original.value) !== num(mutated.value)) return false;
  if (num(original.count) !== num(mutated.count)) return false;
  const a = partsOf(original);
  const b = partsOf(mutated);
  if (a && b) return b.every((x) => x >= 0) && sum(a) === sum(b);
  return a === undefined && b === undefined && num(original.count) !== undefined;
}

/** `value` must equal `target.value` when the target asks for one (thenAsk). */
export function askedValueOk(
  target: Readonly<Record<string, unknown>>,
  value: Readonly<Record<string, unknown>>,
): boolean {
  if (target.value === undefined) return true;
  return num(value.value) === num(target.value);
}

/**
 * The two parts a state shows, whatever the format: explicit `parts` (make-set, number-bond),
 * ten-frame `cells` (with two frames, the counters in each frame; with one frame, the colour-a
 * and colour-b counts), or rekenrek `rows`.
 */
export function partsOf(value: Readonly<Record<string, unknown>>): number[] | undefined {
  const parts = nums(value.parts);
  if (parts) return parts;
  const cells = grid(value.cells);
  if (cells) {
    // Two frames: one part per frame (how the ten-frame shows a split). One frame: the two colours.
    if (cells.length === 2) return cells.map((f) => f.filter((x) => x !== 0).length);
    const flat = cells.flat();
    return [flat.filter((x) => x === 1).length, flat.filter((x) => x === 2).length];
  }
  return nums(value.rows);
}
