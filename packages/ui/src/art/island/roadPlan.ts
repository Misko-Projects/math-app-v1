import type { IslandDef } from '@number-island/shared';
import {
  ISLAND_LAYOUT,
  type Point,
  roadLayout,
  type StonePlacement,
  smoothPathPoints,
} from './geometry';
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
/**
 * The next stone's smallest tap target radius in scene units (about 84 CSS px across at the
 * default zoom). Where the map is drawn smaller (portrait, small screens) the scene widens it to
 * stay ≥ 80 CSS px across (nextHitRadius).
 */
export const NEXT_HIT_RADIUS = 46;
/** The tap target's smallest diameter in CSS px (06 §4: K targets ≥ 80 px), with a small margin. */
export const NEXT_HIT_MIN_PX = 84;

/** The tap target's radius in scene units when one scene unit is `pxPerUnit` CSS px. */
export function nextHitRadius(pxPerUnit: number): number {
  if (!(pxPerUnit > 0)) return NEXT_HIT_RADIUS;
  return Math.max(NEXT_HIT_RADIUS, NEXT_HIT_MIN_PX / 2 / pxPerUnit);
}
/** Clear ground kept around the next stone, beyond its own extent (05 §11). */
const NEXT_CLEAR = 14;
/** Pairs further apart than this (scene units) can never touch at MAP_STONE_SCALE. */
const NEAR = 260;
/** The largest bead radius. */
const BEAD_MAX_R = 6.5;
/** World units per scene unit down the map (the plot grid is 100 × 70 on the tilted map). */
const TILT = ISLAND_LAYOUT.cellW / ISLAND_LAYOUT.cellH;

/** A bead's outline width: 2 on a roomy road, thinner on a tiny bead so it stays a bead. */
export function beadLine(r: number): number {
  return Math.max(0.3, Math.min(2, r * 0.5));
}

/** How far a bead draws from its centre: the bead with its shadow and outline. */
function plainReach(r: number): number {
  return r * 1.15 + beadLine(r) / 2;
}

/**
 * The bead radius for stones `gap` apart: as large as possible (up to BEAD_MAX_R) while two
 * neighbouring beads, drawn in full with their outlines (which thin on a tiny bead), stay at least
 * 0.5 apart, however close the stones are (any gap over 0.8 scene units; GameData puts no cap on
 * stones per plot).
 */
export function beadRadius(gap: number): number {
  const fits = (r: number) => 2 * plainReach(r) + 0.5 <= gap;
  if (fits(BEAD_MAX_R)) return BEAD_MAX_R;
  let lo = 0;
  let hi = BEAD_MAX_R;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * A signpost's post (or a stone's stem) width for a bead whose nearer neighbour is `gap` away: 3
 * on a roomy road, thinner on a dense one, so it always passes between its bead's neighbours.
 */
export function postWidth(gap: number): number {
  return Math.max(0.6, Math.min(3, gap * 0.8));
}

/** How far a bead (or a pin) draws from its centre. */
export function beadReach(b: Pick<RoadBead, 'r'>): number {
  return plainReach(b.r);
}

/** The box around a bead as drawn (beadReach all round). */
export function beadExtent(b: Pick<RoadBead, 'x' | 'y' | 'r'>): StoneExtent {
  const d = beadReach(b);
  return { left: b.x - d, right: b.x + d, top: b.y - d, bottom: b.y + d };
}

/** A highlighted stone standing beside a crowded road, joined by a stem to its pin on the road. */
export interface StoneCallout {
  /** Its own place on the road (where its pin is). */
  spot: Point;
  /** Points along the stem (1 unit apart), from the pin's edge to the stone. */
  points: Point[];
  /** The stem's line width (thinner on a dense road; see postWidth). */
  width: number;
}

export interface PlannedStone {
  n: number;
  x: number;
  y: number;
  state: RoadStoneState;
  /** Scene-unit box of everything the stone draws now (after scaling). */
  box: StoneExtent;
  /**
   * Set when the stone stands beside a crowded road (the next or counted stone among beads): it
   * is a full numbered stone, and its own place on the road keeps a pin, joined by a stem.
   */
  callout?: StoneCallout;
}

