import { z } from 'zod';
import { assertType, type Equals } from '../internal/type-assert';
import {
  BILL_SLOTS,
  billSchema,
  type ChartSpec,
  COIN_SLOTS_MAX,
  type CoinKind,
  type ContextId,
  chartSpecSchema,
  coinKindSchema,
  contextIdSchema,
  type ExpressionSpec,
  expressionSpecSchema,
  type ItemFormat,
  itemFormatSchema,
  type NarrationKey,
  narrationKeySchema,
  type ObjectSet,
  objectSetSchema,
  type ShapeCard,
  type ShapeKind,
  type SpriteId,
  type StimulusSpec,
  shapeCardSchema,
  shapeKindSchema,
  spriteIdSchema,
  stimulusSpecSchema,
} from './core';

// 03 §5.5: one WidgetConfig per format, discriminated by `format`.

const count = z.number().int().min(0);
const posInt = z.number().int().min(1);
const vars = z.record(z.string(), z.union([z.string(), z.number()]));
/** A time of day a clock config can hold: whole hours 0–23 and whole minutes 0–59. */
const hm = z.object({
  h: z.number().int().min(0).max(23),
  m: z.number().int().min(0).max(59),
});
const htoSchema = z.object({ hundreds: count, tens: count, ones: count });
const pair = z.tuple([z.number(), z.number()]);

/** Shared fields of every config (03 §5.5). */
export interface WidgetBase {
  format: ItemFormat;
  theme?: string; // workshop skin id, visual only
}
export const widgetBaseSchema = z.object({
  format: itemFormatSchema,
  theme: z.string().optional(),
});
assertType<Equals<z.infer<typeof widgetBaseSchema>, WidgetBase>>(true);
const base = { theme: z.string().optional() };

// 03 §5.5 tap-count
export interface TapCountConfig extends WidgetBase {
  format: 'tap-count';
  set: ObjectSet;
  mode: 'how-many' | 'ordinal';
  ordinal?: { k: number; from: 'left' | 'right' };
  input: 'auto' | 'pad' | 'pick';
  pickOptions?: number[];
  marks: boolean;
  countAloud: boolean;
}
export const tapCountConfigSchema = z.object({
  format: z.literal('tap-count'),
  ...base,
  set: objectSetSchema,
  mode: z.enum(['how-many', 'ordinal']),
  ordinal: z.object({ k: posInt, from: z.enum(['left', 'right']) }).optional(),
  input: z.enum(['auto', 'pad', 'pick']),
  pickOptions: z.array(z.number()).optional(),
  marks: z.boolean(),
  countAloud: z.boolean(),
});
assertType<Equals<z.infer<typeof tapCountConfigSchema>, TapCountConfig>>(true);

// 03 §5.5 make-set
export interface MakeSetConfig extends WidgetBase {
  format: 'make-set';
  target: number;
  mode: 'make' | 'take-away' | 'add-more';
  start?: number;
  source: { sprite: SpriteId; supply: number };
  container: 'boat' | 'basket' | 'jar' | 'hands' | 'raft' | 'shell';
  capacity: number;
  showRunningCount: boolean;
  groupsOf?: 10;
}
export const makeSetConfigSchema = z.object({
  format: z.literal('make-set'),
  ...base,
  target: count,
  mode: z.enum(['make', 'take-away', 'add-more']),
  start: count.optional(),
  source: z.object({ sprite: spriteIdSchema, supply: count }),
  container: z.enum(['boat', 'basket', 'jar', 'hands', 'raft', 'shell']),
  capacity: count,
  showRunningCount: z.boolean(),
  groupsOf: z.literal(10).optional(),
});
assertType<Equals<z.infer<typeof makeSetConfigSchema>, MakeSetConfig>>(true);

// 03 §5.5 dot-flash
export interface DotFlashConfig extends WidgetBase {
  format: 'dot-flash';
  stimulus: StimulusSpec;
  flashMs: number;
  reflashes: number;
  input: 'pad' | 'pick';
  pickOptions?: number[];
  estimate?: { tolerancePct: number };
}
export const dotFlashConfigSchema = z.object({
  format: z.literal('dot-flash'),
  ...base,
  stimulus: stimulusSpecSchema,
  flashMs: z.number().positive(),
  reflashes: count,
  input: z.enum(['pad', 'pick']),
  pickOptions: z.array(z.number()).optional(),
  estimate: z.object({ tolerancePct: z.number().min(0).max(100) }).optional(),
});
assertType<Equals<z.infer<typeof dotFlashConfigSchema>, DotFlashConfig>>(true);

// 03 §5.5 numeral-pick
export interface NumeralPickConfig extends WidgetBase {
  format: 'numeral-pick';
  stimulus: StimulusSpec;
  options: {
    id: string;
    label?: string;
    stimulus?: StimulusSpec;
    speak?: NarrationKey;
    vars?: Record<string, string | number>;
  }[];
  layout: 'row' | 'grid';
}
export const numeralPickConfigSchema = z.object({
  format: z.literal('numeral-pick'),
  ...base,
  stimulus: stimulusSpecSchema,
  options: z.array(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      stimulus: stimulusSpecSchema.optional(),
      speak: narrationKeySchema.optional(),
      vars: vars.optional(),
    }),
  ),
  layout: z.enum(['row', 'grid']),
});
assertType<Equals<z.infer<typeof numeralPickConfigSchema>, NumeralPickConfig>>(true);

// 03 §5.5 number-pad
export interface NumberPadConfig extends WidgetBase {
  format: 'number-pad';
  stimulus: StimulusSpec;
  expression?: ExpressionSpec;
  blanks: { id: string; maxDigits: number; allowDecimal?: boolean }[];
  unit?:
    | 'cents'
    | 'dollars'
    | 'cm'
    | 'in'
    | 'ft'
    | 'm'
    | 'g'
    | 'kg'
    | 'L'
    | 'min'
    | 'sq-units'
    | null;
}
const padUnitSchema = z
  .enum(['cents', 'dollars', 'cm', 'in', 'ft', 'm', 'g', 'kg', 'L', 'min', 'sq-units'])
  .nullable()
  .optional();
export const numberPadConfigSchema = z.object({
  format: z.literal('number-pad'),
  ...base,
  stimulus: stimulusSpecSchema,
  expression: expressionSpecSchema.optional(),
  blanks: z.array(
    z.object({ id: z.string(), maxDigits: posInt, allowDecimal: z.boolean().optional() }),
  ),
  unit: padUnitSchema,
});
assertType<Equals<z.infer<typeof numberPadConfigSchema>, NumberPadConfig>>(true);

