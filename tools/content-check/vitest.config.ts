import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'content-check',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
