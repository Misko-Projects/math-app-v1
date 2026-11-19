// 04 §8 session sim: the workshops a simulated family has built, and a minimal island. W1–W3 as in
// 05 §4 (formats, strands, products) with the residents whose affinity names them in
// packages/content/game/fixture.yaml, plus the Practice Pier (hosts every format, 04 §6.3). All
// are available: availability is family-wide and the sim models a family that has built W3.

import type { IslandState, WorkshopCapability } from '@number-island/shared';
import { PRACTICE_PIER } from '../../src/planner';

export const SIM_WORKSHOPS: readonly WorkshopCapability[] = [
  {
    workshopId: 'road-crew',
    formats: ['hundred-chart', 'number-line-jump', 'tap-count', 'order'],
    strands: ['CNT', 'CMP'],
    available: true,
    residents: ['nib'],
    produces: ['stone'],
  },
  {
    workshopId: 'lantern-grove',
    formats: ['dot-flash', 'tap-count', 'make-set', 'numeral-pick'],
    strands: ['SUB', 'CNT'],
    available: true,
    residents: ['tuck'],
    produces: ['light'],
  },
  {
    workshopId: 'ten-boat-dock',
    formats: ['tenframe-fill', 'number-bond', 'rekenrek', 'number-pad'],
    strands: ['CPS', 'ADD'],
    available: true,
    residents: ['marlo', 'tenley'],
    produces: ['plank'],
  },
  {
    workshopId: PRACTICE_PIER,
    formats: [],
    strands: [],
    available: true,
    residents: [],
    produces: [],
  },
];

/**
 * Sensitivity variant (reported, not asserted): Road Crew and Lantern Grove also host `number-pad`,
 * so a CNT or SUB request can include the skill's abstract template.
 */
export const NUMBER_PAD_EVERYWHERE: readonly WorkshopCapability[] = SIM_WORKSHOPS.map((c) =>
  c.workshopId === 'road-crew' || c.workshopId === 'lantern-grove'
    ? { ...c, formats: [...c.formats, 'number-pad'] }
    : c,
);

/** A minimal valid island with the fixture residents of the built workshops. */
export function simIsland(ts: number): IslandState {
  const residents = ['marlo', 'nib', 'tenley', 'tuck'];
  return {
    name: null,
    ringsUnlocked: 1,
    roadLength: 0,
    buildings: {},
    decor: {},
    residents: Object.fromEntries(
      residents.map((r) => [r, { arrivedTs: ts, homeInstanceId: null }]),
    ),
    projects: {},
    festival: { active: null, completed: 0, daysOfPlaySinceLast: 0 },
    giftsPending: [],
    milestones: {},
  };
}
