import {
  FORMAT_DEFAULT_REPRESENTATION,
  type GameData,
  GRADES,
  type Grade,
  gameDataSchema,
  type ItemTemplate,
  itemTemplateSchema,
  type LessonExample,
  type LessonSpec,
  type MisconceptionSpec,
  misconceptionSpecSchema,
  type NarrationJson,
  narrationJsonSchema,
  RESERVED_STRANDS,
  type Representation,
  SKILL_ID_PATTERN,
  type Skill,
  type StrandId,
  skillSchema,
  TEMPLATE_ID_PATTERN,
  type Tier,
  type UnlockRule,
} from '@number-island/shared';
import { type Diagnostic, Diagnostics, formatPath } from '../diagnostics';
import { DISTRACTOR_FORMATS, FORMAT_SUPPORT, formatRendersRepresentation } from '../formats';
import { isSituation, type StoryContext } from '../schema/source';
import { canonicalJson, fnv1a32, sha256Hex } from './canonical';
import { ExprError, evaluate, identifiers, parseExpr } from './expr';
import { ALWAYS_REQUIRED_KEYS, requiredClipKeys } from './inventory';
import { type ContentFiles, type LoadedContent, type LoadedTemplate, loadContent } from './load';
import {
  FEEDBACK_TONE_WORDS,
  lineClips,
  parseLine,
  READING_LIMITS,
  readingBand,
  renderWithPlaceholders,
  sentenceCount,
  slotsOf,
  vocabWord,
  words,
} from './narration';

// ---------- dist types owned by content (03 §9.1) ----------

export interface CompiledGraph {
  nodes: string[]; // topological order, ties by id
  edges: [from: string, to: string][]; // prerequisite → skill
  roots: string[];
  gateways: string[];
  depth: Record<string, number>; // longest prerequisite path from a root (roots are 0)
  descendants2: Record<string, number>; // descendants within 2 hops (04 §6.2)
  encompasses: [skill: string, encompassed: string, weight: number][];
  strands: Partial<Record<StrandId, string[]>>;
}

export interface StandardsIndex {
  ccss: Record<string, string[]>;
  wi: Record<string, string[]>;
  supports: Record<string, string[]>;
}

export interface ContentManifest {
  contentVersion: string;
  schemaVersion: 1;
  counts: { skills: number; templates: number; misconceptions: number; narrationKeys: number };
  files: Record<string, string>; // file name → sha256 of its bytes
}

export interface CompiledContent {
  skills: Skill[];
  templates: ItemTemplate[];
  misconceptions: MisconceptionSpec[];
  narration: NarrationJson;
  graph: CompiledGraph;
  standards: StandardsIndex;
  contexts: StoryContext[];
  game: GameData;
}

export interface CompileResult {
  diagnostics: Diagnostic[];
  /** `dist/` file name → exact bytes; null when there are errors. */
  outputs: Record<string, string> | null;
  contentVersion: string | null;
  content: CompiledContent | null;
}

/** dist file order; `contentVersion` hashes the first seven in this order (03 §9.1). */
export const DIST_FILES = [
  'skills.json',
  'templates.json',
  'misconceptions.json',
  'narration.json',
  'graph.json',
  'standards.json',
  'contexts.json',
  'game.json',
  'manifest.json',
] as const;

/** §2.5: the only skills that may have neither a `ccss` nor a `supports` code. */
const UNTAGGED_ALLOWED = new Set(['ALG.01', 'ALG.04']);
const TIER_RANK: Record<Tier, number> = { concrete: 0, pictorial: 1, abstract: 2 };
const gradeIndex = (g: Grade) => GRADES.indexOf(g);
const templateNumber = (id: string) => Number(id.slice(id.lastIndexOf('.t') + 2));
const byTemplateId = (a: string, b: string) => {
  const sa = a.slice(0, a.lastIndexOf('.t'));
  const sb = b.slice(0, b.lastIndexOf('.t'));
  return sa < sb ? -1 : sa > sb ? 1 : templateNumber(a) - templateNumber(b);
};
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function compileContent(files: ContentFiles): CompileResult {
  const diags = new Diagnostics();
  const loaded = loadContent(files, diags);
  const content = check(loaded, diags);
  const failed = diags.errors.length > 0 || content === null;
  if (failed) {
    return {
      diagnostics: sortDiagnostics(diags.items),
      outputs: null,
      contentVersion: null,
      content: null,
    };
  }
  const { outputs, contentVersion } = serialize(content);
  return { diagnostics: sortDiagnostics(diags.items), outputs, contentVersion, content };
}

function sortDiagnostics(items: Diagnostic[]): Diagnostic[] {
  return [...items].sort(
    (a, b) =>
      cmp(a.severity, b.severity) ||
      cmp(a.check, b.check) ||
      cmp(a.file, b.file) ||
      cmp(a.path, b.path) ||
      cmp(a.message, b.message),
  );
}

// ======================================================================================

