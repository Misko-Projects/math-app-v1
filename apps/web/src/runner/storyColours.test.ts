// @vitest-environment node
// A story's colour words and its picture (#13): every colour a shipped story-problem line names
// is one the widget draws, and the scene's group i is drawn in the i-th colour its line names.

import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import * as engine from '@number-island/engine';
import type { NarrationJson } from '@number-island/shared';
import { planLine } from '@number-island/ui';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureContent } from '@/data/store.test-support';
import { residentEngine } from './resident';

/** Colour words a story might use; the first three are drawn (engine `STORY_COLOURS`). */
const COLOUR_WORDS =
  /\b(red|white|blue|green|yellow|orange|purple|pink|black|brown|gr[ae]y|gold|silver)\b/g;
const SEEDS = 40;

let narration: NarrationJson;

beforeAll(() => {
  const compiled = compileContent(readContentFiles()).content;
  if (!compiled) throw new Error('the fixture content does not compile');
  narration = compiled.narration;
  engine.initContent({
    templates: compiled.templates,
    narration: compiled.narration,
    misconceptions: compiled.misconceptions,
  });
});

describe('the colours a story names and the colours its scene is drawn in', () => {
  it('every colour word of every shipped story line is mapped, and group i is drawn in colour i', () => {
    const about = residentEngine(engine, { id: 'nib', name: 'Nib' });
    const templates = Object.values(fixtureContent().graph.templates).filter(
      (t) => t.format === 'story-problem',
    );
    expect(templates.map((t) => t.id).sort()).toEqual([
      'ADD.12.t1',
      'ADD.20.t3',
      'ADD.21.t2',
      'ADD.25.t2',
      // #17 slice 4d: grade 2 stories (bar-model scenes; no colour words).
      'MDA.06.t1',
      'MDA.06.t3',
      'MDA.19.t1',
      'MDA.19.t3',
      'MEA.04.t1',
      'MEA.04.t3',
      'MON.03.t1',
      'MON.03.t2',
      'MON.03.t4',
    ]);
    const colouredLines = new Set<string>();
    let colouredScenes = 0;
    for (const template of templates) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const item = about.generateItem(template, seed);
        if (item.widget.format !== 'story-problem') throw new Error('not a story problem');
        const config = item.widget;
        const groups = config.scene.kind === 'scene' ? config.scene.sprites.length : 0;
        const drawn = engine.storySceneColours(config);
        const what = `${template.id} seed ${seed}`;
        expect(drawn, what).toHaveLength(groups);
        let told: string[] | null = null;
        for (const line of config.lines) {
          const text = planLine(narration, line.key, line.vars)?.text ?? '';
          const words = text.toLowerCase().match(COLOUR_WORDS) ?? [];
          if (words.length === 0) continue;
          colouredLines.add(line.key);
          // Every colour named is one the widget can draw.
          for (const w of words) expect(engine.STORY_COLOURS, `${what}: "${text}"`).toContain(w);
          const mapped = engine.STORY_LINE_COLOURS[line.key];
          if (mapped) {
            // The table says what the words say, in the order they are said.
            expect(mapped, `${what}: "${text}"`).toEqual(words);
            told = words;
          } else {
            // Else the line is known to name the parts of one told whole (nothing to colour).
            expect(engine.STORY_COLOUR_LINES_OF_A_WHOLE, `${what}: "${text}"`).toContain(line.key);
          }
        }
        if (told && config.scene.kind === 'bar-model') {
          // A bar-model scene (#17 slice 4d) shows the told numbers on its pieces, not the things:
          // nothing is drawn in a colour the story names.
          expect(drawn, what).toEqual([]);
        } else if (told) {
          // A line that tells the groups by colour: the scene has one group for each, in order.
          expect(drawn, what).toEqual(told);
          colouredScenes += 1;
        } else {
          expect(
            drawn.every((c) => c === null),
            what,
          ).toBe(true);
        }
      }
    }
    // Both colour-telling lines and the whole-and-parts lines came up in the sweep.
    expect([...colouredLines].sort()).toEqual(
      [...Object.keys(engine.STORY_LINE_COLOURS), ...engine.STORY_COLOUR_LINES_OF_A_WHOLE].sort(),
    );
    expect(colouredScenes).toBeGreaterThan(10);
  });

  it('colours are named only where the line and the scene agree on how many groups there are', () => {
    const lines = [
      { key: 'p.story.pt.three', vars: { who: 'nib', item: 'shell', many: 2, a: 2, b: 2, c: 2 } },
    ];
    const scene = (n: number) => ({
      kind: 'scene' as const,
      context: 'beach-shells',
      sprites: Array.from({ length: n }, () => ({ sprite: 'shell', count: 2 })),
    });
    expect(engine.storySceneColours({ scene: scene(3), lines })).toEqual(['red', 'white', 'blue']);
    expect(engine.storySceneColours({ scene: scene(2), lines })).toEqual([null, null]);
    expect(engine.storySceneColours({ scene: { kind: 'none' }, lines })).toEqual([]);
  });
});
