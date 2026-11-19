// The story model of story.addsub (addsub.ts), shared with the story misconception rules
// (MC.keyword-more-means-add, MC.start-unknown-reversed). Pure: no generator helpers, so the rules
// can import it without an import cycle.

import type { ParamValues, SituationType } from '@number-island/shared';
import type { StoryFamily } from './contexts';

export const STORY_SITUATIONS = [
  'add-to/result',
  'add-to/change',
  'add-to/start',
  'take-from/result',
  'take-from/change',
  'take-from/start',
  'put-together/total',
  'put-together/addend',
  'put-together/both',
  'compare/difference-more',
  'compare/difference-fewer',
  'compare/bigger-more',
  'compare/bigger-fewer',
  'compare/smaller-fewer',
  'compare/smaller-more',
] as const satisfies readonly SituationType[];
export type StorySituation = (typeof STORY_SITUATIONS)[number];

/** 03 §5.5 story-problem situation weights (the `situation` feature's value). */
export const SITUATION_WEIGHT: Record<StorySituation, number> = {
  'add-to/result': 0,
  'put-together/total': 0,
  'take-from/result': 0.1,
  'put-together/both': 0.2,
  'put-together/addend': 0.6,
  'add-to/change': 0.6,
  'compare/difference-more': 0.6,
  'take-from/change': 0.7,
  'compare/difference-fewer': 0.7,
  'compare/bigger-more': 0.7,
  'compare/smaller-fewer': 0.8,
  'add-to/start': 1.0,
  'take-from/start': 1.1,
  'compare/bigger-fewer': 1.2,
  'compare/smaller-more': 1.2,
};

/** Situations whose words point to the other operation (03 §5.5 `inconsistentLanguage`). */
const INCONSISTENT = new Set<StorySituation>(['compare/bigger-fewer', 'compare/smaller-more']);

export const asSituation = (v: unknown): StorySituation =>
  (STORY_SITUATIONS as readonly unknown[]).includes(v) ? (v as StorySituation) : 'add-to/result';
export const familyOf = (s: StorySituation): StoryFamily => s.split('/')[0] as StoryFamily;

export interface Story {
  situation: StorySituation;
  family: StoryFamily;
  a: number;
  b: number;
  c: number;
  op: '+' | '-';
  /** The asked number (put-together/both: the whole, which any split must make). */
  result: number;
  inconsistent: boolean;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** The story an item's params describe (see addsub.ts for the answer of each situation). */
export function story(p: ParamValues): Story {
  const situation = asSituation(p.situation);
  const a = num(p.a);
  const b = num(p.b);
  const c = situation === 'add-to/result' || situation === 'put-together/total' ? num(p.c) : 0;
  const solve = (): { op: '+' | '-'; result: number } => {
    switch (situation) {
      case 'add-to/result':
      case 'put-together/total':
        return { op: '+', result: a + b + c };
      case 'add-to/change':
      case 'add-to/start':
        return { op: '-', result: b - a };
      case 'take-from/start':
      case 'compare/bigger-more':
      case 'compare/bigger-fewer':
        return { op: '+', result: a + b };
      case 'put-together/both':
        return { op: '+', result: a };
      default:
        return { op: '-', result: a - b };
    }
  };
  return {
    situation,
    family: familyOf(situation),
    a,
    b,
    c,
    ...solve(),
    inconsistent: INCONSISTENT.has(situation),
  };
}