function check(c: LoadedContent, d: Diagnostics): CompiledContent | null {
  // ---------- V02: identity ----------
  const skills = new Map<string, LoadedContent['skills'][number]>();
  const reservedReported = new Set<string>();
  for (const s of c.skills) {
    const { id } = s.value;
    const at = `${s.path}.id`;
    if ((RESERVED_STRANDS as readonly string[]).includes(s.strand)) {
      if (!reservedReported.has(s.file)) {
        d.error(
          'V02',
          s.file,
          'strand',
          `strand ${s.strand} is reserved (03 §1.2): it holds no v1 skills`,
        );
        reservedReported.add(s.file);
      }
      continue;
    }
    if (!SKILL_ID_PATTERN.test(id)) {
      d.error('V02', s.file, at, `'${id}' is not a SkillId (^[A-Z]{2,4}\\.\\d{2}$, e.g. ADD.08)`);
      continue;
    }
    if (id.split('.')[0] !== s.strand) {
      d.error('V02', s.file, at, `${id} does not start with this file's strand ${s.strand}`);
      continue;
    }
    if (id.endsWith('.00')) {
      d.error('V02', s.file, at, `${id}: skill numbers start at .01`);
      continue;
    }
    if (c.retired.skills.has(id)) {
      d.error('V02', s.file, at, `${id} is retired (retired.yaml); ids are never reused`);
      continue;
    }
    const prev = skills.get(id);
    if (prev) {
      d.error(
        'V02',
        s.file,
        at,
        `duplicate skill id ${id} (first defined in ${prev.file} › ${prev.path})`,
      );
      continue;
    }
    skills.set(id, s);
  }

  const templates = new Map<string, LoadedTemplate & { strand: string }>();
  for (const t of c.templates) {
    const { id, skillId } = t.value;
    const at = `${t.path}.id`;
    if (!TEMPLATE_ID_PATTERN.test(id)) {
      d.error('V02', t.file, at, `'${id}' is not a TemplateId (<SkillId>.t<n>, e.g. ADD.08.t1)`);
      continue;
    }
    if (!id.startsWith(`${skillId}.t`)) {
      d.error(
        'V02',
        t.file,
        at,
        `template id ${id} must be ${skillId}.t<n> (its skillId is ${skillId})`,
      );
      continue;
    }
    if (id.split('.')[0] !== t.strand) {
      d.error('V02', t.file, at, `${id} does not start with this file's strand ${t.strand}`);
      continue;
    }
    if (!/\.t[1-9]\d*$/.test(id) || !Number.isSafeInteger(templateNumber(id))) {
      d.error('V02', t.file, at, `${id}: template numbers start at t1, with no leading zeros`);
      continue;
    }
    if (c.retired.templates.has(id)) {
      d.error('V02', t.file, at, `${id} is retired (retired.yaml); ids are never reused`);
      continue;
    }
    const prev = templates.get(id);
    if (prev) {
      d.error(
        'V02',
        t.file,
        at,
        `duplicate template id ${id} (first defined in ${prev.file} › ${prev.path})`,
      );
      continue;
    }
    templates.set(id, t);
  }

  const misconceptions = new Map<string, LoadedContent['misconceptions'][number]>();
  for (const m of c.misconceptions) {
    const prev = misconceptions.get(m.value.id);
    if (prev) {
      d.error(
        'V02',
        m.file,
        `${m.path}.id`,
        `duplicate misconception id ${m.value.id} (first in ${prev.file})`,
      );
      continue;
    }
    misconceptions.set(m.value.id, m);
  }

  // ---------- V03: sequential ids ----------
  const planned = new Set(c.graph?.plannedIds ?? []);
  for (const id of planned) {
    if (skills.has(id) || templates.has(id)) {
      d.error(
        'V03',
        c.graph?.file ?? 'graph.yaml',
        'plannedIds',
        `${id} is authored; remove it from plannedIds`,
      );
    }
  }
  const byStrand = new Map<string, number[]>();
  for (const id of skills.keys()) {
    const [strand, num] = id.split('.') as [string, string];
    byStrand.set(strand, [...(byStrand.get(strand) ?? []), Number(num)]);
  }
  for (const [strand, nums] of byStrand) {
    const missing = sequenceGaps(
      nums,
      (n) => `${strand}.${String(n).padStart(2, '0')}`,
      excusedNumbers([...c.retired.skills, ...planned], `${strand}.`),
    );
    if (missing) {
      d.error(
        'V03',
        `skills/${strand}.yaml`,
        '',
        `skill ids must be sequential; missing ${missing} (retire ids in retired.yaml instead of skipping them)`,
      );
    }
  }
  const templatesBySkill = new Map<string, string[]>();
  for (const [id, t] of templates) {
    templatesBySkill.set(t.value.skillId, [...(templatesBySkill.get(t.value.skillId) ?? []), id]);
  }
  for (const list of templatesBySkill.values()) list.sort(byTemplateId);
  for (const [skillId, ids] of templatesBySkill) {
    const missing = sequenceGaps(
      ids.map(templateNumber),
      (n) => `${skillId}.t${n}`,
      excusedNumbers([...c.retired.templates, ...planned], `${skillId}.t`),
    );
    if (missing) {
      const file = templates.get(ids[0] as string)?.file ?? '';
      d.error('V03', file, '', `template ids of ${skillId} must be sequential; missing ${missing}`);
    }
  }

  // ---------- V04: references ----------
  const contextIds = new Set<string>();
  for (const ctx of c.contexts) {
    if (contextIds.has(ctx.value.id)) {
      d.error('V26', ctx.file, `${ctx.path}.id`, `duplicate context id ${ctx.value.id}`);
    }
    contextIds.add(ctx.value.id);
  }
  const ref = (file: string, path: string, kind: string, id: string, exists: boolean) => {
    if (!exists) d.error('V04', file, path, `unknown ${kind} ${id}`);
  };
  for (const s of skills.values()) {
    const v = s.value;
    v.prerequisites.forEach((p, i) => {
      if (p === v.id)
        d.error(
          'V04',
          s.file,
          `${s.path}.prerequisites[${i}]`,
          `${v.id} lists itself as a prerequisite`,
        );
      else ref(s.file, `${s.path}.prerequisites[${i}]`, 'prerequisite skill', p, skills.has(p));
    });
    for (const k of Object.keys(v.encompasses ?? {})) {
      ref(s.file, `${s.path}.encompasses.${k}`, 'encompassed skill', k, skills.has(k));
    }
    (v.related ?? []).forEach((r, i) => {
      ref(s.file, `${s.path}.related[${i}]`, 'related skill', r, skills.has(r));
    });
  }
  for (const t of templates.values()) {
    const v = t.value;
    ref(t.file, `${t.path}.skillId`, 'skill', v.skillId, skills.has(v.skillId));
    (v.distractors ?? []).forEach((x, i) => {
      ref(
        t.file,
        `${t.path}.distractors[${i}].rule`,
        'misconception',
        x.rule,
        misconceptions.has(x.rule),
      );
    });
    const ctxSpec = t.params.context;
    if (ctxSpec) {
      const values =
        ctxSpec.kind === 'const'
          ? [ctxSpec.value]
          : ctxSpec.kind === 'choice'
            ? ctxSpec.values
            : [];
      for (const value of values) {
        ref(
          t.file,
          `${t.path}.params.context`,
          'story context',
          String(value),
          contextIds.has(String(value)),
        );
      }
    }
  }
  for (const m of misconceptions.values()) {
    m.value.skills.forEach((s, i) => {
      ref(m.file, `${m.path}.skills[${i}]`, 'skill', s, skills.has(s));
    });
    m.value.remediation.forEach((s, i) => {
      ref(m.file, `${m.path}.remediation[${i}]`, 'remediation skill', s, skills.has(s));
    });
  }
  if (!c.graph) return null; // graph.yaml failed V01 (already reported)
  c.graph.roots.forEach((r, i) => {
    ref(c.graph?.file ?? 'graph.yaml', `roots[${i}]`, 'root skill', r, skills.has(r));
  });

  // ---------- V05 / V06: roots and the DAG ----------
  const prereqs = new Map<string, string[]>();
  for (const [id, s] of skills)
    prereqs.set(
      id,
      s.value.prerequisites.filter((p) => skills.has(p) && p !== id),
    );
  const rootSet = new Set(c.graph.roots);
  for (const [id, s] of skills) {
    const own = prereqs.get(id) ?? [];
    if (s.value.prerequisites.length === 0 && !rootSet.has(id)) {
      d.error(
        'V05',
        s.file,
        `${s.path}.prerequisites`,
        `${id} has no prerequisites but is not in the graph.yaml roots allowlist`,
      );
    }
    if (s.value.prerequisites.length > 0 && rootSet.has(id)) {
      d.warn('V05', c.graph.file, 'roots', `${id} is listed as a root but has prerequisites`);
    }
    own.forEach((p) => {
      if (p.startsWith('PUZ.')) {
        d.error(
          'V06',
          s.file,
          `${s.path}.prerequisites`,
          `${id} lists the enrichment puzzle ${p} as a prerequisite; PUZ skills are never on the critical path`,
        );
      }
    });
  }
  const cycle = findCycle([...skills.keys()].sort(), prereqs);
  if (cycle) {
    const s = skills.get(cycle[0] as string);
    d.error(
      'V06',
      s?.file ?? '',
      s ? `${s.path}.prerequisites` : '',
      `prerequisite cycle: ${cycle.join(' → ')}`,
    );
    return null; // graph-derived checks need a DAG
  }
  const order = topoOrder([...skills.keys()], prereqs);
  const ancestors = new Map<string, Set<string>>();
  for (const id of order) {
    const set = new Set<string>();
    for (const p of prereqs.get(id) ?? []) {
      set.add(p);
      for (const a of ancestors.get(p) ?? []) set.add(a);
    }
    ancestors.set(id, set);
  }

  // ---------- V07, V08–V12: per skill ----------
  const reps = (t: LoadedTemplate): Representation =>
    t.value.representation ?? FORMAT_DEFAULT_REPRESENTATION[t.value.format];
  for (const [id, s] of skills) {
    const v = s.value;
    for (const [k, w] of Object.entries(v.encompasses ?? {})) {
      if (!skills.has(k)) continue;
      if (!(ancestors.get(id) ?? new Set()).has(k)) {
        d.error(
          'V07',
          s.file,
          `${s.path}.encompasses.${k}`,
          `${k} is not an ancestor of ${id}; a skill only encompasses skills it builds on`,
        );
      }
      if (!(w > 0 && w <= 1)) {
        d.error('V07', s.file, `${s.path}.encompasses.${k}`, `weight ${w} must be in (0, 1]`);
      }
    }
    const own = (templatesBySkill.get(id) ?? []).map((tid) => templates.get(tid) as LoadedTemplate);
    const formats = new Set(own.map((t) => t.value.format));
    if (own.length < 2 || formats.size < 2) {
      d.error(
        'V08',
        s.file,
        s.path,
        `${id} needs ≥ 2 templates across ≥ 2 formats (has ${own.length} template(s), ${formats.size} format(s))`,
      );
    }
    if (v.gateway) {
      const repSet = new Set(own.map(reps));
      if (own.length < 3 || repSet.size < 3 || !own.some((t) => t.value.tier === 'abstract')) {
        d.error(
          'V09',
          s.file,
          s.path,
          `gateway skill ${id} needs ≥ 3 templates, ≥ 3 distinct representations and ≥ 1 abstract-tier template (has ${own.length}, ${repSet.size}, ${own.filter((t) => t.value.tier === 'abstract').length})`,
        );
      }
    }
    const listed = new Set(v.representations);
    const dupReps = v.representations.filter((r, i) => v.representations.indexOf(r) !== i);
    if (dupReps.length > 0)
      d.error('V10', s.file, `${s.path}.representations`, `repeated: ${dupReps.join(', ')}`);
    const used = new Set<Representation>();
    let lastRank = -1;
    for (const t of own) {
      const r = reps(t);
      used.add(r);
      if (!listed.has(r)) {
        d.error(
          'V10',
          t.file,
          `${t.path}.representation`,
          `${t.value.id} uses representation ${r}${t.value.representation ? '' : ` (the ${t.value.format} default)`}, which ${id} does not list`,
        );
      }
      const rank = TIER_RANK[t.value.tier];
      if (rank < lastRank) {
        d.warn(
          'V10',
          t.file,
          `${t.path}.tier`,
          `${t.value.id} (${t.value.tier}) comes after a more abstract template; order templates concrete → pictorial → abstract`,
        );
      }
      lastRank = Math.max(lastRank, rank);
    }
    for (const r of v.representations) {
      if (!used.has(r))
        d.error(
          'V10',
          s.file,
          `${s.path}.representations`,
          `${id} lists ${r} but no template uses it`,
        );
    }
    const isFluency = v.kind === 'fact-fluency';
    if (isFluency !== (v.fluency !== undefined)) {
      d.error(
        'V12',
        s.file,
        `${s.path}.fluency`,
        isFluency
          ? `fact-fluency skill ${id} needs fluency.medianLatencyMs`
          : `fluency is only for fact-fluency skills (${id} is ${v.kind})`,
      );
    }
    if (
      isFluency &&
      !own.some((t) => t.value.format === 'number-pad' && t.value.tier === 'abstract')
    ) {
      d.error(
        'V12',
        s.file,
        s.path,
        `fact-fluency skill ${id} needs an abstract number-pad template`,
      );
    }
  }
  for (const t of templates.values()) {
    const v = t.value;
    const support = FORMAT_SUPPORT[v.format];
    const r = reps(t);
    if (!formatRendersRepresentation(v.format, r)) {
      d.error(
        'V11',
        t.file,
        `${t.path}.representation`,
        `${v.format} cannot render ${r} (it renders ${(support.representations as string[]).join(', ')})`,
      );
    }
    if (!support.tiers.includes(v.tier)) {
      d.error(
        'V11',
        t.file,
        `${t.path}.tier`,
        `${v.format} supports the ${support.tiers.join('/')} tier(s), not ${v.tier}`,
      );
    }
    if (v.distractors && !DISTRACTOR_FORMATS.includes(v.format)) {
      d.error(
        'V11',
        t.file,
        `${t.path}.distractors`,
        `distractors are only for multiple-choice formats (${DISTRACTOR_FORMATS.join(', ')}), not ${v.format}`,
      );
    }
  }

  // ---------- lessons (03 §6) and V21 ----------
  const lessonBySkill = new Map<string, LoadedContent['lessons'][number]>();
  for (const l of c.lessons) {
    const sid = l.value.skillId;
    if (!sid.startsWith(`${l.strand}.`)) {
      d.error(
        'V02',
        l.file,
        `${l.path}.skillId`,
        `${sid} does not belong to this file's strand ${l.strand}`,
      );
      continue;
    }
    if (!skills.has(sid)) {
      d.error('V04', l.file, `${l.path}.skillId`, `unknown skill ${sid}`);
      continue;
    }
    if (lessonBySkill.has(sid)) {
      d.error('V02', l.file, `${l.path}.skillId`, `${sid} already has a lesson`);
      continue;
    }
    lessonBySkill.set(sid, l);
  }
  const lessons = new Map<string, LessonSpec>();
  for (const [id, s] of skills) {
    const own = (templatesBySkill.get(id) ?? []).map((tid) => templates.get(tid) as LoadedTemplate);
    if (own.length === 0) continue; // V08 already reported
    const authored = lessonBySkill.get(id);
    const lesson = authored
      ? authoredLesson(authored, own, templates, d)
      : autoLesson(id, s.value.kind, s.strand, own);
    if (!authored && s.value.gateway) {
      d.warn(
        'V21',
        s.file,
        s.path,
        `gateway skill ${id} uses an auto lesson; gateway skills should get an authored lesson (03 §6.4)`,
      );
    }
    lessons.set(id, resolveTestOut(id, s, lesson, own, d, authored));
  }

  // ---------- V19 / V20: standards ----------
  const ccssSet = new Set(c.ccssCodes);
  const wiSet = new Set(c.wiCodes);
  for (const [code, wi] of c.wiExceptions) {
    if (!ccssSet.has(code))
      d.error(
        'V19',
        'standards/wi-exceptions.yaml',
        `exceptions.${code}`,
        `${code} is not in standards/ccss-codes.txt`,
      );
    if (wi !== null && !wiSet.has(wi))
      d.error(
        'V19',
        'standards/wi-exceptions.yaml',
        `exceptions.${code}`,
        `${wi} is not in standards/wi-2021-codes.txt`,
      );
  }
  const wiBySkill = new Map<string, string[]>();
  for (const [id, s] of skills) {
    const st = s.value.standards;
    st.ccss.forEach((code, i) => {
      if (!ccssSet.has(code))
        d.error(
          'V19',
          s.file,
          `${s.path}.standards.ccss[${i}]`,
          `${code} is not in standards/ccss-codes.txt (use the full Grade.Domain.Cluster.Standard form, 03 §2.1)`,
        );
    });
    (st.supports ?? []).forEach((code, i) => {
      if (!ccssSet.has(code))
        d.error(
          'V19',
          s.file,
          `${s.path}.standards.supports[${i}]`,
          `${code} is not in standards/ccss-codes.txt`,
        );
    });
    (st.wi ?? []).forEach((code, i) => {
      if (!wiSet.has(code))
        d.error(
          'V19',
          s.file,
          `${s.path}.standards.wi[${i}]`,
          `${code} is not in standards/wi-2021-codes.txt`,
        );
    });
    const derived = deriveWi(st.ccss, c.wiExceptions);
    for (const code of derived) {
      if (!wiSet.has(code)) {
        d.error(
          'V19',
          s.file,
          `${s.path}.standards.ccss`,
          `derived WI code ${code} is not in standards/wi-2021-codes.txt; the exception table (standards/wi-exceptions.yaml) is incomplete`,
        );
      }
    }
    wiBySkill.set(id, [...new Set([...derived, ...(st.wi ?? [])])].sort(cmp));
    if (st.ccss.length === 0 && (st.supports ?? []).length === 0 && !UNTAGGED_ALLOWED.has(id)) {
      d.error(
        'V20',
        s.file,
        `${s.path}.standards`,
        `${id} needs a ccss or supports code (only ALG.01 and ALG.04 may have neither, 03 §2.5)`,
      );
    }
  }
  checkCoverage(c, skills, d);

  // ---------- V23 ----------
  for (const [id, s] of skills) {
    for (const p of prereqs.get(id) ?? []) {
      const pg = (skills.get(p)?.value.grade ?? 'K') as Grade;
      if (gradeIndex(pg) > gradeIndex(s.value.grade as Grade)) {
        d.warn(
          'V23',
          s.file,
          `${s.path}.prerequisites`,
          `prerequisite ${p} (grade ${pg}) has a higher grade label than ${id} (grade ${s.value.grade})`,
        );
      }
    }
  }

  // ---------- V18: misconceptions ----------
  for (const m of misconceptions.values()) {
    const v = m.value;
    if (!v.examples.some((e) => e.match) || !v.examples.some((e) => !e.match)) {
      d.error(
        'V18',
        m.file,
        `${m.path}.examples`,
        `${v.id} needs ≥ 1 example with match: true and ≥ 1 with match: false`,
      );
    }
    v.remediation.forEach((r, i) => {
      if (!skills.has(r)) return;
      const ok = v.skills.some((s) => s === r || (ancestors.get(s) ?? new Set()).has(r));
      if (!ok)
        d.warn(
          'V18',
          m.file,
          `${m.path}.remediation[${i}]`,
          `${r} is neither a listed skill nor an ancestor of one`,
        );
    });
  }

  // ---------- V26: contexts ----------
  for (const ctx of c.contexts) {
    ctx.value.situations.forEach((sit, i) => {
      if (!isSituation(sit))
        d.error(
          'V26',
          ctx.file,
          `${ctx.path}.situations[${i}]`,
          `'${sit}' is not a SituationType or a SituationType family (e.g. add-to, compare)`,
        );
    });
    for (const noun of ctx.value.nouns) {
      for (const form of ['one', 'many']) {
        const key = `noun.${noun}.${form}`;
        if (!c.narration.has(key))
          d.error(
            'V26',
            ctx.file,
            `${ctx.path}.nouns`,
            `noun ${noun} has no clip ${key} (narration/numbers.yaml)`,
          );
      }
    }
  }

  // ---------- game data references ----------
  if (c.game) checkGame(c.game, c.gameFiles, skills, c.narration, d);

  // ---------- derive skills, templates, misconceptions ----------
  const misconceptionsBySkill = new Map<string, string[]>();
  for (const m of misconceptions.values()) {
    for (const s of m.value.skills) {
      misconceptionsBySkill.set(s, [...(misconceptionsBySkill.get(s) ?? []), m.value.id]);
    }
  }
  const outSkills: Skill[] = [];
  for (const id of [...skills.keys()].sort(cmp)) {
    const v = (skills.get(id) as LoadedContent['skills'][number]).value;
    const lesson = lessons.get(id);
    if (!lesson) continue;
    outSkills.push({
      id,
      name: v.name,
      strand: id.split('.')[0] as StrandId,
      kind: v.kind,
      grade: v.grade,
      standards: {
        ccss: v.standards.ccss,
        wi: wiBySkill.get(id) ?? [],
        ...(v.standards.supports ? { supports: v.standards.supports } : {}),
      },
      prerequisites: v.prerequisites,
      encompasses: v.encompasses ?? {},
      related: v.related ?? [],
      gateway: v.gateway,
      representations: v.representations,
      templates: templatesBySkill.get(id) ?? [],
      lesson,
      ...(v.fluency ? { fluency: v.fluency } : {}),
      misconceptions: [...new Set(misconceptionsBySkill.get(id) ?? [])].sort(cmp),
      narration: { intro: `sk.${id}.intro` },
    });
  }
  const outTemplates: ItemTemplate[] = [...templates.keys()].sort(byTemplateId).map((id) => {
    const t = templates.get(id) as LoadedTemplate;
    const v = t.value;
    return {
      id,
      skillId: v.skillId,
      format: v.format,
      tier: v.tier,
      representation: reps(t),
      ...(v.expectedLatencyMs !== undefined ? { expectedLatencyMs: v.expectedLatencyMs } : {}),
      generator: v.generator,
      params: t.params,
      ...(v.constraints ? { constraints: v.constraints } : {}),
      difficulty: { base: v.difficulty.base, features: v.difficulty.features ?? {} },
      narration: v.narration,
      ...(v.distractors ? { distractors: v.distractors } : {}),
    };
  });
  const outMisconceptions: MisconceptionSpec[] = [...misconceptions.keys()].sort(cmp).map((id) => {
    const m = misconceptions.get(id) as LoadedContent['misconceptions'][number];
    const { priority, ...rest } = m.value;
    return { ...rest, area: m.area, priority: priority ?? 50 };
  });

  // ---------- V16 / V17: narration ----------
  const narration = checkNarration(c, outSkills, outTemplates, outMisconceptions, skills, d);

  const graph = buildGraph(order, prereqs, skills, c.graph.roots);
  const standards = buildStandards(outSkills);
  const contexts = [...c.contexts.map((x) => x.value)].sort((a, b) => cmp(a.id, b.id));
  if (!c.game) return null;
  return {
    skills: outSkills,
    templates: outTemplates,
    misconceptions: outMisconceptions,
    narration,
    graph,
    standards,
    contexts,
    game: c.game,
  };
}

