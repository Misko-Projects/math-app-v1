// 04 §6.4 in-session adaptation: `adaptNext` (02 §5.4, §5.8 AdaptInput / AdaptDecision).
//
// Calling protocol (the TaskRunner's side; recorded in 04 §7b):
// - The runner calls `adaptNext` after every submit. `state` already includes the attempt just made
//   (the runner applies it first).
// - `request.tasks` is the runner's working list: tasks a decision inserts are spliced in right
//   after the current task. `doneTaskIds` holds the indexes of the tasks presented so far, the
//   current one included; the current task is `last.task`. `last.attemptNo` is 1 for the first try.
// - After it plays a worked solution (`show-solution`, logged as `hint.used` level 5, 02 §5.9 E2),
//   the runner calls `adaptNext` once more with the same `last` and `attemptNo + 1`. That call
//   resolves the item, so the wind-down and frustration checks run at the end of every item and
//   never cut into the current one (no overrun, §6.4 rule 6).
// - `queueRemediation` is returned whenever the current attempt matched a misconception that has
//   reached the trigger count, so it can repeat across calls on one item and on later items: the
//   runner keeps at most one queued remediation per (skill, misconception).
//
// First-try results inside the request for a skill s are read from the state: the last m entries of
// `state.skills[s].recent`, where m counts the presented tasks of s that enter `recent` (mode
// 'item', an evidence context, and a template whose own answer kind is constructed), capped at
// `recent.length`. The learner applies the same template rule, so a skip on a choice item is not
// evidence either.
//
// Rules, in order (the first that applies decides; the misconception side effect rides along):
//  1. misconception trigger (rule 5) → `queueRemediation`: the first `remediation` skill that is in
//     the graph, is not the current skill and is on the practiced track, else the current skill
//     (03 §7.1);
//  2. an unresolved item: first wrong → `retry` at the next hint rung the template generates
//     (levels 2–4: nudge → representation → worked step; level 1, replay, when it has none),
//     second wrong → `show-solution`, attempt ≥ 3 → resolved (lesson tasks have their own
//     scaffolding and never retry here);
//  3. wind-down at the budget (rule 6);
//  4. a failed prerequisite probe → end the request (the next plan schedules the prerequisite);
//     ahead of frustration, so a confidence item never replaces its outcome;
//  5. frustration (rule 4): a confidence item, then a break offer; if the child is still struggling
//     after it, finish the request early with full celebration. The confidence item's own
//     resolution never re-triggers (the signals still hold the wrongs before it, and the runner
//     offers the break right after it); a frustration on any later item ends the request;
//  6. every task presented → complete;
//  7. three first-try wrongs on a skill → probe its weakest prerequisite that has a template in a
//     format the request already uses (rule 3; none → no probe);
//  8. two first-try wrongs in a row on a skill → one CPA tier down for the rest of the request
//     (rule 2);
//  9. otherwise continue.

import type {
  AdaptDecision,
  AdaptInput,
  AttemptPayload,
  ItemFormat,
  ItemTemplate,
  LearnerState,
  MisconceptionId,
  PlannedTask,
  RatedAttempt,
  SkillGraph,
  SkillId,
  Tier,
} from '@number-island/shared';
import { boundMisconceptions } from '../content/binding';
import { isConstructedTemplate } from '../items/answer-kind';
import { createEloFireModel } from '../learner/elo-fire';
import { type EngineParams, PARAMS } from '../params';
import { fnv1a32 } from '../rng';

/** Attempt contexts whose non-choice first attempts enter `SkillState.recent` (04 §7a). */
const EVIDENCE_CONTEXTS: ReadonlySet<AttemptPayload['context']> = new Set([
  'practice',
  'review',
  'warmup',
  'challenge',
  'transfer-probe',
]);

/** Seed of an inserted prerequisite probe for `forSkill` (marks the task as a probe). */
export function probeSeed(requestId: string, forSkill: SkillId, prereq: SkillId): number {
  return fnv1a32(`adapt.probe|${requestId}|${forSkill}|${prereq}`);
}

/** Seed of the confidence item inserted on frustration (marks the task as that item). */
export function confidenceSeed(requestId: string): number {
  return fnv1a32(`adapt.confidence|${requestId}`);
}

