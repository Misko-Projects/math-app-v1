// Workshop helpers for the session planner (04 §6.3, 05 §4): hosting, the Practice Pier fallback,
// residents and the request reward. Pure.

import type {
  IslandState,
  ItemFormat,
  ItemTemplate,
  MaterialId,
  Recipe,
  ResidentId,
  WorkshopCapability,
  WorkshopId,
} from '@number-island/shared';
import { ITEM_FORMATS } from '@number-island/shared';

/** The generic fallback host that hosts every format (05 §4, 04 §6.3). */
export const PRACTICE_PIER: WorkshopId = 'practice-pier';
/** W12, the fluency workshop (04 §6.5). */
export const RHYTHM_ORCHARD: WorkshopId = 'rhythm-orchard';
/** W13: produces no material; its requests reward decor only (04 §6.3). */
export const PUZZLE_TOWER: WorkshopId = 'puzzle-tower';

/**
 * The last-resort resident when no workshop and no island lists one (E03 reading): Pip is the
 * Practice Pier's host in 05 §4.
 */
export const FALLBACK_RESIDENT: ResidentId = 'pip';

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Whether a workshop hosts a format. The Practice Pier hosts every format. */
export function hosts(cap: WorkshopCapability, format: ItemFormat): boolean {
  return cap.workshopId === PRACTICE_PIER || cap.formats.includes(format);
}

const TIER_ORDER: Record<ItemTemplate['tier'], number> = { concrete: 0, pictorial: 1, abstract: 2 };

/** Templates ordered concrete → abstract, then by id (CPA order for new practice). */
export function byTier(a: ItemTemplate, b: ItemTemplate): number {
  return TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || byId(a.id, b.id);
}

/**
 * The themed workshops a plan may use: available ones other than the Practice Pier, one per id
 * (the first listed wins), sorted by id. Availability is family-wide (04 §6.3).
 */
export function themedWorkshops(caps: readonly WorkshopCapability[]): WorkshopCapability[] {
  const seen = new Map<WorkshopId, WorkshopCapability>();
  for (const c of caps) {
    if (!c.available || c.workshopId === PRACTICE_PIER || seen.has(c.workshopId)) continue;
    seen.set(c.workshopId, c);
  }
  return [...seen.values()].sort((a, b) => byId(a.workshopId, b.workshopId));
}

/**
 * The Practice Pier capability: the input's entry when present (its residents and products are
 * kept), else a synthesised one. Either way it hosts every format and is treated as available,
 * because it is unlocked at the start (05 §4) (E03 reading).
 */
export function practicePier(caps: readonly WorkshopCapability[]): WorkshopCapability {
  const given = caps.find((c) => c.workshopId === PRACTICE_PIER);
  return {
    workshopId: PRACTICE_PIER,
    formats: [...ITEM_FORMATS],
    strands: given ? [...given.strands] : [],
    available: true,
    residents: given ? [...given.residents] : [],
    produces: given ? [...given.produces] : [],
  };
}

/**
 * The residents a request in `cap` can be voiced by, sorted: the workshop's own; for the Practice
 * Pier or a workshop without residents, those of every available workshop, else the island's,
 * else those of any capability, else Pip.
 */
export function residentPool(
  cap: WorkshopCapability,
  caps: readonly WorkshopCapability[],
  island: IslandState,
): ResidentId[] {
  const sorted = (xs: Iterable<ResidentId>) => [...new Set(xs)].sort(byId);
  if (cap.workshopId !== PRACTICE_PIER && cap.residents.length > 0) return sorted(cap.residents);
  const fromAvailable = sorted(caps.filter((c) => c.available).flatMap((c) => c.residents));
  if (fromAvailable.length > 0) return fromAvailable;
  const fromIsland = sorted(Object.keys(island.residents));
  if (fromIsland.length > 0) return fromIsland;
  const fromAny = sorted(caps.flatMap((c) => c.residents));
  return fromAny.length > 0 ? fromAny : [FALLBACK_RESIDENT];
}

/**
 * The materials a request in `cap` produces, one per item in turn (04 §6.3). A themed workshop
 * produces its own products (alternating when it has two or more; [] for Puzzle Tower). The
 * Practice Pier produces the material the resident asked for: the first product of an available
 * workshop that lists the resident, else of any available workshop (by id), else nothing.
 */
export function requestProducts(
  cap: WorkshopCapability,
  residentId: ResidentId,
  caps: readonly WorkshopCapability[],
): MaterialId[] {
  if (cap.workshopId !== PRACTICE_PIER) return [...cap.produces];
  const available = caps
    .filter((c) => c.available && c.workshopId !== PRACTICE_PIER && c.produces.length > 0)
    .sort((a, b) => byId(a.workshopId, b.workshopId));
  const home = available.find((c) => c.residents.includes(residentId)) ?? available[0];
  const first = home?.produces[0];
  return first === undefined ? [] : [first];
}

/** One unit per item, cycling through `products`; {} when there are none. */
export function materialsFor(products: readonly MaterialId[], items: number): Recipe {
  const out: Recipe = {};
  if (products.length === 0) return out;
  for (let i = 0; i < items; i++) {
    const m = products[i % products.length] as MaterialId;
    out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}
