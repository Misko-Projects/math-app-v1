import { createRng } from '@number-island/engine';
import type { ObjectSet, SpriteId, StimulusSpec } from '@number-island/shared';
import type { SpriteTone } from './sprites';

/**
 * Pure layouts for countable pictures (03 §5.1 `ObjectSet`, `StimulusSpec` dots). Positions are in
 * cell units (one cell holds one object); a view multiplies by its cell size. Every layout is
 * deterministic: `scatter` jitters from `layoutSeed`, so the same item looks the same on every
 * device and in every visual snapshot.
 */

export interface PlacedObject {
  /** Reading-order index among the counted objects (`obj-<i>`), or the distractor's index. */
  index: number;
  kind: 'object' | 'distractor';
  sprite: SpriteId;
  /** Top-left corner, in cells. */
  x: number;
  y: number;
  /** Size relative to a cell (1 = full cell; `sizeVaries` draws 0.7–1). */
  scale: number;
  /** Sub-group (`ObjectSet.groups`), 0-based. */
  group: number;
  tone: SpriteTone;
}

/** A frame drawn behind objects (ten-frame layouts): `cols × rows` cells at (x, y). */
export interface FrameOutline {
  x: number;
  y: number;
  cols: number;
  rows: number;
  /** `grid`: a ten-frame with cells (default); `die`: a die tile; `plate`: an equal-groups plate. */
  kind?: 'grid' | 'die' | 'plate';
}

export interface ObjectLayout {
  objects: PlacedObject[];
  /** Bounding size in cells. */
  width: number;
  height: number;
  frames: FrameOutline[];
}

/** Sub-group index of each object (`groups` sums to the count; missing → one group). */
export function groupIndexes(count: number, groups?: readonly number[]): number[] {
  const out: number[] = [];
  const sizes = groups && groups.length > 0 ? groups : [count];
  sizes.forEach((size, g) => {
    for (let i = 0; i < size && out.length < count; i++) out.push(g);
  });
  while (out.length < count) out.push(sizes.length - 1);
  return out;
}

const toneOf = (group: number): SpriteTone => (group % 2 === 1 ? 'b' : 'a');

/** Dot positions of a die face (1–6), in a 3 × 3 cell box. Larger counts use `dicePattern`. */
const DIE: Readonly<Record<number, [number, number][]>> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

/** A die-like pattern for n dots: a die face up to 6, then two columns of up to 5. */
export function dicePattern(n: number): { cells: [number, number][]; cols: number; rows: number } {
  if (n <= 0) return { cells: [], cols: 3, rows: 3 };
  const face = DIE[n];
  if (face) return { cells: face, cols: 3, rows: 3 };
  // 7–10: two columns, the second one possibly shorter (domino style).
  const left = Math.ceil(n / 2);
  const cells: [number, number][] = [];
  for (let r = 0; r < left; r++) cells.push([0, r]);
  for (let r = 0; r < n - left; r++) cells.push([1, r]);
  return { cells, cols: 2, rows: left };
}

/** Scatter: one object per cell of a loose grid, jittered inside its cell, never overlapping. */
function scatterCells(total: number, seed: number): { x: number; y: number }[] {
  const rng = createRng(seed >>> 0);
  const cols = Math.max(2, Math.ceil(Math.sqrt(total * 1.6)));
  const rows = Math.max(1, Math.ceil((total * 1.25) / cols));
  const free: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) free.push({ x: c, y: r });
  const chosen = rng.shuffle(free).slice(0, total);
  // Reading order (top to bottom, left to right) so obj-<i> runs the way a child would count.
  chosen.sort((a, b) => a.y - b.y || a.x - b.x);
  return chosen.map(({ x, y }) => ({
    x: x * 1.25 + rng.float() * 0.25,
    y: y * 1.25 + rng.float() * 0.25,
  }));
}

/**
 * Lays out an `ObjectSet`. Distractors (other objects that must not be counted) are mixed into the
 * same layout at deterministic positions; counted objects keep their reading order.
 */
