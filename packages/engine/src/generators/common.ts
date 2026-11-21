// Helpers shared by the reference generators: ParamSpec sampling (03 §5.2), numeric pick options
// with diagnostic distractors (03 §5.1, §5.5 numeral-pick), prompt vars, and output assembly.

import type {
  AnswerSpec,
  GeneratedItem,
  ItemTemplate,
  ParamSpec,
  ParamValue,
  ParamValues,
  StimulusSpec,
  WidgetAction,
  WidgetConfig,
} from '@number-island/shared';
import { boundMisconceptions, boundNarration, hasBoundNarration } from '../content/binding';
import { lineSlots } from '../content/render';
import { formatFeatureValues } from '../formats';
import { numberOptionId, responseNumber } from '../formats/numeral-pick';
import { buildHints } from '../items/hints';
import { misconceptionRule } from '../misconceptions';
import type { Rng } from '../rng';
import type { BuildContext, GeneratorDef, GeneratorOutput } from './types';

// ---------- ParamSpec domains and sampling ----------

/** Every value an `int` spec allows, in ascending order (capped for safety). */
export function intDomain(s: Extract<ParamSpec, { kind: 'int' }>, cap = 100_000): number[] {
  const step = s.step ?? 1;
  const out: number[] = [];
  const excluded = new Set(s.exclude ?? []);
  for (let v = s.min; v <= s.max && out.length < cap; v += step) if (!excluded.has(v)) out.push(v);
  return out;
}

/** The finite value set of a spec (int, choice, bool, const). */
export function specDomain(s: ParamSpec): ParamValue[] {
  switch (s.kind) {
    case 'int':
      return intDomain(s);
    case 'choice':
      return [...s.values];
    case 'bool':
      return s.p <= 0 ? [false] : s.p >= 1 ? [true] : [false, true];
    case 'const':
      return [s.value];
  }
}

/** True when `v` lies in the spec's domain (03 §9.4 step 2). */
export function inDomain(s: ParamSpec, v: ParamValue): boolean {
  switch (s.kind) {
    case 'int': {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < s.min || v > s.max) return false;
      if ((s.exclude ?? []).includes(v)) return false;
      return (v - s.min) % (s.step ?? 1) === 0;
    }
    case 'choice':
      return s.values.includes(v);
    case 'bool':
      return typeof v === 'boolean' && (v ? s.p > 0 : s.p < 1);
    case 'const':
      return s.value === v;
  }
}

export function sampleSpec(s: ParamSpec, rng: Rng): ParamValue {
  switch (s.kind) {
    case 'int': {
      const step = s.step ?? 1;
      const excluded = new Set(s.exclude ?? []);
      const count = Math.floor((s.max - s.min) / step) + 1;
      // Rejection over the stepped range; the schema guarantees the set is non-empty.
      for (let i = 0; i < 64; i += 1) {
        const v = s.min + step * rng.int(0, count - 1);
        if (!excluded.has(v)) return v;
      }
      return rng.pick(intDomain(s));
    }
    case 'choice':
      return s.weights ? rng.weighted(s.values, s.weights) : rng.pick(s.values);
    case 'bool':
      return rng.bool(s.p);
    case 'const':
      return s.value;
  }
}

/** Draw every param of a merged spec, in sorted key order so the stream is stable. */
export function sampleAll(spec: Record<string, ParamSpec>, rng: Rng): ParamValues {
  const out: ParamValues = {};
  for (const key of Object.keys(spec).sort()) out[key] = sampleSpec(spec[key] as ParamSpec, rng);
  return out;
}

export const asNum = (v: ParamValue | undefined, fallback = 0): number =>
  typeof v === 'number' ? v : fallback;
