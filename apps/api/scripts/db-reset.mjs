#!/usr/bin/env node
// `pnpm db:reset`: delete the local D1 database (apps/api/.wrangler/state/v3/d1) and migrate a
// fresh one. Local development only: the island, its devices and all progress are erased.
// Stop `pnpm dev` first. Follow with `pnpm db:seed` for demo data.
import { existsSync, rmSync } from 'node:fs';
import { envArgs, LOCAL_D1_DIR, migrateLocal } from './db-local.mjs';

if (existsSync(LOCAL_D1_DIR)) {
  rmSync(LOCAL_D1_DIR, { recursive: true, force: true });
  console.log('db:reset: deleted the local D1 database.');
} else {
  console.log('db:reset: no local D1 database yet.');
}
migrateLocal(envArgs());
console.log('db:reset: fresh local database ready. Run `pnpm db:seed` for demo data.');
