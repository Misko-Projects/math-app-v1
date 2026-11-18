import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentFiles } from './compile/load';

/** `packages/content`, the root of the YAML sources. */
export const CONTENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DIST_DIR = join(CONTENT_ROOT, 'dist');

/** Directories under the content root that hold sources (03 §4.1). Everything else is ignored. */
const SOURCE_DIRS = [
  'skills',
  'templates',
  'lessons',
  'misconceptions',
  'narration',
  'game',
  'standards',
];
const SOURCE_ROOT_FILES = ['contexts.yaml', 'graph.yaml', 'outlines.yaml', 'retired.yaml'];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
}

/** Reads every content source under `root` into memory (posix relative paths, sorted). */
export function readContentFiles(root: string = CONTENT_ROOT): Record<string, string> {
  const files: Record<string, string> = {};
  const paths: string[] = [];
  for (const d of SOURCE_DIRS) {
    try {
      walk(join(root, d), paths);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  for (const f of SOURCE_ROOT_FILES) {
    try {
      statSync(join(root, f));
      paths.push(join(root, f));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  for (const p of paths.sort()) {
    if (!/\.(ya?ml|txt)$/.test(p)) continue;
    files[relative(root, p).split(sep).join('/')] = readFileSync(p, 'utf8');
  }
  return files;
}

/** Replaces `dist/` with exactly `outputs` (no stale files survive). */
export function writeDist(outputs: Readonly<Record<string, string>>, dir: string = DIST_DIR): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(outputs)) writeFileSync(join(dir, name), text, 'utf8');
}

/** The current `dist/` contents, or null when it has not been built. */
export function readDist(dir: string = DIST_DIR): Record<string, string> | null {
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  return Object.fromEntries(names.map((n) => [n, readFileSync(join(dir, n), 'utf8')]));
}

export type { ContentFiles };
