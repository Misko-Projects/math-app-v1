import '@fontsource/andika/latin-400.css';
import '@fontsource/andika/latin-700.css';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import './preview.css';

import type { AudioManager } from '@number-island/shared';
import type { Decorator, Preview } from '@storybook/react-vite';
import { UiProvider } from '../src/preferences/UiProvider';
import type { AgeMode } from '../src/tokens/tokens';
import { storyNarrationText } from './narration';

/** A silent AudioManager that logs, so spoken labels are visible in the browser console. */
const loggingAudio: AudioManager = {
  unlock: async () => {},
  say: async (key, vars) => console.info('[audio] say', key, vars ?? ''),
  sayPhrases: async (parts) => console.info('[audio] sayPhrases', parts),
  sayText: async (text) => console.info('[audio] sayText', text),
  sfx: (id) => console.info('[audio] sfx', id),
  music: () => {},
  stop: () => {},
  setVolumes: () => {},
};

export interface UiStoryParameters {
  /** Per-story AudioManager (e.g. one built from storybook/test `fn()` spies). */
  audio?: AudioManager;
  tapOnly?: boolean;
  snapRadiusPx?: number;
  textLabels?: boolean;
  /** `centered` (default), `padded` or `flush` (full-bleed scenes). */
  stage?: 'centered' | 'padded' | 'flush';
  /** Render without a UiProvider (to test the primitives' defaults). */
  bare?: boolean;
}

const withUi: Decorator = (Story, context) => {
  const ui = (context.parameters.ui ?? {}) as UiStoryParameters;
  if (ui.bare) {
    return (
      <div className="story-stage" data-layout={ui.stage ?? 'centered'}>
        <Story />
      </div>
    );
  }
  const ageMode = (context.globals.ageMode ?? 'g1-up') as AgeMode;
  const reducedMotion = context.globals.motion === 'reduced' ? true : undefined;
  const tapOnly = ui.tapOnly ?? context.globals.tapOnly === 'on';
  return (
    <UiProvider
      ageMode={ageMode}
      reducedMotion={reducedMotion}
      tapOnly={tapOnly}
      snapRadiusPx={ui.snapRadiusPx}
      textLabels={ui.textLabels}
      audio={ui.audio ?? loggingAudio}
      narrationText={storyNarrationText}
    >
      <div className="story-stage" data-layout={ui.stage ?? 'centered'}>
        <Story />
      </div>
    </UiProvider>
  );
};

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    // axe violations fail the story test in `pnpm test` (09 §3, Accessibility row).
    a11y: { test: 'error' },
    controls: { expanded: true },
  },
  globalTypes: {
    ageMode: {
      description: 'Age mode (06 §4 target sizes, 06 §5 reading)',
      toolbar: {
        title: 'Age mode',
        icon: 'user',
        items: [
          { value: 'k', title: 'K (≥ 80 px, icons only)' },
          { value: 'g1-up', title: 'G1+ (≥ 64 px, text labels)' },
        ],
        dynamicTitle: true,
      },
    },
    motion: {
      description: 'Reduced motion (06 §7)',
      toolbar: {
        title: 'Motion',
        icon: 'lightning',
        items: [
          { value: 'system', title: 'Follow system' },
          { value: 'reduced', title: 'Reduced motion' },
        ],
        dynamicTitle: true,
      },
    },
    tapOnly: {
      description: 'Tap-only mode (06 §7)',
      toolbar: {
        title: 'Tap-only',
        icon: 'button',
        items: [
          { value: 'off', title: 'Drag + tap' },
          { value: 'on', title: 'Tap-only' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { ageMode: 'g1-up', motion: 'system', tapOnly: 'off' },
  decorators: [withUi],
};

export default preview;
