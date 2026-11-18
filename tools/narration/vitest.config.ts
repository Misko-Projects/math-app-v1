import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'narration',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