/**
 * A stone drawn as a small bead, where the road is too crowded for a numbered stone. When the
 * stone is the next or counted one, its bead is a pin: the stone itself stands beside the road
 * (PlannedStone.callout).
 */
export interface RoadBead {
  n: number;
  x: number;
  y: number;
  r: number;
  state: RoadStoneState;
  /** True when the stone stands beside the road as a full stone, and this is its pin. */
  pin: boolean;
  /** The gap to its nearer neighbour on the road (its size and its signpost's post follow it). */
  gap: number;
  /** Scene-unit box of everything the bead draws. */
  box: StoneExtent;
}

/** A numbered signpost by a bead: stone 1, the tens and hundreds. */
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
  /** Points along the post (1 unit apart), from the bead's edge to the plaque. */
  points: Point[];
  /** The post's line width (thinner on a dense road; see postWidth). */
  postWidth: number;
}

export interface RoadPlan {
  /** Numbered stones' scale on the map (MAP_STONE_SCALE). */
  scale: number;
  /**
   * Numbered stones: where the road has room, and always the next and counted stones (beside the
   * road on a stem where it is crowded). Never touching anything.
   */
  numbered: PlannedStone[];
  /** Stones drawn as beads (or pins), where it is crowded: every one of them, evenly spaced. */
  beads: RoadBead[];
  /** Numbered signposts by beads. Never touching a stone, a bead or each other. */
  signs: RoadSign[];
  /** The trail through the laid stones (or through every shown stone when fewer than two are laid). */
  trail: Point[];
  /** Every shown stone's own spot on the road (laid, next and planned-ahead stones on land). */
  spots: StonePlacement[];
  /** The next stone's centre as drawn, for its tap target (null when no next stone is shown). */
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

interface BeadSize {
  r: number;
  /** The gap to the nearer neighbour on the road, which the size was fitted to. */
  gap: number;
}

interface RoadShape {
  numbered: ReadonlySet<number>;
  /** Each stone's bead size, from the gap to its nearer neighbour on the road. */
  bead: ReadonlyMap<number, BeadSize>;
  /** Each stone's place on the map: its layout spot, with runs of beads evenly spaced. */
  pos: ReadonlyMap<number, Point>;
}

const shapes = new WeakMap<IslandDef['road'], RoadShape>();

/**
 * Which stones of a road are numbered stones and which are beads, and where each one sits,
 * decided once from the whole road's layout (so a stone never changes form or moves as the road
 * grows, is counted or the island grows). Landmarks first (stone 1, then the tens and hundreds),
 * then every other stone in road order, a stone is numbered when its whole extent, in any state,
 * clears every stone numbered so far and every other stone's bead; otherwise it is a bead.
 *
 * Stones sharing a plot are evenly spaced along the road, so a stretch of one density is evenly
 * spaced in world units (a step down the map looks shorter on screen only because of the map's
 * tilt). Where a lone bead (the only stone on its plot) meets a denser stretch, it moves along the
 * road towards that stretch, staying on its plot, until its step is the denser stretch's: no gap
 * there is wider than the steps beside it, so none reads as a missing stone. Each bead is then
 * sized by beadRadius from the gap to its nearer neighbour.
 */
export function roadShape(road: IslandDef['road']): RoadShape {
  const cached = shapes.get(road);
  if (cached) return cached;
  const placed = roadLayout(road);
  const gapAt = (pts: readonly Point[], i: number) => {
    const d = (j: number) => {
      const a = pts[j];
      const b = pts[j + 1];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Number.POSITIVE_INFINITY;
    };
    return Math.min(d(i - 1), d(i));
  };
  const beadBox = (p: Point, r: number) => beadExtent({ x: p.x, y: p.y, r });
  // Decide forms on the layout spots.
  const firstR = placed.map((_, i) => {
    const gap = gapAt(placed, i);
    return Number.isFinite(gap) ? beadRadius(gap) : BEAD_MAX_R;
  });
  const beads = placed.map((s, i) => beadBox(s, firstR[i] as number));
  const full = placed.map((s) => scaled(s, anyStateExtent(s.n), MAP_STONE_SCALE));
  const numbered = new Set<number>();
  const isNumbered: boolean[] = [];
  const landmark = (n: number) => n === 1 || n % 10 === 0;
  const order = placed
    .map((s, i) => ({ i, n: s.n }))
    .sort((a, b) => Number(landmark(b.n)) - Number(landmark(a.n)) || a.n - b.n);
  for (const { i } of order) {
    const a = placed[i] as StonePlacement;
    let clear = true;
    for (let j = 0; j < placed.length && clear; j++) {
      if (j === i) continue;
      const b = placed[j] as StonePlacement;
      if (Math.abs(a.x - b.x) > NEAR || Math.abs(a.y - b.y) > NEAR) continue;
      // A stone already numbered is checked at its full extent; any other at its bead.
      const other = isNumbered[j] ? full[j] : beads[j];
      if (boxesTouch(full[i] as StoneExtent, other as StoneExtent, STONE_CLEARANCE)) clear = false;
    }
    isNumbered[i] = clear;
    if (clear) numbered.add(a.n);
  }
  // A lone bead next to a denser stretch steps towards it, so its gap matches that stretch's step.
  const perPlot = new Map<string, number>();
  for (const s of placed) perPlot.set(`${s.plot}`, (perPlot.get(`${s.plot}`) ?? 0) + 1);
  const m = placed.map((s) => perPlot.get(`${s.plot}`) ?? 1);
  const pts: Point[] = placed.map((s) => ({ x: s.x, y: s.y }));
  const world = (p: Point) => ({ x: p.x, y: p.y * TILT });
  for (let i = 0; i < placed.length; i++) {
    if (isNumbered[i] || m[i] !== 1) continue;
    const denser = [i - 1, i + 1]
      .filter((j) => j >= 0 && j < placed.length && !isNumbered[j] && (m[j] as number) > 1)
      .sort((a, b) => (m[b] as number) - (m[a] as number))[0];
    if (denser === undefined) continue;
    const step = ISLAND_LAYOUT.cellW / (m[denser] as number);
    const a = world(pts[i] as Point);
    const b = world(pts[denser] as Point);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    // Move at most 0.45 of a plot, so the stone stays on its own plot.
    const move = Math.min(d - step, 0.45 * ISLAND_LAYOUT.cellW);
    if (move <= 0) continue;
    const t = move / d;
    pts[i] = { x: a.x + (b.x - a.x) * t, y: (a.y + (b.y - a.y) * t) / TILT };
  }
  const pos = new Map<number, Point>();
  const bead = new Map<number, BeadSize>();
  placed.forEach((s, i) => {
    pos.set(s.n, pts[i] as Point);
    const gap = gapAt(pts, i);
    bead.set(s.n, Number.isFinite(gap) ? { r: beadRadius(gap), gap } : { r: BEAD_MAX_R, gap: 100 });
  });
  const shape = { numbered, bead, pos };
  shapes.set(road, shape);
  return shape;
}

/**
 * Decide how the Numbered Road is drawn (05 §3: a linear board; every number has a stone, in
 * order, and moving along it counts aloud). Every shown stone has its own place on the road, in
 * order, evenly spaced along each crowded run:
 *
 * - where the road has room, a numbered stone (one scale, so every numeral is one size);
 * - where stones crowd (for example three to a plot), a small bead, so the beads between two
 *   numbers always equal the numbers missing;
 * - the next and counted stones are always full numbered stones with their state's treatment.
 *   Among beads, such a stone stands just beside the road on a short stem from a pin at its own
 *   place (so the count along the road stays true), never touching anything;
 * - signposts carry stone 1, the hundreds and the tens among beads, wherever there is room (on a
 *   map packed with beads a ten may stay unlabelled; landmarks are numbered stones first wherever
 *   they fit, see roadShape).
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
  const placed = roadLayout(road).map((s) => {
    const p = shape.pos.get(s.n) ?? s;
    return { ...s, x: p.x, y: p.y };
  });
  const lastShown = roadLength + (showNext ? 1 + plannedAhead : 0);
  const shown = placed.filter((s) => s.n <= lastShown && (!onLand || onLand(s)));
  const laid = shown.filter((s) => s.n <= roadLength);
  const trail = (laid.length > 1 ? laid : shown).map((s) => ({ x: s.x, y: s.y }));
  const stateOf = (n: number): RoadStoneState =>
    n === counting
      ? 'counting'
      : n <= roadLength
        ? 'laid'
        : n === roadLength + 1
          ? 'next'
          : 'planned';
  const highlighted = (st: RoadStoneState) => st === 'next' || st === 'counting';

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
      const size = shape.bead.get(s.n) ?? { r: BEAD_MAX_R, gap: 100 };
      const b = { n: s.n, x: s.x, y: s.y, r: size.r, gap: size.gap, state };
      beads.push({ ...b, pin: highlighted(state), box: beadExtent(b) });
    }
  }

  // Obstacles: each bead as drawn (a box for a stone or plaque, its disc for a thin stem or
  // post), and each numbered stone at its largest extent.
  const obstacles: Obstacle[] = [
    ...beads.map((b) => ({
      n: b.n,
      box: beadExtent(b),
      disc: { x: b.x, y: b.y, r: beadReach(b) },
    })),
    ...numbered.map((s) => ({ n: s.n, box: scaled(s, anyStateExtent(s.n), scale) })),
  ];

  // The counted and next stones among beads stand beside the road; the landmark signposts go
  // where there is room. Both orders are tried when the first leaves a stone on the road or a
  // landmark unlabelled, and the better kept: every highlight beside the road first, then the
  // most signposts.
  const index = new ObstacleIndex(obstacles);
  const highlights = beads
    .filter((b) => b.pin)
    .sort((a, b) => Number(b.state === 'counting') - Number(a.state === 'counting'));
  // A landmark is every tenth stone of its stretch: the tens and hundreds where the road counts
  // by ones, the hundreds where it counts by tens (05 §3: counting on by tens has landmarks).
  const stepBefore = new Map<number, number>();
  for (const [i, st] of road.entries()) {
    stepBefore.set(st.n, i > 0 ? st.n - (road[i - 1]?.n ?? 0) : 1);
  }
  const landmark = (n: number, every: number) => {
    const step = stepBefore.get(n) ?? 1;
    return n % (every * step) === 0;
  };
  const rank = (b: RoadBead) =>
    b.pin || b.state === 'planned' || b.state === 'next'
      ? 9
      : b.n === 1
        ? 2
        : landmark(b.n, 100)
          ? 3
          : landmark(b.n, 10)
            ? 4
            : 9;
  const wanted = beads.filter((b) => rank(b) < 9).sort((a, b) => rank(a) - rank(b) || a.n - b.n);
  const placeSigns = (extra: readonly Obstacle[]) => {
    const placed: RoadSign[] = [];
    for (const b of wanted) {
      const sign = placeSign(b, index, placed, extra);
      if (sign) placed.push(sign);
    }
    return placed;
  };
  // Is a box wholly on land (all its corners on land plots)? Without a land test, anywhere is.
  const { padX, skyH, padTop, cellW, cellH } = ISLAND_LAYOUT;
  const landAt = (x: number, y: number) =>
    !onLand ||
    onLand({
      n: 0,
      x,
      y,
      plot: [Math.floor((x - padX) / cellW), Math.floor((y - skyH - padTop) / cellH)],
    } as StonePlacement);
  const boxOnLand = (b: StoneExtent) =>
    landAt(b.left, b.top) &&
    landAt(b.right, b.top) &&
    landAt(b.left, b.bottom) &&
    landAt(b.right, b.bottom);
  const stonesFirst = () => {
    const stones = placeHighlights(highlights, scale, index, [], boxOnLand);
    return { stones, signs: placeSigns(stones.map(stoneObstacle)) };
  };
  const signsFirst = () => {
    const signs = placeSigns([]);
    return {
      stones: placeHighlights(highlights, scale, index, signs.map(signObstacle), boxOnLand),
      signs,
    };
  };
  const onRoad = (r: { stones: PlannedStone[] }) => r.stones.filter((st) => !st.callout).length;
  let best = stonesFirst();
  if (onRoad(best) > 0 || best.signs.length < wanted.length) {
    const other = signsFirst();
    if (
      onRoad(other) < onRoad(best) ||
      (onRoad(other) === onRoad(best) && other.signs.length > best.signs.length)
    ) {
      best = other;
    }
  }
  numbered.push(...best.stones);
  // Drawn back to front, so a lower stone's ring or flag is never hidden by the row behind it.
  numbered.sort((a, b) => a.y - b.y || a.n - b.n);
  const signs = [...best.signs].sort((a, b) => a.y - b.y || a.n - b.n);

  const nextStone = numbered.find((s) => s.state === 'next');
  const next = nextStone ? { x: nextStone.x, y: nextStone.y } : null;
  return { scale, numbered, beads, signs, trail, spots: shown, next };
}

/** Post and stem lengths and sideways leans to try, nearest first. */
const SIGN_POSTS = [16, 28, 42, 58, 76, 96, 120, 150, 185];
const STEM_LENGTHS = [3, 6, 10, 14, 20, 28, 40, 54, 70, 90, 115, 145];
const SIGN_LEANS = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6];
/** A sign's plaque height, and its width per digit (plus padding), in scene units. */
const SIGN_H = 32;
const SIGN_DIGIT_W = 14;
const SIGN_PAD = 20;
/** How far a signpost's flag reaches above and right of its plaque. */
const SIGN_FLAG = 15;
/** The most places a signpost tries, nearest first. */
const SIGN_TRIES = 300;

