#!/usr/bin/env node
// pnpm test:sim (04 §8): runs the simulated-learner harness (test/sim/**/*.sim.test.ts) with its
// own Vitest config from packages/engine and propagates Vitest's exit code.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The workspace's own vitest, run with this Node (no shell, works on every platform).
const pkgPath = createRequire(join(root, 'package.json')).resolve('vitest/package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const bin = join(dirname(pkgPath), typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vitest);

const child = spawn(
  process.execPath,
  [bin, 'run', '-c', 'vitest.sim.config.ts', ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit' },
);
child.on('error', (err) => {
  console.error(`pnpm test:sim: could not start vitest: ${err.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
