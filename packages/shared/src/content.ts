import { z } from 'zod';
import { type Grade, gradeSchema } from './basics';
import {
  type MisconceptionId,
  misconceptionIdSchema,
  type SkillId,
  skillIdSchema,
  type TemplateId,
  templateIdSchema,
} from './ids';
import { assertType, type Equals } from './internal/type-assert';
import {
  type FeedbackKey,
  feedbackKeySchema,
  type GeneratorId,
  generatorIdSchema,
  type InteractionEvent,
  type ItemFormat,
  interactionEventSchema,
  itemFormatSchema,
  type NarrationKey,
  narrationKeySchema,
  type ParamSpec,
  type ParamValues,
  paramSpecSchema,
  paramValuesSchema,
  type Representation,
  type ResponseValue,
  representationSchema,
  responseValueSchema,
  type WidgetAction,
  widgetActionSchema,
} from './items';
import { type StrandId, strandIdSchema } from './strands';

// Content contracts: 02 §5.1 (Skill, ItemTemplate), 03 §6.1 (lessons), 03 §7.1 (misconceptions),
// 03 §8.2 / 02 §5.5 (narration).

const vars = z.record(z.string(), z.union([z.string(), z.number()]));

// ---------- 03 §6.1 lessons ----------

export interface LessonStep {
  actor: 'demo' | 'child';
  say: NarrationKey;
  vars?: Record<string, string | number>;
  action?: WidgetAction; // demo: the widget animates it; child: the action the child is invited to do
  expect?: { op: string; args?: Record<string, unknown> } | { answer: true }; // child steps
}
export const lessonStepSchema = z.object({
  actor: z.enum(['demo', 'child']),
  say: narrationKeySchema,
  vars: vars.optional(),
  action: widgetActionSchema.optional(),
  expect: z
    .union([
      z.object({ op: z.string().min(1), args: z.record(z.string(), z.unknown()).optional() }),
      z.object({ answer: z.literal(true) }),
    ])
    .optional(),
});
assertType<Equals<z.infer<typeof lessonStepSchema>, LessonStep>>(true);

export interface LessonExample {
  templateId?: TemplateId; // defaults to LessonSpec.templateId
  params?: ParamValues; // fixed params; exactly one of params / seed
  seed?: number; // or: generate from a seed (auto lessons)
  target?: 'easy' | 'typical'; // with seed: template-stats p10 ('easy') or median ('typical')
  steps?: LessonStep[]; // authored steps; omitted → generator.solution(item)
  childSteps?: number; // faded examples: how many final steps the child performs (≥ 1)
}
export const lessonExampleSchema = z
  .object({
    templateId: templateIdSchema.optional(),
    params: paramValuesSchema.optional(),
    seed: z.number().int().optional(),
    target: z.enum(['easy', 'typical']).optional(),
    steps: z.array(lessonStepSchema).optional(),
    childSteps: z.number().int().min(1).optional(),
  })
  .refine((e) => (e.params === undefined) !== (e.seed === undefined), {
    message: 'exactly one of params / seed',
  });
assertType<Equals<z.infer<typeof lessonExampleSchema>, LessonExample>>(true);

export interface LessonSpec {
  mode: 'auto' | 'authored' | 'none';
  templateId: TemplateId; // the template whose widget the lesson drives
  intro: NarrationKey; // normally sk.<SkillId>.intro
  worked: LessonExample[]; // 1–2; empty only when mode is 'none'
  faded: LessonExample[]; // 0–2
  scaffolded: { count: number; hintStart: 1 | 2 | 3 }; // count 0–4
  testOut: { items: number; minCorrect: number; templateIds?: TemplateId[] };
  outro?: NarrationKey;
}
export const lessonSpecSchema = z
  .object({
    mode: z.enum(['auto', 'authored', 'none']),
    templateId: templateIdSchema,
    intro: narrationKeySchema,
    worked: z.array(lessonExampleSchema).max(2),
    faded: z.array(lessonExampleSchema).max(2),
    scaffolded: z.object({
      count: z.number().int().min(0).max(4),
      hintStart: z.literal([1, 2, 3]),
    }),
    testOut: z.object({
      items: z.number().int().min(0),
      minCorrect: z.number().int().min(0),
      templateIds: z.array(templateIdSchema).optional(),
    }),
    outro: narrationKeySchema.optional(),
  })
  .refine((l) => l.mode === 'none' || l.worked.length >= 1, {
    message: 'worked needs 1–2 examples unless mode is none',
    path: ['worked'],
  });
