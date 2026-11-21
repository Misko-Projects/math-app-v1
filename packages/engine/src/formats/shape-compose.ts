// 03 §5.5 shape-compose, four modes (K01 fixes the shapes, engine README):
// - `fill-outline` (GEO.10, GEO.11, PUZ.03; compose.fill): pieces in the geometry of
//   check/state/pieces.ts (x right, y up, one unit = one block side). Tray pieces have ids
//   `p-<kind>`; a placed copy is `p-<kind>:<n>`. `drag-piece {id, to, rot?}` puts a tray piece's
//   corner 0 at `to`, turned `rot` degrees counterclockwise (default: the tray piece's own turn),
//   or moves a placed copy (`remove: true` puts it back). `rotate {id}` turns a tray piece by
//   `rotationStep` (a placed copy turns about its centre). Answers state
//   `{ pieces: { kind, at, rot }[] }`.
// - `place-relative` (GEO.05; compose.relative): a 100 × 60 scene, x right, y down.
//   `drag-piece {id: item, to, layer?}` puts the item's centre at `to`, in front of (default) or
//   behind the anchors. Answers state `{ at, layer }`. `highlight-region {relation}` is visual.
// - `draw-on-grid` / `build-sticks` (GEO.02, GEO.09; grid.polygon): `draw-edge {from, to}` draws a
//   line (lays a stick) between two dots, x right, y down; drawing it again takes it away. Answers
//   state `{ points }`: the corners in drawing order when the lines make one closed loop.
//   Otherwise (an open figure, a loose stick, a branch) it answers the walk along the lines from
//   the first dot and back, which visits a dot twice, so grid.polygon rejects it.

