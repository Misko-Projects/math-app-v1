// The live game data's island rings (05 §3) under the island fold (02 §4.3): the fold stops at the
// first ring whose rule fails, so the rings must open the same way whichever shared project the
// family builds first.

import type { AnyEventEnvelope } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { foldIsland } from '../src/folds/island';
import { fixtureGameData } from './fixture';
import { CHILD_1, envelope } from './support/events';

const game = fixtureGameData();
const PROJECTS = game.buildings.filter((b) => b.kind === 'project').map((b) => b.id);
const T0 = Date.UTC(2026, 10, 2, 16);

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) =>
    permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]),
  );
}

/** Rings open after each step: the buddy arrives, the road reaches `road`, then each project. */
function ringsAlong(order: readonly string[], road: number): number[] {
  const events: AnyEventEnvelope[] = [
    envelope(
      1,
      'resident.arrived',
      { residentId: 'nib', homeInstanceId: null, via: 'start' },
      T0,
      CHILD_1,
    ),
    envelope(2, 'road.extended', { to: road }, T0 + 1, CHILD_1),
  ];
  const out = [foldIsland(events, game).ringsUnlocked];
  order.forEach((id, i) => {
    events.push(
      envelope(
        10 + i,
        'building.placed',
        { instanceId: `p${i}`, buildingId: id, plot: [0, i] },
        T0 + 10 + i,
        CHILD_1,
      ),
    );
    out.push(foldIsland(events, game).ringsUnlocked);
  });
  return out;
}

describe('island rings (05 §3) open the same in every project order', () => {
  it('has the three shared projects', () => {
    expect(PROJECTS.sort()).toEqual(['east-bridge', 'festival-stage', 'lighthouse']);
  });
  it('every completion order unlocks the same rings at each step; each project grows the island', () => {
    const orders = permutations(PROJECTS);
    expect(orders).toHaveLength(6);
    const seen = orders.map((o) => ringsAlong(o, 20));
    for (const s of seen) expect(s).toEqual(seen[0]);
    const steps = seen[0] as number[];
    for (let i = 1; i < steps.length; i++)
      expect(steps[i], `after project ${i}`).toBeGreaterThan(steps[i - 1] as number);
    expect(steps.at(-1)).toBe(game.island.rings.length);
  });
  it('the road to 100 also opens the next ring, whatever is built', () => {
    const [roadOnly] = ringsAlong([], 100);
    const [projectsAt20] = ringsAlong([], 20);
    expect(roadOnly).toBe((projectsAt20 as number) + 1);
    for (const o of permutations(PROJECTS))
      expect(ringsAlong(o, 100).at(-1)).toBe(game.island.rings.length);
  });
});