// 03 §5.5 compare
export interface CompareConfig extends WidgetBase {
  format: 'compare';
  left: StimulusSpec;
  right: StimulusSpec;
  ask: 'more' | 'fewer' | 'same-or-not' | 'symbol' | 'longer' | 'heavier' | 'true-false';
  allowMatchLines: boolean;
}
export const compareConfigSchema = z.object({
  format: z.literal('compare'),
  ...base,
  left: stimulusSpecSchema,
  right: stimulusSpecSchema,
  ask: z.enum(['more', 'fewer', 'same-or-not', 'symbol', 'longer', 'heavier', 'true-false']),
  allowMatchLines: z.boolean(),
});
assertType<Equals<z.infer<typeof compareConfigSchema>, CompareConfig>>(true);

// 03 §5.5 order
export interface OrderConfig extends WidgetBase {
  format: 'order';
  items: { id: string; value: number; stimulus?: StimulusSpec; label?: string }[];
  direction: 'asc' | 'desc';
  fixed?: Record<number, string>;
}
export const orderConfigSchema = z.object({
  format: z.literal('order'),
  ...base,
  items: z.array(
    z.object({
      id: z.string(),
      value: z.number(),
      stimulus: stimulusSpecSchema.optional(),
      label: z.string().optional(),
    }),
  ),
  direction: z.enum(['asc', 'desc']),
  fixed: z.record(z.number(), z.string()).optional(),
});
assertType<Equals<z.infer<typeof orderConfigSchema>, OrderConfig>>(true);

// 03 §5.5 tenframe-fill
export interface TenframeFillConfig extends WidgetBase {
  format: 'tenframe-fill';
  frames: 1 | 2;
  size: 5 | 10;
  prefilled: { frame: number; color: 'a' | 'b'; count: number }[];
  goal: 'show-n' | 'make-ten' | 'add' | 'subtract' | 'one-more' | 'one-less';
  n?: number;
  a?: number;
  b?: number;
  requireStandardFill: boolean;
  thenAsk: 'total' | 'missing' | null;
  skin: 'frame' | 'shell';
}
export const tenframeFillConfigSchema = z.object({
  format: z.literal('tenframe-fill'),
  ...base,
  frames: z.literal([1, 2]),
  size: z.literal([5, 10]),
  prefilled: z.array(z.object({ frame: count, color: z.enum(['a', 'b']), count })),
  goal: z.enum(['show-n', 'make-ten', 'add', 'subtract', 'one-more', 'one-less']),
  n: count.optional(),
  a: count.optional(),
  b: count.optional(),
  requireStandardFill: z.boolean(),
  thenAsk: z.enum(['total', 'missing']).nullable(),
  skin: z.enum(['frame', 'shell']),
});
assertType<Equals<z.infer<typeof tenframeFillConfigSchema>, TenframeFillConfig>>(true);

// 03 §5.5 number-bond
export interface NumberBondConfig extends WidgetBase {
  format: 'number-bond';
  whole: number | null;
  parts: (number | null)[];
  mode: 'missing-part' | 'missing-whole' | 'split' | 'new-way';
  found?: [number, number][];
  counters: boolean;
  nonZero: boolean;
}
export const numberBondConfigSchema = z.object({
  format: z.literal('number-bond'),
  ...base,
  whole: z.number().nullable(),
  parts: z.array(z.number().nullable()),
  mode: z.enum(['missing-part', 'missing-whole', 'split', 'new-way']),
  found: z.array(pair).optional(),
  counters: z.boolean(),
  nonZero: z.boolean(),
});
assertType<Equals<z.infer<typeof numberBondConfigSchema>, NumberBondConfig>>(true);

// 03 §5.5 rekenrek
export interface RekenrekConfig extends WidgetBase {
  format: 'rekenrek';
  rows: 1 | 2;
  preset: [number, number];
  mode: 'show' | 'add' | 'read' | 'make-ten';
  target?: number;
  a?: number;
  b?: number;
  rowRule: 'any' | 'fill-top-first';
  thenAsk: 'total' | null;
}
export const rekenrekConfigSchema = z.object({
  format: z.literal('rekenrek'),
  ...base,
  rows: z.literal([1, 2]),
  preset: z.tuple([count, count]),
  mode: z.enum(['show', 'add', 'read', 'make-ten']),
  target: count.optional(),
  a: count.optional(),
  b: count.optional(),
  rowRule: z.enum(['any', 'fill-top-first']),
  thenAsk: z.literal('total').nullable(),
});
assertType<Equals<z.infer<typeof rekenrekConfigSchema>, RekenrekConfig>>(true);

// 03 §5.5 number-line-place
export interface NumberLinePlaceConfig extends WidgetBase {
  format: 'number-line-place';
  min: number;
  max: number;
  ticksEvery: number | null;
  labelsEvery: number | null;
  target: number;
  mode: 'place' | 'read' | 'closer';
  snap: 'tick' | 'none';
  benchmarks?: [number, number];
  vertical: boolean;
  valueScale: 1 | 100;
}
export const numberLinePlaceConfigSchema = z.object({
  format: z.literal('number-line-place'),
  ...base,
  min: z.number(),
  max: z.number(),
  ticksEvery: z.number().positive().nullable(),
  labelsEvery: z.number().positive().nullable(),
  target: z.number(),
  mode: z.enum(['place', 'read', 'closer']),
  snap: z.enum(['tick', 'none']),
  benchmarks: pair.optional(),
  vertical: z.boolean(),
  valueScale: z.literal([1, 100]),
});
assertType<Equals<z.infer<typeof numberLinePlaceConfigSchema>, NumberLinePlaceConfig>>(true);

// 03 §5.5 number-line-jump
export interface NumberLineJumpConfig extends WidgetBase {
  format: 'number-line-jump';
  min: number;
  max: number;
  ticksEvery: number | null;
  labelsEvery: number | null;
  start: number;
  goal: 'next' | 'land-on' | 'add' | 'subtract' | 'difference';
  target?: number;
  allowedJumps: number[];
  path: 'stones' | 'line' | 'open' | 'timeline';
  thenAsk: 'landing' | 'total-jump' | null;
  unit?: 'min';
}
export const numberLineJumpConfigSchema = z.object({
  format: z.literal('number-line-jump'),
  ...base,
  min: z.number(),
  max: z.number(),
  ticksEvery: z.number().positive().nullable(),
  labelsEvery: z.number().positive().nullable(),
  start: z.number(),
  goal: z.enum(['next', 'land-on', 'add', 'subtract', 'difference']),
  target: z.number().optional(),
  allowedJumps: z.array(z.number()),
  path: z.enum(['stones', 'line', 'open', 'timeline']),
  thenAsk: z.enum(['landing', 'total-jump']).nullable(),
  unit: z.literal('min').optional(),
});
assertType<Equals<z.infer<typeof numberLineJumpConfigSchema>, NumberLineJumpConfig>>(true);

