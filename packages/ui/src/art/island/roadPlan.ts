import type { IslandDef } from '@number-island/shared';
import { ISLAND_LAYOUT, type Point, roadLayout, type StonePlacement } from './geometry';
import { type RoadStoneState, STONE_NUMERAL, type StoneExtent, stoneExtent } from './RoadStone';

/**
 * Road stones' scale on the island map (fraction of design size). It is one scale for every
 * stone, so every numeral on the map is the same size: 27 × 0.85 ≈ 23 scene units, about 21 CSS
 * px at the default zoom (a 1400-unit scene on a 1280 px tablet; 05 §11, aim ≥ 20).
 */
export const MAP_STONE_SCALE = 0.85;
/** Minimum clear space between two numbered stones' extents (rings, flags and shadows included). */
export const STONE_CLEARANCE = 4;
/** Numeral size on road signposts, in scene units: exactly a map stone's. */
export const SIGN_NUMERAL = STONE_NUMERAL * MAP_STONE_SCALE;
/** The next stone's tap target radius in scene units: ≥ 80 CSS px across at the default zoom. */
export const NEXT_HIT_RADIUS = 44;
/** Clear ground kept around the next stone, beyond its own extent (05 §11). */
const NEXT_CLEAR = 14;
/** Pairs further apart than this (scene units) can never touch at MAP_STONE_SCALE. */
const NEAR = 260;
/** A bead's ring (next or counting) reaches this far beyond the bead. */
const BEAD_RING = 4;

export interface PlannedStone {
  n: number;
  x: number;
  y: number;
  state: RoadStoneState;
  /** Scene-unit box of everything the stone draws now (after scaling). */
  box: StoneExtent;
}

/** A stone drawn as a small bead, where the road is too crowded for a numbered stone. */
export interface RoadBead {
  n: number;
  x: number;
  y: number;
  r: number;
  state: RoadStoneState;
  /** Scene-unit box of everything the bead may draw in any state (its ring included). */
  box: StoneExtent;
}

/** A numbered signpost by a bead: stone 1, the tens and hundreds, the next and counted stone. */
export interface RoadSign {
  n: number;
  state: RoadStoneState;
  /** The plaque's centre and size. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The bead the post stands on. */
  anchor: Point;
  /** The plaque's box, and the post's bounding box. */
  box: StoneExtent;
  post: StoneExtent;
  /** Points along the post (3 units apart), from the bead's edge to the plaque. */
  points: Point[];
}

export interface RoadPlan {
  /** Numbered stones' scale on the map (MAP_STONE_SCALE). */
  scale: number;
  /** Stones drawn as numbered stones, where the road has room. Never touching anything. */
  numbered: PlannedStone[];
  /** Stones drawn as beads, where it is crowded: every one of them, evenly spaced. */
  beads: RoadBead[];
  /** Numbered signposts by beads. Never touching a stone, a bead or each other. */
  signs: RoadSign[];
  /** The trail through the laid stones (or through every shown stone when fewer than two are laid). */
  trail: Point[];
  /** Every shown stone's own spot on the road (laid, next and planned-ahead stones on land). */
  spots: StonePlacement[];
  /** The next stone's spot, for its tap target (null when no next stone is shown). */
  next: Point | null;
}

