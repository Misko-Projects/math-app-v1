import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'content-check',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each test runs the engine checks over the whole fixture set (about 5 s on a CI runner), far
    // beyond Vitest's 5 s default.
    testTimeout: 120_000,
  },
});
