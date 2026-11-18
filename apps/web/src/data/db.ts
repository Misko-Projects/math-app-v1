// 02 §4.4 Dexie schema: the family event log, the projection cache, profiles, settings documents,
// the device singleton, the local AI line log and the sync cursor. Row types are web-internal; the
// envelope, profile and settings types they wrap live in packages/shared.

import type {
  AnyEventEnvelope,
  ApiErrorCode,
  ChildId,
  ChildProfile,
  DeviceId,
  EventId,
  FamilyId,
  SettingsDocument,
  SkillId,
} from '@number-island/shared';
import Dexie, { type EntityTable } from 'dexie';

/** A stored event: the envelope as received or appended, plus local bookkeeping. */
export type StoredEvent = AnyEventEnvelope & {
  /** 1 once the server holds it (pushed and accepted, or pulled). IndexedDB keys cannot be booleans. */
  synced: 0 | 1;
  /** Set when the server refused the event permanently (02 §5.9 S1): it is never pushed again. */
  _rejected?: { code: ApiErrorCode; message: string };
};

/** 02 §4.3 cache row. `upToTs` mirrors the ts of `upToEventId`, so ordering needs no lookup. */
export interface ProjectionRow {
  key: string; // "skills:<childId>" | "island" | "inventory" | "collection" | "goals"
  version: string;
  upToEventId: EventId | null;
  upToTs: number | null;
  data: unknown;
}

export interface DeviceRecord {
  key: 'device';
  deviceId: DeviceId;
  familyId: FamilyId;
  deviceToken?: string;
  /** When `adoptFamily` stored the server's ids; null while the device is local-only. */
  pairedAt: number | null;
  createdAt: number;
}

export interface AiLogRow {
  id: string;
  ts: number;
  childId: ChildId | null;
  skillId: SkillId | null;
  text: string;
}

export interface SyncStateRow {
  key: 'sync';
  cursor: string | null;
  lastSyncAt: number | null;
  lastError: string | null;
}

export type NumberIslandDb = Dexie & {
  events: EntityTable<StoredEvent, 'id'>;
  projections: EntityTable<ProjectionRow, 'key'>;
  profiles: EntityTable<ChildProfile, 'id'>;
  settings: EntityTable<SettingsDocument, 'key'>;
  device: EntityTable<DeviceRecord, 'key'>;
  aiLog: EntityTable<AiLogRow, 'id'>;
  syncState: EntityTable<SyncStateRow, 'key'>;
};

export const DEFAULT_DB_NAME = 'number-island';

export interface OpenDbOptions {
  /** Database name; tests and simulated second devices use their own. */
  name?: string;
  /** Injected IndexedDB implementation (fake-indexeddb in tests); defaults to the browser's. */
  indexedDB?: { open: IDBFactory['open'] };
  IDBKeyRange?: typeof IDBKeyRange;
}

/** Creates (does not open) the Dexie database. Dexie opens it on first use. */
export function createDb(opts: OpenDbOptions = {}): NumberIslandDb {
  const db = new Dexie(opts.name ?? DEFAULT_DB_NAME, {
    ...(opts.indexedDB ? { indexedDB: opts.indexedDB } : {}),
    ...(opts.IDBKeyRange ? { IDBKeyRange: opts.IDBKeyRange } : {}),
  }) as NumberIslandDb;
  db.version(1).stores({
    events: 'id, [familyId+ts], [childId+ts], type, synced',
    projections: 'key',
    profiles: 'id',
    settings: 'key',
    device: 'key',
    aiLog: 'id, ts',
    syncState: 'key',
  });
  return db;
}

/** The wire envelope of a stored event (the row's local fields removed). */
export function toEnvelope(row: StoredEvent): AnyEventEnvelope {
  const { synced: _synced, _rejected, ...envelope } = row;
  return envelope as AnyEventEnvelope;
}