/**
 * V03: the ids missing from 1 … max(nums) that are not excused, as a display list (at most 10
 * named, then "… and N more"), or null when there is no gap. Work is bounded by the number of
 * present and excused ids, never by the size of a gap, so a mistyped `t9999999` stays cheap.
 */
export function sequenceGaps(
  nums: readonly number[],
  toId: (n: number) => string,
  excusedNums: ReadonlySet<number>,
): string | null {
  const present = new Set(nums);
  const max = Math.max(0, ...present);
  const LIMIT = 10;
  const named: string[] = [];
  let prev = 0;
  for (const n of [...present].sort((a, b) => a - b)) {
    for (let k = prev + 1; k < n && named.length < LIMIT; k += 1) {
      if (!excusedNums.has(k)) named.push(toId(k));
    }
    prev = n;
  }
  const excusedInRange = [...excusedNums].filter(
    (k) => k >= 1 && k < max && !present.has(k),
  ).length;
  const total = max - present.size - excusedInRange;
  if (total <= 0) return null;
  const more = total - named.length;
  return more > 0 ? `${named.join(', ')} … and ${more} more` : named.join(', ');
}

/** The numeric suffixes of excused ids (`retired.yaml`, `plannedIds`) that start with `prefix`. */
function excusedNumbers(ids: Iterable<string>, prefix: string): Set<number> {
  const out = new Set<number>();
  for (const id of ids) {
    const rest = id.slice(prefix.length);
    if (id.startsWith(prefix) && /^\d+$/.test(rest)) out.add(Number(rest));
  }
  return out;
}