export function objectSetLayout(set: ObjectSet): ObjectLayout {
  const count = Math.max(0, Math.floor(set.count));
  const extra = Math.max(0, Math.floor(set.distractors?.count ?? 0));
  const total = count + extra;
  const groupOf = groupIndexes(count, set.groups);
  const rng = createRng((set.layoutSeed ^ 0x5bd1e995) >>> 0);
  // Which slots hold distractors (none for structured frames).
  const slots = Array.from({ length: total }, (_, i) => i);
  const distractorSlots = new Set(rng.shuffle(slots).slice(0, extra));
  let fixedScale: number | null = null;
  const scaleFor = () => fixedScale ?? (set.sizeVaries ? 0.7 + rng.float() * 0.3 : 1);
  const frames: FrameOutline[] = [];
  let points: { x: number; y: number }[] = [];
  let width = 1;
  let height = 1;

  switch (set.layout) {
    case 'ten-frame':
    case 'double-ten-frame': {
      const frameCount = set.layout === 'double-ten-frame' ? 2 : Math.max(1, Math.ceil(total / 10));
      for (let f = 0; f < frameCount; f++) frames.push({ x: 0, y: f * 2.5, cols: 5, rows: 2 });
      points = Array.from({ length: total }, (_, i) => {
        const f = Math.floor(i / 10);
        const k = i % 10;
        return { x: k % 5, y: f * 2.5 + Math.floor(k / 5) };
      });
      width = 5;
      height = frameCount * 2.5 - 0.5;
      break;
    }
    case 'array': {
      const rows = Math.max(1, set.rows ?? 1);
      const cols = Math.max(1, Math.ceil(total / rows));
      points = Array.from({ length: total }, (_, i) => ({
        x: (i % cols) * 1.15,
        y: Math.floor(i / cols) * 1.15,
      }));
      width = cols * 1.15 - 0.15;
      height = rows * 1.15 - 0.15;
      break;
    }
    case 'circle': {
      const r = Math.max(1.2, (total * 1.45) / (2 * Math.PI));
      points = Array.from({ length: total }, (_, i) => {
        const a = (i / Math.max(1, total)) * 2 * Math.PI - Math.PI / 2;
        return { x: r + r * Math.cos(a), y: r + r * Math.sin(a) };
      });
      width = 2 * r + 1;
      height = 2 * r + 1;
      break;
    }
    case 'scatter': {
      points = scatterCells(total, set.layoutSeed);
      width = Math.max(1, ...points.map((p) => p.x + 1));
      height = Math.max(1, ...points.map((p) => p.y + 1));
      break;
    }
    case 'dice':
    case 'groups': {
      // One cluster per group, side by side with a clear gap: position shows the groups too.
      // Dice sit on die tiles (die faces up to 6, dominoes up to 10); groups sit on round plates.
      const sizes = set.groups && set.groups.length > 0 ? set.groups : [total];
      const dice = set.layout === 'dice';
      const step = dice ? 0.95 : 1.05;
      const inset = dice ? 0.3 : 0.35;
      fixedScale = dice ? 0.8 : 1;
      let x0 = 0;
      let tallest = 0;
      for (const size of sizes) {
        const cols = dice ? dicePattern(size).cols : Math.max(1, Math.ceil(Math.sqrt(size)));
        const rows = dice ? dicePattern(size).rows : Math.max(1, Math.ceil(size / cols));
        const cells: [number, number][] = dice
          ? dicePattern(size).cells
          : Array.from({ length: size }, (_, i) => [i % cols, Math.floor(i / cols)]);
        const w = (cols - 1) * step + fixedScale + 2 * inset;
        const h = (rows - 1) * step + fixedScale + 2 * inset;
        frames.push({ x: x0, y: 0, cols: w, rows: h, kind: dice ? 'die' : 'plate' });
        for (const [cx, cy] of cells)
          points.push({ x: x0 + inset + cx * step, y: inset + cy * step });
        x0 += w + 0.6;
        tallest = Math.max(tallest, h);
      }
      while (points.length < total) points.push({ x: x0, y: 0 });
      width = Math.max(1, x0 - 0.6);
      height = Math.max(1, tallest);
      break;
    }
    default: {
      // 'line': rows of up to 10; sub-groups are split by a half-cell gap.
      const perRow = 10;
      let col = 0;
      let row = 0;
      let lastGroup = 0;
      let widest = 0;
      let objectIndex = 0;
      points = slots.map((slot) => {
        const g = distractorSlots.has(slot) ? lastGroup : (groupOf[objectIndex++] ?? 0);
        if (g !== lastGroup && col > 0) col += 0.5;
        lastGroup = g;
        if (col >= perRow) {
          col = 0;
          row += 1;
        }
        const p = { x: col * 1.12, y: row * 1.2 };
        col += 1;
        widest = Math.max(widest, p.x + 1);
        return p;
      });
      width = Math.max(1, widest);
      height = row * 1.2 + 1;
    }
  }

  const objects: PlacedObject[] = [];
  let objectIndex = 0;
  let distractorIndex = 0;
  points.forEach((p, slot) => {
    const isDistractor = distractorSlots.has(slot) && set.distractors !== undefined;
    const group = isDistractor ? 0 : (groupOf[objectIndex] ?? 0);
    const scale = scaleFor();
    objects.push({
      index: isDistractor ? distractorIndex++ : objectIndex++,
      kind: isDistractor ? 'distractor' : 'object',
      sprite: isDistractor ? (set.distractors?.sprite ?? set.sprite) : set.sprite,
      x: p.x + (fixedScale === null ? (1 - scale) / 2 : 0),
      y: p.y + (fixedScale === null ? (1 - scale) / 2 : 0),
      scale,
      group,
      tone: isDistractor ? 'a' : toneOf(group),
    });
  });
  return { objects, width, height, frames };
}

