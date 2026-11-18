import type { IslandDef, Plot } from '@number-island/shared';
import { hashSeed, seededRandom } from '../core/paint';

/**
 * Island map geometry (05 §3): a gently tilted top-down 12 × 8 plot grid. One plot is a CELL_W ×
 * CELL_H rectangle in scene units; the vertical squash (0.7) is the "gentle tilt". The scene adds a
 * sky band above the sea and a sea margin around the grid. Everything that sits on a plot
 * (buildings, decor, road stones, plot markers) is placed with `plotBox` / `plotCenter`, so the
 * island hub (I01) and the art kit agree on positions.
 */
export const ISLAND_LAYOUT = {
  cols: 12,
  rows: 8,
  cellW: 100,
  cellH: 70,
  /** Sea margin left and right of the grid. */
  padX: 100,
  /** The sky band at the top (the tilted view shows the horizon). */
  skyH: 150,
  /** Sea between the horizon and the grid's first row. */
  padTop: 70,
  /** Sea below the grid's last row. */
  padBottom: 90,
  /** Height of the island's side face (the "lip" that shows the tilt). */
  lip: 16,
} as const;

/** The whole scene's size in scene units (1400 × 870, close to the 1280 × 800 tablet ratio). */
export const SCENE_W = ISLAND_LAYOUT.cols * ISLAND_LAYOUT.cellW + 2 * ISLAND_LAYOUT.padX;
export const SCENE_H =
  ISLAND_LAYOUT.skyH +
  ISLAND_LAYOUT.padTop +
  ISLAND_LAYOUT.rows * ISLAND_LAYOUT.cellH +
  ISLAND_LAYOUT.padBottom;

/** y of the horizon line. */
export const HORIZON_Y = ISLAND_LAYOUT.skyH;
const GRID_X = ISLAND_LAYOUT.padX;
const GRID_Y = ISLAND_LAYOUT.skyH + ISLAND_LAYOUT.padTop;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A grid point (cell corner) → scene units. */
export function gridToScene(gx: number, gy: number): Point {
  return { x: GRID_X + gx * ISLAND_LAYOUT.cellW, y: GRID_Y + gy * ISLAND_LAYOUT.cellH };
}

/** The scene box of a plot, or of a footprint whose top-left plot is `plot`. */
export function plotBox(plot: Plot, footprint: readonly [number, number] = [1, 1]): Box {
  const { x, y } = gridToScene(plot[0], plot[1]);
  return {
    x,
    y,
    w: footprint[0] * ISLAND_LAYOUT.cellW,
    h: footprint[1] * ISLAND_LAYOUT.cellH,
  };
}