// ---------- graph helpers ----------

function findCycle(ids: string[], prereqs: Map<string, string[]>): string[] | null {
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    color.set(id, 1);
    stack.push(id);
    for (const p of [...(prereqs.get(id) ?? [])].sort(cmp)) {
      const c = color.get(p) ?? 0;
      if (c === 1) {
        // Report in prerequisite → skill direction: p … → id → p reads as "p needs … needs p".
        const loop = stack.slice(stack.indexOf(p));
        return [...loop, p].reverse();
      }
      if (c === 0) {
        const found = visit(p);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, 2);
    return null;
  };
  for (const id of ids) {
    if ((color.get(id) ?? 0) === 0) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

/** Kahn's algorithm; among ready skills the smallest id goes first (03 §9.1). */
function topoOrder(ids: string[], prereqs: Map<string, string[]>): string[] {
  const indeg = new Map(ids.map((id) => [id, (prereqs.get(id) ?? []).length]));
  const dependents = new Map<string, string[]>();
  for (const id of ids)
    for (const p of prereqs.get(id) ?? []) dependents.set(p, [...(dependents.get(p) ?? []), id]);
  const ready = ids.filter((id) => indeg.get(id) === 0).sort(cmp);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const dep of dependents.get(id) ?? []) {
      const n = (indeg.get(dep) as number) - 1;
      indeg.set(dep, n);
      if (n === 0) {
        ready.push(dep);
        ready.sort(cmp);
      }
    }
  }
  return order;
}

