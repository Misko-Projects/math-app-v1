// The wind-down recap (05 §2, 06 §2 "Wind-down"; #22 part 4): what this child made and built in
// the session that just ended, read from the event log, and the line that says it. Framework-free.

import type {
  AnyEventEnvelope,
  BuildingId,
  ChildId,
  GameData,
  MaterialId,
  NarrationKey,
} from '@number-island/shared';
import { isEventOf } from '@/app/session/time';
import { ROAD_MATERIAL } from './building/rules';

export interface Recap {
  /** What the session's requests produced, per material. */
  made: Record<MaterialId, number>;
  /** The buildings the child placed or raised a level, each once, in the order built. */
  built: BuildingId[];
  /** Road stones laid. */
  stones: number;
}

export const emptyRecap = (recap: Recap) =>
  Object.keys(recap.made).length === 0 && recap.built.length === 0 && recap.stones === 0;

/** A building's spoken name (`game.yaml`). */
export const buildingNameKey = (id: BuildingId) => `game.building.${id}` as NarrationKey;

const sameId = (a: string | null, b: string) => a !== null && a.toLowerCase() === b.toLowerCase();

/** The recap of `session` for `childId`: its products, and what the child built since it began. */
export function sessionRecap(
  events: readonly AnyEventEnvelope[],
  gameData: Pick<GameData, 'buildings'>,
  childId: ChildId,
  session: { sessionId: string; startedAt: number },
): Recap {
  const made: Record<MaterialId, number> = {};
  const built: BuildingId[] = [];
  let stones = 0;
  const known = new Set(gameData.buildings.map((b) => b.id));
  const add = (id: string) => {
    if (known.has(id) && !built.includes(id)) built.push(id);
  };
  for (const e of [...events].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1))) {
    if (!sameId(e.childId, childId)) continue;
    if (isEventOf(e, 'material.produced')) {
      if (e.payload.sessionId !== session.sessionId) continue;
      for (const [id, n] of Object.entries(e.payload.materials))
        made[id] = (made[id] ?? 0) + (n ?? 0);
      continue;
    }
    if (e.ts < session.startedAt) continue;
    if (isEventOf(e, 'building.placed')) add(e.payload.buildingId);
    // The app's instance id is the building's id (02 §5.6 "Building").
    else if (isEventOf(e, 'building.upgraded')) add(e.payload.instanceId);
    else if (isEventOf(e, 'road.extended')) stones += 1;
  }
  return { made, built, stones };
}

/**
 * The recap as one spoken line (`AudioManager.sayPhrases`): what was made, each with its count,
 * then what was built, then the goodbye. With nothing made or built it is the goodbye alone.
 */
export function recapPhrases(
  recap: Recap,
  gameData: Pick<GameData, 'materials'>,
): ({ id: string } | { number: number })[] {
  const counted = (id: string, n: number) => {
    const name = gameData.materials.find((m) => m.id === id)?.name;
    return name && n > 0 ? [{ number: n }, { id: name }] : [];
  };
  const made = Object.entries(recap.made).flatMap(([id, n]) => counted(id, n));
  const built = [
    ...recap.built.map((id) => ({ id: buildingNameKey(id) })),
    ...counted(ROAD_MATERIAL, recap.stones),
  ];
  return [
    ...(made.length > 0 ? [{ id: 'ui.winddown.made' }, ...made] : []),
    ...(built.length > 0 ? [{ id: 'ui.winddown.built' }, ...built] : []),
    { id: 'ui.winddown.done' },
  ];
}
