import {
  type GameData,
  type Grade,
  gameDataSchema,
  type NarrationEntry,
  type ParamSpec,
  paramSpecSchema,
} from '@number-island/shared';
import type { z } from 'zod';
import { type Diagnostics, formatPath } from '../diagnostics';
import {
  contextsFileSchema,
  graphFileSchema,
  type LessonSource,
  lessonsFileSchema,
  type MisconceptionSource,
  misconceptionsFileSchema,
  narrationFileSchema,
  outlinesFileSchema,
  type ParamShorthand,
  retiredFileSchema,
  type SkillSource,
  type StoryContext,
  skillsFileSchema,
  type TemplateSource,
  templatesFileSchema,
  wiExceptionsFileSchema,
} from '../schema/source';
import { parseWith, parseYaml, reportStrippedKeys, stripMeta } from './yaml';

/** Content sources as `relative/posix/path → file text` (from disk, or built in memory by tests). */
export type ContentFiles = Readonly<Record<string, string>>;

export interface Located<T> {
  file: string;
  /** YAML path of the entry, e.g. `skills[3]`. */
  path: string;
  value: T;
}

export interface LoadedTemplate extends Located<TemplateSource> {
  params: Record<string, ParamSpec>;
}

export interface LoadedContent {
  skills: (Located<SkillSource> & { strand: string })[];
  templates: (LoadedTemplate & { strand: string })[];
  lessons: (Located<LessonSource> & { strand: string })[];
  misconceptions: (Located<MisconceptionSource> & { area: string })[];
  narration: Map<string, Located<NarrationEntry>>;
  contexts: Located<StoryContext>[];
  graph: {
    file: string;
    roots: string[];
    coverageGrades: Grade[];
    plannedIds: string[];
    pendingGameSkills: string[];
  } | null;
  retired: { skills: Set<string>; templates: Set<string> };
  wiExceptions: Map<string, string | null>;
  ccssCodes: string[];
  wiCodes: string[];
  wordlistK1: Set<string>;
  wordlist2: Set<string>;
  denylist: Set<string>;
  game: GameData | null;
  gameFiles: string[];
  /** Where each merged game data entry was authored (diagnostics name the file, not `game/`). */
  gameOrigin: GameOrigin;
  outlines: { id: string }[];
}

export interface GameOrigin {
  /** section → merged index → the file and the index inside it. */
  sections: Record<string, { file: string; index: number }[]>;
  /** The file that defines `island`. */
  island: string | null;
}

const STRAND_FILE = /^(skills|templates|lessons)\/([A-Z]{2,4})\.yaml$/;
/** narration/voices.yaml holds voice choices (07 §3, A02), not narration lines. */
const NON_LINE_NARRATION = new Set(['narration/voices.yaml']);

/** The data files C01 requires (03 §4.1). Optional ones may be absent. */
const REQUIRED_FILES = [
  'graph.yaml',
  'contexts.yaml',
  'standards/ccss-codes.txt',
  'standards/wi-2021-codes.txt',
  'standards/wi-exceptions.yaml',
  'narration/wordlist-k1.txt',
  'narration/wordlist-2.txt',
  'narration/denylist.txt',
];

function textList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

/** 03 §5.2 shorthand → normalised ParamSpec (validated with the shared schema). */
export function normalizeParam(p: ParamShorthand): unknown {
  if (p === null || typeof p !== 'object') return { kind: 'const', value: p };
  if ('int' in p) {
    return {
      kind: 'int',
      min: p.int[0],
      max: p.int[1],
      ...(p.step !== undefined ? { step: p.step } : {}),
      ...(p.exclude !== undefined ? { exclude: p.exclude } : {}),
    };
  }
  if ('choice' in p) {
    return { kind: 'choice', values: p.choice, ...(p.weights ? { weights: p.weights } : {}) };
  }
  if ('bool' in p) return { kind: 'bool', p: p.bool };
  return { kind: 'const', value: p.const };
}