/** One CPA tier down: abstract → pictorial → concrete → concrete. */
export function stepDownTier(t: Tier): Tier {
  return t === 'abstract' ? 'pictorial' : 'concrete';
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** CPA order: concrete below pictorial below abstract. */
const TIER_ORDER: Readonly<Record<Tier, number>> = { concrete: 0, pictorial: 1, abstract: 2 };

/**
 * Whether the first attempt at a task enters `SkillState.recent`: an item in an evidence context
 * whose template takes a constructed answer. The template's own answer kind decides (a choice
 * response never enters `recent`, 04 §7a); one format can answer both ways (ordinal tap-count).
 */
function entersRecent(task: PlannedTask, graph: SkillGraph): boolean {
  const t = graph.templates[task.templateId];
  return (
    task.mode === 'item' &&
    EVIDENCE_CONTEXTS.has(task.context) &&
    t !== undefined &&
    isConstructedTemplate(t)
  );
}

/** The first-try results on skill `s` inside this request, oldest first. */
function requestFirstTries(input: AdaptInput, s: SkillId): RatedAttempt[] {
  const recent = input.state.skills[s]?.recent ?? [];
  let m = 0;
  for (const i of new Set(input.doneTaskIds)) {
    const task = input.request.tasks[i];
    if (task && task.skillId === s && entersRecent(task, input.graph)) m += 1;
  }
  const k = Math.min(m, recent.length);
  return recent.slice(recent.length - k);
}

const onTrack = (state: LearnerState, s: SkillId): boolean => {
  const st = state.skills[s];
  return st !== undefined && (st.practicedAt !== null || st.assumed);
};

/** Formats of the request's templates (a workshop that hosts the request hosts them). */
function requestFormats(input: AdaptInput): Set<ItemFormat> {
  const out = new Set<ItemFormat>();
  for (const t of input.request.tasks) {
    const tpl = input.graph.templates[t.templateId];
    if (tpl) out.add(tpl.format);
  }
  return out;
}

/** A skill's templates, ranked: format already in the request, then abstract/pictorial, then authored order. */
function rankedTemplates(graph: SkillGraph, s: SkillId, formats: Set<ItemFormat>): ItemTemplate[] {
  const list = (graph.skills[s]?.templates ?? [])
    .map((id) => graph.templates[id])
    .filter((t): t is ItemTemplate => t !== undefined);
  const key = (t: ItemTemplate): number =>
    (formats.has(t.format) ? 0 : 2) + (t.tier === 'concrete' ? 1 : 0);
  return list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => key(a.t) - key(b.t) || a.i - b.i)
    .map((x) => x.t);
}

/**
 * Rule 1 (04 §6.4 rule 5): the remediation to queue, if the current attempt triggers one. Per
 * 03 §7.1 it is the first of the misconception's `remediation` skills that is in the graph, is not
 * the skill being practised and is on the practiced track; otherwise the skill itself (its own
 * lesson).
 */
function remediation(
  input: AdaptInput,
  P: EngineParams,
): { skillId: SkillId; misconceptionId: MisconceptionId } | undefined {
  const s = input.last.task.skillId;
  const hits = input.state.skills[s]?.misconceptionHits ?? [];
  for (const m of input.last.result.misconceptionIds) {
    if (hits.filter((h) => h.id === m).length < P.adapt.misconceptionHits) continue;
    const spec = boundMisconceptions().find((x) => x.id === m);
    const r = spec?.remediation.find(
      (id) => id !== s && input.graph.skills[id] !== undefined && onTrack(input.state, id),
    );
    return { skillId: r ?? s, misconceptionId: m };
  }
  return undefined;
}

