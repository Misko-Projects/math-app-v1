import { defineConfig } from 'vitest/config';

// One Vitest project per workspace package (09 §1: `pnpm test` runs them all).
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      'packages/*/vitest.config.ts',
      'packages/ui/vitest.unit.config.ts',
      'apps/*/vitest.config.ts',
      'tools/*/vitest.config.ts',
      'scripts/vitest.config.ts',
    ],
  },
});
