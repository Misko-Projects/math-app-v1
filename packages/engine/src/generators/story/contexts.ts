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
  /** A measured context: its amounts are lengths or money in a `unit`, not things to count. */
  measure?: StoryMeasure;
}

export type StoryMeasure = 'length' | 'money';

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
  // #17 slice 4d: measured stories, told in units (`unit`) by their own lines (p.story.len.*,
  // p.story.money.*): the sawmill's planks in inches, feet, centimeters or meters (MEA.04), the
  // market's apples and kites in cents or dollars (MON.03).
  'sawmill-planks': {
    addItem: 'plank',
    takeItem: 'plank',
    item: 'plank',
    other: 'plank',
    families: ['add-to', 'take-from', 'put-together', 'compare'],
    measure: 'length',
  },
  'market-stall': {
    addItem: 'apple',
    takeItem: 'apple',
    item: 'kite',
    other: 'apple',
    families: ['add-to', 'take-from', 'put-together', 'compare'],
    measure: 'money',
  },
};

export const STORY_CONTEXT_IDS = Object.keys(STORY_CONTEXTS);

/** The units a measured context tells its amounts in (`unit` param; narration unit.<id>.*). */
export const MEASURE_UNITS: Readonly<Record<StoryMeasure, readonly string[]>> = {
  length: ['in', 'ft', 'cm', 'm'],
  money: ['cent', 'dollar'],
};