assertType<Equals<z.infer<typeof lessonSpecSchema>, LessonSpec>>(true);

// ---------- 02 §5.1 Skill ----------

export interface Skill {
  id: SkillId;
  name: string;
  strand: StrandId;
  kind: 'concept' | 'procedure' | 'strategy' | 'fact-fluency' | 'problem-solving';
  grade: Grade; // label only
  standards: { ccss: string[]; wi?: string[]; supports?: string[] }; // supports: trajectory tags
  prerequisites: SkillId[]; // hard edges (DAG)
  encompasses: Record<SkillId, number>; // 0..1 implicit-review weights
  related: SkillId[]; // soft, for interleaving
  gateway: boolean; // stricter mastery (04 §3)
  representations: Representation[]; // ordered concrete → abstract
  templates: TemplateId[];
  lesson: LessonSpec; // worked example + faded steps (03 §6)
  fluency?: { medianLatencyMs: number }; // fact-fluency skills only
  misconceptions: MisconceptionId[];
  narration: { intro: NarrationKey };
}
export type SkillKind = Skill['kind'];
export const SKILL_KINDS = [
  'concept',
  'procedure',
  'strategy',
  'fact-fluency',
  'problem-solving',
] as const satisfies readonly SkillKind[];
export const skillKindSchema = z.enum(SKILL_KINDS);
assertType<Equals<z.infer<typeof skillKindSchema>, SkillKind>>(true);

export const skillSchema = z.object({
  id: skillIdSchema,
  name: z.string().min(1),
  strand: strandIdSchema,
  kind: skillKindSchema,
  grade: gradeSchema,
  standards: z.object({
    ccss: z.array(z.string()),
    wi: z.array(z.string()).optional(),
    supports: z.array(z.string()).optional(),
  }),
  prerequisites: z.array(skillIdSchema),
  encompasses: z.record(skillIdSchema, z.number().min(0).max(1)),
  related: z.array(skillIdSchema),
  gateway: z.boolean(),
  representations: z.array(representationSchema),
  templates: z.array(templateIdSchema),
  lesson: lessonSpecSchema,
  fluency: z.object({ medianLatencyMs: z.number().positive() }).optional(),
  misconceptions: z.array(misconceptionIdSchema),
  narration: z.object({ intro: narrationKeySchema }),
});
assertType<Equals<z.infer<typeof skillSchema>, Skill>>(true);

// ---------- 02 §5.1 ItemTemplate ----------

export interface ItemTemplate {
  id: TemplateId;
  skillId: SkillId;
  format: ItemFormat;
  tier: 'concrete' | 'pictorial' | 'abstract';
  representation?: Representation; // default: the format's default representation (03 §5.5)
  expectedLatencyMs?: number; // default 8,000 abstract / 12,000 manipulative (04 §2.3)
  generator: GeneratorId; // registered TS generator (03 §5)
  params: Record<string, ParamSpec>; // ranges / choices, consumed by the generator
  constraints?: string[]; // constraint grammar (03 §5.2); enforced inside the generator
  difficulty: { base: number; features: Record<string, number> }; // LLTM-style, 04 §2.2
  narration: { prompt: NarrationKey; hints: NarrationKey[] }; // hints: 1–3 keys (03 §4.3)
  distractors?: { rule: MisconceptionId }[];
}
export const itemTemplateSchema = z.object({
  id: templateIdSchema,
  skillId: skillIdSchema,
  format: itemFormatSchema,
  tier: z.enum(['concrete', 'pictorial', 'abstract']),
  representation: representationSchema.optional(),
  expectedLatencyMs: z.number().int().positive().optional(),
  generator: generatorIdSchema,
  params: z.record(z.string(), paramSpecSchema),
  constraints: z.array(z.string()).optional(),
  difficulty: z.object({ base: z.number(), features: z.record(z.string(), z.number()) }),
  narration: z.object({
    prompt: narrationKeySchema,
    hints: z.array(narrationKeySchema).min(1).max(3),
  }),
  distractors: z.array(z.object({ rule: misconceptionIdSchema })).optional(),
});
assertType<Equals<z.infer<typeof itemTemplateSchema>, ItemTemplate>>(true);

