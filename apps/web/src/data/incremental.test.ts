// The cache's incremental path (02 §4.3): in-order appends advance rows without a full fold, and
// an event that sorts before a row's position falls back to one rebuild of the rows it touches.

import { sortEvents } from '@number-island/engine';
import { describe, expect, it, vi } from 'vitest';
import * as projections from './projections';
import { CHILD_G2, CHILD_K, profile, replayEvents, testEnv } from './store.test-support';

vi.mock('./projections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./projections')>();
  return { ...actual, foldRow: vi.fn(actual.foldRow) };
});

describe('incremental projection updates', () => {
  it('in-order appends never fold the full log; an out-of-order one rebuilds once', async () => {
    const env = testEnv();
    const store = await env.open();
    await store.putProfile(profile(CHILD_K, 'K'));
    await store.putProfile(profile(CHILD_G2, '2'));
    const foldRow = vi.mocked(projections.foldRow);
    foldRow.mockClear();

    const log = sortEvents(replayEvents()).slice(0, 120);
    for (const e of log) {
      env.clock.set(e.ts);
      await store.append(e.type as never, e.payload as never, { childId: e.childId });
    }
    expect(foldRow).not.toHaveBeenCalled();

    // A family event timed before everything: every family row is rebuilt, skills rows are not.
    env.clock.set((log[0]?.ts ?? 0) - 1);
    await store.append('road.extended', { to: 2 }, { childId: null });
    expect(foldRow.mock.calls.map((c) => c[0]).sort()).toEqual([
      'collection',
      'goals',
      'inventory',
      'island',
    ]);
    store.close();
  });
});