/** Rule 4: the confidence item (P(ref) ≥ warmupMinP when possible, hosted by the request's workshop). */
function confidenceTask(
  input: AdaptInput,
  model: ReturnType<typeof createEloFireModel>,
): PlannedTask {
  const { state, graph, request } = input;
  const formats = requestFormats(input);
  const candidates = new Set<SkillId>();
  for (const s of Object.keys(state.skills)) {
    if (graph.skills[s] && onTrack(state, s)) candidates.add(s);
  }
  for (const t of request.tasks) if (graph.skills[t.skillId]) candidates.add(t.skillId);
  // Highest P(ref) first, so a skill at P ≥ warmupMinP wins whenever one has a hostable template.
  const ranked = [...candidates]
    .map((s) => ({ s, p: model.pRef(state, s) }))
    .sort((a, b) => b.p - a.p || cmp(a.s, b.s));
  let pick: { skillId: SkillId; templateId: string } | undefined;
  for (const { s } of ranked) {
    const t = rankedTemplates(graph, s, formats).find((x) => formats.has(x.format));
    if (t) {
      pick = { skillId: s, templateId: t.id };
      break;
    }
  }
  if (!pick) {
    // Fallback: the easiest task presented so far (highest P(ref), then lowest template base).
    const presented = [...new Set(input.doneTaskIds)]
      .sort((a, b) => a - b)
      .map((i) => request.tasks[i])
      .filter(
        (t): t is PlannedTask => t !== undefined && graph.templates[t.templateId] !== undefined,
      );
    const easiest = presented
      .map((t, i) => ({
        t,
        i,
        p: model.pRef(state, t.skillId),
        d: graph.templates[t.templateId]?.difficulty.base ?? 0,
      }))
      .sort((a, b) => b.p - a.p || a.d - b.d || a.i - b.i)[0]?.t;
    const t = easiest ?? input.last.task;
    pick = { skillId: t.skillId, templateId: t.templateId };
  }
  return {
    skillId: pick.skillId,
    templateId: pick.templateId,
    seed: confidenceSeed(request.id),
    context: 'warmup',
    mode: 'item',
  };
}

/** The request skill whose inserted probe the current task is, if it is one. */
function probeParent(input: AdaptInput): SkillId | undefined {
  const { task } = input.last;
  const parents = [...new Set(input.request.tasks.map((t) => t.skillId))].sort(cmp);
  return parents.find(
    (parent) =>
      (input.graph.prereqs[parent] ?? []).includes(task.skillId) &&
      task.seed === probeSeed(input.request.id, parent, task.skillId),
  );
}

/**
 * Rule 6 (04 §6.4 rule 3): a probe for the weakest prerequisite of `s`, if one is due. AdaptInput
 * carries no workshop capability, so the probe uses only a template whose format the request
 * already uses (its workshop hosts every one of them); a prerequisite without one is skipped, and
 * with none at all there is no probe.
 */
function prerequisiteProbe(
  input: AdaptInput,
  s: SkillId,
  tries: RatedAttempt[],
  model: ReturnType<typeof createEloFireModel>,
  P: EngineParams,
): PlannedTask | undefined {
  const { state, graph, request } = input;
  if (tries.filter((r) => !r.correct).length < P.adapt.probeWrongs) return undefined;
  const prereqs = (graph.prereqs[s] ?? []).filter((p) => graph.skills[p] !== undefined);
  if (prereqs.length === 0) return undefined;
  const already = request.tasks.some((t) =>
    prereqs.some((p) => t.skillId === p && t.seed === probeSeed(request.id, s, p)),
  );
  if (already) return undefined;
  const formats = requestFormats(input);
  const hosted = (p: SkillId): ItemTemplate | undefined =>
    rankedTemplates(graph, p, formats).find((t) => formats.has(t.format));
  const weakest = prereqs
    .map((p) => ({ p, o: model.skillOffset(state, p), t: hosted(p) }))
    .sort((a, b) => a.o - b.o || cmp(a.p, b.p))
    .find((x) => x.t !== undefined);
  if (weakest === undefined) return undefined;
  const t = weakest.t as ItemTemplate;
  return {
    skillId: weakest.p,
    templateId: t.id,
    seed: probeSeed(request.id, s, weakest.p),
    context: onTrack(state, weakest.p) ? 'review' : 'practice',
    mode: 'item',
  };
}

/**
 * Rule 2's hint rung (03 §5.8): the next rung among levels 2–4 that the current template generates
 * (level 2 iff it lists a first hint key, 3 iff a second, 4 iff a third), past the `hintsUsed`
 * rungs already climbed and capped at the last one; level 1 (replay) when it has none.
 */
function retryHintLevel(input: AdaptInput): 1 | 2 | 3 | 4 {
  const keys = input.graph.templates[input.last.task.templateId]?.narration.hints ?? [];
  const available = ([2, 3, 4] as const).filter((_, i) => Boolean(keys[i]));
  if (available.length === 0) return 1;
  const k = Math.min(Math.max(0, input.last.hintsUsed), available.length - 1);
  return available[k] as 2 | 3 | 4;
}

