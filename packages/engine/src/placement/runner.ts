// 04 §5 placement runner ("graph-propagated adaptive placement"): grade priors, probe selection,
// BKT-style updates propagated through the skill graph, the stop rules and the item budgets.
// Pure and deterministic: the run is plain data, every function returns a new run, the probe
// seeds derive from the placement id, and time only enters through the answers' `ts`.

import type {
  AnyEventEnvelope,
  ChildContext,
  EventPayloads,
  Grade,
  PlannedTask,
  SkillGraph,
  SkillId,
  SkillState,
  TemplateId,
} from '@number-island/shared';
import { isEvent, sameId, sortEvents } from '../folds/order';
import { isConstructedTemplate } from '../items/answer-kind';
import { createEloFireModel } from '../learner/elo-fire';
import { descendantsWithin } from '../learner/graph';
import { type EngineParams, PARAMS } from '../params';
import { createRng, fnv1a32 } from '../rng';
import type {
  PlacementAnswer,
  PlacementBudget,
  PlacementContext,
  PlacementRun,
  StartPlacementInput,
} from './types';

type PlacementParams = EngineParams['placement'];

const GRADE_INDEX: Readonly<Record<Grade, number>> = {
  K: 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  HS: 9,
};

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const inRange = (p: number, [lo, hi]: readonly [number, number]): boolean => p >= lo && p <= hi;
const onTrack = (st: SkillState | undefined): boolean =>
  st !== undefined && (st.practicedAt !== null || st.assumed);

/** Rounds a posterior for the `placement.completed` output (deterministic, 4 decimals). */
export const roundPosterior = (p: number): number => Math.round(p * 10_000) / 10_000;

// ---------- priors and budgets ----------

/** §5 prior by the skill's grade label vs the child's grade g (K = 0, HS = 9; advanced → g + 1). */
export function gradePrior(
  skillGrade: Grade,
  child: Pick<ChildContext, 'grade' | 'advanced'>,
  params: EngineParams = PARAMS,
): number {
  const P = params.placement;
  const g = GRADE_INDEX[child.grade] + (child.advanced ? 1 : 0);
  const d = GRADE_INDEX[skillGrade] - g;
  if (d <= -1) return P.priorBelow;
  if (d === 0) return P.priorAt;
  if (d === 1) return P.priorAbove;
  return P.priorFar;
}

/** §5 item budget: K 12 × ≤ 4 mini-sessions, G1+ 20 × ≤ 3; a mini-placement is one of ≤ miniMax. */
export function placementBudget(
  child: Pick<ChildContext, 'isK'>,
  mini: boolean,
  params: EngineParams = PARAMS,
): PlacementBudget {
  const P = params.placement;
  if (mini) return { perSession: P.miniMax, sessions: 1 };
  return { ...(child.isK ? P.budgetK : P.budgetG2) };
}

// ---------- BKT update ----------

export interface BktObservation {
  /** p(v) before the probe. */
  p: number;
  correct: boolean;
  skipped: boolean;
  /** Correct, but slower than rating.slowFactor × expected latency. */
  slow: boolean;
  /** k for a k-choice item (guess 1/k). */
  choices?: number;
}

/** §5 step 3: the BKT-style posterior of the probed skill. */
export function bktPosterior(o: BktObservation, params: EngineParams = PARAMS): number {
  const P = params.placement;
  const G = o.choices !== undefined && o.choices >= 2 ? 1 / o.choices : P.guess;
  const S = P.slip;
  const { p } = o;
  const wrong = (p * S) / (p * S + (1 - p) * (1 - G));
  if (o.skipped) return P.skipWeight * wrong + (1 - P.skipWeight) * p;
  if (!o.correct) return wrong;
  const right = (p * (1 - S)) / (p * (1 - S) + (1 - p) * G);
  return o.slow ? (1 - P.slowBlend) * right + P.slowBlend * p : right;
}

// ---------- graph neighbourhoods (memoized per graph) ----------