export interface RoadPlanInput {
  road: IslandDef['road'];
  roadLength: number;
  counting?: number | null;
  showNext?: boolean;
  plannedAhead?: number;
  onLand?: (s: StonePlacement) => boolean;
  /** Land plot keys (`x,y`). Unused by the plan itself; kept so callers can pass one input. */
  land?: ReadonlySet<string>;
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

function scaled(s: { x: number; y: number }, e: StoneExtent, scale: number): StoneExtent {
  return {
    left: s.x + e.left * scale,
    right: s.x + e.right * scale,
    top: s.y + e.top * scale,
    bottom: s.y + e.bottom * scale,
  };
}

function beadBox(s: { x: number; y: number }, r: number): StoneExtent {
  // The ring (r + BEAD_RING, at the peak of the next ring's 1.05 pulse, with its outline), and
  // the shadow below.
  const ring = (r + BEAD_RING) * 1.05 + 1.5;
  return {
    left: s.x - ring,
    right: s.x + ring,
    top: s.y - ring,
    bottom: s.y + Math.max(ring, r + 3),
  };
}

interface RoadShape {
  numbered: ReadonlySet<number>;
  beadR: number;
}

const shapes = new WeakMap<IslandDef['road'], RoadShape>();

/**
 * Which stones of a road are numbered stones and which are beads, decided once from the whole
 * road's layout (so a stone never changes form as the road grows, is counted or the island grows).
 * Walking the road from stone 1, a stone is numbered when its whole extent, in any state, clears
 * every numbered stone before it and every other stone's bead; otherwise it is a bead. Beads share
 * one radius, set by the closest two stones on the road.
 */
export function roadShape(road: IslandDef['road']): RoadShape {
  const cached = shapes.get(road);
  if (cached) return cached;
  const placed = roadLayout(road);
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < placed.length; i++) {
    const a = placed[i - 1] as StonePlacement;
    const b = placed[i] as StonePlacement;
    gap = Math.min(gap, Math.hypot(a.x - b.x, a.y - b.y));
  }
  const beadR = Number.isFinite(gap) ? Math.max(3.5, Math.min(8, gap * 0.34)) : 8;
  const beads = placed.map((s) => beadBox(s, beadR));
  const full = placed.map((s) => scaled(s, anyStateExtent(s.n), MAP_STONE_SCALE));
  const numbered = new Set<number>();
  const isNumbered: boolean[] = [];
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i] as StonePlacement;
    let clear = true;
    for (let j = 0; j < placed.length && clear; j++) {
      if (j === i) continue;
      const b = placed[j] as StonePlacement;
      if (Math.abs(a.x - b.x) > NEAR || Math.abs(a.y - b.y) > NEAR) continue;
      const other = j < i && isNumbered[j] ? full[j] : beads[j];
      if (boxesTouch(full[i] as StoneExtent, other as StoneExtent, STONE_CLEARANCE)) clear = false;
    }
    isNumbered[i] = clear;
    if (clear) numbered.add(a.n);
  }
  const shape = { numbered, beadR };
  shapes.set(road, shape);
  return shape;
}

/**
 * Decide how the Numbered Road is drawn (05 §3: a linear board; every number has a stone, in
 * order, and moving along it counts aloud). Every shown stone is drawn exactly once, at its own
 * spot on the road, so the order always reads true:
 *
 * - where the road has room, as a numbered stone (one scale, so every numeral is one size);
 * - where stones crowd (for example three to a plot), as a small bead, evenly spaced, so the beads
 *   between two numbers always equal the numbers missing. The numerals that matter there stand on
 *   signposts by their beads, at the same size as a stone's: the counted stone, the next stone,
 *   stone 1, the hundreds and the tens. A sign rises above its bead (or leans beside it, or hangs
 *   below), never touching a stone, a bead or another sign.
 */
