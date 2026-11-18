// geo.identify (03 §5.6): name, find, sort and compare shapes, solids and real objects by an
// attribute. Formats: shape-sort, numeral-pick, compare, number-pad.
//
// `set` picks the card universe (flat K shapes or the pattern blocks with the `pattern-blocks`
// representation, flat and solid mixed, polygons, quadrilaterals, solids — real objects shaped like
// solids with the `objects` representation — or MEA.15's measurable objects). `rule` says what the
// item is about: the shape's `kind`, a yes/no class (`flat-solid`, `curved`, `equal-sides`, and
// MEA.15's `heavy`, `long`, `holds`), or a count (`sides`, `corners`, `faces`). `equal-sides` (all
// sides the same length or not, GEO.08) only takes a set whose polygons all have the same number of
// sides (quads), so the side count never tells the two bins apart. `has` chooses the side of a class (solid,
// heavy, long, holds more when true). Until the U03–U05 format models land, the generator emits the
// shape-sort and compare format features itself, under their 03 §5.5 names and weights.

import type {
  AnswerSpec,
  ItemTemplate,
  LessonStep,
  ParamValues,
  ResponseValue,
  ShapeCard,
  ShapeKind,
  ShapeSortConfig,
  SortRule,
  StimulusSpec,
  WidgetAction,
} from '@number-island/shared';
import { SHAPE_KINDS } from '@number-island/shared';
import { ruleMatches } from '../../check/state/sort.byRule';
import type { Rng } from '../../rng';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import {
  type CardStyle,
  cardProps,
  distinctKinds,
  K_FLAT,
  K_SOLIDS,
  MEASURE_OBJECTS,
  type MeasureObject,
  measureObject,
  NEAR_MISS,
  OBJECT_IDS,
  objectProps,
  objectStimulus,
  PATTERN_BLOCKS,
  POLYGONS,
  QUADS,
  SHAPE_PROPS,
  SOLID_OBJECTS,
  shapeCard,
  shapeStimulus,
} from './shapes';

const SETS = ['2d', '3d', 'polygons', 'quads', 'solids', 'attributes'] as const;
const RULES = [
  'kind',
  'flat-solid',
  'curved',
  'equal-sides',
  'sides',
  'corners',
  'faces',
  'heavy',
  'long',
  'holds',
] as const;
type Rule = (typeof RULES)[number];
const MODES = ['find-all', 'sort', 'odd-one-out'] as const;
const ATTRIBUTES: readonly string[] = ['heavy', 'long', 'holds'];
const COUNT_RULES: readonly string[] = ['sides', 'corners', 'faces'];
const CLASS_RULES: readonly string[] = [
  'flat-solid',
  'curved',
  'equal-sides',
  'heavy',
  'long',
  'holds',
];

/** Bin label keys for count bins (`gen.geo.identify.bin.<rule>-<n>`). */
const COUNT_BIN_VALUES = [3, 4, 5, 6];

// ---------- the card universe ----------

interface Entry {
  /** The shape-sort card (also used for numeral-pick options and compare sides). */
  card: ShapeSortConfig['cards'][number]['card'];
  /** Flat props a SortRule reads. */
  props: Record<string, string | number | boolean>;
  /** A category id (shape kind or object class) for the `categories` feature. */
  category: string;
  solid: boolean;
  nearMiss: boolean;
}

function kindPool(set: string, rep: string | undefined): ShapeKind[] {
  switch (set) {
    case '2d':
      return rep === 'pattern-blocks' ? PATTERN_BLOCKS : K_FLAT;
    case '3d':
      return ['circle', 'triangle', 'square', 'rectangle', ...K_SOLIDS];
    case 'polygons':
      return POLYGONS;
    case 'quads':
      return QUADS;
    case 'solids':
      return rep === 'objects' ? K_SOLIDS.filter((k) => SOLID_OBJECTS[k]) : K_SOLIDS;
    default:
      return [];
  }
}

interface Ctx {
  set: string;
  rep: string | undefined;
  style: CardStyle;
  rng: Rng;
  /** Real objects instead of solid shape cards (`solids` set, `objects` representation). */
  objects: boolean;
}

function shapeEntry(c: Ctx, kind: ShapeKind, nearMiss = false): Entry {
  if (c.objects && SHAPE_PROPS[kind].solid) {
    const sprite = c.rng.pick(SOLID_OBJECTS[kind] ?? ['block']);
    const props = { shape: kind, solid: true, curved: SHAPE_PROPS[kind].curved };
    return {
      card: { kind: 'object', sprite, props },
      props,
      category: kind,
      solid: true,
      nearMiss,
    };
  }
  const card = shapeCard('', kind, c.style, c.rng);
  return { card, props: cardProps(card), category: kind, solid: card.props.solid, nearMiss };
}

function objectEntry(o: MeasureObject): Entry {
  const props = objectProps(o);
  return {
    card: { kind: 'object', sprite: o.sprite, props },
    props,
    category: o.sprite,
    solid: false,
    nearMiss: false,
  };
}

