import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';
import { TABLE_NAMES } from '../src/db/schema';

// Apply the committed migrations once per test file (idempotent), then start every test from
// empty tables so tests never depend on each other's data.
const migrations = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;
await applyD1Migrations(env.DB, migrations);

beforeEach(async () => {
  await env.DB.batch(TABLE_NAMES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});