interface Hop {
  id: SkillId;
  hops: number;
}
const ancestorCache = new WeakMap<SkillGraph, Map<string, Hop[]>>();
const descendantCache = new WeakMap<SkillGraph, Map<string, Hop[]>>();

function cached(
  cache: WeakMap<SkillGraph, Map<string, Hop[]>>,
  graph: SkillGraph,
  skill: SkillId,
  maxHops: number,
  build: () => Hop[],
): Hop[] {
  let m = cache.get(graph);
  if (!m) {
    m = new Map();
    cache.set(graph, m);
  }
  const key = `${maxHops}:${skill}`;
  let v = m.get(key);
  if (!v) {
    v = build();
    m.set(key, v);
  }
  return v;
}

/** Ancestors (prerequisite closure) of `skill` within `maxHops` hops, nearest hop first (a copy). */
export function ancestorsWithin(graph: SkillGraph, skill: SkillId, maxHops: number): Hop[] {
  return ancestors(graph, skill, maxHops).map((h) => ({ ...h }));
}

/** The memoized ancestor list; internal only, so callers can never mutate the cache. */
function ancestors(graph: SkillGraph, skill: SkillId, maxHops: number): readonly Hop[] {
  return cached(ancestorCache, graph, skill, maxHops, () => {
    const out: Hop[] = [];
    const seen = new Set<SkillId>([skill]);
    let layer: SkillId[] = [skill];
    for (let h = 1; h <= maxHops && layer.length > 0; h++) {
      const next: SkillId[] = [];
      for (const id of layer)
        for (const a of graph.prereqs[id] ?? []) {
          if (seen.has(a)) continue;
          seen.add(a);
          next.push(a);
          out.push({ id: a, hops: h });
        }
      layer = next.sort();
    }
    return out;
  });
}

const descendants = (graph: SkillGraph, skill: SkillId, maxHops: number): Hop[] =>
  cached(descendantCache, graph, skill, maxHops, () => descendantsWithin(graph, skill, maxHops));

// ---------- probe templates and seeds ----------

const TIER_RANK: Readonly<Record<string, number>> = { abstract: 0, pictorial: 1, concrete: 2 };

/**
 * §5 step 2: the templates a probe of `skill` rotates through. Abstract or pictorial tier with a
 * constructed response (`isConstructedTemplate`, the template's own answer kind); else any abstract or pictorial template; else any
 * template. Abstract first, then by id.
 */
export function probeTemplates(graph: SkillGraph, skill: SkillId): TemplateId[] {
  const all = [...(graph.skills[skill]?.templates ?? [])]
    .filter((t) => graph.templates[t] !== undefined)
    .sort(cmp);
  const tiered = all.filter((t) => {
    const tier = graph.templates[t]?.tier;
    return tier === 'abstract' || tier === 'pictorial';
  });
  const constructed = tiered.filter((t) => {
    const tpl = graph.templates[t];
    return tpl !== undefined && isConstructedTemplate(tpl);
  });
  const pool = constructed.length > 0 ? constructed : tiered.length > 0 ? tiered : all;
  const rank = (t: TemplateId) => TIER_RANK[graph.templates[t]?.tier ?? 'concrete'] ?? 2;
  return [...pool].sort((a, b) => rank(a) - rank(b) || cmp(a, b));
}

/** The seed of probe number `n` (0-based) of a placement. */
export function placementProbeSeed(placementId: string, n: number): number {
  return createRng(fnv1a32(`placement:${placementId}`))
    .fork(`probe:${n}`)
    .int(0, 0x7fffffff);
}

// ---------- selection and stop rules ----------

const onTrackSet = (run: PlacementRun): Set<SkillId> => new Set(run.onTrack);

/** Scope skills the placement estimates and may probe (off the practiced track). */
function openScope(run: PlacementRun): SkillId[] {
  const track = onTrackSet(run);
  return run.scope.filter((s) => !track.has(s));
}

const pOf = (run: PlacementRun, s: SkillId): number => run.p[s] ?? 0;

