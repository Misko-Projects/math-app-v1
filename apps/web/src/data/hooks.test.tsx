import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DataProvider,
  useGoals,
  useInventory,
  useIsland,
  useProfiles,
  useSettings,
  useSkillStates,
} from './hooks';
import { CHILD_K, profile, testEnv } from './store.test-support';

let restore = () => {};
afterEach(() => {
  cleanup();
  restore();
});

function Probe() {
  const island = useIsland();
  const inventory = useInventory();
  const profiles = useProfiles();
  const settings = useSettings();
  const skills = useSkillStates(CHILD_K);
  const goals = useGoals();
  if (!island || !inventory || !profiles || !settings || goals === undefined) {
    return <p>loading</p>;
  }
  return (
    <ul>
      <li>name:{island.name ?? '-'}</li>
      <li>stone:{inventory.materials.stone ?? 0}</li>
      <li>kids:{profiles.map((p) => p.name).join(',')}</li>
      <li>goal:{settings.children[CHILD_K]?.weeklyGoal ?? '-'}</li>
      <li>learner:{skills ? skills.sessionsSeen : '-'}</li>
    </ul>
  );
}

describe('data hooks', () => {
  it('render the cached projections and re-render on writes', async () => {
    const env = testEnv();
    // Dexie's liveQuery stays idle unless it sees an IndexedDB global (always present in a
    // browser); jsdom has none, so point Dexie's dependency at this test's fake one.
    const deps = Dexie.dependencies;
    const before = { indexedDB: deps.indexedDB, IDBKeyRange: deps.IDBKeyRange };
    deps.indexedDB = env.factory;
    deps.IDBKeyRange = IDBKeyRange;
    restore = () => Object.assign(deps, before);
    const store = await env.open();
    render(
      <DataProvider store={store}>
        <Probe />
      </DataProvider>,
    );
    expect(await screen.findByText('name:-')).toBeTruthy();
    expect(screen.getByText('learner:-')).toBeTruthy();

    await act(async () => {
      await store.putProfile(profile(CHILD_K, 'K', 'Ada'));
      await store.append('island.named', { name: 'Pebble Point' }, { childId: CHILD_K });
      await store.append(
        'material.produced',
        { sessionId: null, requestId: null, workshopId: null, materials: { stone: 4 } },
        { childId: CHILD_K },
      );
      await store.append(
        'session.started',
        { sessionId: 's1', budgetMinutes: 10, trigger: 'child' },
        { childId: CHILD_K },
      );
    });
    await waitFor(() => expect(screen.getByText('name:Pebble Point')).toBeTruthy());
    expect(screen.getByText('stone:4')).toBeTruthy();
    expect(screen.getByText('kids:Ada')).toBeTruthy();
    expect(screen.getByText('goal:5')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('learner:1')).toBeTruthy());
    store.close();
  });
});