/**
 * Something a signpost or stem keeps clear of: its box; for a bead the disc it draws; for a
 * stone beside the road, its stem's points and width.
 */
interface Obstacle {
  n: number;
  box: StoneExtent;
  disc?: { x: number; y: number; r: number };
  points?: Point[];
  pw?: number;
  /** Extra clear space kept from it (a stone beside the road, a signpost: they never crowd). */
  gap?: number;
}

/** Obstacles bucketed by 50-unit cells (their box, and their stem's points), for local queries. */
class ObstacleIndex {
  private readonly cells = new Map<string, Obstacle[]>();
  private static readonly CELL = 50;

  constructor(items: readonly Obstacle[]) {
    for (const o of items) this.add(o);
  }

  add(o: Obstacle) {
    const xs = [o.box.left, o.box.right, ...(o.points ?? []).map((p) => p.x)];
    const ys = [o.box.top, o.box.bottom, ...(o.points ?? []).map((p) => p.y)];
    const c = ObstacleIndex.CELL;
    for (let x = Math.floor(Math.min(...xs) / c); x <= Math.floor(Math.max(...xs) / c); x++) {
      for (let y = Math.floor(Math.min(...ys) / c); y <= Math.floor(Math.max(...ys) / c); y++) {
        const k = `${x},${y}`;
        const list = this.cells.get(k);
        if (list) list.push(o);
        else this.cells.set(k, [o]);
      }
    }
  }