import {
  type AnswerSpec,
  type ShapeComposeConfig,
  shapeComposeConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { area, PIECE_CORNERS, placeCorners, type Vec } from '../check/state/pieces';
import { argString, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'shape-compose'>;
type Pt = [number, number];

/** The scene of place-relative items (geo.position `SCENE`): x right, y down. */
export const SCENE_SIZE = { w: 100, h: 60 } as const;

export interface PlacedPiece {
  /** `<tray piece id>:<n>`. */
  id: string;
  /** The tray piece it came from. */
  piece: string;
  kind: string;
  at: Vec;
  rot: number;
}

export interface ShapeComposeState extends FormatState<'shape-compose'> {
  /** fill-outline: pieces on the outline, in the order placed. */
  placed: PlacedPiece[];
  /** fill-outline: each tray piece's current turn (degrees counterclockwise). */
  trayRot: Record<string, number>;
  /** place-relative: where the item is, and whether in front of or behind the anchors. */
  item: { at: Pt; layer: 'front' | 'back' } | null;
  /** place-relative: the relation region the widget shows (`highlight-region`). */
  region: string | null;
  /** draw-on-grid / build-sticks: the lines (sticks), in the order drawn. */
  edges: [Pt, Pt][];
}

const norm = (deg: number): number => ((Math.round(deg) % 360) + 360) % 360;
const round = (x: number): number => Math.round(x * 1e6) / 1e6;

const vec = (v: unknown): Pt | undefined =>
  Array.isArray(v) &&
  v.length === 2 &&
  typeof v[0] === 'number' &&
  typeof v[1] === 'number' &&
  Number.isFinite(v[0]) &&
  Number.isFinite(v[1])
    ? [v[0], v[1]]
    : undefined;

const samePt = (a: Pt, b: Pt): boolean => a[0] === b[0] && a[1] === b[1];
const sameEdge = (e: [Pt, Pt], f: [Pt, Pt]): boolean =>
  (samePt(e[0], f[0]) && samePt(e[1], f[1])) || (samePt(e[0], f[1]) && samePt(e[1], f[0]));

/** The centre (vertex average) of a placed piece. */
export function pieceCentre(p: { kind: string; at: Vec; rot: number }): Vec {
  const corners = placeCorners(p) ?? [p.at];
  const n = corners.length;
  return [corners.reduce((s, c) => s + c[0], 0) / n, corners.reduce((s, c) => s + c[1], 0) / n];
}

/** The placement that turns `p` by `by` degrees about its own centre. */
export function turnAboutCentre(p: { kind: string; at: Vec; rot: number }, by: number) {
  const [cx, cy] = pieceCentre(p);
  const a = (by * Math.PI) / 180;
  const dx = p.at[0] - cx;
  const dy = p.at[1] - cy;
  const at: Vec = [
    round(cx + dx * Math.cos(a) - dy * Math.sin(a)),
    round(cy + dx * Math.sin(a) + dy * Math.cos(a)),
  ];
  return { kind: p.kind, at, rot: norm(p.rot + by) };
}

const key = (p: Pt) => `${p[0]},${p[1]}`;

/**
 * The points a drawing answers (draw-on-grid, build-sticks): the corners of the one closed loop
 * the lines make, in drawing order from the first line; otherwise the walk along every line and
 * back (each component from its first line), which repeats a dot.
 */
export function drawingPoints(edges: readonly [Pt, Pt][]): Pt[] {
  if (edges.length === 0) return [];
  const adj = new Map<string, { to: Pt; edge: number }[]>();
  const pts = new Map<string, Pt>();
  edges.forEach(([a, b], i) => {
    pts.set(key(a), a);
    pts.set(key(b), b);
    adj.set(key(a), [...(adj.get(key(a)) ?? []), { to: b, edge: i }]);
    adj.set(key(b), [...(adj.get(key(b)) ?? []), { to: a, edge: i }]);
  });
  const isLoop =
    pts.size === edges.length &&
    [...adj.values()].every((n) => n.length === 2) &&
    edges.length >= 3;
  if (isLoop) {
    const [first, second] = edges[0] as [Pt, Pt];
    const out: Pt[] = [first];
    let prev = first;
    let cur = second;
    while (!samePt(cur, first) && out.length <= edges.length) {
      out.push(cur);
      const next = (adj.get(key(cur)) ?? []).find((n) => !samePt(n.to, prev))?.to;
      if (!next) break;
      prev = cur;
      cur = next;
    }
    // One loop through every dot (a connected 2-regular drawing).
    if (out.length === edges.length && samePt(cur, first)) return out;
  }
  const used = new Set<number>();
  const walk: Pt[] = [];
  const visit = (v: Pt) => {
    for (const n of adj.get(key(v)) ?? []) {
      if (used.has(n.edge)) continue;
      used.add(n.edge);
      walk.push(n.to);
      visit(n.to);
      walk.push(v);
    }
  };
  edges.forEach(([a], i) => {
    if (used.has(i)) return;
    walk.push(a);
    visit(a);
  });
  return walk;
}

/** Sticks offered in build-sticks (the `stick` pieces). */
export const stickCount = (c: ShapeComposeConfig): number =>
  (c.pieces ?? []).filter((p) => p.kind === 'stick').reduce((s, p) => s + p.count, 0);

/**
 * The supported domain, at or above shipped content (four kinds and nine blocks, 12-corner
 * outlines up to 3.5 block sides across, 16 sticks and corners, 6 × 3 dots, two anchors) and
 * inside what the widget draws at 906 × 373 (a block side is never drawn under 40 px).
 */
/** Fill-outline: kinds of block offered, and blocks in all. */
export const SC_PIECE_KINDS_MAX = 4;
export const SC_PIECES_MAX = 12;
/** Build-sticks: sticks and corners in all. */
export const SC_STICKS_MAX = 20;
/** Corners of an outline, and its width and height in block sides. */
export const SC_OUTLINE_POINTS_MAX = 16;
export const SC_OUTLINE_EXTENT_MAX = 5;
/** Anchors in a place-relative scene. */
export const SC_ANCHORS_MAX = 2;
/** The dot grid: every dot is its own target, so three rows are all the smallest area holds. */
export const SC_GRID_COLS_MAX = 6;
export const SC_GRID_ROWS_MAX = 3;
/** Sides or right angles a drawn shape may be asked to have. */
export const SC_REQUIRE_MAX = 8;

/** Where a config leaves the supported domain: every number and every list has a bound. */
export function domainIssues(
  c: ShapeComposeConfig,
): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  const pieces = c.pieces ?? [];
  const total = pieces.reduce((n, p) => n + p.count, 0);
  if (c.mode === 'build-sticks') {
    if (total > SC_STICKS_MAX) {
      out.push({
        path: ['pieces'],
        message: `at most ${SC_STICKS_MAX} sticks and corners; got ${total}`,
      });
    }
  } else {
    if (pieces.length > SC_PIECE_KINDS_MAX) {
      out.push({
        path: ['pieces'],
        message: `at most ${SC_PIECE_KINDS_MAX} kinds of piece fit the tray; got ${pieces.length}`,
      });
    }
    if (total > SC_PIECES_MAX) {
      out.push({ path: ['pieces'], message: `at most ${SC_PIECES_MAX} pieces; got ${total}` });
    }
  }
  const pts = c.outline?.points ?? [];
  if (pts.length > SC_OUTLINE_POINTS_MAX) {
    out.push({
      path: ['outline', 'points'],
      message: `an outline has at most ${SC_OUTLINE_POINTS_MAX} corners; got ${pts.length}`,
    });
  }
  if (pts.length > 0) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (!(extent <= SC_OUTLINE_EXTENT_MAX)) {
      out.push({
        path: ['outline', 'points'],
        message: `an outline is at most ${SC_OUTLINE_EXTENT_MAX} block sides across; got ${extent}`,
      });
    }
  }
  const anchors = c.scene?.anchors ?? [];
  if (anchors.length > SC_ANCHORS_MAX) {
    out.push({
      path: ['scene', 'anchors'],
      message: `a scene has at most ${SC_ANCHORS_MAX} anchors; got ${anchors.length}`,
    });
  }
  if (c.grid && (c.grid.cols > SC_GRID_COLS_MAX || c.grid.rows > SC_GRID_ROWS_MAX)) {
    out.push({
      path: ['grid'],
      message: `a dot grid is at most ${SC_GRID_COLS_MAX} × ${SC_GRID_ROWS_MAX}; got ${c.grid.cols} × ${c.grid.rows}`,
    });
  }
  for (const key of ['sides', 'rightAngles'] as const) {
    const v = c.require?.[key];
    if (v !== undefined && v > SC_REQUIRE_MAX) {
      out.push({
        path: ['require', key],
        message: `${key} is at most ${SC_REQUIRE_MAX}; got ${v}`,
      });
    }
  }
  return out;
}

