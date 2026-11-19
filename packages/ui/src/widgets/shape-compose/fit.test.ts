// Fill-outline snapping: pieces only go where they lie inside the outline without overlapping,
// and filling by fits always passes the engine's compose.fill checker.
import { stateChecker, type Vec } from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { fits, nearestFit } from './fit';

const H = Math.sqrt(3) / 2;
const rhombus: Vec[] = [
  [0, 0],
  [1, 0],
  [1.5, H],
  [0.5, H],
];
const hexagon: Vec[] = [
  [0, 0],
  [1, 0],
  [1.5, H],
  [1, 2 * H],
  [0, 2 * H],
  [-0.5, H],
];

describe('fill-outline fits', () => {
  it('a triangle fits the rhombus only unturned at the left or turned 60° at the right', () => {
    const plain = fits(rhombus, [], 'triangle', 0);
    expect(plain.map((f) => f.at)).toEqual([[0, 0]]);
    const turned = fits(rhombus, [], 'triangle', 60);
    expect(turned.map((f) => f.at)).toEqual([[1, 0]]);
    // A square never fits inside the rhombus.
    expect(fits(rhombus, [], 'square', 0)).toEqual([]);
  });

  it('a placed piece blocks its space; the rest still fits', () => {
    const placed = [{ kind: 'triangle', at: [0, 0] as Vec, rot: 0 }];
    expect(fits(rhombus, placed, 'triangle', 0)).toEqual([]);
    const second = fits(rhombus, placed, 'triangle', 60);
    expect(second).toHaveLength(1);
    const r = {
      pieces: [...placed, { kind: 'triangle', at: second[0]?.at, rot: 60 }],
    };
    expect(
      stateChecker('compose.fill')?.check(
        { outline: rhombus, pieces: [{ kind: 'triangle', count: 2 }] },
        r,
      ),
    ).toBe(true);
  });

  it('filling a hexagon greedily with trapezoids by fits passes compose.fill', () => {
    const placed: { kind: string; at: Vec; rot: number }[] = [];
    for (const rot of [0, 180]) {
      const f = fits(hexagon, placed, 'trapezoid', rot)[0];
      expect(f).toBeDefined();
      placed.push({ kind: 'trapezoid', at: (f as { at: Vec }).at, rot });
    }
    expect(
      stateChecker('compose.fill')?.check(
        { outline: hexagon, pieces: [{ kind: 'trapezoid', count: 2 }] },
        { pieces: placed },
      ),
    ).toBe(true);
  });

  it('nearestFit picks the closest centre within reach', () => {
    const f = fits(rhombus, [], 'triangle', 60);
    expect(nearestFit(f, [1.1, 0.5], 0.8)?.at).toEqual([1, 0]);
    expect(nearestFit(f, [5, 5], 0.8)).toBeNull();
  });
});