/** Probe candidates: open scope skills with p in candidateRange, probed < maxProbesPerSkill times. */
export function placementCandidates(
  run: PlacementRun,
  graph: SkillGraph,
  params: EngineParams = PARAMS,
): SkillId[] {
  const P = params.placement;
  return openScope(run).filter(
    (s) =>
      inRange(pOf(run, s), P.candidateRange) &&
      (run.probeCount[s] ?? 0) < P.maxProbesPerSkill &&
      probeTemplates(graph, s).length > 0,
  );
}

export interface ProbeScore {
  skillId: SkillId;
  score: number;
  /** U(v): uncertain open-scope skills among the ancestors and descendants within uncertaintyHops. */
  uncertain: number;
  /** 0.5 + 0.5 × share of direct prerequisites with p ≥ 0.5 (1 without prerequisites). */
  answerable: number;
  boost: number;
}

/** §5 step 1: every candidate's score, best first (ties by skill id). */
export function probeScores(
  run: PlacementRun,
  graph: SkillGraph,
  params: EngineParams = PARAMS,
): ProbeScore[] {
  const P = params.placement;
  const open = new Set(openScope(run));
  const gateways = new Set(graph.gateways);
  const uncertainSkill = (s: SkillId) => open.has(s) && inRange(pOf(run, s), P.candidateRange);
  const out: ProbeScore[] = placementCandidates(run, graph, params).map((v) => {
    const p = pOf(run, v);
    let uncertain = 0;
    for (const a of ancestors(graph, v, P.uncertaintyHops)) if (uncertainSkill(a.id)) uncertain++;
    for (const d of descendants(graph, v, P.uncertaintyHops)) if (uncertainSkill(d.id)) uncertain++;
    const pre = graph.prereqs[v] ?? [];
    const answerable =
      pre.length === 0
        ? 1
        : 0.5 + (0.5 * pre.filter((q) => pOf(run, q) >= 0.5).length) / pre.length;
    const gateway = gateways.has(v) || graph.skills[v]?.gateway === true;
    const boost = run.boost[v] ?? 0;
    const score =
      (1 - Math.abs(2 * p - 1)) *
        (1 + P.uncertaintyWeight * uncertain) *
        (gateway ? P.gatewayBoost : 1) *
        answerable +
      boost;
    return { skillId: v, score, uncertain, answerable, boost };
  });
  return out.sort((a, b) => b.score - a.score || cmp(a.skillId, b.skillId));
}

/**
 * The estimated frontier: scope skills with p < assumedAt whose prerequisites all have p ≥ 0.5.
 * "Near" adds their direct prerequisites and direct dependents in scope. Sorted.
 */
export function nearFrontier(
  run: PlacementRun,
  graph: SkillGraph,
  params: EngineParams = PARAMS,
): SkillId[] {
  const P = params.placement;
  const scope = new Set(run.scope);
  const near = new Set<SkillId>();
  for (const s of run.scope) {
    if (pOf(run, s) >= P.assumedAt) continue;
    if (!(graph.prereqs[s] ?? []).every((q) => pOf(run, q) >= 0.5)) continue;
    near.add(s);
    for (const q of graph.prereqs[s] ?? []) if (scope.has(q)) near.add(q);
    for (const d of graph.dependents[s] ?? []) if (scope.has(d)) near.add(d);
  }
  return [...near].sort(cmp);
}

/** §5 step 5 convergence (the mini-placement minimum applies while a candidate exists). */
export function placementConverged(
  run: PlacementRun,
  graph: SkillGraph,
  params: EngineParams = PARAMS,
): boolean {
  const P = params.placement;
  if (placementCandidates(run, graph, params).length === 0) return true;
  if (run.strand !== null && run.items < P.miniMin) return false;
  return !nearFrontier(run, graph, params).some((s) => inRange(pOf(run, s), P.uncertainRange));
}

// ---------- the run ----------

