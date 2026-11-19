import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plot } from '@number-island/shared';
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
import {
  ROAD_STONE_SCALE,
  roadStoneBox,
  type StoneExtent,
  stoneExtent,
  stoneMetrics,
} from './island/RoadStone';
import {
  BEAD_RING_K,
  beadExtent,
  boxesTouch,
  MAP_STONE_SCALE,
  NEXT_HIT_RADIUS,
  nextHitRadius,
  type PlannedStone,
  planRoad,
  type RoadBead,
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
  const spotOf = new Map(layout.map((s) => [s.n, s]));
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
  /** A bead's disc, with its ink outline. */
  /** How far a bead draws from its centre in its state: its ring when highlighted (at the pulse
   * peak, with its outline), else the bead with its outline. Computed here, not from roadPlan. */
  const drawn = (b: RoadBead) =>
    (b.state === 'next' || b.state === 'counting') && b.ringed
      ? b.r * BEAD_RING_K * 1.05 + 1.25
      : b.r * 1.15 + 1;

  it('draws every stone in the range exactly once, at its own spot, in order', () => {
    for (const { plan, roadLength, onLand, where } of plans()) {
      const drawn = [...plan.numbered, ...plan.beads].map((s) => s.n).sort((a, b) => a - b);
      const expected = layout.filter((s) => s.n <= roadLength + 1 && onLand(s)).map((s) => s.n);
      expect(drawn, where).toEqual(expected);
      for (const s of [...plan.numbered, ...plan.beads]) {
        expect({ x: s.x, y: s.y }, `${where}: stone ${s.n} moved`).toEqual({
          x: spotOf.get(s.n)?.x,
          y: spotOf.get(s.n)?.y,
        });
      }
    }
    // On the whole island, the stones are exactly 1 … roadLength + 1: one for every number.
    const land = new Set(landPlots(SAMPLE_ISLAND, SAMPLE_ISLAND.rings.length).map(plotKey));
    for (const roadLength of [0, 9, 39, 40, 41, 66, 99]) {
      const plan = planRoad({
        road: SAMPLE_ISLAND.road,
        roadLength,
        onLand: (s) => land.has(plotKey(s.plot)),
      });
      const count = plan.numbered.length + plan.beads.length;
      expect(count, `road ${roadLength}`).toBe(roadLength + 1);
    }
  });

  it('walks the road in order: each stone is next to the one before it, never past it', () => {
    // Along the trail, stone n + 1 is always nearer to n than any later stone is (no doubling
    // back), and the trail visits the laid stones in number order.
    for (let n = 1; n < layout.length - 1; n++) {
      const a = layout[n - 1] as (typeof layout)[number];
      const b = layout[n] as (typeof layout)[number];
      const c = layout[n + 1] as (typeof layout)[number];
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
    expect(plan.trail).toEqual(layout.map((s) => ({ x: s.x, y: s.y })));
  });

  it('spaces stones sharing plots evenly (on the ground, before the map tilt)', () => {
    const perPlot = new Map<string, number>();
    for (const s of layout) perPlot.set(plotKey(s.plot), (perPlot.get(plotKey(s.plot)) ?? 0) + 1);
    const tilt = ISLAND_LAYOUT.cellW / ISLAND_LAYOUT.cellH;
    for (let i = 1; i < layout.length; i++) {
      const a = layout[i - 1] as (typeof layout)[number];
      const b = layout[i] as (typeof layout)[number];
      const m = perPlot.get(plotKey(a.plot)) ?? 1;
      if (m < 2 || perPlot.get(plotKey(b.plot)) !== m) continue;
      const ground = Math.hypot(b.x - a.x, (b.y - a.y) * tilt);
      const step = ISLAND_LAYOUT.cellW / m;
      expect(ground, `stones ${a.n} and ${b.n}`).toBeGreaterThan(step * 0.8);
      expect(ground, `stones ${a.n} and ${b.n}`).toBeLessThan(step * 1.2);
    }
  });

  it('never lets a stone, bead or signpost touch another', () => {
    // Failures are collected (one expect per plan keeps the sweep fast).
    for (const { plan, where } of plans()) {
      const { numbered, beads, signs } = plan;
      const bad: string[] = [];
      for (let i = 0; i < numbered.length; i++) {
        const a = numbered[i] as PlannedStone;
        for (let j = i + 1; j < numbered.length; j++) {
          const b = numbered[j] as PlannedStone;
          if (boxesTouch(a.box, b.box, STONE_CLEARANCE - 0.01)) bad.push(`stones ${a.n}, ${b.n}`);
        }
        for (const b of beads)
          if (boxesTouch(a.box, b.box, 0)) bad.push(`stone ${a.n}, bead ${b.n}`);
      }
      for (let i = 0; i < beads.length; i++) {
        const a = beads[i] as RoadBead;
        for (let j = i + 1; j < beads.length; j++) {
          const b = beads[j] as RoadBead;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < drawn(a) + drawn(b) + 0.5 - 1e-9) {
            bad.push(`beads ${a.n}, ${b.n}`);
          }
        }
      }
      const marks = [
        ...numbered.map((s) => ({ n: s.n, box: s.box })),
        ...beads.map((b) => ({ n: b.n, box: beadExtent(b) })),
      ];
      for (let i = 0; i < signs.length; i++) {
        const s = signs[i] as RoadSign;
        const own = spotOf.get(s.n);
        if (own?.x !== s.anchor.x || own?.y !== s.anchor.y) bad.push(`sign ${s.n} off its bead`);
        for (const m of marks) {
          if (m.n !== s.n && boxesTouch(s.box, m.box, 0)) bad.push(`sign ${s.n} on ${m.n}`);
        }
        for (let j = i + 1; j < signs.length; j++) {
          const t = signs[j] as RoadSign;
          if (boxesTouch(s.box, t.box, 2)) bad.push(`signs ${s.n}, ${t.n}`);
        }
      }
      expect(bad, where).toEqual([]);
    }
  }, 30_000);

  it('labels the numbers that matter where the road is beads: 1, the tens, next and counted', () => {
    for (const { plan, roadLength, counting, where } of plans()) {
      const signed = new Set(plan.signs.map((s) => s.n));
      for (const b of plan.beads) {
        const matters =
          b.n === roadLength + 1 ||
          b.n === counting ||
          (b.n <= roadLength && (b.n === 1 || b.n % 10 === 0));
        expect(signed.has(b.n), `${where}: bead ${b.n} sign`).toBe(matters);
      }
      for (const s of plan.signs) expect(plan.beads.some((b) => b.n === s.n)).toBe(true);
    }
  });

  it('keeps a stone in one form as the road grows, is counted or the island grows', () => {
    const shape = roadShape(SAMPLE_ISLAND.road);
    // The sample's stones 1–39 have a plot each; 41 onwards share plots three to a plot.
    for (let n = 1; n <= 39; n++) expect(shape.numbered.has(n), `stone ${n}`).toBe(true);
    for (let n = 41; n <= 100; n++) expect(shape.numbered.has(n), `stone ${n}`).toBe(false);
    for (const { plan, where } of plans()) {
      for (const s of plan.numbered) expect(shape.numbered.has(s.n), where).toBe(true);
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

  it('gives the next stone a tap target ≥ 80 CSS px and clear ground around it', () => {
    expect(2 * NEXT_HIT_RADIUS * (1280 / SCENE_W)).toBeGreaterThanOrEqual(80);
    for (const { plan, roadLength, onLand, where } of plans()) {
      const spot = spotOf.get(roadLength + 1);
      if (!spot || !onLand(spot)) {
        expect(plan.next, where).toBeNull();
        continue;
      }
      expect(plan.next, where).toEqual({ x: spot.x, y: spot.y });
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
      const next = plan.next as { x: number; y: number };
      const stone = [...plan.numbered, ...plan.beads].find((s) => s.n === roadLength + 1);
      const own = stone?.box as StoneExtent;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const x = dx < 0 ? own.left - 12 : dx > 0 ? own.right + 12 : next.x;
        const y = dy < 0 ? own.top - 12 : dy > 0 ? own.bottom + 12 : next.y;
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
    // The halo's curved top (back-row plots pushed out by its reach) stays HORIZON_GAP below the
    // horizon, checked on the real traced halo outline of the full sample island.
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

  it('keeps a counted bead and the next bead beside it apart, rings and all', () => {
    // Review s_6b67c8a45d54 #1: on the whole sample island, 41 is counted and 42 is next, 70/3
    // apart; both rings at their pulse peak with outlines must stay clear of each other.
    const land = new Set(landPlots(SAMPLE_ISLAND, SAMPLE_ISLAND.rings.length).map(plotKey));
    const plan = planRoad({
      road: SAMPLE_ISLAND.road,
      roadLength: 41,
      counting: 41,
      onLand: (s) => land.has(plotKey(s.plot)),
    });
    const a = plan.beads.find((b) => b.n === 41) as RoadBead;
    const b = plan.beads.find((b) => b.n === 42) as RoadBead;
    expect([a.state, b.state]).toEqual(['counting', 'next']);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(drawn(a) + drawn(b));
  });

  it('labels the counted and next beads on a dense plot of ten, clear of their neighbours', () => {
    // Review s_6b67c8a45d54 #2: stones 1–10 share one plot (10 units apart), 1–5 laid, 4 counted,
    // 6 next and 7 planned ahead.
    const road = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, plot: [4, 3] as Plot }));
    const plan = planRoad({
      road,
      roadLength: 5,
      counting: 4,
      plannedAhead: 1,
      onLand: () => true,
    });
    expect(plan.beads.map((b) => b.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const signed = new Set(plan.signs.map((s) => s.n));
    for (const n of [1, 4, 6]) expect(signed.has(n), `sign ${n}`).toBe(true);
    for (const s of plan.signs) {
      for (const b of plan.beads) {
        if (b.n === s.n) continue;
        expect(boxesTouch(s.box, beadExtent(b), 0), `sign ${s.n} on bead ${b.n}`).toBe(false);
        for (const p of s.points) {
          expect(Math.hypot(p.x - b.x, p.y - b.y), `post ${s.n} by bead ${b.n}`).toBeGreaterThan(
            drawn(b),
          );
        }
      }
    }
    for (let i = 0; i < plan.beads.length; i++) {
      for (let j = i + 1; j < plan.beads.length; j++) {
        const a = plan.beads[i] as RoadBead;
        const b = plan.beads[j] as RoadBead;
        expect(Math.hypot(a.x - b.x, a.y - b.y), `beads ${a.n}, ${b.n}`).toBeGreaterThan(
          drawn(a) + drawn(b),
        );
      }
    }
  });

  it('keeps neighbouring highlights apart and labelled on a dense vertical stretch', () => {
    // Review s_1a5e5e67ad99 #1–2: twelve stones to a plot on a road running down the map (70 / 12
    // ≈ 5.8 apart), 6 counted, 7 next and 8 planned ahead. No room for rings there: the beads
    // stay plain and apart, and both highlights keep their signposts.
    const road = [
      ...Array.from({ length: 12 }, (_, i) => ({ n: i + 1, plot: [4, 3] as Plot })),
      ...Array.from({ length: 12 }, (_, i) => ({ n: i + 13, plot: [4, 4] as Plot })),
    ];
    const plan = planRoad({
      road,
      roadLength: 6,
      counting: 6,
      plannedAhead: 1,
      onLand: () => true,
    });
    const at = (n: number) => plan.beads.find((b) => b.n === n) as RoadBead;
    expect([at(6).state, at(7).state]).toEqual(['counting', 'next']);
    expect(at(6).ringed).toBe(false);
    for (let i = 0; i < plan.beads.length; i++) {
      for (let j = i + 1; j < plan.beads.length; j++) {
        const a = plan.beads[i] as RoadBead;
        const b = plan.beads[j] as RoadBead;
        expect(Math.hypot(a.x - b.x, a.y - b.y), `beads ${a.n}, ${b.n}`).toBeGreaterThan(
          drawn(a) + drawn(b),
        );
      }
    }
    const signed = new Set(plan.signs.map((s) => s.n));
    for (const n of [1, 6, 7]) expect(signed.has(n), `sign ${n}`).toBe(true);
    for (const s of plan.signs) {
      for (const b of plan.beads) {
        if (b.n === s.n) continue;
        expect(boxesTouch(s.box, beadExtent(b), 0), `sign ${s.n} on bead ${b.n}`).toBe(false);
        for (const p of s.points) {
          expect(Math.hypot(p.x - b.x, p.y - b.y), `post ${s.n} by bead ${b.n}`).toBeGreaterThan(
            drawn(b),
          );
        }
      }
    }
    // A sparser stretch of the same road keeps larger, ringed beads: sizes follow the local gap.
    const sample = planRoad({
      road: SAMPLE_ISLAND.road,
      roadLength: 60,
      onLand: () => true,
    });
    expect(sample.beads.every((b) => b.ringed)).toBe(true);
  });

  it("keeps the next stone's tap target ≥ 80 CSS px at every supported viewport (06 §1, §4)", () => {
    // CSS px per scene unit for the full 1400 × 870 map fitted to each viewport.
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

  it('keeps beads apart and the next and counted stones labelled at any density (1–12 a plot)', () => {
    // A road snaking across the whole 12 × 8 grid (rows left to right, then right to left), with
    // `k` stones to a plot, so it has long horizontal runs and short vertical turns.
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
            const where = `k ${k}, road ${roadLength}, counting ${c}, ahead ${plannedAhead}`;
            const { beads, signs, numbered } = plan;
            for (let i = 0; i < beads.length; i++) {
              const a = beads[i] as RoadBead;
              for (let j = i + 1; j < beads.length; j++) {
                const b = beads[j] as RoadBead;
                if (Math.hypot(a.x - b.x, a.y - b.y) <= drawn(a) + drawn(b)) {
                  bad.push(`${where}: beads ${a.n}, ${b.n}`);
                }
              }
            }
            // The next and counted stones and stone 1 are always labelled; on a map packed this
            // densely the tens are labelled where there is room (the sample-island sweep requires
            // every one).
            const signed = new Set(signs.map((s) => s.n));
            for (const b of beads) {
              const matters = b.n === roadLength + 1 || b.n === c || b.n === 1;
              if (matters && !signed.has(b.n)) bad.push(`${where}: no sign for ${b.n}`);
            }
            for (let i = 0; i < signs.length; i++) {
              const s = signs[i] as RoadSign;
              for (const b of beads) {
                if (b.n === s.n) continue;
                if (boxesTouch(s.box, beadExtent(b), 0))
                  bad.push(`${where}: sign ${s.n} on ${b.n}`);
                if (s.points.some((p) => Math.hypot(p.x - b.x, p.y - b.y) <= drawn(b))) {
                  bad.push(`${where}: post ${s.n} through ${b.n}`);
                }
              }
              for (const t of numbered) {
                if (boxesTouch(s.box, t.box, 0)) bad.push(`${where}: sign ${s.n} on stone ${t.n}`);
              }
              for (let j = i + 1; j < signs.length; j++) {
                if (boxesTouch(s.box, (signs[j] as RoadSign).box, 2)) {
                  bad.push(`${where}: signs ${s.n}, ${(signs[j] as RoadSign).n}`);
                }
              }
            }
          }
        }
      }
    }
    expect(bad.slice(0, 12)).toEqual([]);
  }, 60_000);

  it('fits three stones on one plot: all drawn, the counted and next labelled, none touching', () => {
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
    const all = [...plan.numbered, ...plan.beads];
    expect(all.map((s) => s.n).sort()).toEqual([1, 2, 3]);
    expect(plan.signs.map((s) => s.n).sort()).toEqual([1, 2, 3]);
    const boxes = [...all.map((s) => s.box), ...plan.signs.map((s) => s.box)];
    for (let i = 0; i < plan.signs.length; i++) {
      const sign = plan.signs[i] as RoadSign;
      for (const b of plan.beads) {
        if (b.n !== sign.n) expect(boxesTouch(sign.box, b.box, 0), `sign ${sign.n}`).toBe(false);
      }
      for (let j = i + 1; j < plan.signs.length; j++) {
        expect(boxesTouch(sign.box, (plan.signs[j] as RoadSign).box, 2)).toBe(false);
      }
    }
    expect(boxes.length).toBe(6);
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
