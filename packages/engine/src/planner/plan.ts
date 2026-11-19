// 04 §6.1–§6.3, §6.5 session planner (02 §5.4 `planSession`). Pure and deterministic: one RNG
// seeded from (child, now, content version), used only through labelled forks.
//
// A plan offers 2–3 alternative requests; the child picks one and the app re-plans with the
// minutes left. Each request is built from the same pools: request i focuses on the i-th chosen
// new skill (cycled), and every request may reuse the same due reviews.
//
// Readings (recorded for 04 §7b):
// - Columns: request item counts use the K column for grades K and 1 and G2 otherwise; slices,
//   concurrency and p* use the K column only for a K child.
// - Request size: clamp(round(min(minutes·60, 180) / secondsPerItem), requestItems). A lesson task
//   uses `lessonItemCost` items of that budget but is not an item; test-out items are items.
// - Request count: 3 when there are ≥ 3 distinct focus skills or ≥ 3 available themed workshops
//   host a focus skill's (or, with no focus skill, a due review's) templates; else 2.
// - New-skill pool: the frontier plus fact-fluency skills on the practiced track that are not
//   fluent (04 §6.5) and whose last review did not fail (such a skill is reviewed first);
//   unlockValue divides by the maximum over that pool.
// - Breakers: a request never has more than maxRun consecutive items of one skill. When reviews
//   and challenges cannot break the focus skill's runs, one other new skill that needs no lesson
//   first (learning, lesson mode 'none', or fluency) adds items, then practiced-track skills
//   ('practice' context), else the excess focus items are dropped (a short request).
// - Evidence templates: a skill's templates whose items take a constructed answer, by the
//   template's own answer kind (`isConstructedTemplate`: its generator's AnswerSpec kind, else its
//   format's capabilities), not by what its format could accept (count.ordinal answers a tap-count
//   item with a choice); only their first attempts enter `recent` (04 §7a). When a skill has any,
//   its new-learning items (as the focus or the second new skill) use only those, so a request
//   always produces practiced evidence; a skill without any uses all its templates.
// - Needed templates: evidence templates of a skill off the practiced track that add something its
//   practiced rule still lacks among the correct, unhinted `recent` entries: a format or a tier
//   not yet there (standard skills), or a representation not yet there, or the abstract tier when
//   none is there (gateway skills, 04 §3).
// - Hosting: a focus skill's candidate workshops host its lesson template (when it gets one) and
//   at least one of its evidence templates. They are ranked by: hosts a needed template, fills the
//   request's item range, hosts the test-out pool (when offered), strand affinity, not used by an
//   earlier request, number of the skill's formats hosted, workshopId. A fluency skill goes to
//   Rhythm Orchard when it is a candidate. With no candidate, when only the Practice Pier fills
//   the item range, or when the skill has needed templates and no candidate hosts one (the 04 §6.3
//   "needed format" fallback), the request goes to the Practice Pier. If the chosen workshop
//   cannot host the test-out pool (≥ 2 distinct templates when the pool has ≥ 2, and 2
//   representations for a gateway skill when the pool has them), the skill gets its lesson without
//   a test-out. A request with no focus skill (review-only) ranks its candidates first by the
//   number of due reviews they host, then fills the range, not used earlier, item count; when
//   reviews are due and the chosen workshop hosts none of them, it goes to the Practice Pier (the
//   needed-format fallback, applied to reviews).
// - Test-out completeness: a test-out is never truncated. When sequencing cannot place the whole
//   draw before the lesson (the run rule with nothing to break the run), the request is composed
//   again without the test-out, lesson first.
// - Warmup: the first available of (a) the on-track skill with the highest P(ref) ≥ warmupMinP;
//   (b) the highest-P(ref) on-track skill; (c) the highest-P(ref) frontier skill already attempted
//   ('learning'), with an evidence template; (d) the highest-P(ref) 'ready' skill whose lesson mode
//   is 'none'; (e) with nothing attempted, the lesson of a (non-remediation) focus skill, preferring
//   one without an offered test-out: requests on it skip that lesson, and it keeps its draw only
//   when the lesson is demonstration-only (no rated child steps, so it stays untouched); (f) else
//   an evidence template of the first focus skill. An item warmup is never the first attempt on a
//   ready skill with a lesson; the requests continue its run (≤ maxRun in a row). One test-out
//   rule: a draw is planned only when the learner's own offer (inTestOut) holds after the worst
//   case of the warmup (a wrong item, or every rated step of the warmup lesson wrong), and an
//   offered draw no themed workshop can host goes to the Practice Pier, so plan, learner and
//   targetDifficulty agree. Ties by id;
//   templates prefer a format an available themed workshop hosts, then pictorial/abstract, then
//   constructed (`isConstructedTemplate`), then id.
// - Challenge: round(challengeShare × the plan's item budgets) items, dealt round-robin from the
//   last request backward (the remediation request last); each goes to the request's on-track
//   skills by highest P(ref), placed late. A request without such a skill turns them into new
//   items.
// - Reviews: transfer probes need a hosted abstract template; otherwise the task stays 'review'.
//   A failed review is due again at once: besides `dueReviews`, every practiced-track skill that is
//   'needs-review' with `memory.consecutiveFails > 0` joins the due list as an ordinary review
//   (dueTs = now, not at risk), in the same order (depth desc, dueTs, id). Failed reviews are
//   scheduled ahead of compression, and the ordinary reviews they encompass (w ≥ 0.5) are dropped
//   before the rest is compressed.
// - Remediation: the lesson task is planned unless the skill's lesson mode is 'none', whatever the
//   skill's status (ready, learning or on the practiced track).
// - Puzzle Tower requests always carry decor (when `puzzleDecor` is non-empty), like requests
//   with challenge items.

