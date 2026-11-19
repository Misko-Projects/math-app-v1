// story.addsub (03 §5.6): addition and subtraction story problems within 20 (ADD.12, ADD.20,
// ADD.21, ADD.23, ADD.25; MDA.06, MEA.04 and MON.03 later). Formats: story-problem, number-pad,
// make-set, numeral-pick.
//
// `situation` is a 03 §5.5 SituationType of the add-to, take-from, put-together or compare
// families. `a` and `b` are the two numbers the story tells, in the order it tells them, and `c` a
// third addend (add-to/result and put-together/total only; 0 = none). put-together/both tells only
// the whole `a`: `b` is ignored (the story model reads it as 0, and sampling pins it to its
// domain's least value), so nothing the child sees or the difficulty depends on it. The answer is
// `result`:
//   add-to/result a + b (+ c)        add-to/change b − a        add-to/start b − a
//   take-from/result a − b           take-from/change a − b     take-from/start a + b
//   put-together/total a + b (+ c)   put-together/addend a − b  put-together/both: any split of a
//   compare/difference-* a − b (a > b)   compare/bigger-* a + b   compare/smaller-* a − b
// `op` is the operation that solves it; bigger-fewer and smaller-more use the inconsistent word
// ("fewer" in an addition story, "more" in a subtraction one, `inconsistentLanguage`).
//
// The story's scene, nouns and verbs come from its context (contexts.ts, mirrored from
// contexts.yaml). The resident is the placeholder `@resident` (`who`), which the TaskRunner
// replaces (03 §4.6).
// - story-problem: the story lines (`lines`), a scene of the told quantities, and a number pad
//   (put-together/both: two blanks, answered `{ parts }` and checked by bond.split).
// - number-pad: the story is the template's prompt (one line, so the template fixes the situation
//   and the context), with a picture by representation: objects in coloured groups, the scene, ten-
//   frames, a bar model or a number line. `ask: equation` (ADD.23) shows `a op _ = _` for the
//   child to finish (numbers `[b, result]`).
// - make-set: act out add-to/result or take-from/result; the basket starts with `a`.
// - numeral-pick (always the equation, whatever `ask`): pick the equation that matches. The
//   options are a 2 × 2 grid x0 or x0 + 1 with y0 or y0 + 1 (one operation), and `corner` (a
//   param, drawn uniformly) says which cell the told a op b is, so the option set does not tell
//   which option is the key: for every set, each cell is the key of some draw. Every cell's
//   numbers are 1 to `maxTold` (a template whose a and b domains are 1 to maxTold can ask each),
//   and an addition grid never has x0 = y0, which would offer x + y beside its turn-around y + x
//   (the same two groups).

import type {
  ExpressionToken,
  ItemTemplate,
  LessonStep,
  ParamSpec,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import type { Rng } from '../../rng';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  inDomain,
  layoutSeed,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput, ParamDecl } from '../types';
import { STORY_CONTEXT_IDS, STORY_CONTEXTS, type StoryContext } from './contexts';
import {
  SITUATION_WEIGHT,
  STORY_SITUATIONS,
  type Story,
  type StorySituation,
  story,
} from './model';

export { STORY_SITUATIONS, story } from './model';

/** Situations with a single number answer that tell a + b or a − b (ADD.23 equations). */
const EQUATION_SITUATIONS = new Set<StorySituation>([
  'add-to/result',
  'take-from/result',
  'put-together/total',
]);
const WORKSPACES = ['none', 'counters', 'ten-frame', 'bar-model', 'number-line'] as const;
const CONTAINER: Record<string, 'basket' | 'jar'> = {
  'beach-shells': 'basket',
  'lighthouse-lanterns': 'jar',
};

const contextOf = (p: ParamValues): StoryContext | undefined =>
  STORY_CONTEXTS[asStr(p.context, 'beach-shells')];

