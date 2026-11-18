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
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'android-tablet',
      use: {
        browserName: 'chromium',
        userAgent: androidTabletUserAgent,
        viewport: { width: 1280, height: 800 },
        screen: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
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
  webServer: {
    command: 'pnpm preview:full',
    cwd: '..',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
