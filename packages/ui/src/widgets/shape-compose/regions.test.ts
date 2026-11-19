// The highlighted region is exactly where compose.relative accepts the item's centre.
import { ANCHOR_SIZE, inRelation } from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { relationRegions } from './regions';

const WORDS = [
  'above',
  'below',
  'left-of',
  'right-of',
  'beside',
  'next-to',
  'in-front-of',
  'behind',
];

describe('relationRegions matches compose.relative', () => {
  for (const [sprite, [w, h]] of Object.entries(ANCHOR_SIZE)) {
    it.each(WORDS)(`%s a ${sprite}`, (word) => {
      const box = { x: 46, y: 34, w, h };
      const rects = relationRegions(word, box);
      const layer = word === 'behind' ? 'back' : 'front';
      // Every half-unit point of the scene (edges excluded: the checker's < and ≤ differ there).
      for (let x = 0.25; x < 100; x += 0.5) {
        for (let y = 0.25; y < 60; y += 0.5) {
          const shown = rects.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
          expect(shown, `${word} at ${x},${y}`).toBe(inRelation(word, box, [x, y], layer));
        }
      }
    });
  }
});
