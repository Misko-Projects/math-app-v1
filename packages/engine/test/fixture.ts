/// <reference types="node" />
// Test helper: compile the fixture content in memory (the same compiler `pnpm content:build`
// runs) and bind it to the engine, so the tests never depend on a previous build of
// packages/content/dist.

import { compileContent, formatDiagnostic } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import type { ItemTemplate, MisconceptionSpec, NarrationJson, Skill } from '@number-island/shared';
import { initContent } from '../src/content/binding';

export interface FixtureContent {
  skills: Skill[];
  templates: ItemTemplate[];
  narration: NarrationJson;
  misconceptions: MisconceptionSpec[];
}

let cached: FixtureContent | null = null;

/** The compiled fixture, parsed from the exact `dist/` bytes the compiler would write. */
export function compileFixture(): FixtureContent {
  if (cached) return cached;
  const result = compileContent(readContentFiles());
  if (!result.outputs) {
    const errors = result.diagnostics.filter((d) => d.severity === 'error').map(formatDiagnostic);
    throw new Error(`the fixture content does not compile:\n${errors.join('\n')}`);
  }
  const read = <T>(name: string): T => JSON.parse(result.outputs?.[name] ?? 'null') as T;
  cached = {
    skills: read<Skill[]>('skills.json'),
    templates: read<ItemTemplate[]>('templates.json'),
    narration: read<NarrationJson>('narration.json'),
    misconceptions: read<MisconceptionSpec[]>('misconceptions.json'),
  };
  return cached;
}

export function loadFixture(): FixtureContent {
  const fixture = compileFixture();
  initContent(fixture);
  return fixture;
}

export function fixtureTemplate(id: string): ItemTemplate {
  const t = loadFixture().templates.find((x) => x.id === id);
  if (!t) throw new Error(`no fixture template ${id}`);
  return t;
}
