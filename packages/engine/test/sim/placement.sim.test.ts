// 04 §8 simulated-learner harness, placement part: synthetic K and G2 children with a hidden true
// mastery set go through a full initial placement with the real runner and the real items.
// Required: ≤ the item budgets for every child, ≥ 85% per-skill classification accuracy.

import {
  type ChildContext,
  defaultChildSettings,
  type SkillGraph,
  type SkillId,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { createEloFireModel } from '../../src/learner/elo-fire';
import { DAY_MS } from '../../src/params';
import {
  beginPlacementSession,
  completePlacement,
  gradePrior,
  nextProbe,
  type PlacementRun,
  placementBudget,
  recordProbe,
  startPlacement,
} from '../../src/placement';
import { choiceCount, simContent } from './content';
import {
  createLearner,
  type LearnerProfile,
  learnerProfile,
  PROFILES,
  type SimLearner,
} from './learner';

const CHILDREN = 200;
const T0 = Date.UTC(2026, 10, 2, 16);
const CHILD_ID = '019a0000-0000-7000-8000-00000000c5a1';

interface ChildResult {
  run: PlacementRun;
  learner: SimLearner;
  predicted: Set<SkillId>;
  sessionItems: number[];
}

function childContext(profile: LearnerProfile): ChildContext {
  return {
    childId: CHILD_ID,
    grade: profile.grade,
    ageBand: profile.grade === 'K' ? '5-6' : '7-8',
    advanced: profile.advanced,
    isK: profile.grade === 'K',
    settings: defaultChildSettings(profile.grade),
  };
}

/** One child's full initial placement: real probes, real items at d* = 0, a new day per mini-session. */
function placeChild(graph: SkillGraph, profile: LearnerProfile, seed: number): ChildResult {
  const { probeItem } = simContent();
  const child = childContext(profile);
  const model = createEloFireModel(graph, { childId: CHILD_ID, isK: child.isK });
  const learner = createLearner(graph, profile, seed, T0);
  const ctx = { graph, child };
  let run = startPlacement({
    graph,
    child,
    state: model.init(graph, null),
    placementId: `sim-${profile.name}-${seed}`,
    strand: null,
  });
  let day = 0;
  let ts = T0;
  while (run.done === null) {
    if (run.session.ended !== null) {
      run = beginPlacementSession(run); // another day
      day += 1;
      ts = T0 + day * DAY_MS;
      continue;
    }
    const task = nextProbe(run, ctx);
    if (!task) throw new Error(`no probe for an unfinished placement (seed ${seed})`);
    const item = probeItem(task.templateId, task.seed);
    const choices = choiceCount(item);
    const a = learner.answer({
      skillId: task.skillId,
      difficulty: item.difficulty,
      ...(choices !== undefined ? { choices } : {}),
      expectedLatencyMs: model.expectedLatency({ templateId: task.templateId, tier: item.tier }),
    });
    ts += a.latencyMs + 4_000;
    run = recordProbe(run, ctx, {
      skillId: task.skillId,
      templateId: task.templateId,
      seed: task.seed,
      correct: a.correct,
      skipped: a.skipped,
      latencyMs: a.latencyMs,
      ts,
      tier: item.tier,
      ...(choices !== undefined ? { choices } : {}),
      frustrationSignal: a.frustrationSignal,
    }).run;
  }
  const out = completePlacement(run);
  const predicted = new Set<SkillId>(run.onTrack);
  for (const [s, p] of Object.entries(out.posterior)) if (p >= 0.5) predicted.add(s);
  for (const s of out.assumed) predicted.add(s);
  const sessionItems: number[] = [];
  for (const pr of run.probes) sessionItems[pr.session] = (sessionItems[pr.session] ?? 0) + 1;
  return { run, learner, predicted, sessionItems: Array.from(sessionItems, (n) => n ?? 0) };
}

/** Skills not known whose prerequisites are all known. */
function frontierOf(graph: SkillGraph, known: ReadonlySet<SkillId>): SkillId[] {
  return graph.nodes.filter(
    (s) => !known.has(s) && (graph.prereqs[s] ?? []).every((p) => known.has(p)),
  );
}

interface Metrics {
  profile: string;
  children: number;
  /** Per-skill classification accuracy over every child and skill. */
  accuracy: number;
  /** The same with the grade priors alone (no probes): what the probes add. */
  priorOnly: number;
  /** Share of true frontier skills that are on the predicted frontier. */
  frontierRecall: number;
  /** Share of assumed skills the child does not know. */
  wronglyAssumed: number;
  /** Of the wrongly assumed skills, the share that was never probed (assumed through propagation). */
  wrongUnprobed: number;
  /** Correct answers on probes of skills the child does not know (the effective guess rate). */
  unknownCorrect: number;
  /** Share of known skills predicted unknown. */
  missedKnown: number;
  trueKnownRate: number;
  meanItems: number;
  maxItems: number;
  meanSessions: number;
  reasons: string;
  /** Budget breaches (must be 0). */
  overBudget: number;
}

function simulate(graph: SkillGraph, profile: LearnerProfile): Metrics {
  const child = childContext(profile);
  const budget = placementBudget(child, false);
  let right = 0;
  let priorRight = 0;
  let total = 0;
  let knownCount = 0;
  let assumedCount = 0;
  let assumedWrong = 0;
  let missed = 0;
  let frontierHits = 0;
  let frontierTotal = 0;
  let items = 0;
  let maxItems = 0;
  let sessions = 0;
  let overBudget = 0;
  let assumedWrongUnprobed = 0;
  let unknownProbes = 0;
  let unknownCorrect = 0;
  const reasons: Record<string, number> = {};
  for (let seed = 1; seed <= CHILDREN; seed++) {
    const r = placeChild(graph, profile, seed);
    if (
      r.sessionItems.length > budget.sessions ||
      r.sessionItems.some((n) => n > budget.perSession) ||
      r.run.items > budget.perSession * budget.sessions
    )
      overBudget += 1;
    const assumed = new Set(completePlacement(r.run).assumed);
    for (const s of graph.nodes) {
      const truth = r.learner.known.has(s);
      const prior = gradePrior(graph.skills[s]?.grade ?? 'K', child) >= 0.5;
      total += 1;
      if (truth) knownCount += 1;
      if (r.predicted.has(s) === truth) right += 1;
      if (prior === truth) priorRight += 1;
      if (truth && !r.predicted.has(s)) missed += 1;
      if (assumed.has(s)) {
        assumedCount += 1;
        if (!truth) {
          assumedWrong += 1;
          if ((r.run.probeCount[s] ?? 0) === 0) assumedWrongUnprobed += 1;
        }
      }
    }
    for (const pr of r.run.probes) {
      if (r.learner.known.has(pr.skillId)) continue;
      unknownProbes += 1;
      if (pr.correct) unknownCorrect += 1;
    }
    const trueFrontier = frontierOf(graph, r.learner.known);
    const predFrontier = new Set(frontierOf(graph, r.predicted));
    frontierTotal += trueFrontier.length;
    frontierHits += trueFrontier.filter((s) => predFrontier.has(s)).length;
    items += r.run.items;
    maxItems = Math.max(maxItems, r.run.items);
    sessions += r.sessionItems.length;
    const reason = r.run.done ?? 'none';
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  return {
    profile: profile.name,
    children: CHILDREN,
    accuracy: right / total,
    priorOnly: priorRight / total,
    frontierRecall: frontierTotal === 0 ? 1 : frontierHits / frontierTotal,
    wronglyAssumed: assumedCount === 0 ? 0 : assumedWrong / assumedCount,
    wrongUnprobed: assumedWrong === 0 ? 0 : assumedWrongUnprobed / assumedWrong,
    unknownCorrect: unknownProbes === 0 ? 0 : unknownCorrect / unknownProbes,
    missedKnown: knownCount === 0 ? 0 : missed / knownCount,
    trueKnownRate: knownCount / total,
    meanItems: items / CHILDREN,
    maxItems,
    meanSessions: sessions / CHILDREN,
    reasons: Object.entries(reasons)
      .sort()
      .map(([k, v]) => `${k} ${v}`)
      .join(', '),
    overBudget,
  };
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

/**
 * Sensitivity profiles (reported, not asserted): every below-grade skill known with conditional
 * probability 0.9 and at-grade 0.55. Along prerequisite chains this compounds to marginal rates
 * well under the 0.85 the grade priors assume for below-grade content.
 */
const LITERAL_RATES = { wellBelow: 0.9, below: 0.9, at: 0.55, above: 0.2, far: 0.05 };
const SENSITIVITY = [
  learnerProfile('K (0.9/0.55 rates)', 'K', { ...PROFILES.K, known: LITERAL_RATES }),
  learnerProfile('G2 (0.9/0.55 rates)', '2', { ...PROFILES.G2, known: LITERAL_RATES }),
];

describe('placement simulation (04 §8)', () => {
  const { graph } = simContent();
  const rows: Metrics[] = [];

  for (const profile of [PROFILES.K, PROFILES.G2]) {
    it(`${profile.name}: ${CHILDREN} children within the item budget, ≥ 85% accuracy`, () => {
      const m = simulate(graph, profile);
      rows.push(m);
      // AC: placement runs in ≤ the item budgets for simulated K and G2 profiles.
      expect(m.overBudget).toBe(0);
      expect(m.maxItems).toBeLessThanOrEqual(
        placementBudget(childContext(profile), false).perSession *
          placementBudget(childContext(profile), false).sessions,
      );
      // 04 §8: ≥ 85% per-skill classification accuracy.
      expect(m.accuracy).toBeGreaterThanOrEqual(0.85);
    });
  }

  it('reports sensitivity profiles and prints the metrics table', () => {
    for (const p of SENSITIVITY) {
      const m = simulate(graph, p);
      expect(m.overBudget).toBe(0);
      rows.push(m);
    }
    const header = [
      'profile',
      'children',
      'accuracy',
      'prior-only',
      'frontier recall',
      'wrongly assumed',
      '…of them unprobed',
      'unknown-skill correct',
      'known missed',
      'true known',
      'mean items',
      'max items',
      'mean sessions',
      'stop reasons',
    ];
    console.log(
      [
        `placement sim: ${graph.nodes.length} skills, contentVersion ${graph.contentVersion}; budgets K ${JSON.stringify(placementBudget({ isK: true }, false))}, G2 ${JSON.stringify(placementBudget({ isK: false }, false))}`,
        header.join(' | '),
        ...rows.map((m) =>
          [
            m.profile,
            m.children,
            pct(m.accuracy),
            pct(m.priorOnly),
            pct(m.frontierRecall),
            pct(m.wronglyAssumed),
            pct(m.wrongUnprobed),
            pct(m.unknownCorrect),
            pct(m.missedKnown),
            pct(m.trueKnownRate),
            m.meanItems.toFixed(1),
            m.maxItems,
            m.meanSessions.toFixed(2),
            m.reasons,
          ].join(' | '),
        ),
      ].join('\n'),
    );
    expect(rows.length).toBe(4);
  });
});
