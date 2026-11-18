import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineProject } from 'vitest/config';

// API integration tests run inside workerd via the Workers pool (09 §3), using wrangler.jsonc
// bindings (vars + local D1). Tests never call AI providers.
export default defineProject({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // The Vitest runner inside workerd needs Node.js compat; the Worker itself does not.
      miniflare: { compatibilityFlags: ['nodejs_compat'] },
    }),
  ],
  test: {
    name: 'api',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
