#!/usr/bin/env node
// pnpm visual:update (09 §2): regenerate Storybook visual baselines inside the pinned Playwright
// Docker image, so baselines never depend on the host OS or fonts.
// The repo is copied into the container (without node_modules), and only e2e/visual/__screenshots__
// is written back to the host.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE = 'mcr.microsoft.com/playwright:v1.65.1-noble';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'e2e', 'visual', '__screenshots__');
mkdirSync(out, { recursive: true });

const inner = [
  'set -euo pipefail',
  'mkdir -p /work',
  "tar -C /src --exclude=./node_modules --exclude='*/node_modules' --exclude=./.git -cf - . | tar -C /work -xf -",
  'cd /work',
  'corepack enable',
  'COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm i --frozen-lockfile',
  'CI=1 pnpm visual --update-snapshots',
  'rm -rf /out/* && cp -r e2e/visual/__screenshots__/. /out/',
].join(' && ');

const result = spawnSync(
  'docker',
  ['run', '--rm', '-v', `${root}:/src:ro`, '-v', `${out}:/out`, IMAGE, 'bash', '-c', inner],
  { stdio: 'inherit' },
);
if (result.error) {
  console.error(`visual:update needs Docker (${result.error.message}).`);
  process.exit(1);
}
process.exit(result.status ?? 1);