/** The yes/no class a card is in for a class rule; undefined when it does not apply. */
function classOf(
  rule: Rule,
  props: Record<string, string | number | boolean>,
): boolean | undefined {
  switch (rule) {
    case 'flat-solid':
      return props.solid === true;
    case 'curved':
      return props.curved === true;
    case 'equal-sides':
      // Closed flat polygons only: a circle has no sides to compare, a solid's edges are not sides.
      return typeof props.sides === 'number' &&
        props.sides > 0 &&
        props.closed === true &&
        props.solid !== true
        ? props.equalSides === true
        : undefined;
    case 'heavy':
      return props.weight === undefined ? undefined : props.weight === 'heavy';
    case 'long':
      return props.length === undefined ? undefined : props.length === 'long';
    case 'holds':
      return props.holds === undefined ? undefined : props.holds === 'more';
    default:
      return undefined;
  }
}

/** The SortRule for one side of a class rule. */
function classRule(rule: Rule, yes: boolean): SortRule {
  switch (rule) {
    case 'flat-solid':
      return { prop: 'solid', op: '==', value: yes };
    case 'curved':
      return { prop: 'curved', op: '==', value: yes };
    case 'equal-sides':
      return { prop: 'equalSides', op: '==', value: yes };
    case 'heavy':
      return { prop: 'weight', op: '==', value: yes ? 'heavy' : 'light' };
    case 'long':
      return { prop: 'length', op: '==', value: yes ? 'long' : 'short' };
    default:
      return { prop: 'holds', op: '==', value: yes ? 'more' : 'less' };
  }
}

/** Bin label (a NarrationKey) for one side of a class rule. */
function classLabel(rule: Rule, yes: boolean): string {
  switch (rule) {
    case 'flat-solid':
      return yes ? 'word.solid' : 'word.flat';
    case 'curved':
      return yes ? 'gen.geo.identify.bin.rolls' : 'gen.geo.identify.bin.no-roll';
    case 'equal-sides':
      return yes ? 'gen.geo.identify.bin.equal-sides' : 'gen.geo.identify.bin.unequal-sides';
    case 'heavy':
      return yes ? 'word.heavy' : 'word.light';
    case 'long':
      return yes ? 'word.long' : 'word.short';
    default:
      return yes ? 'word.holds-more' : 'word.holds-less';
  }
}

/** The word a prompt names for one side of a class rule (`{w|word}` / `{attr|word}`). */
function classWord(rule: Rule, yes: boolean): string | undefined {
  switch (rule) {
    case 'flat-solid':
      return yes ? 'solid' : 'flat';
    case 'heavy':
      return yes ? 'heavy' : 'light';
    case 'long':
      return yes ? 'long' : 'short';
    case 'holds':
      return yes ? 'holds-more' : 'holds-less';
    default:
      return undefined;
  }
}

/** Entries of one class for a class rule (shape kinds of the set, or measurable objects). */
function classCandidates(c: Ctx, rule: Rule, yes: boolean): (() => Entry)[] {
  if (ATTRIBUTES.includes(rule)) {
    return MEASURE_OBJECTS.filter((o) => classOf(rule, objectProps(o)) === yes).map(
      (o) => () => objectEntry(o),
    );
  }
  return kindPool(c.set, c.rep)
    .filter((k) => classOf(rule, { ...SHAPE_PROPS[k] }) === yes)
    .map((k) => () => shapeEntry(c, k));
}

/** `n` entries drawn without repeating a candidate until all are used. */
function drawEntries(rng: Rng, candidates: (() => Entry)[], n: number): Entry[] {
  const out: Entry[] = [];
  let bag: (() => Entry)[] = [];
  for (let i = 0; i < n; i += 1) {
    if (bag.length === 0) bag = rng.shuffle(candidates);
    const make = bag.pop();
    if (make) out.push(make());
  }
  return out;
}

/** Non-examples of `kind` from the pool (never a family member), the near miss first. */
function nonExamples(
  c: Ctx,
  kind: ShapeKind,
  n: number,
  nearMiss: boolean,
  distinct: boolean,
): Entry[] {
  const out: Entry[] = [];
  const miss = NEAR_MISS[kind];
  if (nearMiss && miss && n > 0) out.push(shapeEntry(c, miss, true));
  const others = kindPool(c.set, c.rep).filter((k) => distinctKinds(kind, k) && k !== miss);
  const kinds = distinct ? c.rng.shuffle(others).slice(0, n - out.length) : [];
  if (distinct) for (const k of kinds) out.push(shapeEntry(c, k));
  else for (let i = out.length; i < n; i += 1) out.push(shapeEntry(c, c.rng.pick(others)));
  return out;
}

function distractorCount(
  set: string,
  rep: string | undefined,
  kind: ShapeKind,
  nearMiss: boolean,
): number {
  const miss = NEAR_MISS[kind];
  const others = kindPool(set, rep).filter((k) => distinctKinds(kind, k) && k !== miss);
  return others.length + (nearMiss && miss ? 1 : 0);
}

const isShapeCard = (card: Entry['card']): card is ShapeCard => !('kind' in card);