function buildGraph(
  order: string[],
  prereqs: Map<string, string[]>,
  skills: Map<string, LoadedContent['skills'][number]>,
  roots: string[],
): CompiledGraph {
  const depth: Record<string, number> = {};
  for (const id of order) {
    depth[id] = Math.max(-1, ...(prereqs.get(id) ?? []).map((p) => depth[p] as number)) + 1;
  }
  const children = new Map<string, string[]>();
  for (const id of order)
    for (const p of prereqs.get(id) ?? []) children.set(p, [...(children.get(p) ?? []), id]);
  const descendants2: Record<string, number> = {};
  for (const id of order) {
    const set = new Set<string>();
    for (const c1 of children.get(id) ?? []) {
      set.add(c1);
      for (const c2 of children.get(c1) ?? []) set.add(c2);
    }
    descendants2[id] = set.size;
  }
  const edges: [string, string][] = [];
  const encompasses: [string, string, number][] = [];
  const strands: Partial<Record<StrandId, string[]>> = {};
  for (const id of [...skills.keys()].sort(cmp)) {
    for (const p of [...(prereqs.get(id) ?? [])].sort(cmp)) edges.push([p, id]);
    const enc = skills.get(id)?.value.encompasses ?? {};
    for (const k of Object.keys(enc).sort(cmp)) encompasses.push([id, k, enc[k] as number]);
    const strand = id.split('.')[0] as StrandId;
    strands[strand] = [...(strands[strand] ?? []), id];
  }
  edges.sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]));
  return {
    nodes: order,
    edges,
    roots: [...roots].filter((r) => skills.has(r)).sort(cmp),
    gateways: [...skills.keys()].filter((id) => skills.get(id)?.value.gateway).sort(cmp),
    depth,
    descendants2,
    encompasses,
    strands,
  };
}

// ---------- standards helpers ----------

/** 03 §2.2 alias rule: CCSS → WI 2021 via the exception table, else `M.` + code. */
export function deriveWi(
  ccss: readonly string[],
  exceptions: ReadonlyMap<string, string | null>,
): string[] {
  const out = new Set<string>();
  for (const code of ccss) {
    if (exceptions.has(code)) {
      const v = exceptions.get(code);
      if (v) out.add(v);
      continue;
    }
    const sub = /^(.*\.\d{1,2})([a-e])$/.exec(code);
    if (sub && exceptions.has(sub[1] as string)) {
      // A sub-part of a renumbered standard is the same sub-part of the renumbered WI standard.
      const v = exceptions.get(sub[1] as string);
      if (v) out.add(`${v}${sub[2]}`);
      continue;
    }
    out.add(`M.${code}`);
  }
  return [...out].sort(cmp);
}

function codeGrade(code: string): string {
  return code.split('.')[0] as string;
}

/** V20 (03 §2.4): each code of a covered grade is addressed by a skill's `ccss`. */
function checkCoverage(
  c: LoadedContent,
  skills: Map<string, LoadedContent['skills'][number]>,
  d: Diagnostics,
): void {
  const grades = new Set<string>(c.graph?.coverageGrades ?? []);
  const addressed = new Set<string>();
  const named = new Set<string>();
  for (const s of skills.values()) {
    for (const code of s.value.standards.ccss) addressed.add(code);
    for (const code of [...s.value.standards.ccss, ...(s.value.standards.supports ?? [])])
      named.add(code);
  }
  const parentOf = (code: string) => code.replace(/([0-9])[a-e]$/, '$1');
  const subparts = new Map<string, string[]>();
  for (const code of c.ccssCodes) {
    const parent = parentOf(code);
    if (parent !== code) subparts.set(parent, [...(subparts.get(parent) ?? []), code]);
  }
  const covered = (parent: string) => {
    if (addressed.has(parent)) return true;
    const parts = subparts.get(parent);
    return parts !== undefined && parts.length > 0 && parts.every((p) => addressed.has(p));
  };
  const uncovered: string[] = [];
  const graphFile = c.graph?.file ?? 'graph.yaml';
  // Every code of a covered grade, judged at the parent level (a tagged parent covers its parts).
  for (const code of c.ccssCodes) {
    if (parentOf(code) !== code || !grades.has(codeGrade(code))) continue;
    if (!covered(code)) {
      const parts = subparts.get(code);
      const missing = parts?.filter((p) => !addressed.has(p)) ?? [];
      uncovered.push(parts ? `${code} (untagged parts: ${missing.join(', ')})` : code);
    }
  }
  // Every grade-4 code a (stretch) skill names, parent or sub-part, whatever coverageGrades says.
  for (const code of [...named].sort(cmp)) {
    if (codeGrade(code) !== '4' || grades.has('4')) continue;
    const parent = parentOf(code);
    const ok = parent === code ? covered(code) : addressed.has(code) || addressed.has(parent);
    if (!ok) uncovered.push(`${code} (named by a skill, grade 4)`);
  }
  for (const code of uncovered) {
    d.error(
      'V20',
      graphFile,
      'coverageGrades',
      `uncovered standard ${code}: no skill lists it in standards.ccss (supports never counts, 03 §2.4)`,
    );
  }
}

function buildStandards(skills: Skill[]): StandardsIndex {
  const idx: StandardsIndex = { ccss: {}, wi: {}, supports: {} };
  const add = (map: Record<string, string[]>, code: string, id: string) => {
    map[code] ??= [];
    const list = map[code] as string[];
    if (!list.includes(id)) list.push(id);
  };
  for (const s of skills) {
    for (const code of s.standards.ccss) add(idx.ccss, code, s.id);
    for (const code of s.standards.wi ?? []) add(idx.wi, code, s.id);
    for (const code of s.standards.supports ?? []) add(idx.supports, code, s.id);
  }
  for (const map of [idx.ccss, idx.wi, idx.supports])
    for (const list of Object.values(map)) list.sort(cmp);
  return idx;
}

// ---------- lessons ----------

function firstTemplateForLesson(own: LoadedTemplate[]): LoadedTemplate {
  return (
    own.find((t) => t.value.tier === 'concrete') ??
    own.find((t) => t.value.tier === 'pictorial') ??
    (own[0] as LoadedTemplate)
  );
}

/** 03 §6.4 auto lessons (with the per-kind defaults). */
export function autoLesson(
  skillId: string,
  kind: Skill['kind'],
  strand: string,
  own: LoadedTemplate[],
): LessonSpec {
  const templateId = firstTemplateForLesson(own).value.id;
  const intro = `sk.${skillId}.intro`;
  const h = fnv1a32(skillId);
  if (kind === 'fact-fluency') {
    return {
      mode: 'none',
      templateId,
      intro,
      worked: [],
      faded: [],
      scaffolded: { count: 0, hintStart: 2 },
      testOut: { items: 0, minCorrect: 0 },
    };
  }
  if (kind === 'problem-solving' && strand === 'PUZ') {
    return {
      mode: 'auto',
      templateId,
      intro,
      worked: [{ seed: h, target: 'easy' }],
      faded: [],
      scaffolded: { count: 0, hintStart: 2 },
      testOut: { items: 3, minCorrect: 3 },
    };
  }
  return {
    mode: 'auto',
    templateId,
    intro,
    worked: [{ seed: h, target: 'easy' }],
    faded: [
      { seed: h + 1, target: 'typical', childSteps: 1 },
      { seed: h + 2, target: 'typical', childSteps: 2 },
    ],
    scaffolded: { count: 2, hintStart: 2 },
    testOut: { items: 3, minCorrect: 3 },
  };
}