// ---------- 03 §7.1 MisconceptionSpec ----------

export interface MisconceptionSpec {
  id: MisconceptionId;
  name: string;
  area: string;
  detect: { kind: 'answer' | 'state' | 'process'; rule: string };
  appliesTo: { generators: GeneratorId[] };
  skills: SkillId[];
  remediation: SkillId[];
  feedback: FeedbackKey;
  priority: number;
  parentTip: string;
  examples: {
    generator?: GeneratorId;
    params: ParamValues;
    response: ResponseValue;
    meta?: { latencyMs: number; trace?: InteractionEvent[] };
    match: boolean;
  }[];
}
export const misconceptionSpecSchema = z.object({
  id: misconceptionIdSchema,
  name: z.string().min(1),
  area: z.string().min(1),
  detect: z.object({ kind: z.enum(['answer', 'state', 'process']), rule: z.string().min(1) }),
  appliesTo: z.object({ generators: z.array(generatorIdSchema) }),
  skills: z.array(skillIdSchema),
  remediation: z.array(skillIdSchema),
  feedback: feedbackKeySchema,
  priority: z.number(),
  parentTip: z.string(),
  examples: z.array(
    z.object({
      generator: generatorIdSchema.optional(),
      params: paramValuesSchema,
      response: responseValueSchema,
      meta: z
        .object({ latencyMs: z.number().min(0), trace: z.array(interactionEventSchema).optional() })
        .optional(),
      match: z.boolean(),
    }),
  ),
});
assertType<Equals<z.infer<typeof misconceptionSpecSchema>, MisconceptionSpec>>(true);

// ---------- 03 §8.2 narration source and 02 §5.5 compiled narration.json ----------

export type NarrationVoice = 'narrator' | 'pip' | 'glim';
export type NarrationStyle = 'warm' | 'excited' | 'calm' | 'playful';
export const narrationVoiceSchema = z.enum(['narrator', 'pip', 'glim']);
export const narrationStyleSchema = z.enum(['warm', 'excited', 'calm', 'playful']);
assertType<Equals<z.infer<typeof narrationVoiceSchema>, NarrationVoice>>(true);
assertType<Equals<z.infer<typeof narrationStyleSchema>, NarrationStyle>>(true);

/** One entry of `narration/<file>.yaml` (03 §8.2). */
export interface NarrationEntry {
  text: string; // display text
  say?: string; // spoken form when it differs from text
  voice?: NarrationVoice; // default narrator
  style?: NarrationStyle; // default warm
  level?: Grade; // reading level for 03 §8.5 checks
}
export const narrationEntrySchema = z.object({
  text: z.string().min(1),
  say: z.string().min(1).optional(),
  voice: narrationVoiceSchema.optional(),
  style: narrationStyleSchema.optional(),
  level: gradeSchema.optional(),
});
assertType<Equals<z.infer<typeof narrationEntrySchema>, NarrationEntry>>(true);

/** One entry of `dist/narration.json` (02 §5.5); clips may contain `$var[|type[:countVar]]` slots. */
export interface CompiledNarrationEntry {
  text: string;
  say?: string;
  voice?: NarrationVoice;
  clips: string[];
}
export const compiledNarrationEntrySchema = z.object({
  text: z.string(),
  say: z.string().optional(),
  voice: narrationVoiceSchema.optional(),
  clips: z.array(z.string()),
});
assertType<Equals<z.infer<typeof compiledNarrationEntrySchema>, CompiledNarrationEntry>>(true);

export type NarrationJson = Record<NarrationKey, CompiledNarrationEntry>;
export const narrationJsonSchema = z.record(narrationKeySchema, compiledNarrationEntrySchema);
assertType<Equals<z.infer<typeof narrationJsonSchema>, NarrationJson>>(true);
