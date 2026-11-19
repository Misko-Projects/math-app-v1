// tools/content-check (03 §9.2): the engine-dependent content checks V13–V15, V22, V25 and V27, the
// engine parts of V04, V16, V17, V18 and V21, and `template-stats.json`. It imports the compiled
// content (packages/content/dist) and the engine, which packages/content never does (02 §2).

import { constraintIdentifiers, parseConstraint } from '@number-island/content';
import {
  applicableMisconceptions,
  constraintHolds,
  createRng,
  featureWeight,
  generateItem,
  generateItemFromParams,
  generatorFeatures,
  generatorIdentifiers,
  generatorParams,
  generatorRegistered,
  initContent,
  isConstructedTemplate,
  itemFeatures,
  mergedSpec,
  misconceptionRule,
  PARAMS,
  registry,
  specDomain,
} from '@number-island/engine';
import {
  type DifficultyStats,
  difficultyStats,
  runTemplateProperties,
} from '@number-island/engine/testing';
import {
  FORMAT_SUPPORT,
  type GeneratedItem,
  type ItemTemplate,
  type MisconceptionSpec,
  type NarrationJson,
  type ParamSpec,
  type ParamValue,
  type Skill,
} from '@number-island/shared';

export type EngineCheckId =
  | 'V04'
  | 'V13'
  | 'V14'
  | 'V15'
  | 'V16'
  | 'V17'
  | 'V18'
  | 'V21'
  | 'V22'
  | 'V25'
  | 'V27';

export interface EngineDiagnostic {
  check: EngineCheckId;
  severity: 'error' | 'warn';
  file: string;
  path: string;
  message: string;
}

export interface CompiledInput {
  skills: Skill[];
  templates: ItemTemplate[];
  misconceptions: MisconceptionSpec[];
  narration: NarrationJson;
}

export interface EngineCheckOptions {
  /** Seeds per template for the V15 property test (PR CI 100, nightly 500). */
  propertyN: number;
  /** Seeds for the V22 statistics and V25 discrimination (03 §9.2: 500). */
  statsN?: number;
  /**
   * Run V15's difficulty-targeting property (default true). It costs about 100 targeted items per
   * template whatever `propertyN` is; the CLI (`pnpm content:validate`) always runs it, and a test
   * that only checks the run end to end may skip it.
   */
  targeting?: boolean;
}

export interface EngineCheckResult {
  diagnostics: EngineDiagnostic[];
  templateStats: Record<string, DifficultyStats>;
}

const templateFile = (t: ItemTemplate): string => `templates/${t.skillId.split('.')[0]}.yaml`;
const misconceptionFile = (m: MisconceptionSpec): string => `misconceptions/${m.area}.yaml`;

/** Values a spec can produce, for type checks (ints and choice/const values). */
function specValues(s: ParamSpec): unknown[] {
  switch (s.kind) {
    case 'int':
      return [s.min, s.max, ...(s.exclude ?? [])];
    case 'choice':
      return s.values;
    case 'bool':
      return [true];
    case 'const':
      return [s.value];
  }
}

function domainSize(s: ParamSpec): number {
  switch (s.kind) {
    case 'int': {
      const step = s.step ?? 1;
      const excluded = new Set(
        (s.exclude ?? []).filter((v) => v >= s.min && v <= s.max && (v - s.min) % step === 0),
      );
      return Math.floor((s.max - s.min) / step) + 1 - excluded.size;
    }
    case 'choice':
      return new Set(s.values).size;
    case 'bool':
      return s.p <= 0 || s.p >= 1 ? 1 : 2;
    case 'const':
      return 1;
  }
}

const ENUMERATION_CAP = 20_000;

/**
 * V22's parameter-space size: the number of distinct valid param sets the template allows. When
 * the product of the domains is small enough, every combination is enumerated, normalised the
 * way the generator draws it (`sample` over single-value specs, so params a mode ignores drop
 * out), derived, and kept when the generator accepts it and every constraint holds. Larger spaces
 * fall back to the product, capped.
 */
