// Reads the compiled content from packages/content/dist (written by `pnpm content:build`).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileContent, formatDiagnostic } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import type { ItemTemplate, MisconceptionSpec, NarrationJson, Skill } from '@number-island/shared';
import type { CompiledInput } from './checks';

export const DIST_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/content/dist',
);

function read<T>(name: string): T {
  const file = join(DIST_DIR, name);
  if (!existsSync(file)) {
    throw new Error(`${file} is missing: run \`pnpm content:build\` first`);
  }
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function readCompiled(): CompiledInput {
  return {
    skills: read<Skill[]>('skills.json'),
    templates: read<ItemTemplate[]>('templates.json'),
    misconceptions: read<MisconceptionSpec[]>('misconceptions.json'),
    narration: read<NarrationJson>('narration.json'),
  };
}

/**
 * Compiles the content sources in memory, the same way `pnpm content:build` does (tests use this
 * so they never depend on a previous build).
 */
export function compileInMemory(): CompiledInput {
  const result = compileContent(readContentFiles());
  if (!result.outputs) {
    const errors = result.diagnostics.filter((d) => d.severity === 'error').map(formatDiagnostic);
    throw new Error(`the content does not compile:\n${errors.join('\n')}`);
  }
  const outputs = result.outputs;
  const parse = <T>(name: string): T => JSON.parse(outputs[name] ?? 'null') as T;
  return {
    skills: parse<Skill[]>('skills.json'),
    templates: parse<ItemTemplate[]>('templates.json'),
    misconceptions: parse<MisconceptionSpec[]>('misconceptions.json'),
    narration: parse<NarrationJson>('narration.json'),
  };
}

/** The exact bytes of a built `dist/` file, or null when it is not there. */
export function readDistText(name: string): string | null {
  const file = join(DIST_DIR, name);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}
