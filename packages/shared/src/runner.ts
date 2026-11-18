import { z } from 'zod';
import { phrasePartSchema } from './audio';
import type { LessonPhase } from './basics';
import { lessonPhaseSchema } from './basics';
import type { SkillId, TemplateId } from './ids';
import { skillIdSchema, templateIdSchema } from './ids';
import { assertType, type Equals } from './internal/type-assert';
import type {
  CheckResult,
  GeneratedItem,
  HintStep,
  InteractionEvent,
  NarrationKey,
  ResponseValue,
  Tier,
  WidgetAction,
  WidgetConfig,
} from './items';
import {
  generatedItemObjectSchema,
  narrationKeySchema,
  refineWidgetMatchesFormat,
  tierSchema,
  widgetActionSchema,
  widgetConfigSchema,
} from './items';
import type { PlannedTask } from './planner';
import { plannedTaskSchema } from './planner';

// 02 §5.6 runner interfaces and §5.8 runner types.

/** The UI never sees the answer. */
export type PresentedItem = Omit<GeneratedItem, 'answer'>;
export const presentedItemSchema = generatedItemObjectSchema
  .omit({ answer: true })
  .superRefine(refineWidgetMatchesFormat);
assertType<Equals<z.infer<typeof presentedItemSchema>, PresentedItem>>(true);

export type RunnerTask =
  | {
      kind: 'lesson-step';
      skillId: SkillId;
      templateId: TemplateId;
      phase: LessonPhase;
      example: number;
      step: number;
      narration: NarrationKey;
      vars: Record<string, string | number>;
      widget: WidgetConfig;
      demo: WidgetAction | null;
      childStep: boolean;
    }
  | {
      kind: 'item';
      task: PlannedTask;
      item: PresentedItem;
      attemptNo: number;
      hintLevel: number;
      tier: Tier;
    };

const countSchema = z.number().int().nonnegative();

export const runnerTaskSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('lesson-step'),
    skillId: skillIdSchema,
    templateId: templateIdSchema,
    phase: lessonPhaseSchema,
    example: countSchema,
    step: countSchema,
    narration: narrationKeySchema,
    vars: z.record(z.string(), z.union([z.string(), z.number()])),
    widget: widgetConfigSchema,
    demo: widgetActionSchema.nullable(),
    childStep: z.boolean(),
  }),
  z.object({
    kind: z.literal('item'),
    task: plannedTaskSchema,
    item: presentedItemSchema,
    attemptNo: z.number().int().positive(),
    hintLevel: countSchema,
    tier: tierSchema,
  }),
]);
assertType<Equals<z.infer<typeof runnerTaskSchema>, RunnerTask>>(true);

export type AiFeedbackLine =
  | { mode: 'phrases'; parts: ({ id: string } | { number: number })[] } // phrase ids are `ph.*` narration keys
  | { mode: 'text'; text: string };

export const aiFeedbackLineSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('phrases'), parts: z.array(phrasePartSchema) }),
  z.object({ mode: z.literal('text'), text: z.string().min(1) }),
]);
assertType<Equals<z.infer<typeof aiFeedbackLineSchema>, AiFeedbackLine>>(true);

/** Provided by the app; wraps engine + logging + AI feedback (02 §5.6). Type only. */
export interface TaskRunner {
  current(): RunnerTask | null; // lesson step or GeneratedItem (+ widget config)
  submit(
    r: ResponseValue,
    meta: { latencyMs: number; trace?: InteractionEvent[] },
  ): Promise<RunnerFeedback>;
  hint(): HintStep | null;
  next(): RunnerTask | null; // after feedback; may adapt (04 §6)
  progress(): { done: number; total: number; materialEarned: number };
}

export interface RunnerFeedback extends CheckResult {
  say: { key?: NarrationKey; text?: string }; // deterministic key now; AI text may arrive later via onAiFeedback
  onAiFeedback(cb: (line: AiFeedbackLine) => void): void; // §5.8; delivered only within the 5 s window (07 §2)
  retry: boolean; // allow another attempt on the same item
}
