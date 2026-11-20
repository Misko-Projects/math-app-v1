import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'engine',
    environment: 'node',
    // src/: pure unit tests. test/: tests that read packages/content/dist through Node (the
    // boundary lint keeps Node built-ins out of src/, 02 §2).
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/sim/**', 'node_modules/**'],
    // Unit tests import modules by relative path, not through the full entry, so the item core
    // the learner model needs (02 §6a) is installed here.
    setupFiles: ['./test/setup-item-core.ts'],
  },
});
