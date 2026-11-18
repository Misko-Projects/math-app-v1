import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineProject } from 'vitest/config';

// API integration tests run inside workerd via the Workers pool (09 §3, 08 §9), using wrangler.jsonc
// bindings (vars + local D1). The committed SQL migrations are applied by test/setup.ts, so every
// test runs against the real schema. Tests never call AI providers.
export default defineProject({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // The Vitest runner inside workerd needs Node.js compat; the Worker itself does not.
        compatibilityFlags: ['nodejs_compat'],
        bindings: {
          // Fast hashing in tests; test/crypto.test.ts covers the 100k production default.
          PBKDF2_ITERATIONS: '1000',
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL('./src/db/migrations', import.meta.url)),
          ),
        },
      },
    })),
  ],
  test: {
    name: 'api',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
