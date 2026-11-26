// 04 §8 simulated-learner harness, session part: synthetic K and G2 children, each with an initial
// placement and then 60 sessions on successive simulated days (with seeded 2–4 day gaps), played
// through the real planner, targetDifficulty and adaptNext by the sim TaskRunner (./runner). The
// children learn from lessons and practice and forget with a hidden half-life (./learner).
//
// Required (04 §8):
// 1. per-session first-try accuracy (first attempts on items in practice, review, warmup,
//    challenge and transfer-probe contexts) within [0.78, 0.92] for ≥ 80% of sessions, pooled over
//    the children of a profile. Asserted on the expected accuracy (mean hidden P of the counted
//    first tries) of the reachable items (E03 reading, see the band tests below); the observed one
//    is reported with its binomial-noise ceiling;
// 2. mastered skills that are forgotten are re-reviewed before their hidden recall drops below
//    0.6 in ≥ 90% of cases. A segment is a between-session memory segment of a skill the model
//    rates mastered: it starts at the skill's last retrieval in a session (recall 1, half-life h
//    after it), its recall would cross 0.6 at T = start + h·log2(1/0.6), and it ends at the
//    skill's next retrieval. A segment whose next retrieval is an explicit review (`review` or
//    `transfer-probe`) before T is a reviewed case. One with no retrieval before T is a missed case,
//    or is censored when T falls after the end of the simulation. One whose next retrieval before T
//    is anything else (warmup, practice, challenge, placement) refreshed the memory without a
//    scheduled review, so it is left out and counted, as are segments of a skill the model no
//    longer rates mastered at the last session start before that retrieval or T (it was demoted).
//    The same is reported for practiced-track skills.
// Content changes keep changing the graph, so only these thresholds are asserted, never exact
// numbers. The printed diagnostics separate engine behaviour from sampling noise: the share of
// sessions whose expected accuracy (the mean hidden P of their items) is in the band, and the
// in-band share a learner answering exactly at p = 0.85 would reach with the same item counts.

import {
  type ChildContext,
  defaultChildSettings,
  type SkillGraph,
  type SkillId,
  type WorkshopCapability,
} from '@number-island/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEloFireModel } from '../../src/learner/elo-fire';
import { foldLearnerState } from '../../src/learner/fold';
import { DAY_MS } from '../../src/params';
import { createRng, fnv1a32 } from '../../src/rng';
import { simContent } from './content';
import { createLearner, type LearnerProfile, learnerProfile, PROFILES } from './learner';
import {
  createSimChild,
  EVIDENCE_CONTEXTS,
  endAfter,
  type RequestEnd,
  type Retrieval,
  runPlacement,
  runSession,
  type SimChild,
} from './runner';
import { NUMBER_PAD_EVERYWHERE, SIM_WORKSHOPS } from './workshops';

/**
 * Each session simulation runs over the whole graph, which grows with every curriculum PR (the G2
 * run takes about 45 s on an idle machine with the K–1 catalog).
 */
const SIM_TIMEOUT = 180_000;

const CHILDREN = 20;
const SESSIONS = 60;
const T0 = Date.UTC(2026, 10, 2, 16);
const BAND: [number, number] = [0.78, 0.92];
const RECALL_FLOOR = 0.6;
/** The contexts of a scheduled, explicit review: the learner model's review contexts (04 §4). */
const SCHEDULED_REVIEW: ReadonlySet<string> = new Set(['review', 'transfer-probe']);
/** P(the next session is not on the next day), and then the gap in days. */
const GAP_P = 0.15;
const GAP_DAYS: [number, number] = [2, 4];
/** Children whose incremental state is checked against the full fold (sessions 1, 30 and 60). */
const FOLD_CHECKED = 2;
/** A skill the model still rates `learning` after this many rated attempts is stalled. */
const STALL_ATTEMPTS = 60;
/** Children per sensitivity profile (reported, not asserted). */
const SENSITIVITY_CHILDREN = 6;
/** Children per grade-readiness run (K02 slices): enough that a slice's mastery share is stable. */
const READY_CHILDREN = 12;

function childContext(profile: LearnerProfile, seed: number): ChildContext {
  const hex = (0xc0_0000_0000 + (profile.grade === 'K' ? 0 : 0x1_0000_0000) + seed)
    .toString(16)
    .padStart(12, '0');
  return {
    childId: `019a0000-0000-7000-8000-${hex}`,
    grade: profile.grade,
    ageBand: profile.grade === 'K' ? '5-6' : '7-8',
    advanced: profile.advanced,
    isK: profile.grade === 'K',
    settings: defaultChildSettings(profile.grade),
  };
}