export const asStr = (v: ParamValue | undefined, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

// ---------- sprites, layout seeds ----------

export const DEFAULT_SPRITES = ['shell', 'fish', 'starfish', 'crab', 'leaf'] as const;

export function layoutSeed(rng: Rng): number {
  return rng.fork('layout-seed').int(0, 0x7fffffff);
}

// ---------- numeric pick options ----------

/** A provisional item (number answer) that misconception rules can read to predict a response. */
function provisionalItem(t: ItemTemplate, params: ParamValues, value: number): GeneratedItem {
  return {
    templateId: t.id,
    skillId: t.skillId,
    seed: 0,
    format: 'number-pad',
    tier: t.tier,
    params,
    prompt: { narration: t.narration.prompt, vars: {}, text: '' },
    widget: {
      format: 'number-pad',
      stimulus: { kind: 'none' },
      blanks: [{ id: 'x', maxDigits: 3 }],
    },
    answer: { kind: 'number', value },
    hints: [],
    difficulty: 0,
  };
}

/** Numbers the template's diagnostic distractor rules predict for this item (03 §7.1). */
export function diagnosticNumbers(t: ItemTemplate, params: ParamValues, value: number): number[] {
  const out: number[] = [];
  const specs = boundMisconceptions();
  for (const d of t.distractors ?? []) {
    const spec = specs.find((s) => s.id === d.rule);
    const rule = spec ? misconceptionRule(spec.detect.rule) : undefined;
    const r = rule?.predict?.(provisionalItem(t, params, value));
    const n = r ? responseNumber(r) : null;
    if (n !== null && n !== value && !out.includes(n)) out.push(n);
  }
  return out;
}

const reverseDigits = (n: number): number => Number(String(n).split('').reverse().join(''));

export interface NumberOptions {
  options: { id: string; label: string }[];
  diagnostic: number;
}

/**
 * Three to five distinct numeric options (≥ 4 when the template lists distractors): the answer,
 * diagnostic distractors first, then near misses (±1, ±10, digit reversal), shuffled with the
 * item's layout stream.
 */
export function numberOptions(
  t: ItemTemplate,
  params: ParamValues,
  value: number,
  rng: Rng,
  min = 0,
  max = Number.POSITIVE_INFINITY,
): NumberOptions {
  const want = (t.distractors?.length ?? 0) > 0 ? 4 : 3;
  const picked: number[] = [value];
  const add = (n: number) => {
    if (picked.length < want && Number.isInteger(n) && n >= min && n <= max && !picked.includes(n))
      picked.push(n);
  };
  const diag = diagnosticNumbers(t, params, value).filter((n) => n >= min && n <= max);
  for (const n of diag) add(n);
  const diagnostic = picked.length - 1;
  for (const n of [value + 1, value - 1, value + 10, value - 10, reverseDigits(value)]) add(n);
  for (let k = 2; picked.length < want; k += 1) {
    add(value + k);
    add(value - k);
  }
  const shuffled = rng.fork('layout').shuffle(picked);
  return {
    options: shuffled.map((n) => ({ id: numberOptionId(n), label: String(n) })),
    diagnostic,
  };
}

// ---------- vars ----------

/**
 * Prompt and hint vars: only the values the template's lines actually use, so answer-valued
 * names never reach the UI unless a line needs them. Without bound narration, every value is kept.
 */
export function pickVars(
  t: ItemTemplate,
  pool: Record<string, string | number>,
): Record<string, string | number> {
  const narration = boundNarration();
  if (!hasBoundNarration()) return { ...pool };
  const used = new Set<string>();
  for (const key of [t.narration.prompt, ...t.narration.hints]) {
    for (const s of lineSlots(key, narration)) used.add(s);
  }
  const out: Record<string, string | number> = {};
  for (const k of Object.keys(pool).sort()) if (used.has(k)) out[k] = pool[k] as string | number;
  return out;
}

// ---------- output assembly ----------

export interface PartialOutput {
  params: ParamValues;
  vars: Record<string, string | number>;
  widget: WidgetConfig;
  answer: AnswerSpec;
  /** Math feature values (raw). Format features are added automatically; generator values win. */
  math: Record<string, number>;
  overlay?: StimulusSpec;
  nudge?: WidgetAction[];
  highlight?: WidgetAction[];
}

/** Adds format features and the hint ladder (built from the generator's own solution). */
export function finish(g: GeneratorDef, ctx: BuildContext, p: PartialOutput): GeneratorOutput {
  const features = { ...formatFeatureValues(p.widget, p.answer), ...p.math };
  const out: GeneratorOutput = {
    params: p.params,
    vars: p.vars,
    widget: p.widget,
    answer: p.answer,
    hints: [],
    features,
  };
  const solution = g.solution(out);
  out.hints = buildHints({
    template: ctx.template,
    vars: p.vars,
    solution,
    ...(p.overlay ? { overlay: p.overlay } : {}),
    ...(p.nudge ? { nudge: p.nudge } : {}),
    ...(p.highlight ? { highlight: p.highlight } : {}),
  });
  return out;
}

/** A ten-frame picture of a quantity (hint overlays). */
export function tenFrameOverlay(n: number, split?: [number, number]): StimulusSpec {
  const frames: 1 | 2 = n > 10 ? 2 : 1;
  const filled = frames === 2 ? [10, Math.min(10, n - 10)] : [Math.max(0, n)];
  if (!split) return { kind: 'ten-frame', frames, filled };
  const colors: ('a' | 'b')[][] = filled.map((count, f) =>
    Array.from({ length: count }, (_, i) => (f * 10 + i < split[0] ? 'a' : 'b')),
  );
  return { kind: 'ten-frame', frames, filled, colors };
}

/** A generic exampleCorrect for single-number answers and choices. */
export function correctFromAnswer(
  answer: AnswerSpec,
): import('@number-island/shared').ResponseValue {
  switch (answer.kind) {
    case 'number':
      return { kind: 'number', value: answer.value };
    case 'numbers':
      return { kind: 'numbers', values: [...answer.values] };
    case 'choice':
      return { kind: 'choice', id: answer.id };
    case 'placement':
      return { kind: 'placement', value: answer.value };
    case 'state':
      throw new Error('state answers need a generator-specific example');
  }
}
