// mea.massvolume (03 §5.6): compare weights with a balance, and read a scale or a measuring jug.
// Formats: number-pad, numeral-pick, compare, balance, order, shape-sort.
//
// - instrument `balance` (balance, compare), MEA.16: two island objects, `objects` copies of the
//   first against one of the second. Each object kind has a fixed weight step (1–9, WEIGHABLES), so
//   `value` and `value2` pick the objects and the heavier side follows from the params. The balance
//   tilts to show it (`which-heavier`); the compare format asks from everyday knowledge.
// - order (instrument `balance`), MEA.16: the objects `value`, `value2` and `value3` (when > 0), one
//   picture each and no numeral; the child puts them in order from heavy to light (everyday
//   knowledge, like compare). The answer is the weight steps, heaviest first. Every pair in the
//   row must be in CLEARLY_LIGHTER (MEA.16.t3: a light thing, the apple, a heavy thing).
// - shape-sort (instrument `balance`, mode sort), MEA.16: `cards` objects to sort into heavier and
//   lighter than the object `value` (named in the prompt), `hits` of them heavier. Every card is a
//   CLEARLY_LIGHTER comparison with it, so everyday knowledge settles each one.
// - instrument `scale` / `beaker` (number-pad, numeral-pick), MEA.17–18 (K02): read `value` in
//   `unit` off a gauge with a tick every `ticksEvery` and a label every second tick.

import type {
  LessonStep,
  ParamValue,
  ParamValues,
  ResponseValue,
  SortRule,
  StimulusSpec,
} from '@number-island/shared';
import { ruleMatches } from '../../check/state/sort.byRule';
import { numberOptionId, optionNumber } from '../../formats/numeral-pick';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  layoutSeed,
  numberOptions,
  type PartialOutput,
  pickVars,
  sampleAll,
  specDomain,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const INSTRUMENTS = ['balance', 'scale', 'beaker'] as const;
const UNITS = ['none', 'g', 'kg', 'L'] as const;

/**
 * Island objects by weight step (index + 1): a feather is the lightest, a pumpkin the heaviest.
 * The order matches everyday experience, so compare items can be answered without a balance.
 */
export const WEIGHABLES = [
  'feather',
  'leaf',
  'shell',
  'apple',
  'coconut',
  'melon',
  'brick',
  'rock',
  'pumpkin',
] as const;
const sprite = (weight: number): string => WEIGHABLES[weight - 1] ?? 'shell';

/**
 * The comparisons everyday knowledge settles without a balance, by weight step: each key is
 * clearly heavier than every step listed for it. The order and shape-sort pictures carry no
 * numeral, so they only ask about these pairs; neighbours on the step scale (a rock and a melon, a
 * pumpkin and a brick, a leaf and a shell) are not in it. Feather and leaf are the light things;
 * melon, brick, rock and pumpkin the heavy ones; the shell sits above the feather only, the apple
 * above both light things, the coconut above the shell.
 */
export const CLEARLY_LIGHTER: Readonly<Record<number, readonly number[]>> = {
  3: [1], // shell > feather
  4: [1, 2], // apple > feather, leaf
  5: [1, 2, 3], // coconut > feather, leaf, shell
  6: [1, 2, 3, 4], // melon
  7: [1, 2, 3, 4], // brick
  8: [1, 2, 3, 4], // rock
  9: [1, 2, 3, 4], // pumpkin
};

/** Whether everyday knowledge settles that step `light` weighs less than step `heavy`. */
export function clearlyLighter(light: number, heavy: number): boolean {
  return (CLEARLY_LIGHTER[heavy] ?? []).includes(light);
}

/** shape-sort: the weight steps clearly heavier (or lighter) than `ref`. */
function sortCandidates(ref: number, heavier: boolean): number[] {
  return WEIGHABLES.map((_, i) => i + 1).filter((w) =>
    heavier ? clearlyLighter(ref, w) : clearlyLighter(w, ref),
  );
}

