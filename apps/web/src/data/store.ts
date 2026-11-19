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
  sameId,
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
  eventEnvelopeSchemaFor,
  eventPayloadBytes,
  type FamilySettings,
  familyIdSchema,
  type InventoryState,
  type IslandState,
  inboundEventEnvelopeSchema,
  type LearnerState,
  MAX_EVENT_PAYLOAD_BYTES,
  parseSettingsKey,
  type SettingsDocument,
  type SkillId,
  type SyncRejection,
  settingsDocumentSchema,
  settingsKey,
  newId as sharedNewId,
  utf8ByteLength,
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
  rowIntact,
  type StoreContent,
  sealRow,
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
  | 'invalid_ids'
  /** `putProfiles(…, { intoEmptyFamily: true })` found children already stored. */
  | 'family_has_children';

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
  /** The store's clock (ms epoch): the injected `now`, else `Date.now`. */
  now(): number;
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
  /**
   * Several profiles in one transaction: all are written or none (an invalid profile, a deleted
   * child or an interruption such as a reload leaves the store as it was). With
   * `intoEmptyFamily`, the write is refused (`family_has_children`) when any profile is already
   * stored, checked inside the same transaction: a first roster is saved once, never twice.
   */
  putProfiles(
    profiles: readonly ChildProfile[],
    opts?: { intoEmptyFamily?: boolean },
  ): Promise<ChildProfile[]>;
  /** LWW merge (see `MergeSource` for ties); returns how many documents changed. */
  mergeProfiles(profiles: readonly unknown[], opts: { source: MergeSource }): Promise<number>;
  allProfiles(): Promise<ChildProfile[]>;
  putSettings(doc: SettingsInput): Promise<SettingsDocument>;
  mergeSettings(docs: readonly unknown[], opts: { source: MergeSource }): Promise<number>;
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

/** Where merged documents come from: the server's LWW result, or a local backup file. */
export type MergeSource = 'server' | 'backup';

/**
 * LWW per whole document (08 §4). The server keeps its stored document unless the incoming
 * `updatedAt` is strictly greater, so its answer is the LWW result: on an equal `updatedAt` the
 * server's copy is adopted. A backup replaces a document only when it is strictly newer.
 */
function lwwWins<T extends { updatedAt: number }>(
  incoming: T,
  existing: T | undefined,
  source: MergeSource,
): boolean {
  if (existing === undefined) return true;
  if (incoming.updatedAt > existing.updatedAt) return true;
  return (
    source === 'server' &&
    incoming.updatedAt === existing.updatedAt &&
    stableJson(incoming) !== stableJson(existing)
  );
}

const tombstoneEnvelopeSchema = eventEnvelopeSchemaFor('child.deleted');

/**
 * The one tombstone rule (02 §5.9 S2, 08 §3 import rules): a `child.deleted` counts only when its
 * envelope passes the shared schema (UUIDs, payload `{ childId }`), its `childId` is null and its
 * `deviceId` is its family id (the server's pseudo-device). Takes an envelope or a stored row
 * (the row's local fields are ignored) or anything else read from the table.
 */
export function isValidTombstone(row: unknown): boolean {
  if (typeof row !== 'object' || row === null) return false;
  const { synced: _s, _rejected: _r, ...envelope } = row as Record<string, unknown>;
  const parsed = tombstoneEnvelopeSchema.safeParse(envelope);
  return (
    parsed.success &&
    parsed.data.childId === null &&
    sameId(parsed.data.deviceId, parsed.data.familyId)
  );
}

/** What may reach a fold: every event except a tombstone that fails `isValidTombstone`. */
const foldable = <E extends Pick<AnyEventEnvelope, 'type'>>(e: E) =>
  e.type !== 'child.deleted' || isValidTombstone(e);

/**
 * 08 §3: the server refuses an event whose `type` plus `contentVersion` exceed 1,024 UTF-8 bytes
 * (D1 would fail the whole batch on an oversized row). Mirrors the API's
 * `MAX_EVENT_ENVELOPE_STRING_BYTES`, which apps/web may not import.
 */