/** Card ids `c0`, `c1`, … in display order (after the layout shuffle). */
function withIds(entries: Entry[]): { id: string; e: Entry }[] {
  return entries.map((e, i) => {
    const id = `c${i}`;
    if (isShapeCard(e.card)) e.card.id = id;
    return { id, e };
  });
}

function stimulusOf(e: Entry, seed: number): StimulusSpec {
  if (isShapeCard(e.card)) return shapeStimulus([e.card]);
  return objectStimulus(e.card.kind === 'object' ? e.card.sprite : 'block', seed);
}

// ---------- params ----------

const asRule = (p: ParamValues): Rule => asStr(p.rule, 'kind') as Rule;
const asKind = (v: ParamValues[string] | undefined, fallback: ShapeKind): ShapeKind =>
  (SHAPE_KINDS as readonly string[]).includes(String(v)) ? (v as ShapeKind) : fallback;

/** The count a rule reads on number-pad and compare items (`kind` defaults to sides / corners). */
function countRule(rule: Rule, format: string): 'sides' | 'corners' | 'faces' {
  if (COUNT_RULES.includes(rule)) return rule as 'sides' | 'corners' | 'faces';
  return format === 'compare' ? 'corners' : 'sides';
}

function countOf(kind: ShapeKind, rule: 'sides' | 'corners' | 'faces'): number {
  return SHAPE_PROPS[kind][rule] ?? 0;
}

function accepts(p: ParamValues, t: ItemTemplate): boolean {
  const set = asStr(p.set, '2d');
  const rule = asRule(p);
  const mode = asStr(p.mode, 'find-all');
  const rep = t.representation;
  const kind = asKind(p.kind, 'triangle');
  const other = asKind(p.other, 'square');
  const cards = asNum(p.cards, 5);
  const hits = asNum(p.hits, 2);
  const nearMiss = p.nearMiss === true;
  const pool = kindPool(set, rep);
  const attr = ATTRIBUTES.includes(rule);
  if (attr !== (set === 'attributes')) return false;
  const inPool = (k: ShapeKind) => pool.includes(k);
  if (rule === 'equal-sides') {
    // Every polygon the item can show has the same number of sides, and both bins have cards.
    const polys = pool.filter((k) => classOf(rule, { ...SHAPE_PROPS[k] }) !== undefined);
    if (new Set(polys.map((k) => SHAPE_PROPS[k].sides)).size !== 1) return false;
    const yes = polys.filter((k) => SHAPE_PROPS[k].equalSides);
    if (yes.length === 0 || yes.length === polys.length) return false;
    if (t.format === 'compare') return false;
  }

  if (t.format === 'compare') {
    if (attr) {
      if (rule === 'holds') return false;
      const a = measureObject(asStr(p.thing));
      const b = measureObject(asStr(p.thing2));
      if (!a || !b) return false;
      const ca = classOf(rule, objectProps(a));
      const cb = classOf(rule, objectProps(b));
      return ca !== undefined && cb !== undefined && ca !== cb;
    }
    const r = countRule(rule, 'compare');
    return (
      inPool(kind) &&
      inPool(other) &&
      r !== 'faces' &&
      !SHAPE_PROPS[kind].solid &&
      !SHAPE_PROPS[other].solid
    );
  }
  if (t.format === 'number-pad') return !attr && inPool(kind) && !CLASS_RULES.includes(rule);

  if (t.format === 'numeral-pick') {
    if (cards < 3 || cards > 5) return false;
    if (rule === 'kind')
      return inPool(kind) && distractorCount(set, rep, kind, nearMiss) >= cards - 1;
    if (CLASS_RULES.includes(rule)) {
      const ctx = { set, rep } as Ctx;
      return (
        classCandidates(ctx, rule, p.has !== false).length > 0 &&
        classCandidates(ctx, rule, p.has === false).length > 0
      );
    }
    return false;
  }

  // shape-sort
  if (mode === 'odd-one-out') {
    if (cards < 3 || cards > 5) return false;
    if (rule === 'kind') return inPool(kind) && inPool(other) && distinctKinds(kind, other);
    return CLASS_RULES.includes(rule);
  }
  if (mode === 'find-all') {
    if (hits < 1 || cards - hits < 2) return false;
    if (rule === 'kind') return inPool(kind);
    if (COUNT_RULES.includes(rule)) return inPool(kind) && countOf(kind, rule as 'sides') > 0;
    return CLASS_RULES.includes(rule);
  }
  // sort
  const bins = asNum(p.bins, 2);
  if (cards < bins + (nearMiss ? 1 : 0) || bins < 2 || bins > 3) return false;
  if (rule === 'kind') {
    return (
      inPool(kind) &&
      inPool(other) &&
      distinctKinds(kind, other) &&
      pool.length >= bins + (nearMiss ? 1 : 0)
    );
  }
  if (COUNT_RULES.includes(rule)) {
    if (bins !== 2 || rule === 'faces') return false;
    const a = countOf(kind, rule as 'sides');
    const b = countOf(other, rule as 'sides');
    return (
      inPool(kind) &&
      inPool(other) &&
      a !== b &&
      COUNT_BIN_VALUES.includes(a) &&
      COUNT_BIN_VALUES.includes(b)
    );
  }
  return (
    bins === 2 && CLASS_RULES.includes(rule) && hits >= 1 && cards - hits >= 1 + (nearMiss ? 1 : 0)
  );
}

