// 03 §9.3 generator hooks for tools/content-check. (`runTemplateProperties` and `difficultyStats`
// live in the `@number-island/engine/testing` entry, which needs fast-check.)

import type { GeneratorId, ItemFormat } from '@number-island/shared';
import { formatFeatures } from './formats';
import { registry } from './generators';
import type { ParamDecl } from './generators/types';

export function generatorRegistered(id: GeneratorId, format: ItemFormat): boolean {
  return registry.get(id)?.formats.includes(format) ?? false;
}

export function generatorParams(id: GeneratorId): Record<string, ParamDecl> {
  return { ...(registry.get(id)?.params ?? {}) };
}

/** Resolved default weights: the generator's math features over the format's features. */
export function generatorFeatures(id: GeneratorId, format: ItemFormat): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [f, { weight }] of Object.entries(formatFeatures(format))) out[f] = weight;
  for (const [f, { weight }] of Object.entries(registry.get(id)?.features ?? {})) out[f] = weight;
  return out;
}

/** Names a constraint may use for a generator: its params plus its derived names. */
export function generatorIdentifiers(id: GeneratorId): string[] {
  const g = registry.get(id);
  return g ? [...Object.keys(g.params), ...(g.derived ?? [])] : [];
}
