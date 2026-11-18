import {
  feedbackKeySchema,
  type Grade,
  generatorIdSchema,
  gradeSchema,
  interactionEventSchema,
  itemFormatSchema,
  KEBAB_ID_PATTERN,
  misconceptionIdSchema,
  narrationEntrySchema,
  narrationKeySchema,
  paramValuesSchema,
  representationSchema,
  responseValueSchema,
  SITUATION_TYPES,
  situationTypeSchema,
  skillKindSchema,
  strandIdSchema,
  tierSchema,
  widgetActionSchema,
} from '@number-island/shared';
import { z } from 'zod';

// YAML authoring schemas (03 §4). These are the *source* shapes: strict (unknown keys are V01
// errors), with the 03 §5.2 ParamSpec shorthand and grade coercion. The compiler turns them into
// the shared contract types (02 §5.1) and re-checks every output with the shared schemas.
//
// Ids are checked for *grammar* by V02, not here, so one malformed id gives one clear V02 finding
// instead of a schema error that hides the rest of the file.

const idString = z.string().min(1);

/** `grade: K` or `grade: 1` (03 §4.1): coerced to the `Grade` string union. */
export const gradeSourceSchema = z
  .union([z.string(), z.number().int()])
  .transform((g) => String(g))
  .pipe(gradeSchema);

// ---------- 03 §5.2 ParamSpec shorthand ----------

const scalar = z.union([z.number(), z.string(), z.boolean()]);

export const paramShorthandSchema = z.union([
  z.strictObject({
    int: z.tuple([z.number(), z.number()]),
    step: z.number().optional(),
    exclude: z.array(z.number()).optional(),
  }),
  z.strictObject({ choice: z.array(scalar), weights: z.array(z.number()).optional() }),
  z.strictObject({ bool: z.number() }),
  z.strictObject({ const: scalar }),
  scalar,
]);
export type ParamShorthand = z.infer<typeof paramShorthandSchema>;

// ---------- skills/<STRAND>.yaml (03 §4.2) ----------

export const skillSourceSchema = z.strictObject({
  id: idString,
  name: z.string().min(1),
  kind: skillKindSchema,
  grade: gradeSourceSchema,
  standards: z.strictObject({
    ccss: z.array(z.string()),
    wi: z.array(z.string()).optional(),
    supports: z.array(z.string()).optional(),
  }),
  prerequisites: z.array(idString),
  encompasses: z.record(z.string(), z.number()).optional(),
  related: z.array(idString).optional(),
  gateway: z.boolean(),
  representations: z.array(representationSchema),
  fluency: z.strictObject({ medianLatencyMs: z.number().positive() }).optional(),
});
export type SkillSource = z.infer<typeof skillSourceSchema>;

export const skillsFileSchema = z.strictObject({
  strand: strandIdSchema,
  skills: z.array(skillSourceSchema),
});

// ---------- templates/<STRAND>.yaml (03 §4.3) ----------

export const templateSourceSchema = z.strictObject({
  id: idString,
  skillId: idString,
  format: itemFormatSchema,
  tier: tierSchema,
  representation: representationSchema.optional(),
  expectedLatencyMs: z.number().int().positive().optional(),
  generator: generatorIdSchema,
  params: z.record(z.string(), paramShorthandSchema).optional(),
  constraints: z.array(z.string().min(1)).optional(),
  difficulty: z.strictObject({
    base: z.number(),
    features: z.record(z.string(), z.number()).optional(),
  }),
  narration: z.strictObject({
    prompt: narrationKeySchema,
    hints: z.array(narrationKeySchema).min(1).max(3),
  }),
  distractors: z.array(z.strictObject({ rule: misconceptionIdSchema })).optional(),
});
export type TemplateSource = z.infer<typeof templateSourceSchema>;

export const templatesFileSchema = z.strictObject({
  strand: strandIdSchema,
  templates: z.array(templateSourceSchema),
});

// ---------- misconceptions/<area>.yaml (03 §4.4, §7.1) ----------

export const misconceptionSourceSchema = z.strictObject({
  id: misconceptionIdSchema,
  name: z.string().min(1),
  detect: z.strictObject({ kind: z.enum(['answer', 'state', 'process']), rule: z.string().min(1) }),
  appliesTo: z.strictObject({ generators: z.array(generatorIdSchema) }),
  skills: z.array(idString),
  remediation: z.array(idString),
  feedback: feedbackKeySchema,
  priority: z.number().optional(),
  parentTip: z.string().min(1),
  examples: z.array(
    z.strictObject({
      generator: generatorIdSchema.optional(),
      params: paramValuesSchema,
      response: responseValueSchema,
      meta: z
        .strictObject({
          latencyMs: z.number().min(0),
          trace: z.array(interactionEventSchema).optional(),
        })
        .optional(),
      match: z.boolean(),
    }),
  ),
});
export type MisconceptionSource = z.infer<typeof misconceptionSourceSchema>;

export const misconceptionsFileSchema = z.strictObject({
  area: z.string().regex(KEBAB_ID_PATTERN, 'expected a kebab-case area'),
  misconceptions: z.array(misconceptionSourceSchema),
});

