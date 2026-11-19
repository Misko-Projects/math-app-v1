import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pairRatio } from '../core/contrast';
import { BUILDING_STAGES } from '../core/types';
import { ISLAND_LAYOUT } from '../island/geometry';
import { buildingArtFor, registeredArt } from '../registry';
import { buildingArt, buildingDrawing } from './BuildingArt';
import { BUILDING_CONTRAST_PAIRS } from './contrast';
import {
  BUILDING_DESIGN,
  BUILDING_IDS,
  BUILDING_PAD,
  buildingAnchor,
  COAST_BUILDINGS,
} from './design';

/** GameData footprints [w, h] in plots (packages/content/game, U02). */
const GAME_FOOTPRINTS: Record<string, [number, number]> = {
  storehouse: [2, 2],
  'road-crew': [2, 1],
  'lantern-grove': [2, 2],
  'ten-boat-dock': [3, 1],
  'treasure-beach': [2, 1],
  'brick-factory': [2, 2],
  'garden-terraces': [2, 2],
  bakery: [2, 1],
  market: [2, 1],
  'clock-tower': [1, 2],
  'builders-yard': [2, 2],
  'weigh-station': [2, 1],
  'rhythm-orchard': [2, 2],
  'puzzle-tower': [1, 2],
  'practice-pier': [2, 1],
  'shell-cottage': [1, 1],
  'driftwood-hut': [1, 1],
  'burrow-house': [1, 1],
  'reef-house': [1, 1],
  lighthouse: [2, 2],
  'east-bridge': [3, 1],
  'festival-stage': [2, 2],
};

describe('building manifest (05 §4, §6)', () => {
  it('registers every building id, and nothing else', () => {
    expect(Object.keys(buildingArt).sort()).toEqual([...BUILDING_IDS].sort());
    expect(Object.keys(buildingDrawing).sort()).toEqual([...BUILDING_IDS].sort());
    expect(Object.keys(GAME_FOOTPRINTS).sort()).toEqual([...BUILDING_IDS].sort());
    for (const id of BUILDING_IDS) {
      expect(buildingArtFor(`building/${id}`), id).toBe(buildingArt[id]);
    }
    expect(registeredArt().building).toHaveLength(BUILDING_IDS.length);
  });

  it('matches the GameData footprints, with the anchor at the bottom-centre', () => {
    for (const id of BUILDING_IDS) {
      const d = BUILDING_DESIGN[id];
      expect(d.footprint, id).toEqual(GAME_FOOTPRINTS[id]);
      const w = d.footprint[0] * ISLAND_LAYOUT.cellW;
      expect(d.viewBox.x, id).toBe(-w / 2 - BUILDING_PAD.side);
      expect(d.viewBox.w, id).toBe(w + 2 * BUILDING_PAD.side);
      // The art box reaches the bottom of the footprint and rises above its back edge.
      const coast = COAST_BUILDINGS.includes(id);
      expect(d.below, id).toBe(coast ? BUILDING_PAD.water : BUILDING_PAD.bottom);
      expect(d.viewBox.y + d.viewBox.h, id).toBe(d.below);
      expect(d.rise, id).toBeGreaterThan(d.footprint[1] * ISLAND_LAYOUT.cellH);
    }
    expect(buildingAnchor([2, 3], [2, 1])).toEqual({
      x: ISLAND_LAYOUT.padX + 3 * ISLAND_LAYOUT.cellW,
      y: ISLAND_LAYOUT.skyH + ISLAND_LAYOUT.padTop + 4 * ISLAND_LAYOUT.cellH,
    });
  });

  it('has four stages', () => {
    expect(BUILDING_STAGES).toEqual(['construction', 1, 2, 3]);
  });
});

describe('building contrast (06 §7)', () => {
  for (const p of BUILDING_CONTRAST_PAIRS) {
    for (const l of ['day', 'sunset'] as const) {
      it(`${p.use} (${l}) ≥ ${p.min}:1`, () => {
        expect(pairRatio(p, l)).toBeGreaterThanOrEqual(p.min);
      });
    }
  }
});

describe('building palette (05 §11)', () => {
  it('source never hard-codes a colour outside the tokens', () => {
    const dir = fileURLToPath(new URL('./', import.meta.url));
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    }
  });
});