interface SessionRow {
  /** First-try accuracy of the counted items (null: none). */
  acc: number | null;
  n: number;
  /** Mean hidden P(correct) of the counted items: the session's expected accuracy. */
  expected: number | null;
  /** The counted items whose generated d reached its target (|d − d*| ≤ REACH), and their mean P. */
  reachedN: number;
  reachedExpected: number | null;
}

/** An item reached its target when |d − d*| ≤ this (logits). */
const REACH = 0.5;
/** A session enters the reachable-items metric with at least this many reached items. */
const MIN_REACHED = 8;
/**
 * The least a reading must measure to mean anything: sessions with MIN_REACHED reached items (of
 * 360–1,200 sessions per run), and mastered cases for the review metric (20 children × 60 sessions).
 */
const MIN_REACHED_SESSIONS = 100;
const MIN_MASTERED_CASES = 10;
/** K02 slice 1a (#17): the grade-2 place-value skills to 1000 (03 §3.8). */
const PV_TO_1000 = [
  'PV.04',
  'PV.05',
  'PV.06',
  'PV.07',
  'PV.12',
  'PV.14',
  'PV.15',
  'PV.16',
  'PV.17',
  'PV.24',
] as const;
/** K02 slice 1b (#17): counting, number lines and partners of 100 to grade 2. */
const SLICE_1B = ['CNT.11', 'CNT.12', 'CNT.17', 'CMP.10', 'CMP.11', 'CMP.12', 'CPS.10'] as const;
/**
 * Slice 1b's fact-fluency skills. `mastered` needs `fluent` first (04 §3): the median latency of
 * the last 10 correct ≤ 3,500 ms (ADD.14) or 4,000 ms (ADD.22). The sim's latency is the template's
 * expected latency (8,000 ms for an abstract template) times a draw around 1, so no simulated
 * child turns fluent on any fact-fluency skill (ADD.02 and ADD.06 alike); the run checks that the
 * planner reaches them and that practice makes them practiced.
 */
const SLICE_1B_FLUENCY = ['ADD.14', 'ADD.22'] as const;
/** Slice 1b's rounding skills (grade 3): a grade-3 learner reaches and masters them. */
const SLICE_1B_ROUNDING = ['PV.08', 'PV.18'] as const;
/** Slice 2a (#17): grade-2 addition and subtraction within 100. */
const SLICE_2A = [
  'MDA.03',
  'MDA.04',
  'MDA.10',
  'MDA.11',
  'MDA.12',
  'MDA.13',
  'MDA.14',
  'MDA.15',
  'MDA.16',
  'MDA.22',
] as const;
/** Slice 2b (#17): addition and subtraction within 1000, grade 2 and grade 3 (PV.19 included). */
const SLICE_2B_G2 = ['MDA.24', 'MDA.25', 'MDA.05', 'MDA.17'] as const;
const SLICE_2B_G3 = ['MDA.07', 'MDA.18', 'MDA.21', 'PV.19'] as const;

/** The model's view at a session start. */
interface Flags {
  ts: number;
  end: number;
  onTrack: ReadonlySet<SkillId>;
  mastered: ReadonlySet<SkillId>;
}

interface ChildRun {
  seed: number;
  sim: SimChild;
  sessions: SessionRow[];
  flags: Flags[];
  simEnd: number;
  foldChecks: number;
}

/** The first tries metric 1 counts: items in an evidence context. */
const counted = (sim: SimChild) =>
  sim.firstTries.filter((t) => t.mode === 'item' && EVIDENCE_CONTEXTS.has(t.context));