function authoredLesson(
  l: LoadedContent['lessons'][number],
  own: LoadedTemplate[],
  templates: Map<string, LoadedTemplate>,
  d: Diagnostics,
): LessonSpec {
  const v = l.value;
  const ownIds = new Set(own.map((t) => t.value.id));
  const templateRef = (path: string, id: string) => {
    if (!templates.has(id)) d.error('V04', l.file, path, `unknown template ${id}`);
    else if (!ownIds.has(id))
      d.error('V04', l.file, path, `template ${id} belongs to another skill, not ${v.skillId}`);
  };
  templateRef(`${l.path}.templateId`, v.templateId);
  for (const [i, id] of (v.testOut?.templateIds ?? []).entries()) {
    templateRef(`${l.path}.testOut.templateIds[${i}]`, id);
  }
  const examples = (phase: 'worked' | 'faded', list: typeof v.worked): LessonExample[] =>
    list.map((e, i) => {
      const path = `${l.path}.${phase}[${i}]`;
      if ((e.params === undefined) === (e.seed === undefined)) {
        d.error('V21', l.file, path, 'an example needs exactly one of params and seed');
      }
      if (e.templateId) templateRef(`${path}.templateId`, e.templateId);
      const t = templates.get(e.templateId ?? v.templateId);
      if (t && e.params) checkGivenParams(l.file, `${path}.params`, t, e.params, d);
      (e.steps ?? []).forEach((step, j) => {
        if (phase === 'worked' && step.actor !== 'demo') {
          d.error(
            'V21',
            l.file,
            `${path}.steps[${j}].actor`,
            'worked examples are all demo steps (03 §6.2)',
          );
        }
        const ops = t ? FORMAT_SUPPORT[t.value.format].ops : [];
        for (const [where, op] of [
          ['action.op', step.action?.op],
          ['expect.op', step.expect && 'op' in step.expect ? step.expect.op : undefined],
        ] as const) {
          if (t && op !== undefined && !ops.includes(op)) {
            d.error(
              'V21',
              l.file,
              `${path}.steps[${j}].${where}`,
              `op '${op}' does not exist for ${t.value.format} (ops: ${ops.join(', ')})`,
            );
          }
        }
      });
      if (phase === 'faded' && e.childSteps === undefined) {
        d.error('V21', l.file, `${path}.childSteps`, 'faded examples need childSteps');
      }
      if (e.childSteps !== undefined && e.steps && e.childSteps >= e.steps.length) {
        d.error(
          'V21',
          l.file,
          `${path}.childSteps`,
          `childSteps (${e.childSteps}) must be less than the number of steps (${e.steps.length}) so the demo does at least one`,
        );
      }
      return {
        ...(e.templateId ? { templateId: e.templateId } : {}),
        ...(e.params ? { params: e.params } : {}),
        ...(e.seed !== undefined ? { seed: e.seed } : {}),
        ...(e.target ? { target: e.target } : {}),
        ...(e.steps
          ? {
              steps: e.steps.map((s) => ({
                actor: s.actor,
                say: s.say,
                ...(s.vars ? { vars: s.vars } : {}),
                ...(s.action ? { action: s.action } : {}),
                ...(s.expect ? { expect: s.expect } : {}),
              })),
            }
          : {}),
        ...(e.childSteps !== undefined ? { childSteps: e.childSteps } : {}),
      };
    });
  if (v.mode === 'authored' && v.worked.length === 0) {
    d.error('V21', l.file, `${l.path}.worked`, 'an authored lesson needs 1–2 worked examples');
  }
  return {
    mode: v.mode,
    templateId: v.templateId,
    intro: v.intro ?? `sk.${v.skillId}.intro`,
    worked: examples('worked', v.worked),
    faded: examples('faded', v.faded ?? []),
    scaffolded: v.scaffolded ?? { count: 2, hintStart: 2 },
    testOut:
      v.testOut ?? (v.mode === 'none' ? { items: 0, minCorrect: 0 } : { items: 3, minCorrect: 3 }),
    ...(v.outro ? { outro: v.outro } : {}),
  };
}

/** V21: given lesson params satisfy the template's constraints (when every name is known). */
function checkGivenParams(
  file: string,
  path: string,
  t: LoadedTemplate,
  params: Record<string, number | string | boolean>,
  d: Diagnostics,
): void {
  for (const [name, spec] of Object.entries(t.params)) {
    const v = params[name];
    if (v === undefined) continue;
    const inDomain =
      spec.kind === 'const'
        ? v === spec.value
        : spec.kind === 'choice'
          ? spec.values.includes(v)
          : spec.kind === 'bool'
            ? typeof v === 'boolean'
            : typeof v === 'number' &&
              Number.isInteger(v) &&
              v >= spec.min &&
              v <= spec.max &&
              (v - spec.min) % (spec.step ?? 1) === 0 &&
              !(spec.exclude ?? []).includes(v);
    if (!inDomain)
      d.error(
        'V21',
        file,
        `${path}.${name}`,
        `${name}: ${JSON.stringify(v)} is outside ${t.value.id}'s ParamSpec`,
      );
  }
  (t.value.constraints ?? []).forEach((src) => {
    let expr: ReturnType<typeof parseExpr>;
    try {
      expr = parseExpr(src);
    } catch (e) {
      d.error(
        'V21',
        t.file,
        `${t.path}.constraints`,
        `constraint "${src}" does not parse: ${(e as Error).message}`,
      );
      return;
    }
    // Derived names (e.g. `result`) come from the generator; the engine checks those (V15).
    if (![...identifiers(expr)].every((id) => id in params)) return;
    try {
      if (!evaluate(expr, params))
        d.error('V21', file, path, `params break ${t.value.id}'s constraint "${src}"`);
    } catch (e) {
      if (e instanceof ExprError) d.error('V21', file, path, `constraint "${src}": ${e.message}`);
      else throw e;
    }
  });
}

/** A template whose format only answers with `choice` (multiple choice, 03 §6.5). */
const choiceOnly = (t: LoadedTemplate) => {
  const answers = FORMAT_SUPPORT[t.value.format].answers;
  return answers.length === 1 && answers[0] === 'choice';
};

/**
 * The test-out template pool (03 §6.5), checked by V21 and written to `testOut.templateIds` so the
 * runner draws from exactly the validated set:
 * 1. the skill's abstract templates, or its pictorial ones when it has no abstract template;
 * 2. for a gateway skill whose pool spans fewer than 2 representations, plus its pictorial ones;
 * 3. without choice-only templates when a constructed-response template remains.
 * An authored `testOut.templateIds` is kept as written but must hold no concrete template.
 */
function resolveTestOut(
  id: string,
  s: LoadedContent['skills'][number],
  lesson: LessonSpec,
  own: LoadedTemplate[],
  d: Diagnostics,
  authored: LoadedContent['lessons'][number] | undefined,
): LessonSpec {
  if (lesson.mode === 'none' || lesson.testOut.items === 0) return lesson;
  const file = authored?.file ?? s.file;
  const path = authored ? `${authored.path}.testOut` : s.path;
  if (lesson.testOut.minCorrect > lesson.testOut.items) {
    d.error(
      'V21',
      file,
      path,
      `testOut.minCorrect (${lesson.testOut.minCorrect}) exceeds testOut.items (${lesson.testOut.items})`,
    );
  }
  const repsOf = (list: LoadedTemplate[]) =>
    new Set(
      list.map((t) => t.value.representation ?? FORMAT_DEFAULT_REPRESENTATION[t.value.format]),
    );
  const listed = lesson.testOut.templateIds;
  let pool: LoadedTemplate[];
  if (listed) {
    pool = own.filter((t) => listed.includes(t.value.id));
    for (const t of pool.filter((x) => x.value.tier === 'concrete')) {
      d.error(
        'V21',
        file,
        path,
        `${t.value.id} is concrete; test-out items are abstract or pictorial (03 §6.5)`,
      );
    }
  } else {
    const abstract = own.filter((t) => t.value.tier === 'abstract');
    const pictorial = own.filter((t) => t.value.tier === 'pictorial');
    pool = abstract.length > 0 ? abstract : pictorial;
    if (s.value.gateway && repsOf(pool).size < 2) pool = [...abstract, ...pictorial];
    const constructed = pool.filter((t) => !choiceOnly(t));
    if (constructed.length > 0) pool = constructed;
  }
  if (pool.length === 0) {
    d.error(
      'V21',
      file,
      path,
      `${id} has no abstract or pictorial template for its test-out (03 §6.5)`,
    );
  } else if (s.value.gateway && repsOf(pool).size < 2) {
    d.error(
      'V21',
      file,
      path,
      `gateway skill ${id}: test-out items must span ≥ 2 representations, but its test-out templates use only ${[...repsOf(pool)].join(', ')}`,
    );
  }
  if (listed || pool.length === 0) return lesson;
  const ids = own.filter((t) => pool.includes(t)).map((t) => t.value.id);
  return { ...lesson, testOut: { ...lesson.testOut, templateIds: ids } };
}

// ---------- game data ----------

