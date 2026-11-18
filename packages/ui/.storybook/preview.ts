import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    // axe violations fail the story test in `pnpm test` (09 §3, Accessibility row).
    a11y: { test: 'error' },
  },
};

export default preview;
