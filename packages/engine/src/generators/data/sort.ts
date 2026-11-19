// data.sort (03 §5.6): sort things into groups by one attribute, count each group and order the
// groups (DAT.01, DAT.10). Formats: shape-sort, number-pad, bar-graph-read, order.
//
// The groups have `a`, `b` and (with `bins: 3`) `c` members; group a is the one a question asks
// about. Which kinds, colours or shapes the groups are, and where each card lies, is layout: it
// never changes a feature.
// - shape-sort (mode sort): `cardSet: objects` sorts island objects by kind (props `{ kind }`, bins
//   labelled `noun.<kind>.many`); `cardSet: shapes` sorts ShapeCards by `attribute` colour
//   (`word.red|blue|yellow`), shape (`shape.<kind>.many`) or size (`word.big|small`, scale 1.5 or
//   0.6). Card ids c0, c1, … in display order; bins b0, b1, b2. Response `{ bins }` (sort.byRule).
// - number-pad: an objects picture with `a` of one kind among `b` others (the ObjectSet
//   `distractors`); the child counts the asked kind.
// - bar-graph-read: a picture graph of the groups (one row of pictures each, categories named by
//   the kind); `ask` how-many (group a, a number), most or least (a category id; never a tie).
// - order: one picture per group (no numeral), put in order from the fewest; the values are the
//   counts, so the groups have different sizes.
// make-set cannot show a mixed set (MakeSetConfig has one source sprite), so data.sort builds none.

import type {
  LessonStep,
  ParamValues,
  ResponseValue,
  ShapeCard,
  SortRule,
} from '@number-island/shared';
import { ruleMatches } from '../../check/state/sort.byRule';
import type { Rng } from '../../rng';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  layoutSeed,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import { SHAPE_PROPS } from '../geo/shapes';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

/** Island objects the sorts use: contexts.yaml nouns (noun.<id> clips) with art-kit sprites. */
export const SORT_KINDS = ['fish', 'crab', 'shell', 'apple'] as const;
const COLORS = ['red', 'blue', 'yellow'] as const;
const SHAPES = ['circle', 'triangle', 'square'] as const;
const SIZES = ['big', 'small'] as const;
const SIZE_SCALE: Record<string, number> = { big: 1.5, small: 0.6 };

const CARD_SETS = ['objects', 'shapes'];
const ATTRIBUTES = ['kind', 'color', 'shape', 'size'];
const ASKS = ['how-many', 'most', 'least'];

/** The group sizes: a, b, and c when there are three groups. */
export function groupSizes(p: ParamValues): number[] {
  const bins = asNum(p.bins, 2);
  return [asNum(p.a), asNum(p.b), ...(bins >= 3 ? [asNum(p.c)] : [])];
}

/** Whether the asked extreme (most or least) is a single group. */
function uniqueExtreme(sizes: number[], ask: string): boolean {
  const best = ask === 'most' ? Math.max(...sizes) : Math.min(...sizes);
  return sizes.filter((x) => x === best).length === 1;
}