function simulateChild(
  graph: SkillGraph,
  profile: LearnerProfile,
  seed: number,
  checkFold: boolean,
  workshops: readonly WorkshopCapability[] = SIM_WORKSHOPS,
): ChildRun {
  const child = childContext(profile, seed);
  const model = createEloFireModel(graph, { childId: child.childId, isK: child.isK });
  const learner = createLearner(graph, profile, seed, T0);
  const rng = createRng(fnv1a32(`sim-session:${profile.name}:${seed}`));
  const sim = createSimChild(graph, child, model, learner, rng.fork('runner'), workshops);
  const schedule = rng.fork('schedule');
  let ts = runPlacement(sim, T0, `sim-${profile.name}-${seed}`);
  const sessions: SessionRow[] = [];
  const flags: Flags[] = [];
  let simEnd = ts;
  let foldChecks = 0;
  for (let k = 0; k < SESSIONS; k++) {
    const onTrack = new Set<SkillId>();
    const mastered = new Set<SkillId>();
    for (const s of graph.nodes) {
      const st = sim.state.skills[s];
      if (!st) continue;
      if (st.practicedAt !== null || st.assumed) onTrack.add(s);
      const status = model.status(sim.state, s, ts);
      if (st.masteredAt !== null && (status === 'mastered' || status === 'needs-review'))
        mastered.add(s);
    }
    const r = runSession(sim, k, ts);
    simEnd = ts + r.elapsedMs;
    flags.push({ ts, end: simEnd, onTrack, mastered });
    const tries = counted(sim).filter((t) => t.session === k);
    const reached = tries.filter((t) => Math.abs(t.itemD - t.targetD) <= REACH);
    sessions.push({
      acc: tries.length > 0 ? tries.filter((t) => t.correct).length / tries.length : null,
      n: tries.length,
      expected: tries.length > 0 ? tries.reduce((a, t) => a + t.p, 0) / tries.length : null,
      reachedN: reached.length,
      reachedExpected:
        reached.length > 0 ? reached.reduce((a, t) => a + t.p, 0) / reached.length : null,
    });
    if (checkFold && (k === 0 || k === 29 || k === SESSIONS - 1)) {
      const full = foldLearnerState(sim.events, graph, { childId: child.childId, isK: child.isK });
      expect(sim.state).toEqual(full);
      foldChecks += 1;
    }
    ts += (schedule.bool(GAP_P) ? schedule.int(GAP_DAYS[0], GAP_DAYS[1]) : 1) * DAY_MS;
  }
  return { seed, sim, sessions, flags, simEnd, foldChecks };
}

interface MemoryMetric {
  /** Child-skills the model rated `flag` at some retrieval. */
  skills: number;
  cases: number;
  reviewed: number;
  /** Segments left out because the model stopped rating the skill `flag` (demoted). */
  demoted: number;
  /** Segments left out because a non-review retrieval (warmup, practice, …) came first. */
  incidental: number;
  /** Mean hidden recall at the re-review and days to it, over the reviewed cases. */
  recallAtReview: number;
  daysToReview: number;
  /**
   * Missed cases by cause: no session between the start and the crossing (the child did not
   * play); the model's review was not due before the last session ahead of the crossing (its
   * interval outran the memory); or it was due and no session reviewed it (planner).
   */
  missed: { noSession: number; notDue: number; dueNotPlanned: number };
}

/** Metric 2 over the between-session memory segments of skills the model rates `flag`. */
function memoryMetric(runs: readonly ChildRun[], flag: 'mastered' | 'onTrack'): MemoryMetric {
  const out: MemoryMetric = {
    skills: 0,
    cases: 0,
    reviewed: 0,
    demoted: 0,
    incidental: 0,
    recallAtReview: 0,
    daysToReview: 0,
    missed: { noSession: 0, notDue: 0, dueNotPlanned: 0 },
  };
  const crossFactor = Math.log2(1 / RECALL_FLOOR) * DAY_MS;
  for (const run of runs) {
    const bySkill = new Map<SkillId, typeof run.sim.retrievals>();
    for (const r of run.sim.retrievals) {
      const list = bySkill.get(r.skillId) ?? [];
      list.push(r);
      bySkill.set(r.skillId, list);
    }
    for (const [skill, list] of bySkill) {
      if (list.some((r) => r[flag])) out.skills += 1;
      for (let i = 0; i < list.length; i++) {
        const start = list[i] as (typeof list)[number];
        const next = list[i + 1];
        if (next && next.session === start.session) continue; // not the session's last retrieval
        if (!start[flag]) continue;
        const crossing = start.ts + start.trace.halfLifeDays * crossFactor;
        const observed = next !== undefined && next.ts < crossing;
        // Censored: the crossing falls after the run with nothing observed before it. A retrieval
        // observed before the crossing settles the segment even when the crossing lies beyond.
        if (!observed && crossing > run.simEnd) continue;
        const decision = observed ? next.ts : crossing;
        const ahead = run.flags.filter((f) => f.ts > start.ts && f.ts <= decision);
        const lastAhead = ahead[ahead.length - 1];
        if (lastAhead && !lastAhead[flag].has(skill)) {
          out.demoted += 1;
          continue;
        }
        // Only an explicit review is a re-review (the learner's review contexts, 04 §4). A warmup,
        // practice or challenge item before the crossing refreshes the hidden memory without the
        // planner scheduling a review: such a segment tests no review and is left out (counted).
        if (observed && !SCHEDULED_REVIEW.has(next.context)) {
          out.incidental += 1;
          continue;
        }
        out.cases += 1;
        if (observed) {
          out.reviewed += 1;
          out.recallAtReview += next.recall;
          out.daysToReview += (next.ts - start.ts) / DAY_MS;
        } else if (!lastAhead) out.missed.noSession += 1;
        else if (start.dueTs === null || start.dueTs > lastAhead.end) out.missed.notDue += 1;
        else out.missed.dueNotPlanned += 1;
      }
    }
  }
  out.recallAtReview = out.reviewed > 0 ? out.recallAtReview / out.reviewed : Number.NaN;
  out.daysToReview = out.reviewed > 0 ? out.daysToReview / out.reviewed : Number.NaN;
  return out;
}

