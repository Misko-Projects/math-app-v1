// Test support: the recorder behind the golden replay fixture (04 §8). A deterministic six-week
// simulation of two siblings (a K child and a G2 child) on one island: placement, sessions,
// lessons, practice and spaced reviews chosen from the learner model itself, retries with hints,
// requests that produce materials, building, decor, residents, festivals, gifts, milestones,
// weekly goals, a parent override and mastery badges. Children answer with a hidden ability that
// grows with practice (guess and slip 5%). Only `UPDATE_GOLDEN=1` re-records the log; the test
// itself replays the committed log, so a fold change shows up as a snapshot diff.

import type {
  AnyEventEnvelope,
  AttemptPayload,
  EventPayloads,
  EventType,
  GameData,
  LearnerState,
  Recipe,
  SkillGraph,
} from '@number-island/shared';
import { foldInventory } from '../../src/folds/inventory';
import { createEloFireModel, type EloFireModel } from '../../src/learner/elo-fire';
import { applyLearnerEvent } from '../../src/learner/fold';
import { sigmoid } from '../../src/learner/math';
import { reviewContext } from '../../src/learner/review';
import { DAY_MS } from '../../src/params';
import { createRng, type Rng } from '../../src/rng';
import { attemptFor, CHILD_1, CHILD_2, DEVICE, eventId, FAMILY } from './events';

export const REPLAY_T0 = Date.UTC(2026, 10, 2, 15); // Monday 2026-11-02
export const REPLAY_DAYS = 42;

interface Kid {
  id: string;
  isK: boolean;
  ability: number;
  hour: number;
  model: EloFireModel;
  state: LearnerState;
  practice: Record<string, number>;
  introduced: Set<string>;
}

const weekStart = (ts: number) => {
  const d = new Date(ts);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back))
    .toISOString()
    .slice(0, 10);
};