export function loadContent(files: ContentFiles, diags: Diagnostics): LoadedContent {
  const out: LoadedContent = {
    skills: [],
    templates: [],
    lessons: [],
    misconceptions: [],
    narration: new Map(),
    contexts: [],
    graph: null,
    retired: { skills: new Set(), templates: new Set() },
    wiExceptions: new Map(),
    ccssCodes: [],
    wiCodes: [],
    wordlistK1: new Set(),
    wordlist2: new Set(),
    denylist: new Set(),
    game: null,
    gameFiles: [],
    gameOrigin: { sections: {}, island: null },
    outlines: [],
  };

  for (const req of REQUIRED_FILES) {
    if (files[req] === undefined) diags.error('V01', req, '', 'required content file is missing');
  }

  const yamlOf = <T extends z.ZodType>(file: string, schema: T): z.infer<T> | undefined => {
    const raw = parseYaml(file, files[file] as string, diags);
    if (raw === undefined) return undefined;
    return parseWith(file, schema, stripMeta(file, raw, diags), diags);
  };

  const gameParts: { file: string; data: Record<string, unknown> }[] = [];

  for (const file of Object.keys(files).sort()) {
    if (file.startsWith('drafts/')) continue; // drafts are checked by `--drafts` (03 §10.3), not built
    const strandMatch = STRAND_FILE.exec(file);
    if (strandMatch) {
      const [, kind, fileStrand] = strandMatch;
      const checkStrand = (strand: string) => {
        if (strand !== fileStrand) {
          diags.error(
            'V02',
            file,
            'strand',
            `file is named for ${fileStrand} but declares strand: ${strand}`,
          );
        }
      };
      if (kind === 'skills') {
        const data = yamlOf(file, skillsFileSchema);
        if (!data) continue;
        checkStrand(data.strand);
        data.skills.forEach((value, i) => {
          out.skills.push({ file, path: formatPath(['skills', i]), value, strand: data.strand });
        });
      } else if (kind === 'templates') {
        const data = yamlOf(file, templatesFileSchema);
        if (!data) continue;
        checkStrand(data.strand);
        data.templates.forEach((value, i) => {
          const params: Record<string, ParamSpec> = {};
          let ok = true;
          for (const [name, shorthand] of Object.entries(value.params ?? {})) {
            const spec = parseWith(file, paramSpecSchema, normalizeParam(shorthand), diags, [
              'templates',
              i,
              'params',
              name,
            ]);
            if (spec) params[name] = spec;
            else ok = false;
          }
          if (!ok) return;
          out.templates.push({
            file,
            path: formatPath(['templates', i]),
            value,
            params,
            strand: data.strand,
          });
        });
      } else {
        const data = yamlOf(file, lessonsFileSchema);
        if (!data) continue;
        checkStrand(data.strand);
        data.lessons.forEach((value, i) => {
          out.lessons.push({ file, path: formatPath(['lessons', i]), value, strand: data.strand });
        });
      }
      continue;
    }
    if (/^(skills|templates|lessons)\//.test(file)) {
      diags.error(
        'V02',
        file,
        '',
        'strand files must be named <STRAND>.yaml, e.g. skills/ADD.yaml',
      );
      continue;
    }
    if (/^misconceptions\/[^/]+\.yaml$/.test(file)) {
      const data = yamlOf(file, misconceptionsFileSchema);
      if (!data) continue;
      const stem = file.slice('misconceptions/'.length, -'.yaml'.length);
      if (data.area !== stem) {
        diags.error(
          'V02',
          file,
          'area',
          `file is named for area '${stem}' but declares area: ${data.area}`,
        );
      }
      data.misconceptions.forEach((value, i) => {
        out.misconceptions.push({
          file,
          path: formatPath(['misconceptions', i]),
          value,
          area: data.area,
        });
      });
      continue;
    }
    if (/^narration\/[^/]+\.yaml$/.test(file)) {
      if (NON_LINE_NARRATION.has(file)) continue;
      const raw = parseYaml(file, files[file] as string, diags);
      if (raw === undefined) continue;
      const stripped = stripMeta(file, raw ?? {}, diags);
      const data = parseWith(file, narrationFileSchema, stripped, diags);
      if (!data) continue;
      for (const [key, entry] of Object.entries(data)) {
        const prev = out.narration.get(key);
        if (prev) {
          diags.error(
            'V02',
            file,
            formatPath([key]),
            `narration key is also defined in ${prev.file}`,
          );
          continue;
        }
        out.narration.set(key, { file, path: formatPath([key]), value: entry });
      }
      continue;
    }
    if (/^game\/[^/]+\.yaml$/.test(file)) {
      const raw = parseYaml(file, files[file] as string, diags);
      if (raw === undefined) continue;
      const stripped = stripMeta(file, raw, diags);
      if (stripped === null || typeof stripped !== 'object' || Array.isArray(stripped)) {
        diags.error('V01', file, '', 'a game data file is a map of GameData sections (02 §5.8)');
        continue;
      }
      gameParts.push({ file, data: stripped as Record<string, unknown> });
      out.gameFiles.push(file);
      continue;
    }
    switch (file) {
      case 'graph.yaml': {
        const data = yamlOf(file, graphFileSchema);
        if (data) {
          out.graph = {
            file,
            roots: data.roots,
            coverageGrades: data.coverageGrades,
            plannedIds: data.plannedIds ?? [],
            pendingGameSkills: data.pendingGameSkills ?? [],
          };
        }
        break;
      }
      case 'contexts.yaml': {
        const data = yamlOf(file, contextsFileSchema);
        data?.contexts.forEach((value, i) => {
          out.contexts.push({ file, path: formatPath(['contexts', i]), value });
        });
        break;
      }
      case 'retired.yaml': {
        const data = yamlOf(file, retiredFileSchema);
        out.retired = {
          skills: new Set(data?.skills ?? []),
          templates: new Set(data?.templates ?? []),
        };
        break;
      }
      case 'outlines.yaml': {
        const data = yamlOf(file, outlinesFileSchema);
        out.outlines = data?.outlines ?? [];
        break;
      }
      case 'standards/wi-exceptions.yaml': {
        const data = yamlOf(file, wiExceptionsFileSchema);
        out.wiExceptions = new Map(Object.entries(data?.exceptions ?? {}));
        break;
      }
      case 'standards/ccss-codes.txt':
        out.ccssCodes = textList(files[file] as string);
        break;
      case 'standards/wi-2021-codes.txt':
        out.wiCodes = textList(files[file] as string);
        break;
      case 'narration/wordlist-k1.txt':
        out.wordlistK1 = new Set(textList(files[file] as string).map((w) => w.toLowerCase()));
        break;
      case 'narration/wordlist-2.txt':
        out.wordlist2 = new Set(textList(files[file] as string).map((w) => w.toLowerCase()));
        break;
      case 'narration/denylist.txt':
        out.denylist = new Set(textList(files[file] as string).map((w) => w.toLowerCase()));
        break;
      case 'ATTRIBUTION.md':
        break;
      default:
        if (/\.(ya?ml|txt)$/.test(file)) {
          diags.warn(
            'V01',
            file,
            '',
            'file is not part of the content layout (03 §4.1) and is ignored',
          );
        }
    }
  }

  out.game = mergeGameData(gameParts, diags, out.gameOrigin);
  return out;
}

