// `pnpm content:build` (03 §9.1): compiles the YAML sources and writes `packages/content/dist/`,
// including `template-stats.json`. The stats need the engine, which `packages/content` never
// imports (02 §2), so the build command lives here. Everything is computed first and written in
// one step: a failed build leaves the previous `dist/` as it was.

import { compileContent, formatDiagnostic } from '@number-island/content';
import {
  computeTemplateStats,
  TEMPLATE_STATS_FILE,
  TEMPLATE_STATS_SEEDS,
  templateStatsText,
} from './stats';

export type BuildResult =
  | { ok: true; outputs: Record<string, string>; summary: string }
  | { ok: false; errors: string[] };

/** `dist/` file name → exact bytes for the given sources, or the error lines. */
export function buildContent(files: Readonly<Record<string, string>>): BuildResult {
  const result = compileContent(files);
  if (!result.outputs || !result.content) {
    return {
      ok: false,
      errors: result.diagnostics.filter((d) => d.severity === 'error').map(formatDiagnostic),
    };
  }
  const { skills, templates, misconceptions, narration } = result.content;
  let stats: string;
  try {
    stats = templateStatsText(computeTemplateStats({ templates, misconceptions, narration }));
  } catch (e) {
    return { ok: false, errors: [`${TEMPLATE_STATS_FILE}: ${(e as Error).message}`] };
  }
  return {
    ok: true,
    outputs: { ...result.outputs, [TEMPLATE_STATS_FILE]: stats },
    summary: `contentVersion ${result.contentVersion} (${skills.length} skills, ${templates.length} templates, ${misconceptions.length} misconceptions, ${Object.keys(narration).length} narration keys; template stats over ${TEMPLATE_STATS_SEEDS} seeds)`,
  };
}