/** The noun of a story: add-to and take-from items, or the compared / coloured item. */
function nounOf(s: Story, ctx: StoryContext): string {
  if (s.family === 'add-to') return ctx.addItem;
  if (s.family === 'take-from') return ctx.takeItem;
  return ctx.item;
}

const PARAMS: Record<string, ParamDecl> = {
  situation: {
    type: 'string',
    values: [...STORY_SITUATIONS],
    default: { kind: 'const', value: 'add-to/result' },
    doc: 'the 03 §5.5 SituationType (add-to, take-from, put-together and compare families)',
  },
  a: { type: 'int', default: { kind: 'int', min: 1, max: 9 }, doc: 'the first number told' },
  b: { type: 'int', default: { kind: 'int', min: 1, max: 9 }, doc: 'the second number told' },
  c: {
    type: 'int',
    default: { kind: 'const', value: 0 },
    doc: 'a third addend (add-to/result, put-together/total); 0 = none',
  },
  context: {
    type: 'string',
    values: [...STORY_CONTEXT_IDS],
    default: { kind: 'choice', values: [...STORY_CONTEXT_IDS] },
    doc: 'the contexts.yaml story context (scene, nouns, verbs)',
  },
  ask: {
    type: 'string',
    values: ['answer', 'equation'],
    default: { kind: 'const', value: 'answer' },
    doc: 'number-pad: answer (the asked number) or equation (finish a op _ = _); numeral-pick always picks the equation',
  },
  workspace: {
    type: 'string',
    values: [...WORKSPACES],
    default: { kind: 'const', value: 'counters' },
    doc: 'story-problem: the tool beside the story (never graded)',
  },
  corner: {
    type: 'int',
    default: { kind: 'const', value: 0 },
    doc: 'numeral-pick: the cell (0–3) of the 2 × 2 equation grid the told equation is in; a numeral-pick template draws it, { int: [0, 3] }',
  },
  maxN: {
    type: 'int',
    default: { kind: 'const', value: 20 },
    doc: 'largest number in the story',
  },
  maxTold: {
    type: 'int',
    default: { kind: 'const', value: 20 },
    doc: 'largest number the story tells (a, b, c); numeral-pick: every option number too',
  },
};

export interface GridEquation {
  x: number;
  y: number;
  op: '+' | '-';
}

/**
 * The 2 × 2 grid of equations a numeral-pick item offers, and which one is the key. The grid is
 * x0 or x0 + 1 with y0 or y0 + 1, in the order (x0, y0), (x0 + 1, y0), (x0, y0 + 1),
 * (x0 + 1, y0 + 1); `corner` (0–3) is the key's cell, so x0 = a − (corner & 1) and
 * y0 = b − (corner >> 1). The set depends on (x0, y0) only, and every cell is the key of the draw
 * that tells it with that corner. Null (the draw is rejected) when a cell is not a story the
 * template could tell (a number below 1 or past maxTold, a result under 1 or past maxN), or when
 * an addition grid has x0 = y0 and so a turn-around pair (x + y and y + x).
 */
export function equationGrid(p: ParamValues): { options: GridEquation[]; key: number } | null {
  const s = story(p);
  if (!EQUATION_SITUATIONS.has(s.situation) || s.c !== 0) return null;
  const corner = asNum(p.corner, 0);
  if (!Number.isInteger(corner) || corner < 0 || corner > 3) return null;
  const maxN = asNum(p.maxN, 20);
  const maxTold = asNum(p.maxTold, 20);
  const x0 = s.a - (corner & 1);
  const y0 = s.b - (corner >> 1);
  if (s.op === '+' && x0 === y0) return null;
  const ok = (x: number, y: number) => {
    const r = s.op === '-' ? x - y : x + y;
    // Every cell must be a story the template could key: its numbers within maxTold and maxN.
    return x >= 1 && y >= 1 && Math.max(x, y) <= Math.min(maxTold, maxN) && r >= 1 && r <= maxN;
  };
  const options: GridEquation[] = [
    { x: x0, y: y0, op: s.op },
    { x: x0 + 1, y: y0, op: s.op },
    { x: x0, y: y0 + 1, op: s.op },
    { x: x0 + 1, y: y0 + 1, op: s.op },
  ];
  if (!options.every((e) => ok(e.x, e.y))) return null;
  return { options, key: corner };
}