function checkGame(
  game: GameData,
  files: string[],
  skills: Map<string, unknown>,
  narration: LoadedContent['narration'],
  d: Diagnostics,
): void {
  const file = files.length === 1 ? (files[0] as string) : 'game/';
  const unique = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) d.error('V02', file, kind, `duplicate ${kind} id ${id}`);
      seen.add(id);
    }
    return seen;
  };
  unique(
    'materials',
    game.materials.map((m) => m.id),
  );
  const buildings = unique(
    'buildings',
    game.buildings.map((b) => b.id),
  );
  unique(
    'residents',
    game.residents.map((r) => r.id),
  );
  unique(
    'decor',
    game.decor.map((x) => x.id),
  );
  const decor = new Set(game.decor.map((x) => x.id));
  const materials = new Set(game.materials.map((m) => m.id));
  const rule = (where: string, r: UnlockRule) => {
    if ('skill' in r && !skills.has(r.skill))
      d.error('V04', file, where, `unlock rule names unknown skill ${r.skill}`);
    if ('building' in r && !buildings.has(r.building))
      d.error('V04', file, where, `unlock rule names unknown building ${r.building}`);
    if ('all' in r)
      r.all.forEach((x, i) => {
        rule(`${where}.all[${i}]`, x);
      });
    if ('any' in r)
      r.any.forEach((x, i) => {
        rule(`${where}.any[${i}]`, x);
      });
  };
  const key = (where: string, k: string) => {
    if (!narration.has(k)) d.error('V16', file, where, `narration key ${k} does not exist`);
  };
  game.materials.forEach((m, i) => {
    key(`materials[${i}].name`, m.name);
  });
  game.buildings.forEach((b, i) => {
    rule(`buildings[${i}].unlock`, b.unlock);
    b.levels.forEach((lv, j) => {
      for (const mat of Object.keys(lv.recipe)) {
        if (!materials.has(mat))
          d.error(
            'V04',
            file,
            `buildings[${i}].levels[${j}].recipe.${mat}`,
            `unknown material ${mat}`,
          );
      }
    });
  });
  game.residents.forEach((r, i) => {
    rule(`residents[${i}].arrival.unlock`, r.arrival.unlock);
    if (r.arrival.home && !buildings.has(r.arrival.home)) {
      d.error('V04', file, `residents[${i}].arrival.home`, `unknown building ${r.arrival.home}`);
    }
    r.lines.forEach((l, j) => {
      key(`residents[${i}].lines[${j}]`, l);
    });
    key(`residents[${i}].id`, `res.${r.id}`);
  });
  game.outfits.forEach((o, i) => {
    rule(`outfits[${i}].unlock`, o.unlock);
  });
  game.island.rings.forEach((ring, i) => {
    rule(`island.rings[${i}].unlock`, ring.unlock);
  });
  game.festivals.forEach((f, i) => {
    f.rewardDecor.forEach((x, j) => {
      if (!decor.has(x))
        d.error('V04', file, `festivals[${i}].rewardDecor[${j}]`, `unknown decor ${x}`);
    });
  });
}

// ---------- narration ----------

