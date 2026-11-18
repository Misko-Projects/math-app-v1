// Test support: a small synthetic skill graph whose templates use an unregistered generator, so
// every item's difficulty is its template base (0 unless set). Not part of the engine API.
//
//   A (root, concept) ── B (gateway) ── C (encompasses B 0.8, A 0.3)
//    └── F (fact-fluency, median 3,000 ms)        N (lesson mode none, prereq A)

import type {
  AttemptPayload,
  ItemFormat,
  ItemTemplate,
  Representation,
  Skill,
  SkillGraph,
  Tier,
} from '@number-island/shared';
import { DAY_MS } from '../params';
import { buildSkillGraph } from './graph';

export const T0 = Date.UTC(2026, 10, 2, 16); // fixed epoch for tests (a Monday)
export const day = (n: number) => T0 + n * DAY_MS;

interface TemplateDef {
  n: number;
  tier: Tier;
  format: ItemFormat;
  representation: Representation;
  expectedLatencyMs?: number;
}

const DEFAULT_TEMPLATES: TemplateDef[] = [
  { n: 1, tier: 'concrete', format: 'tap-count', representation: 'objects' },
  { n: 2, tier: 'pictorial', format: 'tenframe-fill', representation: 'ten-frame' },
  { n: 3, tier: 'abstract', format: 'number-pad', representation: 'symbols' },
  { n: 4, tier: 'abstract', format: 'number-bond', representation: 'number-bond' },
];

function template(skillId: string, d: TemplateDef): ItemTemplate {
  return {
    id: `${skillId}.t${d.n}`,
    skillId,
    format: d.format,
    tier: d.tier,
    representation: d.representation,
    ...(d.expectedLatencyMs ? { expectedLatencyMs: d.expectedLatencyMs } : {}),
    generator: 'test.none',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'sk.test.prompt', hints: [] },
  };
}

function skill(
  id: string,
  extra: Partial<Skill> & { templateDefs?: TemplateDef[] } = {},
): { skill: Skill; templates: ItemTemplate[] } {
  const defs = extra.templateDefs ?? DEFAULT_TEMPLATES;
  const templates = defs.map((d) => template(id, d));
  const { templateDefs: _ignored, ...rest } = extra;
  return {
    templates,
    skill: {
      id,
      name: id,
      strand: id.split('.')[0] as Skill['strand'],
      kind: 'concept',
      grade: 'K',
      standards: { ccss: [] },
      prerequisites: [],
      encompasses: {},
      related: [],
      gateway: false,
      representations: [...new Set(defs.map((d) => d.representation))],
      templates: templates.map((t) => t.id),
      lesson: {
        mode: 'auto',
        templateId: `${id}.t1`,
        intro: `sk.${id}.intro`,
        worked: [{ seed: 1 }],
        faded: [],
        scaffolded: { count: 0, hintStart: 1 },
        testOut: { items: 3, minCorrect: 3 },
      },
      misconceptions: [],
      narration: { intro: `sk.${id}.intro` },
      ...rest,
    },
  };
}

export function syntheticGraph(): SkillGraph {
  const parts = [
    skill('CNT.01'),
    skill('CNT.02', { prerequisites: ['CNT.01'], gateway: true }),
    skill('CNT.03', { prerequisites: ['CNT.02'], encompasses: { 'CNT.02': 0.8, 'CNT.01': 0.3 } }),
    skill('ADD.01', {
      prerequisites: ['CNT.01'],
      kind: 'fact-fluency',
      fluency: { medianLatencyMs: 3_000 },
    }),
    skill('CNT.04', { prerequisites: ['CNT.01'] }),
  ];
  const nonePart = parts[4] as { skill: Skill };
  nonePart.skill.lesson = { ...nonePart.skill.lesson, mode: 'none', worked: [] };
  return buildSkillGraph({
    contentVersion: 'test',
    skills: parts.map((p) => p.skill),
    templates: parts.flatMap((p) => p.templates),
    graph: {
      nodes: ['CNT.01', 'ADD.01', 'CNT.02', 'CNT.04', 'CNT.03'],
      roots: ['CNT.01'],
      gateways: ['CNT.02'],
      depth: { 'CNT.01': 0, 'ADD.01': 1, 'CNT.02': 1, 'CNT.04': 1, 'CNT.03': 2 },
      descendants2: { 'CNT.01': 4, 'ADD.01': 0, 'CNT.02': 1, 'CNT.04': 0, 'CNT.03': 0 },
    },
  });
}

export const A = 'CNT.01';
export const B = 'CNT.02';
export const C = 'CNT.03';
export const F = 'ADD.01';
export const N = 'CNT.04';

/** An attempt on template n of a skill (defaults: correct, first try, practice, 3 s). */
export function attempt(
  skillId: string,
  n: number,
  over: Partial<AttemptPayload> = {},
): AttemptPayload {
  const def = DEFAULT_TEMPLATES.find((d) => d.n === n) as TemplateDef;
  const correct = over.correct ?? true;
  return {
    sessionId: 's1',
    skillId,
    templateId: `${skillId}.t${n}`,
    seed: 1,
    params: {},
    format: def.format,
    tier: def.tier,
    representation: def.representation,
    response: { kind: 'number', value: 1 },
    correct,
    partialCredit: correct ? ((over.hintsUsed ?? 0) > 0 ? 0.5 : 1) : 0,
    latencyMs: 3_000,
    hintsUsed: 0,
    attemptNo: 1,
    misconceptionIds: [],
    context: 'practice',
    workshopId: null,
    ...over,
  };
}
