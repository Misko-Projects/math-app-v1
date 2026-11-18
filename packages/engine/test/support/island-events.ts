// Test support: random island, inventory, collection and goal events over the fixture GameData,
// for the projection property tests. Small id pools make collisions (re-placements, moves after
// removal, upgrades before placement, gifts opened before left) frequent.

import type { AnyEventEnvelope, GameData } from '@number-island/shared';
import type { Rng } from '../../src/rng';
import { CHILD_1, CHILD_2, DEVICE, envelope, eventId, FAMILY } from './events';

const instance = (rng: Rng) => `i${rng.int(1, 6)}`;
const decorInstance = (rng: Rng) => `d${rng.int(1, 6)}`;
const plot = (rng: Rng): [number, number] => [rng.int(0, 11), rng.int(0, 7)];

export function randomIslandEvent(
  gameData: GameData,
  rng: Rng,
  n: number,
  ts: number,
): AnyEventEnvelope {
  const child = rng.pick([CHILD_1, CHILD_1, CHILD_2, null]);
  const material = () => rng.pick(gameData.materials).id;
  const recipe = () => ({ [material()]: rng.int(0, 8), [material()]: rng.int(1, 5) });
  const week = () => rng.pick(['2026-11-02', '2026-11-09', '2026-11-16']);
  switch (rng.int(0, 21)) {
    case 0:
    case 1:
    case 2:
      return envelope(
        n,
        'material.produced',
        { sessionId: 's1', requestId: 'r1', workshopId: 'road-crew', materials: recipe() },
        ts,
        child,
      );
    case 3:
    case 4:
      return envelope(
        n,
        'material.spent',
        {
          materials: recipe(),
          purpose: rng.bool(0.5)
            ? { kind: 'project', ref: 'lighthouse' }
            : { kind: rng.pick(['build', 'upgrade', 'decor'] as const), ref: instance(rng) },
        },
        ts,
        child,
      );
    case 5:
    case 6:
      return envelope(
        n,
        'building.placed',
        { instanceId: instance(rng), buildingId: rng.pick(gameData.buildings).id, plot: plot(rng) },
        ts,
        child,
      );
    case 7:
      return envelope(
        n,
        'building.upgraded',
        { instanceId: instance(rng), level: rng.pick([2, 3] as const) },
        ts,
        child,
      );
    case 8:
      return envelope(
        n,
        'decor.placed',
        { instanceId: decorInstance(rng), decorId: rng.pick(gameData.decor).id, pos: plot(rng) },
        ts,
        child,
      );
    case 9:
      return envelope(
        n,
        'decor.moved',
        { instanceId: decorInstance(rng), pos: plot(rng) },
        ts,
        child,
      );
    case 10:
      return envelope(n, 'decor.removed', { instanceId: decorInstance(rng) }, ts, child);
    case 11:
      return envelope(n, 'road.extended', { to: rng.int(1, 40) }, ts, child);
    case 12:
      return envelope(
        n,
        'island.named',
        { name: rng.pick(['Shell', 'Coral', 'Pebble']) },
        ts,
        child,
      );
    case 13: {
      const r = rng.pick(gameData.residents);
      return envelope(
        n,
        'resident.arrived',
        {
          residentId: r.id,
          homeInstanceId: rng.bool(0.5) ? instance(rng) : null,
          via: r.arrival.via,
        },
        ts,
        child,
      );
    }
    case 14:
      return envelope(
        n,
        'collection.unlocked',
        rng.pick([
          {
            kind: 'badge' as const,
            id: rng.pick(['CNT.01', 'CNT.02', 'CPS.01', 'ADD.01', 'SUB.01', 'CPS.03']),
          },
          { kind: 'decor' as const, id: rng.pick(gameData.decor).id },
          { kind: 'outfit' as const, id: 'hat-captain' },
          { kind: 'resident' as const, id: rng.pick(gameData.residents).id },
        ]),
        ts,
        child,
      );
    case 15:
      return envelope(
        n,
        'session.started',
        { sessionId: `s${n}`, budgetMinutes: 10, trigger: 'child' },
        ts,
        child,
      );
    case 16:
      return rng.bool(0.5)
        ? envelope(
            n,
            'festival.started',
            { festivalId: 'lantern-night', kind: 'festival' },
            ts,
            null,
          )
        : envelope(
            n,
            'festival.completed',
            { festivalId: 'lantern-night', rewardDecor: ['lantern-string'] },
            ts,
            null,
          );
    case 17: {
      const giftId = `g${rng.int(1, 4)}`;
      return rng.bool(0.5)
        ? envelope(
            n,
            'gift.left',
            {
              giftId,
              toChildId: CHILD_1,
              decorId: rng.bool(0.7) ? 'shell-bench' : null,
              message: null,
            },
            ts,
            null,
          )
        : envelope(n, 'gift.opened', { giftId }, ts, child);
    }
    case 18: {
      const milestoneId = `m${rng.int(1, 3)}`;
      return rng.bool(0.5)
        ? envelope(
            n,
            'milestone.defined',
            {
              milestoneId,
              label: rng.pick(['Pancakes', 'Zoo']),
              trigger: { building: 'lighthouse' },
            },
            ts,
            null,
          )
        : envelope(n, 'milestone.reached', { milestoneId }, ts, null);
    }
    case 19:
    case 20:
      return envelope(
        n,
        'goal.progress',
        { weekStart: week(), delta: 1, requestId: `r${n}` },
        ts,
        child,
      );
    default:
      return {
        id: eventId(n),
        familyId: FAMILY,
        childId: child,
        deviceId: DEVICE,
        ts,
        type: 'future.island-thing',
        v: 1,
        payload: { x: 1 },
        contentVersion: 'fixture',
      };
  }
}
