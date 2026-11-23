// The island is the family's (05 §3 "Shared island"; #22 part 3): both children build on it, and
// it shows who did what with their avatars, never with a number or a score.
//
// - Each child's avatar stands on the island screen, the playing child's ringed (`FamilyAvatars`).
// - A building carries the avatar badge of the child who placed it (`placedBy`). A shared project
//   (05 §6) carries one badge for each child whose materials went into it (`projects.byChild`),
//   stacked up (`BuildingBadges`).
// - A Storehouse pile carries the badges of the children who made some of it (`producedByChild`).
// - A placement that lost its plots to an earlier one (02 §4.3: two devices built on the same
//   plots while offline) is said once to its child, on this device (`displacedFor`).

import { displacedPlacements } from '@number-island/engine/shell';
import type {
  ChildId,
  ChildProfile,
  GameData,
  InventoryState,
  IslandState,
  MaterialId,
} from '@number-island/shared';
import { plotBox } from '@number-island/ui';
import { ChildAvatar } from '@/app/picker/ChildAvatar';
import type { SceneMap } from '../building/PlotTargets';

/** A child of the family and their place in it (the picker's order: it picks the accent). */
export interface FamilyMember {
  profile: ChildProfile;
  index: number;
}

const sameId = (a: string | null, b: string | null) =>
  a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/** The family's children in the picker's order (oldest profile first). */
export function familyMembers(profiles: readonly ChildProfile[]): FamilyMember[] {
  return [...profiles]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map((profile, index) => ({ profile, index }));
}

/** The children who made some of each material, in family order. */
export function makersOf(
  members: readonly FamilyMember[],
  inventory: Pick<InventoryState, 'producedByChild'>,
): Record<MaterialId, FamilyMember[]> {
  const out: Record<MaterialId, FamilyMember[]> = {};
  for (const m of members) {
    const made = Object.entries(inventory.producedByChild).find(([id]) =>
      sameId(id, m.profile.id),
    )?.[1];
    for (const [material, n] of Object.entries(made ?? {})) {
      if ((n ?? 0) > 0) out[material] = [...(out[material] ?? []), m];
    }
  }
  return out;
}

/** The children a standing building shows: who placed it, or for a shared project who gave to it. */
export function contributorsOf(
  members: readonly FamilyMember[],
  gameData: Pick<GameData, 'buildings'>,
  island: Pick<IslandState, 'projects'>,
  building: { buildingId: string; placedBy: ChildId | null },
): FamilyMember[] {
  const def = gameData.buildings.find((b) => b.id === building.buildingId);
  const gave = def?.shared ? (island.projects[building.buildingId]?.byChild ?? {}) : {};
  return members.filter(
    (m) =>
      sameId(m.profile.id, building.placedBy) ||
      Object.entries(gave).some(([id, n]) => sameId(id, m.profile.id) && n > 0),
  );
}

/** A badge on the map and in the Storehouse, and a child's avatar on the island screen (px). */
const BADGE = 36;
/** A maker's badge under a Storehouse pile's picture, and how far the next one overlaps it. */
const MAKER = 28;
const MAKER_OVERLAP = 6;
const AVATAR = 64;
/** How far each further badge of a shared project rises above the one before it. */
const STACK_STEP = 26;

const TOLD_KEY = 'ni.island.displaced.told';

const told = (): string[] => JSON.parse(localStorage.getItem(TOLD_KEY) ?? '[]');

/**
 * This child's placements that lost their plots and have not been said on this device, each as
 * its instance and time: the app's instance id is the building's, so the same building can lose
 * its plots again later, and is then said again.
 */
export function displacedFor(island: IslandState, childId: ChildId): string[] {
  const said = new Set(told());
  return displacedPlacements(island)
    .filter((d) => sameId(d.placedBy, childId))
    .map((d) => `${d.instanceId}@${d.ts}`)
    .filter((key) => !said.has(key));
}

