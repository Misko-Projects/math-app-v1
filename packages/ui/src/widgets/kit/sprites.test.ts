import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import { generateItem, initContent, resetContent } from '@number-island/engine';
import type { StimulusSpec, WidgetConfig } from '@number-island/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { SPRITE_IDS } from './sprites';

// Sprite coverage (U03): every sprite id the compare and order generators put into an item has its
// own drawing, so no picture silently falls back to the pebble (a feather and a pumpkin would look
// the same in a "which is heavier?" item).

const SEEDS = 300;
const DIFFICULTIES = [-2, 0, 2];
/** The whole catalog (templates × seeds × difficulties) runs on the shared CI runner. */
const TIMEOUT_MS = 120_000;

function stimulusSprites(s: StimulusSpec | undefined, into: Set<string>): void {
  if (!s) return;
  if (s.kind === 'objects') {
    into.add(s.set.sprite);
    if (s.set.distractors) into.add(s.set.distractors.sprite);
  } else if (s.kind === 'groups') {
    into.add(s.sprite);
  } else if (s.kind === 'array') {
    if (s.sprite) into.add(s.sprite);
  } else if (s.kind === 'scene') {
    for (const p of s.sprites) into.add(p.sprite);
  }
}

function widgetSprites(w: WidgetConfig, into: Set<string>): void {
  if (w.format === 'compare') {
    stimulusSprites(w.left, into);
    stimulusSprites(w.right, into);
  } else if (w.format === 'order') {
    for (const item of w.items) stimulusSprites(item.stimulus, into);
  }
}

afterAll(() => resetContent());

describe('every compare/order sprite has its own drawing', () => {
  it(
    'generated items name only drawn sprites',
    () => {
      const result = compileContent(readContentFiles());
      const content = result.content;
      expect(content, result.diagnostics.map((d) => d.message).join('\n')).toBeTruthy();
      if (!content) return;
      initContent(content);
      const templates = content.templates.filter(
        (t) => t.format === 'compare' || t.format === 'order',
      );
      expect(templates.length).toBeGreaterThan(0);

      const used = new Set<string>();
      for (const t of templates) {
        for (const difficulty of DIFFICULTIES) {
          for (let seed = 0; seed < SEEDS; seed += 1) {
            widgetSprites(generateItem(t, seed, { difficulty }).widget, used);
          }
        }
      }
      expect(used.size).toBeGreaterThan(0);
      const undrawn = [...used].filter((id) => !SPRITE_IDS.includes(id)).sort();
      expect(undrawn).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