import type {
  DecorId,
  DueReview,
  ItemTemplate,
  LearnerState,
  MisconceptionId,
  PlannedRequest,
  PlannedTask,
  PlanSessionInput,
  SessionPlan,
  Skill,
  SkillGraph,
  SkillId,
  SkillState,
  SkillStatus,
  WorkshopCapability,
  WorkshopId,
} from '@number-island/shared';
import { FORMAT_DEFAULT_REPRESENTATION } from '@number-island/shared';
import { isConstructedTemplate } from '../items/answer-kind';
import { createEloFireModel, type EloFireModel } from '../learner/elo-fire';
import { compressedBy, compressReviews, reviewContext } from '../learner/review';
import { DAY_MS, type EngineParams, PARAMS } from '../params';
import { createRng, fnv1a32, type Rng } from '../rng';
import {
  byTier,
  hosts,
  materialsFor,
  PUZZLE_TOWER,
  practicePier,
  RHYTHM_ORCHARD,
  requestProducts,
  residentPool,
  themedWorkshops,
} from './workshops';

export interface PlanOptions {
  params?: EngineParams;
  /** GameData decor ids with source 'puzzle': the rare decor a request with challenge items adds (reward.decor). Absent or empty → no decor. */
  puzzleDecor?: DecorId[];
  /** A remediation queued by adaptNext (AdaptDecision.queueRemediation): the plan's first request becomes that skill's lesson. */
  remediation?: { skillId: SkillId; misconceptionId: MisconceptionId };
}

/** One ranked entry of the new-skill pool (04 §6.2). */
export interface RankedSkill {
  skillId: SkillId;
  score: number;
  inProgress: boolean;
}

const SEED_MAX = 0x7fffffff;
const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface Ctx {
  P: EngineParams;
  graph: SkillGraph;
  state: LearnerState;
  now: number;
  model: EloFireModel;
  rng: Rng;
  status: Map<SkillId, SkillStatus>;
  pRef: Map<SkillId, number>;
  /** Plannable skills (in the graph with at least one template), sorted by id. */
  skills: SkillId[];
  due: DueReview[];
  /** Practiced-track skills by highest P(ref), then id. */
  onTrackRanked: SkillId[];
  /** The new-skill pool in rank order (in-progress first, then score). */
  ranked: RankedSkill[];
  maxRun: number;
  /** The warmup item's skill: a request's first items continue its run (04 §4, ≤ 3 in a row). */
  runStart: SkillId | null;
  lessonCost: number;
  itemRange: [number, number];
  /** K column for slices (04 §2.4: only a K child). */
  isK: boolean;
}

interface Focus {
  skillId: SkillId;
  lesson: boolean;
  testOut: boolean;
  remediation: boolean;
}

/** A task before sequencing. */
interface Slot {
  skillId: SkillId;
  templateId: string;
  context: PlannedTask['context'];
}

interface Composition {
  tasks: PlannedTask[];
  items: number;
  challenge: number;
  lessons: number;
  testOutHosted: boolean;
  /** The focus skill's test-out draw, all of it placed before its lesson; [] without one. */
  testOut: string[];
}

const onTrack = (state: LearnerState, s: SkillId): boolean => {
  const st = state.skills[s];
  return st !== undefined && (st.practicedAt !== null || st.assumed);
};

function templatesOf(graph: SkillGraph, s: SkillId): ItemTemplate[] {
  const skill = graph.skills[s];
  if (!skill) return [];
  return skill.templates
    .map((id) => graph.templates[id])
    .filter((t): t is ItemTemplate => t !== undefined)
    .sort(byTier);
}

/**
 * A skill's evidence templates (those whose items take a constructed answer, by the template's
 * own answer kind: `isConstructedTemplate`), or all its templates when it has none.
 */
export function evidenceTemplates(graph: SkillGraph, s: SkillId): ItemTemplate[] {
  const all = templatesOf(graph, s);
  const evidence = all.filter(isConstructedTemplate);
  return evidence.length > 0 ? evidence : all;
}

/**
 * The evidence templates a skill off the practiced track still needs for its practiced rule
 * (04 §3): ones adding a format or tier (standard) or a representation, or the abstract tier
 * (gateway), that its correct, unhinted `recent` entries lack. Empty on the practiced track.
 */
export function neededTemplates(
  graph: SkillGraph,
  state: LearnerState,
  s: SkillId,
): ItemTemplate[] {
  const skill = graph.skills[s];
  if (!skill || onTrack(state, s)) return [];
  const evidence = templatesOf(graph, s).filter(isConstructedTemplate);
  const correct = (state.skills[s]?.recent ?? []).filter((r) => r.correct && !r.hinted);
  if (skill.gateway) {
    const reps = new Set(correct.map((r) => r.representation));
    const abstract = correct.some((r) => r.tier === 'abstract');
    return evidence.filter(
      (t) => !reps.has(representationOf(t)) || (!abstract && t.tier === 'abstract'),
    );
  }
  const formats = new Set(correct.map((r) => r.format));
  const tiers = new Set(correct.map((r) => r.tier));
  return evidence.filter((t) => !formats.has(t.format) || !tiers.has(t.tier));
}

/** The skill's last explicit review failed (`memory.consecutiveFails > 0`). */
const failedReview = (state: LearnerState, s: SkillId): boolean =>
  (state.skills[s]?.memory?.consecutiveFails ?? 0) > 0;

/** Fact-fluency skills on the practiced track that are not fluent yet (04 §6.5). */
function needsFluency(graph: SkillGraph, state: LearnerState, s: SkillId): boolean {
  return (
    graph.skills[s]?.kind === 'fact-fluency' &&
    onTrack(state, s) &&
    state.skills[s]?.fluentAt === null
  );
}

/**
 * Rank the new-skill pool (04 §6.2): the frontier (ready or learning) plus fluency skills,
 * in-progress first, then by score = 1.0·strandBalance + 1.5·unlockValue + 1.0·gateway +
 * 2.0·inProgress (weights from params), ties by id.
 */
export function rankNewSkills(
  input: Pick<PlanSessionInput, 'child' | 'state' | 'graph' | 'now'>,
  params: EngineParams = PARAMS,
): RankedSkill[] {
  const { graph, state, now, child } = input;
  const model = createEloFireModel(graph, { childId: child.childId, isK: child.isK, params });
  return rankWith(graph, state, now, model, params);
}

