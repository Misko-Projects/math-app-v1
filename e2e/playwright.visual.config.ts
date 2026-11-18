import { defineConfig, devices } from '@playwright/test';

// Storybook visual snapshots (09 §2 `visual` job, non-required).
// Baselines are only generated inside the pinned Playwright Docker image (`pnpm visual:update`)
// to avoid OS/font drift. Missing baselines are written on first run instead of failing.
const PORT = 6007;

export default defineConfig({
  testDir: './visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  updateSnapshots: 'missing',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report/visual' }]],
  outputDir: '../test-results/visual',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' } },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: `pnpm --filter @number-island/ui build-storybook --quiet && node scripts/serve-static.mjs packages/ui/storybook-static ${PORT}`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
