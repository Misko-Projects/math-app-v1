import { z } from 'zod';
import { KEBAB_ID_PATTERN, type MisconceptionId, misconceptionIdSchema } from '../ids';
import { assertType, type Equals } from '../internal/type-assert';

// 03 §5.1 core types and 02 §5.2 ItemFormat / ResponseValue / CheckResult.
// Widget configs live in ./widgets; GeneratedItem and ParamSpec in ./item.

// ---------- formats, tiers, representations ----------

/** 02 §5.2. Each format has exactly one widget. */
export type ItemFormat =
  | 'tap-count'
  | 'make-set'
  | 'dot-flash'
  | 'numeral-pick'
  | 'number-pad'
  | 'compare'
  | 'order'
  | 'tenframe-fill'
  | 'number-bond'
  | 'rekenrek'
  | 'number-line-place'
  | 'number-line-jump'
  | 'hundred-chart'
  | 'base-ten-build'
  | 'base-ten-trade'
  | 'expanded-form'
  | 'array-build'
  | 'equal-groups'
  | 'equal-share'
  | 'fraction-cut'
  | 'fraction-pick'
  | 'fraction-line'
  | 'clock-set'
  | 'clock-read'
  | 'coin-pay'
  | 'coin-count'
  | 'make-change'
  | 'measure-length'
  | 'compare-length'
  | 'area-tiles'
  | 'perimeter-walk'
  | 'shape-compose'
  | 'shape-sort'
  | 'pattern-extend'
  | 'balance'
  | 'bar-graph-read'
  | 'bar-graph-build'
  | 'story-problem'
  | 'puzzle-grid';

/** All 39 formats in 02 §5.2 order. */
export const ITEM_FORMATS = [
  'tap-count',
  'make-set',
  'dot-flash',
  'numeral-pick',
  'number-pad',
  'compare',
  'order',
  'tenframe-fill',
  'number-bond',
  'rekenrek',
  'number-line-place',
  'number-line-jump',
  'hundred-chart',
  'base-ten-build',
  'base-ten-trade',
  'expanded-form',
  'array-build',
  'equal-groups',
  'equal-share',
  'fraction-cut',
  'fraction-pick',
  'fraction-line',
  'clock-set',
  'clock-read',
  'coin-pay',
  'coin-count',
  'make-change',
  'measure-length',
  'compare-length',
  'area-tiles',
  'perimeter-walk',
  'shape-compose',
  'shape-sort',
  'pattern-extend',
  'balance',
  'bar-graph-read',
  'bar-graph-build',
  'story-problem',
  'puzzle-grid',
] as const satisfies readonly ItemFormat[];

export const itemFormatSchema = z.enum(ITEM_FORMATS);
assertType<Equals<(typeof ITEM_FORMATS)[number], ItemFormat>>(true);
assertType<Equals<z.infer<typeof itemFormatSchema>, ItemFormat>>(true);

export type Tier = 'concrete' | 'pictorial' | 'abstract';
export const TIERS = ['concrete', 'pictorial', 'abstract'] as const satisfies readonly Tier[];
export const tierSchema = z.enum(TIERS);
assertType<Equals<z.infer<typeof tierSchema>, Tier>>(true);

/** 03 §3.2 closed list. */
export type RepresentationId =
  | 'objects'
  | 'fingers'
  | 'dots'
  | 'five-frame'
  | 'ten-frame'
  | 'double-ten-frame'
  | 'rekenrek'
  | 'number-path'
  | 'number-line'
  | 'open-number-line'
  | 'hundred-chart'
  | 'bundles'
  | 'base-ten'
  | 'pv-chart'
  | 'expanded'
  | 'words'
  | 'number-bond'
  | 'bar-model'
  | 'balance'
  | 'groups'
  | 'array'
  | 'area-model'
  | 'area-grid'
  | 'tiles'
  | 'fraction-shape'
  | 'fraction-strip'
  | 'fraction-line'
  | 'shapes'
  | 'solids'
  | 'pattern-blocks'
  | 'dot-grid'
  | 'units'
  | 'ruler'
  | 'scale'
  | 'beaker'
  | 'thermometer'
  | 'clock'
  | 'digital-clock'
  | 'timeline'
  | 'coins'
  | 'bills'
  | 'picture-graph'
  | 'bar-graph'
  | 'line-plot'
  | 'tally'
  | 'table'
  | 'story'
  | 'symbols';
