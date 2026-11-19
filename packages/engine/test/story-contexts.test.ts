/// <reference types="node" />
// story.addsub's context table (src/generators/story/contexts.ts) stays in step with
// packages/content/contexts.yaml (03 §4.6, V26): each context it tells stories in exists there,
// uses only that context's nouns, and only the situation families the context lists. Every story
// line it emits exists in the compiled narration, and its vars fill every slot the line speaks.

import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import { describe, expect, it } from 'vitest';
import { lineSlots, render } from '../src/content/render';
import { storyLines } from '../src/generators/story/addsub';
import { STORY_CONTEXTS } from '../src/generators/story/contexts';
import { STORY_SITUATIONS, story } from '../src/generators/story/model';
import { compileFixture } from './fixture';

const yamlContexts = () => {
  const result = compileContent(readContentFiles());
  return JSON.parse(result.outputs?.['contexts.json'] ?? '[]') as {
    id: string;
    nouns: string[];
    situations: string[];
  }[];
};

describe('story contexts', () => {
  it('each story context exists in contexts.yaml with its nouns and situation families', () => {
    const byId = new Map(yamlContexts().map((c) => [c.id, c]));
    for (const [id, ctx] of Object.entries(STORY_CONTEXTS)) {
      const y = byId.get(id);
      expect(y, id).toBeDefined();
      for (const noun of [ctx.addItem, ctx.takeItem, ctx.item, ctx.other]) {
        expect(y?.nouns, `${id} ${noun}`).toContain(noun);
      }
      for (const family of ctx.families) {
        expect(y?.situations, `${id} ${family}`).toContain(family);
      }
    }
  });

  it('every story line exists and its vars fill every slot', () => {
    const { narration } = compileFixture();
    for (const situation of STORY_SITUATIONS) {
      for (const context of Object.keys(STORY_CONTEXTS)) {
        for (const line of storyLines(story({ situation, a: 9, b: 4, c: 3 }), context)) {
          expect(narration[line.key], line.key).toBeDefined();
          for (const slot of lineSlots(line.key, narration)) {
            expect(line.vars, `${line.key} {${slot}}`).toHaveProperty(slot);
          }
          const text = render(line.key, line.vars, narration);
          expect(text).not.toMatch(/[{}]/);
          expect(text).not.toBe(line.key);
        }
      }
    }
  });
});
