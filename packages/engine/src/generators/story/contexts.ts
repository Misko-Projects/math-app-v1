// The story contexts story.addsub tells stories in (03 §4.6, V26). Generators are pure and get no
// content input, so this table mirrors the `packages/content/contexts.yaml` entries it uses; a test
// (test/story-contexts.test.ts) keeps every noun and situation family in step with the YAML.
//
// Each context has its own action lines (p.story.<context>.*) because its verbs differ: the beach
// finds and gives away shells; the lighthouse lights lanterns and lets fireflies go. The words stay
// on the K–1 list (03 §8.5).

export type StoryFamily = 'add-to' | 'take-from' | 'put-together' | 'compare';

export interface StoryContext {
  /** The noun of add-to stories. */
  addItem: string;
  /** The noun of take-from stories. */
  takeItem: string;
  /** Put-together stories count `item` in two or three colours; compare stories compare `item` and `other`. */
  item: string;
  other: string;
  /** The SituationType families the context supports (a subset of its contexts.yaml situations). */
  families: readonly StoryFamily[];
}

export const STORY_CONTEXTS: Readonly<Record<string, StoryContext>> = {
  'beach-shells': {
    addItem: 'shell',
    takeItem: 'shell',
    item: 'shell',
    other: 'pebble',
    families: ['add-to', 'take-from', 'put-together', 'compare'],
  },
  'lighthouse-lanterns': {
    addItem: 'lantern',
    takeItem: 'firefly',
    item: 'lantern',
    other: 'firefly',
    families: ['add-to', 'take-from', 'put-together', 'compare'],
  },
};

export const STORY_CONTEXT_IDS = Object.keys(STORY_CONTEXTS);
