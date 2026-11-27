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
/** The most pieces a purse or a coins picture shows, in coin slots; a bill takes `BILL_SLOTS`. */
export const COIN_SLOTS_MAX = 12;
export const BILL_SLOTS = 3;
/** The bills a purse or a picture can show, in dollars. */
export const BILL_DOLLARS: readonly number[] = [1, 2, 5, 10, 20];
export const billSchema = z
  .number()
  .refine((b) => BILL_DOLLARS.includes(b), `bills are ${BILL_DOLLARS.join(', ')} dollars`);
/** The coin slots a set of coins and bills takes. */
export const coinSlots = (side: { coins: readonly unknown[]; bills?: readonly unknown[] }) =>
  side.coins.length + BILL_SLOTS * (side.bills?.length ?? 0);
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

/**
 * The supported ranges of the pictures the widget kit draws from numbers (`chart` and `fraction`
 * stimuli, 03 §5.1). The schemas below enforce every one, so a picture that validates can be
 * drawn exactly: equal parts equal, bars on one scale, numerals readable.
 */
/** Categories of a picture graph, bar graph, tally chart or table: 1 to 6. */
export const CHART_CATEGORIES_MAX = 6;
/** Steps on the value axis (the axis top ÷ `scale`): at most 20, so 20 at scale 1, 200 at 10. */
export const CHART_AXIS_STEPS_MAX = 20;
/** Positions on a line plot's scale: at most 25. */
export const CHART_LINE_POSITIONS_MAX = 25;
/** The steps a line plot's scale may count in. */
export const CHART_LINE_STEPS: readonly number[] = [1, 0.5, 0.25];
/**
 * Categories of a `chart` stimulus: 1 or 2. A stimulus chart is a vertical bar graph (the picture
 * a compare side or a number-pad item shows); two columns with a three-digit axis are the widest
 * chart that keeps 32 px numerals in a compare side of the smallest widget area. The other kinds
 * and bigger graphs belong to the bar-graph formats, which give the chart the whole widget.
 */
export const CHART_STIMULUS_CATEGORIES_MAX = 2;
/** Parts a `fraction` picture is cut into: 1 to 12 (`shaded` is 0 to `parts`). */
export const FRACTION_PARTS_MAX = 12;

/** Rounds away binary noise (0.1 + 0.2), so chart positions and part symbols compare exactly. */
export const chartTidy = (x: number): number => Math.round(x * 1e6) / 1e6;

/** The top of a chart's value axis: `axisMax` rounded up to a multiple of `scale` (≥ one step). */
export function chartAxisTop(chart: Pick<ChartSpec, 'axisMax' | 'scale'>): number {
  return Math.max(chart.scale, Math.ceil(chartTidy(chart.axisMax / chart.scale)) * chart.scale);
}

/** The id of a line-plot position: the number as written ("2", "1.5", "0.25"). */
export const chartPositionId = (at: number): string => String(chartTidy(at));

/**
 * The positions of a line plot's scale, min to max by step. Empty when the scale is not valid or
 * is longer than the schema allows (so an unchecked scale never builds a huge list).
 */
export function chartLinePositions(scale: NonNullable<ChartSpec['lineScale']>): number[] {
  const { min, max, step } = scale;
  if (!(step > 0) || !(max >= min)) return [];
  const n = Math.round((max - min) / step);
  if (!(n + 1 <= CHART_LINE_POSITIONS_MAX)) return [];
  return Array.from({ length: n + 1 }, (_, k) => chartTidy(min + k * step));
}

/** Whether a value is a whole number of half symbols at this scale (picture graphs). */
export const chartHalvesOfScale = (value: number, scale: number): boolean =>
  Number.isInteger(chartTidy((2 * value) / scale));

/**
 * The rules every chart meets so that it can be drawn exactly (`chartSpecSchema` applies them;
 * `path` is where the chart sits in the value being checked).
 */