// ---------- build ----------

interface Built {
  widget: PartialOutput['widget'];
  answer: AnswerSpec;
  entries: { id: string; e: Entry }[];
  vars: Record<string, string | number>;
  math: Record<string, number>;
  highlight?: WidgetAction[];
  overlay?: StimulusSpec;
}

function features(
  entries: Entry[],
  extra: Record<string, number>,
  nonPrototypical: boolean,
): Record<string, number> {
  const cats = new Set(entries.map((e) => e.category));
  return {
    solids: entries.some((e) => e.solid) ? 1 : 0,
    categories: Math.max(0, cats.size - 2),
    nonPrototypical: nonPrototypical ? 1 : 0,
    nearMiss: entries.some((e) => e.nearMiss) ? 1 : 0,
    ...extra,
  };
}

function buildSort(c: Ctx, p: ParamValues, rule: Rule, mode: string): Built {
  const kind = asKind(p.kind, 'triangle');
  const other = asKind(p.other, 'square');
  const cards = asNum(p.cards, 5);
  const hits = asNum(p.hits, 2);
  const has = p.has !== false;
  const nearMiss = p.nearMiss === true;
  const layout = c.rng.fork('layout');
  const vars: Record<string, string | number> = { kind, other, one: 1, many: 2 };
  const word = classWord(rule, has);
  if (word) {
    vars.w = word;
    vars.attr = word;
  }

  if (mode === 'odd-one-out') {
    let same: Entry[];
    let odd: Entry;
    if (rule === 'kind') {
      same = Array.from({ length: cards - 1 }, () => shapeEntry(c, kind));
      odd = shapeEntry(c, other);
    } else {
      same = drawEntries(c.rng, classCandidates(c, rule, !has), cards - 1);
      odd = drawEntries(c.rng, classCandidates(c, rule, has), 1)[0] as Entry;
    }
    const entries = withIds(layout.shuffle([...same, odd]));
    const oddId = entries.find((x) => x.e === odd)?.id ?? 'c0';
    return {
      widget: {
        format: 'shape-sort',
        cards: entries.map(({ id, e }) => ({ id, card: e.card })),
        bins: null,
        mode: 'odd-one-out',
      },
      answer: { kind: 'choice', id: oddId },
      entries,
      vars,
      math: features(
        entries.map((x) => x.e),
        { cards: Math.max(0, cards - 4) },
        p.nonPrototypical === true,
      ),
    };
  }

  if (mode === 'find-all') {
    let matches: Entry[];
    let rest: Entry[];
    if (rule === 'kind') {
      matches = Array.from({ length: hits }, () => shapeEntry(c, kind));
      rest = nonExamples(c, kind, cards - hits, nearMiss, false);
    } else if (COUNT_RULES.includes(rule)) {
      const n = countOf(kind, rule as 'sides');
      vars.n = n;
      const pool = kindPool(c.set, c.rep);
      const yes = pool.filter((k) => countOf(k, rule as 'sides') === n);
      const no = pool.filter((k) => countOf(k, rule as 'sides') !== n);
      matches = Array.from({ length: hits }, () => shapeEntry(c, c.rng.pick(yes)));
      rest = nonExamples(c, kind, 0, false, false);
      const miss = NEAR_MISS[kind];
      if (nearMiss && miss && countOf(miss, rule as 'sides') !== n)
        rest.push(shapeEntry(c, miss, true));
      while (rest.length < cards - hits) rest.push(shapeEntry(c, c.rng.pick(no)));
    } else {
      matches = drawEntries(c.rng, classCandidates(c, rule, has), hits);
      rest = drawEntries(c.rng, classCandidates(c, rule, !has), cards - hits);
    }
    const entries = withIds(layout.shuffle([...matches, ...rest]));
    const ids = entries.filter((x) => matches.includes(x.e)).map((x) => x.id);
    return {
      widget: {
        format: 'shape-sort',
        cards: entries.map(({ id, e }) => ({ id, card: e.card })),
        bins: null,
        mode: 'find-all',
      },
      answer: { kind: 'state', checker: 'select.exactSet', target: { ids } },
      entries,
      vars,
      math: features(
        entries.map((x) => x.e),
        { cards: Math.max(0, cards - 4) },
        p.nonPrototypical === true,
      ),
      highlight: ids[0]
        ? [
            {
              op: 'highlight-attribute',
              args: {
                id: ids[0],
                prop: rule === 'kind' ? 'sides' : rule === 'equal-sides' ? 'equalSides' : rule,
              },
            },
          ]
        : [],
    };
  }

  // sort: bins, every card in a bin whose rule it satisfies, cards that fit none stay in the tray.
  const nBins = asNum(p.bins, 2);
  const bins: { id: string; label: string; rule: SortRule }[] = [];
  const binEntries: Entry[][] = [];
  let leftover: Entry[] = [];
  if (rule === 'kind') {
    const third = c.rng
      .fork('bins')
      .pick(
        kindPool(c.set, c.rep).filter((k) => distinctKinds(kind, k) && distinctKinds(other, k)),
      );
    const kinds = nBins === 3 && third ? [kind, other, third] : [kind, other];
    kinds.forEach((k, i) => {
      bins.push({
        id: `b${i}`,
        label: `shape.${k}.many`,
        rule: { prop: 'shape', op: '==', value: k },
      });
      binEntries.push([]);
    });
    const fill = cards - (nearMiss ? 1 : 0);
    for (let i = 0; i < fill; i += 1)
      binEntries[i % kinds.length]?.push(shapeEntry(c, kinds[i % kinds.length] as ShapeKind));
    if (nearMiss) {
      const miss = NEAR_MISS[kind];
      const outside = miss && kinds.every((k) => distinctKinds(k, miss)) ? miss : undefined;
      const spare = kindPool(c.set, c.rep).filter((k) => kinds.every((b) => distinctKinds(b, k)));
      const k = outside ?? c.rng.pick(spare.length > 0 ? spare : ['circle']);
      leftover = [shapeEntry(c, k as ShapeKind, true)];
    }
  } else if (COUNT_RULES.includes(rule)) {
    const r = rule as 'sides' | 'corners';
    const values = [countOf(kind, r), countOf(other, r)];
    const pool = kindPool(c.set, c.rep);
    values.forEach((v, i) => {
      bins.push({
        id: `b${i}`,
        label: `gen.geo.identify.bin.${r}-${v}`,
        rule: { prop: r, op: '==', value: v },
      });
      binEntries.push([]);
    });
    const fill = cards - (nearMiss ? 1 : 0);
    for (let i = 0; i < fill; i += 1) {
      const v = values[i % 2] as number;
      const kinds = i < 2 ? [i === 0 ? kind : other] : pool.filter((k) => countOf(k, r) === v);
      binEntries[i % 2]?.push(shapeEntry(c, c.rng.pick(kinds)));
    }
    if (nearMiss) {
      const spare = pool.filter((k) => !values.includes(countOf(k, r)));
      const miss = NEAR_MISS[kind];
      const k =
        miss && !values.includes(countOf(miss, r))
          ? miss
          : c.rng.pick(spare.length > 0 ? spare : ['circle' as ShapeKind]);
      leftover = [shapeEntry(c, k, true)];
    }
  } else {
    for (const yes of [true, false]) {
      bins.push({
        id: yes ? 'b0' : 'b1',
        label: classLabel(rule, yes),
        rule: classRule(rule, yes),
      });
    }
    if (nearMiss && ATTRIBUTES.includes(rule)) {
      // An object for which the attribute is not clear (MEA.15) fits neither bin and stays out.
      const unclear = MEASURE_OBJECTS.filter(
        (o) => classOf(rule, objectProps(o)) === undefined,
      ).map((o) => () => objectEntry(o));
      leftover = drawEntries(c.rng, unclear, 1).map((e) => ({ ...e, nearMiss: true }));
    }
    binEntries.push(drawEntries(c.rng, classCandidates(c, rule, true), hits));
    binEntries.push(
      drawEntries(c.rng, classCandidates(c, rule, false), cards - hits - leftover.length),
    );
  }
  const all = [...binEntries.flat(), ...leftover];
  const entries = withIds(layout.shuffle(all));
  const binOf = new Map<Entry, string>();
  binEntries.forEach((es, i) => {
    for (const e of es) binOf.set(e, bins[i]?.id ?? 'b0');
  });
  const placement: Record<string, string[]> = Object.fromEntries(
    bins.map((b) => [b.id, [] as string[]]),
  );
  for (const { id, e } of entries) {
    const b = binOf.get(e);
    if (b) placement[b]?.push(id);
  }
  return {
    widget: {
      format: 'shape-sort',
      cards: entries.map(({ id, e }) => ({ id, card: e.card })),
      bins,
      mode: 'sort',
    },
    answer: {
      kind: 'state',
      checker: 'sort.byRule',
      target: {
        cards: entries.map(({ id, e }) => ({ id, props: e.props })),
        bins: bins.map((b) => ({ id: b.id, rule: b.rule })),
      },
    },
    entries,
    vars,
    math: features(
      entries.map((x) => x.e),
      { cards: Math.max(0, cards - 4), 'bins.over2': Math.max(0, bins.length - 2) },
      p.nonPrototypical === true,
    ),
  };
}

