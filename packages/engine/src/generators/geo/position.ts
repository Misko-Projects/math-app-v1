// geo.position (03 §5.6): position words (GEO.05). Formats: shape-compose (place-relative: put the
// item where the word says, checked by compose.relative) and numeral-pick (words: "The crab is
// above the crate. Where is the crate?", the inverse word).
//
// Scenes use screen coordinates, x to the right and y down, in a 100 × 60 scene. Anchor sizes are
// the engine table `ANCHOR_SIZE`, which the widget draws with (03 §5.5 shape-compose). Until the
// shape-compose format model lands, the generator emits that format's features itself.

import type { LessonStep, ResponseValue, WidgetAction } from '@number-island/shared';
import { asStr, correctFromAnswer, finish, pickVars, sampleAll } from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

export const RELATIONS = [
  'above',
  'below',
  'beside',
  'next-to',
  'in-front-of',
  'behind',
  'left-of',
  'right-of',
] as const;
export type Relation = (typeof RELATIONS)[number];

/** The word that describes the anchor from the item's side ("the crab is above the crate" ⇒ below). */
export const INVERSE: Record<Relation, Relation> = {
  above: 'below',
  below: 'above',
  beside: 'beside',
  'next-to': 'next-to',
  'in-front-of': 'behind',
  behind: 'in-front-of',
  'left-of': 'right-of',
  'right-of': 'left-of',
};

/** Words that mean the same, so they are never both options. */
const SYNONYM: Partial<Record<Relation, Relation>> = { beside: 'next-to', 'next-to': 'beside' };

/** Anchor sprites (contexts.yaml nouns, so they have clips) and their size in scene units. */
export const ANCHOR_SIZE: Record<string, [number, number]> = {
  crate: [20, 20],
  sack: [16, 20],
  pallet: [24, 8],
  jug: [12, 18],
  lantern: [10, 18],
};
const ANCHORS = Object.keys(ANCHOR_SIZE);
const ITEMS = ['crab', 'fish', 'apple', 'shell', 'kite', 'firefly', 'pebble', 'bun'];
export const SCENE = { w: 100, h: 60 };
const ANCHOR_AT: [number, number] = [46, 34];
const EXTRA_AT: [number, number] = [82, 34];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A point that satisfies the relation around `box` (compose.relative regions; the widget's demo
 * drop point).
 */
