// D01 client data layer (02 §4): the family event log in Dexie, the projection cache, profiles,
// settings documents (LWW), tombstones (08 §4), the device singleton and the local AI line log.
// The sync client and the backup export/import build on this API (see README.md).

import {
  childKey,
  DAY_MS,
  initCollection,
  initGoals,
  initInventory,
  initIsland,
  sortEvents,
} from '@number-island/engine';
import {
  type AnyEventEnvelope,
  anyEventEnvelopeSchema,
  type ChildId,
  type ChildProfile,
  type ChildSettings,
  type ChildSettingsKey,
  type CollectionState,
  childProfileSchema,
  DEFAULT_TIMEZONE,
  deviceIdSchema,
  type EventEnvelope,
  type EventId,
  type EventPayloads,
  type EventType,
  eventEnvelopeSchema,
  type FamilySettings,
  familyIdSchema,
  type InventoryState,
  type IslandState,
  inboundEventEnvelopeSchema,
  type LearnerState,
  parseSettingsKey,
  type SettingsDocument,
  type SkillId,
  type SyncRejection,
  settingsDocumentSchema,
  settingsKey,
  newId as sharedNewId,
  type WeeklyGoalState,
  withSettingDefaults,
} from '@number-island/shared';
import type {
  AiLogRow,
  DeviceRecord,
  NumberIslandDb,
  ProjectionRow,
  StoredEvent,
  SyncStateRow,
} from './db';
import { toEnvelope } from './db';
import {
  applyRow,
  childOfSkillsKey,
  expectedVersion,
  FALLBACK_GRADE,
  FAMILY_KEYS,
  foldRow,
  goalSettingsFor,
  type ProjectionInputs,
  type ProjectionKey,
  relevant,
  type StoreContent,
  skillsKey,
  sortsAfter,
  stableJson,
} from './projections';

export type DataStoreErrorCode =
  | 'invalid_event'
  | 'forbidden_type'
  | 'child_deleted'
  | 'invalid_profile'
  | 'invalid_settings'
  | 'invalid_ids';

export class DataStoreError extends Error {
  constructor(
    readonly code: DataStoreErrorCode,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = 'DataStoreError';
  }
}

export interface DataStoreOptions {
  db: NumberIslandDb;
  content: StoreContent;
  /** Clock (ms epoch). Default `Date.now`. */
  now?: () => number;
  /** Id generator (UUIDv7). Default the shared `newId`. */
  newId?: () => string;
  /** Family timezone default when no family settings document exists. Default the device's zone. */
  timezone?: string;
}

/** Event types a device may append. Tombstones are created only by the server (02 §5.9 S2). */
export type AppendableEventType = Exclude<EventType, 'child.deleted'>;

export interface IngestResult {
  /** Ids stored for the first time. */
  added: EventId[];
  /** Ids whose stored copy was replaced (a server clamp, or a preferred backup copy). */
  replaced: EventId[];
  /** Events dropped because their child is tombstoned. */
  dropped: number;
  /** Entries that failed validation (never stored). */
  invalid: number;
}

export type SettingsInput =
  | { key: 'family'; value: FamilySettings }
  | { key: ChildSettingsKey; value: ChildSettings };

export interface SettingsView {
  family: FamilySettings;
  /** Lower-case child id → settings with defaults, for every live child with a profile or document. */
  children: Record<ChildId, ChildSettings>;
}

export interface AiLogInput {
  childId: ChildId | null;
  skillId: SkillId | null;
  text: string;
}

