import { defineProject } from 'vitest/config';

// 04 §8 simulated-learner harness (`pnpm test:sim`): kept out of the regular engine project.
export default defineProject({
  test: {
    name: 'engine-sim',
    environment: 'node',
    include: ['test/sim/**/*.sim.test.ts'],
    testTimeout: 60_000,
    // The harness prints its metrics table; show console output of passing tests too.
    silent: false,
    reporters: ['verbose'],
  },
});
