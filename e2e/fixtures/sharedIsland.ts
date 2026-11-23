// A family island that two children built on two tablets (#22 part 3), as seed events for
// `seedLocalEvents`: Ada's are this tablet's own, Ben's come from another device, interleaved in
// time. Both placed a workshop on the same plots while offline: Ben's Lantern Grove was first,
// so Ada's Road Crew does not stand (02 §4.3). Both gave to the Lighthouse, a shared project.
import type { LocalChild, SeedEvent } from './localChild';

export const ADA: LocalChild = {
  id: '019c0000-0000-7000-8000-00000000e3a1',
  name: 'Ada',
  grade: 'K',
};
export const BEN: LocalChild = {
  id: '019c0000-0000-7000-8000-00000000e3b2',
  name: 'Ben',
  grade: '2',
  look: { skinTone: 's08', hairColor: 'black' },
};
const OTHER_TABLET = '019c0000-0000-7000-8000-00000000e3d2';

const ada = (at: number, type: string, payload: Record<string, unknown>): SeedEvent => ({
  type,
  childId: ADA.id,
  payload,
  at,
});
const ben = (at: number, type: string, payload: Record<string, unknown>): SeedEvent => ({
  type,
  childId: BEN.id,
  payload,
  at,
  deviceId: OTHER_TABLET,
});
const made = (materials: Record<string, number>) => ({
  sessionId: 'seed',
  requestId: 'seed',
  workshopId: 'practice-pier',
  materials,
});
const placed = (instanceId: string, buildingId: string, x: number, y: number) => ({
  instanceId,
  buildingId,
  plot: [x, y],
});
const spent = (materials: Record<string, number>, kind: string, ref: string) => ({
  materials,
  purpose: { kind, ref },
});

/** What stands once both tablets' events are folded, and what does not. */
export const STANDING = ['lantern-grove', 'lighthouse', 'shell-cottage', 'ten-boat-dock'];
export const DISPLACED = 'road-crew';
export const ROAD_LENGTH = 5;

/** Listed as they reach this tablet: Ada's own first, then Ben's, newest first. */
export const sharedIslandEvents: SeedEvent[] = [
  ada(0, 'material.produced', made({ stone: 14, light: 5 })),
  ada(10, 'building.placed', placed('shell-cottage', 'shell-cottage', 3, 4)),
  ada(11, 'resident.arrived', { residentId: 'hobb', homeInstanceId: 'shell-cottage', via: 'home' }),
  ada(12, 'road.extended', { to: 3 }),
  ada(13, 'material.spent', spent({ stone: 3 }, 'build', 'road')),
  ada(30, 'building.placed', placed('road-crew', 'road-crew', 7, 3)),
  ada(31, 'material.spent', spent({ stone: 2 }, 'build', 'road-crew')),
  ada(39, 'material.spent', spent({ light: 3 }, 'project', 'lighthouse')),
  ben(41, 'building.placed', placed('lighthouse', 'lighthouse', 1, 4)),
  ben(40, 'material.spent', spent({ plank: 8 }, 'project', 'lighthouse')),
  ben(25, 'building.placed', placed('lantern-grove', 'lantern-grove', 6, 2)),
  ben(23, 'material.spent', spent({ stone: 2 }, 'build', 'road')),
  ben(22, 'road.extended', { to: ROAD_LENGTH }),
  ben(20, 'building.placed', placed('ten-boat-dock', 'ten-boat-dock', 1, 2)),
  ben(1, 'material.produced', made({ stone: 16, plank: 23 })),
];