export interface DataStore {
  readonly db: NumberIslandDb;
  readonly content: StoreContent;
  device(): Promise<DeviceRecord>;
  adoptFamily(ids: {
    familyId: string;
    deviceId: string;
    deviceToken: string;
  }): Promise<DeviceRecord>;
  append<T extends AppendableEventType>(
    type: T,
    payload: EventPayloads[T],
    opts: { childId: ChildId | null },
  ): Promise<EventEnvelope<T>>;
  ingest(events: readonly unknown[], opts: { source: 'server' | 'backup' }): Promise<IngestResult>;
  /** The whole log as wire envelopes, sorted by ts then id. */
  events(): Promise<AnyEventEnvelope[]>;
  unsynced(limit?: number): Promise<AnyEventEnvelope[]>;
  markSynced(ids: readonly EventId[]): Promise<void>;
  /** `pushed` maps a rejection's `index` to an id when the server could not name it. */
  markRejected(
    rejections: readonly SyncRejection[],
    pushed?: readonly Pick<AnyEventEnvelope, 'id'>[],
  ): Promise<void>;
  /** Lower-case ids of every tombstoned child. */
  deletedChildren(): Promise<Set<string>>;
  putProfile(profile: ChildProfile): Promise<ChildProfile>;
  mergeProfiles(profiles: readonly unknown[]): Promise<number>;
  allProfiles(): Promise<ChildProfile[]>;
  putSettings(doc: SettingsInput): Promise<SettingsDocument>;
  mergeSettings(docs: readonly unknown[]): Promise<number>;
  allSettings(): Promise<SettingsDocument[]>;
  familySettings(): Promise<FamilySettings>;
  childSettings(childId: ChildId): Promise<ChildSettings>;
  settingsView(): Promise<SettingsView>;
  skillStates(childId: ChildId): Promise<LearnerState | null>;
  island(): Promise<IslandState>;
  inventory(): Promise<InventoryState>;
  collection(): Promise<CollectionState>;
  goals(): Promise<WeeklyGoalState>;
  logAi(entry: AiLogInput): Promise<AiLogRow>;
  aiLog(): Promise<AiLogRow[]>;
  /** Deletes AI lines older than `maxAgeDays` (02 §4.4: 90-day retention); returns the count. */
  pruneAiLog(maxAgeDays?: number): Promise<number>;
  syncState(): Promise<SyncStateRow>;
  updateSyncState(patch: Partial<Omit<SyncStateRow, 'key'>>): Promise<SyncStateRow>;
  /** `navigator.storage.persist()` (02 §4.4); false when unavailable or refused. Never throws. */
  requestPersistence(): Promise<boolean>;
  /** Called after each committed `append`; returns the unsubscribe. */
  onAppend(listener: (event: AnyEventEnvelope) => void): () => void;
  close(): void;
}

export const AI_LOG_RETENTION_DAYS = 90;

const lwwWins = <T extends { updatedAt: number }>(incoming: T, existing: T | undefined) =>
  existing === undefined ||
  incoming.updatedAt > existing.updatedAt ||
  (incoming.updatedAt === existing.updatedAt && stableJson(incoming) > stableJson(existing));

