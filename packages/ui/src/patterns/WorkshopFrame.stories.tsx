import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import { ProductTray, type TrayItem } from '../primitives/ProductTray';
import { HintButton, HomeButton, ReplayButton } from '../primitives/presets';
import { SpeechBubble } from '../primitives/SpeechBubble';
import { expectTargetGaps, expectTargetSize } from '../test-support/storyHelpers';
import type { WidgetRegistry } from '../widgets/types';
import { WidgetHost } from '../widgets/WidgetHost';

/**
 * How the primitives compose on a workshop screen (06 §2): home, replay and hint buttons, a
 * buddy's speech bubble, the widget area (≥ 60% of the screen) and the product tray. This is a
 * layout reference for W00/R01, not the app shell itself.
 */

const registry: WidgetRegistry = { 'make-set': () => import('../widgets/sample/SampleSetWidget') };

const config: WidgetConfig = {
  format: 'make-set',
  target: 4,
  mode: 'make',
  source: { sprite: 'pebble', supply: 8 },
  container: 'basket',
  capacity: 10,
  showRunningCount: true,
};

function Plank() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
      <rect
        x="4"
        y="15"
        width="40"
        height="18"
        rx="4"
        fill="var(--color-sunshine-light)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <path
        d="M11 21h13M27 27h11"
        stroke="var(--color-wood-deep)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const FRAME_CSS = `
.wf { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 12px;
  width: 100vw; height: 100vh; min-height: 600px; box-sizing: border-box;
  padding: max(16px, env(safe-area-inset-top)) 24px max(16px, env(safe-area-inset-bottom));
  background:
    radial-gradient(90% 60% at 50% 110%, var(--color-sand) 0%, var(--color-sand) 45%, transparent 46%),
    linear-gradient(180deg, var(--color-sky) 0%, var(--color-sky-light) 55%, var(--color-shallows) 100%);
  overflow: hidden; }
.wf-top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--target-gap); }
.wf-left { display: flex; align-items: flex-start; gap: 20px; min-width: 0; }
.wf-right { display: flex; gap: var(--spacing-gap-lg); }
.wf-stage { display: grid; place-items: center; min-height: 0; border-radius: 40px;
  background: rgb(255 250 240 / 0.55); border: 3px solid rgb(255 255 255 / 0.7); }
.wf-bottom { display: flex; justify-content: center; }
`;

function WorkshopFrame() {
  const [made, setMade] = useState<TrayItem[]>(() =>
    Array.from({ length: 3 }, (_, i) => ({ id: `plank-${i}`, icon: <Plank /> })),
  );
  return (
    <div className="wf">
      <style>{FRAME_CSS}</style>
      <div className="wf-top">
        <div className="wf-left">
          <HomeButton />
          <SpeechBubble say="req.dock.needs-planks" tail="left" tone="cloud" />
        </div>
        <div className="wf-right">
          <ReplayButton playing />
          <HintButton glow />
        </div>
      </div>
      <main className="wf-stage" aria-label="Workshop">
        <WidgetHost
          config={config}
          tier="concrete"
          registry={registry}
          onResponse={() => setMade((m) => [...m, { id: `plank-${m.length}`, icon: <Plank /> }])}
        />
      </main>
      <div className="wf-bottom">
        <ProductTray items={made} goal={8} />
      </div>
    </div>
  );
}

const meta = {
  title: 'Patterns/Workshop frame',
  render: () => <WorkshopFrame />,
  parameters: { ui: { stage: 'flush' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

async function checkFrame(canvasElement: HTMLElement, ageMode: 'k' | 'g1-up') {
  const canvas = within(canvasElement);
  await canvas.findByRole('group', { name: 'Pebbles' });
  const chrome = [
    canvas.getByRole('button', { name: 'Go home' }),
    canvas.getByRole('button', { name: 'Hear it again' }),
    canvas.getByRole('button', { name: 'Help me' }),
  ];
  for (const b of chrome) await expectTargetSize(b, ageMode);
  await expectTargetGaps(chrome);
  // 06 §2: the widget area takes ≥ 60% of the screen.
  const stage = canvas.getByRole('main').getBoundingClientRect();
  await expect(
    (stage.width * stage.height) / (window.innerWidth * window.innerHeight),
  ).toBeGreaterThanOrEqual(0.6);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
}

/** Kindergarten: icons only, 80 px+ targets, everything spoken. */
export const Kindergarten: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement }) => checkFrame(canvasElement, 'k'),
};

/** Grade 1 and up: captions under the chrome buttons and text in bubbles. */
export const GradeOneUp: Story = {
  globals: { ageMode: 'g1-up' },
  play: async ({ canvasElement }) => checkFrame(canvasElement, 'g1-up'),
};
