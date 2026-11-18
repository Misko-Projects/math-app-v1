# apps/web/src/data: the client data layer (D01)

All durable state lives in one Dexie 4 database (02 §4.4). Its tables:

| Table | Key | Holds |
|---|---|---|
| `events` | `id` | The family event log. Indexes: `[familyId+ts]`, `[childId+ts]`, `type`, `synced` (0/1). Rows have local fields too: `synced`, and `_rejected` (a permanent server refusal). |
| `projections` | `key` | The cache: `{ version, upToEventId, upToTs, data }` |
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
4. purges whatever tombstoned children left behind;
5. rebuilds every stale cache row.

What each method does:

- **`append(type, payload, { childId })`** validates the event with the shared envelope schema, stamps it, stores it with `synced: 0`, updates the cache and notifies `onAppend` listeners. It refuses two things: `child.deleted` (only the server creates tombstones) and events for a deleted child.
- **`ingest(events, { source })`** upserts events by id:
  - A `server` copy is authoritative. When it differs from the local copy (a clamp, 08 §4), it replaces it and is marked synced.
  - A `backup` copy replaces a local one only when the engine's `sortEvents` prefers it.
  - Events of unknown types are stored and relayed unchanged. Folds ignore them.
- **The push queue:** `unsynced(limit)` (oldest first, by ts then id; rejected events left out), `markSynced(ids)` and `markRejected(rejections, pushed?)`.
- **`adoptFamily({ familyId, deviceId, deviceToken })`** moves never-synced events, and profiles that carry the local family id, to the ids the server assigned.
- **Profiles and settings:** `putProfile`, `putSettings` (both stamp `updatedAt`), `mergeProfiles` and `mergeSettings` (LWW, never for a deleted child), `allProfiles` and `allSettings`. `familySettings`, `childSettings` and `settingsView` fill in defaults with `withSettingDefaults`.
- **Tombstones:** when a `child.deleted` is ingested, or is already in the log, the store removes that child's events (synced or not), profile, settings document, AI lines and skills row. Ids are compared case-insensitively. The tombstone itself stays.

## Projection cache (02 §4.3)

| Key | Data |
|---|---|
| `skills:<lower-case childId>` | `foldLearnerState(events, graph, { childId, isK })` (`isK` comes from the profile's grade) |
| `island`, `inventory`, `collection` | The engine folds |
| `goals` | `foldGoals(events, settings)`, with each child's effective `weeklyGoal` |

Rows are maintained for every live child that has a profile or events.

- **Version:** `p<PROJECTION_VERSION>|elo-fire-v1|<contentVersion>`. Skills rows add `|isK=0/1`, and the goals row adds the goal settings. A row whose stored version differs from the expected one is rebuilt from the full log, on open and after a profile or settings change. Bump `PROJECTION_VERSION` (`projections.ts`) whenever fold code changes.
- **Incremental update:** an event is applied to a row only when it sorts after the row's `upToEventId` (ts, then id: `compareEvents`). Anything else rebuilds that row. A skills row only looks at its own child's events.
- **Always a full rebuild:** a replaced event (a clamped server copy, or a preferred backup copy) and a tombstone purge.
- The rebuild equals the incremental result, and the tests check it. Folds order by `ts`, never `clientTs`. Row data are plain objects and arrays, so they survive IndexedDB's structured clone.

## React

`hooks.ts` provides `<DataProvider store>` and the live hooks `useSkillStates(childId)`, `useIsland()`, `useInventory()`, `useCollection()`, `useGoals()`, `useProfiles()` and `useSettings()`, built on `useLiveQuery`. Each hook returns `undefined` while its first read is in flight.

## Later PRs

- **Sync client:** `POST /api/sync` loops over `unsynced()`, `markSynced`, `markRejected`, `ingest(..., { source: 'server' })` (including clamped copies), `mergeProfiles`, `mergeSettings` and `syncState`. It is triggered by `onAppend`, a timer and app lifecycle events, and is called after `/setup` or pairing via `adoptFamily`.
- **Backup:** export (`events()`, `allSettings()`, `allProfiles()`) and import (`ingest(..., { source: 'backup' })` plus the merges).
