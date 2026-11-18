import { defineConfig } from 'vitest/config';

// One Vitest project per workspace package (09 §1: `pnpm test` runs them all).
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts', 'tools/*/vitest.config.ts', 'scripts/vitest.config.ts'],
  },
});
