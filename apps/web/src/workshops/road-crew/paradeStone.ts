// The road stone of Road Crew's parade (05 §4 W1: "the road physically extends"). Framework-free.
//
// A request that made at least one stone lays the road's next stone with one of them, through
// the island's own action (`layNextStone`: `road.extended { to }`, then `material.spent` of one
// stone), so the road is paid for the same way wherever it is laid. The request's other stones
// stay in the Storehouse, where building needs them. When no stone can be laid (the road is
// complete, or its next stone lies on land that is not open yet), every stone stays there.

import type { ChildId, GameData, Recipe } from '@number-island/shared';
import type { DataStore } from '@/data/store';
import { layNextStone } from '@/island/building/actions';
import { ROAD_MATERIAL } from '@/island/building/rules';

/** How many road stones a request made. */
export const stonesMade = (materials: Recipe): number => materials[ROAD_MATERIAL] ?? 0;

/**
 * Lays the next road stone for a request that made `materials` (already in the Storehouse:
 * `material.produced`). Returns the stone's number, or null when none was laid.
 */
export async function layParadeStone(
  store: Pick<DataStore, 'append' | 'island' | 'inventory'>,
  childId: ChildId,
  gameData: Pick<GameData, 'island' | 'residents'>,
  materials: Recipe,
): Promise<number | null> {
  if (stonesMade(materials) < 1) return null;
  const laid = await layNextStone(store, childId, gameData);
  return laid.ok ? laid.to : null;
}