const eqId = (e: GridEquation): string => `eq-${e.x}-${e.op === '-' ? 'minus' : 'plus'}-${e.y}`;
const eqLabel = (e: GridEquation): string =>
  `${e.x} ${e.op === '-' ? '−' : '+'} ${e.y} = ${e.op === '-' ? e.x - e.y : e.x + e.y}`;

function valid(p: ParamValues, t: ItemTemplate): boolean {
  const s = story(p);
  const ctx = contextOf(p);
  if (!ctx?.families.includes(s.family)) return false;
  const maxN = asNum(p.maxN, 20);
  if (s.a < 1 || s.c < 0) return false;
  if (s.b < 1 && s.situation !== 'put-together/both') return false;
  if (Math.max(s.a, s.b, s.c, s.result) > maxN) return false;
  if (Math.max(s.a, s.b, s.c) > asNum(p.maxTold, 20)) return false;
  if (s.situation === 'put-together/both' ? s.result < 2 : s.result < 1) return false;
  const ask = asStr(p.ask, 'answer');
  switch (t.format) {
    case 'story-problem':
      return ask === 'answer';
    case 'number-pad':
      if (s.situation === 'put-together/both') return false;
      return ask === 'answer' || (EQUATION_SITUATIONS.has(s.situation) && s.c === 0);
    case 'make-set':
      return (s.situation === 'add-to/result' || s.situation === 'take-from/result') && s.c === 0;
    case 'numeral-pick':
      // Always the equation pick (`ask` is for the number pad).
      return equationGrid(p) !== null;
    default:
      return false;
  }
}

/**
 * Draws the params; when the told numbers come in the wrong order for the situation (a change
 * that would be negative), swaps a and b if both stay in their domains. put-together/both does not
 * tell b, so b is pinned to its domain's least value: two draws that differ only in b would be
 * the same item.
 */
function sampleStory(spec: Record<string, ParamSpec>, rng: Rng): ParamValues {
  const p = sampleAll(spec, rng);
  const s = story(p);
  if (s.situation === 'put-together/both') {
    const sb = spec.b;
    if (sb?.kind === 'int' && inDomain(sb, sb.min)) p.b = sb.min;
    return p;
  }
  const swapped = { ...p, a: p.b, b: p.a } as ParamValues;
  const sa = spec.a;
  const sb = spec.b;
  if (
    s.result < 1 &&
    sa &&
    sb &&
    inDomain(sa, s.b) &&
    inDomain(sb, s.a) &&
    story(swapped).result >= 1
  ) {
    return swapped;
  }
  return p;
}

type Line = { key: string; vars: Record<string, string | number> };