// 03 §5.5 hundred-chart
/** The most given terms a pattern chart shows: enough to see any rule, and still some to find. */
export const PATTERN_SHOWN_MAX = 5;
export interface HundredChartConfig extends WidgetBase {
  format: 'hundred-chart';
  first: number;
  rows: number;
  hidden: number[];
  mode: 'find' | 'next' | 'fill' | 'move' | 'pattern';
  from?: number;
  moves?: ('up' | 'down' | 'left' | 'right')[];
  patternStep?: number;
  patternStart?: number;
  /**
   * `pattern`: how many terms from `patternStart` the chart shows as given (shaded, fixed),
   * 1 to `PATTERN_SHOWN_MAX`.
   */
  patternShown?: number;
}
export const hundredChartConfigSchema = z.object({
  format: z.literal('hundred-chart'),
  ...base,
  first: count,
  rows: posInt,
  hidden: z.array(z.number().int()),
  mode: z.enum(['find', 'next', 'fill', 'move', 'pattern']),
  from: z.number().int().optional(),
  moves: z.array(z.enum(['up', 'down', 'left', 'right'])).optional(),
  patternStep: z.number().int().optional(),
  patternStart: z.number().int().optional(),
  patternShown: posInt.max(PATTERN_SHOWN_MAX).optional(),
});
assertType<Equals<z.infer<typeof hundredChartConfigSchema>, HundredChartConfig>>(true);

// 03 §5.5 base-ten-build
export interface BaseTenBuildConfig extends WidgetBase {
  format: 'base-ten-build';
  target: number;
  mode: 'build' | 'build-exact' | 'read';
  pieces: { thousands: boolean; hundreds: boolean; tens: boolean; ones: boolean };
  limits?: { hundreds?: number; tens?: number; ones?: number };
  exact?: { hundreds?: number; tens?: number; ones?: number };
  wholeIs: 'unit' | 'flat';
  prebuilt?: { thousands?: number; hundreds: number; tens: number; ones: number };
}
const htoPartialSchema = z.object({
  hundreds: count.optional(),
  tens: count.optional(),
  ones: count.optional(),
});
export const baseTenBuildConfigSchema = z.object({
  format: z.literal('base-ten-build'),
  ...base,
  target: z.number(),
  mode: z.enum(['build', 'build-exact', 'read']),
  pieces: z.object({
    thousands: z.boolean(),
    hundreds: z.boolean(),
    tens: z.boolean(),
    ones: z.boolean(),
  }),
  limits: htoPartialSchema.optional(),
  exact: htoPartialSchema.optional(),
  wholeIs: z.enum(['unit', 'flat']),
  prebuilt: z
    .object({ thousands: count.optional(), hundreds: count, tens: count, ones: count })
    .optional(),
});
assertType<Equals<z.infer<typeof baseTenBuildConfigSchema>, BaseTenBuildConfig>>(true);

// 03 §5.5 base-ten-trade
export interface BaseTenTradeConfig extends WidgetBase {
  format: 'base-ten-trade';
  start: { hundreds: number; tens: number; ones: number };
  operation?: { op: '+' | '-'; operand: { hundreds: number; tens: number; ones: number } };
  goal: 'regroup-to' | 'compute';
  regroupTarget?: { hundreds: number; tens: number; ones: number };
  showAlgorithm: boolean;
  thenAsk: boolean;
}
export const baseTenTradeConfigSchema = z.object({
  format: z.literal('base-ten-trade'),
  ...base,
  start: htoSchema,
  operation: z.object({ op: z.enum(['+', '-']), operand: htoSchema }).optional(),
  goal: z.enum(['regroup-to', 'compute']),
  regroupTarget: htoSchema.optional(),
  showAlgorithm: z.boolean(),
  thenAsk: z.boolean(),
});
assertType<Equals<z.infer<typeof baseTenTradeConfigSchema>, BaseTenTradeConfig>>(true);

// 03 §5.5 expanded-form
export interface ExpandedFormConfig extends WidgetBase {
  format: 'expanded-form';
  target: number;
  mode: 'build' | 'fill' | 'to-standard' | 'words' | 'digit-value';
  cards?: number[];
  expression?: ExpressionSpec;
  unusualOrder: boolean;
  digitIndex?: number;
  wordOptions?: { id: string; words: NarrationKey }[];
}
export const expandedFormConfigSchema = z.object({
  format: z.literal('expanded-form'),
  ...base,
  target: z.number(),
  mode: z.enum(['build', 'fill', 'to-standard', 'words', 'digit-value']),
  cards: z.array(z.number()).optional(),
  expression: expressionSpecSchema.optional(),
  unusualOrder: z.boolean(),
  digitIndex: count.optional(),
  wordOptions: z.array(z.object({ id: z.string(), words: narrationKeySchema })).optional(),
});
assertType<Equals<z.infer<typeof expandedFormConfigSchema>, ExpandedFormConfig>>(true);

// 03 §5.5 array-build
export interface ArrayBuildConfig extends WidgetBase {
  format: 'array-build';
  maxRows: number;
  maxCols: number;
  mode: 'build-dims' | 'build-total' | 'read' | 'split' | 'new-way';
  rows?: number;
  cols?: number;
  total?: number;
  orientationMatters: boolean;
  found?: [number, number][];
  sprite: SpriteId;
  gridShown: boolean;
}
export const arrayBuildConfigSchema = z.object({
  format: z.literal('array-build'),
  ...base,
  maxRows: posInt,
  maxCols: posInt,
  mode: z.enum(['build-dims', 'build-total', 'read', 'split', 'new-way']),
  rows: count.optional(),
  cols: count.optional(),
  total: count.optional(),
  orientationMatters: z.boolean(),
  found: z.array(pair).optional(),
  sprite: spriteIdSchema,
  gridShown: z.boolean(),
});
assertType<Equals<z.infer<typeof arrayBuildConfigSchema>, ArrayBuildConfig>>(true);

// 03 §5.5 equal-groups
export interface EqualGroupsConfig extends WidgetBase {
  format: 'equal-groups';
  groups: number;
  perGroup: number;
  unknown: 'total' | 'size' | 'groups';
  mode: 'build' | 'read';
  container: 'raft' | 'basket' | 'plate' | 'nest';
  sprite: SpriteId;
  maxGroups: number;
}
export const equalGroupsConfigSchema = z.object({
  format: z.literal('equal-groups'),
  ...base,
  groups: count,
  perGroup: count,
  unknown: z.enum(['total', 'size', 'groups']),
  mode: z.enum(['build', 'read']),
  container: z.enum(['raft', 'basket', 'plate', 'nest']),
  sprite: spriteIdSchema,
  maxGroups: posInt,
});
assertType<Equals<z.infer<typeof equalGroupsConfigSchema>, EqualGroupsConfig>>(true);