/** The two closest counts differ by one (or the extreme is one away from the next group). */
function closeness(sizes: number[], ask: string): number {
  if (ask === 'most' || ask === 'least') {
    const s = [...sizes].sort((x, y) => (ask === 'most' ? y - x : x - y));
    return Math.abs((s[0] as number) - (s[1] as number)) <= 1 ? 1 : 0;
  }
  const s = [...sizes].sort((x, y) => x - y);
  for (let i = 1; i < s.length; i += 1) if ((s[i] as number) - (s[i - 1] as number) <= 1) return 1;
  return 0;
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** The values each group shows for the attribute, in group order (layout). */
function groupValues(attribute: string, bins: number, rng: Rng): string[] {
  const pool: readonly string[] =
    attribute === 'color'
      ? COLORS
      : attribute === 'shape'
        ? SHAPES
        : attribute === 'size'
          ? SIZES
          : SORT_KINDS;
  return rng.fork('groups').shuffle(pool).slice(0, bins);
}

function binLabel(attribute: string, value: string): string {
  if (attribute === 'kind') return `noun.${value}.many`;
  if (attribute === 'shape') return `shape.${value}.many`;
  return `word.${value}`;
}

export const dataSort: GeneratorDef = {
  id: 'data.sort',
  formats: ['shape-sort', 'number-pad', 'bar-graph-read', 'order'],
  params: {
    cardSet: {
      type: 'string',
      values: CARD_SETS,
      default: { kind: 'const', value: 'objects' },
      doc: 'shape-sort: island objects (sorted by kind) or shape cards',
    },
    attribute: {
      type: 'string',
      values: ATTRIBUTES,
      default: { kind: 'const', value: 'kind' },
      doc: 'what the groups differ in: kind (objects), or color, shape or size (shapes; size has two groups)',
    },
    bins: { type: 'int', default: { kind: 'const', value: 2 }, doc: 'how many groups (2 or 3)' },
    a: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 5 },
      doc: 'size of group a (the one asked about)',
    },
    b: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 5 },
      doc: 'size of group b (number-pad: the other objects)',
    },
    c: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 5 },
      doc: 'size of group c; not drawn with two groups',
    },
    ask: {
      type: 'string',
      values: ASKS,
      default: { kind: 'const', value: 'how-many' },
      doc: 'bar-graph-read: how many in group a, or which group has the most or the fewest',
    },
  },
  features: {
    cards: { weight: 0.1, doc: 'shape-sort format feature (03 §5.5): card count − 4' },
    'bins.over2': { weight: 0.2, doc: 'shape-sort format feature: bins − 2' },
    'attribute.subtle': { weight: 0.3, doc: 'sorting by size rather than colour or kind' },
    'categories.over2': { weight: 0.2, doc: 'bar-graph-read format feature: categories − 2' },
    'count.over5': {
      weight: 0.4,
      doc: 'max(0, the counted group − 5) / 5 (order: the largest group)',
    },
    mix: { weight: 0.3, doc: 'number-pad: the other objects in the picture / 5' },
    closeness: {
      weight: 0.4,
      doc: 'most / least: the extreme group is one away from the next; order: two groups one apart',
    },
  },
  narration: [
    'gen.data.sort.look',
    'gen.data.sort.put',
    'gen.data.sort.find',
    'gen.data.sort.count',
    'gen.data.sort.is',
    'gen.data.sort.compare',
    'gen.data.sort.pick',
    'gen.data.sort.order-first',
    'gen.data.sort.order-then',
  ],
  sample(spec, rng) {
    const p = sampleAll(spec, rng);
    if (asNum(p.bins, 2) < 3) delete p.c;
    return p;
  },
  derive: () => ({}),
  accepts(p, t) {
    const bins = asNum(p.bins, 2);
    if (bins < 2 || bins > 3) return false;
    const sizes = groupSizes(p);
    if (sizes.some((x) => x < 1)) return false;
    const cardSet = asStr(p.cardSet);
    const attribute = asStr(p.attribute);
    if (t.format === 'shape-sort') {
      if (cardSet === 'objects' && attribute !== 'kind') return false;
      if (cardSet === 'shapes' && attribute === 'kind') return false;
      if (attribute === 'size' && bins !== 2) return false;
      return sizes.reduce((x, y) => x + y, 0) <= 10;
    }
    if (attribute !== 'kind') return false;
    if (t.format === 'number-pad') return bins === 2;
    if (t.format === 'order') return new Set(sizes).size === sizes.length;
    const ask = asStr(p.ask);
    return ask === 'how-many' || uniqueExtreme(sizes, ask);
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const bins = asNum(params.bins, 2);
    const sizes = groupSizes(params);
    const attribute = asStr(params.attribute, 'kind');
    const kinds = groupValues(attribute, bins, rng);
    const kind = kinds[0] as string;
    let p: PartialOutput;
    if (t.format === 'shape-sort') {
      const cardSet = asStr(params.cardSet, 'objects');
      const members: { group: number; value: string }[] = sizes.flatMap((n, g) =>
        Array.from({ length: n }, () => ({ group: g, value: kinds[g] as string })),
      );
      const layout = rng.fork('layout');
      const shown = layout.shuffle(members);
      const style = rng.fork('style');
      const cards = shown.map((m, i) => {
        const id = `c${i}`;
        if (cardSet === 'objects') {
          const props = { kind: m.value };
          return { id, props, card: { kind: 'object' as const, sprite: m.value, props } };
        }
        // The attribute sorted by comes from the group; the others vary but never matter.
        const shape = attribute === 'shape' ? m.value : style.pick(SHAPES);
        const color = attribute === 'color' ? m.value : style.pick(COLORS);
        const size = attribute === 'size' ? m.value : 'big';
        const card: ShapeCard = {
          id,
          shape: shape as ShapeCard['shape'],
          props: { ...SHAPE_PROPS[shape as ShapeCard['shape']] },
          rotationDeg: 0,
          scale: attribute === 'size' ? (SIZE_SCALE[size] as number) : 1,
          color,
        };
        return { id, props: { shape, color, size }, card };
      });
      const rules: { id: string; label: string; rule: SortRule }[] = kinds.map((v, g) => ({
        id: `b${g}`,
        label: binLabel(attribute, v),
        rule: { prop: attribute, op: '==', value: v },
      }));
      p = {
        params,
        vars: pickVars(t, { kind, many: 2 }),
        math: {
          cards: Math.max(0, cards.length - 4),
          'bins.over2': bins - 2,
          'attribute.subtle': attribute === 'size' ? 1 : 0,
        },
        widget: {
          format: 'shape-sort',
          cards: cards.map((c) => ({ id: c.id, card: c.card })),
          bins: rules,
          mode: 'sort',
        },
        answer: {
          kind: 'state',
          checker: 'sort.byRule',
          target: {
            cards: cards.map((c) => ({ id: c.id, props: c.props })),
            bins: rules.map((b) => ({ id: b.id, rule: b.rule })),
          },
        },
      };
      return finish(dataSort, ctx, p);
    }
    if (t.format === 'number-pad') {
      const a = sizes[0] as number;
      const b = sizes[1] as number;
      p = {
        params,
        vars: pickVars(t, { kind, many: 2 }),
        math: { 'count.over5': Math.max(0, a - 5) / 5, mix: b / 5 },
        widget: {
          format: 'number-pad',
          stimulus: {
            kind: 'objects',
            set: {
              count: a,
              sprite: kind,
              layout: 'scatter',
              distractors: { sprite: kinds[1] as string, count: b },
              layoutSeed: layoutSeed(rng),
            },
          },
          blanks: [{ id: 'n', maxDigits: 2 }],
          unit: null,
        },
        answer: { kind: 'number', value: a },
      };
      return finish(dataSort, ctx, p);
    }
    if (t.format === 'order') {
      const seed = layoutSeed(rng);
      const groups = rng
        .fork('layout')
        .shuffle(sizes.map((n, g) => ({ n, kind: kinds[g] as string })));
      p = {
        params,
        vars: pickVars(t, {}),
        // The order model's own closeness (gap ÷ range < 0.1) never fires on small groups.
        math: {
          closeness: closeness(sizes, 'order'),
          'count.over5': Math.max(0, Math.max(...sizes) - 5) / 5,
        },
        widget: {
          format: 'order',
          items: groups.map((g, i) => ({
            id: `obj-${i}`,
            value: g.n,
            stimulus: {
              kind: 'objects',
              set: { count: g.n, sprite: g.kind, layout: 'line', layoutSeed: seed },
            },
          })),
          direction: 'asc',
        },
        answer: { kind: 'numbers', values: [...sizes].sort((x, y) => x - y), ordered: true },
      };
      return finish(dataSort, ctx, p);
    }
    if (t.format === 'bar-graph-read') {
      const ask = asStr(params.ask, 'how-many');
      const categories = rng
        .fork('layout')
        .shuffle(
          kinds.map((k, g) => ({ id: k, label: `noun.${k}.many`, value: sizes[g] as number })),
        );
      const math: Record<string, number> = { 'categories.over2': bins - 2 };
      let answer: PartialOutput['answer'];
      if (ask === 'how-many') {
        math['count.over5'] = Math.max(0, (sizes[0] as number) - 5) / 5;
        answer = { kind: 'number', value: sizes[0] as number };
      } else {
        const best = ask === 'most' ? Math.max(...sizes) : Math.min(...sizes);
        math.closeness = closeness(sizes, ask);
        answer = { kind: 'choice', id: kinds[sizes.indexOf(best)] as string };
      }
      p = {
        params,
        vars: pickVars(t, { kind, many: 2, ask: ask === 'least' ? 'fewest' : 'most' }),
        math,
        widget: {
          format: 'bar-graph-read',
          chart: {
            kind: 'picture',
            orientation: 'horizontal',
            categories,
            scale: 1,
            axisMax: Math.max(5, Math.max(...sizes)),
          },
          question: {
            type: ask === 'how-many' ? 'how-many' : (ask as 'most' | 'least'),
            categories: ask === 'how-many' ? [kind] : categories.map((c) => c.id),
          },
        },
        answer,
      };
      return finish(dataSort, ctx, p);
    }
    throw new Error(`data.sort cannot build ${t.format}`);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    return { kind: 'state', value: { bins: sortPlacement(out) } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    switch (w.format) {
      case 'shape-sort': {
        const steps: LessonStep[] = [say('gen.data.sort.look', {})];
        for (const [bin, ids] of Object.entries(sortPlacement(out))) {
          for (const id of ids) {
            steps.push(say('gen.data.sort.put', {}, { op: 'drag-card', args: { id, bin } }));
          }
        }
        return steps;
      }
      case 'number-pad': {
        const n = a.kind === 'number' ? a.value : 0;
        const kind = w.stimulus.kind === 'objects' ? w.stimulus.set.sprite : 'fish';
        return [
          say('gen.data.sort.find', { kind, many: 2 }, { op: 'show-stimulus' }),
          say('gen.data.sort.is', { n }, { op: 'type', args: { blank: 'n', value: n } }),
        ];
      }
      case 'order': {
        if (a.kind !== 'numbers') return [];
        const used = new Set<string>();
        return [
          // Places nothing: the worked-step hint plays it and must not show the order.
          say('gen.data.sort.count', {}),
          ...a.values.map((v, slot) => {
            const item = w.items.find((x) => x.value === v && !used.has(x.id));
            const id = item?.id ?? 'obj-0';
            used.add(id);
            return say(
              slot === 0 ? 'gen.data.sort.order-first' : 'gen.data.sort.order-then',
              {},
              { op: 'drag', args: { id, slot } },
            );
          }),
        ];
      }
      case 'bar-graph-read': {
        if (a.kind === 'number') {
          const id = w.question.categories[0] as string;
          return [
            say('gen.data.sort.count', {}, { op: 'count-pictures', args: { id } }),
            say('gen.data.sort.is', { n: a.value }, { op: 'answer', args: { value: a.value } }),
          ];
        }
        const id = a.kind === 'choice' ? a.id : '';
        return [
          say('gen.data.sort.compare', {}),
          say('gen.data.sort.pick', {}, { op: 'answer', args: { id } }),
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
  const cards = a.target.cards as { id: string; props: Record<string, string> }[];
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
