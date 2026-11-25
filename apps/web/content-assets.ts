// Serves the compiled content (`packages/content/dist/*.json`) as static assets (02 §6: content
// JSON is fetched at startup, never bundled into JS).
//
// - `pnpm dev`: builds the content once when `dist/` is missing or incomplete (a fresh clone), serves the files
//   under `/content/`, and rebuilds plus reloads the page when a content source changes.
// - `vite build`: emits each file content-hashed (`content/<name>.<hash>.json`) plus
//   `content/index.json`, which maps file names to their hashed URLs. The service worker precaches
//   all of them (02 §1).
//
// The app reads `/content/index.json` first (see src/app/boot/content.ts).

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const REPO_ROOT = resolve(HERE, '../..');
export const CONTENT_ROOT = join(REPO_ROOT, 'packages/content');
export const CONTENT_DIST = join(CONTENT_ROOT, 'dist');

/** The public URL prefix of the content files. */
export const CONTENT_BASE = '/content/';
export const CONTENT_INDEX_PATH = `${CONTENT_BASE}index.json`;

/** `content/index.json`: what the app fetches first. */
export interface ContentIndexFile {
  contentVersion: string;
  /** Dist file name (e.g. `game.json`) → URL. */
  files: Record<string, string>;
}

/** The compiled files the app may fetch (everything in `dist/` except the build manifest). */
export function listContentFiles(dist: string = CONTENT_DIST): string[] {
  if (!existsSync(dist)) return [];
  return readdirSync(dist)
    .filter((n) => n.endsWith('.json') && n !== 'manifest.json')
    .sort();
}

export function readContentVersion(dist: string = CONTENT_DIST): string {
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')) as {
    contentVersion?: unknown;
  };
  if (typeof manifest.contentVersion !== 'string' || manifest.contentVersion === '') {
    throw new Error(`content-assets: ${join(dist, 'manifest.json')} has no contentVersion`);
  }
  return manifest.contentVersion;
}

/** `pnpm content:build`: the compiled files and `template-stats.json`, written together. */
const CONTENT_BUILD = ['run', 'content:build'];

/** `pnpm content:build`, synchronously (used when `dist/` is missing or incomplete). */
function buildContentSync(): void {
  const res = spawnSync('pnpm', CONTENT_BUILD, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    throw new Error('content-assets: `pnpm content:build` failed; fix the content errors above');
  }
}

function ensureContentBuilt(): void {
  // Both files: a `dist/` left by an older checkout has a manifest and no stats.
  const built = ['manifest.json', 'template-stats.json'].every((n) =>
    existsSync(join(CONTENT_DIST, n)),
  );
  if (!built) buildContentSync();
}

const hash8 = (source: string): string =>
  createHash('sha256').update(source).digest('hex').slice(0, 8);

const isContentSource = (file: string): boolean => {
  const rel = relative(CONTENT_ROOT, file);
  if (rel.startsWith('..') || rel.split(sep)[0] === 'dist') return false;
  return /\.(ya?ml|txt)$/.test(file);
};

export function contentAssets(): Plugin {
  return {
    name: 'number-island:content-assets',

    buildStart() {
      ensureContentBuilt();
    },

    configureServer(server) {
      ensureContentBuilt();

      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (!url.startsWith(CONTENT_BASE)) return next();
        const name = url.slice(CONTENT_BASE.length);
        let body: string;
        try {
          if (name === 'index.json') {
            const index: ContentIndexFile = {
              contentVersion: readContentVersion(),
              files: Object.fromEntries(
                listContentFiles().map((f) => [f, `${CONTENT_BASE}${f}`] as const),
              ),
            };
            body = JSON.stringify(index);
          } else if (listContentFiles().includes(name)) {
            body = readFileSync(join(CONTENT_DIST, name), 'utf8');
          } else {
            res.statusCode = 404;
            res.end();
            return;
          }
        } catch (e) {
          next(e);
          return;
        }
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(body);
      });

      // Rebuild on source changes, then reload: content is read once at app start.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running = false;
      let again = false;
      const rebuild = () => {
        if (running) {
          again = true;
          return;
        }
        running = true;
        const child = spawn('pnpm', CONTENT_BUILD, {
          cwd: REPO_ROOT,
          stdio: 'inherit',
        });
        child.on('exit', (code) => {
          running = false;
          if (code === 0) server.ws.send({ type: 'full-reload' });
          if (again) {
            again = false;
            rebuild();
          }
        });
      };
      server.watcher.add(CONTENT_ROOT);
      server.watcher.on('all', (_event, file) => {
        if (!isContentSource(file)) return;
        clearTimeout(timer);
        timer = setTimeout(rebuild, 200);
      });
    },

    generateBundle() {
      const files: Record<string, string> = {};
      for (const name of listContentFiles()) {
        const source = readFileSync(join(CONTENT_DIST, name), 'utf8');
        const fileName = `content/${name.replace(/\.json$/, '')}.${hash8(source)}.json`;
        this.emitFile({ type: 'asset', fileName, source });
        files[name] = `/${fileName}`;
      }
      const index: ContentIndexFile = { contentVersion: readContentVersion(), files };
      this.emitFile({
        type: 'asset',
        fileName: 'content/index.json',
        source: JSON.stringify(index),
      });
    },
  };
}