function rankWith(
  graph: SkillGraph,
  state: LearnerState,
  now: number,
  model: EloFireModel,
  P: EngineParams,
): RankedSkill[] {
  const plannable = (s: SkillId) => templatesOf(graph, s).length > 0;
  const pool = new Set(model.frontier(state).filter(plannable));
  // A fluency skill whose last review failed is `needs-review`: it is reviewed first (the failed
  // review path of `dueNow`), not a focus, because a request never reviews its own focus skill.
  for (const s of graph.nodes) {
    if (plannable(s) && needsFluency(graph, state, s) && !failedReview(state, s)) pool.add(s);
  }
  const ids = [...pool].sort(byId);

  // The strand's latest attempt: the max ts over its skills' evidence (SkillState.recent).
  const latest = new Map<string, number>();
  for (const s of Object.keys(state.skills).sort()) {
    const strand = graph.skills[s]?.strand;
    if (!strand) continue;
    for (const r of state.skills[s]?.recent ?? []) {
      latest.set(strand, Math.max(latest.get(strand) ?? Number.NEGATIVE_INFINITY, r.ts));
    }
  }
  const maxDesc = Math.max(0, ...ids.map((s) => graph.descendants2[s] ?? 0));
  const p = P.planner;
  const ranked = ids.map((s): RankedSkill => {
    const skill = graph.skills[s] as Skill;
    const last = latest.get(skill.strand);
    const strandBalance =
      last === undefined ? 1 : Math.min(1, Math.max(0, now - last) / DAY_MS / p.strandBalanceDays);
    const unlockValue = maxDesc > 0 ? (graph.descendants2[s] ?? 0) / maxDesc : 0;
    const inProgress = model.status(state, s, now) === 'learning';
    const score =
      p.scoreStrandBalance * strandBalance +
      p.scoreUnlockValue * unlockValue +
      p.scoreGateway * (skill.gateway ? 1 : 0) +
      p.scoreInProgress * (inProgress ? 1 : 0);
    return { skillId: s, score, inProgress };
  });
  return ranked.sort(
    (a, b) =>
      Number(b.inProgress) - Number(a.inProgress) ||
      b.score - a.score ||
      byId(a.skillId, b.skillId),
  );
}

/** The template ids a test-out draws from (03 §6.5): the compiled pool, else abstract (else pictorial). */
function testOutPool(graph: SkillGraph, skill: Skill): ItemTemplate[] {
  const all = templatesOf(graph, skill.id);
  if (skill.lesson.testOut.templateIds) {
    const ids = new Set(skill.lesson.testOut.templateIds);
    return all.filter((t) => ids.has(t.id));
  }
  const abstract = all.filter((t) => t.tier === 'abstract');
  return abstract.length > 0 ? abstract : all.filter((t) => t.tier === 'pictorial');
}

const representationOf = (t: ItemTemplate) =>
  t.representation ?? FORMAT_DEFAULT_REPRESENTATION[t.format];

/** Round-robin over representations so consecutive draws differ in template and representation. */
function interleaveByRepresentation(ts: readonly ItemTemplate[]): ItemTemplate[] {
  const groups = new Map<string, ItemTemplate[]>();
  for (const t of [...ts].sort((a, b) => byId(a.id, b.id))) {
    const r = representationOf(t);
    groups.set(r, [...(groups.get(r) ?? []), t]);
  }
  const lists = [...groups.keys()].sort().map((k) => groups.get(k) as ItemTemplate[]);
  const out: ItemTemplate[] = [];
  for (let i = 0; out.length < ts.length; i++) {
    for (const l of lists) if (l[i]) out.push(l[i] as ItemTemplate);
  }
  return out;
}

/** A test-out draw of `items` templates from the hosted pool, or null when the draw rules fail. */
function testOutDraw(
  graph: SkillGraph,
  skill: Skill,
  cap: WorkshopCapability,
): ItemTemplate[] | null {
  const pool = testOutPool(graph, skill);
  const hosted = pool.filter((t) => hosts(cap, t.format));
  const items = skill.lesson.testOut.items;
  if (hosted.length === 0 || items < 1) return null;
  if (new Set(hosted.map((t) => t.id)).size < Math.min(2, pool.length, items)) return null;
  if (skill.gateway) {
    const poolReps = new Set(pool.map(representationOf)).size;
    const hostedReps = new Set(hosted.map(representationOf)).size;
    if (hostedReps < Math.min(2, poolReps, items)) return null;
  }
  const order = interleaveByRepresentation(hosted);
  return Array.from({ length: items }, (_, k) => order[k % order.length] as ItemTemplate);
}

/** Remaining items per skill can still be arranged with no run longer than maxRun. */
function feasible(
  counts: Map<SkillId, number>,
  total: number,
  last: SkillId | null,
  run: number,
  maxRun: number,
): boolean {
  for (const [x, c] of counts) {
    if (c === 0) continue;
    const others = total - c;
    const room = x === last ? maxRun * others + (maxRun - run) : maxRun * (others + 1);
    if (c > room) return false;
  }
  return true;
}

/**
 * Order a request's tasks (04 §6.3 pattern `[lesson?] new, new, review, new, review, new …`,
 * challenge items late) with no more than maxRun consecutive items of one skill. The lesson goes
 * first, or right after the focus skill's `lessonAfter` test-out items. Items that cannot be
 * placed without breaking the run rule are dropped.
 */
