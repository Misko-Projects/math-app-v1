import type { IslandDef } from '@number-island/shared';
import { type Point, roadLayout, type StonePlacement } from './geometry';
import { type RoadStoneState, type StoneExtent, stoneExtent } from './RoadStone';

/** The largest scale road stones are drawn at on the island map (fraction of design size). */
export const MAP_STONE_SCALE = 0.85;
/**
 * Below this scale a road is too crowded to number every stone, so it goes compact: only the
 * landmarks (1, every ten), the next stone and the stone being counted keep their numerals.
 */
export const MIN_STONE_SCALE = 0.5;
/** Minimum clear space between two numbered stones' extents (rings, flags and shadows included). */
export const STONE_CLEARANCE = 4;
/** Everything a compact pebble draws (with its shadow), relative to its centre. */
const PEBBLE: StoneExtent = { left: -9, right: 9, top: -6, bottom: 9 };
/** Clear space kept between two pebbles. */
const PEBBLE_CLEARANCE = 2;
/** Pairs further apart than this (scene units) can never touch at MAP_STONE_SCALE. */
const NEAR = 260;

export interface PlannedStone {
  n: number;
  x: number;
  y: number;
  state: RoadStoneState;
  /** Scene-unit box of everything the stone draws (after scaling). */
  box: StoneExtent;
}

export interface RoadPlan {
  /** Stone scale on the map. */
  scale: number;
  compact: boolean;
  /** Stones drawn with their numerals, never touching each other. */
  numbered: PlannedStone[];
  /** Laid stones drawn as small plain pebbles (compact roads only), never piled up. */
  pebbles: { n: number; x: number; y: number }[];
  /** The trail through the laid stones (or through every shown stone when fewer than two are laid). */
  trail: Point[];
}

export interface RoadPlanInput {
  road: IslandDef['road'];
  roadLength: number;
  counting?: number | null;
  showNext?: boolean;
  plannedAhead?: number;
  onLand?: (s: StonePlacement) => boolean;
}

/** What a stone may draw in any of the states it can take on the road (laid, next, counting). */
function anyStateExtent(n: number): StoneExtent {
  const all = (['laid', 'next', 'counting', 'planned'] as const).map((s) => stoneExtent(n, s));
  return {
    left: Math.min(...all.map((e) => e.left)),
    right: Math.max(...all.map((e) => e.right)),
    top: Math.min(...all.map((e) => e.top)),
    bottom: Math.max(...all.map((e) => e.bottom)),
  };
}

/**
 * The largest scale (≤ MAP_STONE_SCALE) at which no two of these stones can touch, whatever state
 * each is in, so that numerals never jump or flicker as the road grows or a stone is counted.
 */
export function fitScale(
  stones: readonly StonePlacement[],
  ignore: (a: number, b: number) => boolean = () => false,
): number {
  let scale = MAP_STONE_SCALE;
  const ext = stones.map((s) => anyStateExtent(s.n));
  for (let i = 0; i < stones.length; i++) {
    for (let j = i + 1; j < stones.length; j++) {
      const a = stones[i] as StonePlacement;
      const b = stones[j] as StonePlacement;
      if (ignore(a.n, b.n)) continue;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx > NEAR || dy > NEAR) continue;
      const ea = ext[i] as StoneExtent;
      const eb = ext[j] as StoneExtent;
      // Two boxes stay clear when they are apart on either axis.
      const across = a.x <= b.x ? ea.right - eb.left : eb.right - ea.left;
      const down = a.y <= b.y ? ea.bottom - eb.top : eb.bottom - ea.top;
      const fit = Math.max((dx - STONE_CLEARANCE) / across, (dy - STONE_CLEARANCE) / down);
      scale = Math.min(scale, fit);
    }
  }
  return scale;
}

/**
 * Decide how the Numbered Road is drawn (05 §3). On a roomy road every stone is numbered at the
 * largest scale where no two stones can touch in any state (fitScale). A crowded road (fitScale
 * below MIN_STONE_SCALE, for example many stones sharing plots) goes compact: only landmarks,
 * the next stone and the counted stone are scaled to fit, roomy stretches still number every
 * stone, crowded stretches number only landmarks and fives, and the other laid stones become small
 * plain pebbles. Numbered stones are placed in priority order (counted, next, 1, hundreds, tens,
 * fives, the rest) and a stone keeps its numeral only if everything it draws stays
 * STONE_CLEARANCE from the stones already placed, so stones never touch. Only the next stone can
 * yield, and only to the counted stone beside it.
 */
