// 02 §4.3 projection cache: which rows exist, what version each must carry, and how a row is
// rebuilt from the full log or advanced by one event. Pure functions over in-memory data; the
// store runs them inside Dexie transactions.

import {
  applyCollectionEvent,
  applyGoalsEvent,
  applyInventoryEvent,
  applyIslandEvent,
  applyLearnerEvent,
  childKey,
  compareEvents,
  ELO_FIRE_V1,
  type EngineCollectionState,
  type EngineIslandState,
  type EngineWeeklyGoalState,
  fnv1a32,
  foldCollection,
  foldGoals,
  foldInventory,
  foldIsland,
  foldLearnerState,
  type GoalSettings,
  learnerModelFor,
  sortEvents,
} from '@number-island/engine';
import {
  type AnyEventEnvelope,
  type ChildId,
  type ChildProfile,
  type GameData,
  type LearnerState,
  parseSettingsKey,
  type SettingsDocument,
  type SkillGraph,
  withSettingDefaults,
} from '@number-island/shared';
import type { ProjectionRow } from './db';

/**
 * Bump when any fold the cache stores changes behaviour (engine folds, the inputs passed to them,
 * or the row layout). Every cached row whose version differs is rebuilt from the full log on open.
 */
export const PROJECTION_VERSION = 2;

export interface StoreContent {
  /** packages/content build hash; stamped on appended events and part of every row version. */
  contentVersion: string;
  gameData: GameData;
  graph: SkillGraph;
}

export const FAMILY_KEYS = ['island', 'inventory', 'collection', 'goals'] as const;
export type FamilyKey = (typeof FAMILY_KEYS)[number];
export type ProjectionKey = FamilyKey | `skills:${string}`;

export const skillsKey = (childId: ChildId): `skills:${string}` => `skills:${childKey(childId)}`;
export const childOfSkillsKey = (key: string): string | null =>
  key.startsWith('skills:') ? key.slice('skills:'.length) : null;

/** Grade used for a child without a profile (yet): G1, whose defaults match the goals fold's 6. */
export const FALLBACK_GRADE = '1' as const;

/** What the rows depend on besides the log: the profiles' grades and the children's settings. */
export interface ProjectionInputs {
  content: StoreContent;
  /** Lower-case child id → isK, for every child with a skills row. */
  children: ReadonlyMap<string, boolean>;
  goalSettings: GoalSettings;
}

/** Stable JSON (sorted object keys), for version fingerprints and copy comparison. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

const baseVersion = (content: StoreContent) =>
  `p${PROJECTION_VERSION}|${ELO_FIRE_V1}|${content.contentVersion}`;

/** The version a row must carry; a different stored version means "rebuild from the full log". */
export function expectedVersion(key: ProjectionKey, inputs: ProjectionInputs): string {
  const base = baseVersion(inputs.content);
  const child = childOfSkillsKey(key);
  if (child !== null) return `${base}|isK=${inputs.children.get(child) ? 1 : 0}`;
  if (key === 'goals') return `${base}|goals=${stableJson(inputs.goalSettings)}`;
  return base;
}

/**
 * The effective weekly goal of every known child (profile or settings document), with defaults
 * filled by grade (F4), keyed by lower-case child id.
 */
export function goalSettingsFor(
  profiles: readonly ChildProfile[],
  settings: readonly SettingsDocument[],
  deleted: ReadonlySet<string>,
): GoalSettings {
  const grades = new Map(profiles.map((p) => [childKey(p.id), p.grade]));
  const docs = new Map<string, SettingsDocument>();
  for (const d of [...settings].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    const parsed = parseSettingsKey(d.key);
    if (parsed?.kind !== 'child') continue;
    const k = childKey(parsed.childId);
    if (!docs.has(k) || parsed.childId === k) docs.set(k, d);
  }
  const out: Record<ChildId, { weeklyGoal: number }> = {};
  for (const child of [...new Set([...grades.keys(), ...docs.keys()])].sort()) {
    if (deleted.has(child)) continue;
    const doc = docs.get(child);
    const value = withSettingDefaults({
      kind: 'child',
      value: doc?.key === 'family' ? null : doc?.value,
      grade: grades.get(child) ?? FALLBACK_GRADE,
    });
    out[child] = { weeklyGoal: value.weeklyGoal };
  }
  return out;
}

