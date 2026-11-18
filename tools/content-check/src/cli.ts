// `pnpm content:validate`, engine half (03 §9.2): V13–V15, V22, V25 plus the engine parts of V04,
// V16, V17, V18 and V21, then writes packages/content/dist/template-stats.json.

import { propertyN } from '@number-island/engine/testing';
import { runEngineChecks } from './checks';
import { readCompiled, writeDistJson } from './dist';

function main(): number {
  const started = performance.now();
  const input = readCompiled();
  const n = propertyN(100);
  const { diagnostics, templateStats } = runEngineChecks(input, { propertyN: n });
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warn');
  for (const d of [...errors, ...warnings]) {
    const line = `${d.severity === 'error' ? 'error' : 'warn '} ${d.check} ${d.file}${d.path ? ` › ${d.path}` : ''}: ${d.message}`;
    (d.severity === 'error' ? console.error : console.warn)(line);
  }
  const file = writeDistJson('template-stats.json', templateStats);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `content-check (engine checks V13–V15, V22, V25; ${input.templates.length} templates, ${n} property seeds each): ${errors.length} error(s), ${warnings.length} warning(s) in ${seconds}s; wrote ${file}`,
  );
  return errors.length > 0 ? 1 : 0;
}

process.exitCode = main();
