import type { StorybookConfig } from '@storybook/react-vite';

// Storybook for widgets, avatar, art kit and the Content Browser (02 §1, 09 §1).
// Stories' play functions and axe checks run inside `pnpm test` through @storybook/addon-vitest.
// Colour-vision simulation (06 §7): the a11y addon's vision simulator (toolbar → "Vision") renders
// any story as protanopia, deuteranopia, tritanopia, achromatopsia or blurred vision; the
// "Foundations/Colour vision" story shows the palette under each filter side by side.
const config: StorybookConfig = {
  framework: { name: '@storybook/react-vite', options: {} },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: { disableTelemetry: true },
  async viteFinal(viteConfig) {
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    return viteConfig;
  },
};

export default config;