/** Dot positions for a `dots` stimulus (03 §5.1), in cells, with each dot's group. */
export function dotsLayout(spec: Extract<StimulusSpec, { kind: 'dots' }>, seed = 1): ObjectLayout {
  const total = spec.groups.reduce((a, b) => a + Math.max(0, b), 0);
  const sprite = 'counter';
  switch (spec.arrangement) {
    case 'five-frame':
    case 'ten-frame':
    case 'double-ten-frame': {
      // Groups fill the frame in standard order (top row left to right), group colours alternate.
      const size = spec.arrangement === 'five-frame' ? 5 : 10;
      const frameCount =
        spec.arrangement === 'double-ten-frame' ? 2 : Math.max(1, Math.ceil(total / size));
      const rows = size === 5 ? 1 : 2;
      const frames: FrameOutline[] = Array.from({ length: frameCount }, (_, f) => ({
        x: 0,
        y: f * (rows + 0.5),
        cols: 5,
        rows,
      }));
      const groupOf = groupIndexes(total, spec.groups);
      const objects = Array.from({ length: total }, (_, i): PlacedObject => {
        const f = Math.floor(i / size);
        const k = i % size;
        const group = groupOf[i] ?? 0;
        return {
          index: i,
          kind: 'object',
          sprite,
          x: k % 5,
          y: f * (rows + 0.5) + Math.floor(k / 5),
          scale: 1,
          group,
          tone: toneOf(group),
        };
      });
      return { objects, width: 5, height: frameCount * (rows + 0.5) - 0.5, frames };
    }
    case 'scatter':
      return objectSetLayout({
        count: total,
        sprite,
        layout: 'scatter',
        groups: spec.groups,
        layoutSeed: seed,
      });
    case 'groups':
      return objectSetLayout({
        count: total,
        sprite,
        layout: 'groups',
        groups: spec.groups,
        layoutSeed: seed,
      });
    default:
      // 'dice' (and 'fingers', which DotsView draws as hands): die faces per group.
      return objectSetLayout({
        count: total,
        sprite,
        layout: 'dice',
        groups: spec.groups,
        layoutSeed: seed,
      });
  }
}