// 03 §5.5 equal-share
export interface EqualShareConfig extends WidgetBase {
  format: 'equal-share';
  items: number;
  recipients: number;
  sprite: SpriteId;
  recipientsKind: 'pebbling' | 'plate';
  allowLeftover: boolean;
  ask: 'each' | 'leftover' | 'fair-or-not' | 'even-odd';
  predealt?: number[];
}
export const equalShareConfigSchema = z.object({
  format: z.literal('equal-share'),
  ...base,
  items: count,
  recipients: posInt,
  sprite: spriteIdSchema,
  recipientsKind: z.enum(['pebbling', 'plate']),
  allowLeftover: z.boolean(),
  ask: z.enum(['each', 'leftover', 'fair-or-not', 'even-odd']),
  predealt: z.array(count).optional(),
});
assertType<Equals<z.infer<typeof equalShareConfigSchema>, EqualShareConfig>>(true);

// 03 §5.5 fraction-cut
export interface FractionCutConfig extends WidgetBase {
  format: 'fraction-cut';
  shape: 'circle' | 'rect' | 'square' | 'bar' | 'loaf' | 'grid';
  parts: number;
  shade?: number;
  cutMode: 'guided' | 'free';
  acceptNonCongruent: boolean;
  gridSize?: [number, number];
  thenName: boolean;
}
export const fractionCutConfigSchema = z.object({
  format: z.literal('fraction-cut'),
  ...base,
  shape: z.enum(['circle', 'rect', 'square', 'bar', 'loaf', 'grid']),
  parts: posInt,
  shade: count.optional(),
  cutMode: z.enum(['guided', 'free']),
  acceptNonCongruent: z.boolean(),
  gridSize: z.tuple([posInt, posInt]).optional(),
  thenName: z.boolean(),
});
assertType<Equals<z.infer<typeof fractionCutConfigSchema>, FractionCutConfig>>(true);

// 03 §5.5 fraction-pick
export interface FractionPickConfig extends WidgetBase {
  format: 'fraction-pick';
  mode: 'pick-picture' | 'name' | 'compare' | 'equivalent' | 'fair-or-not';
  stimulus?: StimulusSpec;
  options?: { id: string; stimulus?: StimulusSpec; label?: string; speak?: NarrationKey }[];
  nameInput?: 'pads' | 'words';
}
export const fractionPickConfigSchema = z.object({
  format: z.literal('fraction-pick'),
  ...base,
  mode: z.enum(['pick-picture', 'name', 'compare', 'equivalent', 'fair-or-not']),
  stimulus: stimulusSpecSchema.optional(),
  options: z
    .array(
      z.object({
        id: z.string(),
        stimulus: stimulusSpecSchema.optional(),
        label: z.string().optional(),
        speak: narrationKeySchema.optional(),
      }),
    )
    .optional(),
  nameInput: z.enum(['pads', 'words']).optional(),
});
assertType<Equals<z.infer<typeof fractionPickConfigSchema>, FractionPickConfig>>(true);

// 03 §5.5 fraction-line
export interface FractionLineConfig extends WidgetBase {
  format: 'fraction-line';
  max: 1 | 2 | 3;
  denominator: number;
  ticksShown: boolean;
  labels: 'none' | 'ends' | 'wholes' | 'all';
  mode: 'partition' | 'place' | 'read' | 'equivalent';
  target?: { a: number; b: number };
  skin: 'line' | 'ruler' | 'strip';
  decimalLabels: boolean;
}
export const fractionLineConfigSchema = z.object({
  format: z.literal('fraction-line'),
  ...base,
  max: z.literal([1, 2, 3]),
  denominator: posInt,
  ticksShown: z.boolean(),
  labels: z.enum(['none', 'ends', 'wholes', 'all']),
  mode: z.enum(['partition', 'place', 'read', 'equivalent']),
  target: z.object({ a: count, b: posInt }).optional(),
  skin: z.enum(['line', 'ruler', 'strip']),
  decimalLabels: z.boolean(),
});
assertType<Equals<z.infer<typeof fractionLineConfigSchema>, FractionLineConfig>>(true);

/**
 * The longest stretch a clock-set `elapsed` prompt adds, in minutes: under one turn of the short
 * hand (12 hours), so the start time and the minutes name one face time and never the start again.
 */
export const CLOCK_ELAPSED_MAX = 719;
/** The most options a clock-read pick shows: two rows of two beside the clock at 906 × 373. */
export const CLOCK_READ_OPTIONS_MAX = 4;
/** The longest printed label of a clock-read option ("12:45" is 5). */
export const CLOCK_READ_LABEL_MAX = 8;

// 03 §5.5 clock-set
export interface ClockSetConfig extends WidgetBase {
  format: 'clock-set';
  target: { h: number; m: number };
  start: { h: number; m: number };
  precision: 60 | 30 | 15 | 5 | 1;
  showDigital: boolean;
  prompt: 'digital' | 'spoken' | 'elapsed';
  elapsed?: { from: { h: number; m: number }; minutes: number };
}
export const clockSetConfigSchema = z.object({
  format: z.literal('clock-set'),
  ...base,
  target: hm,
  start: hm,
  precision: z.literal([60, 30, 15, 5, 1]),
  showDigital: z.boolean(),
  prompt: z.enum(['digital', 'spoken', 'elapsed']),
  elapsed: z.object({ from: hm, minutes: posInt.max(CLOCK_ELAPSED_MAX) }).optional(),
});
assertType<Equals<z.infer<typeof clockSetConfigSchema>, ClockSetConfig>>(true);

// 03 §5.5 clock-read
export interface ClockReadConfig extends WidgetBase {
  format: 'clock-read';
  time: { h: number; m: number };
  numerals: boolean;
  input: 'digital-pad' | 'pick';
  options?: { id: string; label: string; speak?: NarrationKey }[];
  ampm?: { scene: ContextId; isPm: boolean };
}
export const clockReadConfigSchema = z.object({
  format: z.literal('clock-read'),
  ...base,
  time: hm,
  numerals: z.boolean(),
  input: z.enum(['digital-pad', 'pick']),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1).max(CLOCK_READ_LABEL_MAX),
        speak: narrationKeySchema.optional(),
      }),
    )
    .max(CLOCK_READ_OPTIONS_MAX)
    .optional(),
  ampm: z.object({ scene: contextIdSchema, isPm: z.boolean() }).optional(),
});
assertType<Equals<z.infer<typeof clockReadConfigSchema>, ClockReadConfig>>(true);

// 03 §5.5 coin-pay
export interface CoinPayConfig extends WidgetBase {
  format: 'coin-pay';
  target: number;
  purse: Partial<Record<CoinKind | 'dollar', number | 'unlimited'>>;
  requireFewest: boolean;
  mode: 'pay' | 'new-way';
  found?: string[];
  showRunningTotal: boolean;
}
/** The most a money item asks for, pays or counts: $10.00, in cents. */
export const MONEY_CENTS_MAX = 1000;
/**
 * The most pieces of one kind a purse lists by number (more than that is `'unlimited'`, drawn as a
 * heap): a counted stack draws every piece.
 */