/** 02 §5.1 name; the ids are the 03 §3.2 list. */
export type Representation = RepresentationId;

export const REPRESENTATION_IDS = [
  'objects',
  'fingers',
  'dots',
  'five-frame',
  'ten-frame',
  'double-ten-frame',
  'rekenrek',
  'number-path',
  'number-line',
  'open-number-line',
  'hundred-chart',
  'bundles',
  'base-ten',
  'pv-chart',
  'expanded',
  'words',
  'number-bond',
  'bar-model',
  'balance',
  'groups',
  'array',
  'area-model',
  'area-grid',
  'tiles',
  'fraction-shape',
  'fraction-strip',
  'fraction-line',
  'shapes',
  'solids',
  'pattern-blocks',
  'dot-grid',
  'units',
  'ruler',
  'scale',
  'beaker',
  'thermometer',
  'clock',
  'digital-clock',
  'timeline',
  'coins',
  'bills',
  'picture-graph',
  'bar-graph',
  'line-plot',
  'tally',
  'table',
  'story',
  'symbols',
] as const satisfies readonly RepresentationId[];

export const representationIdSchema = z.enum(REPRESENTATION_IDS);
export const representationSchema = representationIdSchema;
assertType<Equals<(typeof REPRESENTATION_IDS)[number], RepresentationId>>(true);
assertType<Equals<z.infer<typeof representationIdSchema>, RepresentationId>>(true);
assertType<Equals<z.infer<typeof representationSchema>, Representation>>(true);

// ---------- keys and small ids ----------

/** 03 §8.1: a lowercase namespace, then dot-separated segments (`tp.ADD.08.t1.prompt`). */
export const NARRATION_KEY_PATTERN = /^[a-z]+(\.[A-Za-z0-9-]+)+$/;
/** FeedbackKey: a NarrationKey under the `fb.*` namespace. */
export const FEEDBACK_KEY_PATTERN = /^fb(\.[A-Za-z0-9-]+)+$/;
/** `<family>.<name>`, e.g. `addsub.facts` (03 §5.6). */
export const GENERATOR_ID_PATTERN = /^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9-]*$/;

/** 03 §8.1 grammar; checked by the schema (plain string at the type level, like the ids). */
export type NarrationKey = string;
/** Always under the fb.* namespace. */
export type FeedbackKey = NarrationKey;
/** `<family>.<name>`, e.g. `addsub.facts` (03 §5.6). */
export type GeneratorId = string;
/** Art-kit object sprite id, e.g. `fish`, `plank`, `shell` (05 §11). */
export type SpriteId = string;
/** contexts.yaml id (03 §4.6). */
export type ContextId = string;

export const narrationKeySchema = z
  .string()
  .regex(NARRATION_KEY_PATTERN, 'expected a NarrationKey like tp.ADD.08.t1.prompt');
export const feedbackKeySchema = z
  .string()
  .regex(FEEDBACK_KEY_PATTERN, 'expected a FeedbackKey under fb.*');
export const generatorIdSchema = z
  .string()
  .regex(GENERATOR_ID_PATTERN, 'expected a GeneratorId like addsub.facts');
export const spriteIdSchema = z.string().min(1);
export const contextIdSchema = z
  .string()
  .regex(KEBAB_ID_PATTERN, 'expected a kebab-case ContextId');
assertType<Equals<z.infer<typeof narrationKeySchema>, NarrationKey>>(true);
assertType<Equals<z.infer<typeof feedbackKeySchema>, FeedbackKey>>(true);
assertType<Equals<z.infer<typeof generatorIdSchema>, GeneratorId>>(true);
assertType<Equals<z.infer<typeof spriteIdSchema>, SpriteId>>(true);
assertType<Equals<z.infer<typeof contextIdSchema>, ContextId>>(true);

