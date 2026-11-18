#!/usr/bin/env node
// `pnpm db:seed`: put a demo family into the local D1 database (migrating it first). Refuses to
// touch an island that is already set up; run `pnpm db:reset` first to start over.
// Run by Node 24 directly (type stripping), so it imports the Worker's own hashing and seed data.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSeed, SEED_PASSPHRASE, SEED_PIN } from '../src/db/seed.ts';
import { clampIterations, hashSecret } from '../src/lib/crypto.ts';
import { API_DIR, envArgs, migrateLocal, wrangler } from './db-local.mjs';

const env = envArgs();
migrateLocal(env);

const countJson = wrangler(
  [
    'd1',
    'execute',
    'DB',
    '--local',
    ...env,
    '--json',
    '--command',
    'SELECT COUNT(*) AS n FROM families',
  ],
  { capture: true },
);
const families = JSON.parse(countJson)[0]?.results?.[0]?.n ?? 0;
if (families > 0) {
  console.error('db:seed: this island is already set up. Run `pnpm db:reset` first to start over.');
  process.exit(1);
}

// The same default as wrangler.jsonc `PBKDF2_ITERATIONS`.
const iterations = clampIterations(process.env.PBKDF2_ITERATIONS ?? '100000');
const seed = await buildSeed({ now: Date.now(), hash: (s) => hashSecret(s, iterations) });
const file = join(API_DIR, '.wrangler', 'seed.sql');
writeFileSync(file, `${seed.statements.join('\n')}\n`);
wrangler(['d1', 'execute', 'DB', '--local', ...env, '--file', file]);

console.log('db:seed: created "The Dev Family" with two children (Mia, K; Leo, grade 2).');
console.log(`db:seed: parent passphrase "${SEED_PASSPHRASE}", PIN ${SEED_PIN} (local dev only).`);
console.log('db:seed: sign in to the parent area, then pair this browser as a device.');