export function planRoad({
  road,
  roadLength,
  counting = null,
  showNext = true,
  plannedAhead = 0,
  onLand,
}: RoadPlanInput): RoadPlan {
  const placed = roadLayout(road);
  const lastShown = roadLength + (showNext ? 1 + plannedAhead : 0);
  const shown = placed.filter((s) => s.n <= lastShown && (!onLand || onLand(s)));
  const laid = shown.filter((s) => s.n <= roadLength);
  const trail = (laid.length > 1 ? laid : shown).map((s) => ({ x: s.x, y: s.y }));
  const landmark = (n: number) => n === 1 || n % 10 === 0;
  const highlighted = (n: number) => n === counting || n === roadLength + 1;
  const roomy = fitScale(shown);
  const compact = roomy < MIN_STONE_SCALE;
  // Compact: fit the landmarks and the highlighted stones, except a highlighted stone and its
  // direct neighbour by number (such a landmark yields while the highlight is beside it).
  const scale = compact
    ? Math.max(
        MIN_STONE_SCALE,
        fitScale(
          shown.filter((s) => landmark(s.n) || highlighted(s.n)),
          (a, b) => Math.abs(a - b) <= 1 && (highlighted(a) || highlighted(b)),
        ),
      )
    : roomy;
  const stateOf = (n: number): RoadStoneState =>
    n === counting
      ? 'counting'
      : n <= roadLength
        ? 'laid'
        : n === roadLength + 1
          ? 'next'
          : 'planned';
  // A stone is crowded when, at this scale, it would touch the stone before or after it. In a
  // crowded stretch only landmarks and fives are numbered (regularly, never every other stone);
  // roomy stretches of the same road keep every numeral.
  const byN = new Map(shown.map((s) => [s.n, s]));
  const scaled = (s: StonePlacement): StoneExtent => {
    const e = anyStateExtent(s.n);
    return {
      left: s.x + e.left * scale,
      right: s.x + e.right * scale,
      top: s.y + e.top * scale,
      bottom: s.y + e.bottom * scale,
    };
  };
  const crowded = (s: StonePlacement) =>
    [s.n - 1, s.n + 1].some((m) => {
      const t = byN.get(m);
      return t !== undefined && boxesTouch(scaled(s), scaled(t), STONE_CLEARANCE);
    });
  const candidate = (s: StonePlacement) =>
    !compact ||
    landmark(s.n) ||
    s.n % 5 === 0 ||
    highlighted(s.n) ||
    s.n > roadLength ||
    !crowded(s);
  const rank = (n: number) =>
    n === counting
      ? 0
      : n === roadLength + 1
        ? 1
        : n === 1
          ? 2
          : n % 100 === 0
            ? 3
            : n % 10 === 0
              ? 4
              : n % 5 === 0
                ? 5
                : 6;
  const order = [...shown].sort((a, b) => rank(a.n) - rank(b.n) || a.n - b.n);
  const numbered: PlannedStone[] = [];
  for (const s of order) {
    if (!candidate(s)) continue;
    const state = stateOf(s.n);
    const e = stoneExtent(s.n, state);
    const box = {
      left: s.x + e.left * scale,
      right: s.x + e.right * scale,
      top: s.y + e.top * scale,
      bottom: s.y + e.bottom * scale,
    };
    if (numbered.some((k) => boxesTouch(k.box, box, STONE_CLEARANCE))) continue;
    numbered.push({ n: s.n, x: s.x, y: s.y, state, box });
  }
  const kept = new Set(numbered.map((s) => s.n));
  const pebbles: RoadPlan['pebbles'] = [];
  const pebbleBoxes: StoneExtent[] = [];
  for (const s of laid) {
    if (kept.has(s.n)) continue;
    const b = {
      left: s.x + PEBBLE.left,
      right: s.x + PEBBLE.right,
      top: s.y + PEBBLE.top,
      bottom: s.y + PEBBLE.bottom,
    };
    if (numbered.some((k) => boxesTouch(k.box, b, 0))) continue;
    if (pebbleBoxes.some((p) => boxesTouch(p, b, PEBBLE_CLEARANCE))) continue;
    pebbles.push({ n: s.n, x: s.x, y: s.y });
    pebbleBoxes.push(b);
  }
  // Back to front: lower stones overlap the ones behind them.
  numbered.sort((a, b) => a.y - b.y || a.n - b.n);
  return { scale, compact, numbered, pebbles, trail };
}

/** True when two boxes come closer than `clearance`. */
export function boxesTouch(a: StoneExtent, b: StoneExtent, clearance: number): boolean {
  return (
    a.left < b.right + clearance &&
    b.left < a.right + clearance &&
    a.top < b.bottom + clearance &&
    b.top < a.bottom + clearance
  );
}
