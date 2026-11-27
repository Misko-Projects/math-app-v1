// Test support for the data layer (never imported by app code): the fixture content compiled in
// memory (the same compiler `pnpm content:build` runs, as the engine tests do), the engine's golden replay log (two siblings, six weeks), a
// fresh fake IndexedDB per test, and a deterministic clock and id generator.

import { compileContent } from '@number-island/content';
import { readBuiltTemplateStats, readContentFiles } from '@number-island/content/node';
import { buildSkillGraph } from '@number-island/engine';
import type { AnyEventEnvelope, ChildProfile } from '@number-island/shared';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import replayLog from '../../../../packages/engine/test/golden/replay-log.jsonl?raw';
import { createDb, type NumberIslandDb } from './db';
import type { StoreContent } from './projections';
import { createDataStore, type DataStore } from './store';

export const FAMILY = '019a0000-0000-7000-8000-00000000f001';
export const CHILD_K = '019a0000-0000-7000-8000-00000000c001';
export const CHILD_G2 = '019a0000-0000-7000-8000-00000000c002';
export const DEVICE = '019a0000-0000-7000-8000-00000000d001';

function compileFixture(): StoreContent {
  const result = compileContent(readContentFiles());
  if (!result.content || !result.contentVersion) {
    throw new Error('the fixture content does not compile');
  }
  return {
    contentVersion: result.contentVersion,
    gameData: result.content.game,
    graph: buildSkillGraph({
      contentVersion: result.contentVersion,
      skills: result.content.skills,
      templates: result.content.templates,
      graph: result.content.graph,
      // The stats the build ships (03 §6.1: seeded lesson examples aim at them).
      templateStats: JSON.parse(readBuiltTemplateStats(result.contentVersion)),
    }),
  };
}

// Compiled when a test file loads this module, not inside its first test. Compiling the whole
// catalog is the largest single cost of a data-layer test file (about half a second alone, many
// times that on a loaded CI runner), and when it was lazy the first test to open a store paid
// for it out of its own 5 s: backup.test.ts's export test timed out that way. Loading a file is
// not under a test's timeout.
const content = compileFixture();

/** The fixture content (graph, game data, content hash), compiled once per test file. */
export function fixtureContent(): StoreContent {
  return content;
}

/** The engine's recorded golden log (04 §8), in file order (not sorted). */
export function replayEvents(): AnyEventEnvelope[] {
  return replayLog
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as AnyEventEnvelope);
}

/** A deterministic clock: starts at `t0`, and `advance(ms)` moves it. */
export function testClock(t0 = Date.UTC(2026, 10, 18, 15)) {
  let t = t0;
  return {
    now: () => t,
    set: (ms: number) => {
      t = ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** UUIDv7-shaped, strictly increasing ids (the prefix keeps them distinct from fixture ids). */
export function testIds(prefix = 'e') {
  let n = 0;
  const hex = prefix.charCodeAt(0).toString(16).padStart(4, '0');
  return () => {
    n += 1;
    return `019b0000-${hex}-7000-8000-${n.toString(16).padStart(12, '0')}`;
  };
}

export interface TestEnv {
  factory: IDBFactory;
  open(name?: string, overrides?: Partial<StoreContent>): Promise<DataStore>;
  db(name?: string): NumberIslandDb;
  clock: ReturnType<typeof testClock>;
}

/** A fresh IndexedDB (one per test) and a store opener sharing a clock and id generator. */
export function testEnv(): TestEnv {
  const factory = new IDBFactory();
  const clock = testClock();
  const ids = testIds();
  const db = (name = 'test') => createDb({ name, indexedDB: factory, IDBKeyRange });
  return {
    factory,
    clock,
    db,
    open: (name = 'test', overrides = {}) =>
      createDataStore({
        db: db(name),
        content: { ...fixtureContent(), ...overrides },
        now: clock.now,
        newId: ids,
        timezone: 'America/Chicago',
      }),
  };
}

export function profile(id: string, grade: ChildProfile['grade'], name = 'Kid'): ChildProfile {
  return {
    id,
    familyId: FAMILY,
    name,
    birthYear: 2020,
    grade,
    advanced: false,
    avatar: {
      skinTone: 's03',
      faceShape: 'round',
      hairStyle: 'short',
      hairColor: 'brown',
      eyeShape: 'round',
      eyeColor: 'brown',
      eyebrows: 'soft',
      glasses: null,
      freckles: false,
      beautyMark: false,
      top: 'tee',
      topColor: 'blue',
      bottom: 'shorts',
      bottomColor: 'green',
      shoes: 'sneakers',
      shoesColor: 'red',
      hat: null,
      accessory: null,
      buddy: 'nib',
    },
    picturePasswordHash: null,
    guide: 'shelly',
    createdAt: 0,
    updatedAt: 0,
  };
}
