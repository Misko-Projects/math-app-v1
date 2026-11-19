import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import { describe, expect, it } from 'vitest';
import { buildingArtFor, decorArtFor, materialArtFor, registeredArt } from './registry';

// Registry coverage (U02): every `art` id the live GameData names resolves to registered art, and
// every registered art id is used by the GameData, so the game never asks for a drawing that does
// not exist and the art kit carries nothing the game cannot show.

const result = compileContent(readContentFiles());
const game = result.content?.game;

describe('every GameData art id resolves to registered art (02 §5.8)', () => {
  it('the game data compiles', () => {
    expect(game, result.diagnostics.map((d) => d.message).join('\n')).toBeDefined();
  });

  const used = {
    building: (game?.buildings ?? []).map((b) => b.art),
    decor: (game?.decor ?? []).map((d) => d.art),
    material: (game?.materials ?? []).map((m) => m.art),
  };
  const lookup = { building: buildingArtFor, decor: decorArtFor, material: materialArtFor };

  for (const group of ['building', 'decor', 'material'] as const) {
    it(`${group}: every art id the game data names is drawn`, () => {
      expect(used[group].length).toBeGreaterThan(0);
      const missing = used[group].filter((art) => !lookup[group](art));
      expect(missing).toEqual([]);
    });

    it(`${group}: every registered drawing is named by the game data`, () => {
      const unused = registeredArt()[group].filter((art) => !used[group].includes(art));
      expect(unused).toEqual([]);
    });
  }
});