function buildPick(c: Ctx, p: ParamValues, rule: Rule): Built {
  const kind = asKind(p.kind, 'triangle');
  const cards = asNum(p.cards, 3);
  const has = p.has !== false;
  const layout = c.rng.fork('layout');
  const vars: Record<string, string | number> = { kind, one: 1, many: 2 };
  let target: Entry;
  let rest: Entry[];
  if (rule === 'kind') {
    target = shapeEntry(c, kind);
    rest = nonExamples(c, kind, cards - 1, p.nearMiss === true, true);
  } else {
    const word = classWord(rule, has);
    if (word) {
      vars.w = word;
      vars.attr = word;
    }
    target = drawEntries(c.rng, classCandidates(c, rule, has), 1)[0] as Entry;
    rest = drawEntries(c.rng, classCandidates(c, rule, !has), cards - 1);
  }
  const entries = withIds(layout.shuffle([target, ...rest]));
  const seed = layout.fork('seed').int(0, 0x7fffffff);
  const answerId = entries.find((x) => x.e === target)?.id ?? 'c0';
  return {
    widget: {
      format: 'numeral-pick',
      stimulus: { kind: 'none' },
      options: entries.map(({ id, e }) => ({ id, stimulus: stimulusOf(e, seed) })),
      layout: 'row',
    },
    answer: { kind: 'choice', id: answerId },
    entries,
    vars,
    math: features(
      entries.map((x) => x.e),
      {},
      p.nonPrototypical === true,
    ),
  };
}

