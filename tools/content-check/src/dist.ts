// Reads the compiled content from packages/content/dist (written by `pnpm content:build`).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

export function writeDistJson(name: string, value: unknown): string {
  const file = join(DIST_DIR, name);
  writeFileSync(file, `${JSON.stringify(canonical(value))}\n`, 'utf8');
  return file;
}