function sequence(
  lists: { new: Slot[]; review: Slot[]; challenge: Slot[] },
  lesson: Slot | null,
  focus: SkillId | null,
  lessonAfter: number,
  maxRun: number,
  runStart: SkillId | null,
): (Slot & { mode: PlannedTask['mode'] })[] {
  const out: (Slot & { mode: PlannedTask['mode'] })[] = [];
  let lessonPlaced = false;
  const placeLesson = () => {
    if (lesson && !lessonPlaced) out.push({ ...lesson, mode: 'lesson' });
    lessonPlaced = true;
  };
  if (lessonAfter === 0) placeLesson();
  const queues = {
    new: [...lists.new],
    review: [...lists.review],
    challenge: [...lists.challenge],
  };
  const counts = new Map<SkillId, number>();
  for (const q of Object.values(queues))
    for (const s of q) counts.set(s.skillId, (counts.get(s.skillId) ?? 0) + 1);
  let total = queues.new.length + queues.review.length + queues.challenge.length;
  // The warmup item (an item of `runStart`) comes right before the request: its run continues.
  let last: SkillId | null = runStart;
  let run = runStart === null ? 0 : 1;
  let nNew = 0;
  let nReview = 0;
  let placedFocus = 0;
  while (total > 0) {
    const first: (keyof typeof queues)[] =
      nNew < 2 || nReview >= nNew - 1 ? ['new', 'review'] : ['review', 'new'];
    const candidates: { cat: keyof typeof queues; index: number }[] = [];
    for (const cat of [...first, 'challenge'] as const) {
      const index = queues[cat].findIndex((s) => s.skillId !== last || run < maxRun);
      if (index >= 0) candidates.push({ cat, index });
    }
    if (candidates.length === 0) break;
    const ok = (c: { cat: keyof typeof queues; index: number }) => {
      const s = queues[c.cat][c.index] as Slot;
      const next = new Map(counts);
      next.set(s.skillId, (next.get(s.skillId) ?? 0) - 1);
      return feasible(next, total - 1, s.skillId, s.skillId === last ? run + 1 : 1, maxRun);
    };
    const pick = candidates.find(ok) ?? (candidates[0] as (typeof candidates)[number]);
    const [slot] = queues[pick.cat].splice(pick.index, 1) as [Slot];
    out.push({ ...slot, mode: 'item' });
    counts.set(slot.skillId, (counts.get(slot.skillId) ?? 0) - 1);
    total -= 1;
    run = slot.skillId === last ? run + 1 : 1;
    last = slot.skillId;
    if (pick.cat === 'new') nNew += 1;
    else if (pick.cat === 'review') nReview += 1;
    if (slot.skillId === focus) {
      placedFocus += 1;
      if (placedFocus === lessonAfter) placeLesson();
    }
  }
  placeLesson();
  return out;
}

function pickTemplate(ts: readonly ItemTemplate[], rng: Rng): ItemTemplate {
  return rng.pick([...ts].sort((a, b) => byId(a.id, b.id)));
}

/**
 * Build one request's tasks in `cap`, or null when `cap` cannot host the focus skill (its lesson
 * template when it gets a lesson, and at least one of its templates). `budgetIn` is the item count
 * (the lesson cost is already taken off); `challengeWanted` the challenge items dealt to it. A
 * test-out is never truncated: when sequencing cannot place the whole draw before the lesson,
 * the request is composed again without the test-out (lesson first).
 */