/** The skill of the metric's synthetic segments. */
const S = 'CNT.01';

/** A synthetic retrieval of S, on the model's mastered track, at `day` (half-life 10 days). */
function retrieval(day: number, context: Retrieval['context'], session = 0): Retrieval {
  const ts = day * DAY_MS;
  return {
    session,
    ts,
    skillId: S,
    context,
    success: true,
    recall: 0.9,
    trace: { halfLifeDays: 10, lastTs: ts },
    onTrack: true,
    mastered: true,
    dueTs: ts + 3 * DAY_MS,
    intervalDays: 3,
  };
}

const pct = (x: number) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : 'n/a');
const fix = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** `k n, …` for the non-zero counts, sorted by key. */
const tally = (counts: Readonly<Record<string, number>>) =>
  Object.entries(counts)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');

const inBand = (a: number) => a >= BAND[0] && a <= BAND[1];

/** P(Binomial(n, p) / n ∈ band): the in-band chance of n items answered at exactly p. */
function binomialInBand(n: number, p: number): number {
  let total = 0;
  let coef = 1; // C(n, k)
  for (let k = 0; k <= n; k++) {
    if (k > 0) coef = (coef * (n - k + 1)) / k;
    if (inBand(k / n)) total += coef * p ** k * (1 - p) ** (n - k);
  }
  return total;
}

interface ProfileReport {
  profile: string;
  runs: ChildRun[];
  /** Metric 1: share of sessions in the band, below and above it. */
  inBand: number;
  below: number;
  above: number;
  sessions: number;
  meanAcc: number;
  meanItems: number;
  /** Share of sessions whose expected accuracy is in the band. */
  expectedInBand: number;
  /** Sessions with ≥ MIN_REACHED reached items, and the share of them in the band. */
  reachedSessions: number;
  reachedInBand: number;
  /** Share of counted items that reached their target. */
  reachedShare: number;
  /** The in-band share at p = 0.85 for the same item counts (the sampling-noise ceiling). */
  noiseCeiling: number;
  perChild: { min: number; median: number; inBand: number }[];
  /** Per context: items, accuracy, mean hidden P, mean d − d*, share with d > d* + 0.25. */
  contexts: string;
  mastered: MemoryMetric;
  onTrack: MemoryMetric;
  ends: Record<RequestEnd, number>;
  /** Per child: hidden known skills at the start and end; the model's practiced track and mastered at the end. */
  knownStart: number;
  knownEnd: number;
  practicedEnd: number;
  masteredEnd: number;
  /** Per child: skills the model still rates `learning` after ≥ STALL_ATTEMPTS rated attempts. */
  stalled: number;
  /** Stalled child-skills by skill id. */
  stalledSkills: string;
  /** adaptNext decisions by kind, summed over the children. */
  decisions: string;
  ms: number;
}