export function planRoad({
  road,
  roadLength,
  counting = null,
  showNext = true,
  plannedAhead = 0,
  onLand,
}: RoadPlanInput): RoadPlan {
  const shape = roadShape(road);
  const scale = MAP_STONE_SCALE;
  const placed = roadLayout(road);
  const lastShown = roadLength + (showNext ? 1 + plannedAhead : 0);
  const shown = placed.filter((s) => s.n <= lastShown && (!onLand || onLand(s)));
  const laid = shown.filter((s) => s.n <= roadLength);
  const trail = (laid.length > 1 ? laid : shown).map((s) => ({ x: s.x, y: s.y }));
  const nextSpot = showNext ? (shown.find((s) => s.n === roadLength + 1) ?? null) : null;
  const next = nextSpot ? { x: nextSpot.x, y: nextSpot.y } : null;
  const stateOf = (n: number): RoadStoneState =>
    n === counting
      ? 'counting'
      : n <= roadLength
        ? 'laid'
        : n === roadLength + 1
          ? 'next'
          : 'planned';

  const numbered: PlannedStone[] = [];
  const beads: RoadBead[] = [];
  for (const s of shown) {
    const state = stateOf(s.n);
    if (shape.numbered.has(s.n)) {
      numbered.push({
        n: s.n,
        x: s.x,
        y: s.y,
        state,
        box: scaled(s, stoneExtent(s.n, state), scale),
      });
    } else {
      const r = shape.beadR;
      beads.push({ n: s.n, x: s.x, y: s.y, r, state, box: beadBox(s, r) });
    }
  }
  // Drawn back to front, so a lower stone's ring or flag is never hidden by the row behind it.
  numbered.sort((a, b) => a.y - b.y || a.n - b.n);

  const rank = (b: RoadBead) =>
    b.n === counting
      ? 0
      : b.state === 'next'
        ? 1
        : b.state === 'planned'
          ? 9
          : b.n === 1
            ? 2
            : b.n % 100 === 0
              ? 3
              : b.n % 10 === 0
                ? 4
                : 9;
  const wanted = beads.filter((b) => rank(b) < 9).sort((a, b) => rank(a) - rank(b) || a.n - b.n);
  const obstacles = [
    ...beads.map((b) => ({ n: b.n, box: b.box })),
    ...numbered.map((s) => ({ n: s.n, box: scaled(s, anyStateExtent(s.n), scale) })),
  ];
  const signs: RoadSign[] = [];
  for (const b of wanted) {
    const sign = placeSign(b, obstacles, signs);
    if (sign) signs.push(sign);
  }
  signs.sort((a, b) => a.y - b.y || a.n - b.n);
  return { scale, numbered, beads, signs, trail, spots: shown, next };
}

/** Signpost post lengths and sideways leans to try, nearest first. */
const SIGN_POSTS = [16, 28, 42, 58, 76, 96];
const SIGN_LEANS = [0, -1, 1, -2, 2, -3, 3];
/** A sign's plaque height, and its width per digit (plus padding), in scene units. */
const SIGN_H = 32;
const SIGN_DIGIT_W = 14;
const SIGN_PAD = 20;

/**
 * Find a clear spot for a bead's signpost, the shortest post first: above the bead, below it, or
 * to its left or right (beside a road that runs up the map), each leaning a little either way.
 */
function placeSign(
  bead: RoadBead,
  obstacles: readonly { n: number; box: StoneExtent }[],
  signs: readonly RoadSign[],
): RoadSign | null {
  const w = SIGN_DIGIT_W * String(bead.n).length + SIGN_PAD;
  const h = SIGN_H;
  for (const len of SIGN_POSTS) {
    for (const side of ['up', 'down', 'left', 'right'] as const) {
      for (const lean of SIGN_LEANS) {
        const across = side === 'left' || side === 'right';
        const dir = side === 'up' || side === 'left' ? -1 : 1;
        const x = across ? bead.x + dir * (bead.r + len + w / 2) : bead.x + lean * (w * 0.5);
        const y = across ? bead.y + lean * (h * 0.5) : bead.y + dir * (bead.r + len + h / 2);
        const box = { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 };
        const from = across
          ? { x: bead.x + dir * bead.r, y: bead.y }
          : { x: bead.x, y: bead.y + dir * bead.r };
        const to = across ? { x: x - dir * (w / 2), y } : { x, y: y - dir * (h / 2) };
        const post = postPoints(from, to);
        const postBox = {
          left: Math.min(from.x, to.x) - 2,
          right: Math.max(from.x, to.x) + 2,
          top: Math.min(from.y, to.y),
          bottom: Math.max(from.y, to.y),
        };
        const blocked =
          obstacles.some(
            (o) =>
              o.n !== bead.n && (boxesTouch(o.box, box, 2) || post.some((p) => near(o.box, p, 2))),
          ) ||
          signs.some(
            (s) =>
              boxesTouch(s.box, box, 4) ||
              s.points.some((p) => near(box, p, 3)) ||
              post.some((p) => near(s.box, p, 3)),
          );
        if (blocked) continue;
        return {
          n: bead.n,
          state: bead.state,
          x,
          y,
          w,
          h,
          anchor: { x: bead.x, y: bead.y },
          box,
          post: postBox,
          points: post,
        };
      }
    }
  }
  return null;
}

