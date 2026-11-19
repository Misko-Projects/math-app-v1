/// <reference types="node" />
// Test helper: compile the fixture content in memory (the same compiler `pnpm content:build`
// runs) and bind it to the engine, so the tests never depend on a previous build of
// packages/content/dist.

import { compileContent, formatDiagnostic } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import type {
  GameData,
  ItemTemplate,
  MisconceptionSpec,
  NarrationJson,
  Skill,
  SkillGraph,
} from '@number-island/shared';
import { initContent } from '../src/content/binding';
import { buildSkillGraph } from '../src/learner/graph';

export interface FixtureContent {
  skills: Skill[];
  templates: ItemTemplate[];
  narration: NarrationJson;
  misconceptions: MisconceptionSpec[];
}

let cached: FixtureContent | null = null;
let compiled: ReturnType<typeof compileContent> | null = null;

/**
 * The one in-memory compile of the live content that every helper below reads, so a test file
 * that uses the fixture, its graph and its game data compiles the catalog once, not three times.
 */
function liveCompile(): ReturnType<typeof compileContent> {
  compiled ??= compileContent(readContentFiles());
  return compiled;
}

/** The compiled fixture, parsed from the exact `dist/` bytes the compiler would write. */
export function compileFixture(): FixtureContent {
  if (cached) return cached;
  const result = liveCompile();
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

let cachedGraph: SkillGraph | null = null;

/** The fixture's 02 §5.8 SkillGraph and GameData, built from the same in-memory compile. */
export function fixtureGraph(): SkillGraph {
  if (cachedGraph) return cachedGraph;
  const result = liveCompile();
  if (!result.content || !result.contentVersion)
    throw new Error('the fixture content does not compile');
  cachedGraph = buildSkillGraph({
    contentVersion: result.contentVersion,
    skills: result.content.skills,
    templates: result.content.templates,
    graph: result.content.graph,
  });
  return cachedGraph;
}

export function fixtureGameData(): GameData {
  const result = liveCompile();
  if (!result.content) throw new Error('the fixture content does not compile');
  // A fresh copy per call, as before the compile was shared: a test may edit what it gets.
  return structuredClone(result.content.game);
}

export interface CompiledContent {
  content: FixtureContent;
  graph: SkillGraph;
  game: GameData;
}

const byRoot = new Map<string, CompiledContent>();

/**
 * Compile the content under `root` (a directory laid out like packages/content), once per root.
 * The golden replay uses a frozen copy (test/golden/content) so live curriculum changes never
 * move its snapshot.
 */
export function compileContentAt(root: string): CompiledContent {
  const hit = byRoot.get(root);
  if (hit) return hit;
  const result = compileContent(readContentFiles(root));
  if (!result.outputs || !result.content || !result.contentVersion) {
    const errors = result.diagnostics.filter((d) => d.severity === 'error').map(formatDiagnostic);
    throw new Error(`the content at ${root} does not compile:\n${errors.join('\n')}`);
  }
  const read = <T>(name: string): T => JSON.parse(result.outputs?.[name] ?? 'null') as T;
  const out: CompiledContent = {
    content: {
      skills: read<Skill[]>('skills.json'),
      templates: read<ItemTemplate[]>('templates.json'),
      narration: read<NarrationJson>('narration.json'),
      misconceptions: read<MisconceptionSpec[]>('misconceptions.json'),
    },
    graph: buildSkillGraph({
      contentVersion: result.contentVersion,
      skills: result.content.skills,
      templates: result.content.templates,
      graph: result.content.graph,
    }),
    game: result.content.game,
  };
  byRoot.set(root, out);
  return out;
}

export function fixtureTemplate(id: string): ItemTemplate {
  const t = loadFixture().templates.find((x) => x.id === id);
  if (!t) throw new Error(`no fixture template ${id}`);
  return t;
}
