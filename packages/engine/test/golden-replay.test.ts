/// <reference types="node" />
// 04 §8 replay test: a recorded fixture log (≥ 2,000 synthetic events, two siblings over six
// weeks) replays to an identical snapshot of every projection, the learner statuses and due
// reviews, and the dashboard signals. Re-record both files with `UPDATE_GOLDEN=1` (only when a
// fold or the recorder changes on purpose; review the snapshot diff in the PR).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AnyEventEnvelope } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { foldCollection } from '../src/folds/collection';
import { foldGoals } from '../src/folds/goals';
import { foldInventory } from '../src/folds/inventory';
import { foldIsland } from '../src/folds/island';
import { sortEvents } from '../src/folds/order';
import { applyLearnerEvent, foldLearnerState, learnerModelFor } from '../src/learner/fold';
import { DAY_MS } from '../src/params';
import {
  accuracyBand,
  mathDensity,
  misconceptionAlerts,
  skillMap,
  timeSignals,
} from '../src/signals';
import { compileFixture, fixtureGameData, fixtureGraph, loadFixture } from './fixture';
import { CHILD_1, CHILD_2 } from './support/events';
import { REPLAY_DAYS, REPLAY_T0, recordReplayLog, stableJson } from './support/replay-log';

const LOG = fileURLToPath(new URL('./golden/replay-log.jsonl', import.meta.url));
const SNAPSHOT = fileURLToPath(new URL('./golden/replay-snapshot.json', import.meta.url));

loadFixture();
const graph = fixtureGraph();
const game = fixtureGameData();
const kids = [
  { childId: CHILD_1, isK: true },
  { childId: CHILD_2, isK: false },
];
const NOW = REPLAY_T0 + (REPLAY_DAYS + 1) * DAY_MS;

function snapshot(events: readonly AnyEventEnvelope[]) {
  const learners = kids.map(({ childId, isK }) => {
    const model = learnerModelFor(graph, { childId, isK });
    const state = foldLearnerState(events, graph, { childId, isK });
    return {
      childId,
      state,
      statuses: Object.fromEntries(graph.nodes.map((s) => [s, model.status(state, s, NOW)])),
      dueReviews: model.dueReviews(state, NOW),
      frontier: model.frontier(state),
      skillMap: skillMap(model, state, NOW),
      misconceptionAlerts: misconceptionAlerts(events, childId, compileFixture().misconceptions),
      accuracyBand: accuracyBand(events, childId, { isK }),
      mathDensity: mathDensity(events, childId),
    };
  });
  return {
    contentVersion: graph.contentVersion,
    events: events.length,
    learners,
    island: foldIsland(events, game),
    inventory: foldInventory(events),
    collection: foldCollection(events, game),
    goals: foldGoals(events, { [CHILD_1]: { weeklyGoal: 5 }, [CHILD_2]: { weeklyGoal: 6 } }),
    time: timeSignals(events, { timezone: 'America/Chicago' }),
  };
}

const readLog = (): AnyEventEnvelope[] =>
  readFileSync(LOG, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as AnyEventEnvelope);

if (process.env.UPDATE_GOLDEN === '1') {
  const events = recordReplayLog(graph, game);
  writeFileSync(LOG, `${events.map((e) => JSON.stringify(e)).join('\n')}\n`);
  writeFileSync(SNAPSHOT, `${stableJson(snapshot(events))}\n`);
}

describe('golden replay (04 §8)', () => {
  const events = readLog();

  it('the recorded log holds ≥ 2,000 events of every learner and island kind', () => {
    expect(events.length).toBeGreaterThanOrEqual(2_000);
    const types = new Set(events.map((e) => e.type));
    for (const t of [
      'attempt',
      'placement.probe',
      'placement.completed',
      'skill.override',
      'session.started',
      'session.ended',
      'material.produced',
      'material.spent',
      'building.placed',
      'building.upgraded',
      'decor.placed',
      'resident.arrived',
      'collection.unlocked',
      'festival.completed',
      'gift.left',
      'gift.opened',
      'milestone.defined',
      'milestone.reached',
      'goal.progress',
      'road.extended',
    ]) {
      expect(types, t).toContain(t);
    }
  });

  it('the log exercises the mastery ladder and spaced review', () => {
    const snap = snapshot(events);
    const statuses = snap.learners.flatMap((l) => Object.values(l.statuses));
    expect(statuses).toContain('practiced');
    expect(statuses.filter((s) => s === 'mastered' || s === 'needs-review').length).toBeGreaterThan(
      0,
    );
    expect(
      events.some(
        (e) => e.type === 'attempt' && (e.payload as { context: string }).context === 'review',
      ),
    ).toBe(true);
  });

  it('replays to the golden snapshot', () => {
    // Compared as parsed JSON, so formatting the file (Biome) never matters; numbers are rounded
    // to 12 significant digits by stableJson on both sides.
    const expected: unknown = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    expect(JSON.parse(stableJson(snapshot(events)))).toEqual(expected);
  });

  it('replays to the same snapshot in any order and incrementally', () => {
    const reversed = [...events].reverse();
    expect(stableJson(snapshot(reversed))).toBe(stableJson(snapshot(events)));
    for (const { childId, isK } of kids) {
      const model = learnerModelFor(graph, { childId, isK });
      let state = model.init(graph, null);
      for (const e of sortEvents(events)) state = applyLearnerEvent(model, state, e);
      expect(state).toEqual(foldLearnerState(events, graph, { childId, isK }));
    }
  });
});
