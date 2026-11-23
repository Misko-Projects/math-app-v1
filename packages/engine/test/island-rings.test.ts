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
        // Three plots apart: no footprint is wider, and buildings never share a plot.
        { instanceId: `p${i}`, buildingId: id, plot: [3 * i, 0] },
        T0 + 10 + i,
        CHILD_1,
      ),
    );
    out.push(foldIsland(events, game).ringsUnlocked);
  });
  return out;
}

describe('the first home (05 §10 step 5)', () => {
  it('fits on the sandbar off the whole road, and its resident opens the first shore', () => {
    const { rings, road } = game.island;
    const key = ([x, y]: readonly number[]) => `${x},${y}`;
    const roadPlots = new Set(road.map((s) => key(s.plot)));
    const sandbar = new Set((rings[0]?.plots ?? []).map(key));
    expect(foldIsland([], game).ringsUnlocked).toBe(1);
    // Every home a family can build before anyone moves in: the first build is one of them.
    const homes = game.buildings.filter((b) => b.kind === 'home' && 'start' in b.unlock);
    expect(homes.length).toBeGreaterThan(0);
    for (const home of homes) {
      const [w, h] = home.footprint;
      const covers = ([x = 0, y = 0]: readonly number[]) =>
        Array.from({ length: w * h }, (_, i) => key([x + (i % w), y + Math.floor(i / w)]));
      // Off every plot the road will ever use, not just the stones laid so far.
      const plot = rings[0]?.plots.find((p) =>
        covers(p).every((c) => sandbar.has(c) && !roadPlots.has(c)),
      );
      expect(plot, `${home.id} has a road-free plot on the sandbar`).toBeDefined();
      const resident = home.levels[0]?.unlocks.find((u) => u.startsWith('resident:'));
      expect(resident, `${home.id} level 1 brings a resident`).toBeDefined();
      const events: AnyEventEnvelope[] = [
        envelope(
          1,
          'building.placed',
          { instanceId: 'home-1', buildingId: home.id, plot: plot ?? [0, 0] },
          T0,
          CHILD_1,
        ),
      ];
      expect(foldIsland(events, game).ringsUnlocked, `${home.id} placed`).toBe(1);
      events.push(
        envelope(
          2,
          'resident.arrived',
          {
            residentId: (resident ?? '').slice('resident:'.length),
            homeInstanceId: 'home-1',
            via: 'home',
          },
          T0 + 1,
          CHILD_1,
        ),
      );
      expect(foldIsland(events, game).ringsUnlocked, `${home.id}'s resident moved in`).toBe(2);
    }
  });
});

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