/** Does an event touch this row? Other children's events are a no-op for a skills row. */
export function relevant(key: ProjectionKey, e: AnyEventEnvelope): boolean {
  const child = childOfSkillsKey(key);
  if (child === null) return true;
  if (e.type === 'child.deleted') {
    const id = (e.payload as { childId?: unknown }).childId;
    return typeof id === 'string' && childKey(id) === child;
  }
  return e.childId !== null && childKey(e.childId) === child;
}

/** The full fold of one row over the whole log. */
export function foldRow(
  key: ProjectionKey,
  events: readonly AnyEventEnvelope[],
  inputs: ProjectionInputs,
): ProjectionRow {
  const { gameData, graph } = inputs.content;
  const child = childOfSkillsKey(key);
  const mine = events.filter((e) => relevant(key, e));
  const sorted = sortEvents(mine);
  const last = sorted[sorted.length - 1] ?? null;
  let data: unknown;
  if (child !== null) {
    data = foldLearnerState(mine, graph, {
      childId: child,
      isK: inputs.children.get(child) ?? false,
    });
  } else if (key === 'island') data = foldIsland(events, gameData);
  else if (key === 'inventory') data = foldInventory(events);
  else if (key === 'collection') data = foldCollection(events, gameData);
  else data = foldGoals(events, inputs.goalSettings);
  return {
    key,
    version: expectedVersion(key, inputs),
    upToEventId: last?.id ?? null,
    upToTs: last?.ts ?? null,
    data,
  };
}

/** True when `e` sorts strictly after the row's last applied event (02 §4.3: ts, then id). */
export function sortsAfter(row: ProjectionRow, e: AnyEventEnvelope): boolean {
  if (row.upToEventId === null || row.upToTs === null) return true;
  return compareEvents(e, { id: row.upToEventId, ts: row.upToTs }) > 0;
}

/** Applies one event that sorts after the row's position (the caller checks `sortsAfter`). */
export function applyRow(
  row: ProjectionRow,
  e: AnyEventEnvelope,
  inputs: ProjectionInputs,
): ProjectionRow {
  const { gameData, graph } = inputs.content;
  const key = row.key as ProjectionKey;
  const child = childOfSkillsKey(key);
  let data: unknown;
  if (child !== null) {
    const model = learnerModelFor(graph, {
      childId: child,
      isK: inputs.children.get(child) ?? false,
    });
    data = applyLearnerEvent(model, row.data as LearnerState, e);
  } else if (key === 'island') data = applyIslandEvent(row.data as EngineIslandState, e, gameData);
  else if (key === 'inventory')
    data = applyInventoryEvent(row.data as Parameters<typeof applyInventoryEvent>[0], e);
  else if (key === 'collection') {
    data = applyCollectionEvent(row.data as EngineCollectionState, e, gameData);
  } else data = applyGoalsEvent(row.data as EngineWeeklyGoalState, e, inputs.goalSettings);
  return { ...row, upToEventId: e.id, upToTs: e.ts, data };
}

/** Integrity hash of a row's data (stable JSON, FNV-1a 32). */
export const dataHash = (data: unknown): number => fnv1a32(stableJson(data));

/** The row as the store writes it: with the hash of its data. */
export const sealRow = (row: ProjectionRow): ProjectionRow => ({
  ...row,
  dataHash: dataHash(row.data),
});

/**
 * False for a row whose data was changed or lost after the store wrote it. Never throws: data that
 * cannot be hashed (missing, cyclic, not JSON) marks the row damaged, so it is rebuilt.
 */
export function rowIntact(row: ProjectionRow): boolean {
  try {
    return typeof row.dataHash === 'number' && row.dataHash === dataHash(row.data);
  } catch {
    return false;
  }
}