export const PURSE_COUNT_MAX = 12;
/**
 * The most pieces the tray of coin-pay and make-change holds: every piece is drawn, in at most
 * five piles, and still reads as coins at 906 × 373. An item's answer always fits.
 */
export const TRAY_PIECES_MAX = 12;
/**
 * The widest purse a narrow money board shows, in stack units (a coin kind is 1, the dollar bill
 * 2). make-change (beside its tags and count-up line) and coin-pay `new-way` (beside the ways found) leave
 * the board about 417 px at 906 × 373: one row of four coin stacks, or of the bill and two, at
 * the K target size, so the purse is never two rows over a tray of two.
 */
export const PURSE_NARROW_UNITS_MAX = 4;
/**
 * The most pieces the tray of a narrow money board holds (make-change, with or without its
 * count-up line; coin-pay `new-way` beside the ways found): one row of piles under a one-row purse, each piece
 * showing, at the K target size in 906 × 373. An item's answer always fits.
 */
export const TRAY_NARROW_PIECES_MAX = 5;
/**
 * The most ways a coin-pay `new-way` item lists as found (with a five-piece tray an amount has
 * about four ways, so three found leave one to find).
 */
export const COIN_FOUND_MAX = 3;
/**
 * The most pieces of one found way: the list draws every piece of a way on one line, and a way
 * was made in the tray, so it is never longer than the tray (`TRAY_NARROW_PIECES_MAX`).
 */
export const COIN_FOUND_WAY_PIECES_MAX = 5;
const purseSchema = z.partialRecord(
  z.enum(['penny', 'nickel', 'dime', 'quarter', 'dollar']),
  z.union([count.max(PURSE_COUNT_MAX), z.literal('unlimited')]),
);
export const coinPayConfigSchema = z.object({
  format: z.literal('coin-pay'),
  ...base,
  target: posInt.max(MONEY_CENTS_MAX),
  purse: purseSchema,
  requireFewest: z.boolean(),
  mode: z.enum(['pay', 'new-way']),
  found: z.array(z.string()).max(COIN_FOUND_MAX).optional(),
  showRunningTotal: z.boolean(),
});
assertType<Equals<z.infer<typeof coinPayConfigSchema>, CoinPayConfig>>(true);

// 03 §5.5 coin-count
export interface CoinCountConfig extends WidgetBase {
  format: 'coin-count';
  coins: CoinKind[];
  bills: number[];
  arrangement: 'sorted' | 'mixed';
  answerUnit: 'cents' | 'dollars-cents';
  compareWith?: { coins: CoinKind[]; bills: number[] };
}
export const coinCountConfigSchema = z.object({
  format: z.literal('coin-count'),
  ...base,
  coins: z.array(coinKindSchema).max(COIN_SLOTS_MAX),
  bills: z.array(billSchema).max(COIN_SLOTS_MAX / BILL_SLOTS),
  arrangement: z.enum(['sorted', 'mixed']),
  answerUnit: z.enum(['cents', 'dollars-cents']),
  compareWith: z
    .object({
      coins: z.array(coinKindSchema).max(COIN_SLOTS_MAX),
      bills: z.array(billSchema).max(COIN_SLOTS_MAX / BILL_SLOTS),
    })
    .optional(),
});
assertType<Equals<z.infer<typeof coinCountConfigSchema>, CoinCountConfig>>(true);

// 03 §5.5 make-change
export interface MakeChangeConfig extends WidgetBase {
  format: 'make-change';
  price: number;
  paid: number;
  purse: CoinPayConfig['purse'];
  countUpLine: boolean;
}
export const makeChangeConfigSchema = z.object({
  format: z.literal('make-change'),
  ...base,
  price: posInt.max(MONEY_CENTS_MAX - 1),
  paid: posInt.max(MONEY_CENTS_MAX),
  purse: purseSchema,
  countUpLine: z.boolean(),
});
assertType<Equals<z.infer<typeof makeChangeConfigSchema>, MakeChangeConfig>>(true);

// 03 §5.5 measure-length
export interface MeasureLengthConfig extends WidgetBase {
  format: 'measure-length';
  object: { sprite: SpriteId; length: number };
  tool: 'units' | 'ruler';
  unit: 'shell' | 'cube' | 'stick' | 'in' | 'cm' | 'ft' | 'm';
  altUnit?: MeasureLengthConfig['unit'];
  startOffset: number;
  precision: 1 | 0.5 | 0.25;
  mode: 'iterate' | 'read' | 'estimate' | 'two-units';
  input: 'pad' | 'tap-tick' | 'pick';
  options?: number[];
}
const lengthUnitSchema = z.enum(['shell', 'cube', 'stick', 'in', 'cm', 'ft', 'm']);
export const measureLengthConfigSchema = z.object({
  format: z.literal('measure-length'),
  ...base,
  object: z.object({ sprite: spriteIdSchema, length: z.number().min(0) }),
  tool: z.enum(['units', 'ruler']),
  unit: lengthUnitSchema,
  altUnit: lengthUnitSchema.optional(),
  startOffset: z.number(),
  precision: z.literal([1, 0.5, 0.25]),
  mode: z.enum(['iterate', 'read', 'estimate', 'two-units']),
  input: z.enum(['pad', 'tap-tick', 'pick']),
  options: z.array(z.number()).optional(),
});
assertType<Equals<z.infer<typeof measureLengthConfigSchema>, MeasureLengthConfig>>(true);

// 03 §5.5 compare-length
export interface CompareLengthConfig extends WidgetBase {
  format: 'compare-length';
  objects: { id: string; sprite: SpriteId; length: number; offset: number }[];
  ask: 'longer' | 'shorter' | 'order' | 'how-much-longer' | 'indirect';
  aligned: boolean;
}
export const compareLengthConfigSchema = z.object({
  format: z.literal('compare-length'),
  ...base,
  objects: z.array(
    z.object({
      id: z.string(),
      sprite: spriteIdSchema,
      length: z.number().min(0),
      offset: z.number(),
    }),
  ),
  ask: z.enum(['longer', 'shorter', 'order', 'how-much-longer', 'indirect']),
  aligned: z.boolean(),
});
assertType<Equals<z.infer<typeof compareLengthConfigSchema>, CompareLengthConfig>>(true);