function simulateProfile(
  graph: SkillGraph,
  profile: LearnerProfile,
  children: number,
  workshops: readonly WorkshopCapability[] = SIM_WORKSHOPS,
  name = profile.name,
): ProfileReport {
  const t0 = performance.now();
  const runs: ChildRun[] = [];
  for (let seed = 1; seed <= children; seed++) {
    runs.push(simulateChild(graph, profile, seed, seed <= FOLD_CHECKED, workshops));
  }
  const ms = performance.now() - t0;
  const rows = runs.flatMap((r) => r.sessions).filter((s) => s.acc !== null);
  const accs = rows.map((s) => s.acc as number);
  const tries = runs.flatMap((r) => counted(r.sim));
  const contexts = [...new Set(tries.map((t) => t.context))]
    .sort()
    .map((c) => {
      const xs = tries.filter((t) => t.context === c);
      const m = (f: (t: (typeof xs)[number]) => number) => mean(xs.map(f));
      return `${c} n=${xs.length} acc ${pct(m((t) => (t.correct ? 1 : 0)))} P ${pct(m((t) => t.p))} d−d* ${fix(m((t) => t.itemD - t.targetD))} d>d*+0.25 ${pct(m((t) => (t.itemD > t.targetD + 0.25 ? 1 : 0)))}`;
    })
    .join('; ');
  const ends: Record<RequestEnd, number> = {
    complete: 0,
    'wind-down': 0,
    frustration: 0,
    break: 0,
    exhausted: 0,
  };
  let knownStart = 0;
  let knownEnd = 0;
  let practicedEnd = 0;
  let masteredEnd = 0;
  let stalled = 0;
  const stalledBy: Record<string, number> = {};
  const decisions: Record<string, number> = {};
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.sim.decisions)) decisions[k] = (decisions[k] ?? 0) + v;
    for (const k of Object.keys(ends) as RequestEnd[]) ends[k] += r.sim.requestEnds[k];
    knownStart += r.sim.learner.known.size;
    knownEnd += graph.nodes.filter((s) => r.sim.learner.knows(s)).length;
    for (const s of graph.nodes) {
      const st = r.sim.state.skills[s];
      if (!st) continue;
      if (st.practicedAt !== null || st.assumed) practicedEnd += 1;
      if (st.masteredAt !== null) masteredEnd += 1;
      if (st.n >= STALL_ATTEMPTS && r.sim.model.status(r.sim.state, s, r.simEnd) === 'learning') {
        stalled += 1;
        stalledBy[s] = (stalledBy[s] ?? 0) + 1;
      }
    }
  }
  const n = runs.length;
  const reachedRows = rows.filter((s) => s.reachedN >= MIN_REACHED);
  return {
    reachedSessions: reachedRows.length,
    reachedInBand:
      reachedRows.filter((s) => inBand(s.reachedExpected as number)).length /
      Math.max(1, reachedRows.length),
    reachedShare:
      rows.reduce((a, s) => a + s.reachedN, 0) /
      Math.max(
        1,
        rows.reduce((a, s) => a + s.n, 0),
      ),
    profile: name,
    runs,
    inBand: accs.filter(inBand).length / accs.length,
    below: accs.filter((a) => a < BAND[0]).length / accs.length,
    above: accs.filter((a) => a > BAND[1]).length / accs.length,
    sessions: accs.length,
    meanAcc: mean(accs),
    meanItems: mean(rows.map((s) => s.n)),
    expectedInBand: rows.filter((s) => inBand(s.expected as number)).length / rows.length,
    noiseCeiling: mean(rows.map((s) => binomialInBand(s.n, 0.85))),
    perChild: runs.map((r) => {
      const xs = r.sessions.filter((s) => s.acc !== null).map((s) => s.acc as number);
      return {
        min: Math.min(...xs),
        median: median(xs),
        inBand: xs.filter(inBand).length / xs.length,
      };
    }),
    contexts,
    mastered: memoryMetric(runs, 'mastered'),
    onTrack: memoryMetric(runs, 'onTrack'),
    ends,
    knownStart: knownStart / n,
    knownEnd: knownEnd / n,
    practicedEnd: practicedEnd / n,
    masteredEnd: masteredEnd / n,
    stalled: stalled / n,
    stalledSkills: tally(stalledBy),
    decisions: tally(decisions),
    ms,
  };
}

