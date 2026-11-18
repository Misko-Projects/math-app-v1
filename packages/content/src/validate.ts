import { type CompileResult, compileContent, DIST_FILES } from './compile/compile';
import type { ContentFiles } from './compile/load';
import type { Diagnostic } from './diagnostics';

/**
 * `pnpm content:validate` compiler checks (03 §9.2): every finding from the compiler, plus V24
 * (building twice from the same input gives byte-identical output, and `dist/` matches the sources).
 */
export function validateContent(
  files: ContentFiles,
  dist: Readonly<Record<string, string>> | null,
): { result: CompileResult; diagnostics: Diagnostic[] } {
  const first = compileContent(files);
  const second = compileContent(files);
  const diagnostics = [...first.diagnostics];
  if (first.outputs && second.outputs) {
    for (const name of DIST_FILES) {
      if (first.outputs[name] !== second.outputs[name]) {
        diagnostics.push({
          check: 'V24',
          severity: 'error',
          file: `dist/${name}`,
          path: '',
          message: 'two builds of the same sources differ; the compiler is not deterministic',
        });
      }
    }
    if (dist) {
      const stale = DIST_FILES.filter((n) => dist[n] !== first.outputs?.[n]);
      const extra = Object.keys(dist).filter(
        (n) => !(DIST_FILES as readonly string[]).includes(n) && n !== 'template-stats.json',
      );
      for (const name of [...stale, ...extra]) {
        diagnostics.push({
          check: 'V24',
          severity: 'error',
          file: `dist/${name}`,
          path: '',
          message: stale.includes(name as (typeof DIST_FILES)[number])
            ? 'dist/ does not match the sources byte for byte; run pnpm content:build'
            : 'unexpected file in dist/; run pnpm content:build',
        });
      }
    }
  }
  return { result: first, diagnostics };
}