function settingsChild(key: string): string | null {
  const parsed = parseSettingsKey(key);
  return parsed?.kind === 'child' ? childKey(parsed.childId) : null;
}

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Opens the store: the device singleton, persistence on first run, AI log retention, cache check. */
export async function createDataStore(opts: DataStoreOptions): Promise<DataStore> {
  const { db, content } = opts;
  const now = opts.now ?? (() => Date.now());
  const newId = opts.newId ?? sharedNewId;
  const timezone = opts.timezone ?? defaultTimezone();
  const listeners = new Set<(event: AnyEventEnvelope) => void>();
  const all = [db.events, db.projections, db.profiles, db.settings, db.device, db.aiLog];

  // ---------- helpers (run inside the callers' transactions) ----------

  async function tombstoned(): Promise<Set<string>> {
    const rows = await db.events.where('type').equals('child.deleted').toArray();
    const out = new Set<string>();
    for (const e of rows) {
      const id = (e.payload as { childId?: unknown }).childId;
      if (typeof id === 'string') out.add(childKey(id));
    }
    return out;
  }

  async function ensureDevice(): Promise<{ record: DeviceRecord; created: boolean }> {
    return db.transaction('rw', db.device, async () => {
      const existing = await db.device.get('device');
      if (existing) return { record: existing, created: false };
      const record: DeviceRecord = {
        key: 'device',
        deviceId: newId(),
        familyId: newId(),
        pairedAt: null,
        createdAt: now(),
      };
      await db.device.put(record);
      return { record, created: true };
    });
  }

  /** Removes a tombstoned child's events (not the tombstones), profile, settings, AI lines, row. */
  async function purge(children: ReadonlySet<string>): Promise<boolean> {
    if (children.size === 0) return false;
    const hit = (id: string | null) => id !== null && children.has(childKey(id));
    const events = await db.events.filter((e) => hit(e.childId)).primaryKeys();
    const profiles = await db.profiles.filter((p) => hit(p.id)).primaryKeys();
    const settings = await db.settings.filter((s) => hit(settingsChild(s.key))).primaryKeys();
    const ai = await db.aiLog.filter((a) => hit(a.childId)).primaryKeys();
    const rows = await db.projections.filter((r) => hit(childOfSkillsKey(r.key))).primaryKeys();
    await db.events.bulkDelete(events);
    await db.profiles.bulkDelete(profiles);
    await db.settings.bulkDelete(settings);
    await db.aiLog.bulkDelete(ai);
    await db.projections.bulkDelete(rows);
    return events.length + profiles.length + settings.length + ai.length + rows.length > 0;
  }

  async function inputs(
    deleted: ReadonlySet<string>,
    extraChildren: Iterable<string>,
  ): Promise<ProjectionInputs> {
    const profiles = await db.profiles.toArray();
    const settings = await db.settings.toArray();
    const rows = await db.projections.toCollection().primaryKeys();
    const children = new Map<string, boolean>();
    const add = (id: string | null, isK = false) => {
      if (id === null) return;
      const k = childKey(id);
      if (!deleted.has(k) && !children.has(k)) children.set(k, isK);
    };
    for (const p of [...profiles].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (!deleted.has(childKey(p.id))) children.set(childKey(p.id), p.grade === 'K');
    }
    for (const r of rows) add(childOfSkillsKey(r));
    for (const c of extraChildren) add(c);
    return { content, children, goalSettings: goalSettingsFor(profiles, settings, deleted) };
  }

  /**
   * Brings every cache row up to date after `fresh` events were stored: a row whose version is
   * stale, that is missing, or that a fresh event sorts before is rebuilt from the full log;
   * otherwise the fresh events are applied in ts/id order (02 §4.3).
   */
  async function reconcile(
    fresh: readonly AnyEventEnvelope[],
    opts: { rebuild?: boolean; deleted?: ReadonlySet<string>; children?: Iterable<string> } = {},
  ): Promise<void> {
    const deleted = opts.deleted ?? (await tombstoned());
    const extra = [...(opts.children ?? [])];
    for (const e of fresh) if (e.childId !== null) extra.push(e.childId);
    const inp = await inputs(deleted, extra);
    const wanted: ProjectionKey[] = [
      ...FAMILY_KEYS,
      ...[...inp.children.keys()].sort().map(skillsKey),
    ];
    const rows = new Map((await db.projections.toArray()).map((r) => [r.key, r]));
    const stale = [...rows.keys()].filter((k) => !wanted.includes(k as ProjectionKey));
    if (stale.length > 0) await db.projections.bulkDelete(stale);
    const sortedFresh = sortEvents(fresh);
    let log: StoredEvent[] | null = null;
    const fullLog = async () => {
      log ??= await db.events.toArray();
      return log;
    };
    const out: ProjectionRow[] = [];
    for (const key of wanted) {
      const row = rows.get(key);
      const mine = sortedFresh.filter((e) => relevant(key, e));
      const first = mine[0];
      if (
        opts.rebuild ||
        !row ||
        row.version !== expectedVersion(key, inp) ||
        (first !== undefined && !sortsAfter(row, first))
      ) {
        out.push(foldRow(key, await fullLog(), inp));
      } else if (mine.length > 0) {
        out.push(mine.reduce((r, e) => applyRow(r, e, inp), row));
      }
    }
    if (out.length > 0) await db.projections.bulkPut(out);
  }

  async function childIdsInLog(): Promise<string[]> {
    const keys = await db.events.orderBy('[childId+ts]').uniqueKeys();
    const out = new Set<string>();
    for (const k of keys) {
      const id = Array.isArray(k) ? k[0] : null;
      if (typeof id === 'string') out.add(childKey(id));
    }
    return [...out];
  }

  async function requestPersistence(): Promise<boolean> {
    try {
      const storage = (globalThis as { navigator?: { storage?: Partial<StorageManager> } })
        .navigator?.storage;
      if (typeof storage?.persist !== 'function') return false;
      return (await storage.persist()) === true;
    } catch {
      return false;
    }
  }

  async function pruneAiLog(maxAgeDays = AI_LOG_RETENTION_DAYS): Promise<number> {
    return db.aiLog
      .where('ts')
      .below(now() - maxAgeDays * DAY_MS)
      .delete();
  }

  // ---------- open ----------

  await db.open();
  const { created } = await ensureDevice();
  if (created) await requestPersistence();
  await pruneAiLog();
  await db.transaction('rw', all, async () => {
    const deleted = await tombstoned();
    const purged = await purge(deleted);
    await reconcile([], { rebuild: purged, deleted, children: await childIdsInLog() });
  });

  // ---------- API ----------

  const store: DataStore = {
    db,
    content,

    async device() {
      return (await ensureDevice()).record;
    },

    async adoptFamily({ familyId, deviceId, deviceToken }) {
      if (
        !familyIdSchema.safeParse(familyId).success ||
        !deviceIdSchema.safeParse(deviceId).success ||
        typeof deviceToken !== 'string' ||
        deviceToken.length === 0
      ) {
        throw new DataStoreError('invalid_ids', 'adoptFamily needs a UUIDv7 family and device id');
      }
      const { record: before } = await ensureDevice();
      return db.transaction('rw', [db.device, db.events, db.profiles], async () => {
        const old = (await db.device.get('device')) ?? before;
        // Never-synced events never left this device, so moving them to the server's ids is safe.
        await db.events
          .where('synced')
          .equals(0)
          .modify((e) => {
            if (e.familyId === old.familyId) e.familyId = familyId;
            if (e.deviceId === old.deviceId) e.deviceId = deviceId;
          });
        await db.profiles
          .filter((p) => p.familyId === old.familyId)
          .modify((p) => {
            p.familyId = familyId;
          });
        const record: DeviceRecord = { ...old, familyId, deviceId, deviceToken, pairedAt: now() };
        await db.device.put(record);
        return record;
      });
    },

    async append(type, payload, { childId }) {
      if ((type as EventType) === 'child.deleted') {
        throw new DataStoreError('forbidden_type', 'child.deleted is created only by the server');
      }
      const { record } = await ensureDevice();
      const envelope = await db.transaction('rw', all, async () => {
        const dev = (await db.device.get('device')) ?? record;
        const parsed = eventEnvelopeSchema.safeParse({
          id: newId(),
          familyId: dev.familyId,
          childId,
          deviceId: dev.deviceId,
          ts: now(),
          type,
          v: 1,
          payload,
          contentVersion: content.contentVersion,
        });
        if (!parsed.success) {
          throw new DataStoreError('invalid_event', `invalid ${type} event`, parsed.error.issues);
        }
        const deleted = await tombstoned();
        if (childId !== null && deleted.has(childKey(childId))) {
          throw new DataStoreError('child_deleted', 'this child was deleted');
        }
        const e = parsed.data;
        await db.events.add({ ...e, synced: 0 });
        await reconcile([e], { deleted });
        return e;
      });
      for (const listener of listeners) {
        try {
          listener(envelope);
        } catch {
          // A listener (the sync client's nudge) must never fail an append that already committed.
        }
      }
      return envelope as EventEnvelope<typeof type>;
    },

    async ingest(raw, { source }) {
      const schema = source === 'server' ? anyEventEnvelopeSchema : inboundEventEnvelopeSchema;
      const valid: AnyEventEnvelope[] = [];
      let invalid = 0;
      for (const r of raw) {
        const parsed = schema.safeParse(r);
        if (parsed.success) valid.push(parsed.data);
        else invalid += 1;
      }
      // One copy per id, by the folds' own preference (the server's clamped copy first).
      const incoming = sortEvents(valid);
      return db.transaction('rw', all, async () => {
        const before = await tombstoned();
        const deleted = new Set(before);
        for (const e of incoming) {
          if (e.type === 'child.deleted') {
            const id = (e.payload as { childId: string }).childId;
            deleted.add(childKey(id));
          }
        }
        const existing = await db.events.bulkGet(incoming.map((e) => e.id));
        const result: IngestResult = { added: [], replaced: [], dropped: 0, invalid };
        const fresh: AnyEventEnvelope[] = [];
        const puts: StoredEvent[] = [];
        incoming.forEach((e, i) => {
          if (e.childId !== null && deleted.has(childKey(e.childId))) {
            result.dropped += 1;
            return;
          }
          const prev = existing[i];
          if (!prev) {
            puts.push({ ...e, synced: source === 'server' ? 1 : 0 });
            result.added.push(e.id);
            fresh.push(e);
            return;
          }
          const same = stableJson(toEnvelope(prev)) === stableJson(e);
          if (source === 'server') {
            // The server's copy is authoritative (08 §4 clamp): replace, and it is synced.
            if (!same) result.replaced.push(e.id);
            if (!same || prev.synced === 0 || prev._rejected) puts.push({ ...e, synced: 1 });
            return;
          }
          if (!same && sortEvents([toEnvelope(prev), e])[0] === e) {
            const { _rejected } = prev;
            puts.push({ ...e, synced: prev.synced, ...(_rejected ? { _rejected } : {}) });
            result.replaced.push(e.id);
          }
        });
        await db.events.bulkPut(puts);
        const newlyDeleted = new Set([...deleted].filter((c) => !before.has(c)));
        const purged = await purge(newlyDeleted);
        await reconcile(fresh, { rebuild: purged || result.replaced.length > 0, deleted });
        return result;
      });
    },

    async events() {
      return sortEvents((await db.events.toArray()).map(toEnvelope));
    },

    async unsynced(limit = 500) {
      const rows = await db.events.where('synced').equals(0).toArray();
      return sortEvents(rows.filter((r) => !r._rejected).map(toEnvelope)).slice(0, limit);
    },

    async markSynced(ids) {
      if (ids.length === 0) return;
      await db.transaction('rw', db.events, async () => {
        const rows = await db.events.bulkGet([...ids]);
        const puts = rows
          .filter((r): r is StoredEvent => r !== undefined && r.synced === 0)
          .map((r) => ({ ...r, synced: 1 as const }));
        await db.events.bulkPut(puts);
      });
    },

    async markRejected(rejections, pushed) {
      const byId = new Map<string, SyncRejection>();
      for (const r of rejections) {
        const id = r.id ?? pushed?.[r.index]?.id ?? null;
        if (id !== null) byId.set(id, r);
      }
      if (byId.size === 0) return;
      await db.transaction('rw', db.events, async () => {
        const rows = await db.events.bulkGet([...byId.keys()]);
        const puts: StoredEvent[] = [];
        for (const row of rows) {
          const r = row && byId.get(row.id);
          if (row && r && row.synced === 0) {
            puts.push({ ...row, _rejected: { code: r.code, message: r.message } });
          }
        }
        await db.events.bulkPut(puts);
      });
    },

    async deletedChildren() {
      return tombstoned();
    },

    async putProfile(profile) {
      const parsed = childProfileSchema.safeParse({ ...profile, updatedAt: now() });
      if (!parsed.success) {
        throw new DataStoreError('invalid_profile', 'invalid child profile', parsed.error.issues);
      }
      return db.transaction('rw', all, async () => {
        const deleted = await tombstoned();
        if (deleted.has(childKey(parsed.data.id))) {
          throw new DataStoreError('child_deleted', 'this child was deleted');
        }
        await db.profiles.put(parsed.data);
        await reconcile([], { deleted });
        return parsed.data;
      });
    },

    async mergeProfiles(list) {
      const valid = list.flatMap((p) => {
        const parsed = childProfileSchema.safeParse(p);
        return parsed.success ? [parsed.data] : [];
      });
      return db.transaction('rw', all, async () => {
        const deleted = await tombstoned();
        let changed = 0;
        for (const p of valid) {
          if (deleted.has(childKey(p.id))) continue;
          if (lwwWins(p, await db.profiles.get(p.id))) {
            await db.profiles.put(p);
            changed += 1;
          }
        }
        if (changed > 0) await reconcile([], { deleted });
        return changed;
      });
    },

    async allProfiles() {
      return db.profiles.toArray();
    },

    async putSettings(doc) {
      const parsed = settingsDocumentSchema.safeParse({ ...doc, updatedAt: now() });
      if (!parsed.success) {
        throw new DataStoreError('invalid_settings', 'invalid settings', parsed.error.issues);
      }
      return db.transaction('rw', all, async () => {
        const deleted = await tombstoned();
        const child = settingsChild(parsed.data.key);
        if (child !== null && deleted.has(child)) {
          throw new DataStoreError('child_deleted', 'this child was deleted');
        }
        await db.settings.put(parsed.data);
        await reconcile([], { deleted });
        return parsed.data;
      });
    },

    async mergeSettings(docs) {
      const valid = docs.flatMap((d) => {
        const parsed = settingsDocumentSchema.safeParse(d);
        return parsed.success ? [parsed.data] : [];
      });
      return db.transaction('rw', all, async () => {
        const deleted = await tombstoned();
        let changed = 0;
        for (const d of valid) {
          const child = settingsChild(d.key);
          if (child !== null && deleted.has(child)) continue;
          if (lwwWins(d, await db.settings.get(d.key))) {
            await db.settings.put(d);
            changed += 1;
          }
        }
        if (changed > 0) await reconcile([], { deleted });
        return changed;
      });
    },

    async allSettings() {
      return db.settings.toArray();
    },

    async familySettings() {
      const doc = await db.settings.get('family');
      return withSettingDefaults({
        kind: 'family',
        value: doc?.key === 'family' ? doc.value : null,
        timezone,
      });
    },

    async childSettings(childId) {
      return (await store.settingsView()).children[childKey(childId)] ?? defaultChild(null);
    },

    async settingsView() {
      const docs = await db.settings.toArray();
      const profiles = await db.profiles.toArray();
      const deleted = await tombstoned();
      const familyDoc = docs.find((d) => d.key === 'family');
      const family = withSettingDefaults({
        kind: 'family',
        value: familyDoc?.key === 'family' ? familyDoc.value : null,
        timezone,
      });
      const grades = new Map(profiles.map((p) => [childKey(p.id), p.grade]));
      const values = new Map<string, ChildSettings>();
      for (const d of [...docs].sort((a, b) => (a.key < b.key ? -1 : 1))) {
        const child = settingsChild(d.key);
        if (child === null || d.key === 'family') continue;
        if (!values.has(child) || d.key === settingsKey(child)) values.set(child, d.value);
      }
      const children: Record<ChildId, ChildSettings> = {};
      for (const child of [...new Set([...grades.keys(), ...values.keys()])].sort()) {
        if (deleted.has(child)) continue;
        children[child] = withSettingDefaults({
          kind: 'child',
          value: values.get(child) ?? null,
          grade: grades.get(child) ?? FALLBACK_GRADE,
        });
      }
      return { family, children };
    },

    async skillStates(childId) {
      const row = await db.projections.get(skillsKey(childId));
      return row ? (row.data as LearnerState) : null;
    },

    async island() {
      const row = await db.projections.get('island');
      return (row?.data as IslandState | undefined) ?? initIsland(content.gameData);
    },

    async inventory() {
      const row = await db.projections.get('inventory');
      return (row?.data as InventoryState | undefined) ?? initInventory();
    },

    async collection() {
      const row = await db.projections.get('collection');
      return (row?.data as CollectionState | undefined) ?? initCollection(content.gameData);
    },

    async goals() {
      const row = await db.projections.get('goals');
      return (row?.data as WeeklyGoalState | undefined) ?? initGoals();
    },

    async logAi({ childId, skillId, text }) {
      const row: AiLogRow = { id: newId(), ts: now(), childId, skillId, text };
      await db.aiLog.add(row);
      return row;
    },

    async aiLog() {
      return db.aiLog.orderBy('ts').toArray();
    },

    pruneAiLog,

    async syncState() {
      return (
        (await db.syncState.get('sync')) ?? {
          key: 'sync',
          cursor: null,
          lastSyncAt: null,
          lastError: null,
        }
      );
    },

    async updateSyncState(patch) {
      return db.transaction('rw', db.syncState, async () => {
        const next: SyncStateRow = { ...(await store.syncState()), ...patch, key: 'sync' };
        await db.syncState.put(next);
        return next;
      });
    },

    requestPersistence,

    onAppend(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    close() {
      listeners.clear();
      db.close();
    },
  };

  function defaultChild(grade: ChildProfile['grade'] | null): ChildSettings {
    return withSettingDefaults({ kind: 'child', grade: grade ?? FALLBACK_GRADE });
  }

  return store;
}