/** Points along a signpost's post, every 3 units, for testing what it crosses. */
function postPoints(from: Point, to: Point): Point[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 3));
  return Array.from({ length: steps + 1 }, (_, k) => ({
    x: from.x + ((to.x - from.x) * k) / steps,
    y: from.y + ((to.y - from.y) * k) / steps,
  }));
}

/** True when a point comes within `by` of a box. */
function near(b: StoneExtent, p: Point, by: number): boolean {
  return p.x > b.left - by && p.x < b.right + by && p.y > b.top - by && p.y < b.bottom + by;
}

/**
 * The ground the Numbered Road covers, for keeping ground detail off it (05 §11: nothing hides a
 * road stone). It is the road as shown: each numbered stone at the largest extent it takes in any
 * state (so counting never moves a tuft), each bead with its ring, each signpost, and the trail at
 * its full width, with a clear zone around the next stone. Laying a stone clears the ground under
 * it. Returns a test: does this box touch the road?
 */
export function roadFootprint(
  plan: Pick<RoadPlan, 'scale' | 'numbered' | 'beads' | 'signs' | 'trail'>,
): (box: StoneExtent) => boolean {
  const scale = plan.scale;
  const grow = (b: StoneExtent, by: number) => ({
    left: b.left - by,
    right: b.right + by,
    top: b.top - by,
    bottom: b.bottom + by,
  });
  const boxes: StoneExtent[] = [];
  for (const s of plan.numbered) {
    const box = scaled(s, anyStateExtent(s.n), scale);
    boxes.push(s.state === 'next' ? grow(box, NEXT_CLEAR) : box);
  }
  for (const b of plan.beads) {
    // A bead is small, so its clear zone reaches as far as a numbered stone's would.
    boxes.push(b.state === 'next' ? grow(b.box, NEXT_CLEAR + 12) : b.box);
  }
  for (const s of plan.signs) boxes.push(s.box, s.post);
  const stones = plan.trail;
  // The trail (drawn 34 × scale wide) as discs along each segment.
  const trailR = (34 * scale) / 2 + 3;
  const discs: { x: number; y: number; r: number }[] = [];
  for (let i = 1; i < stones.length; i++) {
    const a = stones[i - 1] as Point;
    const b = stones[i] as Point;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / 6));
    for (let k = 0; k <= n; k++) {
      discs.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, r: trailR });
    }
  }
  // Bucket by plot-sized cells, so each test looks only at nearby road.
  const cw = ISLAND_LAYOUT.cellW;
  const ch = ISLAND_LAYOUT.cellH;
  const boxCells = new Map<string, StoneExtent[]>();
  for (const b of boxes) {
    for (let x = Math.floor(b.left / cw); x <= Math.floor(b.right / cw); x++) {
      for (let y = Math.floor(b.top / ch); y <= Math.floor(b.bottom / ch); y++) {
        const k = `${x},${y}`;
        boxCells.set(k, [...(boxCells.get(k) ?? []), b]);
      }
    }
  }
  const discCells = new Map<string, { x: number; y: number; r: number }[]>();
  for (const d of discs) {
    const k = `${Math.floor(d.x / cw)},${Math.floor(d.y / ch)}`;
    discCells.set(k, [...(discCells.get(k) ?? []), d]);
  }
  return (box) => {
    for (let x = Math.floor(box.left / cw) - 1; x <= Math.floor(box.right / cw) + 1; x++) {
      for (let y = Math.floor(box.top / ch) - 1; y <= Math.floor(box.bottom / ch) + 1; y++) {
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

/** True when two boxes come closer than `clearance`. */
export function boxesTouch(a: StoneExtent, b: StoneExtent, clearance: number): boolean {
  return (
    a.left < b.right + clearance &&
    b.left < a.right + clearance &&
    a.top < b.bottom + clearance &&
    b.top < a.bottom + clearance
  );
}