export function parameterSpace(t: ItemTemplate): number {
  const g = registry.get(t.generator);
  if (!g) return 0;
  const spec = mergedSpec(t, g);
  const keys = Object.keys(spec).sort();
  const product = keys.reduce((acc, k) => Math.min(1e9, acc * domainSize(spec[k] as ParamSpec)), 1);
  if (product > ENUMERATION_CAP) return product;
  const domains = keys.map((k) => specDomain(spec[k] as ParamSpec));
  const seen = new Set<string>();
  const rng = createRng(0);
  const walk = (i: number, combo: Record<string, ParamValue>): void => {
    if (i === keys.length) {
      const single = Object.fromEntries(
        Object.entries(combo).map(([k, v]) => [k, { kind: 'const' as const, value: v }]),
      );
      const raw = g.sample(single, rng);
      const p = { ...raw, ...g.derive(raw) };
      if (g.accepts && !g.accepts(p, t)) return;
      try {
        if (!(t.constraints ?? []).every((c) => constraintHolds(c, p))) return;
      } catch {
        return;
      }
      seen.add(
        JSON.stringify(
          Object.keys(p)
            .sort()
            .map((k) => [k, p[k]]),
        ),
      );
      return;
    }
    for (const v of domains[i] as ParamValue[]) walk(i + 1, { ...combo, [keys[i] as string]: v });
  };
  walk(0, {});
  return seen.size;
}

