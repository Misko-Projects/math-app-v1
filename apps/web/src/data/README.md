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

- **`append(type, payload, { childId })`** validates the event with the shared envelope schema, stamps it, stores it with `synced: 0`, updates the cache and notifies `onAppend` listeners. It refuses three things: `child.deleted` (only the server creates tombstones), a payload over the server's 8 KB cap (08 §4), and events for a deleted child.
- **`ingest(events, { source })`** upserts events by id:
  - A `server` copy is authoritative. When it differs from the local copy (a clamp, 08 §4), it replaces it and is marked synced.
  - A `backup` copy replaces a local one only when that copy is unsynced and the engine's `sortEvents` prefers the backup's.
  - A copy never changes an event's identity. When its `type`, its `childId` (compared case-insensitively) or a tombstone's deleted child differs from the stored event, the stored event stays.
  - A `child.deleted` is accepted only when the server authored it: envelope `childId: null` and `deviceId` equal to `familyId` (02 §5.9 S2). Any other tombstone counts as `invalid` and is not stored. When a batch's tombstone deletes a child, every copy of that child's events in the batch counts as `dropped`, including copies of events already stored.
  - Events of unknown types are stored and relayed unchanged. Folds ignore them.
- **The push queue:** `unsynced(limit)` (oldest first, by ts then id; rejected events left out), `markSynced(ids)` and `markRejected(rejections, pushed?)`.
- **`adoptFamily({ familyId, deviceId, deviceToken })`** moves events and profiles to the ids the server assigned:
  - On a device that was never paired, the local family never existed on the server, so every event under it moves, synced or not.
  - On a device that was already paired, only never-synced events move.
  - A server-authored tombstone that moves also takes the new family id as its `deviceId`, because the server's pseudo-device is the family id (02 §5.9 S2).
  - Profiles that carry the local family id move too.
- **Profiles and settings:** `putProfile`, `putSettings` (both stamp `updatedAt`), `mergeProfiles(list, { source })` and `mergeSettings(docs, { source })` (LWW per whole document, never for a deleted child), `allProfiles` and `allSettings`. The server keeps its stored document unless the incoming `updatedAt` is strictly greater. So a `server` document wins on an equal `updatedAt`, while a `backup` document must be strictly newer. `familySettings`, `childSettings` and `settingsView` fill in defaults with `withSettingDefaults`.
- **Tombstones:** a stored `child.deleted` counts only when the server authored it (`childId: null`, `deviceId` equal to `familyId`). Once one is stored in the log (after an ingest, or found on open), the store removes that child's events (synced or not), profile, settings document, AI lines and skills row. Ids are compared case-insensitively. The tombstone itself stays. From then on the store refuses `append`, `putProfile`, `putSettings` and `logAi` for that child.

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
- **Damaged rows:** every row the store writes carries `dataHash`, the FNV-1a 32 hash of its data's stable JSON. A row whose hash is missing or does not match is rebuilt from the log. Every row is checked on open, and a row is checked again before it takes new events. When the incremental step still throws on a row, that row is rebuilt from the log, and the write that triggered it still commits.
- The rebuild equals the incremental result, and the tests check it. Folds order by `ts`, never `clientTs`. Row data are plain objects and arrays, so they survive IndexedDB's structured clone.

## React

`hooks.ts` provides `<DataProvider store>` and the live hooks `useSkillStates(childId)`, `useIsland()`, `useInventory()`, `useCollection()`, `useGoals()`, `useProfiles()` and `useSettings()`, built on `useLiveQuery`. Each hook returns `undefined` while its first read is in flight.

## Later PRs

- **Sync client:** `POST /api/sync` loops over `unsynced()`, `markSynced`, `markRejected`, `ingest(..., { source: 'server' })` (including clamped copies), `mergeProfiles`, `mergeSettings` and `syncState`. It is triggered by `onAppend`, a timer and app lifecycle events, and is called after `/setup` or pairing via `adoptFamily`.
- **Backup:** export (`events()`, `allSettings()`, `allProfiles()`) and import (`ingest(..., { source: 'backup' })` plus the merges).