/** The centre of a plot (or footprint) in scene units. */
export function plotCenter(plot: Plot, footprint: readonly [number, number] = [1, 1]): Point {
  const b = plotBox(plot, footprint);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export const plotKey = (p: Plot) => `${p[0]},${p[1]}`;

/** The land plots of the first `ringsUnlocked` rings (05 §3: rings expand the sandbar). */
export function landPlots(island: Pick<IslandDef, 'rings'>, ringsUnlocked: number): Plot[] {
  const seen = new Set<string>();
  const out: Plot[] = [];
  for (const ring of island.rings.slice(0, Math.max(0, ringsUnlocked))) {
    for (const p of ring.plots) {
      const k = plotKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([p[0], p[1]]);
    }
  }
  return out;
}

const DIRS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/**
 * The outlines of a union of grid cells, as closed loops of grid points. Loops run clockwise on
 * screen (y down) with the land on the right-hand side, so holes run the other way and an
 * even-odd or nonzero fill both work. Collinear points are removed.
 */
export function traceOutline(cells: readonly Plot[]): Point[][] {
  const land = new Set(cells.map(plotKey));
  const has = (x: number, y: number) => land.has(`${x},${y}`);
  // Directed boundary edges, keyed by start point.
  const edges = new Map<string, Point[]>();
  const add = (a: Point, b: Point) => {
    const k = `${a.x},${a.y}`;
    edges.set(k, [...(edges.get(k) ?? []), b]);
  };
  for (const [x, y] of cells) {
    if (!has(x, y - 1)) add({ x, y }, { x: x + 1, y });
    if (!has(x + 1, y)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (!has(x, y + 1)) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
    if (!has(x - 1, y)) add({ x, y: y + 1 }, { x, y });
  }
  const loops: Point[][] = [];
  const take = (from: Point, dir: Point | null): Point | null => {
    const k = `${from.x},${from.y}`;
    const outs = edges.get(k);
    if (!outs || outs.length === 0) return null;
    let i = 0;
    if (outs.length > 1 && dir) {
      // Two cells touching only at a corner: turn right first, so each loop stays 4-connected.
      const rank = (b: Point) => {
        const d = { x: b.x - from.x, y: b.y - from.y };
        const cross = dir.x * d.y - dir.y * d.x;
        return cross > 0 ? 0 : cross === 0 ? 1 : 2;
      };
      i = outs.reduce((best, b, j) => (rank(b) < rank(outs[best] as Point) ? j : best), 0);
    }
    const [next] = outs.splice(i, 1);
    if (outs.length === 0) edges.delete(k);
    return next ?? null;
  };
  while (edges.size > 0) {
    const startKey = [...edges.keys()].sort()[0] as string;
    const [sx, sy] = startKey.split(',').map(Number) as [number, number];
    const start = { x: sx, y: sy };
    const loop: Point[] = [start];
    let cur = start;
    let dir: Point | null = null;
    for (let guard = 0; guard < 10_000; guard++) {
      const next = take(cur, dir);
      if (!next) break;
      dir = { x: next.x - cur.x, y: next.y - cur.y };
      if (next.x === start.x && next.y === start.y) break;
      loop.push(next);
      cur = next;
    }
    loops.push(simplify(loop));
  }
  return loops;
}

function simplify(loop: Point[]): Point[] {
  const n = loop.length;
  return loop.filter((p, i) => {
    const a = loop[(i - 1 + n) % n] as Point;
    const b = loop[(i + 1) % n] as Point;
    return (a.x - p.x) * (b.y - p.y) - (a.y - p.y) * (b.x - p.x) !== 0;
  });
}

/**
 * Scene-unit loops for a union of plots, pushed outwards by `offset` scene units (negative insets).
 * The loops are rectilinear, so each corner moves along the sum of its two edges' outward normals.
 */
export function landLoops(cells: readonly Plot[], offset = 0): Point[][] {
  return traceOutline(cells).map((loop) => {
    const n = loop.length;
    return loop.map((p, i) => {
      const prev = loop[(i - 1 + n) % n] as Point;
      const next = loop[(i + 1) % n] as Point;
      const din = unit({ x: p.x - prev.x, y: p.y - prev.y });
      const dout = unit({ x: next.x - p.x, y: next.y - p.y });
      // Outward normal of a clockwise (land-on-the-right) edge: (dy, -dx).
      const nx = din.y + dout.y;
      const ny = -din.x - dout.x;
      const s = gridToScene(p.x, p.y);
      return { x: s.x + nx * offset, y: s.y + ny * offset };
    });
  });
}

function unit(d: Point): Point {
  const len = Math.hypot(d.x, d.y) || 1;
  return { x: d.x / len, y: d.y / len };
}

/** A closed SVG path through `loops`, every corner rounded with up to `radius` scene units. */
export function roundedPath(loops: readonly Point[][], radius: number): string {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return loops
    .filter((loop) => loop.length >= 3)
    .map((loop) => {
      const n = loop.length;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const prev = loop[(i - 1 + n) % n] as Point;
        const cur = loop[i] as Point;
        const next = loop[(i + 1) % n] as Point;
        const lin = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        const lout = Math.hypot(next.x - cur.x, next.y - cur.y);
        const r = Math.min(radius, lin / 2, lout / 2);
        const a = {
          x: cur.x - ((cur.x - prev.x) / lin) * r,
          y: cur.y - ((cur.y - prev.y) / lin) * r,
        };
        const b = {
          x: cur.x + ((next.x - cur.x) / lout) * r,
          y: cur.y + ((next.y - cur.y) / lout) * r,
        };
        parts.push(
          `${i === 0 ? 'M' : 'L'}${r1(a.x)} ${r1(a.y)}Q${r1(cur.x)} ${r1(cur.y)} ${r1(b.x)} ${r1(b.y)}`,
        );
      }
      return `${parts.join('')}Z`;
    })
    .join('');
}

export interface OrganicOptions {
  /** Corner rounding in scene units. */
  radius: number;
  /** Largest sideways wobble of the coastline, in scene units (0 = straight edges). */
  wobble?: number;
  /** Spacing of wobble points along an edge. */
  step?: number;
  /** Seed, so each layer (halo, foam, land) wobbles on its own but the same on every load. */
  seed?: number;
}

/**
 * A closed, soft coastline through rectilinear loops (05 §11: soft rounded shapes): every corner is
 * rounded, long edges get a gentle deterministic wobble, and the whole loop is smoothed with a
 * closed Catmull–Rom spline. The wobble stays within ±`wobble` of the loop, so a plot's own area is
 * never cut by more than that.
 */
export function organicPath(loops: readonly Point[][], opts: OrganicOptions): string {
  const { radius, wobble = 0, step = 46, seed = 1 } = opts;
  return loops
    .filter((loop) => loop.length >= 3)
    .map((loop, li) => {
      const n = loop.length;
      const rnd = seededRandom(hashSeed(seed, li, Math.round(loop[0]?.x ?? 0)));
      const pts: Point[] = [];
      for (let i = 0; i < n; i++) {
        const prev = loop[(i - 1 + n) % n] as Point;
        const cur = loop[i] as Point;
        const next = loop[(i + 1) % n] as Point;
        const lin = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
        const lout = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
        const rIn = Math.min(radius, lin / 2.2);
        const rOut = Math.min(radius, lout / 2.2);
        // Chamfer the corner; the spline through the two chamfer points rounds it.
        pts.push({
          x: cur.x - ((cur.x - prev.x) / lin) * rIn,
          y: cur.y - ((cur.y - prev.y) / lin) * rIn,
        });
        pts.push({
          x: cur.x + ((next.x - cur.x) / lout) * rOut,
          y: cur.y + ((next.y - cur.y) / lout) * rOut,
        });
        // Wobble points along the edge to the next corner.
        const span = lout - rOut - Math.min(radius, lout / 2.2);
        const count = wobble > 0 ? Math.floor(span / step) : 0;
        const dx = (next.x - cur.x) / lout;
        const dy = (next.y - cur.y) / lout;
        // Correlated offsets, so the coast swells gently instead of zigzagging.
        let off = 0;
        for (let k = 1; k <= count; k++) {
          const t = rOut + (span * k) / (count + 1);
          off = off * 0.55 + (rnd() * 2 - 1) * wobble * 0.75;
          const o = Math.max(-wobble, Math.min(wobble, off));
          // Outward normal of a clockwise edge (dy, -dx).
          pts.push({ x: cur.x + dx * t + dy * o, y: cur.y + dy * t - dx * o });
        }
      }
      // Two Chaikin passes soften one-plot jogs (coves and points) before the spline.
      return closedSpline(chaikin(chaikin(pts)));
    })
    .join('');
}

/** One Chaikin corner-cutting pass over a closed polyline. */
function chaikin(p: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as Point;
    const b = p[(i + 1) % p.length] as Point;
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return out;
}

/** A closed Catmull–Rom spline through points, as cubic Béziers. */
function closedSpline(p: readonly Point[]): string {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const n = p.length;
  const at = (i: number) => p[((i % n) + n) % n] as Point;
  let d = `M${r1(at(0).x)} ${r1(at(0).y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(p2.x)} ${r1(p2.y)}`;
  }
  return `${d}Z`;
}