// ---------- params ----------

export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;
export const paramValueSchema = z.union([z.number(), z.string(), z.boolean()]);
export const paramValuesSchema = z.record(z.string(), paramValueSchema);
assertType<Equals<z.infer<typeof paramValueSchema>, ParamValue>>(true);
assertType<Equals<z.infer<typeof paramValuesSchema>, ParamValues>>(true);

/** Prompt/hint variables (03 §8.4). */
const varsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

// ---------- pictures ----------

export interface ObjectSet {
  count: number;
  sprite: SpriteId;
  layout:
    | 'line'
    | 'array'
    | 'circle'
    | 'scatter'
    | 'ten-frame'
    | 'double-ten-frame'
    | 'dice'
    | 'groups';
  rows?: number; // 'array' layout
  groups?: number[]; // 'groups' layout, or coloured sub-groups, e.g. [3, 4]
  distractors?: { sprite: SpriteId; count: number }; // other objects that must not be counted
  sizeVaries?: boolean; // object sizes differ (conservation items, CMP.05)
  layoutSeed: number; // deterministic jitter for 'scatter'
}
export const objectSetSchema = z.object({
  count: z.number().int().min(0),
  sprite: spriteIdSchema,
  layout: z.enum([
    'line',
    'array',
    'circle',
    'scatter',
    'ten-frame',
    'double-ten-frame',
    'dice',
    'groups',
  ]),
  rows: z.number().int().min(1).optional(),
  groups: z.array(z.number().int().min(0)).optional(),
  distractors: z.object({ sprite: spriteIdSchema, count: z.number().int().min(0) }).optional(),
  sizeVaries: z.boolean().optional(),
  layoutSeed: z.number().int(),
});
assertType<Equals<z.infer<typeof objectSetSchema>, ObjectSet>>(true);

export type ExpressionToken =
  | { t: 'num'; v: number } // integer or decimal
  | { t: 'op'; v: '+' | '-' | '×' | '÷' }
  | { t: 'rel'; v: '=' | '<' | '>' | '?' } // '?' = the child chooses the relation
  | { t: 'blank'; id: string } // filled by the child, in reading order
  | { t: 'var'; name: string } // a letter unknown (ALG.08)
  | { t: 'frac'; a: number | 'blank'; b: number | 'blank' }
  | { t: 'money'; cents: number; style: 'cents' | 'dollars' }
  | { t: 'time'; h: number; m: number }
  | { t: 'paren'; v: '(' | ')' };
const numOrBlank = z.union([z.number(), z.literal('blank')]);
export const expressionTokenSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('num'), v: z.number() }),
  z.object({ t: z.literal('op'), v: z.enum(['+', '-', '×', '÷']) }),
  z.object({ t: z.literal('rel'), v: z.enum(['=', '<', '>', '?']) }),
  z.object({ t: z.literal('blank'), id: z.string() }),
  z.object({ t: z.literal('var'), name: z.string() }),
  z.object({ t: z.literal('frac'), a: numOrBlank, b: numOrBlank }),
  z.object({ t: z.literal('money'), cents: z.number(), style: z.enum(['cents', 'dollars']) }),
  z.object({ t: z.literal('time'), h: z.number(), m: z.number() }),
  z.object({ t: z.literal('paren'), v: z.enum(['(', ')']) }),
]);
assertType<Equals<z.infer<typeof expressionTokenSchema>, ExpressionToken>>(true);

export interface ExpressionSpec {
  tokens: ExpressionToken[];
}
export const expressionSpecSchema = z.object({ tokens: z.array(expressionTokenSchema) });
assertType<Equals<z.infer<typeof expressionSpecSchema>, ExpressionSpec>>(true);

export type CoinKind = 'penny' | 'nickel' | 'dime' | 'quarter';
export const COIN_KINDS = [
  'penny',
  'nickel',
  'dime',
  'quarter',
] as const satisfies readonly CoinKind[];
export const coinKindSchema = z.enum(COIN_KINDS);
assertType<Equals<z.infer<typeof coinKindSchema>, CoinKind>>(true);

