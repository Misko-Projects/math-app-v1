import { fileURLToPath, URL } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { tsImport } from 'tsx/esm/api';
import { defineProject } from 'vitest/config';

type ContentModule = typeof import('@number-island/content');
type ContentNodeModule = typeof import('@number-island/content/node');

/**
 * The content compiler, loaded through tsx: this config runs in plain Node, which cannot load the
 * content package's TypeScript sources (extensionless imports) on its own.
 */
async function compiledContent() {
  const { compileContent } = (await tsImport(
    '@number-island/content',
    import.meta.url,
  )) as ContentModule;
  const { readContentFiles } = (await tsImport(
    '@number-island/content/node',
    import.meta.url,
  )) as ContentNodeModule;
  return compileContent(readContentFiles());
}

// D01 sync integration tests (#15 acceptance criteria, golden journey 6's foundation): the web sync
// client and Dexie store (over fake-indexeddb, one database per simulated device) talk to the real
// S01 API Worker inside workerd via the Workers pool, with the API's wrangler.jsonc bindings and a
// local D1 database migrated by sync-test/setup.ts. Content is compiled here, in Node, and handed
// to the tests as a JSON binding, because workerd has no file system.
export default defineProject({
  plugins: [
    cloudflareTest(async () => {
      const compiled = await compiledContent();
      if (!compiled.content || !compiled.contentVersion) {
        throw new Error('the content does not compile; run pnpm content:validate');
      }
      const { skills, templates, graph, game } = compiled.content;
      return {
        wrangler: { configPath: '../api/wrangler.jsonc' },
        miniflare: {
          // The Vitest runner inside workerd needs Node.js compat; the Worker itself does not.
          compatibilityFlags: ['nodejs_compat'],
          bindings: {
            PBKDF2_ITERATIONS: '1000',
            TEST_MIGRATIONS: await readD1Migrations(
              fileURLToPath(new URL('../api/src/db/migrations', import.meta.url)),
            ),
            // A JSON string: bindings must be plain JSON values.
            TEST_CONTENT: JSON.stringify({
              contentVersion: compiled.contentVersion,
              skills,
              templates,
              graph,
              game,
            }),
          },
        },
      };
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    name: 'web-sync',
    include: ['sync-test/**/*.test.ts'],
    setupFiles: ['./sync-test/setup.ts'],
  },
});