/** What a land plot looks like (05 §3, §11). */
export type TerrainKind = 'sand' | 'grass' | 'meadow' | 'rock';

export const TERRAIN_KINDS: readonly TerrainKind[] = ['sand', 'grass', 'meadow', 'rock'];

/**
 * The terrain of each land plot: beach (sand, now and then rocks) where the plot touches the sea,
 * grass inland with some meadow. The starting 3-plot sandbar is all coast, so it is all sand; as
 * rings grow around it, it turns green. Deterministic per plot, so the island looks the same on
 * every device.
 */
export function terrainOf(
  island: Pick<IslandDef, 'rings'>,
  ringsUnlocked: number,
): Map<string, TerrainKind> {
  const land = landPlots(island, ringsUnlocked);
  const isLand = new Set(land.map(plotKey));
  const out = new Map<string, TerrainKind>();
  for (const p of land) {
    const k = plotKey(p);
    const rnd = seededRandom(hashSeed(p[0], p[1], 7))();
    const coast = DIRS.some((d) => !isLand.has(`${p[0] + d.x},${p[1] + d.y}`));
    if (coast) out.set(k, rnd < 0.16 ? 'rock' : 'sand');
    else out.set(k, rnd < 0.3 ? 'meadow' : 'grass');
  }
  return out;
}