function printReport(graph: SkillGraph, r: ProfileReport) {
  const mem = (m: MemoryMetric) =>
    `${m.reviewed}/${m.cases} = ${pct(m.cases > 0 ? m.reviewed / m.cases : Number.NaN)} over ${m.skills} child-skills (re-reviewed at recall ${fix(m.recallAtReview)}, ${fix(m.daysToReview, 1)} d after; missed: child did not play ${m.missed.noSession}, not due yet ${m.missed.notDue}, due but not planned ${m.missed.dueNotPlanned}; left out: demoted ${m.demoted}, refreshed first by a non-review retrieval ${m.incidental})`;
  const list = (f: (c: ProfileReport['perChild'][number]) => number) =>
    r.perChild.map((c) => fix(f(c))).join(' ');
  console.log(
    [
      `session sim ${r.profile}: ${r.runs.length} children × ${SESSIONS} sessions, ${graph.nodes.length} skills (contentVersion ${graph.contentVersion}), ${fix(r.ms / 1000, 1)} s`,
      `  1. sessions with first-try accuracy in [${BAND.join(', ')}]: ${pct(r.inBand)} of ${r.sessions} (below ${pct(r.below)}, above ${pct(r.above)}); mean ${pct(r.meanAcc)}, ${fix(r.meanItems, 1)} counted items per session`,
      `     expected accuracy (mean hidden P) in the band: ${pct(r.expectedInBand)} of sessions; sampling-noise ceiling (p = 0.85, same item counts): ${pct(r.noiseCeiling)}`,
      `     reachable items (|d − d*| ≤ ${REACH}): ${pct(r.reachedShare)} of counted items; sessions with ≥ ${MIN_REACHED} of them: ${r.reachedSessions}, expected accuracy in the band: ${pct(r.reachedInBand)}`,
      `     per-child min:     ${list((c) => c.min)}`,
      `     per-child median:  ${list((c) => c.median)}`,
      `     per-child in band: ${list((c) => c.inBand)}`,
      `     by context: ${r.contexts}`,
      `  2. mastered, re-reviewed before recall < ${RECALL_FLOOR}: ${mem(r.mastered)}`,
      `     practiced track: ${mem(r.onTrack)}`,
      `  per child: hidden known skills ${fix(r.knownStart, 1)} → ${fix(r.knownEnd, 1)}; model at the end: practiced track ${fix(r.practicedEnd, 1)}, mastered ${fix(r.masteredEnd, 1)}, stalled in learning (≥ ${STALL_ATTEMPTS} attempts) ${fix(r.stalled, 1)} (${r.stalledSkills || 'none'})`,
      `  request ends: ${tally(r.ends)}; adaptNext decisions: ${r.decisions}`,
    ].join('\n'),
  );
}

/**
 * Sensitivity profile (reported; only its reachable-items band is asserted): a stationary learner, no overlearning and no
 * fading of careless errors, so a known skill stays at P ≈ 0.86 on a typical item.
 */
const stationary = (p: LearnerProfile): LearnerProfile =>
  learnerProfile(`${p.name} (stationary)`, p.grade, {
    ...p,
    learning: { ...p.learning, overlearn: 0, minSlipShare: 1 },
  });

/**
 * The data the band readings measure. Asserted outside every expected failure, so that losing it
 * fails the suite instead of satisfying an `it.fails`.
 */
function assertMeasured(r: ProfileReport) {
  expect(r.sessions).toBeGreaterThan(0);
  expect(Number.isFinite(r.inBand)).toBe(true);
  expect(r.reachedSessions).toBeGreaterThanOrEqual(MIN_REACHED_SESSIONS);
  expect(Number.isFinite(r.reachedInBand)).toBe(true);
}

/** The asserted 04 §8 band reading: expected accuracy on reachable items (see below). */
function assertReachableBand(r: ProfileReport) {
  expect(r.reachedInBand).toBeGreaterThanOrEqual(0.8);
}

