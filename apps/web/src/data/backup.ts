// Local backup (02 §4.4): one JSON file with the event log, settings documents and profiles, in
// the shared `BackupFile` format (02 §5.9 F5), the same file the server's GET /export and
// POST /import use. Import follows the server's rules (08 §3, 02 §5.9 S2(a)): a file from another
// family is re-homed, tombstones must be server-authored, and importing twice changes nothing.

import {
  type AnyEventEnvelope,
  BACKUP_FORMAT,
  type BackupFile,
  backupFileSchema,
  type ChildProfile,
  type EventId,
} from '@number-island/shared';
import { stableJson } from './projections';
import {
  type DataStore,
  envelopeStringBytes,
  isValidTombstone,
  MAX_EVENT_ENVELOPE_STRING_BYTES,
} from './store';

export type BackupErrorCode =
  | 'invalid_json'
  | 'not_a_backup'
  | 'unsupported_version'
  | 'invalid_backup'
  | 'invalid_tombstone'
  | 'conflict'
  | 'export_failed';

/**
 * A backup that cannot be made (`export_failed`) or imported (every other code). An import throws
 * it before anything is written.
 */
export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

export interface ImportResult {
  /** Counts from `ingest(..., { source: 'backup' })`. */
  events: { added: number; replaced: number; dropped: number; invalid: number };
  /** Profiles and settings documents the file changed (strictly newer than the local copy). */
  profiles: number;
  settings: number;
  /** True when the file came from another family id and was moved to this device's family. */
  rehomed: boolean;
}

const canon = (id: string) => id.toLowerCase();

/** The first schema issue as `path: message`, for a parent-readable error. */
function firstIssue(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  const first = issues[0];
  const where = first && first.path.length > 0 ? `${first.path.map(String).join('.')}: ` : '';
  return `${where}${first?.message ?? 'invalid'}`;
}

/** POST /import's checks on a file: `backupFileSchema`, then the per-event envelope cap (08 §3). */
function checkFile(
  raw: unknown,
): { file: BackupFile; problem?: never } | { problem: string; issues?: unknown } {
  const parsed = backupFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { problem: firstIssue(parsed.error.issues), issues: parsed.error.issues };
  }
  const big = parsed.data.events.find(
    (e) => envelopeStringBytes(e) > MAX_EVENT_ENVELOPE_STRING_BYTES,
  );
  if (big) {
    return {
      problem: `event ${big.id}: type and contentVersion exceed ${MAX_EVENT_ENVELOPE_STRING_BYTES} bytes`,
    };
  }
  return { file: parsed.data };
}

/**
 * The normalization POST /import applies (02 §5.9 S2(a)), shared by export and import: every
 * event and profile takes `familyId`, and every tombstone takes it as `deviceId` (the server
 * pseudo-device). Export applies it too, so every file is self-consistent whatever families the
 * local rows were recorded under.
 */
function normalize(
  file: Pick<BackupFile, 'events' | 'profiles'>,
  familyId: string,
): Pick<BackupFile, 'events' | 'profiles'> {
  return {
    events: file.events.map(
      (e): AnyEventEnvelope =>
        ({
          ...e,
          familyId,
          deviceId: e.type === 'child.deleted' ? familyId : e.deviceId,
        }) as AnyEventEnvelope,
    ),
    profiles: file.profiles.map((p): ChildProfile => ({ ...p, familyId })),
  };
}

/**
 * The whole local family as a backup file: every event in the log as its wire envelope (ts, then
 * id order), every settings document and every profile, read in one transaction so the file is
 * one consistent state, and normalized to the device's family. `exportedAt` is the store's clock.
 *
 * Nothing is ever left out: when the file would fail POST /import's checks (a damaged row, or an
 * event over the 8 KB or envelope caps that predates the store's own checks), the export throws
 * `BackupError('export_failed')` instead of writing a file no import would accept.
 */
export async function exportBackup(store: DataStore): Promise<BackupFile> {
  await store.device(); // creates the device singleton if it is missing (a write, so outside)
  const db = store.db;
  const file = await db.transaction(
    'r',
    [db.device, db.events, db.settings, db.profiles],
    async (): Promise<BackupFile> => {
      const device = await db.device.get('device');
      if (!device) throw new BackupError('export_failed', 'This device has no family yet.');
      const rows = {
        events: await store.events(),
        // The picture password is a device-local lock (08 §3): a backup file never carries its
        // hash (a restore keeps the restoring device's own anyway).
        profiles: (await store.allProfiles()).map((p) => ({ ...p, picturePasswordHash: null })),
      };
      return {
        format: BACKUP_FORMAT,
        formatVersion: 1,
        exportedAt: store.now(),
        familyId: device.familyId,
        ...normalize(rows, device.familyId),
        settings: await store.allSettings(),
      };
    },
  );
  const checked = checkFile(file);
  if (checked.problem !== undefined) {
    throw new BackupError(
      'export_failed',
      `The backup could not be made because some saved data is damaged (${checked.problem}).`,
      checked.issues,
    );
  }
  return file;
}

export function backupToJson(file: BackupFile): string {
  return JSON.stringify(file);
}