export interface StonePlacement {
  n: number;
  plot: Plot;
  x: number;
  y: number;
}

/**
 * Scene positions of road stones (GameData `island.road`: stone n → plot). Several stones may share
 * a plot; they are spread along the road's direction of travel through that plot, so the path
 * reads in order. The road runs through plot centres in stone order.
 */
export function roadLayout(road: IslandDef['road']): StonePlacement[] {
  const stones = [...road].sort((a, b) => a.n - b.n);
  // Runs of consecutive stones on the same plot.
  const runs: { plot: Plot; ns: number[] }[] = [];
  for (const s of stones) {
    const last = runs[runs.length - 1];
    if (last && plotKey(last.plot) === plotKey(s.plot)) last.ns.push(s.n);
    else runs.push({ plot: s.plot, ns: [s.n] });
  }
  const centres = runs.map((r) => plotCenter(r.plot));
  const at = (t: number): Point => {
    const i = Math.max(0, Math.min(centres.length - 1, Math.floor(t)));
    const j = Math.min(centres.length - 1, i + 1);
    const f = Math.max(0, Math.min(1, t - i));
    const a = centres[i] as Point;
    const b = centres[j] as Point;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  const out: StonePlacement[] = [];
  runs.forEach((run, i) => {
    const m = run.ns.length;
    run.ns.forEach((n, j) => {
      // Spread the run across the middle 60% of its plot, from the side the road enters.
      const t = m === 1 ? i : i - 0.3 + (0.6 * j) / (m - 1);
      const p = t < 0 ? extrapolate(centres, t) : at(t);
      out.push({ n, plot: run.plot, x: p.x, y: p.y });
    });
  });
  return out;
}

function extrapolate(centres: Point[], t: number): Point {
  const a = centres[0] as Point;
  const b = centres[1] ?? { x: a.x + 1, y: a.y };
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** A smooth path through points (Catmull–Rom as cubic Béziers), for the road's trail. */
export function smoothPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const p = points;
  let d = `M${r1((p[0] as Point).x)} ${r1((p[0] as Point).y)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? (p[i] as Point);
    const p1 = p[i] as Point;
    const p2 = p[i + 1] as Point;
    const p3 = p[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(p2.x)} ${r1(p2.y)}`;
  }
  return d;
}