export type ShapeKind =
  | 'circle'
  | 'triangle'
  | 'square'
  | 'rectangle'
  | 'rhombus'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'oval'
  | 'kite'
  | 'quadrilateral'
  | 'open-figure'
  | 'cube'
  | 'cone'
  | 'cylinder'
  | 'sphere'
  | 'rect-prism'
  | 'pyramid';
export const SHAPE_KINDS = [
  'circle',
  'triangle',
  'square',
  'rectangle',
  'rhombus',
  'trapezoid',
  'pentagon',
  'hexagon',
  'octagon',
  'oval',
  'kite',
  'quadrilateral',
  'open-figure',
  'cube',
  'cone',
  'cylinder',
  'sphere',
  'rect-prism',
  'pyramid',
] as const satisfies readonly ShapeKind[];
export const shapeKindSchema = z.enum(SHAPE_KINDS);
assertType<Equals<(typeof SHAPE_KINDS)[number], ShapeKind>>(true);
assertType<Equals<z.infer<typeof shapeKindSchema>, ShapeKind>>(true);

export interface ShapeProps {
  sides: number;
  corners: number;
  rightAngles: number;
  equalSides: boolean;
  parallelPairs: number;
  curved: boolean;
  closed: boolean;
  solid: boolean;
  faces?: number;
}
export const shapePropsSchema = z.object({
  sides: z.number().int().min(0),
  corners: z.number().int().min(0),
  rightAngles: z.number().int().min(0),
  equalSides: z.boolean(),
  parallelPairs: z.number().int().min(0),
  curved: z.boolean(),
  closed: z.boolean(),
  solid: z.boolean(),
  faces: z.number().int().min(0).optional(),
});
assertType<Equals<z.infer<typeof shapePropsSchema>, ShapeProps>>(true);

export interface ShapeCard {
  id: string;
  shape: ShapeKind;
  props: ShapeProps;
  rotationDeg: number;
  scale: number;
  color: string;
}
export const shapeCardSchema = z.object({
  id: z.string(),
  shape: shapeKindSchema,
  props: shapePropsSchema,
  rotationDeg: z.number(),
  scale: z.number().positive(),
  color: z.string(),
});
assertType<Equals<z.infer<typeof shapeCardSchema>, ShapeCard>>(true);

export interface ChartSpec {
  kind: 'picture' | 'bar' | 'line-plot' | 'tally' | 'table';
  orientation: 'vertical' | 'horizontal';
  categories: { id: string; label: NarrationKey; value: number }[];
  scale: 1 | 2 | 5 | 10;
  axisMax: number;
  lineScale?: { min: number; max: number; step: number }; // line plots: step 1, 0.5 or 0.25
}
export const chartSpecSchema = z.object({
  kind: z.enum(['picture', 'bar', 'line-plot', 'tally', 'table']),
  orientation: z.enum(['vertical', 'horizontal']),
  categories: z.array(z.object({ id: z.string(), label: narrationKeySchema, value: z.number() })),
  scale: z.literal([1, 2, 5, 10]),
  axisMax: z.number(),
  lineScale: z.object({ min: z.number(), max: z.number(), step: z.number().positive() }).optional(),
});
assertType<Equals<z.infer<typeof chartSpecSchema>, ChartSpec>>(true);

