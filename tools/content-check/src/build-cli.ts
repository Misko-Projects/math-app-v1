// `pnpm content:build`: see ./build.ts.

import { readContentFiles, writeDist } from '@number-island/content/node';
import { buildContent } from './build';

function main(): number {
  const started = performance.now();
  const built = buildContent(readContentFiles());
  if (!built.ok) {
    for (const line of built.errors) console.error(line);
    console.error(
      `content:build failed with ${built.errors.length} error(s); run pnpm content:validate for warnings too.`,
    );
    return 1;
  }
  writeDist(built.outputs);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`content:build ok in ${seconds}s: ${built.summary} → packages/content/dist/`);
  return 0;
}

process.exitCode = main();
