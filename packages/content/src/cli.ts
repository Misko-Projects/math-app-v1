// `pnpm content:validate`, compiler half (03 §9.2). `pnpm content:build` lives in
// tools/content-check (src/build.ts): it also writes `template-stats.json`, which needs the engine.
import { formatDiagnostic } from './diagnostics';
import { readContentFiles, readDist } from './fs';
import { validateContent } from './validate';

const ENGINE_CHECKS_NOTICE =
  'engine checks (V13–V15, V22, V25) run next in tools/content-check (`pnpm content:validate` runs both)';

function main(command: string | undefined): number {
  if (command !== 'validate') {
    console.error('usage: tsx src/cli.ts validate (to build: pnpm content:build)');
    return 2;
  }
  const { result, diagnostics } = validateContent(readContentFiles(), readDist());
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

process.exitCode = main(process.argv[2]);