describe('session simulation (04 §8)', () => {
  const { graph } = simContent();
  const reports = new Map<string, ProfileReport>();

  for (const profile of [PROFILES.K, PROFILES.G2]) {
    describe(`${profile.name}: ${CHILDREN} children × ${SESSIONS} sessions`, () => {
      beforeAll(() => {
        const r = simulateProfile(graph, profile, CHILDREN);
        reports.set(profile.name, r);
        printReport(graph, r);
      }, SIM_TIMEOUT);
      const report = () => reports.get(profile.name) as ProfileReport;

      it('keeps the incremental learner state equal to the full fold', () => {
        expect(
          report()
            .runs.slice(0, FOLD_CHECKED)
            .map((x) => x.foldChecks),
        ).toEqual(Array(FOLD_CHECKED).fill(3));
      });

      it('measures enough sessions for the band readings and mastered cases for the review metric', () => {
        const r = report();
        assertMeasured(r);
        expect(r.mastered.cases).toBeGreaterThanOrEqual(MIN_MASTERED_CASES);
      });

      // Reading (E03, 04 §7b; decided by the campaign orchestrator): the band is asserted on each
      // session's EXPECTED first-try accuracy (the mean hidden P) over the counted first tries
      // whose generated item reached its target (|d − d*| ≤ REACH), for sessions with at least
      // MIN_REACHED such items. Observed accuracy over 19–39 items has a binomial-noise ceiling
      // below 80% even for a perfect controller, and the current K–1 content cannot generate
      // items as hard as the targets for strong children, so those items measure the content,
      // not the targeting. The raw metric is printed and kept as an expected failure below.
      //
      // K is an expected failure on this reading too (orchestrator decision; the sim learner is
      // not recalibrated to pass). Measured on the fixture graph: 38.1% of reachable-item
      // sessions in the band (39.8% when the orchestrator decided; it has moved with the adaptNext
      // review fixes); raw sessions 42.6% above the band and 15.8% below; practice items mean P
      // 0.892, mean d − d* +0.08.
      // Follow-up (folded into #17): re-check the K band on the full K–3 graph and, if it still
      // fails, tune young-learner adaptation (Ks / the rolling controller, a 04 §2.3–2.4
      // change). When it starts passing, the expected failure flips and the suite says so.
      const reachable = profile === PROFILES.K ? it.fails : it;
      reachable(
        'expected first-try accuracy within [0.78, 0.92] for ≥ 80% of sessions, on reachable items',
        () => {
          assertReachableBand(report());
        },
      );

      // Expected failure on the current content (re-asserted on the full K–3 graph: follow-up
      // "Re-assert the raw 04 §8 accuracy band on the full K–3 graph", folded into #17). When the
      // content can reach the targets this starts passing, the expected failure flips, and the
      // suite tells us to promote it to a normal assertion.
      it.fails('raw per-session first-try accuracy within [0.78, 0.92] for ≥ 80% of sessions', () => {
        expect(report().inBand).toBeGreaterThanOrEqual(0.8);
      });

      it('re-reviews mastered skills before recall < 0.6 in ≥ 90% of cases', () => {
        // A case is a mastered skill's memory segment that no other retrieval refreshed first; it
        // counts as re-reviewed when an explicit review came before the hidden recall fell below
        // 0.6. The practiced-track reading is printed beside it.
        const m = report().mastered;
        expect(m.reviewed / m.cases).toBeGreaterThanOrEqual(0.9);
      });
    });
  }

  // K02 slices (#17). The default G2 children know about 100 of the skills and learn about five
  // more in 60 sessions, spread over every strand, so few of them finish one strand's grade. These
  // learners have the content up to their grade (hidden known-rate 1): the runs show that the
  // planner reaches each new skill behind its prerequisites (some child meets it) and that the
  // templates give the evidence the mastery rule needs (04 §3), as a share per slice: of the
  // (child, skill) pairs where the child met the skill, at least a third end mastered. Per-skill
  // mastery counts over a few children flip with any content edit (the planner seeds each session
  // with the content version), so the runs use a fixed planner salt and a pooled share, and print
  // the per-skill met / practised / mastered counts.
  const readiness = (grade: '2' | '3') => {
    const ready = learnerProfile(`G${grade} (has grade ${grade})`, grade, {
      ...PROFILES.G2,
      known: { ...PROFILES.G2.known, wellBelow: 1, below: 1, at: 1 },
    });
    const r = simulateProfile({ ...graph, contentVersion: 'sim' }, ready, READY_CHILDREN);
    const count = (s: string, field: 'masteredAt' | 'practicedAt' | 'fluentAt') =>
      r.runs.filter((x) => (x.sim.state.skills[s]?.[field] ?? null) !== null).length;
    const attempted = (s: string) =>
      r.runs.filter((x) => (x.sim.state.skills[s]?.n ?? 0) > 0).length;
    const slice = (name: string, skills: readonly string[], mastery = true) => {
      console.log(
        `session sim ${ready.name}, ${name}: of ${READY_CHILDREN} children, met / practised / mastered: ${skills
          .map((s) => `${s} ${attempted(s)}/${count(s, 'practicedAt')}/${count(s, 'masteredAt')}`)
          .join(', ')}`,
      );
      for (const s of skills) expect(attempted(s), `${s} reached`).toBeGreaterThanOrEqual(1);
      const met = skills.reduce((a, s) => a + attempted(s), 0);
      const done = skills.reduce((a, s) => a + count(s, mastery ? 'masteredAt' : 'practicedAt'), 0);
      expect(
        done / met,
        `${name}: share of met skills ${mastery ? 'mastered' : 'practiced'}`,
      ).toBeGreaterThanOrEqual(1 / 3);
    };
    return { slice, count };
  };

  it(
    'grade-2 learners reach each grade-2 skill of the K02 slices, and a third of them end mastered',
    () => {
      const { slice, count } = readiness('2');
      slice('slice 1a', PV_TO_1000);
      slice('slice 1b', SLICE_1B);
      slice('slice 2a', SLICE_2A);
      slice('slice 2b', SLICE_2B_G2);
      // Fact fluency: no simulated child turns fluent (see SLICE_1B_FLUENCY), so practice only.
      slice('slice 1b fluency', SLICE_1B_FLUENCY, false);
      console.log(
        `fluent: ${['ADD.06', ...SLICE_1B_FLUENCY].map((s) => `${s} ${count(s, 'fluentAt')}`).join(', ')}`,
      );
    },
    SIM_TIMEOUT,
  );

  it(
    'grade-3 learners reach each grade-3 skill of the K02 slices, and a third of them end mastered',
    () => {
      const { slice } = readiness('3');
      slice('slice 1b rounding', SLICE_1B_ROUNDING);
      slice('slice 2b', SLICE_2B_G3);
    },
    SIM_TIMEOUT,
  );

  it(
    'reports the sensitivity runs; the stationary learners meet the reachable-items band',
    () => {
      const stationaryRuns = [
        simulateProfile(graph, stationary(PROFILES.K), SENSITIVITY_CHILDREN),
        simulateProfile(graph, stationary(PROFILES.G2), SENSITIVITY_CHILDREN),
      ];
      const numberPad = simulateProfile(
        graph,
        PROFILES.K,
        SENSITIVITY_CHILDREN,
        NUMBER_PAD_EVERYWHERE,
        'K (number-pad at Road Crew and Lantern Grove)',
      );
      for (const r of [...stationaryRuns, numberPad]) {
        printReport(graph, r);
        expect(r.sessions).toBeGreaterThan(0);
      }
      for (const r of stationaryRuns) {
        assertMeasured(r);
        assertReachableBand(r);
      }
    },
    SIM_TIMEOUT,
  );

  it('offers the break after the confidence item, also when it completes the request', () => {
    const complete = { action: 'end-request', reason: 'complete' } as const;
    expect(endAfter(complete, true, () => true)).toBe('break');
    expect(endAfter(complete, true, () => false)).toBe('complete');
    expect(endAfter(complete, false, () => true)).toBe('complete');
    expect(endAfter({ action: 'end-request', reason: 'wind-down' }, true, () => true)).toBe(
      'wind-down',
    );
    expect(endAfter({ action: 'continue' }, true, () => true)).toBe('break');
    expect(endAfter({ action: 'continue' }, false, () => true)).toBeNull();
  });

  it('review metric: only an explicit review re-reviews; a retrieval seen before the end counts', () => {
    // A mastered skill retrieved at day 0 whose hidden recall would cross 0.6 at ≈ day 7.4
    // (half-life 10 days); the run ends on day 5, so the crossing is past the end.
    const start = retrieval(0, 'review');
    const runWith = (next: Retrieval[]): ChildRun => ({
      seed: 0,
      sim: { retrievals: [start, ...next] } as unknown as SimChild,
      sessions: [],
      flags: [
        { ts: 4 * DAY_MS, end: 4 * DAY_MS + 1, onTrack: new Set([S]), mastered: new Set([S]) },
      ],
      simEnd: 5 * DAY_MS,
      foldChecks: 0,
    });
    // A timely explicit review on day 4 is observed before the end: one reviewed case.
    const reviewed = memoryMetric([runWith([retrieval(4, 'review', 1)])], 'mastered');
    expect(reviewed).toMatchObject({ cases: 1, reviewed: 1, incidental: 0 });
    // A warmup on day 4 refreshes the memory without a scheduled review: no case at all.
    const warm = memoryMetric([runWith([retrieval(4, 'warmup', 1)])], 'mastered');
    expect(warm).toMatchObject({ cases: 0, reviewed: 0, incidental: 1 });
    // No follow-up and the crossing past the end: censored, the segment is left out.
    expect(memoryMetric([runWith([])], 'mastered')).toMatchObject({ cases: 0, reviewed: 0 });
  });

  it('is deterministic: the same child twice gives identical events and metrics', () => {
    const a = simulateChild(graph, PROFILES.K, 7, false);
    const b = simulateChild(graph, PROFILES.K, 7, false);
    expect(b.sessions).toEqual(a.sessions);
    expect(b.flags).toEqual(a.flags);
    expect(b.sim.events).toEqual(a.sim.events);
    expect(b.sim.retrievals).toEqual(a.sim.retrievals);
  });
});