function buildCompare(c: Ctx, p: ParamValues, rule: Rule): Built {
  const layout = c.rng.fork('layout');
  const seed = layout.fork('seed').int(0, 0x7fffffff);
  const swap = layout.bool(0.5);
  if (ATTRIBUTES.includes(rule)) {
    const a = measureObject(asStr(p.thing)) as MeasureObject;
    const b = measureObject(asStr(p.thing2)) as MeasureObject;
    const [left, right] = swap ? [b, a] : [a, b];
    const winner = classOf(rule, objectProps(left)) ? 'left' : 'right';
    const big = winner === 'left' ? left : right;
    const small = winner === 'left' ? right : left;
    return {
      widget: {
        format: 'compare',
        left: objectStimulus(left.sprite, seed),
        right: objectStimulus(right.sprite, seed),
        ask: rule === 'heavy' ? 'heavier' : 'longer',
        allowMatchLines: false,
      },
      answer: { kind: 'choice', id: winner },
      entries: [],
      vars: { attr: rule === 'heavy' ? 'heavier' : 'longer' },
      // conflict: the winner looks smaller than the other object (03 §5.5 compare).
      math: {
        conflict: !big.big && small.big ? 1 : 0,
        unseen: rule === 'heavy' ? 1 : 0,
        equal: 0,
        closeness: 0,
      },
    };
  }
  const r = countRule(rule, 'compare');
  const k1 = asKind(p.kind, 'triangle');
  const k2 = asKind(p.other, 'square');
  const [lk, rk] = swap ? [k2, k1] : [k1, k2];
  const left = shapeEntry(c, lk);
  const right = shapeEntry(c, rk);
  if (isShapeCard(left.card)) left.card.id = 'left';
  if (isShapeCard(right.card)) right.card.id = 'right';
  const ln = countOf(lk, r);
  const rn = countOf(rk, r);
  const winner = ln === rn ? 'same' : ln > rn ? 'left' : 'right';
  const lo = Math.min(ln, rn);
  const hi = Math.max(ln, rn);
  return {
    widget: {
      format: 'compare',
      left: stimulusOf(left, seed),
      right: stimulusOf(right, seed),
      ask: 'more',
      allowMatchLines: false,
    },
    answer: { kind: 'choice', id: winner },
    entries: [
      { id: 'left', e: left },
      { id: 'right', e: right },
    ],
    vars: { w: r, ln, rn },
    math: {
      ...features([left, right], {}, p.nonPrototypical === true),
      equal: winner === 'same' ? 1 : 0,
      closeness: hi === 0 ? 1 : lo / hi,
      conflict: 0,
    },
  };
}

function buildPad(c: Ctx, p: ParamValues, rule: Rule): Built {
  const kind = asKind(p.kind, 'triangle');
  const r = countRule(rule, 'number-pad');
  const e = shapeEntry({ ...c, objects: false }, kind);
  const n = countOf(kind, r);
  return {
    widget: {
      format: 'number-pad',
      stimulus: stimulusOf(e, 0),
      blanks: [{ id: 'n', maxDigits: 2 }],
      unit: null,
    },
    answer: { kind: 'number', value: n },
    entries: [{ id: 'c0', e }],
    vars: { kind, one: 1, many: 2, w: r },
    math: features([e], {}, p.nonPrototypical === true),
  };
}

