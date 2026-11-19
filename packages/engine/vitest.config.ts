import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'engine',
    environment: 'node',
    // src/: pure unit tests. test/: tests that read packages/content/dist through Node (the
    // boundary lint keeps Node built-ins out of src/, 02 §2).
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/sim/**', 'node_modules/**'],
  },
});