export const MAX_EVENT_ENVELOPE_STRING_BYTES = 1024;

export const envelopeStringBytes = (e: { type: string; contentVersion: string }): number =>
  utf8ByteLength(e.type) + utf8ByteLength(e.contentVersion);

/** The stored (parsed) payload's UTF-8 size is within the server's 8 KB cap (08 §4). */
const payloadWithinCap = (e: AnyEventEnvelope) => {
  const bytes = eventPayloadBytes(e);
  return bytes !== null && bytes <= MAX_EVENT_PAYLOAD_BYTES;
};

/**
 * The server's per-event rules beyond the schemas, applied to the parsed event that is stored, by
 * `append` and `ingest` alike: the 8 KB payload, the 1,024-byte strings and the tombstone rule.
 */
const admissible = (e: AnyEventEnvelope) =>
  payloadWithinCap(e) && envelopeStringBytes(e) <= MAX_EVENT_ENVELOPE_STRING_BYTES && foldable(e);

const childOf = (e: Pick<AnyEventEnvelope, 'childId'>) =>
  e.childId === null ? null : childKey(e.childId);

/** The tombstoned child of a `child.deleted`, lower-cased; null for other types. */
function tombstoneChild(e: Pick<AnyEventEnvelope, 'type' | 'payload'>): string | null {
  if (e.type !== 'child.deleted') return null;
  const payload: unknown = e.payload;
  const id =
    typeof payload === 'object' && payload !== null
      ? (payload as { childId?: unknown }).childId
      : undefined;
  return typeof id === 'string' ? childKey(id) : null;
}

/**
 * Copies of one id may differ in time (a clamp) or payload detail, never in identity: a copy that
 * names another type or child (or, for a tombstone, another deleted child) is not the same event.
 */
