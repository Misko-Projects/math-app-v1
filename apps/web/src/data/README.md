# apps/web/src/data: the client data layer (D01)

All durable state lives in one Dexie 4 database (02 §4.4). Its tables:

| Table | Key | Holds |
|---|---|---|
| `events` | `id` | The family event log. Indexes: `[familyId+ts]`, `[childId+ts]`, `type`, `synced` (0/1). Rows have local fields too: `synced`, and `_rejected` (a permanent server refusal). |
| `projections` | `key` | The cache: `{ version, upToEventId, upToTs, data, dataHash }` |
| `profiles` | `id` | `ChildProfile` |
| `settings` | `key` | `SettingsDocument` (`family` or `child:<id>`), LWW per whole document |
| `device` | `'device'` | The ids this device uses, its token and `pairedAt` |
| `aiLog` | `id` | Every AI line shown. Kept 90 days. |
| `syncState` | `'sync'` | The cursor, `lastSyncAt` and `lastError` |

`createDb({ name, indexedDB, IDBKeyRange })` creates the database. Tests inject `fake-indexeddb`, and two names in one process act as two devices.

## The store

`createDataStore({ db, content, now?, newId?, timezone? })` opens the database and returns a `DataStore`. `content` is `{ contentVersion, gameData, graph }`, which the app shell loads from the precached `dist/*.json` (content JSON is never bundled, 02 §6). On open, the store:

1. creates the device singleton if it is missing, with a local `deviceId` and `familyId`, so the app works offline before setup;
2. calls `navigator.storage.persist()`, on first run only;
3. deletes AI lines older than 90 days;
4. deletes stored tombstones the server did not author, then purges whatever tombstoned children left behind;
5. rebuilds every stale cache row.

What each method does:

- **`append(type, payload, { childId })`** validates the event with the shared envelope schema, stamps it, stores it with `synced: 0`, updates the cache and notifies `onAppend` listeners. It refuses anything the server would refuse, and events for a deleted child:
  - `child.deleted`, because only the server creates tombstones;
  - a stored payload over 8 KB (08 §4), measured on the parsed event that is written;
  - a `type` plus `contentVersion` over 1,024 UTF-8 bytes (08 §3, `MAX_EVENT_ENVELOPE_STRING_BYTES`).
- **`ingest(events, { source })`** upserts events by id:
  - A `server` copy is authoritative. When it differs from the local copy (a clamp, 08 §4), it replaces it and is marked synced.
  - A `backup` copy replaces a local one only when that copy is unsynced and the engine's `sortEvents` prefers the backup's.
  - A copy never changes an event's identity. When its `type`, its `childId` (compared case-insensitively) or a tombstone's deleted child differs from the stored event, the stored event stays.
  - An entry counts as `invalid`, and is not stored, when it fails the schema, has a `type` plus `contentVersion` over 1,024 bytes, or is a `child.deleted` that fails `isValidTombstone`.
  - Every validated input copy for a deleted child counts as `dropped`, duplicates and copies of stored events included.
  - Events of unknown types are stored and relayed unchanged. Folds ignore them.
- **The push queue:** `unsynced(limit)` (oldest first, by ts then id; rejected events left out), `markSynced(ids)` and `markRejected(rejections, pushed?)`.
- **`adoptFamily({ familyId, deviceId, deviceToken })`** moves events and profiles to the ids the server assigned:
  - On a device that was never paired, the local family never existed on the server, so every event under it moves, synced or not.
  - On a device that was already paired, only never-synced events move.
  - A server-authored tombstone that moves also takes the new family id as its `deviceId`, because the server's pseudo-device is the family id (02 §5.9 S2).
  - Profiles that carry the local family id move too.
- **Profiles and settings:** `putProfile`, `putSettings` (both stamp `updatedAt`), `mergeProfiles(list, { source })` and `mergeSettings(docs, { source })` (LWW per whole document, never for a deleted child), `allProfiles` and `allSettings`. The server keeps its stored document unless the incoming `updatedAt` is strictly greater. So a `server` document wins on an equal `updatedAt`, while a `backup` document must be strictly newer. `familySettings`, `childSettings` and `settingsView` fill in defaults with `withSettingDefaults`.
- **Tombstones:** one rule, `isValidTombstone`, decides everywhere: the envelope passes the shared `child.deleted` schema, its `childId` is null, and its `deviceId` equals its `familyId` (02 §5.9 S2).
  - `ingest` refuses other tombstones, and `tombstoned()` ignores them.
  - Open deletes stored ones.
  - The log handed to the folds (rebuilds, `events()`, `unsynced()`) leaves them out, even one written while the store is open.

  Once a valid tombstone is stored in the log (after an ingest, or found on open), the store removes that child's events (synced or not), profile, settings document, AI lines and skills row. Ids are compared case-insensitively. The tombstone itself stays. From then on the store refuses `append`, `putProfile`, `putSettings` and `logAi` for that child.

## Projection cache (02 §4.3)