// 03 §5.5 area-tiles
export interface AreaTilesConfig extends WidgetBase {
  format: 'area-tiles';
  region: { w: number; h: number; mask: string }; // mask: row-major '1'/'0' cells
  mode: 'tile' | 'count' | 'multiply' | 'decompose' | 'partition';
  gridShown: boolean;
  sideLabels: boolean;
  unit: 'sq-units' | 'sq-cm' | 'sq-m' | 'sq-in' | 'sq-ft';
  decimalGrid: boolean;
}
export const areaTilesConfigSchema = z.object({
  format: z.literal('area-tiles'),
  ...base,
  region: z
    .object({ w: posInt, h: posInt, mask: z.string().regex(/^[01]+$/) })
    .refine((r) => r.mask.length === r.w * r.h, 'mask length must equal w × h'),
  mode: z.enum(['tile', 'count', 'multiply', 'decompose', 'partition']),
  gridShown: z.boolean(),
  sideLabels: z.boolean(),
  unit: z.enum(['sq-units', 'sq-cm', 'sq-m', 'sq-in', 'sq-ft']),
  decimalGrid: z.boolean(),
});
assertType<Equals<z.infer<typeof areaTilesConfigSchema>, AreaTilesConfig>>(true);

// 03 §5.5 perimeter-walk
export interface PerimeterWalkConfig extends WidgetBase {
  format: 'perimeter-walk';
  polygon: { sides: (number | null)[]; grid: boolean; shape: 'rect' | 'L' | 'poly' };
  mode: 'total' | 'missing-side' | 'design';
  perimeter?: number;
  area?: number;
}
export const perimeterWalkConfigSchema = z.object({
  format: z.literal('perimeter-walk'),
  ...base,
  polygon: z.object({
    sides: z.array(z.number().nullable()),
    grid: z.boolean(),
    shape: z.enum(['rect', 'L', 'poly']),
  }),
  mode: z.enum(['total', 'missing-side', 'design']),
  perimeter: z.number().optional(),
  area: z.number().optional(),
});
assertType<Equals<z.infer<typeof perimeterWalkConfigSchema>, PerimeterWalkConfig>>(true);

// 03 §5.5 shape-compose
export interface ShapeComposeConfig extends WidgetBase {
  format: 'shape-compose';
  mode: 'fill-outline' | 'place-relative' | 'draw-on-grid' | 'build-sticks';
  pieces?: { id: string; kind: ShapeKind | 'stick' | 'corner'; count: number }[];
  outline?: { points: [number, number][] };
  showOutlineLines: boolean;
  scene?: { anchors: { id: string; sprite: SpriteId; at: [number, number] }[] };
  relation?: {
    word:
      | 'above'
      | 'below'
      | 'beside'
      | 'next-to'
      | 'in-front-of'
      | 'behind'
      | 'left-of'
      | 'right-of';
    anchor: string;
    item: SpriteId;
  };
  grid?: { cols: number; rows: number };
  require?: { sides?: number; rightAngles?: number; equalSides?: boolean; kind?: ShapeKind };
  rotationStep: 30 | 45 | 60 | 90;
}
export const shapeComposeConfigSchema = z.object({
  format: z.literal('shape-compose'),
  ...base,
  mode: z.enum(['fill-outline', 'place-relative', 'draw-on-grid', 'build-sticks']),
  pieces: z
    .array(
      z.object({
        id: z.string(),
        kind: z.union([shapeKindSchema, z.literal('stick'), z.literal('corner')]),
        count: posInt,
      }),
    )
    .optional(),
  outline: z.object({ points: z.array(pair) }).optional(),
  showOutlineLines: z.boolean(),
  scene: z
    .object({
      anchors: z.array(z.object({ id: z.string(), sprite: spriteIdSchema, at: pair })),
    })
    .optional(),
  relation: z
    .object({
      word: z.enum([
        'above',
        'below',
        'beside',
        'next-to',
        'in-front-of',
        'behind',
        'left-of',
        'right-of',
      ]),
      anchor: z.string(),
      item: spriteIdSchema,
    })
    .optional(),
  grid: z.object({ cols: posInt, rows: posInt }).optional(),
  require: z
    .object({
      sides: count.optional(),
      rightAngles: count.optional(),
      equalSides: z.boolean().optional(),
      kind: shapeKindSchema.optional(),
    })
    .optional(),
  rotationStep: z.literal([30, 45, 60, 90]),
});
assertType<Equals<z.infer<typeof shapeComposeConfigSchema>, ShapeComposeConfig>>(true);

// 03 §5.5 shape-sort
export type SortRule =
  | {
      prop: string;
      op: '==' | '>=' | '<=' | 'in';
      value: string | number | boolean | (string | number)[];
    }
  | { all: SortRule[] }
  | { any: SortRule[] };
// Recursive: an explicit annotation is required; the assert below is then trivially true.
export const sortRuleSchema: z.ZodType<SortRule> = z.lazy(() =>
  z.union([
    z.object({
      prop: z.string(),
      op: z.enum(['==', '>=', '<=', 'in']),
      value: z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.union([z.string(), z.number()])),
      ]),
    }),
    z.object({ all: z.array(sortRuleSchema) }),
    z.object({ any: z.array(sortRuleSchema) }),
  ]),
);
assertType<Equals<z.infer<typeof sortRuleSchema>, SortRule>>(true);

export interface ShapeSortConfig extends WidgetBase {
  format: 'shape-sort';
  cards: {
    id: string;
    card:
      | ShapeCard
      | { kind: 'number'; value: number }
      | { kind: 'object'; sprite: SpriteId; props: Record<string, string | number | boolean> }
      | { kind: 'coin'; coin: CoinKind }
      | { kind: 'event'; event: string; isPm?: boolean };
  }[];
  bins: { id: string; label: NarrationKey; rule: SortRule }[] | null;
  mode: 'sort' | 'find-all' | 'odd-one-out';
  /**
   * The names of picture cards (shapes, objects, coins) are not what the item asks, so a card may
   * say its name on tap and carry it in its accessible name. Absent: a picture card never names
   * itself (on a kind sort or find, its name is the answer). Number and word cards always read
   * what their face shows.
   */
  namesGiven?: boolean;
  /**
   * A bin may show a card it takes as its picture (the categories are what the child sees, as in a
   * data sort). Absent: a bin shows its name only, never one of the item's cards.
   */
  binPicturesGiven?: boolean;
}
export const shapeSortConfigSchema = z.object({
  format: z.literal('shape-sort'),
  ...base,
  cards: z.array(
    z.object({
      id: z.string(),
      card: z.union([
        shapeCardSchema,
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('number'), value: z.number() }),
          z.object({
            kind: z.literal('object'),
            sprite: spriteIdSchema,
            props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
          }),
          z.object({ kind: z.literal('coin'), coin: coinKindSchema }),
          z.object({ kind: z.literal('event'), event: z.string(), isPm: z.boolean().optional() }),
        ]),
      ]),
    }),
  ),
  bins: z
    .array(z.object({ id: z.string(), label: narrationKeySchema, rule: sortRuleSchema }))
    .nullable(),
  mode: z.enum(['sort', 'find-all', 'odd-one-out']),
  namesGiven: z.boolean().optional(),
  binPicturesGiven: z.boolean().optional(),
});
assertType<Equals<z.infer<typeof shapeSortConfigSchema>, ShapeSortConfig>>(true);

