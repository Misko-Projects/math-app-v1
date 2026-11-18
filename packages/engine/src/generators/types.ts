// 03 §5.3 generator contract. These are engine-internal shapes: generators live only in
// packages/engine, and tools/content-check reads them through the engine's hooks (03 §9.3).

import type {
  AnswerSpec,
  GeneratorId,
  HintStep,
  ItemFormat,
  ItemTemplate,
  LessonStep,
  NarrationKey,
  ParamSpec,
  ParamValues,
  ResponseValue,
  WidgetConfig,
} from '@number-island/shared';
import type { Rng } from '../rng';

export interface ParamDecl {
  type: 'int' | 'string' | 'bool';
  /** For `string` params: the closed set of values. */
  values?: string[];
  default: ParamSpec;
  doc: string;
}

export interface BuildContext {
  params: ParamValues;
  template: ItemTemplate;
  rng: Rng;
}

export interface GeneratorOutput {
  /** Resolved and derived params, logged in AttemptPayload.params. */
  params: ParamValues;
  /** Prompt (and hint) variables (03 §8.4). */
  vars: Record<string, string | number>;
  /** `widget.format` equals `template.format`. */
  widget: WidgetConfig;
  answer: AnswerSpec;
  /** Levels 1–5 (03 §5.8). */
  hints: HintStep[];
  /** Raw, unweighted feature values. The easiest item of its kind has every feature at 0. */
  features: Record<string, number>;
}

export interface GeneratorDef {
  id: GeneratorId;
  formats: ItemFormat[];
  params: Record<string, ParamDecl>;
  /** Names it exposes to constraints (e.g. `result`). */
  derived?: string[];
  /** Default weights for the math features (03 §5.6). Format features come from FORMAT_FEATURES. */
  features: Record<string, { weight: number; doc: string }>;
  /** Shared narration keys it emits (V16 checks they exist). */
  narration: NarrationKey[];
  sample(spec: Record<string, ParamSpec>, rng: Rng): ParamValues;
  derive(p: ParamValues): ParamValues;
  /**
   * Engine extension: validity the generator needs beyond the template's constraints (a fact
   * with a negative result, a part larger than its whole). Rejected draws are sampled again,
   * exactly like a failed constraint.
   */
  accepts?(p: ParamValues, template: ItemTemplate): boolean;
  sampleToward?(
    spec: Record<string, ParamSpec>,
    rng: Rng,
    target: number,
    weights: Record<string, number>,
  ): ParamValues;
  /** Deterministic given params, template and rng. */
  build(ctx: BuildContext): GeneratorOutput;
  /** A correct response (tests, lesson demos). */
  exampleCorrect(out: GeneratorOutput): ResponseValue;
  /** Narrated worked solution (hint level 5, lessons). Replays to a correct response. */
  solution(out: GeneratorOutput): LessonStep[];
}

export type GeneratorFn = (
  spec: Record<string, ParamSpec>,
  rng: Rng,
  target?: { difficulty: number },
  template?: ItemTemplate,
) => GeneratorOutput;

/** Thrown when no candidate satisfies a template's constraints (V15 reports it). */
export class GenerationError extends Error {
  constructor(
    readonly templateId: string,
    readonly seed: number,
    detail?: string,
  ) {
    super(
      `could not generate an item for ${templateId} with seed ${seed}${detail ? `: ${detail}` : ''}`,
    );
    this.name = 'GenerationError';
  }
}