const step = (
  key: string,
  vars: Record<string, string | number> = {},
  action?: WidgetAction,
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const geoIdentify: GeneratorDef = {
  id: 'geo.identify',
  formats: ['shape-sort', 'numeral-pick', 'compare', 'number-pad'],
  params: {
    set: {
      type: 'string',
      values: [...SETS],
      default: { kind: 'const', value: '2d' },
      doc: 'card universe: 2d (K shapes; the pattern blocks with the pattern-blocks representation), 3d (flat and solid mixed), polygons, quads, solids (real objects with the objects representation), attributes (MEA.15 objects)',
    },
    rule: {
      type: 'string',
      values: [...RULES],
      default: { kind: 'const', value: 'kind' },
      doc: 'what the item is about: kind, a yes/no class (flat-solid, curved, equal-sides: quads only, heavy, long, holds) or a count (sides, corners, faces)',
    },
    mode: {
      type: 'string',
      values: [...MODES],
      default: { kind: 'const', value: 'find-all' },
      doc: 'shape-sort mode: find-all, sort (bins), odd-one-out',
    },
    kind: {
      type: 'string',
      values: [...SHAPE_KINDS],
      default: { kind: 'const', value: 'triangle' },
      doc: 'the target shape (find, name, count; the first bin or the left shape)',
    },
    other: {
      type: 'string',
      values: [...SHAPE_KINDS],
      default: { kind: 'const', value: 'square' },
      doc: 'the second shape: the second bin (sort), the odd card (odd-one-out), the other side (compare)',
    },
    has: {
      type: 'bool',
      default: { kind: 'const', value: true },
      doc: 'class rules: find or pick the cards that have the attribute (solid, curved, heavy, long, holds more) or the ones that do not',
    },
    cards: {
      type: 'int',
      default: { kind: 'const', value: 5 },
      doc: 'cards on a shape-sort item; options on a numeral-pick item (3–5)',
    },
    hits: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: 'find-all: matching cards; class sorts: cards in the yes bin',
    },
    bins: { type: 'int', default: { kind: 'const', value: 2 }, doc: 'sort: bins (2–3)' },
    nonPrototypical: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'turned and resized cards',
    },
    nearMiss: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'add a near-miss non-example (an open figure for a triangle, an oval for a circle); in a sort it fits no bin and stays in the tray',
    },
    thing: {
      type: 'string',
      values: OBJECT_IDS,
      default: { kind: 'const', value: 'rock' },
      doc: 'compare (attributes): one object',
    },
    thing2: {
      type: 'string',
      values: OBJECT_IDS,
      default: { kind: 'const', value: 'feather' },
      doc: 'compare (attributes): the other object; it must be on the other side of the rule',
    },
  },
  features: {
    solids: { weight: 0.2, doc: 'the cards include solids' },
    categories: { weight: 0.2, doc: 'distinct kinds or objects shown − 2' },
    cards: { weight: 0.1, doc: 'shape-sort format feature (03 §5.5): card count − 4' },
    nonPrototypical: { weight: 0.6, doc: 'shape-sort format feature: turned or resized shapes' },
    nearMiss: { weight: 0.6, doc: 'shape-sort format feature: a near-miss non-example is shown' },
    'bins.over2': { weight: 0.2, doc: 'shape-sort format feature: bins − 2' },
    closeness: { weight: 1.0, doc: 'compare format feature: smaller count ÷ larger count' },
    equal: { weight: 0.4, doc: 'compare format feature: the two counts are the same' },
    unseen: {
      weight: 0.4,
      doc: 'compare (attributes): weight, which a picture does not show (length does)',
    },
    conflict: {
      weight: 0.8,
      doc: 'compare format feature: the heavier or longer object looks smaller',
    },
  },
  narration: [
    'gen.geo.identify.look',
    'gen.geo.identify.is-kind',
    'gen.geo.identify.fits',
    'gen.geo.identify.goes-here',
    'gen.geo.identify.stays-out',
    'gen.geo.identify.odd',
    'gen.geo.identify.count',
    'gen.geo.identify.more',
    'gen.geo.identify.same',
    'gen.geo.identify.is-attr',
    'gen.geo.identify.type',
    'gen.geo.identify.bin.rolls',
    'gen.geo.identify.bin.no-roll',
    'gen.geo.identify.bin.equal-sides',
    'gen.geo.identify.bin.unequal-sides',
    ...COUNT_BIN_VALUES.flatMap((n) => [
      `gen.geo.identify.bin.sides-${n}`,
      `gen.geo.identify.bin.corners-${n}`,
    ]),
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts,
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const set = asStr(params.set, '2d');
    const rule = asRule(params);
    const rep = t.representation;
    const c: Ctx = {
      set,
      rep,
      rng: rng.fork('cards'),
      objects: set === 'solids' && rep === 'objects',
      style: { blocks: rep === 'pattern-blocks', nonPrototypical: params.nonPrototypical === true },
    };
    let b: Built;
    switch (t.format) {
      case 'shape-sort':
        b = buildSort(c, params, rule, asStr(params.mode, 'find-all'));
        break;
      case 'numeral-pick':
        b = buildPick(c, params, rule);
        break;
      case 'compare':
        b = buildCompare(c, params, rule);
        break;
      case 'number-pad':
        b = buildPad(c, params, rule);
        break;
      default:
        throw new Error(`geo.identify cannot build ${t.format}`);
    }
    const kind = asKind(params.kind, 'triangle');
    const overlay =
      t.format === 'numeral-pick' && rule === 'kind'
        ? shapeStimulus([
            shapeCard(
              'hint',
              kind,
              { blocks: rep === 'pattern-blocks', nonPrototypical: false },
              rng.fork('hint'),
            ),
          ])
        : undefined;
    return finish(geoIdentify, ctx, {
      params,
      vars: pickVars(t, b.vars),
      widget: b.widget,
      answer: b.answer,
      math: b.math,
      ...(overlay ? { overlay } : {}),
      ...(b.highlight ? { highlight: b.highlight } : {}),
    });
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    if (a.checker === 'select.exactSet')
      return { kind: 'state', value: { ids: [...(a.target.ids as string[])] } };
    // sort.byRule: every card in the bin its rule matches; cards that match none stay out.
    const w = out.widget;
    if (w.format !== 'shape-sort' || !w.bins) throw new Error('geo.identify: no sort example');
    return { kind: 'state', value: { bins: sortPlacement(out) } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    const params = out.params;
    const kind = asKind(params.kind, 'triangle');
    const kindVars = { kind, one: 1 };
    switch (w.format) {
      case 'shape-sort': {
        if (w.mode === 'odd-one-out' && a.kind === 'choice') {
          return [
            step(
              'gen.geo.identify.look',
              {},
              { op: 'highlight-attribute', args: { id: a.id, prop: 'shape' } },
            ),
            step('gen.geo.identify.odd', {}, { op: 'answer', args: { id: a.id } }),
          ];
        }
        if (w.mode === 'find-all' && a.kind === 'state') {
          const ids = a.target.ids as string[];
          const steps: LessonStep[] = [step('gen.geo.identify.look')];
          for (const id of ids) {
            steps.push(
              asRule(params) === 'kind'
                ? step('gen.geo.identify.is-kind', kindVars, { op: 'drag-card', args: { id } })
                : step('gen.geo.identify.fits', {}, { op: 'drag-card', args: { id } }),
            );
          }
          return steps;
        }
        const placement = sortPlacement(out);
        const steps: LessonStep[] = [step('gen.geo.identify.look')];
        const placed = new Set<string>();
        for (const [bin, ids] of Object.entries(placement)) {
          for (const id of ids) {
            placed.add(id);
            steps.push(
              step('gen.geo.identify.goes-here', {}, { op: 'drag-card', args: { id, bin } }),
            );
          }
        }
        // Cards that fit no bin are named before the last card goes in, so the solution ends with
        // the final placement.
        const out2 = w.cards.filter((x) => !placed.has(x.id));
        const tail = steps.pop();
        for (const x of out2) {
          steps.push(
            step(
              'gen.geo.identify.stays-out',
              {},
              { op: 'highlight-attribute', args: { id: x.id, prop: 'shape' } },
            ),
          );
        }
        if (tail) steps.push(tail);
        return steps;
      }
      case 'numeral-pick': {
        const id = a.kind === 'choice' ? a.id : 'c0';
        return [
          step('gen.geo.identify.look', {}, { op: 'highlight', args: { id } }),
          asRule(params) === 'kind'
            ? step('gen.geo.identify.is-kind', kindVars, { op: 'tap', args: { id } })
            : step('gen.geo.identify.fits', {}, { op: 'tap', args: { id } }),
        ];
      }
      case 'compare': {
        const id = a.kind === 'choice' ? a.id : 'left';
        if (w.ask === 'heavier' || w.ask === 'longer') {
          return [
            step('gen.geo.identify.look', {}, { op: 'highlight', args: { side: id } }),
            step('gen.geo.identify.is-attr', { attr: w.ask }, { op: 'answer', args: { id } }),
          ];
        }
        const r = countRule(asRule(params), 'compare');
        const ln = Number(out.vars.ln ?? countFromStimulus(w.left, r));
        const rn = Number(out.vars.rn ?? countFromStimulus(w.right, r));
        return [
          step(
            'gen.geo.identify.count',
            { n: ln, w: r },
            { op: 'highlight', args: { side: 'left' } },
          ),
          step(
            'gen.geo.identify.count',
            { n: rn, w: r },
            { op: 'highlight', args: { side: 'right' } },
          ),
          id === 'same'
            ? step('gen.geo.identify.same', {}, { op: 'answer', args: { id } })
            : step('gen.geo.identify.more', {}, { op: 'answer', args: { id } }),
        ];
      }
      case 'number-pad': {
        const n = a.kind === 'number' ? a.value : 0;
        const r = countRule(asRule(params), 'number-pad');
        return [
          step('gen.geo.identify.count', { n, w: r }, { op: 'show-stimulus' }),
          step('gen.geo.identify.type', { n }, { op: 'type', args: { blank: 'n', value: n } }),
        ];
      }
      default:
        return [];
    }
  },
};

function countFromStimulus(s: StimulusSpec, r: 'sides' | 'corners' | 'faces'): number {
  if (s.kind !== 'shape') return 0;
  return s.shapes[0]?.props[r] ?? 0;
}

/** The example placement of a sort item: each card in the first bin whose rule it matches. */
function sortPlacement(out: GeneratorOutput): Record<string, string[]> {
  const a = out.answer;
  if (a.kind !== 'state') return {};
  const cards = a.target.cards as {
    id: string;
    props: Record<string, string | number | boolean>;
  }[];
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