const sameIdentity = (a: AnyEventEnvelope, b: AnyEventEnvelope) =>
  a.type === b.type && childOf(a) === childOf(b) && tombstoneChild(a) === tombstoneChild(b);

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

  /** The lower-case ids of the children named by valid stored tombstones (`isValidTombstone`). */
  async function tombstoned(): Promise<Set<string>> {
    const rows = await db.events.where('type').equals('child.deleted').toArray();
    const out = new Set<string>();
    for (const e of rows) {
      const child = isValidTombstone(e) ? tombstoneChild(e) : null;
      if (child !== null) out.add(child);
    }
    return out;
  }

  /** The stored log as folds may see it (`foldable`): invalid tombstones never reach the engine. */
  async function foldableLog(): Promise<StoredEvent[]> {
    return (await db.events.toArray()).filter(foldable);
  }

  /** Deletes stored `child.deleted` rows that fail `isValidTombstone`. */
  async function removeForgedTombstones(): Promise<boolean> {
    const forged = await db.events
      .where('type')
      .equals('child.deleted')
      .filter((e) => !isValidTombstone(e))
      .primaryKeys();
    await db.events.bulkDelete(forged);
    return forged.length > 0;
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
   * Brings every cache row up to date after `fresh` events were stored (02 §4.3). A row is rebuilt
   * from the full log when it is missing, its version is stale, a fresh event sorts before its
   * position, or its data fails the integrity hash. The hash is checked before a row takes events,
   * and for every row when `verifyAll` is set (on open). Otherwise the fresh events are applied in
   * ts/id order.
   */
  async function reconcile(
    fresh: readonly AnyEventEnvelope[],
    opts: {
      rebuild?: boolean;
      verifyAll?: boolean;
      deleted?: ReadonlySet<string>;
      children?: Iterable<string>;
    } = {},
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
      log ??= await foldableLog();
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
        (first !== undefined && !sortsAfter(row, first)) ||
        ((opts.verifyAll || first !== undefined) && !rowIntact(row))
      ) {
        out.push(foldRow(key, await fullLog(), inp));
      } else if (mine.length > 0) {
        let next: ProjectionRow;
        try {
          next = mine.reduce((r, e) => applyRow(r, e, inp), row);
        } catch {
          // The cached state could not take the event (a damaged row): rebuild it from the log,
          // so a bad cache row never fails the write that triggered it.
          next = foldRow(key, await fullLog(), inp);
        }
        out.push(next);
      }
    }
    if (out.length > 0) await db.projections.bulkPut(out.map(sealRow));
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
    const forged = await removeForgedTombstones();
    const deleted = await tombstoned();
    const purged = await purge(deleted);
    await reconcile([], {
      rebuild: forged || purged,
      verifyAll: true,
      deleted,
      children: await childIdsInLog(),
    });
  });

  // ---------- API ----------

  const store: DataStore = {
    db,
    content,
    now,

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
        // Before the first pairing, the local family never existed on the server, so every event
        // under it moves (whatever its sync flag). After that, only never-synced events move: they
        // never left this device.
        const events =
          old.pairedAt === null ? db.events.toCollection() : db.events.where('synced').equals(0);
        await events.modify((e) => {
          if (sameId(e.familyId, old.familyId)) {
            // A server-authored tombstone's pseudo-device is its family id (02 §5.9 S2).
            if (
              e.type === 'child.deleted' &&
              e.childId === null &&
              sameId(e.deviceId, e.familyId)
            ) {
              e.deviceId = familyId;
            }
            e.familyId = familyId;
          }
          if (sameId(e.deviceId, old.deviceId)) e.deviceId = deviceId;
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
        // What the server would refuse must never enter the log: the stored payload over 8 KB
        // (08 §4), measured on the parsed event that is written, or oversized strings (08 §3).
        const bytes = eventPayloadBytes(parsed.data);
        if (bytes === null || bytes > MAX_EVENT_PAYLOAD_BYTES) {
          throw new DataStoreError(
            'invalid_event',
            `${type} payload is ${bytes ?? 'not JSON'} bytes; the limit is ${MAX_EVENT_PAYLOAD_BYTES}`,
          );
        }
        if (!admissible(parsed.data)) {
          throw new DataStoreError(
            'invalid_event',
            `type plus contentVersion exceed ${MAX_EVENT_ENVELOPE_STRING_BYTES} bytes`,
          );
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
        // The server's per-event rules apply to both sources (`admissible`).
        if (parsed.success && admissible(parsed.data)) valid.push(parsed.data);
        else invalid += 1;
      }
      // One copy per id, by the folds' own preference (the server's clamped copy first).
      const incoming = sortEvents(valid);
      return db.transaction('rw', all, async () => {
        const before = await tombstoned();
        const existing = await db.events.bulkGet(incoming.map((e) => e.id));
        const result: IngestResult = { added: [], replaced: [], dropped: 0, invalid };
        const fresh: AnyEventEnvelope[] = [];
        const replaced: AnyEventEnvelope[] = [];
        const puts: StoredEvent[] = [];
        incoming.forEach((e, i) => {
          const child = childOf(e);
          if (child !== null && before.has(child)) return;
          const prev = existing[i];
          if (!prev) {
            puts.push({ ...e, synced: source === 'server' ? 1 : 0 });
            result.added.push(e.id);
            fresh.push(e);
            return;
          }
          const stored = toEnvelope(prev);
          // Another event under a stored id is not a copy of it: the stored event stays.
          if (!sameIdentity(stored, e)) return;
          const same = stableJson(stored) === stableJson(e);
          if (source === 'server') {
            // The server's copy is authoritative (08 §4 clamp): replace, and it is synced.
            if (!same) {
              result.replaced.push(e.id);
              replaced.push(e);
            }
            if (!same || prev.synced === 0 || prev._rejected) puts.push({ ...e, synced: 1 });
            return;
          }
          // A backup never overrides what the server confirmed; for a copy that never left this
          // device, the folds' preference decides.
          if (prev.synced === 0 && !same && sortEvents([stored, e])[0] === e) {
            const { _rejected } = prev;
            puts.push({ ...e, synced: 0, ...(_rejected ? { _rejected } : {}) });
            result.replaced.push(e.id);
            replaced.push(e);
          }
        });
        await db.events.bulkPut(puts);
        // The purge set comes from the durable log, so only tombstones actually stored count.
        const deleted = await tombstoned();
        const newlyDeleted = new Set([...deleted].filter((c) => !before.has(c)));
        const purged = await purge(newlyDeleted);
        // Every validated input copy for a deleted child counts as dropped (duplicates and copies
        // of stored events included). What leaves `added`, `replaced` and the cache update is
        // decided by the copy actually selected for each id: a discarded copy that shares an id
        // with a stored event never removes that event.
        const ofDeleted = (e: AnyEventEnvelope) => deleted.has(childOf(e) ?? '');
        result.dropped = valid.filter(ofDeleted).length;
        const lost = new Set(incoming.filter(ofDeleted).map((e) => e.id));
        result.added = result.added.filter((id) => !lost.has(id));
        result.replaced = result.replaced.filter((id) => !lost.has(id));
        await reconcile(
          fresh.filter((e) => !lost.has(e.id)),
          {
            rebuild: purged || replaced.length > 0,
            deleted,
            // Children named by replaced copies are discovered like those of new events.
            children: replaced.flatMap((e) => (e.childId === null ? [] : [e.childId])),
          },
        );
        return result;
      });
    },

    async events() {
      return sortEvents((await foldableLog()).map(toEnvelope));
    },

    async unsynced(limit = 500) {
      const rows = await db.events.where('synced').equals(0).toArray();
      return sortEvents(rows.filter((r) => !r._rejected && foldable(r)).map(toEnvelope)).slice(
        0,
        limit,
      );
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
      const [saved] = await store.putProfiles([profile]);
      return saved as ChildProfile;
    },

    async putProfiles(profiles, opts = {}) {
      const stamp = now();
      const valid = profiles.map((profile) => {
        const parsed = childProfileSchema.safeParse({ ...profile, updatedAt: stamp });
        if (!parsed.success) {
          throw new DataStoreError('invalid_profile', 'invalid child profile', parsed.error.issues);
        }
        return parsed.data;
      });
      return db.transaction('rw', all, async () => {
        if (opts.intoEmptyFamily && (await db.profiles.count()) > 0) {
          throw new DataStoreError('family_has_children', 'this family has children already');
        }
        const deleted = await tombstoned();
        for (const p of valid) {
          if (deleted.has(childKey(p.id))) {
            throw new DataStoreError('child_deleted', 'this child was deleted');
          }
        }
        await db.profiles.bulkPut(valid);
        await reconcile([], { deleted });
        return valid;
      });
    },

    async mergeProfiles(list, { source }) {
      const valid = list.flatMap((p) => {
        const parsed = childProfileSchema.safeParse(p);
        return parsed.success ? [parsed.data] : [];
      });
      return db.transaction('rw', all, async () => {
        const deleted = await tombstoned();
        let changed = 0;
        for (const p of valid) {
          if (deleted.has(childKey(p.id))) continue;
          if (lwwWins(p, await db.profiles.get(p.id), source)) {
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

    async mergeSettings(docs, { source }) {
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
          if (lwwWins(d, await db.settings.get(d.key), source)) {
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
      // Checked and written in one transaction, so a tombstone cannot slip in between.
      return db.transaction('rw', [db.events, db.aiLog], async () => {
        if (childId !== null && (await tombstoned()).has(childKey(childId))) {
          throw new DataStoreError('child_deleted', 'this child was deleted');
        }
        const row: AiLogRow = { id: newId(), ts: now(), childId, skillId, text };
        await db.aiLog.add(row);
        return row;
      });
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
