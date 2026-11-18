#!/usr/bin/env node
// Minimal static file server for built artifacts (the Storybook build used by `pnpm visual`).
// Usage: node scripts/serve-static.mjs <dir> <port>
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

/** True when `child` is `parent` itself or lies inside it (path-aware, not a string prefix). */
export function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * Resolve a request path to a real file inside `root`, or null. Containment is checked on the
 * canonical (symlink-resolved) path, so neither `..`, a sibling directory whose name starts with
 * the root's name, nor a symlink pointing elsewhere can escape the document root.
 */
export function resolveInside(root, requestPath) {
  const realRoot = realpathSync(root);
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  let candidate = resolve(realRoot, `.${sep}${normalize(decoded)}`);
  if (!isInside(realRoot, candidate) || !existsSync(candidate)) return null;
  candidate = realpathSync(candidate);
  if (statSync(candidate).isDirectory()) {
    candidate = join(candidate, 'index.html');
    if (!existsSync(candidate)) return null;
    candidate = realpathSync(candidate);
  }
  if (!isInside(realRoot, candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? '.');
  const port = Number(process.argv[3] ?? 6007);
  createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = resolveInside(root, url.pathname);
    if (!path) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(res);
  }).listen(port, '127.0.0.1', () => {
    console.log(`serving ${root} on http://127.0.0.1:${port}`);
  });
}
