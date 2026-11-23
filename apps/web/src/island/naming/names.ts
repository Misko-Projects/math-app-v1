// The island's name (05 §10 step 3, `island.named`; #22 part 4). Framework-free.
//
// The first child to open the sign names the island by choosing one of the names below: a
// kindergartner cannot type, and every choice has its own spoken line, so the name is never
// free text read aloud (03 §8.4). Later, each child is welcomed to the island by name once on
// a device ("Welcome to <name> Island!").

import type { ChildId, IslandState, NarrationKey } from '@number-island/shared';
import type { DataStore } from '@/data/store';

export const ISLAND_NAMES = ['Sunny', 'Pebble', 'Coral', 'Mango', 'Starfish', 'Rainbow'] as const;
export type IslandName = (typeof ISLAND_NAMES)[number];

/** The name as one of the choices, or null for a name this app did not offer. */
export function offeredName(name: string | null): IslandName | null {
  return ISLAND_NAMES.find((n) => n === name) ?? null;
}

/** "<Name> Island". */
export const nameLine = (name: IslandName): NarrationKey => `ui.island.name.${name.toLowerCase()}`;
/** "Welcome to <Name> Island!". */
export const welcomeLine = (name: IslandName): NarrationKey =>
  `ui.island.welcome.${name.toLowerCase()}`;

const key = (childId: ChildId) => `ni.island.welcomed:${childId.toLowerCase()}`;

/** The name this child has not been welcomed to on this device yet, or null. */
export function welcomeDue(island: Pick<IslandState, 'name'>, childId: ChildId): IslandName | null {
  const name = offeredName(island.name);
  return name !== null && localStorage.getItem(key(childId)) !== name ? name : null;
}

export function markWelcomed(childId: ChildId, name: IslandName): void {
  localStorage.setItem(key(childId), name);
}

/** Names the island, unless it has a name by now (the first child names it). */
export async function nameIsland(
  store: Pick<DataStore, 'island' | 'append'>,
  childId: ChildId,
  name: IslandName,
): Promise<'ok' | 'named'> {
  if ((await store.island()).name !== null) return 'named';
  await store.append('island.named', { name }, { childId });
  return 'ok';
}