/** `number-island-backup-YYYY-MM-DD.json` (UTC date of `exportedAt`), as GET /export names it. */
export function backupFileName(file: Pick<BackupFile, 'exportedAt'>): string {
  return `number-island-backup-${new Date(file.exportedAt).toISOString().slice(0, 10)}.json`;
}

/** Parses a backup (a JSON string or an already parsed value). Throws `BackupError`. */
export function parseBackup(input: unknown): BackupFile {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new BackupError('invalid_json', 'The backup file is not valid JSON.');
    }
  }
  const head = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  if (head?.format !== BACKUP_FORMAT) {
    throw new BackupError('not_a_backup', 'This file is not a Number Island backup.');
  }
  if (head.formatVersion !== 1) {
    throw new BackupError(
      'unsupported_version',
      `This backup uses format version ${String(head.formatVersion)}, which this app cannot read.`,
    );
  }
  const checked = checkFile(raw);
  if (checked.problem !== undefined) {
    throw new BackupError(
      'invalid_backup',
      `The backup file is damaged (${checked.problem}).`,
      checked.issues,
    );
  }
  const { file } = checked;
  // 02 §5.9 S2 / 08 §3: a tombstone in a backup must be server-authored, i.e. pass the store's one
  // tombstone rule with the file's family id (POST /import's test). Checked before re-homing,
  // which would otherwise make any forged tombstone look like the server's.
  for (const e of file.events) {
    if (e.type === 'child.deleted' && !isValidTombstone({ ...e, familyId: file.familyId })) {
      throw new BackupError(
        'invalid_tombstone',
        `The backup file is damaged (event ${e.id} is not a server-authored child deletion).`,
      );
    }
  }
  return file;
}

/** What makes an event that event: its type, its child and, for a tombstone, the deleted child. */
function identity(e: Pick<AnyEventEnvelope, 'type' | 'childId' | 'payload'>): string {
  const deleted =
    e.type === 'child.deleted' ? (e.payload as { childId?: unknown }).childId : undefined;
  return stableJson([
    e.type,
    e.childId === null ? null : canon(e.childId),
    typeof deleted === 'string' ? canon(deleted) : null,
  ]);
}

/**
 * Restores a backup into this device, all or nothing (one Dexie transaction), idempotently:
 * events merge by id (`ingest`, source `backup`), settings and profiles by LWW (a file copy wins
 * only when strictly newer), so importing the same file again changes nothing.
 *
 * Like POST /import, every event and profile takes this device's family id, and tombstones take
 * the family id as `deviceId` (the server pseudo-device, 02 §5.9 S2). Also like POST /import's
 * `409`, a file is refused (`conflict`) before any write when it holds two different events under
 * one id, or an event whose id is already stored as another event (another type, child, or
 * deleted child). Imported tombstones purge their children here and are marked synced: the server
 * refuses a device-pushed tombstone it does not hold (`forbidden`), so restoring them on the
 * server is POST /import's job. Every other new event is queued for push.
 */
export async function importBackup(store: DataStore, input: unknown): Promise<ImportResult> {
  const file = parseBackup(input);
  const db = store.db;
  return db.transaction('rw', db.tables, async () => {
    const { familyId } = await store.device();
    const { events, profiles } = normalize(file, familyId);
    const seen = new Map<string, string>();
    for (const e of events) {
      const json = stableJson(e);
      const prior = seen.get(e.id);
      if (prior !== undefined && prior !== json) {
        throw new BackupError(
          'conflict',
          `The backup file is damaged (it holds two different events with the id ${e.id}).`,
        );
      }
      seen.set(e.id, json);
    }
    const stored = await db.events.bulkGet(events.map((e) => e.id));
    events.forEach((e, i) => {
      const held = stored[i];
      if (held && identity(held) !== identity(e)) {
        throw new BackupError(
          'conflict',
          `This backup cannot be restored here: event ${e.id} is already saved as a different event.`,
        );
      }
    });
    const ingested = await store.ingest(events, { source: 'backup' });
    // Only ids the log now holds as tombstones; never another event that happens to share one.
    const tombstoneIds = events.filter((e) => e.type === 'child.deleted').map((e) => e.id);
    const rows = await db.events.bulkGet(tombstoneIds);
    const tombstones: EventId[] = rows.flatMap((r) =>
      r?.type === 'child.deleted' && isValidTombstone(r) ? [r.id] : [],
    );
    await store.markSynced(tombstones);
    const changedProfiles = await store.mergeProfiles(profiles, { source: 'backup' });
    const changedSettings = await store.mergeSettings(file.settings, { source: 'backup' });
    return {
      events: {
        added: ingested.added.length,
        replaced: ingested.replaced.length,
        dropped: ingested.dropped,
        invalid: ingested.invalid,
      },
      profiles: changedProfiles,
      settings: changedSettings,
      rehomed: canon(file.familyId) !== canon(familyId),
    };
  });
}

/** Saves the file through an object-URL download (the browser's save dialog or Downloads). */
export function downloadBackup(file: BackupFile, doc: Document = document): void {
  const blob = new Blob([backupToJson(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = backupFileName(file);
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Revoked after the click has been dispatched; some browsers read the URL asynchronously.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** The text of a file the parent picked (`<input type="file">`), for `importBackup`. */
export function readBackupFile(file: Blob): Promise<string> {
  return file.text();
}
