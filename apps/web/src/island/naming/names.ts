// The island's name (05 §10 step 3, `island.named`; #22 part 4). Framework-free.
//
// The first child to open the sign names the island by choosing one of the names in the game
// data (`GameData.island.names`): a kindergartner cannot type, and every choice has its own
// spoken lines, so a name is never free text read aloud (03 §8.4). Later, each child is welcomed
// to the island by name once on a device ("Welcome to <name> Island!"). A name the game data no
// longer lists stays the island's name; it has no spoken line, so it is not shown or said.

import type { ChildId, GameData, IslandState } from '@number-island/shared';
import type { DataStore } from '@/data/store';

/** One name a child may give the island: what the event records, and its spoken lines. */
export type IslandNameChoice = NonNullable<GameData['island']['names']>[number];

type Data = { island: Pick<GameData['island'], 'names'> };

/** The names on offer. */
export const islandNames = (gameData: Data): readonly IslandNameChoice[] =>
  gameData.island.names ?? [];

/** The island's name as one of the game data's choices, or null. */
export function namedAs(gameData: Data, name: string | null): IslandNameChoice | null {
  return islandNames(gameData).find((choice) => choice.name === name) ?? null;
}

const key = (childId: ChildId) => `ni.island.welcomed:${childId.toLowerCase()}`;

/** The name this child has not been welcomed to on this device yet, or null. */
export function welcomeDue(
  gameData: Data,
  island: Pick<IslandState, 'name'>,
  childId: ChildId,
): IslandNameChoice | null {
  const choice = namedAs(gameData, island.name);
  return choice !== null && localStorage.getItem(key(childId)) !== choice.name ? choice : null;
}

export function markWelcomed(childId: ChildId, choice: IslandNameChoice): void {
  localStorage.setItem(key(childId), choice.name);
}

/** Names the island, unless it has a name by now (the first child names it). */
export async function nameIsland(
  store: Pick<DataStore, 'island' | 'append'>,
  childId: ChildId,
  choice: IslandNameChoice,
): Promise<'ok' | 'named'> {
  if ((await store.island()).name !== null) return 'named';
  await store.append('island.named', { name: choice.name }, { childId });
  return 'ok';
}
