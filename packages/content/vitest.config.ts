import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'content',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The compiler tests compile the whole content set once per variant; with the full K–1
    // catalog (K01) a test of a dozen variants takes over Vitest's default 5 s.
    testTimeout: 20_000,
  },
});
