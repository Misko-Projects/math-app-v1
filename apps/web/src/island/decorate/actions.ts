// What decorate mode writes (02 §5.2: `decor.placed`, `decor.moved`, `decor.removed`). Each
// action reads the island and the collection as they are, so it never places a piece the family
// does not own or one on plots that were taken meanwhile: such a tap is `stale` and writes nothing.

import type { ChildId, GameData, Plot } from '@number-island/shared';
import type { DataStore } from '@/data/store';
import { decorAnchors, decorItems } from './rules';

type Store = Pick<DataStore, 'island' | 'collection' | 'append'>;
type Data = Pick<GameData, 'island' | 'buildings' | 'decor'>;

export type DecorResult = 'ok' | 'stale';

/** Puts an owned piece on `pos`: placed when the island has no such instance yet, else moved. */
export async function placeDecor(
  store: Store,
  gameData: Data,
  childId: ChildId,
  instanceId: string,
  pos: Plot,
): Promise<DecorResult> {
  const island = await store.island();
  const items = decorItems(gameData, island, await store.collection());
  const item = items.find((i) => i.instanceId === instanceId);
  if (!item) return 'stale';
  const fits = decorAnchors(gameData, island, items, item).some(
    (p) => p[0] === pos[0] && p[1] === pos[1],
  );
  if (!fits) return 'stale';
  if (instanceId in island.decor) {
    await store.append('decor.moved', { instanceId, pos }, { childId });
  } else {
    await store.append('decor.placed', { instanceId, decorId: item.def.id, pos }, { childId });
  }
  return 'ok';
}

/** Takes a piece off the island, back into the tray. */
export async function removeDecor(
  store: Store,
  childId: ChildId,
  instanceId: string,
): Promise<DecorResult> {
  const island = await store.island();
  if (!(instanceId in island.decor)) return 'stale';
  await store.append('decor.removed', { instanceId }, { childId });
  return 'ok';
}