/** The story lines (story-problem `lines`), in telling order; the last one asks the question. */
export function storyLines(s: Story, context: string): Line[] {
  const ctx = STORY_CONTEXTS[context] as StoryContext;
  const who = '@resident';
  const item = nounOf(s, ctx);
  const base = { who, item, many: 2 };
  const L = (key: string, vars: Record<string, string | number> = {}): Line => ({
    key,
    vars: { ...base, ...vars },
  });
  const C = (k: string, vars: Record<string, string | number> = {}) =>
    L(`p.story.${context}.${k}`, vars);
  const cmp = { item: ctx.item, other: ctx.other };
  const { a, b, c } = s;
  switch (s.situation) {
    case 'add-to/result':
      return [
        L('p.story.has', { a }),
        C('add', { b }),
        ...(c > 0 ? [C('add', { b: c })] : []),
        L('p.story.q.now'),
      ];
    case 'add-to/change':
      return [L('p.story.has', { a }), C('add-some'), L('p.story.now-has', { n: b }), C('q-add')];
    case 'add-to/start':
      return [
        L('p.story.has-some'),
        C('add', { b: a }),
        L('p.story.now-has', { n: b }),
        L('p.story.q.start'),
      ];
    case 'take-from/result':
      return [L('p.story.has', { a }), C('take', { b }), L('p.story.q.left')];
    case 'take-from/change':
      return [L('p.story.has', { a }), C('take-some'), L('p.story.now-has', { n: b }), C('q-take')];
    case 'take-from/start':
      return [
        L('p.story.has-some'),
        C('take', { b: a }),
        L('p.story.now-has', { n: b }),
        L('p.story.q.start'),
      ];
    case 'put-together/total':
      return c > 0
        ? [L('p.story.pt.three', { a, b, c }), L('p.story.q.all')]
        : [L('p.story.pt.two', { a, b }), L('p.story.q.all')];
    case 'put-together/addend':
      return [L('p.story.pt.total', { a }), L('p.story.pt.red', { b }), L('p.story.q.white')];
    case 'put-together/both':
      return [L('p.story.pt.total', { a }), L('p.story.q.both')];
    case 'compare/difference-more':
      return [L('p.story.cmp.two', { ...cmp, a, b }), L('p.story.cmp.q-more', cmp)];
    case 'compare/difference-fewer':
      return [L('p.story.cmp.two', { ...cmp, a, b }), L('p.story.cmp.q-fewer', cmp)];
    case 'compare/bigger-more':
      return [
        L('p.story.cmp.has-other', { ...cmp, a }),
        L('p.story.cmp.more', { ...cmp, b }),
        L('p.story.cmp.q-item', cmp),
      ];
    case 'compare/bigger-fewer':
      return [
        L('p.story.cmp.has-other', { ...cmp, a }),
        L('p.story.cmp.fewer', { ...cmp, b }),
        L('p.story.cmp.q-item', cmp),
      ];
    case 'compare/smaller-fewer':
      return [
        L('p.story.has', { ...cmp, a }),
        L('p.story.cmp.fewer', { ...cmp, b }),
        L('p.story.cmp.q-other', cmp),
      ];
    case 'compare/smaller-more':
      return [
        L('p.story.has', { ...cmp, a }),
        L('p.story.cmp.more', { ...cmp, b }),
        L('p.story.cmp.q-other', cmp),
      ];
  }
}

/** Every story line key, for the generator's narration list (V16). */
const STORY_LINE_KEYS = [
  'p.story.has',
  'p.story.has-some',
  'p.story.now-has',
  'p.story.q.now',
  'p.story.q.left',
  'p.story.q.start',
  'p.story.q.all',
  'p.story.q.white',
  'p.story.q.both',
  'p.story.pt.two',
  'p.story.pt.three',
  'p.story.pt.total',
  'p.story.pt.red',
  'p.story.cmp.two',
  'p.story.cmp.has-other',
  'p.story.cmp.more',
  'p.story.cmp.fewer',
  'p.story.cmp.q-more',
  'p.story.cmp.q-fewer',
  'p.story.cmp.q-item',
  'p.story.cmp.q-other',
  ...STORY_CONTEXT_IDS.flatMap((id) =>
    ['add', 'add-some', 'take', 'take-some', 'q-add', 'q-take'].map((k) => `p.story.${id}.${k}`),
  ),
  'p.story.eq-plus',
  'p.story.eq-minus',
];

