import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';

// The API's committed migrations, applied once per file; every test starts from empty tables.
const bindings = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] };
await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);

beforeEach(async () => {
  const tables = await bindings.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'",
  ).all<{ name: string }>();
  await bindings.DB.batch(
    tables.results.map((t) => bindings.DB.prepare(`DELETE FROM "${t.name}"`)),
  );
});