function compose(
  ctx: Ctx,
  i: number,
  focus: Focus | null,
  cap: WorkshopCapability,
  budgetIn: number,
  challengeWanted: number,
): Composition | null {
  const { graph, P, rng, maxRun } = ctx;
  let budget = budgetIn;
  const hosted = (s: SkillId) => templatesOf(graph, s).filter((t) => hosts(cap, t.format));
  /** New-learning templates: the hosted evidence templates. */
  const hostedEvidence = (s: SkillId) =>
    evidenceTemplates(graph, s).filter((t) => hosts(cap, t.format));
  const S = focus?.skillId ?? null;
  const skill = S ? (graph.skills[S] as Skill) : null;

  let practice: ItemTemplate[] = [];
  let lesson: Slot | null = null;
  let draw: ItemTemplate[] | null = null;
  if (focus && skill) {
    practice = hostedEvidence(focus.skillId);
    if (practice.length === 0) return null;
    if (focus.lesson) {
      const lt = graph.templates[skill.lesson.templateId];
      if (!lt || !hosts(cap, lt.format)) return null;
      lesson = { skillId: skill.id, templateId: lt.id, context: 'lesson' };
    }
    if (focus.testOut) {
      draw = testOutDraw(graph, skill, cap);
      if (draw && draw.length > budget) draw = null;
    }
  }
  const t = draw?.length ?? 0;

  // Reviews: due skills this workshop can host, compressed (04 §4), deepest first.
  const dueHere = ctx.due.filter((r) => r.skillId !== S && hosted(r.skillId).length > 0);
  const reviewTarget = focus ? Math.round(P.planner[sliceKey(ctx)].reviewShare * budget) : budget;
  // A skill whose last review failed is reviewed itself: an encompassing skill's implicit credit
  // (04 §4) lengthens its interval but never clears the failure, so compression may not drop it.
  const failed = (r: DueReview) => failedReview(ctx.state, r.skillId);
  const failedDue = dueHere.filter(failed).slice(0, reviewTarget);
  // A scheduled failed review still compresses the ordinary reviews it encompasses.
  const covered = new Set(failedDue.flatMap((r) => compressedBy(graph, r.skillId, P)));
  const reviews = [
    ...failedDue,
    ...compressReviews(
      dueHere.filter((r) => !failed(r) && !covered.has(r.skillId)),
      graph,
      reviewTarget - failedDue.length,
      P,
    ),
  ];
  const reviewIds = new Set(reviews.map((r) => r.skillId));

  // Challenge: practiced-track skills by highest P(ref), others before review skills.
  const onTrackHere = ctx.onTrackRanked.filter((s) => s !== S && hosted(s).length > 0);
  const challengeSkills = [
    ...onTrackHere.filter((s) => !reviewIds.has(s)),
    ...onTrackHere.filter((s) => reviewIds.has(s)),
  ];
  let c = challengeSkills.length > 0 ? Math.min(challengeWanted, budget) : 0;
  let r = Math.min(reviews.length, Math.max(0, budget - c));
  let s = focus ? budget - r - c : 0;
  if (focus && s < t) {
    const cut = Math.min(c, t - s);
    c -= cut;
    s += cut;
    const cutR = Math.min(r, t - s);
    r -= cutR;
    s += cutR;
  }

  // Breakers for the focus skill's runs: one other new skill that needs no lesson first, then
  // practiced-track skills.
  const second = focus
    ? ctx.ranked
        .map((x) => x.skillId)
        .find((x) => {
          if (x === S || reviewIds.has(x) || hostedEvidence(x).length === 0) return false;
          const st = ctx.status.get(x);
          const lessonFirst = st === 'ready' && graph.skills[x]?.lesson.mode !== 'none';
          return !lessonFirst;
        })
    : undefined;
  const fillers = onTrackHere.filter((x) => !reviewIds.has(x) && x !== second);
  let s2 = 0;
  let f = 0;
  if (focus) {
    // A warmup item of the focus skill starts its first run, so that run holds one item fewer.
    const startRun = ctx.runStart === S ? 1 : 0;
    while (s > maxRun * (budget - s + 1) - startRun && s - 1 >= t) {
      s -= 1;
      if (second) s2 += 1;
      else if (fillers.length > 0) f += 1;
      else budget -= 1; // nothing can break the run: the request is shorter
    }
  } else {
    f = fillers.length > 0 || reviews.length > 0 ? budget - r - c : 0;
  }

  // Slots.
  const newSlots: Slot[] = [];
  if (S) {
    for (const tpl of draw ?? []) {
      newSlots.push({ skillId: S, templateId: tpl.id, context: 'practice' });
    }
    const rot = (ctx.state.skills[S]?.n ?? 0) % practice.length;
    for (let k = 0; k < s - t; k++) {
      const tpl = practice[(rot + k) % practice.length] as ItemTemplate;
      newSlots.push({ skillId: S, templateId: tpl.id, context: 'practice' });
    }
  }
  if (second) {
    const ts = hostedEvidence(second);
    const rot = (ctx.state.skills[second]?.n ?? 0) % ts.length;
    for (let k = 0; k < s2; k++) {
      const tpl = ts[(rot + k) % ts.length] as ItemTemplate;
      newSlots.push({ skillId: second, templateId: tpl.id, context: 'practice' });
    }
  }
  const reviewSlots: Slot[] = reviews.slice(0, r).map((rv) => {
    const status = ctx.status.get(rv.skillId) ?? 'practiced';
    let context: Slot['context'] = reviewContext(status, rng.fork(`ctx:${i}:${rv.skillId}`), P);
    let pool = hosted(rv.skillId);
    if (context === 'transfer-probe') {
      const abstract = pool.filter((x) => x.tier === 'abstract');
      if (abstract.length > 0) pool = abstract;
      else context = 'review';
    }
    const tpl = pickTemplate(pool, rng.fork(`review:${i}:${rv.skillId}`));
    return { skillId: rv.skillId, templateId: tpl.id, context };
  });
  const fillerSlots: Slot[] = [];
  const reviewOnlyPool = focus
    ? fillers
    : [...fillers, ...reviews.slice(0, r).map((x) => x.skillId)];
  for (let k = 0; k < f && reviewOnlyPool.length > 0; k++) {
    const x = reviewOnlyPool[k % reviewOnlyPool.length] as SkillId;
    const tpl = pickTemplate(hosted(x), rng.fork(`filler:${i}:${k}:${x}`));
    fillerSlots.push({ skillId: x, templateId: tpl.id, context: 'practice' });
  }
  const challengeSlots: Slot[] = [];
  for (let k = 0; k < c; k++) {
    const x = challengeSkills[k % challengeSkills.length] as SkillId;
    const tpl = pickTemplate(hosted(x), rng.fork(`challenge:${i}:${k}:${x}`));
    challengeSlots.push({ skillId: x, templateId: tpl.id, context: 'challenge' });
  }

  const ordered = sequence(
    { new: newSlots, review: [...reviewSlots, ...fillerSlots], challenge: challengeSlots },
    lesson,
    S,
    t,
    maxRun,
    ctx.runStart,
  );
  if (focus && draw) {
    const at = ordered.findIndex((x) => x.mode === 'lesson');
    const before = ordered.slice(0, at < 0 ? ordered.length : at);
    const placed = before.filter((x) => x.skillId === S && x.mode === 'item').length;
    if (placed < draw.length) {
      return compose(ctx, i, { ...focus, testOut: false }, cap, budgetIn, challengeWanted);
    }
  }
  const tasks: PlannedTask[] = ordered.map((x, j) => ({
    skillId: x.skillId,
    templateId: x.templateId,
    seed: rng.fork(`seed:${i}:${j}`).int(0, SEED_MAX),
    context: x.context,
    mode: x.mode,
  }));
  const items = tasks.filter((x) => x.mode === 'item');
  return {
    tasks,
    items: items.length,
    challenge: items.filter((x) => x.context === 'challenge').length,
    lessons: tasks.length - items.length,
    testOutHosted: draw !== null,
    testOut: (draw ?? []).map((x) => x.id),
  };
}

const sliceKey = (ctx: Ctx): 'sliceK' | 'sliceG2' => (ctx.isK ? 'sliceK' : 'sliceG2');

