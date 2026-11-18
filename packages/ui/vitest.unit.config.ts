import { defineProject } from 'vitest/config';

// Pure unit tests for packages/ui (tokens, snap geometry, demo controller, registry). Component and
// interaction behaviour is tested in real Chromium through the story play functions (ui-stories).
export default defineProject({
  test: {
    name: 'ui',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
