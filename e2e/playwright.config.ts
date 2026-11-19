import { defineConfig, devices } from '@playwright/test';

// E2E against the production topology (09 §1): `pnpm preview:full` builds the web app and serves it
// from the Worker on :8787 (02 §3).
//
// Projects:
//   chromium-desktop  Desktop Chrome, 1440×900.
//   android-tablet    Chromium emulating an Android 16 Chrome tablet, 1280×800 @2x, touch (02 §1).
//   webkit-smoke      Desktop Safari, @smoke-tagged tests only; nightly CI job only (09 §2).
//
// `pnpm e2e` runs the first two. webkit-smoke exists only when selected explicitly:
// `pnpm e2e:smoke:webkit` (= `--project=webkit-smoke`) or `E2E_WEBKIT=1`. The flag is copied into
// the environment so Playwright's worker processes (which re-load this file) see the same projects.
const wantsWebkit =
  process.env.E2E_WEBKIT === '1' || process.argv.some((arg) => arg.includes('webkit-smoke'));
if (wantsWebkit) process.env.E2E_WEBKIT = '1';

const PORT = 8787;
const baseURL = `http://127.0.0.1:${PORT}`;

// Same Chrome major as the bundled Chromium, on an Android 16 tablet (tablet UAs omit "Mobile").
const chromeVersion =
  /Chrome\/([\d.]+)/.exec(devices['Desktop Chrome'].userAgent)?.[1] ?? '146.0.0.0';
const androidTabletUserAgent = `Mozilla/5.0 (Linux; Android 16; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;

const androidTablet = {
  browserName: 'chromium' as const,
  userAgent: androidTabletUserAgent,
  viewport: { width: 1280, height: 800 },
  screen: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    // Golden journey 1 (09 §3) creates the run's family through the Setup Wizard, once, on the
    // primary device (06 §1). Every other project starts after it and can pair with that family
    // (e2e/fixtures/family.ts).
    {
      name: 'golden-setup',
      testMatch: /journey-1-setup\.spec\.ts$/,
      // `POST /setup` succeeds once per database, which is fresh only once per run: a retry
      // would fail on setup_closed, so a failure here is reported as is.
      retries: 0,
      use: androidTablet,
    },
    {
      name: 'chromium-desktop',
      testIgnore: /journey-1-setup\.spec\.ts$/,
      dependencies: ['golden-setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'android-tablet',
      testIgnore: /journey-1-setup\.spec\.ts$/,
      dependencies: ['golden-setup'],
      use: androidTablet,
    },
    ...(wantsWebkit
      ? [
          {
            name: 'webkit-smoke',
            grep: /@smoke/,
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),
  ],
  // The production topology with its own fresh D1 database per run (apps/api/scripts/db-e2e.mjs):
  // golden journey 1 creates the family, which `POST /setup` allows only once (08 §2). A server
  // already on :8787 (e.g. `pnpm preview:full` with dev data) is never reused; stop it first.
  webServer: {
    command: 'pnpm preview:e2e',
    cwd: '..',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