/** The line was said: these placements (`displacedFor`) are not said again on this device. */
export function markDisplacedTold(keys: readonly string[]): void {
  localStorage.setItem(TOLD_KEY, JSON.stringify([...new Set([...told(), ...keys])]));
}

/** A child's avatar as a small round picture; the name is its text for a screen reader. */
export function ChildBadge({ member, size }: { member: FamilyMember; size: number }) {
  return (
    <span
      className="flex rounded-full bg-paper shadow-soft"
      style={{ width: size, height: size }}
      data-badge={member.profile.id}
    >
      <ChildAvatar
        name={member.profile.name}
        avatar={member.profile.avatar}
        index={member.index}
        className="size-full"
      />
    </span>
  );
}

const names = (members: readonly FamilyMember[]) => members.map((m) => m.profile.name).join(', ');

/**
 * The badges of the children who made some of a pile (05 §3: "tagged by who made them"), side by
 * side and overlapping, so the row is no wider than the material's picture above it.
 */
export function MakerBadges({ members }: { members: readonly FamilyMember[] }) {
  if (members.length === 0) return null;
  return (
    <span className="flex" data-testid="makers" data-children={members.length}>
      {members.map((m, i) => (
        <span key={m.profile.id} style={{ marginLeft: i === 0 ? 0 : -MAKER_OVERLAP }}>
          <ChildBadge member={m} size={MAKER} />
        </span>
      ))}
    </span>
  );
}

export interface StandingBuilding {
  instanceId: string;
  buildingId: string;
  plot: [number, number];
  placedBy: ChildId | null;
}

/**
 * The badges on the map's buildings (05 §3, §6): at the foot of each, who placed it, or for a
 * shared project who gave to it, one badge above the other. Pictures only, and no targets:
 * nothing here takes a tap.
 */
export function BuildingBadges({
  map,
  members,
  gameData,
  island,
  buildings,
}: {
  /** The scene's mapping; null before the map is laid out (nothing is shown until then). */
  map: SceneMap | null;
  members: readonly FamilyMember[];
  gameData: Pick<GameData, 'buildings'>;
  island: Pick<IslandState, 'projects'>;
  buildings: readonly StandingBuilding[];
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      hidden={map === null}
      data-testid="building-badges"
    >
      {buildings.map((b) => {
        const who = contributorsOf(members, gameData, island, b);
        if (who.length === 0) return null;
        const box = plotBox(
          b.plot,
          gameData.buildings.find((d) => d.id === b.buildingId)?.footprint,
        );
        return (
          <span
            key={b.instanceId}
            className="absolute"
            // The foot of the building: the middle of its footprint's front edge.
            style={map?.point(box.x + box.w / 2, box.y + box.h)}
            role="img"
            aria-label={names(who)}
            data-built-by={b.instanceId}
            data-building-id={b.buildingId}
            data-children={who.map((m) => m.profile.id).join(' ')}
          >
            {who.map((m, i) => (
              <span
                key={m.profile.id}
                className="absolute"
                style={{ left: -BADGE / 2, top: -BADGE - i * STACK_STEP, zIndex: i }}
              >
                <ChildBadge member={m} size={BADGE} />
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The children of the island, side by side (05 §3 "each child's avatar appears"): the one who is
 * playing has the sun's ring. They stand in the screen's corner, clear of the requests, which
 * lie over the map. Pictures, not targets.
 */
export function FamilyAvatars({
  members,
  playing,
}: {
  members: readonly FamilyMember[];
  playing: ChildId;
}) {
  return (
    <ul className="pointer-events-none flex items-end gap-3" data-testid="island-family">
      {members.map((m) => (
        <li
          key={m.profile.id}
          className={`flex rounded-full ring-4 ${
            sameId(m.profile.id, playing) ? 'ring-sunshine' : 'ring-paper'
          }`}
          role="img"
          aria-label={m.profile.name}
          data-island-avatar={m.profile.id}
          data-playing={sameId(m.profile.id, playing) ? 'true' : undefined}
        >
          <ChildBadge member={m} size={AVATAR} />
        </li>
      ))}
    </ul>
  );
}