  /** Every obstacle whose bucket overlaps this box, grown by `by`. */
  near(box: StoneExtent, by: number): Obstacle[] {
    const c = ObstacleIndex.CELL;
    const found = new Set<Obstacle>();
    for (let x = Math.floor((box.left - by) / c); x <= Math.floor((box.right + by) / c); x++) {
      for (let y = Math.floor((box.top - by) / c); y <= Math.floor((box.bottom + by) / c); y++) {
        for (const o of this.cells.get(`${x},${y}`) ?? []) found.add(o);
      }
    }
    return [...found];
  }
}

/** The box around a stone or plaque and its stem or post. */
function spanOf(box: StoneExtent, points: readonly Point[]): StoneExtent {
  const xs = [box.left, box.right, ...points.map((p) => p.x)];
  const ys = [box.top, box.bottom, ...points.map((p) => p.y)];
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

/** The box around a straight post or stem from `a` to `b`. */
function lineSpan(a: Point, b: Point): StoneExtent {
  return {
    left: Math.min(a.x, b.x),
    right: Math.max(a.x, b.x),
    top: Math.min(a.y, b.y),
    bottom: Math.max(a.y, b.y),
  };
}

/** True when a post or stem (its points, half-width `half`) comes too near an obstacle. */
function lineClashes(
  o: Obstacle,
  points: readonly Point[],
  span: StoneExtent,
  half: number,
): boolean {
  // Only an obstacle whose box (or stem) reaches the line's own box can touch it.
  const reach = half + 2 + (o.gap ?? 0) + (o.pw ?? 0);
  const oSpan = o.points?.length ? spanOf(o.box, o.points) : o.box;
  if (!boxesTouch(oSpan, span, reach)) return false;
  return points.some((p) => lineHits(o, p, half));
}

/** True when a line point of half-width `half` comes too near an obstacle. */
function lineHits(o: Obstacle, p: Point, half: number): boolean {
  if (o.disc) return Math.hypot(p.x - o.disc.x, p.y - o.disc.y) < o.disc.r + half + 0.2;
  if (near(o.box, p, half + 1.5 + (o.gap ?? 0))) return true;
  const ow = (o.pw ?? 0) / 2;
  return (o.points ?? []).some((q) => Math.hypot(p.x - q.x, p.y - q.y) < ow + half + 0.3);
}

/** True when a box (a plaque or a stone) comes too near an obstacle. */
function boxHits(o: Obstacle, box: StoneExtent, clearance: number): boolean {
  if (boxesTouch(o.box, box, Math.max(clearance, o.gap ?? 0))) return true;
  const ow = (o.pw ?? 0) / 2;
  return (o.points ?? []).some((q) => near(box, q, ow + 1.5 + (o.gap ?? 0)));
}

/**
 * Candidate places beside a bead for something whose extent around its centre is `e`, shortest
 * reach first: its near edge `len` beyond the bead's edge, above, below, left or right, leaning
 * either way along that edge.
 */
function* besideBead(bead: RoadBead, e: StoneExtent, lengths: readonly number[]) {
  const w = e.right - e.left;
  const h = e.bottom - e.top;
  for (const len of lengths) {
    for (const side of ['up', 'down', 'left', 'right'] as const) {
      for (const lean of SIGN_LEANS) {
        const reach = bead.r + len;
        let x = bead.x;
        let y = bead.y;
        if (side === 'up') {
          x += lean * (w * 0.5);
          y -= reach + e.bottom;
        } else if (side === 'down') {
          x += lean * (w * 0.5);
          y += reach - e.top;
        } else if (side === 'left') {
          x -= reach + e.right;
          y += lean * (h * 0.5);
        } else {
          x += reach - e.left;
          y += lean * (h * 0.5);
        }
        const across = side === 'left' || side === 'right';
        const dir = side === 'up' || side === 'left' ? -1 : 1;
        const from = across
          ? { x: bead.x + dir * bead.r, y: bead.y }
          : { x: bead.x, y: bead.y + dir * bead.r };
        const to = across
          ? { x: dir < 0 ? x + e.right : x + e.left, y }
          : { x, y: dir < 0 ? y + e.bottom : y + e.top };
        yield { x, y, from, to };
      }
    }
  }
}

/** A stone beside the road (with its stem), or a signpost, as an obstacle for the others. */
/** Clear space always kept between a stone beside the road and a signpost (and their stems). */
const LABEL_GAP = 8;

function stoneObstacle(st: PlannedStone): Obstacle {
  return {
    n: st.n,
    box: st.box,
    points: st.callout?.points ?? [],
    pw: st.callout?.width ?? 0,
    gap: LABEL_GAP,
  };
}
function signObstacle(sg: RoadSign): Obstacle {
  return { n: sg.n, box: sg.box, points: sg.points, pw: sg.postWidth, gap: LABEL_GAP };
}

/**
 * Every clear place, nearest first, for the next or counted stone beside its crowded stretch of
 * road: a full numbered stone with its state's treatment above, below, left or right of its pin,
 * joined by a stem, clear of every bead, stone, stem and signpost.
 */
function* calloutsFor(
  bead: RoadBead,
  scale: number,
  index: ObstacleIndex,
  extra: readonly Obstacle[],
  onLand: (box: StoneExtent) => boolean,
): Generator<PlannedStone> {
  const e = stoneExtent(bead.n, bead.state);
  const width = postWidth(bead.gap);
  const around = scaled({ x: 0, y: 0 }, e, scale);
  // Places wholly on land first (the stone and its ring clear of the shore and its foam), within
  // a short reach; then anywhere clear.
  const nearLengths = STEM_LENGTHS.filter((l) => l <= 54);
  const candidates = function* () {
    const tried = new Set<string>();
    for (const c of besideBead(bead, around, nearLengths)) {
      if (!onLand(scaled(c, e, scale))) continue;
      tried.add(`${c.x},${c.y}`);
      yield c;
    }
    for (const c of besideBead(bead, around, STEM_LENGTHS)) {
      if (!tried.has(`${c.x},${c.y}`)) yield c;
    }
  };
  for (const c of candidates()) {
    const box = scaled(c, e, scale);
    const stem = postPoints(c.from, c.to);
    const stemSpan = lineSpan(c.from, c.to);
    const clashes = (o: Obstacle) =>
      o.n !== bead.n &&
      (boxHits(o, box, o.disc ? 2 : STONE_CLEARANCE) || lineClashes(o, stem, stemSpan, width / 2));
    const near = index.near(spanOf(box, stem), STONE_CLEARANCE + width + 4);
    if (near.some(clashes) || extra.some(clashes)) continue;
    yield {
      n: bead.n,
      x: c.x,
      y: c.y,
      state: bead.state,
      box,
      callout: { spot: { x: bead.x, y: bead.y }, points: stem, width },
    };
  }
}

/** The stone on its own place: used only when nowhere beside the road is clear. */
function onItsPlace(bead: RoadBead, scale: number): PlannedStone {
  const e = stoneExtent(bead.n, bead.state);
  return { n: bead.n, x: bead.x, y: bead.y, state: bead.state, box: scaled(bead, e, scale) };
}

/** How many clear places to consider for each highlighted stone when placing them together. */
const JOINT_TRIES = 120;

/** The first `k` items of a generator. */
function take<T>(items: Iterable<T>, k: number): T[] {
  const out: T[] = [];
  for (const item of items) {
    out.push(item);
    if (out.length >= k) break;
  }
  return out;
}

/** True when a stone beside the road (with its stem) would crowd an obstacle. */
function stoneClashes(st: PlannedStone, o: Obstacle): boolean {
  const half = (st.callout?.width ?? 0) / 2;
  return (
    boxHits(o, st.box, STONE_CLEARANCE) ||
    (st.callout?.points ?? []).some((p) => lineHits(o, p, half))
  );
}

/**
 * Stand the counted and next stones (in that order) beside the road. Each one's clear places are
 * found once, nearest first; the pair is the counted stone's nearest place for which the next
 * stone still has one, so both stand beside the road wherever the road allows. A stone with no
 * clear place at all stands on its own place: it is always a full numbered stone.
 */
function placeHighlights(
  highlights: readonly RoadBead[],
  scale: number,
  index: ObstacleIndex,
  extra: readonly Obstacle[],
  onLand: (box: StoneExtent) => boolean,
): PlannedStone[] {
  const [first, second] = highlights;
  if (!first) return [];
  const nearest = (b: RoadBead, more: readonly Obstacle[]) =>
    calloutsFor(b, scale, index, more, onLand).next().value;
  const a0 = nearest(first, extra);
  if (!second) return [a0 ?? onItsPlace(first, scale)];
  // Usually each stone's nearest place works together.
  if (a0) {
    const b0 = nearest(second, [...extra, stoneObstacle(a0)]);
    if (b0) return [a0, b0];
  }
  const firsts = take(calloutsFor(first, scale, index, extra, onLand), JOINT_TRIES);
  const seconds = take(calloutsFor(second, scale, index, extra, onLand), JOINT_TRIES);
  for (const a of firsts) {
    const ao = stoneObstacle(a);
    const b = seconds.find((c) => !stoneClashes(c, ao));
    if (b) return [a, b];
  }
  const a = firsts[0] ?? onItsPlace(first, scale);
  const ao = stoneObstacle(a);
  const b = seconds.find((c) => !stoneClashes(c, ao)) ?? onItsPlace(second, scale);
  return [a, b];
}

/**
 * Find a clear spot for a bead's signpost, the shortest post first: above the bead, below it, or
 * to its left or right (beside a road that runs up the map), each leaning a little either way.
 */
function placeSign(
  bead: RoadBead,
  index: ObstacleIndex,
  signs: readonly RoadSign[],
  extra: readonly Obstacle[],
): RoadSign | null {
  const w = SIGN_DIGIT_W * String(bead.n).length + SIGN_PAD;
  const h = SIGN_H;
  const pw = postWidth(bead.gap);
  // A ten's or hundred's signpost flies the stone's flag from its top right corner.
  const flag = bead.n % 10 === 0 ? SIGN_FLAG : 0;
  const around = { left: -w / 2, right: w / 2 + flag, top: -h / 2 - flag, bottom: h / 2 };
  let tried = 0;
  for (const c of besideBead(bead, around, SIGN_POSTS)) {
    // A signpost is best placed near its bead: past the nearest few hundred places, give up.
    if (++tried > SIGN_TRIES) break;
    const box = scaled(c, around, 1);
    const post = postPoints(c.from, c.to);
    const postSpan = lineSpan(c.from, c.to);
    const clashes = (o: Obstacle) =>
      o.n !== bead.n && (boxHits(o, box, 2) || lineClashes(o, post, postSpan, pw / 2));
    const blocked =
      index.near(spanOf(box, post), pw + 6).some(clashes) ||
      extra.some(clashes) ||
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
      x: c.x,
      y: c.y,
      w,
      h,
      anchor: { x: bead.x, y: bead.y },
      box,
      post: {
        left: Math.min(c.from.x, c.to.x) - pw / 2,
        right: Math.max(c.from.x, c.to.x) + pw / 2,
        top: Math.min(c.from.y, c.to.y),
        bottom: Math.max(c.from.y, c.to.y),
      },
      points: post,
      postWidth: pw,
    };
  }
  return null;
}

