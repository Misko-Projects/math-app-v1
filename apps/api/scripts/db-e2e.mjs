#!/usr/bin/env node
// `pnpm --filter @number-island/api preview:e2e` runs this first: a fresh, migrated local D1
// database for one E2E run, kept apart from the `pnpm dev` / `pnpm preview:full` database
// (apps/api/.wrangler/state). Golden journey 1 creates a family with `POST /setup`, which works
// only while no family exists (08 §2), so every run starts empty and never touches dev data.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { API_DIR, wrangler } from './db-local.mjs';

export const E2E_PERSIST_DIR = join(API_DIR, '.wrangler', 'e2e');

rmSync(E2E_PERSIST_DIR, { recursive: true, force: true });
wrangler([
  'd1',
  'migrations',
  'apply',
  'DB',
  '--local',
  '--env',
  'preview',
  '--persist-to',
  E2E_PERSIST_DIR,
]);
console.log('db-e2e: fresh local database for the E2E run is ready.');
