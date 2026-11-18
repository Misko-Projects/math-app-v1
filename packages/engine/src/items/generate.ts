// 03 §5.3 `generateItem(t, seed, target?)` (02 §5.2), implemented once for every generator, and
// `itemKey` for repeat avoidance.

import { canonicalJson } from '@number-island/content/canonical';
import type { GeneratedItem, ItemTemplate, ParamSpec, ParamValues } from '@number-island/shared';
import { boundTemplateStats } from '../content/binding';
import { constraintHolds } from '../content/expr';
import { render } from '../content/render';
import { registry } from '../generators';
import { GenerationError, type GeneratorDef, type GeneratorOutput } from '../generators/types';
import { createRng } from '../rng';
import { devLog } from './devlog';
import { difficulty, resolvedWeights } from './difficulty';

export const CANDIDATES_WITH_TARGET = 24;
export const REJECTION_TRIES = 200;

/** Generator param defaults overridden by the template's params (03 §5.3). */
export function mergedSpec(t: ItemTemplate, g: GeneratorDef): Record<string, ParamSpec> {
  const spec: Record<string, ParamSpec> = {};
  for (const [name, decl] of Object.entries(g.params)) spec[name] = decl.default;
  return { ...spec, ...t.params };
}

function accepted(t: ItemTemplate, g: GeneratorDef, p: ParamValues): boolean {
  if (g.accepts && !g.accepts(p, t)) return false;
  return (t.constraints ?? []).every((c) => constraintHolds(c, p));
}

export function requireGenerator(t: ItemTemplate): GeneratorDef {
  const g = registry.get(t.generator);
  if (!g) throw new GenerationError(t.id, 0, `generator ${t.generator} is not registered`);
  if (!g.formats.includes(t.format)) {
    throw new GenerationError(t.id, 0, `generator ${t.generator} does not build ${t.format}`);
  }
  return g;
}

interface Candidate {
  i: number;
  out: GeneratorOutput;
  d: number;
}

export function generateItem(
  t: ItemTemplate,
  seed: number,
  target?: { difficulty: number },
): GeneratedItem {
  const g = requireGenerator(t);
  const root = createRng(seed).fork(t.id);
  const spec = mergedSpec(t, g);
  const weights = resolvedWeights(t, g);
  const n = target ? CANDIDATES_WITH_TARGET : 1;
  const candidates: Candidate[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = root.fork(`c${i}`);
    let params: ParamValues | null = null;
    for (let k = 0; k < REJECTION_TRIES; k += 1) {
      const raw =
        target && g.sampleToward && i % 2 === 1
          ? g.sampleToward(spec, r, target.difficulty, weights)
          : g.sample(spec, r);
      const p = { ...raw, ...g.derive(raw) };
      if (accepted(t, g, p)) {
        params = p;
        break;
      }
    }
    if (!params) continue;
    const out = g.build({ params, template: t, rng: r.fork('build') });
    candidates.push({ i, out, d: difficulty(t, g, out.features) });
  }
  if (candidates.length === 0) {
    throw new GenerationError(t.id, seed, 'no draw satisfied the constraints');
  }
  let best = candidates[0] as Candidate;
  if (target) {
    for (const c of candidates) {
      if (Math.abs(c.d - target.difficulty) < Math.abs(best.d - target.difficulty)) best = c;
    }
    const stats = boundTemplateStats()[t.id];
    if (stats && (target.difficulty < stats.p10 || target.difficulty > stats.p90)) {
      devLog({
        event: 'difficulty.miss',
        templateId: t.id,
        seed,
        target: target.difficulty,
        difficulty: best.d,
      });
    }
  }
  const out = best.out;
  return {
    templateId: t.id,
    skillId: t.skillId,
    seed,
    format: t.format,
    tier: t.tier,
    params: out.params,
    prompt: {
      narration: t.narration.prompt,
      vars: out.vars,
      text: render(t.narration.prompt, out.vars),
    },
    widget: out.widget,
    answer: out.answer,
    hints: out.hints,
    difficulty: best.d,
  };
}

/**
 * Builds an item from fixed params (authored lesson examples, 03 §6.1; misconception examples,
 * V18). Params the caller does not give are drawn from `seed` as usual. Throws GenerationError
 * when the generator rejects the params, or when `checkConstraints` is set and a template
 * constraint fails.
 */
export function generateItemFromParams(
  t: ItemTemplate,
  params: Readonly<ParamValues>,
  opts: { seed?: number; checkConstraints?: boolean } = {},
): GeneratedItem {
  const fixed: ItemTemplate = {
    ...t,
    params: {
      ...t.params,
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, { kind: 'const' as const, value: v }]),
      ),
    },
    constraints: opts.checkConstraints ? t.constraints : [],
  };
  return generateItem(fixed, opts.seed ?? 0);
}

/**
 * The raw features of a generated item (rebuilt from its params; layout randomness never changes
 * a feature value). Used by validation (V13) and the property test (step 8).
 */
export function itemFeatures(item: GeneratedItem, t: ItemTemplate): Record<string, number> {
  const g = requireGenerator(t);
  return g.build({ params: item.params, template: t, rng: createRng(item.seed).fork('features') })
    .features;
}

/** Identifies repeats: the template plus its canonical params (03 §5.3). */
export function itemKey(item: Pick<GeneratedItem, 'templateId' | 'params'>): string {
  return `${item.templateId}:${canonicalJson(item.params)}`;
}

/**
 * The generator output behind an item, rebuilt deterministically (lesson demos and the property
 * test need `exampleCorrect` and `solution`, which read the output, not the item).
 */
export function itemOutput(item: GeneratedItem): GeneratorOutput {
  return {
    params: item.params,
    vars: item.prompt.vars,
    widget: item.widget,
    answer: item.answer,
    hints: item.hints,
    features: {},
  };
}
