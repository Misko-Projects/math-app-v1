/// <reference types="node" />
// Test helper: load the compiled fixture content (packages/content/dist, written by
// `pnpm content:build`, which `pnpm verify` runs before the tests) and bind it to the engine.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ItemTemplate, MisconceptionSpec, NarrationJson } from '@number-island/shared';
import { initContent } from '../src/content/binding';

export const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../content/dist');

export interface FixtureContent {
  templates: ItemTemplate[];
  narration: NarrationJson;
  misconceptions: MisconceptionSpec[];
}

function read<T>(name: string): T {
  const file = join(DIST, name);
  if (!existsSync(file)) {
    throw new Error(`${file} is missing: run \`pnpm content:build\` first`);
  }
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

let cached: FixtureContent | null = null;

export function loadFixture(): FixtureContent {
  cached ??= {
    templates: read<ItemTemplate[]>('templates.json'),
    narration: read<NarrationJson>('narration.json'),
    misconceptions: read<MisconceptionSpec[]>('misconceptions.json'),
  };
  initContent(cached);
  return cached;
}

export function fixtureTemplate(id: string): ItemTemplate {
  const t = loadFixture().templates.find((x) => x.id === id);
  if (!t) throw new Error(`no fixture template ${id}`);
  return t;
}