const GAME_ARRAYS = [
  'materials',
  'buildings',
  'residents',
  'decor',
  'outfits',
  'festivals',
] as const;

/** game/*.yaml: each file holds some GameData sections; arrays concatenate, `island` appears once. */
function mergeGameData(
  parts: { file: string; data: Record<string, unknown> }[],
  diags: Diagnostics,
  out: GameOrigin,
): GameData | null {
  if (parts.length === 0) {
    diags.error('V01', 'game/', '', 'no game data files (game/*.yaml, 02 §5.8)');
    return null;
  }
  const merged: Record<string, unknown[]> = Object.fromEntries(GAME_ARRAYS.map((k) => [k, []]));
  const origin = new Map<string, { file: string; index: number }[]>();
  let island: { file: string; value: unknown } | null = null;
  let ok = true;
  for (const { file, data } of parts) {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'island') {
        if (island) {
          diags.error('V01', file, 'island', `island is already defined in ${island.file}`);
          ok = false;
        } else island = { file, value };
      } else if ((GAME_ARRAYS as readonly string[]).includes(key)) {
        if (!Array.isArray(value)) {
          diags.error('V01', file, key, 'expected a list');
          ok = false;
          continue;
        }
        const list = merged[key] as unknown[];
        const locs = origin.get(key) ?? [];
        value.forEach((v, i) => {
          list.push(v);
          locs.push({ file, index: i });
        });
        origin.set(key, locs);
      } else {
        diags.error('V01', file, key, `unknown game data section '${key}' (02 §5.8 GameData)`);
        ok = false;
      }
    }
  }
  if (!island) {
    diags.error('V01', 'game/', 'island', 'no game data file defines island');
    return null;
  }
  out.sections = Object.fromEntries(origin);
  out.island = island.file;
  const input = { ...merged, island: island.value };
  const result = gameDataSchema.safeParse(input);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const [section, index, ...rest] = issue.path;
      const loc =
        typeof section === 'string' && typeof index === 'number'
          ? origin.get(section)?.[index]
          : undefined;
      const file = loc?.file ?? (section === 'island' ? island.file : 'game/');
      const path = loc
        ? formatPath([section as string, loc.index, ...rest])
        : formatPath(issue.path);
      diags.error('V01', file, path, issue.message);
    }
    return null;
  }
  // Deep strictness: shared schemas strip unknown keys, the content rules reject them.
  for (const key of GAME_ARRAYS) {
    (merged[key] as unknown[]).forEach((v, i) => {
      const loc = origin.get(key)?.[i];
      reportStrippedKeys(loc?.file ?? 'game/', v, (result.data[key] as unknown[])[i], diags, [
        key,
        loc?.index ?? i,
      ]);
    });
  }
  reportStrippedKeys(island.file, island.value, result.data.island, diags, ['island']);
  return ok ? result.data : null;
}
