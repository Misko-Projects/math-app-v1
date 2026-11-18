// 04 §8 / 02 §4.3 fold properties for the learner projection over the compiled fixture graph:
// order independence, incremental = full fold, and state invariants.

import { type AnyEventEnvelope, learnerStateSchema } from '@number-island/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sortEvents } from '../src/folds/order';
import {
  applyLearnerEvent,
  foldLearnerState,
  foldSkillStates,
  learnerModelFor,
} from '../src/learner/fold';
import { PARAMS } from '../src/params';
import { createRng } from '../src/rng';
import { fixtureGraph, loadFixture } from './fixture';
import { CHILD_1, CHILD_2, randomLearnerEvent } from './support/events';

loadFixture();
const graph = fixtureGraph();
const T0 = Date.UTC(2026, 10, 2, 16);
const opts = { childId: CHILD_1 };

/** An arbitrary event log: a seed and a size, expanded deterministically (fast-check shrinks both). */
const logArb = fc
  .record({
    seed: fc.integer({ min: 1, max: 1_000_000 }),
    size: fc.integer({ min: 0, max: 80 }),
    days: fc.integer({ min: 1, max: 40 }),
  })
  .map(({ seed, size, days }) => {
    const rng = createRng(seed);
    const events: AnyEventEnvelope[] = [];
    for (let i = 0; i < size; i++) {
      // Coarse timestamps so equal `ts` (ordered by id) happen often.
      const ts = T0 + rng.int(0, days * 6) * 4 * 3_600_000;
      events.push(randomLearnerEvent(graph, rng, seed * 1_000 + i, ts));
    }
    return events;
  });

const shuffle = <T>(xs: readonly T[], seed: number): T[] => createRng(seed).shuffle(xs);

describe('foldSkillStates properties (fixture graph)', () => {
  it('is order-independent for the same event set', () => {
    fc.assert(
      fc.property(logArb, fc.integer(), (events, seed) => {
        const a = foldLearnerState(events, graph, opts);
        const b = foldLearnerState(shuffle(events, seed), graph, opts);
        expect(b).toEqual(a);
      }),
      { numRuns: 150 },
    );
  });

  it('applyLearnerEvent incrementally equals the full fold', () => {
    fc.assert(
      fc.property(logArb, (events) => {
        const model = learnerModelFor(graph, opts);
        let state = model.init(graph, null);
        for (const e of sortEvents(events)) state = applyLearnerEvent(model, state, e);
        expect(state).toEqual(foldLearnerState(events, graph, opts));
      }),
      { numRuns: 150 },
    );
  });

  it('a prefix fold continued with the rest equals the full fold', () => {
    fc.assert(
      fc.property(logArb, fc.nat(), (events, cut) => {
        const sorted = sortEvents(events);
        const k = sorted.length === 0 ? 0 : cut % (sorted.length + 1);
        const model = learnerModelFor(graph, opts);
        let state = foldLearnerState(sorted.slice(0, k), graph, opts);
        for (const e of sorted.slice(k)) state = applyLearnerEvent(model, state, e);
        expect(state).toEqual(foldLearnerState(events, graph, opts));
      }),
      { numRuns: 100 },
    );
  });

  it('duplicate deliveries of an event change nothing', () => {
    fc.assert(
      fc.property(logArb, (events) => {
        const doubled = [...events, ...events.slice(0, Math.ceil(events.length / 2))];
        expect(foldLearnerState(doubled, graph, opts)).toEqual(
          foldLearnerState(events, graph, opts),
        );
      }),
      { numRuns: 60 },
    );
  });

  it('other children, unknown types and non-learner events are ignored', () => {
    fc.assert(
      fc.property(logArb, (events) => {
        const relevant = events.filter(
          (e) =>
            e.childId === CHILD_1 &&
            [
              'attempt',
              'placement.completed',
              'placement.probe',
              'skill.override',
              'session.started',
            ].includes(e.type),
        );
        expect(foldLearnerState(events, graph, opts)).toEqual(
          foldLearnerState(relevant, graph, opts),
        );
      }),
      { numRuns: 60 },
    );
  });

  it('keeps the state inside its contract and bounds', () => {
    fc.assert(
      fc.property(logArb, (events) => {
        const state = foldLearnerState(events, graph, opts);
        const parsed = learnerStateSchema.safeParse(state);
        expect(parsed.error?.issues ?? []).toEqual([]);
        expect(state.successOffset).toBeGreaterThanOrEqual(PARAMS.controller.floor);
        expect(state.successOffset).toBeLessThanOrEqual(PARAMS.controller.cap);
        const model = learnerModelFor(graph, opts);
        for (const [id, st] of Object.entries(state.skills)) {
          expect(st.recent.length).toBeLessThanOrEqual(PARAMS.mastery.recentSize);
          expect(Number.isFinite(st.theta)).toBe(true);
          if (st.memory) expect(st.memory.intervalDays).toBeGreaterThanOrEqual(1);
          if (st.masteredAt !== null) expect(st.practicedAt).not.toBeNull();
          if (st.memory === null) expect(st.masteredAt).toBeNull();
          const status = model.status(state, id, T0 + 60 * 86_400_000);
          if (st.practicedAt !== null || st.assumed)
            expect(status).not.toMatch(/locked|ready|learning/);
        }
        for (const s of model.frontier(state)) {
          expect(['ready', 'learning']).toContain(model.status(state, s, T0));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('foldSkillStates returns the per-skill map of the fold', () => {
    const rng = createRng(3);
    const events = Array.from({ length: 50 }, (_, i) =>
      randomLearnerEvent(graph, rng, i, T0 + i * 60_000),
    );
    const map = foldSkillStates(events, graph, T0, opts);
    expect(Object.fromEntries(map)).toEqual(foldLearnerState(events, graph, opts).skills);
    expect(foldSkillStates([], graph, T0).size).toBe(0);
    expect(() => foldSkillStates(events, graph, T0)).toThrow(/childId/);
    expect(events.some((e) => e.childId === CHILD_2)).toBe(true);
  });

  it('a child.deleted tombstone for the child resets its learner state', () => {
    const rng = createRng(5);
    const events = Array.from({ length: 30 }, (_, i) =>
      randomLearnerEvent(graph, rng, i, T0 + i * 60_000),
    );
    const tomb: AnyEventEnvelope = {
      ...(events[0] as AnyEventEnvelope),
      id: '019a0000-0000-7000-8000-ffffffffffff',
      childId: null,
      ts: T0 + 10 * 86_400_000,
      type: 'child.deleted',
      payload: { childId: CHILD_1 },
    } as AnyEventEnvelope;
    const model = learnerModelFor(graph, opts);
    expect(foldLearnerState([...events, tomb], graph, opts)).toEqual(model.init(graph, null));
  });
});
