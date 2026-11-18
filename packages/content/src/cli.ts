// `pnpm content:build` and `pnpm content:validate` (03 §9.1, §9.2).
import { compileContent } from './compile/compile';
import { formatDiagnostic } from './diagnostics';
import { readContentFiles, readDist, writeDist } from './fs';
import { validateContent } from './validate';

const ENGINE_CHECKS_NOTICE =
  'engine checks (V13–V15, V22, V25) run next in tools/content-check (`pnpm content:validate` runs both)';

function main(command: string | undefined): number {
  const files = readContentFiles();
  if (command === 'build') {
    const result = compileContent(files);
    for (const d of result.diagnostics.filter((x) => x.severity === 'error'))
      console.error(formatDiagnostic(d));
    if (!result.outputs) {
      console.error(
        `content:build failed with ${result.diagnostics.filter((x) => x.severity === 'error').length} error(s); run pnpm content:validate for warnings too.`,
      );
      return 1;
    }
    writeDist(result.outputs);
    const counts = result.content;
    console.log(
      `content:build ok: contentVersion ${result.contentVersion} (${counts?.skills.length} skills, ${counts?.templates.length} templates, ${counts?.misconceptions.length} misconceptions, ${Object.keys(counts?.narration ?? {}).length} narration keys) → packages/content/dist/`,
    );
    return 0;
  }
  if (command === 'validate') {
    const { result, diagnostics } = validateContent(files, readDist());
    const errors = diagnostics.filter((d) => d.severity === 'error');
    const warnings = diagnostics.filter((d) => d.severity === 'warn');
    for (const d of [...errors, ...warnings])
      (d.severity === 'error' ? console.error : console.warn)(formatDiagnostic(d));
    console.log(
      `content:validate (compiler checks V01–V12, V16–V21, V23, V24, V26): ${errors.length} error(s), ${warnings.length} warning(s)${result.contentVersion ? `, contentVersion ${result.contentVersion}` : ''}`,
    );
    console.log(ENGINE_CHECKS_NOTICE);
    return errors.length > 0 ? 1 : 0;
  }
  console.error('usage: tsx src/cli.ts <build|validate>');
  return 2;
}

process.exitCode = main(process.argv[2]);
