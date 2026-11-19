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
  terrainOf,
  traceOutline,
} from './island/geometry';
import { CAMERA_MAX_Y, clampCamera } from './island/IslandScene';
import { plotDetailItems } from './island/plotDetail';
import { ROAD_STONE_SCALE, roadStoneBox, stoneExtent, stoneMetrics } from './island/RoadStone';
import { boxesTouch, planRoad, roadFootprint, STONE_CLEARANCE } from './island/roadPlan';
import {
  artIds,
  buildingArtFor,
  decorArtFor,
  lookupArt,
  materialArtFor,
  registeredArt,
} from './registry';

describe('road plan: stones never touch (05 §3)', () => {
  const ringSets = [2, 3, 4, SAMPLE_ISLAND.rings.length];
  for (const rings of ringSets) {
    it(`numbered stones stay clear for every road length 0–100 (${rings} rings)`, () => {
      const land = new Set(landPlots(SAMPLE_ISLAND, rings).map(plotKey));
      const onLand = (s: { plot: Plot }) => land.has(plotKey(s.plot));
      for (let roadLength = 0; roadLength <= 100; roadLength++) {
        const countings = [null, roadLength, roadLength - 1, roadLength - (roadLength % 10), 1];
        for (const c of countings) {
          const counting = c !== null && c >= 1 && c <= roadLength ? c : null;
          const plan = planRoad({ road: SAMPLE_ISLAND.road, roadLength, counting, onLand, land });
          const where = `roadLength ${roadLength}, counting ${counting}, rings ${rings}`;
          for (let i = 0; i < plan.numbered.length; i++) {
            for (let j = i + 1; j < plan.numbered.length; j++) {
              const a = plan.numbered[i];
              const b = plan.numbered[j];
              if (!a || !b) continue;
              expect(
                boxesTouch(a.box, b.box, STONE_CLEARANCE - 0.01),
                `${where}: stones ${a.n} and ${b.n} touch`,
              ).toBe(false);
            }
          }
          const numbered = new Set(plan.numbered.map((s) => s.n));
          const shown = roadLayout(SAMPLE_ISLAND.road).filter(
            (s) => onLand(s) && s.n <= roadLength + 1,
          );
          const isShown = (n: number) => shown.some((s) => s.n === n);
          // The next stone and the counted stone always show their numerals (stepping out beside
          // the road on a leader when there is no room on it)…
          if (isShown(roadLength + 1)) {
            expect(numbered.has(roadLength + 1), `${where}: next missing`).toBe(true);
          }
          if (counting !== null && isShown(counting)) {
            expect(numbered.has(counting), `${where}: counting missing`).toBe(true);
          }
          // …and stone 1 and the tens never yield to them.
          for (const n of [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
            if (!isShown(n)) continue;
            expect(numbered.has(n), `${where}: landmark ${n} missing`).toBe(true);
          }
          // On the roomy stretch (sample stones 1–39 have a plot each) a stone keeps its numeral,
          // unless a stepped-out highlighted stone had no open ground and stands on its spot (the
          // sample's road fills every plot, so that can happen here; landmarks never give way).
          const steppedOut = plan.numbered.filter((k) => k.leader);
          for (let n = 1; n <= Math.min(39, roadLength + 1); n++) {
            if (!isShown(n) || numbered.has(n)) continue;
            const spot = shown.find((t) => t.n === n) as (typeof shown)[number];
            const covered = steppedOut.some(
              (k) => Math.abs(k.x - spot.x) < 70 && Math.abs(k.y - spot.y) < 60,
            );
            expect(covered, `${where}: stone ${n} missing with no stepped-out stone on it`).toBe(
              true,
            );
          }
          // A stepped-out stone lands on land.
          for (const s of plan.numbered) {
            if (!s.leader) continue;
            const key = `${Math.floor((s.x - ISLAND_LAYOUT.padX) / ISLAND_LAYOUT.cellW)},${Math.floor(
              (s.y - ISLAND_LAYOUT.skyH - ISLAND_LAYOUT.padTop) / ISLAND_LAYOUT.cellH,
            )}`;
            expect(land.has(key), `${where}: ${s.n} stepped into the sea`).toBe(true);
          }
          // A stepped-out stone keeps its leader to its own spot on the road.
          for (const s of plan.numbered) {
            if (!s.leader) continue;
            expect(s.n === counting || s.n === roadLength + 1, `${where}: leader on ${s.n}`).toBe(
              true,
            );
            const spot = shown.find((t) => t.n === s.n);
            expect(s.leader).toEqual({ x: spot?.x, y: spot?.y });
          }
          for (const p of plan.pebbles) expect(numbered.has(p.n)).toBe(false);
          for (let i = 0; i < plan.pebbles.length; i++) {
            for (let j = i + 1; j < plan.pebbles.length; j++) {
              const a = plan.pebbles[i];
              const b = plan.pebbles[j];
              if (!a || !b) continue;
              // Pebble boxes are 18 × 15 with 2 units between them.
              const apart = Math.abs(a.x - b.x) >= 20 || Math.abs(a.y - b.y) >= 17;
              expect(apart, `${where}: pebbles ${a.n} and ${b.n} pile up`).toBe(true);
            }
          }
        }
      }
    });
  }

  it('numbers every stone on a roomy road (one stone per plot)', () => {
    const land = new Set(landPlots(SAMPLE_ISLAND, 3).map(plotKey));
    const plan = planRoad({
      road: SAMPLE_ISLAND.road,
      roadLength: 20,
      counting: 12,
      onLand: (s) => land.has(plotKey(s.plot)),
    });
    expect(plan.compact).toBe(false);
    expect(plan.numbered.map((s) => s.n).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 21 }, (_, i) => i + 1),
    );
  });

  it('keeps every numeral on the roomy stretch when only the far end is crowded', () => {
    const land = new Set(landPlots(SAMPLE_ISLAND, 4).map(plotKey));
    const plan = planRoad({
      road: SAMPLE_ISLAND.road,
      roadLength: 45,
      onLand: (s) => land.has(plotKey(s.plot)),
    });
    expect(plan.compact).toBe(true);
    const numbered = new Set(plan.numbered.map((s) => s.n));
    // Sample stones 1–40 have a plot each; 41 onwards share plots three to a plot.
    for (let n = 1; n <= 39; n++) expect(numbered.has(n), `stone ${n}`).toBe(true);
    // 40 is a landmark and 46 the next stone; 45 sits right beside 46, so it may yield to it.
    for (const n of [40, 46]) expect(numbered.has(n), `stone ${n}`).toBe(true);
  });

  it('keeps landmark 50 when the next stone 51 shares its plot (it steps out instead)', () => {
    const land = new Set(landPlots(SAMPLE_ISLAND, SAMPLE_ISLAND.rings.length).map(plotKey));
    const plan = planRoad({
      road: SAMPLE_ISLAND.road,
      roadLength: 50,
      onLand: (s) => land.has(plotKey(s.plot)),
    });
    const fifty = plan.numbered.find((s) => s.n === 50);
    const next = plan.numbered.find((s) => s.n === 51);
    expect(fifty?.leader).toBeUndefined();
    expect(next?.state).toBe('next');
    expect(next?.leader).toBeDefined();
  });

  it('holds vertical pans so the island and its halo stay in the sea', () => {
    expect(clampCamera({ x: 30, y: 140 })).toEqual({ x: 30, y: CAMERA_MAX_Y });
    expect(clampCamera({ x: 0, y: -60 })).toEqual({ x: 0, y: -60 });
    expect(CAMERA_MAX_Y).toBeGreaterThan(20);
    // The halo's curved top (back-row plots pushed out by its reach) stays below the horizon,
    // checked on the real traced halo outline of the full sample island.
    const plots = landPlots(SAMPLE_ISLAND, SAMPLE_ISLAND.rings.length);
    const haloTop =
      Math.min(
        ...landLoops(plots, 46)
          .flat()
          .map((p) => p.y),
      ) - 16;
    expect(haloTop - CAMERA_MAX_Y).toBeGreaterThan(HORIZON_Y);
    expect(plotBox([0, 0]).y - HALO_REACH - CAMERA_MAX_Y).toBeGreaterThan(HORIZON_Y);
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
        const stones = [
          ...plan.numbered.map((s) => s.box),
          ...plan.pebbles.map((p) => ({
            left: p.x - 9,
            right: p.x + 9,
            top: p.y - 6,
            bottom: p.y + 9,
          })),
        ];
        for (const p of plots) {
          for (const item of plotDetailItems(p, terrain.get(plotKey(p)) ?? 'sand', blocked)) {
            expect(blocked(item.box), `${item.kind} on ${plotKey(p)} is on the road`).toBe(false);
            for (const s of stones) {
              expect(
                boxesTouch(s, item.box, 0),
                `${item.kind} on ${plotKey(p)} touches a stone`,
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
  it('renders every numeral ≥ 32 px at the default scale (05 §11)', () => {
    for (const n of [1, 7, 10, 85, 100, 999, 1000]) {
      expect(stoneMetrics(n).font * ROAD_STONE_SCALE, String(n)).toBeGreaterThanOrEqual(32);
    }
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
