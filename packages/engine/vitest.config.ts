import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'engine',
    environment: 'node',
    // src/: pure unit tests. test/: tests that read packages/content/dist through Node (the
    // boundary lint keeps Node built-ins out of src/, 02 §2).
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/sim/**', 'node_modules/**'],
    // Catalog-wide tests (pr82-review.test.ts generates 100 items of every template) take about
    // 2 s alone on the full K–1 catalog (K01), and over Vitest's default 5 s in a full `pnpm test`.
    testTimeout: 20_000,
  },
});
