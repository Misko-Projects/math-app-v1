// `template-stats.json` (03 §5.4, §9.1): per-template difficulty statistics. A build output, so it
// is a function of the compiled content alone: a fixed seed set, never `CONTENT_PROPERTY_N`, and
// never whether `pnpm content:validate` ran. A seeded lesson example aims at these numbers
// (03 §6.1), so every build of the same content must ship the same bytes.

import { initContent, resetContent } from '@number-island/engine';
import { type DifficultyStats, difficultyStats } from '@number-island/engine/testing';
import type { ItemTemplate, MisconceptionSpec, NarrationJson } from '@number-island/shared';

/** Seeds 1 … 500 per template (03 §5.4). Changing this changes shipped lesson examples. */
export const TEMPLATE_STATS_SEEDS = 500;

export const TEMPLATE_STATS_FILE = 'template-stats.json';

export type TemplateStats = Record<string, DifficultyStats>;

export interface StatsInput {
  templates: ItemTemplate[];
  misconceptions: MisconceptionSpec[];
  narration: NarrationJson;
}

/**
 * The stats of every template. Throws, naming the template, when one cannot generate: a build
 * without stats for a template would ship other lesson examples than 03 §6.1 defines.
 */
export function computeTemplateStats(input: StatsInput): TemplateStats {
  initContent({
    templates: input.templates,
    narration: input.narration,
    misconceptions: input.misconceptions,
  });
  try {
    const stats: TemplateStats = {};
    for (const t of input.templates) {
      try {
        stats[t.id] = difficultyStats(t, TEMPLATE_STATS_SEEDS);
      } catch (e) {
        throw new Error(`${t.id}: ${(e as Error).message}`);
      }
    }
    return stats;
  } finally {
    resetContent();
  }
}

/** Canonical JSON (sorted keys) so the file is byte-stable across runs. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** The exact bytes of `dist/template-stats.json`. */
export function templateStatsText(stats: TemplateStats): string {
  return `${JSON.stringify(canonical(stats))}\n`;
}

/**
 * V24 for the stats: the built file must be exactly what the content gives (`computed` comes from
 * `runEngineChecks` at its default seed count, which is `TEMPLATE_STATS_SEEDS`).
 */
export function staleStatsDiagnostic(
  computed: TemplateStats,
  built: string | null,
): { check: 'V24'; severity: 'error'; file: string; path: string; message: string } | null {
  if (built === templateStatsText(computed)) return null;
  return {
    check: 'V24',
    severity: 'error',
    file: `dist/${TEMPLATE_STATS_FILE}`,
    path: '',
    message:
      built === null
        ? 'missing: run pnpm content:build'
        : 'does not match the content byte for byte; run pnpm content:build',
  };
}