/** order: the weight steps the item orders (value, value2, and value3 when > 0). */
function orderWeights(p: ParamValues): number[] {
  const v3 = asNum(p.value3);
  return [asNum(p.value), asNum(p.value2), ...(v3 > 0 ? [v3] : [])];
}

/** order: lighter ÷ heavier of the closest pair (the balance closeness, for a row of objects). */
function closestRatio(ws: number[]): number {
  const s = [...ws].sort((a, b) => a - b);
  let best = 0;
  for (let i = 1; i < s.length; i += 1)
    best = Math.max(best, (s[i - 1] as number) / (s[i] as number));
  return best;
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const ratio100 = (x: number): number => Math.round(x * 100) / 100;

/** The gauge a reading is shown on: labels every second tick, room above the value. */
export function gaugeFor(
  instrument: 'scale' | 'beaker',
  value: number,
  ticksEvery: number,
  unit: 'g' | 'kg' | 'L',
): Extract<StimulusSpec, { kind: 'gauge' }> {
  const labelsEvery = 2 * ticksEvery;
  const max = Math.max(
    5 * labelsEvery,
    labelsEvery * Math.ceil((value + ticksEvery) / labelsEvery),
  );
  return { kind: 'gauge', instrument, min: 0, max, ticksEvery, labelsEvery, value, unit };
}

export const meaMassVolume: GeneratorDef = {
  id: 'mea.massvolume',
  formats: ['number-pad', 'numeral-pick', 'compare', 'balance', 'order', 'shape-sort'],
  params: {
    instrument: {
      type: 'string',
      values: [...INSTRUMENTS],
      // Templates always set it; the default lets every format build from defaults.
      default: { kind: 'choice', values: [...INSTRUMENTS] },
      doc: 'balance (balance, compare) or scale / beaker (number-pad, numeral-pick)',
    },
    value: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 9 },
      doc: 'balance: weight step (1–9) of the first object, which picks it from WEIGHABLES; scale or beaker: the reading',
    },
    value2: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 9 },
      doc: 'balance: weight step (1–9) of the second object',
    },
    value3: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'order: weight step (1–9) of a third object; 0 orders two',
    },
    cards: {
      type: 'int',
      default: { kind: 'const', value: 4 },
      doc: 'shape-sort: objects to sort (heavier or lighter than the object `value`)',
    },
    hits: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: 'shape-sort: how many of them are heavier',
    },
    objects: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'balance: copies of the first object on its side (1–3); the other side has one object',
    },
    unit: {
      type: 'string',
      values: [...UNITS],
      default: { kind: 'choice', values: [...UNITS] },
      doc: 'none (balance); g or kg (scale); L (beaker)',
    },
    ticksEvery: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'scale or beaker: units between ticks (labels on every second tick)',
    },
  },
  derived: ['weight', 'weight2'],
  features: {
    closeness: { weight: 0.6, doc: 'balance: lighter ÷ heavier side (1 when level)' },
    equal: { weight: 0.4, doc: 'balance: both sides weigh the same' },
    conflict: { weight: 0.8, doc: 'balance: the side with more objects is the lighter one' },
    'tick.unlabeled': { weight: 0.5, doc: 'gauge: the reading is on an unlabeled tick' },
    'ticksEvery.notOne': { weight: 0.4, doc: 'gauge: ticks are not one unit apart' },
    cards: { weight: 0.1, doc: 'shape-sort format feature (03 §5.5): card count − 4' },
  },
  narration: [
    'gen.mea.massvolume.place-first',
    'gen.mea.massvolume.place-second',
    'gen.mea.massvolume.watch',
    'gen.mea.massvolume.goes-down',
    'gen.mea.massvolume.level',
    'gen.mea.massvolume.lift',
    'gen.mea.massvolume.heavier',
    'gen.mea.massvolume.find-mark',
    'gen.mea.massvolume.reads',
    'gen.mea.massvolume.order-first',
    'gen.mea.massvolume.order-then',
    'gen.mea.massvolume.sort-look',
    'gen.mea.massvolume.sort-heavier',
    'gen.mea.massvolume.sort-lighter',
  ],
  sample(spec, rng) {
    const p = sampleAll(spec, rng);
    // A drawn unit that cannot go with the drawn instrument is redrawn among those that can.
    // Templates fix both, so this only keeps default-param builds (tests) from rejecting most draws.
    const unitSpec = spec.unit;
    if (unitSpec && unitSpec.kind !== 'const') {
      const instrument = asStr(p.instrument);
      const fits =
        instrument === 'balance' ? ['none'] : instrument === 'beaker' ? ['L'] : ['g', 'kg'];
      const allowed = specDomain(unitSpec).filter((u) => fits.includes(String(u)));
      if (allowed.length > 0 && !allowed.includes(p.unit as ParamValue)) p.unit = rng.pick(allowed);
    }
    return p;
  },
  derive: (p) => ({
    weight: asNum(p.value) * asNum(p.objects, 1),
    weight2: asNum(p.value2),
  }),
  accepts(p, t) {
    const instrument = asStr(p.instrument);
    const unit = asStr(p.unit);
    const value = asNum(p.value);
    const objects = asNum(p.objects, 1);
    if (t.format === 'order' || t.format === 'shape-sort') {
      if (instrument !== 'balance' || unit !== 'none' || objects !== 1) return false;
      if (t.format === 'order') {
        // Every pair in the row is a clear comparison (so the steps are also distinct).
        const ws = orderWeights(p).sort((a, b) => a - b);
        return ws.every((w, i) => ws.slice(i + 1).every((h) => clearlyLighter(w, h)));
      }
      const cards = asNum(p.cards);
      const hits = asNum(p.hits);
      if (value < 1 || value > 9 || hits < 1 || cards - hits < 1) return false;
      return (
        sortCandidates(value, true).length >= hits &&
        sortCandidates(value, false).length >= cards - hits
      );
    }
    if (t.format === 'balance' || t.format === 'compare') {
      if (instrument !== 'balance' || unit !== 'none') return false;
      const v2 = asNum(p.value2);
      if (value < 1 || value > 9 || v2 < 1 || v2 > 9 || objects < 1 || objects > 3) return false;
      const w = value * objects;
      // Level only for two identical objects; the compare format has no balance to show it.
      if (w === v2) return t.format === 'balance' && objects === 1 && value === v2;
      return true;
    }
    const ticks = asNum(p.ticksEvery, 1);
    if (ticks < 1 || value < 0 || value % ticks !== 0) return false;
    if (instrument === 'scale') return unit === 'g' || unit === 'kg';
    if (instrument === 'beaker') return unit === 'L';
    return false;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const value = asNum(params.value);
    const vars = pickVars(t, {});
    let p: PartialOutput;
    if (t.format === 'order') {
      const ws = orderWeights(params);
      const shown = rng.fork('layout').shuffle(ws);
      const seed = layoutSeed(rng);
      p = {
        params,
        vars,
        // The order model's own closeness (gap ÷ range below 0.1) never fires on 1–9 steps; the
        // balance closeness of the nearest pair does the work, and pictures carry no magnitude.
        math: { closeness: ratio100(closestRatio(ws)), magnitude: 0 },
        widget: {
          format: 'order',
          items: shown.map((w, i) => ({
            id: `obj-${i}`,
            value: w,
            stimulus: {
              kind: 'objects',
              set: { count: 1, sprite: sprite(w), layout: 'line', layoutSeed: seed },
            },
          })),
          direction: 'desc',
        },
        answer: { kind: 'numbers', values: [...ws].sort((a, b) => b - a), ordered: true },
      };
      return finish(meaMassVolume, ctx, p);
    }
    if (t.format === 'shape-sort') {
      const cards = asNum(params.cards);
      const hits = asNum(params.hits);
      const draw = rng.fork('cards');
      const heavy = draw.shuffle(sortCandidates(value, true)).slice(0, hits);
      const light = draw.shuffle(sortCandidates(value, false)).slice(0, cards - hits);
      const shown = rng.fork('layout').shuffle([...heavy, ...light]);
      const bins: { id: string; label: string; rule: SortRule }[] = [
        { id: 'b0', label: 'word.heavier', rule: { prop: 'weight', op: '>=', value: value + 1 } },
        { id: 'b1', label: 'word.lighter', rule: { prop: 'weight', op: '<=', value: value - 1 } },
      ];
      const cardList = shown.map((w, i) => ({
        id: `c${i}`,
        props: { weight: w },
        sprite: sprite(w),
      }));
      p = {
        params,
        vars: pickVars(t, { thing: sprite(value), one: 1 }),
        math: { cards: Math.max(0, cards - 4) },
        widget: {
          format: 'shape-sort',
          cards: cardList.map((c) => ({
            id: c.id,
            card: { kind: 'object', sprite: c.sprite, props: c.props },
          })),
          bins,
          mode: 'sort',
        },
        answer: {
          kind: 'state',
          checker: 'sort.byRule',
          target: {
            cards: cardList.map((c) => ({ id: c.id, props: c.props })),
            bins: bins.map((b) => ({ id: b.id, rule: b.rule })),
          },
        },
      };
      return finish(meaMassVolume, ctx, p);
    }
    if (t.format === 'balance' || t.format === 'compare') {
      const objects = asNum(params.objects, 1);
      const value2 = asNum(params.value2);
      const w = value * objects;
      const first = { sprite: sprite(value), count: objects, weight: w };
      const second = { sprite: sprite(value2), count: 1, weight: value2 };
      const swap = rng.fork('layout').bool(0.5);
      const [left, right] = swap ? [second, first] : [first, second];
      const id =
        left.weight === right.weight ? 'same' : left.weight > right.weight ? 'left' : 'right';
      const math: Record<string, number> = {
        closeness: ratio100(Math.min(w, value2) / Math.max(w, value2)),
        conflict: objects >= 2 && w < value2 ? 1 : 0,
      };
      if (t.format === 'balance') {
        math.equal = w === value2 ? 1 : 0;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'balance',
            left: { terms: [{ object: left.sprite, count: left.count }] },
            right: { terms: [{ object: right.sprite, count: right.count }] },
            mode: 'which-heavier',
            objectWeights: { [sprite(value)]: value, [sprite(value2)]: value2 },
            showTilt: true,
          },
          answer: { kind: 'choice', id },
        };
      } else {
        const pic = (s: { sprite: string; count: number }): StimulusSpec => ({
          kind: 'objects',
          set: { count: s.count, sprite: s.sprite, layout: 'line', layoutSeed: layoutSeed(rng) },
        });
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'compare',
            left: pic(left),
            right: pic(right),
            ask: 'heavier',
            allowMatchLines: false,
          },
          answer: { kind: 'choice', id },
        };
      }
      return finish(meaMassVolume, ctx, p);
    }
    const instrument = asStr(params.instrument) as 'scale' | 'beaker';
    const unit = asStr(params.unit) as 'g' | 'kg' | 'L';
    const ticks = asNum(params.ticksEvery, 1);
    const gauge = gaugeFor(instrument, value, ticks, unit);
    const math: Record<string, number> = {
      'tick.unlabeled': value % gauge.labelsEvery !== 0 ? 1 : 0,
      'ticksEvery.notOne': ticks !== 1 ? 1 : 0,
    };
    if (t.format === 'number-pad') {
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'number-pad',
          stimulus: gauge,
          blanks: [{ id: 'n', maxDigits: String(gauge.max).length }],
          unit,
        },
        answer: { kind: 'number', value },
      };
    } else if (t.format === 'numeral-pick') {
      const opts = numberOptions(t, params, value, rng);
      math['distractors.diagnostic'] = opts.diagnostic;
      p = {
        params,
        vars,
        math,
        widget: { format: 'numeral-pick', stimulus: gauge, options: opts.options, layout: 'row' },
        answer: { kind: 'choice', id: numberOptionId(value) },
      };
    } else {
      throw new Error(`mea.massvolume cannot build ${t.format}`);
    }
    return finish(meaMassVolume, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    return { kind: 'state', value: { bins: sortPlacement(out) } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    const id = a.kind === 'choice' ? a.id : 'same';
    switch (w.format) {
      case 'order': {
        if (a.kind !== 'numbers') return [];
        const used = new Set<string>();
        // The first step only says what to think of: the worked-step hint (level 4) plays it.
        return [
          say('gen.mea.massvolume.lift', {}),
          ...a.values.map((v, slot) => {
            const item = w.items.find((x) => x.value === v && !used.has(x.id));
            const itemId = item?.id ?? 'obj-0';
            used.add(itemId);
            return say(
              slot === 0 ? 'gen.mea.massvolume.order-first' : 'gen.mea.massvolume.order-then',
              {},
              { op: 'drag', args: { id: itemId, slot } },
            );
          }),
        ];
      }
      case 'shape-sort': {
        const thing = sprite(asNum(out.params.value));
        const steps: LessonStep[] = [say('gen.mea.massvolume.sort-look', { thing, one: 1 })];
        for (const [bin, ids] of Object.entries(sortPlacement(out))) {
          for (const cardId of ids) {
            steps.push(
              say(
                bin === 'b0'
                  ? 'gen.mea.massvolume.sort-heavier'
                  : 'gen.mea.massvolume.sort-lighter',
                { thing, one: 1 },
                { op: 'drag-card', args: { id: cardId, bin } },
              ),
            );
          }
        }
        return steps;
      }
      case 'balance':
        return [
          say(
            'gen.mea.massvolume.place-first',
            {},
            { op: 'place', args: { side: 'left', term: w.left.terms[0] } },
          ),
          say(
            'gen.mea.massvolume.place-second',
            {},
            { op: 'place', args: { side: 'right', term: w.right.terms[0] } },
          ),
          say('gen.mea.massvolume.watch', {}, { op: id === 'same' ? 'level' : 'tilt' }),
          say(
            id === 'same' ? 'gen.mea.massvolume.level' : 'gen.mea.massvolume.goes-down',
            {},
            { op: 'answer', args: { id } },
          ),
        ];
      case 'compare':
        return [
          // No highlight: the worked-step hint (level 4) plays this step and must not point at the answer.
          say('gen.mea.massvolume.lift', {}),
          say('gen.mea.massvolume.heavier', {}, { op: 'answer', args: { id } }),
        ];
      case 'number-pad':
      case 'numeral-pick': {
        const n =
          a.kind === 'number' ? a.value : a.kind === 'choice' ? (optionNumber(a.id) ?? 0) : 0;
        return [
          w.format === 'number-pad'
            ? say('gen.mea.massvolume.find-mark', {}, { op: 'show-stimulus' })
            : say('gen.mea.massvolume.find-mark', {}),
          say(
            'gen.mea.massvolume.reads',
            { n },
            w.format === 'number-pad'
              ? { op: 'type', args: { blank: 'n', value: n } }
              : { op: 'tap', args: { id: numberOptionId(n) } },
          ),
        ];
      }
      default:
        return [];
    }
  },
};

/** The example placement of a sort item: each card in the bin whose rule it matches. */
function sortPlacement(out: GeneratorOutput): Record<string, string[]> {
  const a = out.answer;
  if (a.kind !== 'state') return {};
  const cards = a.target.cards as { id: string; props: Record<string, number> }[];
  const bins = a.target.bins as { id: string; rule: SortRule }[];
  const placement: Record<string, string[]> = Object.fromEntries(
    bins.map((b) => [b.id, [] as string[]]),
  );
  for (const card of cards) {
    const bin = bins.find((b) => ruleMatches(b.rule, card.props));
    if (bin) placement[bin.id]?.push(card.id);
  }
  return placement;
}
