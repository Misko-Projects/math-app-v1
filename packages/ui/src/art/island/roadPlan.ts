import type { IslandDef } from '@number-island/shared';
import { ISLAND_LAYOUT, type Point, roadLayout, type StonePlacement } from './geometry';
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
  /**
   * The stone's true spot on the road when it is drawn stepped out beside it (a counted or next
   * stone on a road too tight for it); a dashed leader joins the two.
   */
  leader?: Point;
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
  /** Every shown stone's own spot on the road (laid, next and planned-ahead stones on land). */
  spots: StonePlacement[];
}

export interface RoadPlanInput {
  road: IslandDef['road'];
  roadLength: number;
  counting?: number | null;
  showNext?: boolean;
  plannedAhead?: number;
  onLand?: (s: StonePlacement) => boolean;
  /** Land plot keys (`x,y`): a stepped-out stone only lands on these. */
  land?: ReadonlySet<string>;
}

/** The key of the plot under a scene point. */
function plotKeyAt(x: number, y: number): string {
  const top = ISLAND_LAYOUT.skyH + ISLAND_LAYOUT.padTop;
  return `${Math.floor((x - ISLAND_LAYOUT.padX) / ISLAND_LAYOUT.cellW)},${Math.floor((y - top) / ISLAND_LAYOUT.cellH)}`;
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
 * plain pebbles. Numbered stones are placed in priority order (1, hundreds, tens, the counted
 * stone, the next stone, fives, the rest) and a stone keeps its numeral only if everything it
 * draws stays STONE_CLEARANCE from the stones already placed, so stones never touch. Landmarks
 * never yield: a counted or next stone with no room on the road steps out beside it, joined to its
 * spot by a dashed leader.
 */
export function planRoad({
  road,
  roadLength,
  counting = null,
  showNext = true,
  plannedAhead = 0,
  onLand,
  land,
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
  // Landmarks first, so the tens a child counts by never disappear; then the counted and the next
  // stone, which step out beside the road on a leader line when the road is too tight for them.
  const rank = (n: number) =>
    n === 1
      ? 0
      : n % 100 === 0
        ? 1
        : n % 10 === 0
          ? 2
          : n === counting
            ? 3
            : n === roadLength + 1
              ? 4
              : n % 5 === 0
                ? 5
                : 6;
  const order = [...shown].sort((a, b) => rank(a.n) - rank(b.n) || a.n - b.n);
  const boxAt = (n: number, state: RoadStoneState, x: number, y: number): StoneExtent => {
    const e = stoneExtent(n, state);
    return {
      left: x + e.left * scale,
      right: x + e.right * scale,
      top: y + e.top * scale,
      bottom: y + e.bottom * scale,
    };
  };
  const centre = shown.reduce(
    (c, s) => ({ x: c.x + s.x / shown.length, y: c.y + s.y / shown.length }),
    { x: 0, y: 0 },
  );
  const numbered: PlannedStone[] = [];
  const clear = (box: StoneExtent) =>
    !numbered.some((k) => boxesTouch(k.box, box, STONE_CLEARANCE));
  // Every stone's own spot on the road: numbered candidates at their full extent, the others as
  // pebbles. A stepped-out stone must clear all of them, not just the stones placed before it.
  const spots = shown.map((s) => ({
    n: s.n,
    box: candidate(s)
      ? boxAt(s.n, stateOf(s.n), s.x, s.y)
      : {
          left: s.x + PEBBLE.left,
          right: s.x + PEBBLE.right,
          top: s.y + PEBBLE.top,
          bottom: s.y + PEBBLE.bottom,
        },
  }));
  for (const s of order) {
    if (!candidate(s)) continue;
    const state = stateOf(s.n);
    const box = boxAt(s.n, state, s.x, s.y);
    if (clear(box)) {
      numbered.push({ n: s.n, x: s.x, y: s.y, state, box });
      continue;
    }
    if (!highlighted(s.n)) continue;
    // The counted or next stone must show: step it out beside the road, perpendicular to the
    // road's direction, onto free ground (never onto another stone's spot, never into the sea),
    // joined to its own spot by a leader.
    // First look for open ground (no stone's spot at all); failing that, ground where only an
    // ordinary stone stands (it becomes a plain pebble), never a landmark's or the other
    // highlighted stone's spot.
    const onIsland = (x: number, y: number) => !land || land.has(plotKeyAt(x, y));
    const open = (b: StoneExtent, x: number, y: number) =>
      clear(b) &&
      !spots.some((o) => o.n !== s.n && boxesTouch(o.box, b, STONE_CLEARANCE)) &&
      onIsland(x, y);
    const keepsLandmarks = (b: StoneExtent, x: number, y: number) =>
      clear(b) &&
      !spots.some(
        (o) =>
          o.n !== s.n &&
          (landmark(o.n) || highlighted(o.n)) &&
          boxesTouch(o.box, b, STONE_CLEARANCE),
      ) &&
      onIsland(x, y);
    const boxFor = (x: number, y: number) => boxAt(s.n, state, x, y);
    const callout =
      calloutFor(s, byN, centre, boxFor, open, scale) ??
      calloutFor(s, byN, centre, boxFor, keepsLandmarks, scale);
    if (callout) {
      numbered.push({ n: s.n, ...callout, state, leader: { x: s.x, y: s.y } });
    } else {
      // Nowhere clear (an extreme crowd): it takes its own spot and the stones it touches yield.
      for (let i = numbered.length - 1; i >= 0; i--) {
        const k = numbered[i] as PlannedStone;
        if (!highlighted(k.n) && boxesTouch(k.box, box, STONE_CLEARANCE)) numbered.splice(i, 1);
      }
      numbered.push({ n: s.n, x: s.x, y: s.y, state, box });
    }
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
  return { scale, compact, numbered, pebbles, trail, spots: shown };
}

/**
 * The ground the Numbered Road covers, for keeping ground detail off it (05 §11: nothing hides a
 * road stone). It is the road as shown (the laid stones and the next stone), each spot at the
 * largest extent its stone takes in any state, so counting along the road never moves a tuft;
 * the trail at its full width; and any stone stepped out beside the road with its leader. Laying
 * a stone clears the ground under it. Returns a test: does this box touch the road?
 */
export function roadFootprint(
  plan: Pick<RoadPlan, 'numbered' | 'spots' | 'trail' | 'scale'>,
): (box: StoneExtent) => boolean {
  const scale = plan.scale;
  const boxes: StoneExtent[] = plan.spots.map((s) => {
    const e = anyStateExtent(s.n);
    return {
      left: s.x + e.left * scale,
      right: s.x + e.right * scale,
      top: s.y + e.top * scale,
      bottom: s.y + e.bottom * scale,
    };
  });
  const stones = plan.trail;
  // The trail (drawn 34 × scale wide) as discs along each segment.
  const trailR = (34 * scale) / 2 + 3;
  const discs: { x: number; y: number; r: number }[] = [];
  const segment = (a: Point, b: Point, r: number) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / 6));
    for (let i = 0; i <= n; i++) {
      discs.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, r });
    }
  };
  for (let i = 1; i < stones.length; i++) {
    segment(stones[i - 1] as Point, stones[i] as Point, trailR);
  }
  for (const s of plan.numbered) {
    if (!s.leader) continue;
    boxes.push(s.box);
    segment(s.leader, s, 6);
  }
  // Bucket by plot-sized cells, so each test looks only at nearby road.
  const cell = (x: number, y: number) =>
    `${Math.floor(x / ISLAND_LAYOUT.cellW)},${Math.floor(y / ISLAND_LAYOUT.cellH)}`;
  const boxCells = new Map<string, StoneExtent[]>();
  for (const b of boxes) {
    for (
      let x = Math.floor(b.left / ISLAND_LAYOUT.cellW);
      x <= Math.floor(b.right / ISLAND_LAYOUT.cellW);
      x++
    ) {
      for (
        let y = Math.floor(b.top / ISLAND_LAYOUT.cellH);
        y <= Math.floor(b.bottom / ISLAND_LAYOUT.cellH);
        y++
      ) {
        const k = `${x},${y}`;
        boxCells.set(k, [...(boxCells.get(k) ?? []), b]);
      }
    }
  }
  const discCells = new Map<string, { x: number; y: number; r: number }[]>();
  for (const d of discs) {
    const k = cell(d.x, d.y);
    discCells.set(k, [...(discCells.get(k) ?? []), d]);
  }
  return (box) => {
    const x0 = Math.floor(box.left / ISLAND_LAYOUT.cellW) - 1;
    const x1 = Math.floor(box.right / ISLAND_LAYOUT.cellW) + 1;
    const y0 = Math.floor(box.top / ISLAND_LAYOUT.cellH) - 1;
    const y1 = Math.floor(box.bottom / ISLAND_LAYOUT.cellH) + 1;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        if (boxCells.get(k)?.some((b) => boxesTouch(b, box, 2))) return true;
        for (const d of discCells.get(k) ?? []) {
          const nx = Math.max(box.left, Math.min(d.x, box.right));
          const ny = Math.max(box.top, Math.min(d.y, box.bottom));
          if (Math.hypot(nx - d.x, ny - d.y) < d.r) return true;
        }
      }
    }
    return false;
  };
}