// ---------- lessons/<STRAND>.yaml (03 §4.5, §6.1) ----------

const lessonStepSourceSchema = z.strictObject({
  actor: z.enum(['demo', 'child']),
  say: narrationKeySchema,
  vars: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  action: widgetActionSchema.strict().optional(),
  expect: z
    .union([
      z.strictObject({ op: z.string().min(1), args: z.record(z.string(), z.unknown()).optional() }),
      z.strictObject({ answer: z.literal(true) }),
    ])
    .optional(),
});

const lessonExampleSourceSchema = z.strictObject({
  templateId: idString.optional(),
  params: paramValuesSchema.optional(),
  seed: z.number().int().optional(),
  target: z.enum(['easy', 'typical']).optional(),
  steps: z.array(lessonStepSourceSchema).optional(),
  childSteps: z.number().int().min(1).optional(),
});
export type LessonExampleSource = z.infer<typeof lessonExampleSourceSchema>;

export const lessonSourceSchema = z.strictObject({
  skillId: idString,
  mode: z.enum(['authored', 'none']),
  templateId: idString,
  intro: narrationKeySchema.optional(),
  worked: z.array(lessonExampleSourceSchema).max(2),
  faded: z.array(lessonExampleSourceSchema).max(2).optional(),
  scaffolded: z
    .strictObject({
      count: z.number().int().min(0).max(4),
      hintStart: z.literal([1, 2, 3]),
    })
    .optional(),
  testOut: z
    .strictObject({
      items: z.number().int().min(0),
      minCorrect: z.number().int().min(0),
      templateIds: z.array(idString).optional(),
    })
    .optional(),
  outro: narrationKeySchema.optional(),
});
export type LessonSource = z.infer<typeof lessonSourceSchema>;

export const lessonsFileSchema = z.strictObject({
  strand: strandIdSchema,
  lessons: z.array(lessonSourceSchema),
});

// ---------- narration/*.yaml (03 §8.2) ----------

/** A narration file is a flat map of NarrationKey → entry. */
export const narrationFileSchema = z.record(z.string(), narrationEntrySchema.strict());

// ---------- contexts.yaml (03 §4.6) ----------

/**
 * A context's `situations` name a `SituationType` (02 §5.8 / 03 §5.5) or its family, the part
 * before the slash (`add-to` covers `add-to/result`, `add-to/change` and `add-to/start`).
 */
export const SITUATION_FAMILIES: readonly string[] = [
  ...new Set(SITUATION_TYPES.map((s) => s.split('/')[0] as string)),
];

export const storyContextSchema = z.strictObject({
  id: z.string().regex(KEBAB_ID_PATTERN, 'expected a kebab-case context id'),
  nouns: z.array(z.string().regex(KEBAB_ID_PATTERN, 'expected a kebab-case noun id')).min(1),
  place: z.string().min(1),
  verbs: z.record(z.string(), z.string().min(1)),
  situations: z.array(z.string().min(1)).min(1),
  maxQuantity: z.number().int().positive(),
});
/** One story context (03 §4.6), as written to `dist/contexts.json`. */
export type StoryContext = z.infer<typeof storyContextSchema>;

export const contextsFileSchema = z.strictObject({ contexts: z.array(storyContextSchema) });

export function isSituation(value: string): boolean {
  return (
    situationTypeSchema.safeParse(value).success || SITUATION_FAMILIES.includes(value as string)
  );
}

// ---------- graph.yaml, retired.yaml, standards/wi-exceptions.yaml, outlines.yaml ----------

export const graphFileSchema = z.strictObject({
  /** Skills allowed to have no prerequisites (V05). */
  roots: z.array(idString),
  /** Grades whose catalog is complete; V20 checks coverage only for these (03 §9.2). */
  coverageGrades: z.array(gradeSourceSchema),
  /**
   * Catalog ids (03 §3) this content set has not authored yet. V03 accepts a gap at a planned id
   * (unlike a retired id, it may be authored later). The C01 fixture plans ADD.02; K01 clears it.
   */
  plannedIds: z.array(idString).optional(),
});
export type GraphFile = { roots: string[]; coverageGrades: Grade[]; plannedIds: string[] };

export const retiredFileSchema = z.strictObject({
  skills: z.array(idString).optional(),
  templates: z.array(idString).optional(),
});

/** 03 §2.2 exception table: CCSS code → WI 2021 code, or null when WI has no counterpart. */
export const wiExceptionsFileSchema = z.strictObject({
  exceptions: z.record(z.string(), z.string().nullable()),
});

/** Shape outlines for `geo.compose` (stub; K01 fills it in for GEO.10/GEO.11/PUZ.03). */
export const outlinesFileSchema = z.strictObject({
  outlines: z.array(
    z.strictObject({
      id: z.string().regex(KEBAB_ID_PATTERN, 'expected a kebab-case outline id'),
      points: z.array(z.tuple([z.number(), z.number()])).min(3),
      pieces: z.array(z.string().min(1)).optional(),
    }),
  ),
});
