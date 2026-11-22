// Loads the compiled content at startup (02 §6: fetched as precached static assets, never bundled).
// `/content/index.json` names each file's URL (content-hashed in production builds; see
// apps/web/content-assets.ts). Offline, the service worker answers from its precache.

import { buildSkillGraph } from '@number-island/engine/shell';
import {
  gameDataSchema,
  itemTemplateSchema,
  type MisconceptionSpec,
  misconceptionSpecSchema,
  type NarrationJson,
  narrationJsonSchema,
  skillGraphSchema,
  skillSchema,
} from '@number-island/shared';
import type { StoreContent } from '@/data/projections';

export const CONTENT_INDEX_URL = '/content/index.json';

/** Files the app needs to start. `template-stats.json` is optional (written by content:validate). */
const REQUIRED_FILES = [
  'game.json',
  'graph.json',
  'narration.json',
  'skills.json',
  'templates.json',
  'misconceptions.json',
];
const OPTIONAL_FILES = ['template-stats.json'];

export interface AppContent {
  contentVersion: string;
  /** What the data store folds with (D01): game data and the skill graph. */
  store: StoreContent;
  /** `narration.json` for the AudioManager and narration text (02 §5.5). */
  narration: NarrationJson;
  /** `misconceptions.json`: the engine's item core checks answers against these (03 §7.1). */
  misconceptions: MisconceptionSpec[];
}

export type ContentErrorCode = 'unreachable' | 'invalid';

export class ContentLoadError extends Error {
  constructor(
    readonly code: ContentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ContentLoadError';
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface ContentIndex {
  contentVersion: string;
  files: Record<string, string>;
}

function parseIndex(value: unknown): ContentIndex {
  const v = value as Partial<ContentIndex> | null;
  if (
    !v ||
    typeof v.contentVersion !== 'string' ||
    v.contentVersion === '' ||
    !v.files ||
    typeof v.files !== 'object'
  ) {
    throw new ContentLoadError('invalid', `${CONTENT_INDEX_URL} is not a content index`);
  }
  const files: Record<string, string> = {};
  for (const [name, url] of Object.entries(v.files)) {
    if (typeof url !== 'string' || !url.startsWith('/content/')) {
      throw new ContentLoadError('invalid', `${CONTENT_INDEX_URL}: bad URL for ${name}`);
    }
    files[name] = url;
  }
  return { contentVersion: v.contentVersion, files };
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  } catch (e) {
    throw new ContentLoadError('unreachable', `could not fetch ${url}: ${String(e)}`);
  }
  if (!res.ok)
    throw new ContentLoadError('unreachable', `could not fetch ${url}: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new ContentLoadError('invalid', `${url} is not JSON`);
  }
}

function parse<T>(name: string, run: () => T): T {
  try {
    return run();
  } catch (e) {
    throw new ContentLoadError('invalid', `${name} failed validation: ${String(e)}`);
  }
}

/** Fetches and validates the content the app starts with. Throws `ContentLoadError`. */
export async function loadContent(fetchImpl: FetchLike = globalThis.fetch): Promise<AppContent> {
  const index = parseIndex(await getJson(fetchImpl, CONTENT_INDEX_URL));
  for (const name of REQUIRED_FILES) {
    if (!index.files[name]) {
      throw new ContentLoadError('invalid', `${CONTENT_INDEX_URL} does not list ${name}`);
    }
  }
  const wanted = [...REQUIRED_FILES, ...OPTIONAL_FILES.filter((n) => index.files[n])];
  const raw = Object.fromEntries(
    await Promise.all(
      wanted.map(async (name) => [name, await getJson(fetchImpl, index.files[name] as string)]),
    ),
  ) as Record<string, unknown>;

  const gameData = parse('game.json', () => gameDataSchema.parse(raw['game.json']));
  const narration = parse('narration.json', () => narrationJsonSchema.parse(raw['narration.json']));
  const skills = parse('skills.json', () => skillSchema.array().parse(raw['skills.json']));
  const templates = parse('templates.json', () =>
    itemTemplateSchema.array().parse(raw['templates.json']),
  );
  const misconceptions = parse('misconceptions.json', () =>
    misconceptionSpecSchema.array().parse(raw['misconceptions.json']),
  );
  const graph = parse('graph.json', () => {
    const g = raw['graph.json'] as Record<string, unknown> | null;
    const isRecord = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
    if (
      !isRecord(g) ||
      !['nodes', 'roots', 'gateways'].every((k) => Array.isArray(g?.[k])) ||
      !['depth', 'descendants2'].every((k) => isRecord(g?.[k]))
    ) {
      throw new Error('not a compiled skill graph');
    }
    return g as unknown as Parameters<typeof buildSkillGraph>[0]['graph'];
  });
  // Optional, but when the index lists it, it must be an object of per-template stats.
  const templateStats = parse('template-stats.json', () => {
    if (!('template-stats.json' in raw)) return undefined;
    const t = raw['template-stats.json'];
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new Error('not a stats object');
    return t as Parameters<typeof buildSkillGraph>[0]['templateStats'];
  });
  // Build, then check the result against the shared schema (depth maps, gateways, template stats).
  const skillGraph = parse('the skill graph', () =>
    skillGraphSchema.parse(
      buildSkillGraph({
        contentVersion: index.contentVersion,
        skills,
        templates,
        graph,
        ...(templateStats !== undefined ? { templateStats } : {}),
      }),
    ),
  );

  return {
    contentVersion: index.contentVersion,
    narration,
    misconceptions,
    store: { contentVersion: index.contentVersion, gameData, graph: skillGraph },
  };
}
