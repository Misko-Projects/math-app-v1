import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Story tests (play functions + axe) run headless in Chromium as part of `pnpm test` (09 §2).
export default defineProject({
  plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
  test: {
    name: 'ui-stories',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: 'chromium' }],
    },
  },
});