/** Lexicographic comparison of score tuples, higher first. */
function compareDesc(a: readonly number[], b: readonly number[]): number {
  for (let k = 0; k < a.length; k++) {
    const d = (b[k] ?? 0) - (a[k] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * The planner's due list: `dueReviews` plus every practiced-track skill that is `needs-review`
 * because of a failed review (`memory.consecutiveFails > 0`), which is due again at once (a failed
 * review moves `dueTs` ≥ 1 day ahead, so `dueReviews` alone would not schedule it; a failed
 * prerequisite probe relies on this). Such a skill is an ordinary review with `dueTs = now`. Same
 * order as `dueReviews`: depth desc, then dueTs, then id.
 */
function dueNow(
  model: EloFireModel,
  state: LearnerState,
  graph: SkillGraph,
  now: number,
  status: ReadonlyMap<SkillId, SkillStatus>,
): DueReview[] {
  const due = model.dueReviews(state, now);
  const listed = new Set(due.map((r) => r.skillId));
  for (const s of Object.keys(state.skills).sort(byId)) {
    if (listed.has(s) || !onTrack(state, s) || status.get(s) !== 'needs-review') continue;
    if (!failedReview(state, s)) continue;
    due.push({
      skillId: s,
      dueTs: now,
      retrievability: model.retrievability(state, s, now) ?? 1,
      depth: graph.depth[s] ?? 0,
      atRisk: false,
    });
  }
  return due.sort((a, b) => b.depth - a.depth || a.dueTs - b.dueTs || byId(a.skillId, b.skillId));
}

export function planSession(input: PlanSessionInput, opts: PlanOptions = {}): SessionPlan {
  const P = opts.params ?? PARAMS;
  const { child, state, graph, now, minutes } = input;
  const model = createEloFireModel(graph, { childId: child.childId, isK: child.isK, params: P });
  const hash = fnv1a32(`plan:${child.childId}:${now}:${graph.contentVersion}`);
  const rng = createRng(hash);
  const kItems = child.grade === 'K' || child.grade === '1';
  const itemRange = kItems ? P.planner.requestItemsK : P.planner.requestItemsG2;
  const secondsPerItem = kItems ? P.planner.secondsPerItemK : P.planner.secondsPerItemG2;

  const skills = Object.keys(graph.skills)
    .filter((s) => templatesOf(graph, s).length > 0)
    .sort(byId);
  if (skills.length === 0)
    throw new Error('planSession: the skill graph has no skill with templates');
  const status = new Map(skills.map((s) => [s, model.status(state, s, now)] as const));
  const pRef = new Map(skills.map((s) => [s, model.pRef(state, s)] as const));
  const byP = (a: SkillId, b: SkillId) => (pRef.get(b) ?? 0) - (pRef.get(a) ?? 0) || byId(a, b);
  const plannable = new Set(skills);
  const onTrackRanked = skills.filter((s) => onTrack(state, s)).sort(byP);

  const ctx: Ctx = {
    P,
    graph,
    state,
    now,
    model,
    rng,
    status,
    pRef,
    skills,
    due: dueNow(model, state, graph, now, status).filter((r) => plannable.has(r.skillId)),
    onTrackRanked,
    ranked: rankWith(graph, state, now, model, P),
    maxRun: P.planner.maxRun,
    runStart: null,
    lessonCost: P.planner.lessonItemCost,
    itemRange,
    isK: child.isK,
  };

  const themed = themedWorkshops(input.workshopsAvailable);
  const pier = practicePier(input.workshopsAvailable);

  // ---------- focus skills and request count ----------
  const concurrent = child.isK ? P.planner.concurrentK : P.planner.concurrentG2;
  const chosen = ctx.ranked.slice(0, concurrent).map((x) => x.skillId);
  const rem =
    opts.remediation && plannable.has(opts.remediation.skillId) ? opts.remediation.skillId : null;
  const focusIds = rem ? [rem, ...chosen.filter((s) => s !== rem)] : chosen;
  const hostsAny = (cap: WorkshopCapability, ids: readonly SkillId[]) =>
    ids.some((s) => templatesOf(graph, s).some((t) => hosts(cap, t.format)));
  const hostingCount = themed.filter((cap) =>
    hostsAny(cap, focusIds.length > 0 ? focusIds : ctx.due.map((r) => r.skillId)),
  ).length;
  const nReq = Math.max(
    P.planner.requestsMin,
    Math.min(
      P.planner.requestsMax,
      focusIds.length >= 3 || hostingCount >= 3 ? P.planner.requestsMax : P.planner.requestsMin,
    ),
  );

  // An item warmup (rules a–d) is the only attempt before a request's first items, so a test-out
  // is planned only when the learner would still offer it after that warmup went wrong: the plan
  // and the learner (which decides at the first evidence attempt, 04 §7a) then agree.
  const itemWarmup = warmupBeforeFocus(ctx, themed);
  const offerState = itemWarmup ? afterWrongAttempt(state, itemWarmup.skillId, model, P) : state;

  const focusOf = (i: number): Focus | null => {
    if (focusIds.length === 0) return null;
    const s = focusIds[i % focusIds.length] as SkillId;
    const skill = graph.skills[s] as Skill;
    if (i === 0 && rem) {
      return {
        skillId: s,
        lesson: skill.lesson.mode !== 'none',
        testOut: false,
        remediation: true,
      };
    }
    const ready = status.get(s) === 'ready';
    const lesson = ready && skill.lesson.mode !== 'none';
    // The learner's own offer rule (03 §6.5, 04 §7a), on the worst case of the warmup.
    const offered = lesson && model.inTestOut(offerState, s);
    return { skillId: s, lesson, testOut: offered, remediation: false };
  };
  let focuses = Array.from({ length: nReq }, (_, i) => focusOf(i));

  // ---------- budgets and challenge distribution ----------
  const items = Math.min(
    itemRange[1],
    Math.max(itemRange[0], Math.round(Math.min(minutes * 60, 180) / secondsPerItem)),
  );

  // ---------- requests ----------
  const hexHash = hash.toString(16).padStart(8, '0');
  const decor = [...new Set(opts.puzzleDecor ?? [])].sort(byId);
  const build = (fs: readonly (Focus | null)[]) => {
    const budgets = fs.map((f) => Math.max(0, items - (f?.lesson ? ctx.lessonCost : 0)));
    const totalChallenge = Math.round(
      P.planner[sliceKey(ctx)].challengeShare * budgets.reduce((a, b) => a + b, 0),
    );
    const dealOrder = Array.from({ length: nReq }, (_, k) => nReq - 1 - k);
    if (rem && nReq > 1) dealOrder.push(dealOrder.splice(dealOrder.indexOf(0), 1)[0] as number);
    const challenge = budgets.map(() => 0);
    for (let k = 0; k < totalChallenge; k++) {
      const idx = dealOrder[k % dealOrder.length] as number;
      challenge[idx] = (challenge[idx] ?? 0) + 1;
    }

    const used = new Map<WorkshopId, number>();
    const requests: PlannedRequest[] = [];
    const comps: Composition[] = [];
    for (let i = 0; i < nReq; i++) {
      const focus = fs[i] as Focus | null;
      const budget = budgets[i] as number;
      const fillable = (c: Composition) => c.items + c.lessons * ctx.lessonCost >= itemRange[0];
      const skill = focus ? (graph.skills[focus.skillId] as Skill) : null;
      const options = themed
        .map((cap) => ({ cap, comp: compose(ctx, i, focus, cap, budget, challenge[i] ?? 0) }))
        .filter(
          (o): o is { cap: WorkshopCapability; comp: Composition } =>
            o.comp !== null && o.comp.items > 0,
        );
      const formatsHosted = (cap: WorkshopCapability) =>
        skill
          ? new Set(
              templatesOf(graph, skill.id)
                .filter((t) => hosts(cap, t.format))
                .map((t) => t.format),
            ).size
          : 0;
      const needed = skill ? neededTemplates(graph, state, skill.id) : [];
      const hostsNeeded = (c: WorkshopCapability) => needed.some((t) => hosts(c, t.format));
      /** Due reviews a workshop hosts (ranks review-only requests). */
      const dueHosted = (c: WorkshopCapability) =>
        ctx.due.filter((r) => templatesOf(graph, r.skillId).some((t) => hosts(c, t.format))).length;
      const key = (o: { cap: WorkshopCapability; comp: Composition }): number[] =>
        skill
          ? [
              hostsNeeded(o.cap) ? 1 : 0,
              fillable(o.comp) ? 1 : 0,
              focus?.testOut && o.comp.testOutHosted ? 1 : 0,
              o.cap.strands.includes(skill.strand) ? 1 : 0,
              used.has(o.cap.workshopId) ? 0 : 1,
              formatsHosted(o.cap),
            ]
          : [
              dueHosted(o.cap),
              fillable(o.comp) ? 1 : 0,
              used.has(o.cap.workshopId) ? 0 : 1,
              o.comp.items,
            ];
      options.sort(
        (a, b) => compareDesc(key(a), key(b)) || byId(a.cap.workshopId, b.cap.workshopId),
      );
      let best = options[0];
      const orchard = options.find((o) => o.cap.workshopId === RHYTHM_ORCHARD);
      if (focus && needsFluency(graph, state, focus.skillId) && orchard) best = orchard;
      // 04 §6.3 "needed format" fallback: no themed workshop hosts a template the skill still
      // needs; for a review-only request, none hosts a due review.
      const missesNeeded = needed.length > 0 && !(best && hostsNeeded(best.cap));
      const missesDue = !focus && ctx.due.length > 0 && !(best && dueHosted(best.cap) > 0);
      if (missesNeeded || missesDue) {
        const pierComp = compose(ctx, i, focus, pier, budget, challenge[i] ?? 0);
        if (pierComp && pierComp.items > 0) best = { cap: pier, comp: pierComp };
      }
      // An offered test-out no themed workshop can host as a passable draw goes to the Practice
      // Pier, which hosts every format: a planned test-out is always a draw the learner can pass.
      if (focus?.testOut && !(best?.comp.testOutHosted ?? false)) {
        const pierComp = compose(ctx, i, focus, pier, budget, challenge[i] ?? 0);
        if (pierComp?.testOutHosted) best = { cap: pier, comp: pierComp };
      }
      if (!best || !fillable(best.comp)) {
        let pierComp = compose(ctx, i, focus, pier, budget, challenge[i] ?? 0);
        if (!pierComp && focus?.lesson) {
          // The lesson template is missing from the graph: plan the skill's items alone.
          pierComp = compose(
            ctx,
            i,
            { ...focus, lesson: false, testOut: false },
            pier,
            budget,
            challenge[i] ?? 0,
          );
        }
        if (pierComp && (!best || fillable(pierComp))) best = { cap: pier, comp: pierComp };
      }
      const chosenCap = best?.cap ?? pier;
      const comp: Composition = best?.comp ?? {
        tasks: [],
        items: 0,
        challenge: 0,
        lessons: 0,
        testOutHosted: false,
        testOut: [],
      };
      comps.push(comp);

      // Resident: rotate through the pool, starting at a plan-dependent offset.
      const pool = residentPool(chosenCap, input.workshopsAvailable, input.island);
      const turn = used.get(chosenCap.workshopId) ?? 0;
      const residentId = pool[(hash + turn) % pool.length] as string;
      used.set(chosenCap.workshopId, turn + 1);

      const products = requestProducts(chosenCap, residentId, input.workshopsAvailable);
      const materials = materialsFor(products, comp.items);
      const reward: PlannedRequest['reward'] = { materials };
      if (decor.length > 0 && (comp.challenge > 0 || chosenCap.workshopId === PUZZLE_TOWER)) {
        reward.decor = [decor[rng.fork(`decor:${i}`).int(0, decor.length - 1)] as DecorId];
      }
      requests.push({
        id: `${hexHash}-${now}-r${i}`,
        residentId,
        workshopId: chosenCap.workshopId,
        tasks: comp.tasks,
        reward,
        narration: focus?.remediation ? 'req.idea' : 'req.help',
        vars: { who: residentId, count: comp.items, material: Object.keys(materials)[0] ?? '' },
      });
    }
    return { requests, comps };
  };

  // ---------- warmup (04 §6.1) ----------
  // An item warmup only ever comes from a skill already attempted or one with no lesson (rules
  // a–d), so it never starts or cancels a test-out whatever request the child then picks. The
  // requests continue the warmup's run (≤ 3 items of one skill in a row, 04 §4).
  let warmup = itemWarmup;
  ctx.runStart = warmup?.skillId ?? null;
  let built = build(focuses);
  if (!warmup) {
    // Nothing is attempted yet. (e) The lesson of the first request's focus skill (preferring one
    // whose test-out is not offered) is the warmup, and requests on that skill skip that lesson.
    // No request is rebuilt around another focus, so remediation and every request's own draw
    // stay as planned.
    // A queued remediation keeps its own lesson in its request (04 §6.4), so it is not a candidate.
    const withLesson = focuses.filter((f): f is Focus => f?.lesson === true && !f.remediation);
    const f0 = withLesson.find((f) => !f.testOut) ?? withLesson[0];
    const lessonSkill = f0 ? graph.skills[f0.skillId] : undefined;
    const lessonTpl = lessonSkill ? graph.templates[lessonSkill.lesson.templateId] : undefined;
    if (f0 && lessonSkill && lessonTpl) {
      warmup = warmupTask(ctx, f0.skillId, lessonTpl.id, 'lesson', 'lesson');
      // The lesson's child steps are rated `lesson` attempts (w × 0.5): with any, the skill is
      // touched and gets no test-out; a demonstration-only lesson leaves it untouched and keeps its
      // draw. Every other test-out is planned only if it holds after all those steps go wrong.
      const steps = lessonChildSteps(lessonSkill);
      const worst = afterWrongAttempt(state, f0.skillId, model, P, P.rating.lessonWeight, steps);
      focuses = focuses.map((f) => {
        if (!f) return f;
        if (f.skillId === f0.skillId)
          return { ...f, lesson: false, testOut: f.testOut && steps === 0 };
        return { ...f, testOut: f.testOut && model.inTestOut(worst, f.skillId) };
      });
      built = build(focuses);
    } else {
      // (g) No lesson is planned at all: an evidence template of the first focus skill.
      const s = focuses[0]?.skillId ?? (ctx.skills[0] as SkillId);
      const tpl = warmupTemplate(evidenceTemplates(graph, s), themed);
      warmup = warmupTask(ctx, s, tpl.id, 'warmup', 'item');
      ctx.runStart = s;
      built = build(focuses);
    }
  }

  return {
    requests: built.requests,
    warmup,
    windDownAtMs: now + minutes * 60_000,
  };
}

/** The most rated `lesson` attempts a lesson can record: its faded child steps and scaffolded items. */
function lessonChildSteps(skill: Skill): number {
  const faded = skill.lesson.faded.reduce((a, e) => a + Math.max(1, e.childSteps ?? 1), 0);
  return faded + skill.lesson.scaffolded.count;
}

/**
 * The state after the worst `times` first attempts on `skill` at weight `w`: each wrong answer
 * (e = −1) lowers θg by Kg(N)·w and the skill's offset by Ks(n)·w (04 §2.3). Used to plan only
 * test-outs the learner still offers whatever the warmup's outcome (a wrong answer lowers P(ref);
 * a right one raises it).
 */
function afterWrongAttempt(
  state: LearnerState,
  skill: SkillId,
  model: EloFireModel,
  P: EngineParams,
  w = 1,
  times = 1,
): LearnerState {
  let s = state;
  for (let k = 0; k < times; k++) s = oneWrongAttempt(s, skill, model, P, w);
  return s;
}

function oneWrongAttempt(
  state: LearnerState,
  skill: SkillId,
  model: EloFireModel,
  P: EngineParams,
  w: number,
): LearnerState {
  const st = state.skills[skill];
  const n = st?.n ?? 0;
  const theta = model.skillOffset(state, skill) - (w * P.rating.ks) / (1 + P.rating.ksDecay * n);
  const base: SkillState = st ?? {
    theta,
    n: 0,
    recent: [],
    assumed: false,
    override: null,
    practicedAt: null,
    fluentAt: null,
    masteredAt: null,
    memory: null,
    atRiskDueTs: null,
    misconceptionHits: [],
  };
  return {
    ...state,
    thetaG: state.thetaG - (w * P.rating.kg) / (1 + P.rating.kgDecay * state.nTotal),
    nTotal: state.nTotal + 1,
    skills: { ...state.skills, [skill]: { ...base, theta, n: n + 1 } },
  };
}

/** The warmup task's template: hosted by an available themed workshop, non-concrete, constructed, id. */
function warmupTemplate(
  ts: readonly ItemTemplate[],
  themed: readonly WorkshopCapability[],
): ItemTemplate {
  const key = (t: ItemTemplate): number[] => [
    themed.some((c) => hosts(c, t.format)) ? 1 : 0,
    t.tier === 'concrete' ? 0 : 1,
    isConstructedTemplate(t) ? 1 : 0,
  ];
  return [...ts].sort((a, b) => compareDesc(key(a), key(b)) || byId(a.id, b.id))[0] as ItemTemplate;
}

function warmupTask(
  ctx: Ctx,
  skillId: SkillId,
  templateId: string,
  context: PlannedTask['context'],
  mode: PlannedTask['mode'],
): PlannedTask {
  return { skillId, templateId, seed: ctx.rng.fork('warmup').int(0, SEED_MAX), context, mode };
}

/**
 * The warmup rules (04 §6.1) that need no request (ties by id): (a) the practiced-track skill
 * with the highest P(ref) ≥ warmupMinP; (b) the highest-P(ref) practiced-track skill; (c) the
 * highest-P(ref) frontier skill already attempted ('learning'), with one of its evidence
 * templates; (d) the highest-P(ref) 'ready' skill whose lesson mode is 'none' (it has no lesson
 * or test-out to lose). Null when none applies: then the first request's focus skill decides.
 */
function warmupBeforeFocus(ctx: Ctx, themed: readonly WorkshopCapability[]): PlannedTask | null {
  const { graph, P, pRef } = ctx;
  const byP = (a: SkillId, b: SkillId) => (pRef.get(b) ?? 0) - (pRef.get(a) ?? 0) || byId(a, b);
  const easy = ctx.onTrackRanked.find((s) => (pRef.get(s) ?? 0) >= P.planner.warmupMinP);
  const onTrackSkill = easy ?? ctx.onTrackRanked[0];
  if (onTrackSkill) {
    const tpl = warmupTemplate(templatesOf(graph, onTrackSkill), themed);
    return warmupTask(ctx, onTrackSkill, tpl.id, 'warmup', 'item');
  }
  const frontier = ctx.model
    .frontier(ctx.state)
    .filter((s) => templatesOf(graph, s).length > 0)
    .sort(byP);
  const skillId =
    frontier.find((s) => ctx.status.get(s) === 'learning') ??
    frontier.find((s) => ctx.status.get(s) === 'ready' && graph.skills[s]?.lesson.mode === 'none');
  if (!skillId) return null;
  const tpl = warmupTemplate(evidenceTemplates(graph, skillId), themed);
  return warmupTask(ctx, skillId, tpl.id, 'warmup', 'item');
}