/** Static pictures used by many formats (03 §5.1). */
export type StimulusSpec =
  | { kind: 'none' }
  | { kind: 'objects'; set: ObjectSet }
  | {
      kind: 'dots';
      arrangement:
        | 'dice'
        | 'scatter'
        | 'five-frame'
        | 'ten-frame'
        | 'double-ten-frame'
        | 'fingers'
        | 'groups';
      groups: number[];
    }
  | { kind: 'ten-frame'; frames: 1 | 2; filled: number[]; colors?: ('a' | 'b')[][] }
  | { kind: 'rekenrek'; rows: [number, number] }
  | {
      kind: 'base-ten';
      thousands?: number;
      hundreds: number;
      tens: number;
      ones: number;
      wholeIs?: 'unit' | 'flat';
    }
  | {
      kind: 'number-line';
      min: number;
      max: number;
      ticksEvery: number | null;
      labelsEvery: number | null;
      marks?: { at: number; label?: string; arrow?: boolean }[];
      jumps?: { from: number; to: number }[];
    }
  | {
      kind: 'bar-model';
      parts: (number | '?')[];
      whole: number | '?';
      compare?: { bigger: number | '?'; smaller: number | '?' };
    }
  | { kind: 'number-bond'; whole: number | '?'; parts: (number | '?')[] }
  | { kind: 'groups'; groups: number; perGroup: number; sprite: SpriteId }
  | { kind: 'array'; rows: number; cols: number; sprite?: SpriteId; split?: { atCol: number } }
  | {
      kind: 'fraction';
      shape: 'circle' | 'rect' | 'bar' | 'loaf';
      parts: number;
      shaded: number;
      equalParts: boolean;
    }
  | {
      kind: 'gauge';
      instrument: 'scale' | 'beaker' | 'thermometer';
      min: number;
      max: number;
      ticksEvery: number;
      labelsEvery: number;
      value: number;
      unit: 'g' | 'kg' | 'L' | 'degF' | 'degC';
    }
  | { kind: 'clock'; h: number; m: number; numerals: boolean; digital?: boolean }
  | { kind: 'coins'; coins: CoinKind[]; bills?: number[] }
  | { kind: 'shape'; shapes: ShapeCard[] }
  | { kind: 'chart'; chart: ChartSpec }
  | { kind: 'expression'; expr: ExpressionSpec }
  | { kind: 'scene'; context: ContextId; sprites: { sprite: SpriteId; count: number }[] };

const numOrQ = z.union([z.number(), z.literal('?')]);
const count = z.number().int().min(0);
export const stimulusSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('objects'), set: objectSetSchema }),
  z.object({
    kind: z.literal('dots'),
    arrangement: z.enum([
      'dice',
      'scatter',
      'five-frame',
      'ten-frame',
      'double-ten-frame',
      'fingers',
      'groups',
    ]),
    groups: z.array(count),
  }),
  z.object({
    kind: z.literal('ten-frame'),
    frames: z.literal([1, 2]),
    filled: z.array(count),
    colors: z.array(z.array(z.enum(['a', 'b']))).optional(),
  }),
  z.object({ kind: z.literal('rekenrek'), rows: z.tuple([count, count]) }),
  z.object({
    kind: z.literal('base-ten'),
    thousands: count.optional(),
    hundreds: count,
    tens: count,
    ones: count,
    wholeIs: z.enum(['unit', 'flat']).optional(),
  }),
  z.object({
    kind: z.literal('number-line'),
    min: z.number(),
    max: z.number(),
    ticksEvery: z.number().positive().nullable(),
    labelsEvery: z.number().positive().nullable(),
    marks: z
      .array(
        z.object({
          at: z.number(),
          label: z.string().optional(),
          arrow: z.boolean().optional(),
        }),
      )
      .optional(),
    jumps: z.array(z.object({ from: z.number(), to: z.number() })).optional(),
  }),
  z.object({
    kind: z.literal('bar-model'),
    parts: z.array(numOrQ),
    whole: numOrQ,
    compare: z.object({ bigger: numOrQ, smaller: numOrQ }).optional(),
  }),
  z.object({ kind: z.literal('number-bond'), whole: numOrQ, parts: z.array(numOrQ) }),
  z.object({ kind: z.literal('groups'), groups: count, perGroup: count, sprite: spriteIdSchema }),
  z.object({
    kind: z.literal('array'),
    rows: count,
    cols: count,
    sprite: spriteIdSchema.optional(),
    split: z.object({ atCol: count }).optional(),
  }),
  z.object({
    kind: z.literal('fraction'),
    shape: z.enum(['circle', 'rect', 'bar', 'loaf']),
    parts: z.number().int().min(1),
    shaded: count,
    equalParts: z.boolean(),
  }),
  z.object({
    kind: z.literal('gauge'),
    instrument: z.enum(['scale', 'beaker', 'thermometer']),
    min: z.number(),
    max: z.number(),
    ticksEvery: z.number().positive(),
    labelsEvery: z.number().positive(),
    value: z.number(),
    unit: z.enum(['g', 'kg', 'L', 'degF', 'degC']),
  }),
  z.object({
    kind: z.literal('clock'),
    h: z.number().int(),
    m: z.number().int(),
    numerals: z.boolean(),
    digital: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('coins'),
    coins: z.array(coinKindSchema),
    bills: z.array(z.number()).optional(),
  }),
  z.object({ kind: z.literal('shape'), shapes: z.array(shapeCardSchema) }),
  z.object({ kind: z.literal('chart'), chart: chartSpecSchema }),
  z.object({ kind: z.literal('expression'), expr: expressionSpecSchema }),
  z.object({
    kind: z.literal('scene'),
    context: contextIdSchema,
    sprites: z.array(z.object({ sprite: spriteIdSchema, count })),
  }),
]);
assertType<Equals<z.infer<typeof stimulusSpecSchema>, StimulusSpec>>(true);

