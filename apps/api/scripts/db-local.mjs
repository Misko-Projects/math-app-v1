// Shared helpers for the local D1 scripts (db-migrate, db-reset, db-seed). Local only: every
// wrangler call passes `--local`, so these never touch a remote database.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Where `wrangler dev` keeps local D1 state (Miniflare's default persist path). */
export const LOCAL_D1_DIR = join(API_DIR, '.wrangler', 'state', 'v3', 'd1');

/** `--env preview` and similar flags passed to the script are forwarded to wrangler. */
export function envArgs(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--env');
  return i >= 0 && argv[i + 1] ? ['--env', argv[i + 1]] : [];
}

/**
 * Runs `wrangler <args>` in apps/api. Non-interactive (stdin ignored, CI=1) so the migration
 * confirmation prompt never blocks `pnpm dev`; output is passed through.
 */
export function wrangler(args, { capture = false } = {}) {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: API_DIR,
    env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`wrangler ${args.join(' ')} failed (exit ${result.status ?? result.signal}).`);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? '';
}

/** Applies every pending migration in src/db/migrations to the local D1 database. */
export function migrateLocal(extra = []) {
  wrangler(['d1', 'migrations', 'apply', 'DB', '--local', ...extra]);
}
