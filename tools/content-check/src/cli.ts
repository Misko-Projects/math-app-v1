// `pnpm content:validate`, engine half (03 §9.2): V13–V15, V22, V25, V27–V30 plus the engine parts of V04,
// V16, V17, V18 and V21. It writes nothing: `pnpm content:build` owns `dist/`, and this fails when
// the built `template-stats.json` is missing or is not the one the content gives (V24).

import { propertyN } from '@number-island/engine/testing';
import { runEngineChecks } from './checks';
import { readCompiled, readDistText } from './dist';
import { staleStatsDiagnostic, TEMPLATE_STATS_FILE } from './stats';

function main(): number {
  const started = performance.now();
  const input = readCompiled();
  const n = propertyN(100);
  const { diagnostics, templateStats } = runEngineChecks(input, { propertyN: n });
  const stale = staleStatsDiagnostic(templateStats, readDistText(TEMPLATE_STATS_FILE));
  if (stale) diagnostics.push(stale);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warn');
  for (const d of [...errors, ...warnings]) {
    const line = `${d.severity === 'error' ? 'error' : 'warn '} ${d.check} ${d.file}${d.path ? ` › ${d.path}` : ''}: ${d.message}`;
    (d.severity === 'error' ? console.error : console.warn)(line);
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `content-check (engine checks V13–V15, V22, V25, V27–V30; ${input.templates.length} templates, ${n} property seeds each): ${errors.length} error(s), ${warnings.length} warning(s) in ${seconds}s`,
  );
  return errors.length > 0 ? 1 : 0;
}

process.exitCode = main();