const configSchema = shapeComposeConfigSchema.superRefine((c, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  for (const d of domainIssues(c)) ctx.addIssue({ code: 'custom', ...d });
  const pieceIds = (c.pieces ?? []).map((p) => p.id);
  if (new Set(pieceIds).size !== pieceIds.length) issue(['pieces'], 'piece ids must be distinct');
  if (pieceIds.some((id) => id.includes(':'))) issue(['pieces'], "piece ids have no ':'");
  switch (c.mode) {
    case 'fill-outline': {
      const pts = c.outline?.points ?? [];
      if (pts.length < 3 || area(pts as Vec[]) <= 0) issue(['outline'], 'an outline with area');
      if (!c.pieces || c.pieces.length === 0) issue(['pieces'], 'fill-outline offers pieces');
      (c.pieces ?? []).forEach((p, i) => {
        if (!Object.hasOwn(PIECE_CORNERS, p.kind)) {
          issue(['pieces', i, 'kind'], `no ${p.kind} piece (check/state/pieces.ts)`);
        }
      });
      break;
    }
    case 'place-relative': {
      const anchors = c.scene?.anchors ?? [];
      if (anchors.length === 0) issue(['scene'], 'place-relative needs a scene');
      if (!c.relation) issue(['relation'], 'place-relative needs a relation');
      else if (!anchors.some((x) => x.id === c.relation?.anchor)) {
        issue(['relation', 'anchor'], 'the relation names a scene anchor');
      }
      anchors.forEach((x, i) => {
        const [ax, ay] = x.at;
        if (ax < 0 || ay < 0 || ax > SCENE_SIZE.w || ay > SCENE_SIZE.h) {
          issue(['scene', 'anchors', i, 'at'], 'anchors lie in the 100 × 60 scene');
        }
      });
      break;
    }
    case 'draw-on-grid':
    case 'build-sticks': {
      if (!c.grid || c.grid.cols < 2 || c.grid.rows < 2) issue(['grid'], 'a dot grid ≥ 2 × 2');
      if (!c.require || Object.keys(c.require).length === 0) {
        issue(['require'], 'the shape has a requirement');
      }
      if (c.mode === 'build-sticks' && stickCount(c) < 3) issue(['pieces'], 'three or more sticks');
      break;
    }
  }
});

