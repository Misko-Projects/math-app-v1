import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';
import { contentAssets } from './content-assets';

// The pier fit check (#12): every template in the Practice Pier's workshop area, in Chromium, at
// the two supported landscape viewports. Part of `pnpm test`; it needs `pnpm content:build`
// (the content plugin builds the content when `packages/content/dist` is missing).
export default defineProject({
  plugins: [react(), tailwindcss(), contentAssets()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    name: 'web-fit',
    include: ['src/**/*.browser.test.tsx'],
    // One test renders every template at one viewport; CI runners are slower than local machines.
    testTimeout: 300_000,
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      provider: playwright({}),
      instances: [{ browser: 'chromium' }],
    },
  },
});