// ---------- interaction, actions, hints ----------

/** Manipulative trace (03 §5.1); never part of ResponseValue. */
export interface InteractionEvent {
  t: 'tap' | 'drag' | 'drop' | 'undo' | 'move';
  target: string;
  ms: number;
}
export const interactionEventSchema = z.object({
  t: z.enum(['tap', 'drag', 'drop', 'undo', 'move']),
  target: z.string(),
  ms: z.number().min(0),
});
assertType<Equals<z.infer<typeof interactionEventSchema>, InteractionEvent>>(true);

/** Lessons, hints and demo mode; `op` is from the format's op list (03 §5.5). */
export interface WidgetAction {
  op: string;
  args?: Record<string, unknown>;
  say?: NarrationKey;
  vars?: Record<string, string | number>;
}
export const widgetActionSchema = z.object({
  op: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
  say: narrationKeySchema.optional(),
  vars: varsSchema.optional(),
});
assertType<Equals<z.infer<typeof widgetActionSchema>, WidgetAction>>(true);

/** 03 §5.8 hint ladder level. */
export interface HintStep {
  level: 1 | 2 | 3 | 4 | 5;
  kind: 'replay' | 'nudge' | 'representation' | 'worked-step' | 'show-me';
  say: NarrationKey;
  vars?: Record<string, string | number>;
  actions?: WidgetAction[]; // what the widget animates for this hint
  overlay?: StimulusSpec; // representation hint: a picture shown beside the widget
}
export const hintStepSchema = z.object({
  level: z.literal([1, 2, 3, 4, 5]),
  kind: z.enum(['replay', 'nudge', 'representation', 'worked-step', 'show-me']),
  say: narrationKeySchema,
  vars: varsSchema.optional(),
  actions: z.array(widgetActionSchema).optional(),
  overlay: stimulusSpecSchema.optional(),
});
assertType<Equals<z.infer<typeof hintStepSchema>, HintStep>>(true);

// ---------- answers, responses, checks ----------

export type StateCheckerId =
  | 'set.count'
  | 'tenframe.total'
  | 'tenframe.makeTen'
  | 'bond.split'
  | 'bond.newWay'
  | 'rekenrek.total'
  | 'jumps.reach'
  | 'baseten.value'
  | 'baseten.exact'
  | 'trade.result'
  | 'array.dims'
  | 'array.area'
  | 'groups.equal'
  | 'share.fair'
  | 'fraction.cut'
  | 'fraction.partition'
  | 'clock.time'
  | 'coins.total'
  | 'coins.fewest'
  | 'units.iterate'
  | 'tiles.cover'
  | 'rect.perimeterArea'
  | 'compose.fill'
  | 'compose.relative'
  | 'grid.polygon'
  | 'sort.byRule'
  | 'select.exactSet'
  | 'pattern.tokens'
  | 'pattern.isomorphic'
  | 'balance.equal'
  | 'chart.values'
  | 'puzzle.satisfies';
