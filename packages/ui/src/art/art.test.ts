import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IslandDef, Plot } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { PALETTE, type PaletteColor } from '../tokens/tokens';
import { ART_CONTRAST_PAIRS, pairRatio } from './core/contrast';
import { OUTLINE_OF } from './core/paint';
import { SAMPLE_ISLAND, SAMPLE_PATH } from './gallery/sampleIsland';
import {
  HALO_REACH,
  HORIZON_Y,
  ISLAND_LAYOUT,
  landCrop,
  landLoops,
  landPlots,
  plotBox,
  plotCenter,
  plotKey,
  roadLayout,
  roundedPath,
  SCENE_H,
  SCENE_W,
  smoothPathPoints,
  terrainOf,
  traceOutline,
} from './island/geometry';
import { CAMERA_MAX_Y, clampCamera, HORIZON_GAP } from './island/IslandScene';
import { plotDetailItems } from './island/plotDetail';
import { ROAD_STONE_SCALE, roadStoneBox, stoneExtent, stoneMetrics } from './island/RoadStone';
import {
  beadExtent,
  boxesTouch,
  MAP_STONE_SCALE,
  NEXT_HIT_RADIUS,
  nextHitRadius,
  type PlannedStone,
  planRoad,
  type RoadBead,
  type RoadPlan,
  type RoadSign,
  roadFootprint,
  roadShape,
  SIGN_NUMERAL,
  STONE_CLEARANCE,
} from './island/roadPlan';
import {
  artIds,
  buildingArtFor,
  decorArtFor,
  lookupArt,
  materialArtFor,
  registeredArt,
} from './registry';