/** Points along a post or stem, every unit, for testing what it crosses. */
function postPoints(from: Point, to: Point): Point[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)));
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
 * state (so counting never moves a tuft), a stone beside the road with its stem, each bead or pin,
 * each signpost, and the trail at its full width, with a clear zone around the next stone. Laying
 * a stone clears the ground under it. Returns a test: does this box touch the road?
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
    const box = s.callout ? s.box : scaled(s, anyStateExtent(s.n), scale);
    boxes.push(s.state === 'next' ? grow(box, NEXT_CLEAR) : box);
    if (s.callout) {
      const xs = s.callout.points.map((p) => p.x);
      const ys = s.callout.points.map((p) => p.y);
      const half = s.callout.width / 2;
      boxes.push({
        left: Math.min(...xs) - half,
        right: Math.max(...xs) + half,
        top: Math.min(...ys) - half,
        bottom: Math.max(...ys) + half,
      });
    }
  }
  for (const b of plan.beads) boxes.push(b.box);
  for (const s of plan.signs) boxes.push(s.box, s.post);
  // The trail, drawn 34 × scale wide along smoothPath's curve, as discs along that same curve
  // (turns included, where the curve leaves the straight line between stones).
  const trailR = (34 * scale) / 2 + 3;
  const discs =
    plan.trail.length > 1
      ? smoothPathPoints(plan.trail, 4).map((p) => ({ x: p.x, y: p.y, r: trailR }))
      : [];
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