export function pointFor(
  word: Relation,
  box: Box,
): { at: [number, number]; layer?: 'front' | 'back' } {
  const gap = 6;
  switch (word) {
    case 'above':
      return { at: [box.x, box.y - box.h / 2 - gap] };
    case 'below':
      return { at: [box.x, box.y + box.h / 2 + gap] };
    case 'left-of':
      return { at: [box.x - box.w / 2 - gap, box.y] };
    case 'right-of':
    case 'beside':
    case 'next-to':
      return { at: [box.x + box.w / 2 + gap, box.y] };
    case 'in-front-of':
      return { at: [box.x, box.y], layer: 'front' };
    case 'behind':
      return { at: [box.x, box.y], layer: 'back' };
  }
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: WidgetAction,
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const geoPosition: GeneratorDef = {
  id: 'geo.position',
  formats: ['shape-compose', 'numeral-pick'],
  params: {
    relation: {
      type: 'string',
      values: [...RELATIONS],
      default: {
        kind: 'choice',
        values: ['above', 'below', 'beside', 'next-to', 'in-front-of', 'behind'],
      },
      doc: 'the position word',
    },
    anchor: {
      type: 'string',
      values: ANCHORS,
      default: { kind: 'const', value: 'crate' },
      doc: 'the scene object the word is about (a contexts.yaml noun)',
    },
    item: {
      type: 'string',
      values: ITEMS,
      default: { kind: 'const', value: 'crab' },
      doc: 'the object to place (a contexts.yaml noun)',
    },
    scene: {
      type: 'string',
      values: ['one', 'two'],
      default: { kind: 'const', value: 'one' },
      doc: 'shape-compose: one anchor, or two (a second object the word is not about)',
    },
    options: {
      type: 'int',
      default: { kind: 'const', value: 3 },
      doc: 'numeral-pick: word options (3–4)',
    },
  },
  features: {
    'relation.leftRight': {
      weight: 0.6,
      doc: 'shape-compose format feature (03 §5.5): left of or right of',
    },
    'relation.frontBehind': {
      weight: 0.4,
      doc: 'shape-compose format feature: in front of or behind',
    },
    'scene.two': { weight: 0.3, doc: 'a second object the word is not about' },
  },
  narration: [
    'gen.geo.position.region',
    'gen.geo.position.place',
    'gen.geo.position.picture',
    'gen.geo.position.answer',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    if (t.format === 'numeral-pick') {
      const n = Number(p.options);
      return n >= 3 && n <= 4;
    }
    return p.anchor !== undefined;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const word = asStr(params.relation, 'above') as Relation;
    const anchor = asStr(params.anchor, 'crate');
    const item = asStr(params.item, 'crab');
    const [w, h] = ANCHOR_SIZE[anchor] ?? [20, 20];
    const math = {
      'relation.leftRight': word === 'left-of' || word === 'right-of' ? 1 : 0,
      'relation.frontBehind': word === 'in-front-of' || word === 'behind' ? 1 : 0,
      'scene.two': 0,
    };
    const answerWord = INVERSE[word];
    const pool = { item, anchor, one: 1, rel: word, ans: answerWord };
    if (t.format === 'shape-compose') {
      const two = params.scene === 'two';
      const other = rng.fork('scene').pick(ANCHORS.filter((a) => a !== anchor));
      const anchors = [{ id: 'a0', sprite: anchor, at: ANCHOR_AT }];
      if (two) anchors.push({ id: 'a1', sprite: other, at: EXTRA_AT });
      math['scene.two'] = two ? 1 : 0;
      return finish(geoPosition, ctx, {
        params,
        vars: pickVars(t, pool),
        widget: {
          format: 'shape-compose',
          mode: 'place-relative',
          showOutlineLines: false,
          scene: { anchors },
          relation: { word, anchor: 'a0', item },
          rotationStep: 90,
        },
        answer: {
          kind: 'state',
          checker: 'compose.relative',
          target: { word, box: { x: ANCHOR_AT[0], y: ANCHOR_AT[1], w, h }, scene: { ...SCENE } },
        },
        math,
        nudge: [{ op: 'highlight-region', args: { relation: word } }],
        highlight: [{ op: 'highlight-region', args: { relation: word } }],
      });
    }
    if (t.format === 'numeral-pick') {
      const n = Number(params.options);
      const banned = new Set<Relation>([
        answerWord,
        ...(SYNONYM[answerWord] ? [SYNONYM[answerWord] as Relation] : []),
      ]);
      const layout = rng.fork('layout');
      // The word the child just heard is the first distractor (repeating it is the common slip).
      const distractors: Relation[] = word !== answerWord ? [word] : [];
      const rest = layout.shuffle(
        RELATIONS.filter(
          (r) =>
            !banned.has(r) &&
            r !== word &&
            !(SYNONYM[r] && distractors.includes(SYNONYM[r] as Relation)),
        ),
      );
      for (const r of rest) {
        if (distractors.length >= n - 1) break;
        if (SYNONYM[r] && distractors.includes(SYNONYM[r] as Relation)) continue;
        distractors.push(r);
      }
      const options = layout
        .shuffle([answerWord, ...distractors])
        .map((r) => ({ id: r, speak: `word.${r}` }));
      return finish(geoPosition, ctx, {
        params,
        vars: pickVars(t, pool),
        widget: { format: 'numeral-pick', stimulus: { kind: 'none' }, options, layout: 'row' },
        answer: { kind: 'choice', id: answerWord },
        math,
      });
    }
    throw new Error(`geo.position cannot build ${t.format}`);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    const p = pointFor(a.target.word as Relation, a.target.box as Box);
    return { kind: 'state', value: { at: p.at, layer: p.layer ?? 'front' } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    const item = asStr(out.params.item, 'crab');
    const anchor = asStr(out.params.anchor, 'crate');
    const word = asStr(out.params.relation, 'above') as Relation;
    const vars = { item, anchor, one: 1, rel: word, ans: INVERSE[word] };
    if (w.format === 'shape-compose' && a.kind === 'state') {
      const p = pointFor(word, a.target.box as Box);
      return [
        say('gen.geo.position.region', vars, { op: 'highlight-region', args: { relation: word } }),
        say('gen.geo.position.place', vars, {
          op: 'drag-piece',
          args: { id: item, to: p.at, rot: 0, layer: p.layer ?? 'front' },
        }),
      ];
    }
    if (w.format === 'numeral-pick' && a.kind === 'choice') {
      return [
        say('gen.geo.position.picture', vars, { op: 'highlight', args: { id: a.id } }),
        say('gen.geo.position.answer', vars, { op: 'tap', args: { id: a.id } }),
      ];
    }
    return [];
  },
};