// 03 §5.5 pattern-extend
export type PatternToken = { sprite: SpriteId; color?: string } | { n: number } | { tiles: number };
export const patternTokenSchema = z.union([
  z.object({ sprite: spriteIdSchema, color: z.string().optional() }),
  z.object({ n: z.number() }),
  z.object({ tiles: count }),
]);
assertType<Equals<z.infer<typeof patternTokenSchema>, PatternToken>>(true);

export interface PatternExtendConfig extends WidgetBase {
  format: 'pattern-extend';
  sequence: (PatternToken | null)[];
  palette: PatternToken[];
  mode: 'extend' | 'fill' | 'core' | 'translate' | 'rule' | 'table';
  kind: 'repeat' | 'grow' | 'number' | 'function';
  table?: { inputs: number[]; outputs: (number | null)[] };
  translateTo?: PatternToken[];
}
export const patternExtendConfigSchema = z.object({
  format: z.literal('pattern-extend'),
  ...base,
  sequence: z.array(patternTokenSchema.nullable()),
  palette: z.array(patternTokenSchema),
  mode: z.enum(['extend', 'fill', 'core', 'translate', 'rule', 'table']),
  kind: z.enum(['repeat', 'grow', 'number', 'function']),
  table: z
    .object({ inputs: z.array(z.number()), outputs: z.array(z.number().nullable()) })
    .optional(),
  translateTo: z.array(patternTokenSchema).optional(),
});
assertType<Equals<z.infer<typeof patternExtendConfigSchema>, PatternExtendConfig>>(true);

// 03 §5.5 balance
export interface BalanceSide {
  terms: (
    | { n: number }
    | { blank: string }
    | { letter: string }
    | { object: SpriteId; count: number }
    | { op: '+' | '-' | '×' }
  )[];
}
export const balanceSideSchema = z.object({
  terms: z.array(
    z.union([
      z.object({ n: z.number() }),
      z.object({ blank: z.string() }),
      z.object({ letter: z.string() }),
      z.object({ object: spriteIdSchema, count }),
      z.object({ op: z.enum(['+', '-', '×']) }),
    ]),
  ),
});
assertType<Equals<z.infer<typeof balanceSideSchema>, BalanceSide>>(true);

export interface BalanceConfig extends WidgetBase {
  format: 'balance';
  left: BalanceSide;
  right: BalanceSide;
  mode: 'judge' | 'fill-blank' | 'make-equal' | 'which-heavier';
  objectWeights?: Record<SpriteId, number>;
  showTilt: boolean;
}
export const balanceConfigSchema = z.object({
  format: z.literal('balance'),
  ...base,
  left: balanceSideSchema,
  right: balanceSideSchema,
  mode: z.enum(['judge', 'fill-blank', 'make-equal', 'which-heavier']),
  objectWeights: z.record(spriteIdSchema, z.number()).optional(),
  showTilt: z.boolean(),
});
assertType<Equals<z.infer<typeof balanceConfigSchema>, BalanceConfig>>(true);

// 03 §5.5 bar-graph-read
export interface BarGraphReadConfig extends WidgetBase {
  format: 'bar-graph-read';
  chart: ChartSpec;
  question: {
    type: 'how-many' | 'most' | 'least' | 'total' | 'difference' | 'how-many-more-to' | 'two-step';
    categories: string[];
    extra?: number;
  };
}
export const barGraphReadConfigSchema = z.object({
  format: z.literal('bar-graph-read'),
  ...base,
  chart: chartSpecSchema,
  question: z.object({
    type: z.enum([
      'how-many',
      'most',
      'least',
      'total',
      'difference',
      'how-many-more-to',
      'two-step',
    ]),
    categories: z.array(z.string()),
    extra: z.number().optional(),
  }),
});
assertType<Equals<z.infer<typeof barGraphReadConfigSchema>, BarGraphReadConfig>>(true);

// 03 §5.5 bar-graph-build
export interface BarGraphBuildConfig extends WidgetBase {
  format: 'bar-graph-build';
  chart: ChartSpec; // values are hidden
  data: { kind: 'tally' | 'table' | 'objects' | 'measurements'; values: number[] };
  mode: 'bars' | 'pictures' | 'xs' | 'tally';
}
export const barGraphBuildConfigSchema = z.object({
  format: z.literal('bar-graph-build'),
  ...base,
  chart: chartSpecSchema,
  data: z.object({
    kind: z.enum(['tally', 'table', 'objects', 'measurements']),
    values: z.array(z.number()),
  }),
  mode: z.enum(['bars', 'pictures', 'xs', 'tally']),
});
assertType<Equals<z.infer<typeof barGraphBuildConfigSchema>, BarGraphBuildConfig>>(true);

// 03 §5.5 story-problem
export type SituationType =
  | 'add-to/result'
  | 'add-to/change'
  | 'add-to/start'
  | 'take-from/result'
  | 'take-from/change'
  | 'take-from/start'
  | 'put-together/total'
  | 'put-together/addend'
  | 'put-together/both'
  | 'compare/difference-more'
  | 'compare/difference-fewer'
  | 'compare/bigger-more'
  | 'compare/bigger-fewer'
  | 'compare/smaller-fewer'
  | 'compare/smaller-more'
  | 'equal-groups/product'
  | 'equal-groups/size'
  | 'equal-groups/groups'
  | 'array/product'
  | 'array/side'
  | 'measure/product'
  | 'measure/size'
  | 'area/product'
  | 'area/side'
  | 'two-step'
  | 'time/elapsed'
  | 'money';
export const SITUATION_TYPES = [
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
  'equal-groups/product',
  'equal-groups/size',
  'equal-groups/groups',
  'array/product',
  'array/side',
  'measure/product',
  'measure/size',
  'area/product',
  'area/side',
  'two-step',
  'time/elapsed',
  'money',
] as const satisfies readonly SituationType[];
export const situationTypeSchema = z.enum(SITUATION_TYPES);
assertType<Equals<(typeof SITUATION_TYPES)[number], SituationType>>(true);
assertType<Equals<z.infer<typeof situationTypeSchema>, SituationType>>(true);