export function chartIssues(chart: ChartSpec, ctx: z.RefinementCtx, path: (string | number)[]) {
  const add = (p: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path: [...path, ...p], message });
  const ids = chart.categories.map((c) => c.id);
  if (new Set(ids).size !== ids.length) add(['categories'], 'category ids repeat');
  if (!(chart.axisMax > 0)) add(['axisMax'], 'the axis needs a positive top');
  else if (chartAxisTop(chart) / chart.scale > CHART_AXIS_STEPS_MAX) {
    add(['axisMax'], `the axis has at most ${CHART_AXIS_STEPS_MAX} steps of its scale`);
  }
  chart.categories.forEach((c, i) => {
    if (!(c.value >= 0)) add(['categories', i, 'value'], 'a count is never negative');
    if (c.value > chart.axisMax) add(['categories', i, 'value'], 'the value is above axisMax');
    if (chart.kind !== 'bar' && !Number.isInteger(c.value)) {
      add(['categories', i, 'value'], 'only a bar can stand between whole counts');
    }
    if (chart.kind === 'picture' && !chartHalvesOfScale(c.value, chart.scale)) {
      add(
        ['categories', i, 'value'],
        `a picture graph shows whole or half symbols of ${chart.scale}`,
      );
    }
  });
  if ((chart.kind === 'tally' || chart.kind === 'table') && chart.scale !== 1) {
    add(['scale'], `a ${chart.kind} counts in ones`);
  }
  if (chart.kind === 'line-plot') {
    const ls = chart.lineScale;
    if (!ls) {
      add(['lineScale'], 'a line plot needs lineScale');
      return;
    }
    if (!CHART_LINE_STEPS.includes(ls.step)) add(['lineScale', 'step'], 'step is 1, 0.5 or 0.25');
    if (!(ls.max > ls.min)) {
      add(['lineScale'], 'max must be above min');
      return;
    }
    // The ends are whole numbers, so every scale prints numerals (only whole-number positions
    // are labelled) and a reader can always tell which position an X stands on.
    if (!Number.isInteger(ls.min) || !Number.isInteger(ls.max)) {
      add(['lineScale'], 'a line plot runs between two whole numbers');
    }
    const steps = chartTidy((ls.max - ls.min) / ls.step);
    if (!Number.isInteger(steps)) add(['lineScale'], 'max − min is not a whole number of steps');
    if (steps + 1 > CHART_LINE_POSITIONS_MAX) {
      add(['lineScale'], `a line plot shows at most ${CHART_LINE_POSITIONS_MAX} positions`);
      return;
    }
    const positions = new Set(chartLinePositions(ls).map(chartPositionId));
    chart.categories.forEach((c, i) => {
      // The id is the position exactly as `chartPositionId` writes it ("1", "1.5"), so two
      // categories can never name one position in two spellings ("1" and "1.0").
      if (!positions.has(c.id)) {
        add(
          ['categories', i, 'id'],
          'a line-plot category id is a position on the scale, written as the number ("1.5")',
        );
      }
    });
  } else {
    if (chart.categories.length < 1) add(['categories'], 'a chart needs a category');
    if (chart.categories.length > CHART_CATEGORIES_MAX) {
      add(['categories'], `a chart shows at most ${CHART_CATEGORIES_MAX} categories`);
    }
  }
}

export const chartSpecSchema = z
  .object({
    kind: z.enum(['picture', 'bar', 'line-plot', 'tally', 'table']),
    orientation: z.enum(['vertical', 'horizontal']),
    categories: z.array(z.object({ id: z.string(), label: narrationKeySchema, value: z.number() })),
    scale: z.literal([1, 2, 5, 10]),
    axisMax: z.number(),
    lineScale: z
      .object({ min: z.number(), max: z.number(), step: z.number().positive() })
      .optional(),
  })
  .superRefine((chart, ctx) => chartIssues(chart, ctx, []));
assertType<Equals<z.infer<typeof chartSpecSchema>, ChartSpec>>(true);

/**
 * One whole cut into parts along its grid lines (FRA.16, K02 slice 4c-2): a `cols` × `rows` grid
 * of squares, each part the cell indices it covers (reading order, row by row). The picture colours
 * each part and draws thick lines between parts; it never writes a size on a part. Every part is a
 * rectangle of at least 2 squares, so its spoken name ("a bar 4 squares long") tells all of it.
 */
export interface GridPartsSpec {
  kind: 'grid-parts';
  cols: number;
  rows: number;
  parts: number[][];
}
/** Grid sizes a grid-parts picture draws: up to 8 squares across and 4 down, 2 to 6 parts. */
export const GRID_PARTS_COLS_MAX = 8;
export const GRID_PARTS_ROWS_MAX = 4;
export const GRID_PARTS_PARTS_MAX = 6;

/** The rectangle a set of cells fills in a `cols`-wide grid, or null when it is not one. */
export function gridPartRect(
  cells: readonly number[],
  cols: number,
): { col: number; row: number; w: number; h: number } | null {
  if (cells.length === 0) return null;
  const xs = cells.map((c) => c % cols);
  const ys = cells.map((c) => Math.floor(c / cols));
  const col = Math.min(...xs);
  const row = Math.min(...ys);
  const w = Math.max(...xs) - col + 1;
  const h = Math.max(...ys) - row + 1;
  return w * h === new Set(cells).size && w * h === cells.length ? { col, row, w, h } : null;
}

