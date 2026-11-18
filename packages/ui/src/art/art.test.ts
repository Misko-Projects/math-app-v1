import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plot } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { PALETTE, type PaletteColor } from '../tokens/tokens';
import { ART_CONTRAST_PAIRS, pairRatio } from './core/contrast';
import { OUTLINE_OF } from './core/paint';
import { SAMPLE_ISLAND, SAMPLE_PATH } from './gallery/sampleIsland';
import {
  ISLAND_LAYOUT,
  landLoops,
  landPlots,
  plotBox,
  plotCenter,
  roadLayout,
  roundedPath,
  SCENE_H,
  SCENE_W,
  terrainOf,
  traceOutline,
} from './island/geometry';
import { stoneMetrics } from './island/RoadStone';
import { buildingArtFor, decorArtFor, materialArtFor, registeredArt } from './registry';

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
});