/** Starts a placement: initial (strand null, every graph skill) or a per-strand mini-placement. */
export function startPlacement(input: StartPlacementInput): PlacementRun {
  const { graph, child, state, placementId, strand } = input;
  const params = input.params ?? PARAMS;
  const P = params.placement;
  const ids = Object.keys(graph.skills).sort(cmp);
  const scope = ids.filter((s) => strand === null || graph.skills[s]?.strand === strand);
  const scopeSet = new Set(scope);
  const track = scope.filter((s) => onTrack(state.skills[s]));
  const prior = state.placement.prior?.p ?? {};
  const p: Record<SkillId, number> = {};
  for (const s of ids) {
    const grade = graph.skills[s]?.grade ?? child.grade;
    const known = prior[s];
    if (onTrack(state.skills[s])) p[s] = P.onTrackP;
    else if (scopeSet.has(s))
      p[s] = strand !== null && known !== undefined ? known : gradePrior(grade, child, params);
    else p[s] = known ?? gradePrior(grade, child, params);
  }
  const run: PlacementRun = {
    placementId,
    strand,
    budget: placementBudget(child, strand !== null, params),
    scope,
    onTrack: track,
    p,
    probeCount: {},
    boost: {},
    probes: [],
    items: 0,
    session: { index: 0, items: 0, misses: 0, ended: null },
    done: null,
  };
  if (placementConverged(run, graph, params)) run.done = 'converged';
  return run;
}

/** The next probe (context 'placement', item mode), or null once the mini-session or placement ended. */
export function nextProbe(run: PlacementRun, ctx: PlacementContext): PlannedTask | null {
  if (run.done !== null || run.session.ended !== null) return null;
  const params = ctx.params ?? PARAMS;
  const best = probeScores(run, ctx.graph, params)[0];
  if (!best) return null;
  const templates = probeTemplates(ctx.graph, best.skillId);
  const templateId = templates[
    (run.probeCount[best.skillId] ?? 0) % templates.length
  ] as TemplateId;
  return {
    skillId: best.skillId,
    templateId,
    seed: placementProbeSeed(run.placementId, run.items),
    context: 'placement',
    mode: 'item',
  };
}

interface ProbeFacts {
  skillId: SkillId;
  templateId: TemplateId;
  seed: number;
  correct: boolean;
  skipped: boolean;
  posterior: number;
  ts: number;
  frustrationSignal: boolean;
}

/** Applies one probe whose posterior is known: shared by the live run and the replay. */
function applyProbe(
  run: PlacementRun,
  graph: SkillGraph,
  P: PlacementParams,
  f: ProbeFacts,
): PlacementRun {
  const next: PlacementRun = {
    ...run,
    p: { ...run.p },
    probeCount: { ...run.probeCount },
    boost: { ...run.boost },
    probes: [...run.probes],
    session: { ...run.session },
  };
  const miss = f.skipped || !f.correct;
  const open = new Set(openScope(run));
  if (open.has(f.skillId)) {
    const v = f.skillId;
    next.p[v] = f.posterior;
    next.probeCount[v] = (next.probeCount[v] ?? 0) + 1;
    delete next.boost[v];
    if (!miss) {
      for (const a of ancestors(graph, v, P.lambdaUp.length)) {
        if (!open.has(a.id)) continue;
        const pa = next.p[a.id] ?? 0;
        next.p[a.id] = pa + (P.lambdaUp[a.hops - 1] ?? 0) * (1 - pa) * f.posterior;
      }
    } else {
      for (const d of descendants(graph, v, P.lambdaDown.length)) {
        if (!open.has(d.id)) continue;
        next.p[d.id] = (next.p[d.id] ?? 0) * (1 - (P.lambdaDown[d.hops - 1] ?? 0));
      }
      for (const q of graph.prereqs[v] ?? []) if (open.has(q)) next.boost[q] = P.downwardBoost;
    }
  }
  next.items = run.items + 1;
  next.session.items += 1;
  next.session.misses = miss ? next.session.misses + 1 : 0;
  next.probes.push({
    skillId: f.skillId,
    templateId: f.templateId,
    seed: f.seed,
    correct: f.correct,
    skipped: f.skipped,
    posterior: f.posterior,
    ts: f.ts,
    session: next.session.index,
  });
  return next;
}