export function runEngineChecks(input: CompiledInput, opts: EngineCheckOptions): EngineCheckResult {
  const statsN = opts.statsN ?? 500;
  const out: EngineDiagnostic[] = [];
  const err = (check: EngineCheckId, file: string, path: string, message: string) =>
    out.push({ check, severity: 'error', file, path, message });
  const warn = (check: EngineCheckId, file: string, path: string, message: string) =>
    out.push({ check, severity: 'warn', file, path, message });

  initContent({
    templates: input.templates,
    narration: input.narration,
    misconceptions: input.misconceptions,
  });
  const templateStats: Record<string, DifficultyStats> = {};
  const usable: ItemTemplate[] = [];

  // ---------- V14 and V13 (static) ----------
  for (const t of input.templates) {
    const file = templateFile(t);
    if (!registry.get(t.generator)) {
      err('V14', file, t.id, `generator ${t.generator} is not registered`);
      continue;
    }
    if (!generatorRegistered(t.generator, t.format)) {
      err('V14', file, t.id, `generator ${t.generator} does not build format ${t.format}`);
      continue;
    }
    let ok = true;
    const decls = generatorParams(t.generator);
    for (const [name, spec] of Object.entries(t.params)) {
      const decl = decls[name];
      if (!decl) {
        err('V13', file, `${t.id}.params.${name}`, `${t.generator} declares no param '${name}'`);
        ok = false;
        continue;
      }
      for (const v of specValues(spec)) {
        const good =
          decl.type === 'int'
            ? typeof v === 'number' && Number.isInteger(v)
            : decl.type === 'bool'
              ? typeof v === 'boolean'
              : typeof v === 'string' && (decl.values === undefined || decl.values.includes(v));
        if (!good) {
          err(
            'V13',
            file,
            `${t.id}.params.${name}`,
            `value ${JSON.stringify(v)} is not a valid ${decl.type}${decl.values ? ` (${decl.values.join(', ')})` : ''}`,
          );
          ok = false;
        }
      }
    }
    const known = new Set(generatorIdentifiers(t.generator));
    for (const [i, c] of (t.constraints ?? []).entries()) {
      try {
        const unknown = [...constraintIdentifiers(parseConstraint(c))].filter((n) => !known.has(n));
        if (unknown.length > 0) {
          err(
            'V13',
            file,
            `${t.id}.constraints[${i}]`,
            `unknown identifier(s) ${unknown.join(', ')} in "${c}"`,
          );
          ok = false;
        }
      } catch (e) {
        err('V13', file, `${t.id}.constraints[${i}]`, `constraint "${c}": ${(e as Error).message}`);
        ok = false;
      }
    }
    const features = generatorFeatures(t.generator, t.format);
    for (const f of Object.keys(t.difficulty.features)) {
      if (!(f in features)) {
        err(
          'V13',
          file,
          `${t.id}.difficulty.features.${f}`,
          `'${f}' is not a feature of ${t.generator} or ${t.format}`,
        );
        ok = false;
      }
    }
    if (ok) usable.push(t);
  }

  // ---------- V04 / V16 / V18 (engine parts) ----------
  for (const g of registry.all()) {
    for (const key of g.narration) {
      if (!input.narration[key])
        err(
          'V16',
          'narration/common.yaml',
          key,
          `generator ${g.id} declares ${key}, which does not exist`,
        );
    }
  }
  for (const m of input.misconceptions) {
    const file = misconceptionFile(m);
    for (const id of m.appliesTo.generators) {
      if (!registry.get(id))
        err('V04', file, `${m.id}.appliesTo`, `generator ${id} is not registered`);
    }
    const rule = misconceptionRule(m.detect.rule);
    if (!rule) {
      err('V18', file, `${m.id}.detect.rule`, `rule '${m.detect.rule}' is not registered`);
      continue;
    }
    if (rule.kind !== m.detect.kind) {
      err(
        'V18',
        file,
        `${m.id}.detect.kind`,
        `rule '${rule.id}' is a ${rule.kind} rule, not ${m.detect.kind}`,
      );
    }
    for (const [i, ex] of m.examples.entries()) {
      const generator = ex.generator ?? m.appliesTo.generators[0];
      const candidates = input.templates.filter((t) => t.generator === generator);
      const ofSkill = candidates.filter((t) => m.skills.includes(t.skillId));
      const pool = ofSkill.length > 0 ? ofSkill : candidates;
      const t =
        pool.find((x) => FORMAT_SUPPORT[x.format].answers.includes(ex.response.kind as never)) ??
        pool[0];
      if (!t) {
        err('V18', file, `${m.id}.examples[${i}]`, `no template uses generator ${generator}`);
        continue;
      }
      let item: GeneratedItem;
      try {
        item = generateItemFromParams(t, ex.params);
      } catch (e) {
        err(
          'V18',
          file,
          `${m.id}.examples[${i}]`,
          `cannot build an item from the example params on ${t.id}: ${(e as Error).message}`,
        );
        continue;
      }
      const got = rule.match(item, ex.response, ex.meta);
      if (got !== ex.match) {
        err(
          'V18',
          file,
          `${m.id}.examples[${i}]`,
          `rule '${rule.id}' returns ${got} on ${t.id}, but the example declares ${ex.match}`,
        );
      }
    }
  }

  // ---------- V15 (+ V17 hint reveals), V22, V25 ----------
  for (const t of usable) {
    const file = templateFile(t);
    let stats: DifficultyStats;
    try {
      stats = difficultyStats(t, statsN);
    } catch (e) {
      err('V15', file, t.id, (e as Error).message);
      continue;
    }
    templateStats[t.id] = stats;
    const report = runTemplateProperties(t, {
      n: opts.propertyN,
      stats,
      targeting: opts.targeting !== false,
    });
    for (const f of report.failures.slice(0, 5)) {
      const check: EngineCheckId = f.step === '7.hint-reveals' ? 'V17' : 'V15';
      err(
        check,
        file,
        t.id,
        `step ${f.step}${f.seed !== null ? ` (seed ${f.seed})` : ''}: ${f.message}`,
      );
    }
    if (report.failures.length > 5) {
      err('V15', file, t.id, `… and ${report.failures.length - 5} more property failure(s)`);
    }
    // Every feature an item emits must have a weight somewhere (V13, checked on generated items).
    const g = registry.get(t.generator);
    const unweighted = new Set<string>();
    for (let seed = 1; g && seed <= 50; seed += 1) {
      for (const f of Object.keys(itemFeatures(generateItem(t, seed), t))) {
        if (featureWeight(t, g, f) === undefined) unweighted.add(f);
      }
    }
    for (const f of unweighted) {
      err(
        'V13',
        file,
        t.id,
        `feature '${f}' has no weight (template, ${t.generator} or ${t.format})`,
      );
    }
    // V22
    if (Math.abs(stats.median) > 1.0) {
      warn(
        'V22',
        file,
        t.id,
        `median difficulty ${stats.median.toFixed(2)} is outside ±1.0; adjust difficulty.base`,
      );
    }
    if (stats.p90 - stats.p10 < 0.3 - 1e-9) {
      warn(
        'V22',
        file,
        t.id,
        `difficulty range p90 − p10 = ${(stats.p90 - stats.p10).toFixed(2)} < 0.3: little room for targeting`,
      );
    }
    const space = parameterSpace(t);
    if (stats.distinct < Math.min(50, space)) {
      warn(
        'V22',
        file,
        t.id,
        `${stats.distinct} distinct items over ${statsN} seeds (parameter space ≈ ${space})`,
      );
    }
    // V25: discrimination of each applicable misconception with predict
    const counts = new Map<string, { hits: number; total: number }>();
    for (let seed = 1; seed <= statsN; seed += 1) {
      const item = generateItem(t, seed);
      for (const { spec: mc, rule } of applicableMisconceptions(item, [
        'answer',
        'state',
        'process',
      ])) {
        if (!rule.predict) continue;
        const c = counts.get(mc.id) ?? { hits: 0, total: 0 };
        c.total += 1;
        if (rule.predict(item) !== null) c.hits += 1;
        counts.set(mc.id, c);
      }
    }
    for (const [id, c] of counts) {
      if (c.total > 0 && c.hits / c.total < 0.2) {
        warn(
          'V25',
          file,
          t.id,
          `${id} discriminates on only ${Math.round((100 * c.hits) / c.total)}% of items (< 20%)`,
        );
      }
    }
  }

  // ---------- V21 (engine part): test-out pools by generated answer kind ----------
  const byId = new Map(input.templates.map((t) => [t.id, t]));
  const answerKind = (t: ItemTemplate): 'choice' | 'constructed' | null => {
    try {
      const kinds = new Set<string>();
      for (let seed = 1; seed <= 10; seed += 1) kinds.add(generateItem(t, seed).answer.kind);
      if (kinds.size === 1 && kinds.has('choice')) return 'choice';
      return kinds.has('choice') ? null : 'constructed';
    } catch {
      return null;
    }
  };
  for (const s of input.skills) {
    const pool = (s.lesson.testOut.templateIds ?? [])
      .map((id) => byId.get(id))
      .filter((t): t is ItemTemplate => !!t);
    if (pool.length === 0 || s.lesson.mode === 'none') continue;
    const tiers = new Set(pool.map((t) => t.tier));
    const eligible = input.templates.filter(
      (t) => t.skillId === s.id && tiers.has(t.tier) && t.tier !== 'concrete',
    );
    const constructedExists = eligible.some((t) => answerKind(t) === 'constructed');
    for (const t of pool) {
      if (constructedExists && answerKind(t) === 'choice') {
        err(
          'V21',
          `skills/${s.strand}.yaml`,
          `${s.id}.lesson.testOut.templateIds`,
          `${t.id} generates choice answers, but the skill has constructed-response templates for its test-out (03 §6.5)`,
        );
      }
    }
  }

  // ---------- V27: ordinary practice can reach practiced (04 §3, §7a) ----------
  // Only constructed-answer first attempts are evidence, so a skill's constructed templates alone
  // must be able to meet its practiced variety rule: a standard skill needs 2 distinct formats or
  // tiers among them with a pictorial or abstract one, a gateway skill 3 representations with an
  // abstract one. Otherwise practice never makes the skill practiced and its dependents stay locked.
  const { standard, gateway } = PARAMS.mastery;
  for (const s of input.skills) {
    const evidence = input.templates.filter((t) => t.skillId === s.id && isConstructedTemplate(t));
    const file = `skills/${s.strand}.yaml`;
    const ids = evidence.map((t) => t.id).join(', ') || 'none';
    const reachable = s.gateway
      ? new Set(evidence.map((t) => t.representation)).size >= gateway.variety &&
        evidence.some((t) => t.tier === 'abstract')
      : (new Set(evidence.map((t) => t.format)).size >= standard.variety ||
          new Set(evidence.map((t) => t.tier)).size >= standard.variety) &&
        evidence.some((t) => t.tier === 'pictorial' || t.tier === 'abstract');
    if (!reachable) {
      const need = s.gateway
        ? `≥ ${gateway.variety} representations including an abstract one`
        : `≥ ${standard.variety} distinct formats or tiers, one pictorial or abstract`;
      err(
        'V27',
        file,
        s.id,
        `${s.id} cannot reach practiced through practice: its constructed-answer templates (${ids}) need ${need} (04 §3)`,
      );
    }
  }

  return { diagnostics: out, templateStats };
}
