import type { SQL } from 'drizzle-orm';
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

export type Db = DrizzleD1Database<typeof schema> & { $client: D1Database };

export function createDb(d1: D1Database): Db {
  return drizzle(d1, { schema });
}

const dialect = new SQLiteAsyncDialect();

/**
 * Runs raw `sql` statements as one D1 batch (a single transaction, in order). Drizzle's own
 * `batch()` accepts only query builders, and the upserts and `json_each` inserts here are raw SQL.
 */
export async function batchSql(db: Db, queries: SQL[]): Promise<D1Result[]> {
  if (queries.length === 0) return [];
  const d1 = db.$client;
  return d1.batch(
    queries.map((q) => {
      const { sql, params } = dialect.sqlToQuery(q);
      return d1.prepare(sql).bind(...params);
    }),
  );
}