/** The scene of the told quantities (never the asked one). */
function scene(s: Story, context: string): StimulusSpec {
  const ctx = STORY_CONTEXTS[context] as StoryContext;
  const item = nounOf(s, ctx);
  const one = (sprite: string, count: number) => ({ sprite, count });
  const sprites = (() => {
    switch (s.situation) {
      case 'add-to/result':
      case 'add-to/change':
      case 'take-from/result':
      case 'take-from/change':
      case 'put-together/addend':
      case 'put-together/both':
        return [one(item, s.a)];
      case 'put-together/total':
        return [one(item, s.a), one(item, s.b), ...(s.c > 0 ? [one(item, s.c)] : [])];
      case 'compare/difference-more':
      case 'compare/difference-fewer':
        return [one(ctx.item, s.a), one(ctx.other, s.b)];
      case 'compare/bigger-more':
      case 'compare/bigger-fewer':
        return [one(ctx.other, s.a)];
      case 'compare/smaller-fewer':
      case 'compare/smaller-more':
        return [one(ctx.item, s.a)];
      default:
        return [];
    }
  })();
  return { kind: 'scene', context, sprites };
}

/** The bar model of a story, with '?' for the asked number. */
function barModel(s: Story): StimulusSpec {
  const { a, b } = s;
  switch (s.situation) {
    case 'add-to/result':
    case 'put-together/total':
      return { kind: 'bar-model', parts: s.c > 0 ? [a, b, s.c] : [a, b], whole: '?' };
    case 'add-to/change':
      return { kind: 'bar-model', parts: [a, '?'], whole: b };
    case 'add-to/start':
      return { kind: 'bar-model', parts: ['?', a], whole: b };
    case 'take-from/result':
    case 'put-together/addend':
      return { kind: 'bar-model', parts: [b, '?'], whole: a };
    case 'take-from/change':
      return { kind: 'bar-model', parts: ['?', b], whole: a };
    case 'take-from/start':
      return { kind: 'bar-model', parts: [a, b], whole: '?' };
    case 'compare/difference-more':
    case 'compare/difference-fewer':
      return { kind: 'bar-model', parts: [b, '?'], whole: a, compare: { bigger: a, smaller: b } };
    case 'compare/bigger-more':
    case 'compare/bigger-fewer':
      return { kind: 'bar-model', parts: [a, b], whole: '?', compare: { bigger: '?', smaller: a } };
    case 'compare/smaller-fewer':
    case 'compare/smaller-more':
      return { kind: 'bar-model', parts: ['?', b], whole: a, compare: { bigger: a, smaller: '?' } };
    case 'put-together/both':
      // The whole is told; both parts are the child's free split.
      return { kind: 'bar-model', parts: ['?', '?'], whole: a };
  }
}

/** Ten-frames of the told addends in turn (colours a, b, a), or of the start. */
function framesPicture(s: Story): StimulusSpec {
  const adds = s.op === '+' && (s.family === 'add-to' || s.family === 'put-together');
  const parts = adds ? [s.a, s.b, ...(s.c > 0 ? [s.c] : [])] : [s.a];
  const total = parts.reduce((x, y) => x + y, 0);
  const frames: 1 | 2 = total > 10 ? 2 : 1;
  const filled = frames === 2 ? [10, total - 10] : [total];
  const bounds = parts.map((_, i) => parts.slice(0, i + 1).reduce((x, y) => x + y, 0));
  const colorAt = (k: number): 'a' | 'b' => (bounds.findIndex((e) => k < e) % 2 === 0 ? 'a' : 'b');
  return {
    kind: 'ten-frame',
    frames,
    filled,
    colors: filled.map((n, fr) => Array.from({ length: n }, (_, i) => colorAt(fr * 10 + i))),
  };
}