/** §5 step 5 after a probe: converged, frustration, then the mini-session budget. */
function applyStops(
  run: PlacementRun,
  graph: SkillGraph,
  params: EngineParams,
  frustrationSignal: boolean,
): PlacementRun {
  const P = params.placement;
  const last = run.session.index + 1 >= run.budget.sessions;
  if (placementConverged(run, graph, params)) return { ...run, done: 'converged' };
  if (frustrationSignal && run.session.misses >= P.frustrationMisses) {
    return {
      ...run,
      session: { ...run.session, ended: 'frustration' },
      done: last ? 'frustration' : null,
    };
  }
  if (run.session.items >= run.budget.perSession) {
    return { ...run, session: { ...run.session, ended: 'budget' }, done: last ? 'budget' : null };
  }
  return run;
}

/** Records the answer to a probe: updates p, propagates, applies the stop rules. */
export function recordProbe(
  run: PlacementRun,
  ctx: PlacementContext,
  answer: PlacementAnswer,
): { run: PlacementRun; event: EventPayloads['placement.probe'] } {
  if (run.done !== null) throw new Error(`placement ${run.placementId} has already stopped`);
  if (run.session.ended !== null)
    throw new Error(`placement ${run.placementId}: the mini-session ended; begin the next one`);
  const params = ctx.params ?? PARAMS;
  // An answer is accepted only for the run's current item: its seed must be that item's probe seed
  // (which derives from the item count), so a retried submission of an answer already recorded is
  // refused instead of being counted twice. The skill must be open and below its probe cap, and the
  // template one of its own.
  if (answer.seed !== placementProbeSeed(run.placementId, run.items))
    throw new Error(
      `placement ${run.placementId}: seed ${answer.seed} is not the seed of item ${run.items} (a retried or stale answer)`,
    );
  if (!openScope(run).includes(answer.skillId))
    throw new Error(`placement ${run.placementId} does not probe skill ${answer.skillId}`);
  if ((run.probeCount[answer.skillId] ?? 0) >= params.placement.maxProbesPerSkill)
    throw new Error(`placement ${run.placementId}: ${answer.skillId} reached its probe cap`);
  if (!(ctx.graph.skills[answer.skillId]?.templates ?? []).includes(answer.templateId))
    throw new Error(
      `placement ${run.placementId}: ${answer.templateId} is not a template of ${answer.skillId}`,
    );
  const model = createEloFireModel(ctx.graph, {
    childId: ctx.child.childId,
    isK: ctx.child.isK,
    params,
  });
  const slow =
    answer.correct &&
    !answer.skipped &&
    answer.latencyMs >
      params.rating.slowFactor *
        model.expectedLatency({ templateId: answer.templateId, tier: answer.tier });
  const posterior = bktPosterior(
    {
      p: pOf(run, answer.skillId),
      correct: answer.correct,
      skipped: answer.skipped,
      slow,
      ...(answer.choices !== undefined ? { choices: answer.choices } : {}),
    },
    params,
  );
  const frustrationSignal = answer.frustrationSignal === true;
  const applied = applyProbe(run, ctx.graph, params.placement, {
    skillId: answer.skillId,
    templateId: answer.templateId,
    seed: answer.seed,
    correct: answer.correct && !answer.skipped,
    skipped: answer.skipped,
    posterior,
    ts: answer.ts,
    frustrationSignal,
  });
  const next = applyStops(applied, ctx.graph, params, frustrationSignal);
  return {
    run: next,
    event: {
      placementId: run.placementId,
      strand: run.strand,
      skillId: answer.skillId,
      templateId: answer.templateId,
      seed: answer.seed,
      correct: answer.correct && !answer.skipped,
      skipped: answer.skipped,
      latencyMs: answer.latencyMs,
      posterior,
    },
  };
}

/**
 * Starts the next mini-session (a later day) after one ended on its budget or frustration, or after
 * the child left one part-way. No-op when the placement is done or the current mini-session has
 * not been used; with every mini-session used the placement stops on its budget.
 */
