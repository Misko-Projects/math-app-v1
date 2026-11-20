import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import { generateItem, initContent, resetContent } from '@number-island/engine';
import type { StimulusSpec, WidgetConfig } from '@number-island/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { SPRITE_IDS } from './sprites';

// Sprite coverage (U03): every sprite id the compare and order generators put into an item has its
// own drawing, so no picture silently falls back to the pebble (a feather and a pumpkin would look
// the same in a "which is heavier?" item).
//
// How the catalog is sampled. An item made for a target difficulty is the pick among 24 candidate
// draws (`CANDIDATES_WITH_TARGET`), so reading one widget costs 24 builds. The test used to read
// 900 such picks a template (21 600 builds each: 168 s on CI for 53 templates). It now reads
// every draw it builds:
//
// - `DRAWS` items with no target: one candidate each, straight from the generator's own sampler
//   (the same sampler every targeted candidate comes from). Three times as many widgets read as
//   before, at an eighth of the builds.
// - `TARGETED_SEEDS` picks at each difficulty in `DIFFICULTIES`, so the targeted path
//   (`sampleToward`, the pick at both ends of the scale) is still walked.
//
// 3 564 builds a template instead of 21 600, and no sprite the old sampling found is lost (checked
// on the catalog merged with the time strand when this changed: the new sampling names every sprite
// the old one did, and one it missed).

const DRAWS = 2700;
const TARGETED_SEEDS = 12;
const DIFFICULTIES = [-2, 0, 2];
/** The whole catalog runs on the shared CI runner (about 30 s there; this leaves room). */
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

      /** Sprite id → the templates that name it (so a failure says where the sprite is used). */
      const usedBy = new Map<string, Set<string>>();
      for (const t of templates) {
        const used = new Set<string>();
        for (let seed = 0; seed < DRAWS; seed += 1) {
          widgetSprites(generateItem(t, seed).widget, used);
        }
        for (const difficulty of DIFFICULTIES) {
          for (let seed = 0; seed < TARGETED_SEEDS; seed += 1) {
            widgetSprites(generateItem(t, seed, { difficulty }).widget, used);
          }
        }
        for (const id of used) {
          const by = usedBy.get(id) ?? new Set<string>();
          by.add(t.id);
          usedBy.set(id, by);
        }
      }
      expect(usedBy.size).toBeGreaterThan(0);
      const undrawn = [...usedBy.keys()]
        .filter((id) => !SPRITE_IDS.includes(id))
        .sort()
        .map((id) => `${id} (${[...(usedBy.get(id) ?? [])].sort().join(', ')})`);
      expect(undrawn).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