/** The story's picture on a number pad, by the template's representation. */
function padPicture(t: ItemTemplate, s: Story, context: string, rng: Rng): StimulusSpec {
  const ctx = STORY_CONTEXTS[context] as StoryContext;
  switch (t.representation) {
    case 'objects': {
      const groups = s.c > 0 ? [s.a, s.b, s.c] : [s.a, s.b];
      return {
        kind: 'objects',
        set: {
          count: groups.reduce((x, y) => x + y, 0),
          sprite: nounOf(s, ctx),
          layout: 'groups',
          groups,
          layoutSeed: layoutSeed(rng),
        },
      };
    }
    case 'story':
      return scene(s, context);
    case 'ten-frame':
      return framesPicture(s);
    case 'bar-model':
      return barModel(s);
    case 'number-line':
      return {
        kind: 'number-line',
        min: 0,
        max: 20,
        ticksEvery: 1,
        labelsEvery: 5,
        marks: [{ at: s.a, label: String(s.a) }],
      };
    default:
      return { kind: 'none' };
  }
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** The thinking line of a solution: put together, take away, count up or compare (no answer). */
function thinkLine(s: Story, action?: LessonStep['action']): LessonStep {
  const { a, b, c } = s;
  switch (s.situation) {
    case 'add-to/result':
    case 'put-together/total':
      return c > 0
        ? say('gen.story.addsub.join-three', { x: a, y: b, z: c }, action)
        : say('gen.story.addsub.join', { x: a, y: b }, action);
    case 'take-from/start':
    case 'compare/bigger-more':
    case 'compare/bigger-fewer':
      return say('gen.story.addsub.join', { x: a, y: b }, action);
    case 'add-to/change':
    case 'add-to/start':
      return say('gen.story.addsub.count-up', { x: a, y: b }, action);
    case 'compare/difference-more':
    case 'compare/difference-fewer':
      return say('gen.story.addsub.match', {}, action);
    case 'put-together/both':
      return say('gen.story.addsub.split', { x: a }, action);
    default:
      return say('gen.story.addsub.take', { x: a, y: b }, action);
  }
}

export const storyAddsub: GeneratorDef = {
  id: 'story.addsub',
  formats: ['story-problem', 'number-pad', 'make-set', 'numeral-pick'],
  params: PARAMS,
  derived: ['result'],
  features: {
    size: { weight: 0.3, doc: 'max(0, largest number − 5) / 10' },
    bridge10: { weight: 0.4, doc: 'the computation crosses ten' },
    // 03 §5.5 story-problem features (K01: emitted by the generator until the format has a model).
    situation: { weight: 1.0, doc: 'story-problem: the situation weight prior (03 §5.5)' },
    inconsistentLanguage: {
      weight: 0.5,
      doc: 'story-problem: "more" in a subtraction story or "fewer" in an addition one',
    },
    'workspace.none': { weight: 0.3, doc: 'story-problem: no workspace' },
  },
  narration: [
    ...STORY_LINE_KEYS,
    'gen.story.addsub.listen',
    'gen.story.addsub.join',
    'gen.story.addsub.join-three',
    'gen.story.addsub.take',
    'gen.story.addsub.count-up',
    'gen.story.addsub.match',
    'gen.story.addsub.split',
    'gen.story.addsub.answer',
    'gen.story.addsub.both',
    'gen.story.addsub.start',
    'gen.story.addsub.put-in',
    'gen.story.addsub.take-out',
    'gen.story.addsub.look',
    'gen.story.addsub.this-one',
  ],
  sample: sampleStory,
  derive: (p) => ({ result: story(p).result }),
  accepts: valid,
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    if (!valid(params, t)) throw new RangeError('story.addsub: invalid story');
    const s = story(params);
    const context = asStr(params.context, 'beach-shells');
    const sc = STORY_CONTEXTS[context] as StoryContext;
    const item = nounOf(s, sc);
    const told = [s.a, s.b, ...(s.c > 0 ? [s.c] : [])];
    const lo = s.op === '+' ? Math.max(...told) : s.result;
    const hi = s.op === '+' ? s.result : Math.max(s.a, s.b);
    const math: Record<string, number> = {
      size: Math.max(0, Math.max(...told, s.result) - 5) / 10,
      bridge10: lo < 10 && hi > 10 ? 1 : 0,
    };
    // numeral-pick: the features describe the whole option grid, never which cell is the key, so
    // every key of one option set has the same difficulty and adaptive targeting (which picks the
    // draw nearest d*) cannot favour, say, the largest total (PR #82 review round 2).
    const grid = t.format === 'numeral-pick' ? equationGrid(params) : null;
    if (grid) {
      const res = (e: GridEquation) => (e.op === '-' ? e.x - e.y : e.x + e.y);
      math.size =
        Math.max(0, Math.max(...grid.options.map((e) => Math.max(e.x, e.y, res(e)))) - 5) / 10;
      math.bridge10 = grid.options.some((e) => {
        const l = e.op === '+' ? Math.max(e.x, e.y) : res(e);
        const h = e.op === '+' ? res(e) : Math.max(e.x, e.y);
        return l < 10 && h > 10;
      })
        ? 1
        : 0;
    }
    const vars = pickVars(t, {
      who: '@resident',
      item,
      other: sc.other,
      a: s.a,
      b: s.b,
      c: s.c,
      many: 2,
    });
    let p: PartialOutput;
    switch (t.format) {
      case 'story-problem': {
        const both = s.situation === 'put-together/both';
        const workspace = asStr(params.workspace, 'counters') as (typeof WORKSPACES)[number];
        p = {
          params,
          vars,
          math: {
            ...math,
            situation: SITUATION_WEIGHT[s.situation],
            inconsistentLanguage: s.inconsistent ? 1 : 0,
            'workspace.none': workspace === 'none' ? 1 : 0,
          },
          widget: {
            format: 'story-problem',
            context,
            scene: t.tier === 'abstract' ? { kind: 'none' } : scene(s, context),
            lines: storyLines(s, context),
            situation: s.situation,
            steps: 1,
            workspace,
            blanks: both
              ? [
                  { id: 'x', maxDigits: 2 },
                  { id: 'y', maxDigits: 2 },
                ]
              : [{ id: 'x', maxDigits: 2 }],
            showText: true,
          },
          answer: both
            ? { kind: 'state', checker: 'bond.split', target: { whole: s.result, nonZero: true } }
            : { kind: 'number', value: s.result },
          overlay: barModel(s),
        };
        break;
      }
      case 'number-pad': {
        const equation = asStr(params.ask, 'answer') === 'equation';
        const stimulus =
          t.tier === 'abstract' ? { kind: 'none' as const } : padPicture(t, s, context, rng);
        const tokens: ExpressionToken[] = [
          { t: 'num', v: s.a },
          { t: 'op', v: s.op },
          { t: 'blank', id: 'y' },
          { t: 'rel', v: '=' },
          { t: 'blank', id: 'z' },
        ];
        p = {
          params,
          vars,
          math: equation ? { ...math, situation: 0 } : math,
          widget: {
            format: 'number-pad',
            stimulus,
            ...(equation ? { expression: { tokens } } : {}),
            blanks: equation
              ? [
                  { id: 'y', maxDigits: 2 },
                  { id: 'z', maxDigits: 2 },
                ]
              : [{ id: 'x', maxDigits: 2 }],
            unit: null,
          },
          answer: equation
            ? { kind: 'numbers', values: [s.b, s.result], ordered: true }
            : { kind: 'number', value: s.result },
          overlay: barModel(s),
        };
        break;
      }
      case 'make-set': {
        const add = s.situation === 'add-to/result';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'make-set',
            target: s.result,
            mode: add ? 'add-more' : 'take-away',
            start: s.a,
            source: { sprite: item, supply: add ? s.b + 3 : 0 },
            container: CONTAINER[context] ?? 'basket',
            capacity: Math.max(s.a, s.result) > 10 ? 20 : 10,
            showRunningCount: false,
          },
          answer: { kind: 'state', checker: 'set.count', target: { count: s.result } },
          nudge: [{ op: 'count-aloud' }],
          highlight: [{ op: 'count-aloud' }],
        };
        break;
      }
      case 'numeral-pick': {
        const grid = equationGrid(params);
        if (!grid) throw new RangeError('story.addsub: no equation options');
        const key = grid.options[grid.key] as GridEquation;
        const options = rng
          .fork('layout')
          .shuffle(grid.options)
          .map((e) => ({
            id: eqId(e),
            label: eqLabel(e),
            speak: e.op === '-' ? 'p.story.eq-minus' : 'p.story.eq-plus',
            vars: { x: e.x, y: e.y, z: e.op === '-' ? e.x - e.y : e.x + e.y },
          }));
        const stimulus =
          t.representation === 'objects' || t.representation === 'story'
            ? padPicture(t, s, context, rng)
            : { kind: 'none' as const };
        p = {
          params,
          vars,
          math,
          widget: { format: 'numeral-pick', stimulus, options, layout: 'grid' },
          answer: { kind: 'choice', id: eqId(key) },
        };
        break;
      }
      default:
        throw new Error(`story.addsub cannot build ${t.format}`);
    }
    return finish(storyAddsub, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const s = story(out.params);
    if (out.widget.format === 'make-set') {
      if (out.widget.mode === 'take-away') {
        const removed = s.a - s.result;
        return { kind: 'state', value: { count: s.result, removed, parts: [s.result, removed] } };
      }
      return { kind: 'state', value: { count: s.result, removed: 0 } };
    }
    // put-together/both: any split; one red and the rest white.
    return { kind: 'state', value: { parts: [1, s.result - 1] } };
  },
  solution(out): LessonStep[] {
    const s = story(out.params);
    const w = out.widget;
    const answer = say(
      'gen.story.addsub.answer',
      { n: s.result },
      { op: 'answer', args: { value: s.result } },
    );
    switch (w.format) {
      case 'story-problem': {
        const sprite = w.scene.kind === 'scene' ? w.scene.sprites[0]?.sprite : undefined;
        const first: LessonStep = say(
          'gen.story.addsub.listen',
          {},
          { op: 'highlight-line', args: { index: w.lines.length - 1 } },
        );
        const act: LessonStep['action'] =
          sprite !== undefined
            ? { op: 'act-out', args: { sprite, count: s.a } }
            : { op: 'show-scene' };
        if (s.situation === 'put-together/both') {
          const x = Math.ceil(s.result / 2);
          return [
            first,
            thinkLine(s, act),
            say(
              'gen.story.addsub.both',
              { x, y: s.result - x },
              { op: 'answer', args: { values: [x, s.result - x] } },
            ),
          ];
        }
        return [first, thinkLine(s, act), answer];
      }
      case 'number-pad': {
        const look: LessonStep['action'] =
          w.stimulus.kind !== 'none'
            ? { op: 'show-stimulus' }
            : { op: 'highlight', args: { token: w.blanks[0]?.id ?? 'x' } };
        if (out.answer.kind === 'numbers') {
          return [
            say('gen.story.addsub.start', { x: s.a }, look),
            say(
              s.op === '-' ? 'p.story.eq-minus' : 'p.story.eq-plus',
              { x: s.a, y: s.b, z: s.result },
              { op: 'answer', args: { values: [s.b, s.result] } },
            ),
          ];
        }
        return [
          thinkLine(s, look),
          say(
            'gen.story.addsub.answer',
            { n: s.result },
            { op: 'type', args: { blank: 'x', value: s.result } },
          ),
        ];
      }
      case 'make-set': {
        const takeAway = w.mode === 'take-away';
        return [
          say('gen.story.addsub.start', { x: s.a }, { op: 'count-aloud' }),
          takeAway
            ? say(
                'gen.story.addsub.take-out',
                { y: s.b, n: s.result },
                { op: 'remove', args: { count: s.b } },
              )
            : say(
                'gen.story.addsub.put-in',
                { y: s.b, n: s.result },
                { op: 'drag', args: { count: s.b } },
              ),
        ];
      }
      case 'numeral-pick': {
        const id = out.answer.kind === 'choice' ? out.answer.id : '';
        // The first step points at nothing: the worked-step hint plays it (03 §5.8).
        return [
          say('gen.story.addsub.look', {}),
          say('gen.story.addsub.this-one', {}, { op: 'tap', args: { id } }),
        ];
      }
      default:
        return [];
    }
  },
};
