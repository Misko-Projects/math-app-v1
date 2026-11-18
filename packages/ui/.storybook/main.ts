import type { StorybookConfig } from '@storybook/react-vite';

// Storybook for widgets, avatar, art kit and the Content Browser (02 §1, 09 §1).
// Stories' play functions and axe checks run inside `pnpm test` through @storybook/addon-vitest.
const config: StorybookConfig = {
  framework: { name: '@storybook/react-vite', options: {} },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: { disableTelemetry: true },
};

export default config;