export function recordReplayLog(graph: SkillGraph, game: GameData): AnyEventEnvelope[] {
  const rng = createRng(20261102);
  const events: AnyEventEnvelope[] = [];
  let n = 0;
  const kids: Kid[] = [
    { id: CHILD_1, isK: true, ability: -0.2, hour: 0 },
    { id: CHILD_2, isK: false, ability: 1.6, hour: 2 },
  ].map((k) => {
    const model = createEloFireModel(graph, { childId: k.id, isK: k.isK });
    return {
      ...k,
      model,
      state: model.init(graph, null),
      practice: {},
      introduced: new Set<string>(),
    };
  });

  const emit = <T extends EventType>(
    type: T,
    payload: EventPayloads[T],
    ts: number,
    childId: string | null,
  ) => {
    n += 1;
    const e = {
      id: eventId(n),
      familyId: FAMILY,
      childId,
      deviceId: DEVICE,
      ts,
      type,
      v: 1,
      payload,
      contentVersion: graph.contentVersion,
    } as AnyEventEnvelope;
    events.push(e);
    for (const k of kids) {
      const before = k.state;
      k.state = applyLearnerEvent(k.model, k.state, e);
      // Mastery moments become badges (05 §7): the app emits them when it sees `mastered`.
      if (childId === k.id && type === 'attempt') {
        const s = (payload as AttemptPayload).skillId;
        if (before.skills[s]?.masteredAt == null && k.state.skills[s]?.masteredAt != null) {
          n += 1;
          events.push({
            id: eventId(n),
            familyId: FAMILY,
            childId,
            deviceId: DEVICE,
            ts: ts + 1,
            type: 'collection.unlocked',
            v: 1,
            payload: { kind: 'badge', id: s },
            contentVersion: graph.contentVersion,
          } as AnyEventEnvelope);
        }
      }
    }
    return e;
  };

  const inventory = () => foldInventory(events).materials;
  const canAfford = (r: Recipe) =>
    Object.entries(r).every(([m, c]) => (inventory()[m] ?? 0) >= (c ?? 0));
  const built = new Set<string>();
  let instance = 0;
  let decorInstance = 0;
  let roadLength = 0;
  let playDays = 0;
  const products = ['stone', 'light', 'plank'];

  // ---------- day 0: onboarding and placement ----------
  const t0 = REPLAY_T0;
  emit('island.named', { name: 'Pebble Point' }, t0, CHILD_1);
  emit(
    'resident.arrived',
    { residentId: 'nib', homeInstanceId: null, via: 'start' },
    t0 + 1_000,
    CHILD_1,
  );
  for (const b of ['storehouse', 'road-crew', 'lantern-grove']) {
    instance += 1;
    emit(
      'building.placed',
      { instanceId: `b${instance}`, buildingId: b, plot: [3 + instance, 3] },
      t0 + 2_000 + instance,
      null,
    );
    built.add(b);
  }
  emit(
    'milestone.defined',
    {
      milestoneId: 'm-lighthouse',
      label: 'Pancake breakfast',
      trigger: { building: 'lighthouse' },
    },
    t0 + 5_000,
    null,
  );
  for (const k of kids) {
    const pid = `placement-${k.id.slice(-4)}`;
    let ts = t0 + (k.hour + 1) * 3_600_000;
    const posterior: Record<string, number> = {};
    for (const s of graph.nodes) {
      const sk = graph.skills[s];
      const depth = graph.depth[s] ?? 0;
      const p = sigmoid(k.ability + 1.5 - 0.7 * depth - (sk?.grade === '1' ? 1 : 0));
      posterior[s] = Math.round(p * 100) / 100;
    }
    for (const s of graph.nodes.slice(0, 6)) {
      const templateId = graph.skills[s]?.templates.at(-1) as string;
      const correct = rng.bool(posterior[s] as number);
      ts += 20_000;
      const a = attemptFor(graph, templateId, rng.int(1, 999), {
        sessionId: `${pid}-s`,
        correct,
        latencyMs: rng.int(2_000, 12_000),
        context: 'placement',
      });
      emit('attempt', a, ts, k.id);
      emit(
        'placement.probe',
        {
          placementId: pid,
          strand: null,
          skillId: s,
          templateId,
          seed: a.seed,
          correct,
          skipped: false,
          latencyMs: a.latencyMs,
          posterior: posterior[s] as number,
        },
        ts + 1,
        k.id,
      );
    }
    const assumed = Object.keys(posterior)
      .filter((s) => (posterior[s] as number) >= 0.85)
      .sort();
    emit(
      'placement.completed',
      { placementId: pid, strand: null, posterior, assumed, items: 6, reason: 'converged' },
      ts + 10_000,
      k.id,
    );
  }

  // ---------- days 1..42 ----------
  for (let day = 1; day <= REPLAY_DAYS; day++) {
    let playedToday = false;
    for (const k of kids) {
      if (!rng.bool(k.isK ? 0.7 : 0.8)) continue;
      playedToday = true;
      const sessionId = `${k.id.slice(-4)}-d${day}`;
      let ts = REPLAY_T0 + day * DAY_MS + (k.hour + rng.int(0, 3)) * 3_600_000;
      emit(
        'session.started',
        { sessionId, budgetMinutes: k.isK ? 10 : 15, trigger: rng.bool(0.8) ? 'child' : 'parent' },
        ts,
        k.id,
      );
      const sessionStart = ts;
      const requests = rng.int(2, 3);
      let items = 0;
      for (let r = 0; r < requests; r++) {
        const requestId = `${sessionId}-r${r}`;
        const workshopId = rng.pick([
          'road-crew',
          'lantern-grove',
          ...(built.has('ten-boat-dock') ? ['ten-boat-dock'] : []),
        ]);
        ts += 15_000;
        emit(
          'request.accepted',
          { sessionId, requestId, residentId: 'nib', workshopId, taskCount: 6 },
          ts,
          k.id,
        );
        let firstTry = 0;
        for (let i = 0; i < 6; i++) {
          ts += rng.int(12_000, 40_000);
          const due = k.model.dueReviews(k.state, ts);
          const frontier = k.model.frontier(k.state);
          const fromReview = due.length > 0 && (frontier.length === 0 || rng.bool(0.35));
          const skillId = fromReview
            ? (due[0]?.skillId as string)
            : rng.pick(frontier.length > 0 ? frontier : graph.nodes);
          const context: AttemptPayload['context'] = fromReview
            ? reviewContext(k.model.status(k.state, skillId, ts), rng)
            : rng.bool(0.1)
              ? 'challenge'
              : 'practice';
          const skill = graph.skills[skillId];
          if (!skill) continue;
          if (!k.introduced.has(skillId) && !fromReview) {
            k.introduced.add(skillId);
            for (let step = 0; step < 2; step++) {
              ts += 8_000;
              emit(
                'lesson.step',
                {
                  sessionId,
                  skillId,
                  templateId: skill.lesson.templateId,
                  phase: step === 0 ? 'worked' : 'faded',
                  example: 1,
                  step,
                  actor: step === 0 ? 'demo' : 'child',
                  outcome: 'done',
                },
                ts,
                k.id,
              );
              const lessonAttempt = attemptFor(graph, skill.lesson.templateId, rng.int(1, 999), {
                sessionId,
                context: 'lesson',
                latencyMs: rng.int(3_000, 15_000),
                correct: rng.bool(0.8),
              });
              emit('attempt', lessonAttempt, ts + 1, k.id);
            }
          }
          const templateId =
            context === 'transfer-probe'
              ? (skill.templates.find((t) => graph.templates[t]?.tier === 'abstract') ??
                (skill.templates.at(-1) as string))
              : rng.pick(skill.templates);
          const seed = rng.int(1, 5_000);
          const probe = attemptFor(graph, templateId, seed);
          const d = graph.templates[templateId]?.difficulty.base ?? 0;
          const practiced = k.practice[skillId] ?? 0;
          const ability =
            k.ability - 0.35 * (graph.depth[skillId] ?? 0) + Math.min(2.5, 0.18 * practiced);
          const pCorrect = 0.05 + 0.9 * sigmoid(ability - d);
          const correct = rng.bool(pCorrect);
          k.practice[skillId] = practiced + 1;
          const latencyMs = Math.round(
            (correct ? 3_000 : 6_000) * (0.5 + rng.float() * 2) * (k.isK ? 1.4 : 1),
          );
          const misconceptionIds =
            !correct && rng.bool(0.25) ? (skill.misconceptions.slice(0, 1) as string[]) : [];
          const response =
            !correct && rng.bool(0.04)
              ? ({ kind: 'skip' } as const)
              : ({ kind: 'number', value: 0 } as const);
          emit(
            'attempt',
            {
              ...probe,
              sessionId,
              correct: correct && response.kind !== 'skip',
              partialCredit: correct && response.kind !== 'skip' ? 1 : 0,
              latencyMs,
              context,
              misconceptionIds,
              response,
              workshopId,
            },
            ts,
            k.id,
          );
          if (correct && response.kind !== 'skip') {
            firstTry += 1;
          } else {
            ts += 5_000;
            emit('hint.used', { sessionId, skillId, templateId, seed, level: 2 }, ts, k.id);
            const second = rng.bool(0.7);
            ts += rng.int(4_000, 15_000);
            emit(
              'attempt',
              {
                ...probe,
                sessionId,
                correct: second,
                partialCredit: second ? 0.5 : 0,
                latencyMs: rng.int(3_000, 15_000),
                hintsUsed: 1,
                attemptNo: 2,
                context,
                misconceptionIds: [],
                workshopId,
              },
              ts,
              k.id,
            );
            if (!second)
              emit(
                'hint.used',
                { sessionId, skillId, templateId, seed, level: 5 },
                ts + 2_000,
                k.id,
              );
          }
          items += 1;
        }
        ts += 10_000;
        emit(
          'request.completed',
          {
            sessionId,
            requestId,
            workshopId,
            items: 6,
            firstTryCorrect: firstTry,
            endedEarly: false,
          },
          ts,
          k.id,
        );
        const product =
          workshopId === 'road-crew' ? 'stone' : workshopId === 'lantern-grove' ? 'light' : 'plank';
        emit(
          'material.produced',
          {
            sessionId,
            requestId,
            workshopId,
            materials: { [product]: 6, [rng.pick(products)]: 1 },
          },
          ts + 1,
          k.id,
        );
        emit('goal.progress', { weekStart: weekStart(ts), delta: 1, requestId }, ts + 2, k.id);
        if (workshopId === 'road-crew' && roadLength < 40) {
          roadLength = Math.min(40, roadLength + 4);
          emit('road.extended', { to: roadLength }, ts + 3, k.id);
        }
      }
      ts += 20_000;
      const activeMs = ts - sessionStart;
      emit(
        'session.ended',
        {
          sessionId,
          reason: rng.bool(0.85) ? 'wind-down' : rng.pick(['child-exit', 'abandoned'] as const),
          activeMs,
          mathMs: Math.round(activeMs * (0.7 + rng.float() * 0.2)),
          items,
        },
        ts,
        k.id,
      );

      // Building after the session (05 §6), when the Storehouse has enough.
      const tryBuild = (buildingId: string, residentId?: string) => {
        const def = game.buildings.find((b) => b.id === buildingId);
        const recipe = def?.levels[0]?.recipe ?? {};
        if (built.has(buildingId) || !canAfford(recipe)) return;
        instance += 1;
        ts += 5_000;
        emit(
          'material.spent',
          { materials: recipe, purpose: { kind: 'build', ref: buildingId } },
          ts,
          k.id,
        );
        emit(
          'building.placed',
          {
            instanceId: `b${instance}`,
            buildingId,
            plot: [2 + (instance % 8), 2 + (instance % 4)],
          },
          ts + 1,
          k.id,
        );
        built.add(buildingId);
        if (residentId)
          emit(
            'resident.arrived',
            { residentId, homeInstanceId: `b${instance}`, via: 'home' },
            ts + 2,
            k.id,
          );
      };
      tryBuild('shell-cottage', 'tuck');
      if (built.has('shell-cottage')) tryBuild('ten-boat-dock');
      if (built.has('ten-boat-dock') && !built.has('marlo')) {
        built.add('marlo');
        emit(
          'resident.arrived',
          { residentId: 'marlo', homeInstanceId: null, via: 'ferry' },
          ts + 3,
          null,
        );
      }
      if (built.has('ten-boat-dock') && !built.has('road-crew-2') && canAfford({ stone: 10 })) {
        built.add('road-crew-2');
        ts += 5_000;
        emit(
          'material.spent',
          { materials: { stone: 10 }, purpose: { kind: 'upgrade', ref: 'b2' } },
          ts,
          k.id,
        );
        emit('building.upgraded', { instanceId: 'b2', level: 2 }, ts + 1, k.id);
      }
      if (built.has('ten-boat-dock') && !built.has('lighthouse')) {
        const give: Recipe = {};
        for (const m of products) if ((inventory()[m] ?? 0) >= 3) give[m] = 3;
        if (Object.keys(give).length > 0)
          emit(
            'material.spent',
            { materials: give, purpose: { kind: 'project', ref: 'lighthouse' } },
            ts + 4,
            k.id,
          );
      }
      if (rng.bool(0.15)) {
        decorInstance += 1;
        emit(
          'decor.placed',
          {
            instanceId: `d${decorInstance}`,
            decorId: 'shell-bench',
            pos: [rng.int(0, 11), rng.int(0, 7)],
          },
          ts + 5,
          k.id,
        );
      }
      if (decorInstance > 0 && rng.bool(0.1))
        emit(
          'decor.moved',
          { instanceId: `d${rng.int(1, decorInstance)}`, pos: [rng.int(0, 11), rng.int(0, 7)] },
          ts + 6,
          k.id,
        );
      if (decorInstance > 1 && rng.bool(0.05))
        emit('decor.removed', { instanceId: `d${rng.int(1, decorInstance)}` }, ts + 7, k.id);
    }
    if (playedToday) playDays += 1;
    const evening = REPLAY_T0 + day * DAY_MS + 10 * 3_600_000;
    if (playedToday && playDays % 7 === 0) {
      emit(
        'festival.started',
        { festivalId: 'lantern-night', kind: rng.bool(0.5) ? 'festival' : 'storm-watch' },
        evening,
        null,
      );
      emit(
        'festival.completed',
        { festivalId: 'lantern-night', rewardDecor: ['lantern-string'] },
        evening + 600_000,
        null,
      );
    }
    if (day === 5) emit('skill.override', { skillId: 'CNT.04', to: 'mastered' }, evening, CHILD_2);
    if (day === 10)
      emit(
        'gift.left',
        {
          giftId: 'gift-1',
          toChildId: CHILD_1,
          decorId: 'shell-bench',
          message: 'Great counting!',
        },
        evening,
        null,
      );
    if (day === 12) emit('gift.opened', { giftId: 'gift-1' }, evening, CHILD_1);
    if (day === 20) emit('skill.override', { skillId: 'CNT.02', to: 'reset' }, evening, CHILD_1);
    if (day === 28 && !built.has('lighthouse')) {
      built.add('lighthouse');
      instance += 1;
      emit(
        'building.placed',
        { instanceId: `b${instance}`, buildingId: 'lighthouse', plot: [6, 1] },
        evening + 1,
        null,
      );
      emit('milestone.reached', { milestoneId: 'm-lighthouse' }, evening + 2, null);
    }
  }
  return events;
}

/** Rounds non-integers to 12 significant digits and sorts keys, so the golden file is stable. */
export function stableJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_k, v: unknown) => {
      if (typeof v === 'number' && !Number.isInteger(v)) return Number(v.toPrecision(12));
      if (v instanceof Map) return Object.fromEntries(v);
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        );
      }
      return v;
    },
    1,
  );
}

export type { Rng };