export interface StoryProblemConfig extends WidgetBase {
  format: 'story-problem';
  context: ContextId;
  scene: StimulusSpec;
  lines: { key: NarrationKey; vars: Record<string, string | number> }[];
  situation: SituationType;
  steps: 1 | 2;
  workspace: 'none' | 'counters' | 'ten-frame' | 'bar-model' | 'number-line' | 'base-ten';
  blanks: { id: string; maxDigits: number }[];
  unit?: NumberPadConfig['unit'];
  showText: boolean;
}
export const storyProblemConfigSchema = z.object({
  format: z.literal('story-problem'),
  ...base,
  context: contextIdSchema,
  scene: stimulusSpecSchema,
  lines: z.array(z.object({ key: narrationKeySchema, vars })),
  situation: situationTypeSchema,
  steps: z.literal([1, 2]),
  workspace: z.enum(['none', 'counters', 'ten-frame', 'bar-model', 'number-line', 'base-ten']),
  blanks: z.array(z.object({ id: z.string(), maxDigits: posInt })),
  unit: padUnitSchema,
  showText: z.boolean(),
});
assertType<Equals<z.infer<typeof storyProblemConfigSchema>, StoryProblemConfig>>(true);

// 03 §5.5 puzzle-grid
export type PuzzleConstraint =
  | { kind: 'cage-sum'; cage: string; sum: number }
  | { kind: 'row-unique' }
  | { kind: 'col-unique' }
  | { kind: 'line-sum'; cells: [number, number][]; sum: number }
  | { kind: 'adjacent-step'; step: number }
  | { kind: 'equation'; expr: ExpressionSpec }
  | { kind: 'clue'; say: NarrationKey; test: string } // test: constraint-grammar predicate over `n`
  | { kind: 'use-each'; values: (number | string)[] };
export const puzzleConstraintSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cage-sum'), cage: z.string(), sum: z.number() }),
  z.object({ kind: z.literal('row-unique') }),
  z.object({ kind: z.literal('col-unique') }),
  z.object({ kind: z.literal('line-sum'), cells: z.array(pair), sum: z.number() }),
  z.object({ kind: z.literal('adjacent-step'), step: z.number() }),
  z.object({ kind: z.literal('equation'), expr: expressionSpecSchema }),
  z.object({ kind: z.literal('clue'), say: narrationKeySchema, test: z.string() }),
  z.object({ kind: z.literal('use-each'), values: z.array(z.union([z.number(), z.string()])) }),
]);
assertType<Equals<z.infer<typeof puzzleConstraintSchema>, PuzzleConstraint>>(true);

export interface PuzzleGridConfig extends WidgetBase {
  format: 'puzzle-grid';
  variant:
    | 'number-path'
    | 'sum-triangle'
    | 'cage-sum'
    | 'magic-square'
    | 'digit-cards'
    | 'clues'
    | 'missing-digit'
    | 'coin-ways'
    | 'shape-fill'
    | 'rect-ways'
    | 'all-ways';
  rows: number;
  cols: number;
  cells: { r: number; c: number; given?: number | string; blank?: boolean; cage?: string }[];
  constraints: PuzzleConstraint[];
  palette: (number | string)[];
  uniqueSolution: boolean;
}
export const puzzleGridConfigSchema = z.object({
  format: z.literal('puzzle-grid'),
  ...base,
  variant: z.enum([
    'number-path',
    'sum-triangle',
    'cage-sum',
    'magic-square',
    'digit-cards',
    'clues',
    'missing-digit',
    'coin-ways',
    'shape-fill',
    'rect-ways',
    'all-ways',
  ]),
  rows: posInt,
  cols: posInt,
  cells: z.array(
    z.object({
      r: count,
      c: count,
      given: z.union([z.number(), z.string()]).optional(),
      blank: z.boolean().optional(),
      cage: z.string().optional(),
    }),
  ),
  constraints: z.array(puzzleConstraintSchema),
  palette: z.array(z.union([z.number(), z.string()])),
  uniqueSolution: z.boolean(),
});
assertType<Equals<z.infer<typeof puzzleGridConfigSchema>, PuzzleGridConfig>>(true);

// ---------- the union ----------

/** 03 §5.1: each config has `format` as its discriminant. */
export type WidgetConfig =
  | TapCountConfig
  | MakeSetConfig
  | DotFlashConfig
  | NumeralPickConfig
  | NumberPadConfig
  | CompareConfig
  | OrderConfig
  | TenframeFillConfig
  | NumberBondConfig
  | RekenrekConfig
  | NumberLinePlaceConfig
  | NumberLineJumpConfig
  | HundredChartConfig
  | BaseTenBuildConfig
  | BaseTenTradeConfig
  | ExpandedFormConfig
  | ArrayBuildConfig
  | EqualGroupsConfig
  | EqualShareConfig
  | FractionCutConfig
  | FractionPickConfig
  | FractionLineConfig
  | ClockSetConfig
  | ClockReadConfig
  | CoinPayConfig
  | CoinCountConfig
  | MakeChangeConfig
  | MeasureLengthConfig
  | CompareLengthConfig
  | AreaTilesConfig
  | PerimeterWalkConfig
  | ShapeComposeConfig
  | ShapeSortConfig
  | PatternExtendConfig
  | BalanceConfig
  | BarGraphReadConfig
  | BarGraphBuildConfig
  | StoryProblemConfig
  | PuzzleGridConfig;

export const widgetConfigSchema = z.discriminatedUnion('format', [
  tapCountConfigSchema,
  makeSetConfigSchema,
  dotFlashConfigSchema,
  numeralPickConfigSchema,
  numberPadConfigSchema,
  compareConfigSchema,
  orderConfigSchema,
  tenframeFillConfigSchema,
  numberBondConfigSchema,
  rekenrekConfigSchema,
  numberLinePlaceConfigSchema,
  numberLineJumpConfigSchema,
  hundredChartConfigSchema,
  baseTenBuildConfigSchema,
  baseTenTradeConfigSchema,
  expandedFormConfigSchema,
  arrayBuildConfigSchema,
  equalGroupsConfigSchema,
  equalShareConfigSchema,
  fractionCutConfigSchema,
  fractionPickConfigSchema,
  fractionLineConfigSchema,
  clockSetConfigSchema,
  clockReadConfigSchema,
  coinPayConfigSchema,
  coinCountConfigSchema,
  makeChangeConfigSchema,
  measureLengthConfigSchema,
  compareLengthConfigSchema,
  areaTilesConfigSchema,
  perimeterWalkConfigSchema,
  shapeComposeConfigSchema,
  shapeSortConfigSchema,
  patternExtendConfigSchema,
  balanceConfigSchema,
  barGraphReadConfigSchema,
  barGraphBuildConfigSchema,
  storyProblemConfigSchema,
  puzzleGridConfigSchema,
]);
assertType<Equals<z.infer<typeof widgetConfigSchema>, WidgetConfig>>(true);
// Every format has exactly one config: the discriminants cover ItemFormat.
assertType<Equals<WidgetConfig['format'], ItemFormat>>(true);

/** Narrow a WidgetConfig to one format. */
export type WidgetConfigOf<F extends ItemFormat> = Extract<WidgetConfig, { format: F }>;
