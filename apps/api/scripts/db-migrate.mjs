#!/usr/bin/env node
// `pnpm --filter @number-island/api db:migrate [--env preview]`: apply pending D1 migrations to
// the local database. `pnpm dev` and `pnpm preview:full` run this first, so an empty local D1 is
// migrated automatically and an up-to-date one is left alone (wrangler tracks applied migrations).
import { envArgs, migrateLocal } from './db-local.mjs';

migrateLocal(envArgs());
