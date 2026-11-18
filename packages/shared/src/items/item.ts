import { z } from 'zod';
import { type SkillId, skillIdSchema, type TemplateId, templateIdSchema } from '../ids';
import { assertType, type Equals } from '../internal/type-assert';
import {
  type AnswerSpec,
  answerSpecSchema,
  type HintStep,
  hintStepSchema,
  type ItemFormat,
  itemFormatSchema,
  type NarrationKey,
  narrationKeySchema,
  type ParamValue,
  paramValueSchema,
  paramValuesSchema,
  type Representation,
  type Tier,
  tierSchema,
} from './core';
import { type WidgetConfig, widgetConfigSchema } from './widgets';

// ---------- 03 §5.2 ParamSpec (normalised form; templates.json holds only this) ----------

export type ParamSpec =
  | { kind: 'int'; min: number; max: number; step?: number; exclude?: number[] }
  | { kind: 'choice'; values: ParamValue[]; weights?: number[] }
  | { kind: 'bool'; p: number } // P(true)
  | { kind: 'const'; value: ParamValue };

export const paramSpecSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('int'),
      min: z.number().int(),
      max: z.number().int(),
      step: z.number().int().min(1).optional(),
      exclude: z.array(z.number().int()).optional(),
    })
    .refine((s) => s.min <= s.max, 'min must be ≤ max'),
  z
    .object({
      kind: z.literal('choice'),
      values: z.array(paramValueSchema).min(1),
      weights: z.array(z.number().positive()).optional(),
    })
    .refine(
      (s) => s.weights === undefined || s.weights.length === s.values.length,
      'weights must have the same length as values',
    ),
  z.object({ kind: z.literal('bool'), p: z.number().min(0).max(1) }),
  z.object({ kind: z.literal('const'), value: paramValueSchema }),
]);
assertType<Equals<z.infer<typeof paramSpecSchema>, ParamSpec>>(true);

// ---------- 02 §5.2 GeneratedItem ----------

export interface GeneratedItem {
  templateId: TemplateId;
  skillId: SkillId;
  seed: number;
  format: ItemFormat;
  tier: Tier;
  params: Record<string, number | string | boolean>;
  prompt: { narration: NarrationKey; vars: Record<string, string | number>; text: string };
  widget: WidgetConfig; // discriminated union by format; everything the widget needs to render
  answer: AnswerSpec; // never sent to the UI layer as text (the UI calls engine.check)
  hints: HintStep[]; // graded ladder: nudge → representation → worked step
  difficulty: number; // computed logit, 04 §2.2
}

/**
 * The unrefined object shape of `GeneratedItem`. Zod 4 throws on `.omit()`/`.pick()` of a refined
 * schema, so derived schemas (e.g. `presentedItemSchema`) start from this one and re-apply
 * `refineWidgetMatchesFormat`.
 */
export const generatedItemObjectSchema = z.object({
  templateId: templateIdSchema,
  skillId: skillIdSchema,
  seed: z.number().int(),
  format: itemFormatSchema,
  tier: tierSchema,
  params: paramValuesSchema,
  prompt: z.object({
    narration: narrationKeySchema,
    vars: z.record(z.string(), z.union([z.string(), z.number()])),
    text: z.string(),
  }),
  widget: widgetConfigSchema,
  answer: answerSpecSchema,
  hints: z.array(hintStepSchema),
  difficulty: z.number(),
});

/** `widget.format` must equal the item's `format` (each format has exactly one widget, 02 §5.2). */
export function refineWidgetMatchesFormat(
  item: { format: ItemFormat; widget: WidgetConfig },
  ctx: z.RefinementCtx,
): void {
  if (item.widget.format !== item.format) {
    ctx.addIssue({
      code: 'custom',
      message: 'widget.format must equal format',
      path: ['widget', 'format'],
    });
  }
}

export const generatedItemSchema = generatedItemObjectSchema.superRefine(refineWidgetMatchesFormat);
assertType<Equals<z.infer<typeof generatedItemSchema>, GeneratedItem>>(true);

// ---------- 03 §5.5 summary table: default representation per format ----------

export const FORMAT_DEFAULT_REPRESENTATION: Readonly<Record<ItemFormat, Representation>> = {
  'tap-count': 'objects',
  'make-set': 'objects',
  'dot-flash': 'dots',
  'numeral-pick': 'symbols',
  'number-pad': 'symbols',
  compare: 'symbols',
  order: 'symbols',
  'tenframe-fill': 'ten-frame',
  'number-bond': 'number-bond',
  rekenrek: 'rekenrek',
  'number-line-place': 'number-line',
  'number-line-jump': 'number-line',
  'hundred-chart': 'hundred-chart',
  'base-ten-build': 'base-ten',
  'base-ten-trade': 'base-ten',
  'expanded-form': 'expanded',
  'array-build': 'array',
  'equal-groups': 'groups',
  'equal-share': 'objects',
  'fraction-cut': 'fraction-shape',
  'fraction-pick': 'fraction-shape',
  'fraction-line': 'fraction-line',
  'clock-set': 'clock',
  'clock-read': 'clock',
  'coin-pay': 'coins',
  'coin-count': 'coins',
  'make-change': 'coins',
  'measure-length': 'ruler',
  'compare-length': 'objects',
  'area-tiles': 'tiles',
  'perimeter-walk': 'shapes',
  'shape-compose': 'pattern-blocks',
  'shape-sort': 'shapes',
  'pattern-extend': 'objects',
  balance: 'balance',
  'bar-graph-read': 'bar-graph',
  'bar-graph-build': 'bar-graph',
  'story-problem': 'story',
  'puzzle-grid': 'symbols',
};