/** Static pictures used by many formats (03 §5.1). */
export type StimulusSpec =
  | { kind: 'none' }
  | GridPartsSpec
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
      /** null (only with `lower`): the first step's result, a blank piece both bars share. */
      parts: (number | '?' | null)[];
      whole: number | '?' | null;
      compare?: { bigger: number | '?'; smaller: number | '?' };
      /** A two-step model's second bar (#17 slice 4d), drawn under the first. */
      lower?: { parts: (number | '?' | null)[]; whole: number | '?' | null };
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
/** A bar-model amount; null is the first step's result of a two-step model. */
const barAmount = z.union([z.number(), z.literal('?'), z.null()]);
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
    parts: z.array(barAmount),
    whole: barAmount,
    compare: z.object({ bigger: numOrQ, smaller: numOrQ }).optional(),
    lower: z.object({ parts: z.array(barAmount), whole: barAmount }).optional(),
  }),
  z.object({ kind: z.literal('number-bond'), whole: numOrQ, parts: z.array(numOrQ) }),
  z
    .object({
      kind: z.literal('grid-parts'),
      cols: z.number().int().min(1).max(GRID_PARTS_COLS_MAX),
      rows: z.number().int().min(1).max(GRID_PARTS_ROWS_MAX),
      parts: z.array(z.array(z.number().int().min(0))),
    })
    .superRefine((g, ctx) => {
      const issue = (message: string) => ctx.addIssue({ code: 'custom', path: ['parts'], message });
      if (g.parts.length < 2 || g.parts.length > GRID_PARTS_PARTS_MAX) {
        issue(`a grid is cut into 2 to ${GRID_PARTS_PARTS_MAX} parts`);
      }
      const all = g.parts.flat();
      const n = g.cols * g.rows;
      if (all.length !== n || new Set(all).size !== n || all.some((c) => c >= n)) {
        issue('the parts cover every square of the grid exactly once');
      }
      g.parts.forEach((p) => {
        if (p.length < 2 || !gridPartRect(p, g.cols)) {
          issue('every part is a rectangle of at least 2 squares');
        }
      });
    }),
  z.object({ kind: z.literal('groups'), groups: count, perGroup: count, sprite: spriteIdSchema }),
  z.object({
    kind: z.literal('array'),
    rows: count,
    cols: count,
    sprite: spriteIdSchema.optional(),
    split: z.object({ atCol: count }).optional(),
  }),
  z
    .object({
      kind: z.literal('fraction'),
      shape: z.enum(['circle', 'rect', 'bar', 'loaf']),
      parts: z.number().int().min(1).max(FRACTION_PARTS_MAX),
      shaded: count,
      equalParts: z.boolean(),
    })
    .superRefine((f, ctx) => {
      if (f.shaded > f.parts) {
        ctx.addIssue({
          code: 'custom',
          path: ['shaded'],
          message: 'a picture shades at most all of its parts',
        });
      }
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
    h: z.number().int().min(0).max(23),
    m: z.number().int().min(0).max(59),
    numerals: z.boolean(),
    digital: z.boolean().optional(),
  }),
  z
    .object({
      kind: z.literal('coins'),
      coins: z.array(coinKindSchema).max(COIN_SLOTS_MAX),
      bills: z
        .array(billSchema)
        .max(COIN_SLOTS_MAX / BILL_SLOTS)
        .optional(),
    })
    .superRefine((s, ctx) => {
      const slots = coinSlots(s);
      if (slots < 1 || slots > COIN_SLOTS_MAX) {
        ctx.addIssue({
          code: 'custom',
          path: ['coins'],
          message: `a coins picture shows 1 to ${COIN_SLOTS_MAX} coins (a bill takes ${BILL_SLOTS})`,
        });
      }
    }),
  z.object({ kind: z.literal('shape'), shapes: z.array(shapeCardSchema) }),
  z.object({ kind: z.literal('chart'), chart: chartSpecSchema }).superRefine((s, ctx) => {
    const add = (path: string[], message: string) =>
      ctx.addIssue({ code: 'custom', path: ['chart', ...path], message });
    if (s.chart.kind !== 'bar') add(['kind'], 'a chart stimulus is a bar graph');
    if (s.chart.orientation !== 'vertical') {
      add(['orientation'], 'a chart stimulus is a vertical bar graph');
    }
    if (s.chart.categories.length > CHART_STIMULUS_CATEGORIES_MAX) {
      add(
        ['categories'],
        `a chart stimulus shows at most ${CHART_STIMULUS_CATEGORIES_MAX} categories`,
      );
    }
  }),
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