function checkNarration(
  c: LoadedContent,
  skills: Skill[],
  templates: ItemTemplate[],
  misconceptions: MisconceptionSpec[],
  loadedSkills: Map<string, LoadedContent['skills'][number]>,
  d: Diagnostics,
): NarrationJson {
  const has = (k: string) => c.narration.has(k);
  const referenced = new Map<string, Grade[]>(); // key → grades of the skills that use it
  const need = (file: string, path: string, key: string, grade: Grade | null, what: string) => {
    if (!has(key)) d.error('V16', file, path, `missing narration ${key} (${what})`);
    const list = referenced.get(key) ?? [];
    if (grade) list.push(grade);
    referenced.set(key, list);
  };
  const skillGrade = new Map(skills.map((s) => [s.id, s.grade]));
  for (const s of skills) {
    const src = loadedSkills.get(s.id) as LoadedContent['skills'][number];
    need(src.file, src.path, s.narration.intro, s.grade, `intro of ${s.id}`);
    const lesson = s.lesson;
    need(src.file, src.path, lesson.intro, s.grade, `lesson intro of ${s.id}`);
    if (lesson.outro) need(src.file, src.path, lesson.outro, s.grade, `lesson outro of ${s.id}`);
    for (const e of [...lesson.worked, ...lesson.faded]) {
      for (const step of e.steps ?? []) {
        need(src.file, src.path, step.say, s.grade, `lesson step of ${s.id}`);
        if (step.action?.say)
          need(src.file, src.path, step.action.say, s.grade, `lesson action of ${s.id}`);
      }
    }
  }
  const templateSrc = new Map(c.templates.map((t) => [t.value.id, t]));
  for (const t of templates) {
    const src = templateSrc.get(t.id);
    const grade = skillGrade.get(t.skillId) ?? null;
    const file = src?.file ?? '';
    need(file, `${src?.path}.narration.prompt`, t.narration.prompt, grade, `prompt of ${t.id}`);
    for (const [i, h] of t.narration.hints.entries()) {
      need(file, `${src?.path}.narration.hints[${i}]`, h, grade, `hint of ${t.id}`);
    }
  }
  const mcSrc = new Map(c.misconceptions.map((m) => [m.value.id, m]));
  for (const m of misconceptions) {
    const src = mcSrc.get(m.id);
    const grades = m.skills
      .map((s) => skillGrade.get(s))
      .filter((g): g is Grade => g !== undefined);
    need(src?.file ?? '', `${src?.path}.feedback`, m.feedback, null, `feedback of ${m.id}`);
    referenced.get(m.feedback)?.push(...grades);
  }
  for (const format of [...new Set(templates.map((t) => t.format))].sort(cmp)) {
    need('', '', `fb.${format}.retry`, null, `retry line for the ${format} format in use`);
  }
  for (const k of ALWAYS_REQUIRED_KEYS)
    need('', '', k, null, 'required by every content set (03 §9.2 V16)');
  for (const k of requiredClipKeys())
    need('narration/numbers.yaml', '', k, null, 'clip inventory, 03 §8.3');
  for (const r of c.game?.residents ?? []) referenced.set(`res.${r.id}`, []);
  for (const m of c.game?.materials ?? []) referenced.set(m.name, referenced.get(m.name) ?? []);
  for (const r of c.game?.residents ?? [])
    for (const l of r.lines) referenced.set(l, referenced.get(l) ?? []);
  for (const ctx of c.contexts) {
    for (const n of ctx.value.nouns) {
      referenced.set(`noun.${n}.one`, []);
      referenced.set(`noun.${n}.many`, []);
    }
  }

  // Untyped slots in template prompts must not take string params (every string var needs a type).
  const stringParams = (t: ItemTemplate) =>
    new Set(
      Object.entries(t.params)
        .filter(([, s]) =>
          s.kind === 'const'
            ? typeof s.value === 'string'
            : s.kind === 'choice' && s.values.some((x) => typeof x === 'string'),
        )
        .map(([n]) => n),
    );
  const promptOwners = new Map<string, ItemTemplate[]>();
  for (const t of templates) {
    for (const k of [t.narration.prompt, ...t.narration.hints])
      promptOwners.set(k, [...(promptOwners.get(k) ?? []), t]);
  }
  // Authored lesson steps (and their actions) supply vars directly: key → string var → skill.
  const lessonStringVars = new Map<string, Map<string, string>>();
  const noteVars = (
    key: string,
    vars: Record<string, string | number> | undefined,
    skillId: string,
  ) => {
    for (const [name, value] of Object.entries(vars ?? {})) {
      if (typeof value !== 'string') continue;
      const m = lessonStringVars.get(key) ?? new Map<string, string>();
      m.set(name, skillId);
      lessonStringVars.set(key, m);
    }
  };
  for (const s of skills) {
    for (const e of [...s.lesson.worked, ...s.lesson.faded]) {
      for (const step of e.steps ?? []) {
        noteVars(step.say, step.vars, s.id);
        if (step.action?.say) noteVars(step.action.say, step.action.vars, s.id);
      }
    }
  }

  // Vocabulary: word lists plus island nouns and resident names.
  const island = new Set<string>();
  for (const ctx of c.contexts)
    for (const n of ctx.value.nouns) for (const w of n.split('-')) island.add(w);
  for (const r of c.game?.residents ?? [])
    for (const w of r.name.toLowerCase().split(/[\s-]+/)) island.add(w);
  const known = (w: string, band: string) => {
    const list = band === 'K' || band === '1' ? c.wordlistK1 : c.wordlist2;
    const variants = [w, w.replace(/'s$/, ''), w.replace(/s$/, ''), w.replace(/es$/, '')];
    return (
      variants.some((x) => list.has(x) || island.has(x)) ||
      w.split('-').every((p) => list.has(p) || island.has(p))
    );
  };

  const out: NarrationJson = {};
  const clipKeys = new Set(requiredClipKeys());
  for (const [key, loc] of [...c.narration.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    const e = loc.value;
    const { file, path } = loc;
    if (!/^[a-z]+(\.[A-Za-z0-9-]+)+$/.test(key)) {
      d.error('V16', file, path, `'${key}' is not a NarrationKey (03 §8.1)`);
      continue;
    }
    const text = parseLine(e.text);
    const say = e.say !== undefined ? parseLine(e.say) : null;
    for (const err of [...text.errors, ...(say?.errors ?? [])]) d.error('V16', file, path, err);
    const owners = promptOwners.get(key) ?? [];
    for (const slot of [...slotsOf(text.segments), ...slotsOf(say?.segments ?? [])]) {
      if (slot.type) continue;
      const strTemplates = owners.filter((t) => stringParams(t).has(slot.name));
      if (strTemplates.length > 0) {
        d.error(
          'V16',
          file,
          path,
          `slot {${slot.raw}} takes the string param '${slot.name}' of ${strTemplates.map((t) => t.id).join(', ')}; string vars need a type (03 §8.4)`,
        );
      }
      const lessonSkill = lessonStringVars.get(key)?.get(slot.name);
      if (lessonSkill) {
        d.error(
          'V16',
          file,
          path,
          `slot {${slot.raw}} takes the string var '${slot.name}' of a ${lessonSkill} lesson step; string vars need a type (03 §8.4)`,
        );
      }
    }
    const spoken = say ?? text;
    out[key] = {
      text: e.text,
      ...(e.say !== undefined ? { say: e.say } : {}),
      ...(e.voice !== undefined ? { voice: e.voice } : {}),
      clips: lineClips(key, spoken.segments),
    };

    // V17: reading level on the displayed text, every slot counted as one word.
    const level: Grade =
      e.level ?? ownerGrade(key, skillGrade, templates) ?? lowest(referenced.get(key) ?? []) ?? 'K';
    const band = readingBand(level);
    const limits = READING_LIMITS[band];
    const display = renderWithPlaceholders(text.segments, () => '0');
    const n = words(display).length;
    if (n > limits.words)
      d.error(
        'V17',
        file,
        path,
        `${n} words; reading level ${level} allows ${limits.words} per line (split it into more keys)`,
      );
    const sentences = sentenceCount(display);
    if (sentences > limits.sentences)
      d.error(
        'V17',
        file,
        path,
        `${sentences} sentences; reading level ${level} allows ${limits.sentences} per line`,
      );
    const tokens = [
      ...words(display),
      ...(e.say ? words(renderWithPlaceholders(spoken.segments, () => '0')) : []),
    ]
      .map(vocabWord)
      .filter((w): w is string => w !== null);
    const parts = tokens.flatMap((w) => [w, ...w.split('-')]);
    const toneHits = key.startsWith('fb.')
      ? parts.filter((w) => FEEDBACK_TONE_WORDS.includes(w))
      : [];
    const denyHits = parts.filter((w) => c.denylist.has(w));
    for (const w of new Set([...toneHits, ...denyHits])) {
      d.error(
        'V17',
        file,
        path,
        `'${w}' is not allowed in a child line (03 §8.5 tone${toneHits.includes(w) ? '; feedback names what to look at next' : ''})`,
      );
    }
    if (!clipKeys.has(key)) {
      const unknown = [
        ...new Set(
          words(display)
            .map(vocabWord)
            .filter((w): w is string => w !== null),
        ),
      ].filter((w) => !known(w, band));
      if (unknown.length > 0) {
        d.warn(
          'V17',
          file,
          path,
          `not on the ${band === 'K' || band === '1' ? 'K–1' : 'grade 2'} word list: ${unknown.join(', ')}`,
        );
      }
    }
  }
  // Orphans (warn): content-owned keys nothing references.
  for (const key of c.narration.keys()) {
    if (/^(sk|tp|ls|fb\.mc)\./.test(key) && !referenced.has(key)) {
      const loc = c.narration.get(key);
      d.warn(
        'V16',
        loc?.file ?? '',
        loc?.path ?? key,
        `orphan narration key ${key}: nothing references it`,
      );
    }
  }
  return out;
}

function lowest(grades: Grade[]): Grade | null {
  if (grades.length === 0) return null;
  return grades.reduce((a, b) => (gradeIndex(a) <= gradeIndex(b) ? a : b));
}

/** sk.<SkillId>.*, ls.<SkillId>.* and tp.<TemplateId>.* take their skill's grade (03 §8.2 `level`). */
function ownerGrade(
  key: string,
  grades: Map<string, Grade>,
  templates: ItemTemplate[],
): Grade | null {
  const m = /^(sk|ls|tp)\.([A-Z]{2,4}\.\d{2})(\.t\d+)?\./.exec(key);
  if (!m) return null;
  if (m[1] === 'tp' && m[3]) {
    const t = templates.find((x) => x.id === `${m[2]}${m[3]}`);
    return t ? (grades.get(t.skillId) ?? null) : null;
  }
  return grades.get(m[2] as string) ?? null;
}

// ---------- output ----------

function serialize(content: CompiledContent): {
  outputs: Record<string, string>;
  contentVersion: string;
} {
  // The outputs must satisfy the shared contracts (02 §5.1, §5.5, §5.8); a failure is a compiler bug.
  const assert = (name: string, ok: boolean, detail: () => string) => {
    if (!ok) throw new Error(`content compiler produced an invalid ${name}: ${detail()}`);
  };
  for (const s of content.skills) {
    const r = skillSchema.safeParse(s);
    assert('skill', r.success, () => `${s.id}: ${JSON.stringify(r.error?.issues)}`);
  }
  for (const t of content.templates) {
    const r = itemTemplateSchema.safeParse(t);
    assert('template', r.success, () => `${t.id}: ${JSON.stringify(r.error?.issues)}`);
  }
  for (const m of content.misconceptions) {
    const r = misconceptionSpecSchema.safeParse(m);
    assert('misconception', r.success, () => `${m.id}: ${JSON.stringify(r.error?.issues)}`);
  }
  const nr = narrationJsonSchema.safeParse(content.narration);
  assert('narration.json', nr.success, () => JSON.stringify(nr.error?.issues.slice(0, 3)));
  const gr = gameDataSchema.safeParse(content.game);
  assert('game.json', gr.success, () => JSON.stringify(gr.error?.issues.slice(0, 3)));

  const parts = {
    skills: canonicalJson(content.skills),
    templates: canonicalJson(content.templates),
    misconceptions: canonicalJson(content.misconceptions),
    narration: canonicalJson(content.narration),
    graph: canonicalJson(content.graph),
    standards: canonicalJson(content.standards),
    contexts: canonicalJson(content.contexts),
    game: canonicalJson(content.game),
  };
  const contentVersion = sha256Hex(
    [
      parts.skills,
      parts.templates,
      parts.misconceptions,
      parts.narration,
      parts.graph,
      parts.standards,
      parts.contexts,
    ].join('\n'),
  ).slice(0, 16);
  const outputs: Record<string, string> = {};
  for (const [name, json] of Object.entries(parts)) outputs[`${name}.json`] = `${json}\n`;
  const manifest: ContentManifest = {
    contentVersion,
    schemaVersion: 1,
    counts: {
      skills: content.skills.length,
      templates: content.templates.length,
      misconceptions: content.misconceptions.length,
      narrationKeys: Object.keys(content.narration).length,
    },
    files: Object.fromEntries(
      Object.entries(outputs).map(([name, text]) => [name, sha256Hex(text)]),
    ),
  };
  outputs['manifest.json'] = `${canonicalJson(manifest)}\n`;
  return { outputs, contentVersion };
}