export function beginPlacementSession(run: PlacementRun): PlacementRun {
  if (run.done !== null) return run;
  if (run.session.ended === null && run.session.items === 0) return run;
  if (run.session.index + 1 >= run.budget.sessions) {
    return {
      ...run,
      session: { ...run.session, ended: run.session.ended ?? 'budget' },
      done: 'budget',
    };
  }
  return { ...run, session: { index: run.session.index + 1, items: 0, misses: 0, ended: null } };
}

/** The `placement.completed` payload of a stopped placement. */
export function completePlacement(
  run: PlacementRun,
  params: EngineParams = PARAMS,
): EventPayloads['placement.completed'] {
  if (run.done === null) throw new Error(`placement ${run.placementId} has not stopped yet`);
  const posterior: Record<SkillId, number> = {};
  const assumed: SkillId[] = [];
  for (const s of openScope(run)) {
    const p = roundPosterior(pOf(run, s));
    posterior[s] = p;
    if (p >= params.placement.assumedAt) assumed.push(s);
  }
  return {
    placementId: run.placementId,
    strand: run.strand,
    posterior,
    assumed: assumed.sort(cmp),
    items: run.items,
    reason: run.done,
  };
}

/**
 * The zero-probe initial placement: what an initial placement yields before any probe is
 * answered, the §5 grade prior of every skill off the practiced track, stopped at once
 * (`items: 0`; reason 'budget', a budget of no items, unless the prior already converged).
 * Skills the child has attempts on are left out, so a changed grade never moves them (04 §5).
 * A measured initial placement written later supersedes it in the fold (its posterior wins).
 */
export function gradePriorPlacement(
  input: Omit<StartPlacementInput, 'strand'>,
): EventPayloads['placement.completed'] {
  const run = startPlacement({ ...input, strand: null });
  const out = completePlacement({ ...run, done: run.done ?? 'budget' }, input.params ?? PARAMS);
  const attempted = (s: SkillId): boolean => (input.state.skills[s]?.n ?? 0) > 0;
  return {
    ...out,
    posterior: Object.fromEntries(Object.entries(out.posterior).filter(([s]) => !attempted(s))),
    assumed: out.assumed.filter((s) => !attempted(s)),
  };
}

/**
 * Rebuilds an unfinished placement from the child's event log, to the state the live run reached.
 * It reads the `placement.probe` events of this placement and the child's `session.started`
 * events, in the canonical fold order (`sortEvents`: ts, then id, each id once), so the replay
 * keeps the live order even when sync clamps several events to one ts (08 §4). Mini-sessions follow
 * app sessions: the live app calls `beginPlacementSession` at each `session.started`, and the
 * replay does the same at each one. Pass the log including the current session's
 * `session.started`; that starts a fresh mini-session, or stops the placement on its budget when
 * every mini-session is used. A probe event cannot carry the frustration signal, so a mini-session
 * that frustration ended is known as ended only at the next session start (04 §7b).
 */
export function resumePlacement(
  input: StartPlacementInput,
  events: readonly AnyEventEnvelope[],
): PlacementRun {
  const params = input.params ?? PARAMS;
  let run = startPlacement(input);
  for (const e of sortEvents(events)) {
    if (!sameId(e.childId, input.child.childId)) continue;
    if (isEvent(e, 'session.started')) {
      run = beginPlacementSession(run);
      continue;
    }
    if (!isEvent(e, 'placement.probe') || e.payload.placementId !== input.placementId) continue;
    if (run.done !== null) continue;
    if (run.session.ended !== null) run = beginPlacementSession(run);
    if (run.done !== null) continue;
    const applied = applyProbe(run, input.graph, params.placement, {
      skillId: e.payload.skillId,
      templateId: e.payload.templateId,
      seed: e.payload.seed,
      correct: e.payload.correct && !e.payload.skipped,
      skipped: e.payload.skipped,
      posterior: e.payload.posterior,
      ts: e.ts,
      frustrationSignal: false,
    });
    run = applyStops(applied, input.graph, params, false);
  }
  return run;
}