/** 04 §6.4: the next step inside a request. Pure and deterministic. */
export function adaptNext(input: AdaptInput, params: EngineParams = PARAMS): AdaptDecision {
  const P = params;
  const { last, signals, request, graph } = input;
  const queued = remediation(input, P);
  const decide = (d: AdaptDecision): AdaptDecision =>
    queued ? { ...d, queueRemediation: queued } : d;

  // 2. The item is not resolved yet: the hint ladder, then the worked solution.
  if (last.task.mode === 'item' && !last.result.correct) {
    if (last.attemptNo <= 1) {
      return decide({ action: 'retry', hintLevel: retryHintLevel(input) });
    }
    if (last.attemptNo === 2) return decide({ action: 'show-solution' });
  }

  // 3. Wind-down: the current item is finished, so end the request.
  if (input.elapsedMs >= input.budgetMs)
    return decide({ action: 'end-request', reason: 'wind-down' });

  // 4. A failed prerequisite probe ends the skill's slot, ahead of frustration so its outcome is
  // never replaced by a confidence item. AdaptDecision cannot drop tasks, so the request ends
  // gently; the next plan schedules the prerequisite (the failed first try lowers its rating, a
  // failed review makes it due again at once).
  const isProbe = probeParent(input) !== undefined;
  if (isProbe && !(last.result.correct && last.attemptNo === 1)) {
    return decide({ action: 'end-request', reason: 'complete' });
  }

  const model = createEloFireModel(graph, {
    childId: input.child.childId,
    isK: input.child.isK,
    params: P,
  });

  // 5. Frustration.
  const frustrated =
    signals.wrongInLast4 >= P.adapt.frustrationWrongInLast4 ||
    signals.rapidWrongTaps >= P.adapt.frustrationRapidTaps ||
    signals.longIdles >= P.adapt.frustrationIdles;
  const cSeed = confidenceSeed(request.id);
  const onConfidence = last.task.seed === cSeed;
  if (frustrated && !onConfidence) {
    const at = request.tasks.findIndex((t) => t.seed === cSeed);
    if (at >= 0) {
      if (input.doneTaskIds.includes(at)) {
        return decide({ action: 'end-request', reason: 'frustration' });
      }
      return decide({ action: 'continue' });
    }
    return decide({
      action: 'confidence-then-offer-break',
      insert: [confidenceTask(input, model)],
    });
  }

  // 6. Every task presented.
  const done = new Set(input.doneTaskIds);
  if (request.tasks.every((_, i) => done.has(i))) {
    return decide({ action: 'end-request', reason: 'complete' });
  }

  // 7–8 read the current task's first try, so they run only when it entered `recent` (otherwise
  // the window is the one already judged at the previous item, and the tier would step twice).
  const s = last.task.skillId;
  if (!entersRecent(last.task, graph)) return decide({ action: 'continue' });
  const tries = requestFirstTries(input, s);

  // 7. Three first-try wrongs: probe the weakest prerequisite (once per skill and request).
  const probe = isProbe ? undefined : prerequisiteProbe(input, s, tries, model, P);
  const insert = probe ? [probe] : undefined;

  // 8. Tier step-down: the last two first tries on s are wrong at the same tier, so one step below
  // it. After a step, two more wrongs at the new tier are needed for the next one.
  let tierOverrides: Partial<Record<SkillId, Tier>> | undefined;
  const n = P.adapt.tierStepWrongs;
  const lastN = tries.slice(-n);
  const tier = lastN[lastN.length - 1]?.tier;
  if (
    n > 0 &&
    tier !== undefined &&
    lastN.length === n &&
    lastN.every((r) => !r.correct && r.tier === tier)
  ) {
    const next = stepDownTier(tier);
    const current = input.tierOverrides[s];
    const lower = TIER_ORDER[next] < TIER_ORDER[current ?? tier];
    if (next !== tier && lower) tierOverrides = { ...input.tierOverrides, [s]: next };
  }

  // 9. Continue.
  return decide({
    action: 'continue',
    ...(tierOverrides ? { tierOverrides } : {}),
    ...(insert ? { insert } : {}),
  });
}
