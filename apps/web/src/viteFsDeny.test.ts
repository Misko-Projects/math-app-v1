// @vitest-environment node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// `pnpm dev:lan` exposes the Vite dev server on the home network. It must never serve the Worker's
// secrets (`.dev.vars`) or its local D1 database under apps/api/.wrangler (08 §5, §6). This starts
// a real dev server from the app's own vite.config.ts and asks for an inert fixture in each place.

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const apiRoot = fileURLToPath(new URL('../../api/', import.meta.url));
const fixtureDir = `${apiRoot}.wrangler/state/vite-deny-fixture`;
const fixture = `${fixtureDir}/fixture.txt`;

let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(fixture, 'inert fixture\n');
  server = await createServer({
    root: webRoot,
    configFile: `${webRoot}vite.config.ts`,
    logLevel: 'silent',
    server: { port: 0, strictPort: false, host: '127.0.0.1' },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('no dev server address');
  origin = `http://127.0.0.1:${address.port}`;
}, 60_000);

afterAll(async () => {
  await server?.close();
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('Vite dev server file access', () => {
  it('serves the app', async () => {
    const res = await fetch(`${origin}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  it('refuses files under apps/api/.wrangler (local D1 state)', async () => {
    const res = await fetch(`${origin}/@fs${fixture}`);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('inert fixture');
  });
});