describe('road plan: a linear board (05 §3)', () => {
  const ringSets = [1, 2, 3, 4, SAMPLE_ISLAND.rings.length];
  const layout = roadLayout(SAMPLE_ISLAND.road);
  const shape = roadShape(SAMPLE_ISLAND.road);
  /** Every plan the sweep checks: each island stage, road length 0–100 and a counted stone. */
  function* plans() {
    for (const rings of ringSets) {
      const land = new Set(landPlots(SAMPLE_ISLAND, rings).map(plotKey));
      const onLand = (s: { plot: Plot }) => land.has(plotKey(s.plot));
      for (let roadLength = 0; roadLength <= 100; roadLength++) {
        for (const c of [null, roadLength, roadLength - 1, roadLength - (roadLength % 10), 1, 47]) {
          const counting = c !== null && c >= 1 && c <= roadLength ? c : null;
          const plan = planRoad({ road: SAMPLE_ISLAND.road, roadLength, counting, onLand, land });
          const where = `roadLength ${roadLength}, counting ${counting}, rings ${rings}`;
          yield { plan, roadLength, counting, onLand, rings, where };
        }
      }
    }
  }
  /** How far a bead or pin draws from its centre, with its outline. Computed here, not from roadPlan. */
  const drawn = (b: RoadBead) => b.r * 1.15 + Math.max(0.3, Math.min(2, b.r * 0.5)) / 2;
  /** How far a signpost's post line reaches either side of its centre line. */
  const half = (s: RoadSign) => s.postWidth / 2;

  /**
   * Everything the road must hold for one plan: one mark on the road for every shown number, at
   * its place; the next and counted stones full numbered stones; nothing touching anything.
   */
  function problems(
    plan: RoadPlan,
    road: IslandDef['road'],
    shown: readonly number[],
    roadLength: number,
    counting: number | null,
  ): string[] {
    const bad: string[] = [];
    const { numbered, beads, signs } = plan;
    const pos = roadShape(road).pos;
    // One mark on the road per shown number, at its place: a numbered stone there, or a bead or pin.
    const onRoad = [...numbered.filter((s) => !s.callout), ...beads];
    const ns = onRoad.map((s) => s.n).sort((a, b) => a - b);
    if (JSON.stringify(ns) !== JSON.stringify([...shown])) bad.push(`marks ${ns} ≠ ${shown}`);
    for (const s of onRoad) {
      const p = pos.get(s.n);
      if (!p || Math.abs(p.x - s.x) > 1e-9 || Math.abs(p.y - s.y) > 1e-9) bad.push(`${s.n} moved`);
    }
    // The next and counted stones are always full numbered stones, never beads.
    for (const n of [roadLength + 1, counting]) {
      if (n === null || !shown.includes(n)) continue;
      const stone = numbered.find((s) => s.n === n);
      if (!stone) bad.push(`${n} is not a numbered stone`);
      const bead = beads.find((b) => b.n === n);
      if (bead && !(bead.pin && stone?.callout)) bad.push(`${n} drawn as a bead`);
      if (stone?.callout) {
        const sp = stone.callout.spot;
        if (!bead || bead.x !== sp.x || bead.y !== sp.y) bad.push(`${n}'s stem not from its pin`);
      }
    }
    // Nothing touches.
    for (let i = 0; i < numbered.length; i++) {
      const a = numbered[i] as PlannedStone;
      for (let j = i + 1; j < numbered.length; j++) {
        const b = numbered[j] as PlannedStone;
        if (boxesTouch(a.box, b.box, STONE_CLEARANCE - 0.01)) bad.push(`stones ${a.n}, ${b.n}`);
      }
      for (const b of beads) {
        if (b.n === a.n && a.callout) continue;
        if (boxesTouch(a.box, beadExtent(b), 0)) bad.push(`stone ${a.n}, bead ${b.n}`);
      }
      for (const p of a.callout?.points ?? []) {
        const w = (a.callout?.width ?? 0) / 2;
        for (const b of beads) {
          if (b.n !== a.n && Math.hypot(p.x - b.x, p.y - b.y) <= drawn(b) + w) {
            bad.push(`stem ${a.n} through ${b.n}`);
          }
        }
        for (const t of numbered) {
          const box = t.box;
          if (
            t.n !== a.n &&
            p.x > box.left - w &&
            p.x < box.right + w &&
            p.y > box.top - w &&
            p.y < box.bottom + w
          ) {
            bad.push(`stem ${a.n} through stone ${t.n}`);
          }
        }
      }
    }
    for (let i = 0; i < beads.length; i++) {
      const a = beads[i] as RoadBead;
      for (let j = i + 1; j < beads.length; j++) {
        const b = beads[j] as RoadBead;
        if (Math.hypot(a.x - b.x, a.y - b.y) < drawn(a) + drawn(b) + 0.5 - 1e-9) {
          bad.push(`beads ${a.n}, ${b.n}`);
        }
      }
    }
    for (let i = 0; i < signs.length; i++) {
      const s = signs[i] as RoadSign;
      const own = pos.get(s.n);
      if (own?.x !== s.anchor.x || own?.y !== s.anchor.y) bad.push(`sign ${s.n} off its bead`);
      for (const b of beads) {
        if (b.n === s.n) continue;
        if (boxesTouch(s.box, beadExtent(b), 0)) bad.push(`sign ${s.n} on ${b.n}`);
        if (s.points.some((p) => Math.hypot(p.x - b.x, p.y - b.y) <= drawn(b) + half(s))) {
          bad.push(`post ${s.n} through ${b.n}`);
        }
      }
      for (const t of numbered) {
        if (boxesTouch(s.box, t.box, 0)) bad.push(`sign ${s.n} on stone ${t.n}`);
        for (const q of t.callout?.points ?? []) {
          if (q.x > s.box.left && q.x < s.box.right && q.y > s.box.top && q.y < s.box.bottom) {
            bad.push(`stem ${t.n} through sign ${s.n}`);
          }
        }
      }
      for (let j = i + 1; j < signs.length; j++) {
        const t = signs[j] as RoadSign;
        if (boxesTouch(s.box, t.box, 2)) bad.push(`signs ${s.n}, ${t.n}`);
      }
    }
    return bad;
  }

  const shownOf = (road: IslandDef['road'], last: number, onLand: (s: { plot: Plot }) => boolean) =>
    road.filter((s) => s.n <= last && onLand(s)).map((s) => s.n);

  it('draws one mark for every number, in order; next and counted stones are full stones', () => {
    for (const { plan, roadLength, counting, onLand, where } of plans()) {
      const shown = shownOf(SAMPLE_ISLAND.road, roadLength + 1, onLand);
      expect(problems(plan, SAMPLE_ISLAND.road, shown, roadLength, counting), where).toEqual([]);
    }
    // On the whole island, the marks are exactly 1 … roadLength + 1: one for every number.
    const land = new Set(landPlots(SAMPLE_ISLAND, SAMPLE_ISLAND.rings.length).map(plotKey));
    for (const roadLength of [0, 9, 39, 40, 41, 66, 99]) {
      const plan = planRoad({
        road: SAMPLE_ISLAND.road,
        roadLength,
        onLand: (s) => land.has(plotKey(s.plot)),
      });
      const marks = plan.numbered.filter((s) => !s.callout).length + plan.beads.length;
      expect(marks, `road ${roadLength}`).toBe(roadLength + 1);
    }
  }, 60_000);

  it('walks the road in order: each stone is next to the one before it, never past it', () => {
    const at = (n: number) => shape.pos.get(n) as { x: number; y: number };
    for (let n = 1; n < layout.length - 1; n++) {
      const a = at(n);
      const b = at(n + 1);
      const c = at(n + 2);
      const ab = Math.hypot(a.x - b.x, a.y - b.y);
      const ac = Math.hypot(a.x - c.x, a.y - c.y);
      expect(ac, `stone ${n + 2} comes before ${n + 1}`).toBeGreaterThan(ab);
    }
    const land = new Set(landPlots(SAMPLE_ISLAND, SAMPLE_ISLAND.rings.length).map(plotKey));
    const plan = planRoad({
      road: SAMPLE_ISLAND.road,
      roadLength: 100,
      counting: 99,
      onLand: (s) => land.has(plotKey(s.plot)),
    });
    expect(plan.trail).toEqual(layout.map((s) => at(s.n)));
  });

  it('spaces beads evenly in world units, with no gap wider than the steps beside it', () => {
    // Evidence review at 6cecddc: 40 → 41 (from one stone to a plot to three) read as a missing
    // stone. A stretch of one density is evenly spaced in world units (the map's tilt undone: a
    // step down the map looks shorter on screen only because of foreshortening), and no gap between
    // beads is wider than both of the steps beside it.
    const tilt = ISLAND_LAYOUT.cellW / ISLAND_LAYOUT.cellH;
    const wgap = (pos: ReadonlyMap<number, { x: number; y: number }>, n: number) => {
      const a = pos.get(n) as { x: number; y: number };
      const b = pos.get(n + 1) as { x: number; y: number };
      return Math.hypot(b.x - a.x, (b.y - a.y) * tilt);
    };
    const check = (road: IslandDef['road'], label: string) => {
      const sh = roadShape(road);
      const bead = (n: number) => sh.pos.has(n) && !sh.numbered.has(n);
      const perPlot = new Map<string, number>();
      for (const s2 of road) perPlot.set(`${s2.plot}`, (perPlot.get(`${s2.plot}`) ?? 0) + 1);
      const m = (n: number) => perPlot.get(`${road.find((s2) => s2.n === n)?.plot}`) ?? 1;
      const ns = road.map((s2) => s2.n);
      for (const n of ns) {
        if (!bead(n) || !bead(n + 1)) continue;
        const g = wgap(sh.pos, n);
        // Same density on both stones' plots, and on the stones either side: an even step.
        if (m(n) === m(n + 1) && m(n) > 1) {
          expect(g, `${label}: ${n} → ${n + 1}`).toBeGreaterThan(
            (ISLAND_LAYOUT.cellW / m(n)) * 0.7,
          );
          expect(g, `${label}: ${n} → ${n + 1}`).toBeLessThan((ISLAND_LAYOUT.cellW / m(n)) * 1.02);
        }
        const before = bead(n - 1) ? wgap(sh.pos, n - 1) : 0;
        const after = bead(n + 2) ? wgap(sh.pos, n + 1) : 0;
        if (before && after) {
          expect(
            g,
            `${label}: ${n} → ${n + 1} wider than both steps beside it`,
          ).toBeLessThanOrEqual(Math.max(before, after) * 1.05);
        }
      }
    };
    check(SAMPLE_ISLAND.road, 'sample');
    // The sample's crowded stretch, 41–100, three to a plot: every step the same.
    const steps = Array.from({ length: 59 }, (_, i) => wgap(shape.pos, 41 + i));
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    for (const [i, st] of steps.entries()) {
      expect(st, `step ${41 + i}`).toBeLessThan(mean * 1.02);
      expect(st, `step ${41 + i}`).toBeGreaterThan(mean * 0.7);
    }
    // A lone stone on its plot between denser stretches steps towards them.
    const lone = [
      ...Array.from({ length: 3 }, (_, i) => ({ n: i + 1, plot: [3, 3] as Plot })),
      { n: 4, plot: [4, 3] as Plot },
      ...Array.from({ length: 3 }, (_, i) => ({ n: i + 5, plot: [5, 3] as Plot })),
    ];
    check(lone, 'lone');
  });

  it('labels stone 1, the tens and the hundreds where the road is beads', () => {
    for (const { plan, roadLength, where } of plans()) {
      const signed = new Set(plan.signs.map((s) => s.n));
      for (const b of plan.beads) {
        const matters = !b.pin && b.n <= roadLength && (b.n === 1 || b.n % 10 === 0);
        expect(signed.has(b.n), `${where}: bead ${b.n} sign`).toBe(matters);
      }
    }
  });

  it('keeps a stone in one form and place as the road grows, is counted or the island grows', () => {
    // The sample's stones 1–40 have a plot each; 41 onwards share plots three to a plot.
    for (let n = 1; n <= 40; n++) expect(shape.numbered.has(n), `stone ${n}`).toBe(true);
    for (let n = 41; n <= 100; n++) expect(shape.numbered.has(n), `stone ${n}`).toBe(false);
    for (const { plan, where } of plans()) {
      for (const s of plan.numbered) {
        if (!s.callout) expect(shape.numbered.has(s.n), where).toBe(true);
      }
      for (const b of plan.beads) expect(shape.numbered.has(b.n), where).toBe(false);
    }
  });

  it('shows every numeral at one size, ≥ 20 CSS px at the default zoom (05 §11)', () => {
    // The default zoom: the 1400-unit scene on a 1280 px wide tablet.
    const px = 1280 / SCENE_W;
    expect(SIGN_NUMERAL * px).toBeGreaterThanOrEqual(20);
    for (const n of [1, 9, 10, 99, 100, 999, 1000]) {
      expect(stoneMetrics(n).font * MAP_STONE_SCALE, String(n)).toBe(SIGN_NUMERAL);
    }
    for (const { plan, where } of plans()) expect(plan.scale, where).toBe(MAP_STONE_SCALE);
  });

  it('gives the next stone a tap target ≥ 80 CSS px on the stone, and clear ground around it', () => {
    expect(2 * NEXT_HIT_RADIUS * (1280 / SCENE_W)).toBeGreaterThanOrEqual(80);
    for (const { plan, roadLength, onLand, where } of plans()) {
      const spot = layout.find((s) => s.n === roadLength + 1);
      if (!spot || !onLand(spot)) {
        expect(plan.next, where).toBeNull();
        continue;
      }
      const stone = plan.numbered.find((s) => s.n === roadLength + 1) as PlannedStone;
      expect(plan.next, where).toEqual({ x: stone.x, y: stone.y });
    }
    // The ground 14 units beyond the next stone's own extent is kept clear of detail.
    const land = new Set(landPlots(SAMPLE_ISLAND, SAMPLE_ISLAND.rings.length).map(plotKey));
    for (const roadLength of [20, 70]) {
      const plan = planRoad({
        road: SAMPLE_ISLAND.road,
        roadLength,
        onLand: (s) => land.has(plotKey(s.plot)),
      });
      const blocked = roadFootprint(plan);
      const stone = plan.numbered.find((s) => s.n === roadLength + 1) as PlannedStone;
      const own = stone.box;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const x = dx < 0 ? own.left - 12 : dx > 0 ? own.right + 12 : stone.x;
        const y = dy < 0 ? own.top - 12 : dy > 0 ? own.bottom + 12 : stone.y;
        expect(
          blocked({ left: x - 1, right: x + 1, top: y - 1, bottom: y + 1 }),
          `${dx},${dy}`,
        ).toBe(true);
      }
    }
  });

  it('holds vertical pans so the island and its halo stay in the sea, a band of water behind', () => {
    expect(clampCamera({ x: 30, y: 140 })).toEqual({ x: 30, y: CAMERA_MAX_Y });
    expect(clampCamera({ x: 0, y: -60 })).toEqual({ x: 0, y: -60 });
    expect(CAMERA_MAX_Y).toBeGreaterThan(20);
    const plots = landPlots(SAMPLE_ISLAND, SAMPLE_ISLAND.rings.length);
    const haloTop =
      Math.min(
        ...landLoops(plots, 46)
          .flat()
          .map((p) => p.y),
      ) - 16;
    expect(haloTop - CAMERA_MAX_Y - HORIZON_Y).toBeGreaterThanOrEqual(HORIZON_GAP);
    expect(plotBox([0, 0]).y - HALO_REACH - CAMERA_MAX_Y - HORIZON_Y).toBeGreaterThanOrEqual(
      HORIZON_GAP,
    );
    expect(HORIZON_GAP).toBeGreaterThanOrEqual(16);
  });

  it('stands the next stone, 51, as a full stone beside the ten 50 (evidence review)', () => {
    const land = new Set(landPlots(SAMPLE_ISLAND, SAMPLE_ISLAND.rings.length).map(plotKey));
    const plan = planRoad({
      road: SAMPLE_ISLAND.road,
      roadLength: 50,
      counting: 49,
      onLand: (s) => land.has(plotKey(s.plot)),
    });
    for (const [n, state] of [
      [51, 'next'],
      [49, 'counting'],
    ] as const) {
      const stone = plan.numbered.find((s) => s.n === n) as PlannedStone;
      expect(stone.state).toBe(state);
      expect(stone.callout).toBeDefined();
      // A full stone: the same extent as a numbered stone in that state, at map scale.
      const e = stoneExtent(n, state);
      expect(stone.box.right - stone.box.left).toBeCloseTo((e.right - e.left) * MAP_STONE_SCALE);
      expect(plan.beads.find((b) => b.n === n)?.pin).toBe(true);
    }
    expect(plan.signs.map((s) => s.n)).toContain(50);
  });

  it("keeps the next stone's tap target ≥ 80 CSS px at every supported viewport (06 §1, §4)", () => {
    const fitted = (w: number, h: number) => Math.min(w / SCENE_W, h / SCENE_H);
    for (const [w, h] of [
      [1280, 800],
      [1440, 900],
      [800, 1280],
      [960, 600],
      [600, 960],
    ] as const) {
      const px = fitted(w, h);
      expect(2 * nextHitRadius(px) * px, `${w} × ${h}`).toBeGreaterThanOrEqual(80);
    }
    expect(nextHitRadius(fitted(1280, 800))).toBe(NEXT_HIT_RADIUS);
    expect(nextHitRadius(0)).toBe(NEXT_HIT_RADIUS);
  });

  it('holds at any density: a snake road with 1–12 stones to a plot', () => {
    const snake: Plot[] = [];
    for (let y = 0; y < 8; y++) {
      for (let i = 0; i < 12; i++) snake.push([y % 2 === 0 ? i : 11 - i, y]);
    }
    const bad: string[] = [];
    for (let k = 1; k <= 12; k++) {
      const road = snake.flatMap((plot, p) =>
        Array.from({ length: k }, (_, j) => ({ n: p * k + j + 1, plot })),
      );
      const last = road.length;
      for (const roadLength of [1, 2, 5, k, k + 1, 3 * k, 12 * k - 1, 12 * k, 13 * k, last - 2]) {
        if (roadLength < 1 || roadLength >= last) continue;
        for (const counting of [null, roadLength, roadLength - 1, 1]) {
          for (const plannedAhead of [0, 1, 2]) {
            const c =
              counting !== null && counting >= 1 && counting <= roadLength ? counting : null;
            const plan = planRoad({
              road,
              roadLength,
              counting: c,
              plannedAhead,
              onLand: () => true,
            });
            const shown = shownOf(road, roadLength + 1 + plannedAhead, () => true);
            const where = `k ${k}, road ${roadLength}, counting ${c}, ahead ${plannedAhead}`;
            for (const p of problems(plan, road, shown, roadLength, c)) bad.push(`${where}: ${p}`);
          }
        }
      }
    }
    expect(bad.slice(0, 12)).toEqual([]);
  }, 120_000);

  it('holds however many stones share a plot (12–64), down the map and across it', () => {
    const bad: string[] = [];
    for (const k of [12, 16, 24, 32, 48, 64]) {
      for (const [a, b] of [
        [
          [4, 3],
          [4, 4],
        ],
        [
          [4, 3],
          [5, 3],
        ],
      ] as const) {
        const road = [
          ...Array.from({ length: k }, (_, i) => ({ n: i + 1, plot: a as unknown as Plot })),
          ...Array.from({ length: k }, (_, i) => ({ n: k + i + 1, plot: b as unknown as Plot })),
        ];
        for (const [roadLength, counting] of [
          [k, k],
          [k, k - 1],
          [3, 2],
        ] as const) {
          const plan = planRoad({
            road,
            roadLength,
            counting,
            plannedAhead: 1,
            onLand: () => true,
          });
          const shown = shownOf(road, roadLength + 2, () => true);
          const where = `k ${k}, ${a} → ${b}, road ${roadLength}, counting ${counting}`;
          for (const p of problems(plan, road, shown, roadLength, counting))
            bad.push(`${where}: ${p}`);
        }
      }
    }
    expect(bad.slice(0, 12)).toEqual([]);
  }, 60_000);

  it('fits three stones on one plot: all drawn, the counted and next full stones, none touching', () => {
    // Review s_1d38d1caad61 #1: stones 1–3 share the only plot; stone 2 is counted, 3 is next.
    const road = [
      { n: 1, plot: [0, 0] as Plot },
      { n: 2, plot: [0, 0] as Plot },
      { n: 3, plot: [0, 0] as Plot },
    ];
    const plan = planRoad({
      road,
      roadLength: 2,
      counting: 2,
      onLand: (s) => plotKey(s.plot) === '0,0',
    });
    expect(problems(plan, road, [1, 2, 3], 2, 2)).toEqual([]);
  });

  it('keeps detail off the trail as drawn, along its curves at turns', () => {
    // Review s_1d38d1caad61 #2: the trail is drawn as smoothPath's curve, which leaves the straight
    // line between stones at a turn; the mask must follow the curve.
    const trail = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 70 },
    ];
    const blocked = roadFootprint({
      scale: MAP_STONE_SCALE,
      numbered: [],
      beads: [],
      signs: [],
      trail,
    });
    const at = (x: number, y: number) =>
      blocked({ left: x - 0.5, right: x + 0.5, top: y - 0.5, bottom: y + 0.5 });
    expect(at(70.37, -18.5)).toBe(true);
    // Every point on the drawn stroke's edge (half of 34 × scale from the curve) is covered.
    const curve = smoothPathPoints(trail, 1);
    const half = (34 * MAP_STONE_SCALE) / 2;
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1] as { x: number; y: number };
      const b = curve[i] as { x: number; y: number };
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len === 0) continue;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      for (const side of [-1, 1]) {
        expect(at(b.x + side * nx * half, b.y + side * ny * half), `edge at ${i}`).toBe(true);
      }
    }
    // Ground well clear of the stroke stays free.
    expect(at(50, -40)).toBe(false);
    expect(at(60, 40)).toBe(false);
  });

  it('keeps every piece of ground detail off the road (05 §11)', () => {
    for (const rings of [1, 2, 3, 4, SAMPLE_ISLAND.rings.length]) {
      const plots = landPlots(SAMPLE_ISLAND, rings);
      const land = new Set(plots.map(plotKey));
      const onLand = (s: { plot: Plot }) => land.has(plotKey(s.plot));
      const terrain = terrainOf(SAMPLE_ISLAND, rings);
      for (const roadLength of [0, 12, 20, 45, 50, 70, 100]) {
        const plan = planRoad({ road: SAMPLE_ISLAND.road, roadLength, onLand, land });
        const blocked = roadFootprint(plan);
        const marks = [
          ...plan.numbered.map((s) => s.box),
          ...plan.beads.map((b) => b.box),
          ...plan.signs.map((s) => s.box),
        ];
        for (const p of plots) {
          for (const item of plotDetailItems(p, terrain.get(plotKey(p)) ?? 'sand', blocked)) {
            expect(blocked(item.box), `${item.kind} on ${plotKey(p)} is on the road`).toBe(false);
            for (const s of marks) {
              expect(
                boxesTouch(s, item.box, 0),
                `${item.kind} on ${plotKey(p)} touches the road`,
              ).toBe(false);
            }
            // Detail stays inside its own plot.
            const b = plotBox(p);
            expect(item.box.left).toBeGreaterThanOrEqual(b.x);
            expect(item.box.right).toBeLessThanOrEqual(b.x + b.w);
          }
        }
      }
    }
  });

  it('laying road only clears the ground it reaches; detail elsewhere never moves', () => {
    const plots = landPlots(SAMPLE_ISLAND, 3);
    const land = new Set(plots.map(plotKey));
    const onLand = (s: { plot: Plot }) => land.has(plotKey(s.plot));
    const at = (roadLength: number) => {
      const plan = planRoad({ road: SAMPLE_ISLAND.road, roadLength, onLand, land });
      const blocked = roadFootprint(plan);
      const reached = new Set(plan.spots.map((s) => plotKey(s.plot)));
      const items = new Map(
        plots.map((p) => [plotKey(p), JSON.stringify(plotDetailItems(p, 'grass', blocked))]),
      );
      return { reached, items };
    };
    const before = at(5);
    const after = at(20);
    // Plots the longer road reaches, with their neighbours (the trail runs between plot centres).
    const near = new Set<string>();
    for (const k of after.reached) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        near.add(`${x + dx},${y + dy}`);
      }
    }
    let unchanged = 0;
    for (const p of plots) {
      const k = plotKey(p);
      if (near.has(k)) continue;
      expect(after.items.get(k), `detail on ${k} moved`).toBe(before.items.get(k));
      unchanged++;
    }
    expect(unchanged).toBeGreaterThan(0);
    // With an empty road, every grass plot has its full detail (3 tufts).
    const empty = at(0);
    const full = plots.filter((p) => !empty.reached.has(plotKey(p)));
    expect(full.some((p) => JSON.parse(empty.items.get(plotKey(p)) ?? '[]').length === 3)).toBe(
      true,
    );
  });

  it('gives every stone, including a shared last plot, its own position', () => {
    const stones = roadLayout(SAMPLE_ISLAND.road);
    const keys = new Set(stones.map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)}`));
    expect(keys.size).toBe(stones.length);
    const single = roadLayout([
      { n: 1, plot: [3, 3] },
      { n: 2, plot: [3, 3] },
    ]);
    expect(single[0]?.x).not.toBe(single[1]?.x);
  });

  it('counts the next ring at its pulse peak and the ten-flag in a stone extent', () => {
    const laid = stoneExtent(12, 'laid');
    const next = stoneExtent(12, 'next');
    const ten = stoneExtent(20, 'laid');
    expect(next.right).toBeGreaterThan(laid.right);
    expect(next.top).toBeLessThan(laid.top);
    expect(ten.top).toBeLessThan(stoneExtent(21, 'laid').top);
  });
});

describe('standalone road stone sizing', () => {
  it('renders every numeral ≥ 32 px at the default scale, one size for every number (05 §11)', () => {
    const sizes = new Set<number>();
    for (const n of [1, 7, 10, 85, 100, 999, 1000]) {
      expect(stoneMetrics(n).font * ROAD_STONE_SCALE, String(n)).toBeGreaterThanOrEqual(32);
      sizes.add(stoneMetrics(n).font);
    }
    expect(sizes.size).toBe(1);
    // A longer number widens its stone instead.
    expect(stoneMetrics(1000).w).toBeGreaterThan(stoneMetrics(999).w);
  });

  it('frames every state in one viewBox, so a state change never moves the stone', () => {
    for (const n of [7, 10, 1000]) {
      const box = roadStoneBox(n);
      for (const s of ['laid', 'next', 'counting', 'planned'] as const) {
        const e = stoneExtent(n, s);
        const eps = 1e-9;
        expect(e.left).toBeGreaterThanOrEqual(box.x - eps);
        expect(e.top).toBeGreaterThanOrEqual(box.y - eps);
        expect(e.right).toBeLessThanOrEqual(box.x + box.w + eps);
        expect(e.bottom).toBeLessThanOrEqual(box.y + box.h + eps);
      }
    }
  });
});

describe('reduced motion stops every art loop (06 §7)', () => {
  it('lists every animated art-* class under both the OS setting and data-reduced-motion', () => {
    const css = readFileSync(fileURLToPath(new URL('./art.css', import.meta.url)), 'utf8');
    const animated = [...css.matchAll(/\.(art-[\w-]+)\s*\{\s*animation:\s*art-/g)].map((m) => m[1]);
    expect(animated.length).toBeGreaterThanOrEqual(7);
    const media =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    for (const cls of animated) {
      expect(media, `${cls} under prefers-reduced-motion`).toContain(`.${cls}`);
      expect(css, `${cls} under data-reduced-motion`).toContain(
        `[data-reduced-motion="true"] .${cls}`,
      );
    }
  });
});

describe('motion keeps meaningful marks at full contrast (06 §7)', () => {
  it('the next-stone ring pulses by size only, never by opacity', () => {
    const css = readFileSync(fileURLToPath(new URL('./art.css', import.meta.url)), 'utf8');
    const ring = /@keyframes art-ring\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    // The peak matches the room the road plan reserves (RoadStone NEXT_RING.pulse).
    expect(ring).toContain('scale(1.05)');
    expect(ring).not.toContain('opacity');
  });
});

describe('land crop', () => {
  it('frames the land below the horizon at the requested aspect', () => {
    for (let rings = 1; rings <= SAMPLE_ISLAND.rings.length; rings++) {
      const c = landCrop(SAMPLE_ISLAND, rings, 16 / 9);
      expect(c.y).toBeGreaterThanOrEqual(HORIZON_Y);
      expect(c.w / c.h).toBeCloseTo(16 / 9, 5);
      for (const p of landPlots(SAMPLE_ISLAND, rings)) {
        const b = plotBox(p);
        expect(b.x).toBeGreaterThanOrEqual(c.x);
        expect(b.x + b.w).toBeLessThanOrEqual(c.x + c.w);
      }
    }
  });
});

describe('art palette (05 §11)', () => {
  it('outlines every fill with a palette colour, never the fill itself (except ink)', () => {
    for (const [fill, edge] of Object.entries(OUTLINE_OF)) {
      expect(PALETTE).toHaveProperty(edge);
      if (fill !== 'ink') expect(edge, fill).not.toBe(fill);
    }
    expect(Object.keys(OUTLINE_OF).sort()).toEqual(Object.keys(PALETTE).sort());
  });

  it('outlines are darker than their fills', () => {
    const lum = (c: PaletteColor) => {
      const hex = PALETTE[c];
      const v = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * (v[0] ?? 0) + 0.7152 * (v[1] ?? 0) + 0.0722 * (v[2] ?? 0);
    };
    for (const [fill, edge] of Object.entries(OUTLINE_OF) as [PaletteColor, PaletteColor][]) {
      if (fill === 'ink') continue;
      expect(lum(edge), `${edge} outlines ${fill}`).toBeLessThan(lum(fill));
    }
  });

  it('art source never hard-codes a colour outside the tokens', () => {
    const files = [
      'island/IslandLand.tsx',
      'island/IslandScene.tsx',
      'island/NumberedRoad.tsx',
      'island/PlotMarker.tsx',
      'island/RoadStone.tsx',
      'island/Sea.tsx',
      'island/Sky.tsx',
      'island/TerrainTile.tsx',
      'core/Shading.tsx',
    ];
    for (const f of files) {
      const src = readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), 'utf8');
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    }
  });
});

describe('contrast of numerals, rings and icons (06 §7)', () => {
  for (const p of ART_CONTRAST_PAIRS) {
    for (const l of ['day', 'sunset'] as const) {
      it(`${p.use} (${l}) ≥ ${p.min}:1`, () => {
        expect(pairRatio(p, l)).toBeGreaterThanOrEqual(p.min);
      });
    }
  }
});

describe('island geometry (05 §3)', () => {
  it('lays a 12 × 8 grid in a scene close to the tablet ratio', () => {
    expect(SCENE_W).toBe(1400);
    expect(SCENE_H).toBe(870);
    expect(Math.abs(SCENE_W / SCENE_H - 1280 / 800)).toBeLessThan(0.02);
    const last = plotBox([11, 7]);
    expect(last.x + last.w).toBe(SCENE_W - ISLAND_LAYOUT.padX);
    expect(plotCenter([0, 0], [2, 2])).toEqual({
      x: ISLAND_LAYOUT.padX + ISLAND_LAYOUT.cellW,
      y: ISLAND_LAYOUT.skyH + ISLAND_LAYOUT.padTop + ISLAND_LAYOUT.cellH,
    });
  });

  it('traces one loop around a single plot and an L-shape', () => {
    expect(traceOutline([[3, 3]])).toEqual([
      [
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 4, y: 4 },
        { x: 3, y: 4 },
      ],
    ]);
    const l: Plot[] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
    const loops = traceOutline(l);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
  });

  it('keeps plots that only touch at a corner as separate landmasses', () => {
    expect(
      traceOutline([
        [0, 0],
        [1, 1],
      ]),
    ).toHaveLength(2);
  });

  it('traces a ring with a lagoon as an outer loop and a hole', () => {
    const ring: Plot[] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++) if (x !== 1 || y !== 1) ring.push([x, y]);
    expect(traceOutline(ring)).toHaveLength(2);
  });

  it('offsets loops outwards and inwards', () => {
    const [out] = landLoops([[0, 0]], 10);
    const [inn] = landLoops([[0, 0]], -10);
    const b = plotBox([0, 0]);
    expect(out?.[0]).toEqual({ x: b.x - 10, y: b.y - 10 });
    expect(inn?.[0]).toEqual({ x: b.x + 10, y: b.y + 10 });
    expect(roundedPath(landLoops([[0, 0]], 4), 30)).toMatch(/^M.*Z$/);
  });

  it('grows the sample island ring by ring from a 3-plot sandbar', () => {
    expect(landPlots(SAMPLE_ISLAND, 1)).toHaveLength(3);
    const sizes = SAMPLE_ISLAND.rings.map((_, i) => landPlots(SAMPLE_ISLAND, i + 1).length);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1] ?? 0);
    const t = terrainOf(SAMPLE_ISLAND, 1);
    expect([...t.values()]).toEqual(['sand', 'sand', 'sand']);
    const full = terrainOf(SAMPLE_ISLAND, SAMPLE_ISLAND.rings.length);
    expect(new Set(full.values())).toEqual(new Set(['sand', 'grass', 'meadow', 'rock']));
  });

  it('terrain is deterministic', () => {
    expect([...terrainOf(SAMPLE_ISLAND, 4)]).toEqual([...terrainOf(SAMPLE_ISLAND, 4)]);
  });

  it('places road stones in order along a 4-connected path', () => {
    for (let i = 1; i < SAMPLE_PATH.length; i++) {
      const a = SAMPLE_PATH[i - 1] as Plot;
      const b = SAMPLE_PATH[i] as Plot;
      expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), `step ${i}`).toBe(1);
    }
    const stones = roadLayout(SAMPLE_ISLAND.road);
    expect(stones.map((s) => s.n)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    // Stones sharing a plot stay inside it.
    for (const s of stones) {
      const b = plotBox(s.plot);
      expect(s.x).toBeGreaterThanOrEqual(b.x - b.w * 0.35);
      expect(s.x).toBeLessThanOrEqual(b.x + b.w * 1.35);
    }
  });
});

describe('road stones', () => {
  it('grow with digits and every tenth stone is bigger', () => {
    expect(stoneMetrics(1000).w).toBeGreaterThan(stoneMetrics(100).w);
    expect(stoneMetrics(10).w).toBeGreaterThan(stoneMetrics(11).w);
    expect(stoneMetrics(10).ten).toBe(true);
    expect(stoneMetrics(100).hundred).toBe(true);
    expect(stoneMetrics(0).ten).toBe(false);
  });
});

describe('art registry', () => {
  it('looks art up by GameData art id and refuses other groups', () => {
    expect(buildingArtFor('decor/road-crew')).toBeUndefined();
    expect(decorArtFor('decor/__proto__')).toBeUndefined();
    expect(materialArtFor('plank')).toBeUndefined();
    const all = registeredArt();
    expect(Object.keys(all).sort()).toEqual(['building', 'decor', 'material']);
  });

  it('round-trips a GameData art id through a map keyed by bare id', () => {
    const map = { 'road-crew': 'art' };
    expect(lookupArt(map, 'building', 'building/road-crew')).toBe('art');
    expect(lookupArt(map, 'decor', 'building/road-crew')).toBeUndefined();
    expect(artIds(map, 'building')).toEqual(['building/road-crew']);
    for (const id of artIds(map, 'building')) expect(lookupArt(map, 'building', id)).toBe('art');
  });
});