| Key | Data |
|---|---|
| `skills:<lower-case childId>` | `foldLearnerState(events, graph, { childId, isK })` (`isK` comes from the profile's grade) |
| `island`, `inventory`, `collection` | The engine folds |
| `goals` | `foldGoals(events, settings)`, with each child's effective `weeklyGoal` |

Rows are maintained for every live child that has a profile or events.

- **Version:** `p<PROJECTION_VERSION>|elo-fire-v1|<contentVersion>`. Skills rows add `|isK=0/1`, and the goals row adds the goal settings. A row whose stored version differs from the expected one is rebuilt from the full log, on open and after a profile or settings change. Bump `PROJECTION_VERSION` (`projections.ts`) whenever fold code changes.
- **Incremental update:** an event is applied to a row only when it sorts after the row's `upToEventId` (ts, then id: `compareEvents`). Anything else rebuilds that row. A skills row only looks at its own child's events.
- **Always a full rebuild:** a replaced event (a clamped server copy, or a preferred backup copy) and a tombstone purge. The children that replaced copies name are rediscovered for the cache.
- **Damaged rows:** every row the store writes carries `dataHash`, the FNV-1a 32 hash of its data's stable JSON. A row whose hash is missing, does not match, or cannot be computed (missing or cyclic data) is rebuilt from the log. Hashing never throws. Every row is checked on open, and a row is checked again before it takes new events. When the incremental step still throws on a row, that row is rebuilt from the log, and the write that triggered it still commits.
- The rebuild equals the incremental result, and the tests check it. Folds order by `ts`, never `clientTs`. Row data are plain objects and arrays, so they survive IndexedDB's structured clone.

## React

`hooks.ts` provides `<DataProvider store>` and the live hooks `useSkillStates(childId)`, `useIsland()`, `useInventory()`, `useCollection()`, `useGoals()`, `useProfiles()` and `useSettings()`, built on `useLiveQuery`. Each hook returns `undefined` while its first read is in flight.

## Backup (`backup.ts`)

One JSON file holds the events, settings and profiles (02 §4.4). Its format is the shared `BackupFile` / `backupFileSchema` (02 §5.9 F5): `{ format: 'number-island-backup', formatVersion: 1, exportedAt, familyId, events, settings, profiles }`. The server's `GET /export` and `POST /import` use the same format, so a file from either side can be restored on either side. One exception: `POST /import` accepts a request body of at most 64 MiB (`apps/api/src/routes/backup.ts`) and answers `413 payload_too_large` above it. A larger local file still restores on a device. Export leaves out only what the store does not treat as an event at all: a `child.deleted` row that fails the store's single tombstone rule (`isValidTombstone`). Such a row is removed on open, never folded and holds no family data, so one damaged row never blocks a backup.

- **`exportBackup(store)`** returns every event in the log as a wire envelope (ts, then id order), every settings document and every profile, all read in one Dexie read transaction, so the file is one consistent state. `familyId` is the device's family and `exportedAt` is the store's clock (`store.now()`, the injected `now`). Export applies the same normalization as import (below), so every file is self-consistent, even when some rows were recorded under an earlier family. No stored event is ever left out (a `child.deleted` row that fails the store's tombstone rule is not an event; see above): the file gets `POST /import`'s checks (`backupFileSchema`, then the 08 §3 cap of 1024 UTF-8 bytes for an event's `type` plus `contentVersion`). When a stored row fails them (for example a payload over the 8 KB cap from before `append` checked it), the export throws `BackupError('export_failed')`. `backupToJson(file)` serialises the file, and `backupFileName(file)` names it `number-island-backup-YYYY-MM-DD.json` (UTC), as `GET /export` does.
- **`importBackup(store, input)`** takes a JSON string or a parsed value. A file that fails `backupFileSchema` or the envelope cap, or that holds a tombstone that is not server-authored (`childId: null`, `deviceId` = the file's family id), throws a `BackupError` (`invalid_json`, `not_a_backup`, `unsupported_version`, `invalid_backup` or `invalid_tombstone`) with a readable message, and nothing is written. The import follows `POST /import` (08 §3, 02 §5.9 S2(a)):
  - every event and profile takes the device's family id, and tombstones take it as their `deviceId` (the server pseudo-device). This re-homes a file from another family;
  - like the server's `409`, the file is refused with `BackupError('conflict')` before any write when it holds two different events under one id (compared as canonical JSON), or an event whose id is already stored as a different event (another type, child, or deleted child, compared case-insensitively);
  - then `ingest(..., { source: 'backup' })`, `mergeProfiles(..., { source: 'backup' })` and `mergeSettings(..., { source: 'backup' })`. A file copy of a document wins only when it is strictly newer;
  - imported tombstones purge their children here, and the ids the log now holds as `child.deleted` are marked synced, because `/sync` refuses a device-pushed tombstone the server does not hold (`forbidden`). Only `POST /import` restores them on the server. Every other new event is queued for push.

  It all runs in one Dexie transaction, and each step is idempotent, so importing the same file twice changes nothing. It returns `{ events: { added, replaced, dropped, invalid }, profiles, settings, rehomed }`.
- **Browser helpers:** `downloadBackup(file)` saves the file through a Blob object URL and an anchor click, and `readBackupFile(file)` reads a picked file's text.

The UI belongs to the parent area (P01). So does wiring the server routes: offering `GET /export` as a download, and sending a file to `POST /import`.

## Later PRs

- **Sync client:** `POST /api/sync` loops over `unsynced()`, `markSynced`, `markRejected`, `ingest(..., { source: 'server' })` (including clamped copies), `mergeProfiles`, `mergeSettings` and `syncState`. It is triggered by `onAppend`, a timer and app lifecycle events, and is called after `/setup` or pairing via `adoptFamily`.