export const STATE_CHECKER_IDS = [
  'set.count',
  'tenframe.total',
  'tenframe.makeTen',
  'bond.split',
  'bond.newWay',
  'rekenrek.total',
  'jumps.reach',
  'baseten.value',
  'baseten.exact',
  'trade.result',
  'array.dims',
  'array.area',
  'groups.equal',
  'share.fair',
  'fraction.cut',
  'fraction.partition',
  'clock.time',
  'coins.total',
  'coins.fewest',
  'units.iterate',
  'tiles.cover',
  'rect.perimeterArea',
  'compose.fill',
  'compose.relative',
  'grid.polygon',
  'sort.byRule',
  'select.exactSet',
  'pattern.tokens',
  'pattern.isomorphic',
  'balance.equal',
  'chart.values',
  'puzzle.satisfies',
] as const satisfies readonly StateCheckerId[];
export const stateCheckerIdSchema = z.enum(STATE_CHECKER_IDS);
assertType<Equals<(typeof STATE_CHECKER_IDS)[number], StateCheckerId>>(true);
assertType<Equals<z.infer<typeof stateCheckerIdSchema>, StateCheckerId>>(true);

export type AnswerSpec =
  | { kind: 'number'; value: number; tolerance?: number } // exact unless tolerance
  | { kind: 'numbers'; values: number[]; ordered: boolean; fraction?: { equivalentOk: boolean } }
  | { kind: 'choice'; id: string }
  | { kind: 'placement'; value: number; min: number; max: number; tolerance: number }
  | { kind: 'state'; checker: StateCheckerId; target: Record<string, unknown> };
export const answerSpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('number'),
    value: z.number(),
    tolerance: z.number().min(0).optional(),
  }),
  z.object({
    kind: z.literal('numbers'),
    values: z.array(z.number()),
    ordered: z.boolean(),
    fraction: z.object({ equivalentOk: z.boolean() }).optional(),
  }),
  z.object({ kind: z.literal('choice'), id: z.string() }),
  z.object({
    kind: z.literal('placement'),
    value: z.number(),
    min: z.number(),
    max: z.number(),
    tolerance: z.number().min(0),
  }),
  z.object({
    kind: z.literal('state'),
    checker: stateCheckerIdSchema,
    target: z.record(z.string(), z.unknown()),
  }),
]);
assertType<Equals<z.infer<typeof answerSpecSchema>, AnswerSpec>>(true);

/** 02 §5.2. `skip` is accepted by every item. */
export type ResponseValue =
  | { kind: 'number'; value: number }
  | { kind: 'numbers'; values: number[] }
  | { kind: 'choice'; id: string }
  | { kind: 'placement'; value: number } // number-line position
  | { kind: 'state'; value: Record<string, unknown> } // manipulative end state
  | { kind: 'skip' }; // "I haven't learned this yet"
export const responseValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('number'), value: z.number() }),
  z.object({ kind: z.literal('numbers'), values: z.array(z.number()) }),
  z.object({ kind: z.literal('choice'), id: z.string() }),
  z.object({ kind: z.literal('placement'), value: z.number() }),
  z.object({ kind: z.literal('state'), value: z.record(z.string(), z.unknown()) }),
  z.object({ kind: z.literal('skip') }),
]);
assertType<Equals<z.infer<typeof responseValueSchema>, ResponseValue>>(true);

export interface CheckResult {
  correct: boolean;
  partialCredit: number;
  misconceptionIds: MisconceptionId[]; // buggy-rule matches
  feedback: FeedbackKey; // deterministic feedback narration key
  closeness?: number; // 0..1 for estimation formats
}
export const checkResultSchema = z.object({
  correct: z.boolean(),
  partialCredit: z.number().min(0).max(1),
  misconceptionIds: z.array(misconceptionIdSchema),
  feedback: feedbackKeySchema,
  closeness: z.number().min(0).max(1).optional(),
});
assertType<Equals<z.infer<typeof checkResultSchema>, CheckResult>>(true);
