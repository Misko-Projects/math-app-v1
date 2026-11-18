// D1 schema (08 §5), declared with Drizzle. `pnpm --filter @number-island/api db:generate` turns a
// change here into a new SQL migration in ./migrations; never edit an applied migration.
// All timestamps are ms epoch integers. Booleans are 0/1 integers.

import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const families = sqliteTable('families', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  setupComplete: integer('setup_complete', { mode: 'boolean' }).notNull().default(false),
});

export const parentCredentials = sqliteTable('parent_credentials', {
  familyId: text('family_id').primaryKey(),
  passphraseHash: text('passphrase_hash').notNull(),
  pinHash: text('pin_hash').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** `id_hash` is SHA-256 of the cookie value; the raw session id is never stored. */
export const parentSessions = sqliteTable(
  'parent_sessions',
  {
    idHash: text('id_hash').primaryKey(),
    familyId: text('family_id').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('parent_sessions_expires').on(t.expiresAt)],
);

/** `token_hash` is SHA-256 of the 32-byte device token (08 §3). */
export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: integer('created_at').notNull(),
    lastSeenAt: integer('last_seen_at'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('devices_family').on(t.familyId)],
);

/** `code_hash` is SHA-256 of the 6-digit code. Codes are single-use, ≤ 5 tries, 10 min (08 §2). */
export const pairCodes = sqliteTable('pair_codes', {
  codeHash: text('code_hash').primaryKey(),
  familyId: text('family_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
});

/**
 * The family event log (02 §4, 08 §4). `seq` is the sync cursor; `id` makes pushes idempotent.
 * `ts` is the (possibly clamped) event time; `client_ts` keeps the device's original time when the
 * server clamped it. `payload_json` is stored exactly as relayed: stripped for known types, verbatim
 * for unknown types.
 */
export const events = sqliteTable(
  'events',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    id: text('id').notNull().unique(),
    familyId: text('family_id').notNull(),
    childId: text('child_id'),
    deviceId: text('device_id').notNull(),
    ts: integer('ts').notNull(),
    clientTs: integer('client_ts'),
    type: text('type').notNull(),
    payloadJson: text('payload_json').notNull(),
    contentVersion: text('content_version').notNull(),
    receivedAt: integer('received_at').notNull(),
  },
  (t) => [
    index('events_family_seq').on(t.familyId, t.seq),
    index('events_family_child_ts').on(t.familyId, t.childId, t.ts),
  ],
);

/** Settings documents, LWW per whole document by `updated_at` (02 §5.8, 08 §4). */
export const settings = sqliteTable(
  'settings',
  {
    familyId: text('family_id').notNull(),
    key: text('key').notNull(),
    valueJson: text('value_json').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.key] })],
);

/**
 * Child profiles, LWW by `updated_at`. A deleted child (DELETE /children/:id) keeps a purged row:
 * `data_json` NULL and `deleted_at` set, so stale devices cannot resurrect it.
 */
export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    dataJson: text('data_json'),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [index('profiles_family').on(t.familyId)],
);

/** Per-day AI usage and cost accounting (07 §1, §7). Used by AI1. */
export const aiUsage = sqliteTable(
  'ai_usage',
  {
    familyId: text('family_id').notNull(),
    day: text('day').notNull(),
    feature: text('feature').notNull(),
    calls: integer('calls').notNull().default(0),
    inputUnits: integer('input_units').notNull().default(0),
    outputUnits: integer('output_units').notNull().default(0),
    estCostMicros: integer('est_cost_micros').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.day, t.feature] })],
);

/** Text-only AI result cache (07 §2); entries older than 30 days are deleted (08 §8). Used by AI1. */
export const aiCache = sqliteTable(
  'ai_cache',
  {
    keyHash: text('key_hash').primaryKey(),
    feature: text('feature').notNull(),
    valueJson: text('value_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('ai_cache_created').on(t.createdAt)],
);

/**
 * Fixed-window rate limits (08 §2, §3): login per IP, PIN per device, pairing per IP. `key` is a
 * SHA-256 hash, so client IPs are never stored.
 */
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    bucket: text('bucket').notNull(),
    key: text('key').notNull(),
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.key] })],
);

/** Every table, for the local reset script and test isolation. */
export const TABLE_NAMES = [
  'families',
  'parent_credentials',
  'parent_sessions',
  'devices',
  'pair_codes',
  'events',
  'settings',
  'profiles',
  'ai_usage',
  'ai_cache',
  'rate_limits',
] as const;
