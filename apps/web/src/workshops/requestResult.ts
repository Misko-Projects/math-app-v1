// What a finished request brings back to the island (`island/hub.tsx`). Framework-free.
//
// The materials are what reached the Storehouse: a request whose workshop laid a road stone with
// one of its own (Road Crew's parade) brought one stone less than it made, and the island counts
// on to that stone instead.

import type { DecorId, Recipe } from '@number-island/shared';
import { ROAD_MATERIAL, ROAD_STONE_COST } from '@/island/building/rules';
import type { RequestResult } from '@/island/hub';

export function requestResult(
  requestId: string,
  made: Recipe,
  decor: DecorId[],
  /** The number of the road stone the request laid, or null. */
  laid: number | null,
): RequestResult {
  if (laid === null) return { requestId, materials: made, decor };
  const { [ROAD_MATERIAL]: stones = 0, ...others } = made;
  const left = stones - ROAD_STONE_COST;
  return {
    requestId,
    materials: left > 0 ? { ...others, [ROAD_MATERIAL]: left } : others,
    decor,
    road: laid,
  };
}