export const shapeCompose: FormatModel<'shape-compose', ShapeComposeState> = {
  format: 'shape-compose',
  configSchema,
  features: {
    pieces: { weight: 0.3, doc: 'fill-outline: pieces − 2 (the generator counts its tiling)' },
    rotations: {
      weight: 0.3,
      doc: 'fill-outline: fewest pieces that must be turned (from the generator’s tiling; 0 otherwise)',
    },
    'outline.linesHidden': { weight: 0.6, doc: 'fill-outline: no guide lines inside the outline' },
    'relation.leftRight': { weight: 0.6, doc: 'place-relative: left of or right of' },
    'relation.frontBehind': { weight: 0.4, doc: 'place-relative: in front of or behind' },
    'require.count': { weight: 0.3, doc: 'draw-on-grid, build-sticks: requirements − 1' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const fill = c.mode === 'fill-outline';
    const word = c.mode === 'place-relative' ? c.relation?.word : undefined;
    const drawing = c.mode === 'draw-on-grid' || c.mode === 'build-sticks';
    const offered = (c.pieces ?? []).reduce((s, p) => s + p.count, 0);
    return {
      pieces: fill ? Math.max(0, offered - 2) : 0,
      rotations: 0,
      'outline.linesHidden': fill && !c.showOutlineLines ? 1 : 0,
      'relation.leftRight': word === 'left-of' || word === 'right-of' ? 1 : 0,
      'relation.frontBehind': word === 'in-front-of' || word === 'behind' ? 1 : 0,
      'require.count': drawing ? Math.max(0, Object.keys(c.require ?? {}).length - 1) : 0,
    };
  },
  initialState: (config) => ({
    config,
    placed: [],
    trayRot: Object.fromEntries((config.pieces ?? []).map((p) => [p.id, 0])),
    item: null,
    region: null,
    edges: [],
  }),
  apply(s, a) {
    const c = s.config;
    const id = argString(a, 'id');
    switch (a.op) {
      case 'drag-piece': {
        const to = vec(a.args?.to);
        const rotArg = typeof a.args?.rot === 'number' ? norm(a.args.rot) : undefined;
        if (c.mode === 'place-relative') {
          if (!to || (id !== c.relation?.item && id !== 'item')) return s;
          const layer = a.args?.layer === 'back' ? 'back' : 'front';
          return { ...s, item: { at: [round(to[0]), round(to[1])], layer } };
        }
        if (c.mode !== 'fill-outline' || id === undefined) return s;
        const placedAt = s.placed.findIndex((p) => p.id === id);
        if (placedAt >= 0) {
          if (a.args?.remove === true) return { ...s, placed: s.placed.filter((p) => p.id !== id) };
          if (!to) return s;
          const placed = [...s.placed];
          const p = placed[placedAt] as PlacedPiece;
          placed[placedAt] = { ...p, at: [round(to[0]), round(to[1])], rot: rotArg ?? p.rot };
          return { ...s, placed };
        }
        const piece = (c.pieces ?? []).find((p) => p.id === id);
        if (!piece || !to) return s;
        const mine = s.placed.filter((p) => p.piece === id);
        if (mine.length >= piece.count) return s;
        let n = 0;
        while (mine.some((p) => p.id === `${id}:${n}`)) n += 1;
        const rot = rotArg ?? s.trayRot[id] ?? 0;
        const next: PlacedPiece = {
          id: `${id}:${n}`,
          piece: id,
          kind: piece.kind,
          at: [round(to[0]), round(to[1])],
          rot,
        };
        return { ...s, placed: [...s.placed, next] };
      }
      case 'rotate': {
        if (c.mode !== 'fill-outline' || id === undefined) return s;
        const placedAt = s.placed.findIndex((p) => p.id === id);
        if (placedAt >= 0) {
          const placed = [...s.placed];
          const p = placed[placedAt] as PlacedPiece;
          placed[placedAt] = { ...p, ...turnAboutCentre(p, c.rotationStep) };
          return { ...s, placed };
        }
        if (!(id in s.trayRot)) return s;
        return {
          ...s,
          trayRot: { ...s.trayRot, [id]: norm((s.trayRot[id] ?? 0) + c.rotationStep) },
        };
      }
      case 'draw-edge': {
        if (c.mode !== 'draw-on-grid' && c.mode !== 'build-sticks') return s;
        const from = vec(a.args?.from);
        const to = vec(a.args?.to);
        const cols = c.grid?.cols ?? 0;
        const rows = c.grid?.rows ?? 0;
        const onGrid = (p: Pt | undefined): p is Pt =>
          p !== undefined &&
          Number.isInteger(p[0]) &&
          Number.isInteger(p[1]) &&
          p[0] >= 0 &&
          p[1] >= 0 &&
          p[0] < cols &&
          p[1] < rows;
        if (!onGrid(from) || !onGrid(to) || samePt(from, to)) return s;
        const edge: [Pt, Pt] = [from, to];
        if (s.edges.some((e) => sameEdge(e, edge))) {
          return { ...s, edges: s.edges.filter((e) => !sameEdge(e, edge)) };
        }
        if (c.mode === 'build-sticks' && s.edges.length >= stickCount(c)) return s;
        return { ...s, edges: [...s.edges, edge] };
      }
      case 'highlight-region': {
        if (c.mode !== 'place-relative') return s;
        return { ...s, region: argString(a, 'relation') ?? c.relation?.word ?? null };
      }
      case 'answer':
        // Every answer is the built state; there is no separate answer control.
        return s;
      default:
        throw new UnsupportedOpError('shape-compose', a.op);
    }
  },
  toResponse(s) {
    switch (s.config.mode) {
      case 'fill-outline':
        if (s.placed.length === 0) return null;
        return {
          kind: 'state',
          value: {
            pieces: s.placed.map((p) => ({ kind: p.kind, at: [p.at[0], p.at[1]], rot: p.rot })),
          },
        };
      case 'place-relative':
        if (!s.item) return null;
        return {
          kind: 'state',
          value: { at: [s.item.at[0], s.item.at[1]], layer: s.item.layer },
        };
      default:
        if (s.edges.length === 0) return null;
        return {
          kind: 'state',
          value: { points: drawingPoints(s.edges).map((p) => [p[0], p[1]]) },
        };
    }
  },
};