/** Leader-line step-out distances, in stone heights at the current scale. */
const CALLOUT_STEPS = [1.1, 1.5, 1.9, 2.4, 3, 3.7];

/**
 * A clear spot for a highlighted stone beside the road: perpendicular to the road through it,
 * towards the island's middle first, a little further out each try.
 */
function calloutFor(
  s: StonePlacement,
  byN: ReadonlyMap<number, StonePlacement>,
  centre: Point,
  boxAt: (x: number, y: number) => StoneExtent,
  free: (box: StoneExtent, x: number, y: number) => boolean,
  scale: number,
): { x: number; y: number; box: StoneExtent } | null {
  const a = byN.get(s.n - 1) ?? s;
  const b = byN.get(s.n + 1) ?? s;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (dx === 0 && dy === 0) dx = 1;
  const len = Math.hypot(dx, dy);
  dx /= len;
  dy /= len;
  // The two normals, the one pointing away from the island's middle first: the road's outer side
  // is usually open beach, the inner side the road's earlier loops.
  const inward = (centre.x - s.x) * -dy + (centre.y - s.y) * dx >= 0 ? 1 : -1;
  const out = { x: -dy * -inward, y: dx * -inward }; // the outward normal
  const along = { x: dx, y: dy };
  // Directions to try at each distance: straight out, straight in, the four diagonals, then
  // along the road either way.
  const dirs = [
    out,
    { x: -out.x, y: -out.y },
    { x: out.x + along.x, y: out.y + along.y },
    { x: out.x - along.x, y: out.y - along.y },
    { x: -out.x + along.x, y: -out.y + along.y },
    { x: -out.x - along.x, y: -out.y - along.y },
    along,
    { x: -along.x, y: -along.y },
  ].map((d) => {
    const l = Math.hypot(d.x, d.y) || 1;
    return { x: d.x / l, y: d.y / l };
  });
  const unit = 60 * scale; // about one stone with its ring
  for (const step of CALLOUT_STEPS) {
    for (const d of dirs) {
      const x = s.x + d.x * unit * step;
      const y = s.y + d.y * unit * step;
      const box = boxAt(x, y);
      if (free(box, x, y)) return { x, y, box };
    }
  }
  return null;
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
