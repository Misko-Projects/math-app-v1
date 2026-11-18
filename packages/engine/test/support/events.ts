// Test support: synthetic family event logs over the compiled fixture content, for the fold
// property tests and the golden replay. Deterministic given the seed.

import type {
  AnyEventEnvelope,
  AttemptPayload,
  EventEnvelope,
  EventPayloads,
  EventType,
  SkillGraph,
} from '@number-island/shared';
import { FORMAT_DEFAULT_REPRESENTATION } from '@number-island/shared';
import { generateItem } from '../../src/items/generate';
import { createRng, type Rng } from '../../src/rng';

export const FAMILY = '019a0000-0000-7000-8000-00000000f001';
export const CHILD_1 = '019a0000-0000-7000-8000-00000000c001';
export const CHILD_2 = '019a0000-0000-7000-8000-00000000c002';
export const DEVICE = '019a0000-0000-7000-8000-00000000d001';

/** A time-ordered-looking UUIDv7-shaped id from a counter (unique per counter value). */
export function eventId(n: number): string {
  const hex = n.toString(16).padStart(12, '0');
  return `019a0000-0000-7000-8000-${hex}`;
}

export function envelope<T extends EventType>(
  n: number,
  type: T,
  payload: EventPayloads[T],
  ts: number,
  childId: string | null,
  contentVersion = 'fixture',
): EventEnvelope<T> {
  return {
    id: eventId(n),
    familyId: FAMILY,
    childId,
    deviceId: DEVICE,
    ts,
    type,
    v: 1,
    payload,
    contentVersion,
  };
}

/** A ready-made attempt for a fixture template, with real generated params. */
export function attemptFor(
  graph: SkillGraph,
  templateId: string,
  seed: number,
  over: Partial<AttemptPayload> = {},
): AttemptPayload {
  const t = graph.templates[templateId];
  if (!t) throw new Error(`no template ${templateId}`);
  const item = generateItem(t, seed);
  const correct = over.correct ?? true;
  const hintsUsed = over.hintsUsed ?? 0;
  return {
    sessionId: 's1',
    skillId: t.skillId,
    templateId,
    seed,
    params: item.params,
    format: t.format,
    tier: t.tier,
    representation: t.representation ?? FORMAT_DEFAULT_REPRESENTATION[t.format],
    response: { kind: 'number', value: 0 },
    correct,
    partialCredit: correct ? (hintsUsed > 0 ? 0.5 : 1) : 0,
    latencyMs: 4_000,
    hintsUsed,
    attemptNo: 1,
    misconceptionIds: [],
    context: 'practice',
    workshopId: null,
    ...over,
  };
}

const CONTEXTS: AttemptPayload['context'][] = [
  'practice',
  'practice',
  'practice',
  'review',
  'review',
  'warmup',
  'lesson',
  'challenge',
  'transfer-probe',
  'placement',
];

/**
 * A random learner-relevant event for one child: mostly attempts, plus sessions, placements,
 * overrides, unknown types and events of the other child (which the fold must ignore).
 */
export function randomLearnerEvent(
  graph: SkillGraph,
  rng: Rng,
  n: number,
  ts: number,
  childId = CHILD_1,
): AnyEventEnvelope {
  const skills = graph.nodes;
  const roll = rng.int(0, 99);
  const skillId = rng.pick(skills);
  if (roll < 70) {
    const templates = graph.skills[skillId]?.templates ?? [];
    const templateId = rng.pick(templates);
    const correct = rng.bool(0.75);
    const a = attemptFor(graph, templateId, rng.int(1, 50), {
      sessionId: `s${rng.int(1, 6)}`,
      correct,
      hintsUsed: correct && rng.bool(0.15) ? 1 : 0,
      latencyMs: rng.int(800, 30_000),
      attemptNo: rng.bool(0.85) ? 1 : 2,
      context: rng.pick(CONTEXTS),
      misconceptionIds: !correct && rng.bool(0.3) ? ['MC.off-by-one-counting'] : [],
      ...(rng.bool(0.05)
        ? { response: { kind: 'skip' as const }, correct: false, partialCredit: 0 }
        : {}),
    });
    return envelope(n, 'attempt', a, ts, rng.bool(0.1) ? CHILD_2 : childId);
  }
  if (roll < 78) {
    return envelope(
      n,
      'session.started',
      { sessionId: `s${rng.int(1, 6)}`, budgetMinutes: 10, trigger: 'child' },
      ts,
      childId,
    );
  }
  if (roll < 84) {
    const picked = [...new Set([rng.pick(skills), rng.pick(skills)])].sort();
    const posterior: Record<string, number> = {};
    for (const s of picked) posterior[s] = Math.round(rng.float() * 100) / 100;
    return envelope(
      n,
      'placement.completed',
      {
        placementId: `p${rng.int(1, 3)}`,
        strand: rng.bool(0.5) ? null : (graph.skills[picked[0] as string]?.strand ?? null),
        posterior,
        assumed: picked.filter((s) => (posterior[s] as number) >= 0.85 || rng.bool(0.3)),
        items: 6,
        reason: 'converged',
      },
      ts,
      childId,
    );
  }
  if (roll < 88) {
    return envelope(
      n,
      'placement.probe',
      {
        placementId: `p${rng.int(1, 3)}`,
        strand: null,
        skillId,
        templateId: rng.pick(graph.skills[skillId]?.templates ?? []),
        seed: 1,
        correct: rng.bool(0.5),
        skipped: false,
        latencyMs: 3_000,
        posterior: 0.5,
      },
      ts,
      childId,
    );
  }
  if (roll < 92) {
    return envelope(
      n,
      'skill.override',
      { skillId, to: rng.bool(0.5) ? 'mastered' : 'reset' },
      ts,
      childId,
    );
  }
  if (roll < 96) {
    return {
      id: eventId(n),
      familyId: FAMILY,
      childId,
      deviceId: DEVICE,
      ts,
      type: 'future.thing',
      v: 1,
      payload: { anything: true },
      contentVersion: 'fixture',
    };
  }
  return envelope(
    n,
    'hint.used',
    { sessionId: 's1', skillId, templateId: `${skillId}.t1`, seed: 1, level: 2 },
    ts,
    childId,
  );
}

/** A seeded random event log; `ts` is spread over `days` days from `t0` with collisions allowed. */
export function randomLearnerLog(
  graph: SkillGraph,
  seed: number,
  count: number,
  t0: number,
  days: number,
): AnyEventEnvelope[] {
  const rng = createRng(seed);
  const out: AnyEventEnvelope[] = [];
  for (let i = 0; i < count; i++) {
    const ts = t0 + rng.int(0, days * 24) * 3_600_000;
    out.push(randomLearnerEvent(graph, rng, seed * 100_000 + i, ts));
  }
  return out;
}
